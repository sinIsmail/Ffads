import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { AppState } from 'react-native';
import {
  runLocalOcr,
  buildProvisionalOcrResult,
  normalizeOcrText,
  buildCleanupRoutes,
  isTransientProviderError,
} from './ai';
import { syncProductNameToOFF, uploadImageToOFF, isOFFConfigured } from './openfoodfacts';
import { getCurrentConnectivity } from './connectivity';
import { getOFFCredentials, getSupabaseCredentials } from '../store/UserContext';
import {
  logUserContribution,
  recordScan,
  saveProduct,
} from './supabase';
import { logProcessingEvent } from './supabase/processing';
import { logError } from './telemetry';

const QUEUE_KEY = '@ffads_contribution_jobs_v2';
const LEGACY_QUEUE_KEY = '@ffads_contribution_jobs_v1';
const JOBS_DIR = `${FileSystem.documentDirectory || ''}ffads_contribution_jobs/`;
const RETAIN_COMPLETED_MS = 24 * 60 * 60 * 1000;
const OFF_IMAGE_FIELDS = ['front', 'nutrition', 'ingredients'];
const INVALID_PRODUCT_NAME_PATTERNS = [
  /^unknown product$/i,
  /^untitled product$/i,
  /^new product$/i,
];

let processing = false;

function nowIso() {
  return new Date().toISOString();
}

function createJobId() {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeContributionName(requestedName = '', fallbackName = '') {
  const candidate = String(requestedName || fallbackName || '').trim();
  if (!candidate) return '';
  if (INVALID_PRODUCT_NAME_PATTERNS.some((pattern) => pattern.test(candidate))) {
    return '';
  }
  return candidate;
}

function getExpectedImageFields(job = {}) {
  return OFF_IMAGE_FIELDS.filter((field) => Boolean(job.photoPaths?.[field]));
}

function computeOffImageStage(job = {}) {
  const expectedFields = getExpectedImageFields(job);
  if (!expectedFields.length) return 'skipped';
  if (expectedFields.some((field) => job.offImageResults?.[field]?.blocked)) {
    return 'blocked';
  }
  if (expectedFields.every((field) => job.offImageResults?.[field]?.success)) {
    return 'done';
  }
  return 'pending';
}

function computeOffStage(job = {}) {
  const offNameStage = job.offNameStage || job.offStage || 'pending';
  const offImageStage = job.offImageStage || job.offStage || 'pending';

  if ([offNameStage, offImageStage].includes('blocked')) return 'blocked';
  if ([offNameStage, offImageStage].every((stage) => stage === 'skipped')) return 'skipped';
  if (isSuccessfulStage(offNameStage) && isSuccessfulStage(offImageStage)) return 'done';
  return 'pending';
}

function syncOffStageState(job = {}) {
  const expectedFields = getExpectedImageFields(job);
  job.offImageResults = job.offImageResults || {};

  if (!job.offNameStage) {
    job.offNameStage = job.offResult?.nameSynced || job.offResult?.textUploaded
      ? 'done'
      : (job.offStage || 'pending');
  }

  if (!job.offImageStage) {
    job.offImageStage = job.offStage || (expectedFields.length ? 'pending' : 'skipped');
  }

  if (!expectedFields.length) {
    job.offImageStage = 'skipped';
  }

  if (job.offImageStage === 'pending') {
    job.offImageStage = computeOffImageStage(job);
  }

  job.offStage = computeOffStage(job);
  return job;
}

function summarizeOffImageFailure(job = {}) {
  const failed = OFF_IMAGE_FIELDS
    .map((field) => ({ field, result: job.offImageResults?.[field] }))
    .filter((entry) => entry.result && !entry.result.success);

  if (!failed.length) return 'One or more Open Food Facts image uploads still need attention.';
  return failed.map((entry) => `${entry.field}: ${entry.result.error}`).join(' | ');
}

function buildOffProgressSummary(job = {}) {
  const uploadedFields = OFF_IMAGE_FIELDS.filter((field) => job.offImageResults?.[field]?.success);
  return {
    nameSynced: job.offNameStage === 'done',
    imageCount: uploadedFields.length,
    uploadedFields,
  };
}

function retainSuccessfulOffImageResults(results = {}) {
  return Object.fromEntries(
    Object.entries(results).filter(([, value]) => value?.success)
  );
}

function sanitizeProductSnapshot(product) {
  return {
    id: product.id,
    barcode: product.barcode,
    name: product.name,
    brand: product.brand,
    category: product.category,
    images: product.images || {},
    ingredients: product.ingredients || [],
    ingredientsRaw: product.ingredientsRaw || '',
    nutrition: product.nutrition || {},
    scannedAt: product.scannedAt || nowIso(),
    source: product.source || 'manual',
    analyzed: Boolean(product.analyzed),
    aiData: product.aiData || null,
    aiInsight: product.aiInsight || null,
    nutriscore: product.nutriscore || null,
    novaGroup: product.novaGroup || null,
    description: product.description || '',
  };
}

function isRetryableSupabaseError(result) {
  if (!result || result.success) return false;
  if (result.offline) return false;
  return /network|failed to fetch|timeout|timed out|socket|fetch/i.test(result.error || '');
}

function classifyGenericFailure(message = '') {
  return /network|failed to fetch|timeout|timed out|socket|fetch|429|5\d\d|offline/i.test(message);
}

function computeNextAttempt(attemptCount) {
  const baseDelay = Math.min(15 * 60 * 1000, 30 * 1000 * Math.max(1, 2 ** Math.max(0, attemptCount - 1)));
  const jitter = Math.floor(Math.random() * 10_000);
  return new Date(Date.now() + baseDelay + jitter).toISOString();
}

function isTerminalStage(stage) {
  return ['done', 'skipped', 'blocked'].includes(stage);
}

function isSuccessfulStage(stage) {
  return ['done', 'skipped'].includes(stage);
}

function summarize(queue) {
  const pending = queue.filter((job) => job.status === 'pending').length;
  const running = queue.filter((job) => job.status === 'running').length;
  const blocked = queue.filter((job) => job.status === 'blocked').length;
  const completed = queue.filter((job) => job.status === 'completed').length;
  const lastError = queue.find((job) => job.lastError)?.lastError || null;
  return { pending, running, blocked, completed, lastError };
}

function getBestStructuredResult(job) {
  if (job.cleanupResult) {
    return job.cleanupResult;
  }
  if (job.localOcrResult) {
    return job.localOcrResult;
  }
  return null;
}

function getContributionStatus(job) {
  if (job.status === 'completed') return 'synced';
  if (job.status === 'blocked') return 'blocked';
  if (job.status === 'running') return 'running';
  return 'queued';
}

function buildSyncMessage(job) {
  if (job.status === 'blocked') {
    if (job.offNameStage === 'blocked') {
      return job.lastError || 'The product name could not be synced to Open Food Facts yet.';
    }
    if (job.offImageStage === 'blocked') {
      return job.lastError || 'One or more Open Food Facts image uploads need attention before sync can finish.';
    }
    if (job.localOcrStage === 'blocked') {
      return job.lastError || 'On-device OCR needs attention before the product text can be cleaned and saved.';
    }
    if (job.aiCleanupStage === 'blocked') {
      return job.lastError || 'The AI cleanup stage is blocked until the provider configuration is fixed.';
    }
    return job.lastError || 'The upload is blocked until the app configuration is fixed.';
  }

  if (job.status === 'completed') {
    return 'Synced successfully. Open Food Facts images may take a moment to appear globally.';
  }

  if (job.status === 'running') {
    if (job.offNameStage === 'pending') {
      return 'Syncing the product name to Open Food Facts.';
    }
    if (job.offNameStage === 'done' && job.offImageStage === 'pending') {
      return 'Name synced. Uploading images to Open Food Facts now.';
    }
    if (job.localOcrStage === 'done' && job.aiCleanupStage === 'pending') {
      return 'OCR ready. Cleaning the text through the provider fallback chain now.';
    }
    if (job.aiCleanupStage === 'done' && job.supabaseStage === 'pending') {
      return 'Clean JSON is ready. Saving it to Supabase now.';
    }
    if (job.offImageStage === 'done' && job.localOcrStage === 'pending') {
      return 'Images uploaded. Running on-device OCR now.';
    }
    return 'Syncing now...';
  }

  if (job.offNameStage === 'done' && job.offImageStage === 'pending') {
    return 'Name synced. Images are queued for upload.';
  }

  if (job.localOcrStage === 'done' && job.aiCleanupStage === 'pending') {
    return 'Saved locally. OCR ready and queued for AI cleanup.';
  }

  return 'Saved locally and queued. The app will retry while it stays active and when it reconnects.';
}

function buildProductFromJob(job) {
  const structured = getBestStructuredResult(job);
  const requestedName = job.requestedName || '';
  const baseProduct = {
    ...job.productSnapshot,
    name: requestedName || job.productSnapshot.name,
    needsOCR: false,
    pendingLocalImages: Object.values(job.photoPaths || {}).filter(Boolean),
    contributionSync: {
      jobId: job.id,
      status: getContributionStatus(job),
      message: buildSyncMessage(job),
      offNameStage: job.offNameStage,
      offImageStage: job.offImageStage,
      offStage: job.offStage,
      localOcrStage: job.localOcrStage,
      aiCleanupStage: job.aiCleanupStage,
      supabaseStage: job.supabaseStage,
      lastError: job.lastError || null,
      cleanupTrace: (job.cleanupTrace || []).slice(-5),
      offImageResults: job.offImageResults || {},
    },
  };

  if (!structured) {
    return baseProduct;
  }

  return {
    ...baseProduct,
    name: requestedName || structured.name || baseProduct.name,
    brand: structured.brand || baseProduct.brand,
    ingredients: structured.ingredients?.length ? structured.ingredients : (baseProduct.ingredients || []),
    ingredientsRaw: structured.ingredientsRaw || baseProduct.ingredientsRaw || '',
    nutrition: Object.keys(structured.nutrition || {}).length ? structured.nutrition : (baseProduct.nutrition || {}),
    source: 'ocr',
  };
}

function applyJobToProductContext(job, productDispatch) {
  if (!productDispatch) return;
  productDispatch({
    type: 'ADD_PRODUCT',
    payload: buildProductFromJob(job),
  });
}

async function ensureDirectories() {
  try {
    await FileSystem.makeDirectoryAsync(JOBS_DIR, { intermediates: true });
  } catch {
    // Directory already exists or creation failed.
  }
}

async function readQueue() {
  try {
    const [v2Raw, v1Raw] = await Promise.all([
      AsyncStorage.getItem(QUEUE_KEY),
      AsyncStorage.getItem(LEGACY_QUEUE_KEY),
    ]);

    if (v2Raw) {
      return (JSON.parse(v2Raw) || []).map((job) => syncOffStageState({
        ...job,
        offImageResults: job.offImageResults || {},
      }));
    }

    if (v1Raw) {
      const legacy = JSON.parse(v1Raw) || [];
      const migrated = legacy.map((job) => syncOffStageState({
        ...job,
        offNameStage: job.offNameStage || job.offStage || 'pending',
        offImageStage: job.offImageStage || job.offStage || 'pending',
        offImageResults: job.offImageResults || {},
        localOcrStage: job.localOcrStage || job.ocrStage || 'pending',
        aiCleanupStage: job.aiCleanupStage || (job.ocrResult ? 'done' : (job.ocrStage || 'pending')),
        supabaseStage: job.supabaseStage || (job.contributionLogged ? 'done' : 'pending'),
        localOcrRaw: job.localOcrRaw || null,
        localOcrResult: job.localOcrResult || job.ocrResult || null,
        cleanupResult: job.cleanupResult || job.ocrResult || null,
        cleanupTrace: job.cleanupTrace || [],
        currentCleanupAttemptedRouteIds: job.currentCleanupAttemptedRouteIds || [],
      }));
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(migrated));
      await AsyncStorage.removeItem(LEGACY_QUEUE_KEY);
      return migrated;
    }

    return [];
  } catch {
    return [];
  }
}

async function writeQueue(queue) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

async function persistPhotos(jobId, photos = {}) {
  await ensureDirectories();
  const saved = { front: null, ingredients: null, nutrition: null };

  for (const slot of ['front', 'ingredients', 'nutrition']) {
    if (!photos[slot]?.uri) continue;
    const destination = `${JOBS_DIR}${jobId}_${slot}.jpg`;
    await FileSystem.copyAsync({
      from: photos[slot].uri,
      to: destination,
    });
    saved[slot] = destination;
  }

  return saved;
}

async function cleanupPhotos(photoPaths = {}) {
  const paths = Object.values(photoPaths).filter(Boolean);
  await Promise.all(paths.map((path) => FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {})));
}

async function loadPhotoAsBase64(path) {
  if (!path) return null;
  return FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.Base64 });
}

async function loadPhotosAsBase64(photoPaths = {}) {
  return {
    front: await loadPhotoAsBase64(photoPaths.front),
    ingredients: await loadPhotoAsBase64(photoPaths.ingredients),
    nutrition: await loadPhotoAsBase64(photoPaths.nutrition),
  };
}

async function recordEvent(job, payload = {}) {
  await logProcessingEvent({
    jobId: job.id,
    barcode: job.productSnapshot?.barcode || null,
    ownerEmail: job.contributorEmail || null,
    ...payload,
  }).catch(() => {});
}

async function processLocalOcrStage(job, context) {
  if (job.localOcrStage !== 'pending') return;
  if (!job.photoPaths.ingredients && !job.photoPaths.nutrition) {
    job.localOcrStage = 'skipped';
    await context.persistJob?.();
    return;
  }

  try {
    const localOcrRaw = await runLocalOcr({
      ingredientsUri: job.photoPaths.ingredients,
      nutritionUri: job.photoPaths.nutrition,
    });

    job.localOcrRaw = localOcrRaw;
    job.localOcrResult = buildProvisionalOcrResult({
      barcode: job.productSnapshot.barcode,
      name: job.requestedName || job.productSnapshot.name,
      brand: job.productSnapshot.brand,
    }, localOcrRaw);
    job.localOcrStage = 'done';
    job.updatedAt = nowIso();

    applyJobToProductContext(job, context.productDispatch);
    await recordEvent(job, {
      eventType: 'local_ocr_completed',
      stage: 'local_ocr',
      status: 'success',
      message: 'Local OCR extracted text from the ingredients and nutrition images.',
      payload: {
        warnings: localOcrRaw.warnings || [],
      },
    });
    await context.persistJob?.();
  } catch (error) {
    job.localOcrStage = 'blocked';
    job.status = 'blocked';
    job.lastError = error.message;
    await recordEvent(job, {
      eventType: 'local_ocr_failed',
      stage: 'local_ocr',
      status: 'blocked',
      message: error.message,
    });
    await context.persistJob?.();
  }
}

async function processOffStage(job, context) {
  syncOffStageState(job);
  if (isTerminalStage(job.offNameStage) && isTerminalStage(job.offImageStage)) {
    job.offStage = computeOffStage(job);
    await context.persistJob?.();
    return;
  }

  const creds = getOFFCredentials(context.userPrefs || {});
  if (!isOFFConfigured(creds)) {
    if (job.offNameStage === 'pending') {
      job.offNameStage = 'blocked';
    }
    if (job.offImageStage === 'pending') {
      job.offImageStage = 'blocked';
    }
    job.offStage = computeOffStage(job);
    job.status = 'blocked';
    job.lastError = 'Open Food Facts credentials are missing.';
    await recordEvent(job, {
      eventType: 'off_credentials_blocked',
      stage: 'off_name_sync',
      status: 'blocked',
      message: job.lastError,
    });
    await context.persistJob?.();
    return;
  }

  const normalizedName = normalizeContributionName(job.requestedName, job.productSnapshot?.name);
  if (!normalizedName) {
    job.offNameStage = 'blocked';
    job.offStage = computeOffStage(job);
    job.status = 'blocked';
    job.lastError = 'A real product name is required before syncing to Open Food Facts.';
    await recordEvent(job, {
      eventType: 'off_name_sync_blocked',
      stage: 'off_name_sync',
      status: 'blocked',
      message: job.lastError,
    });
    await context.persistJob?.();
    return;
  }

  if (job.offNameStage === 'pending') {
    const nameResult = await syncProductNameToOFF({
      barcode: job.productSnapshot.barcode,
      name: normalizedName,
      creds,
    });

    if (!nameResult.success) {
      if (nameResult.retryable) {
        throw new Error(nameResult.error || 'Open Food Facts product name sync failed temporarily.');
      }

      job.offNameStage = 'blocked';
      job.offStage = computeOffStage(job);
      job.status = 'blocked';
      job.lastError = nameResult.error || 'Open Food Facts product name sync failed.';
      await recordEvent(job, {
        eventType: 'off_name_sync_failed',
        stage: 'off_name_sync',
        status: 'blocked',
        message: job.lastError,
        payload: nameResult,
      });
      await context.persistJob?.();
      return;
    }

    job.offNameStage = 'done';
    job.offResult = {
      ...(job.offResult || {}),
      nameSynced: true,
      nameStatusCode: nameResult.statusCode || null,
      productName: normalizedName,
    };
    job.offStage = computeOffStage(job);
    job.lastError = null;
    await recordEvent(job, {
      eventType: 'off_name_sync_completed',
      stage: 'off_name_sync',
      status: 'success',
      message: 'Product name synced to Open Food Facts.',
      payload: {
        productName: normalizedName,
        statusCode: nameResult.statusCode || null,
      },
    });
    await context.persistJob?.();
  }

  const expectedImageFields = getExpectedImageFields(job);
  if (!expectedImageFields.length) {
    job.offImageStage = 'skipped';
    job.offStage = computeOffStage(job);
    await context.persistJob?.();
    return;
  }

  const retryableErrors = [];
  let blockedImageMessage = null;

  for (const imageField of expectedImageFields) {
    if (job.offImageResults?.[imageField]?.success) {
      continue;
    }

    const imageResult = await uploadImageToOFF({
      barcode: job.productSnapshot.barcode,
      imageField,
      imagePathOrBase64: job.photoPaths?.[imageField],
      creds,
    });

    job.offImageResults[imageField] = {
      ...imageResult,
      success: Boolean(imageResult.success),
      blocked: Boolean(imageResult.blocked),
      retryable: Boolean(imageResult.retryable),
      uploadedAt: imageResult.success ? nowIso() : null,
      attemptedAt: nowIso(),
    };
    job.offImageStage = computeOffImageStage(job);
    job.offStage = computeOffStage(job);

    await recordEvent(job, {
      eventType: imageResult.success ? 'off_image_uploaded' : 'off_image_upload_failed',
      stage: 'off_image_upload',
      status: imageResult.success ? 'success' : (imageResult.retryable ? 'error' : 'blocked'),
      message: imageResult.success
        ? `${imageField} image uploaded to Open Food Facts.`
        : `${imageField} image upload failed: ${imageResult.error}`,
      payload: {
        field: imageField,
        ...imageResult,
      },
    });
    await context.persistJob?.();

    if (!imageResult.success) {
      if (imageResult.retryable) {
        retryableErrors.push(new Error(imageResult.error || `${imageField} image upload failed temporarily.`));
      } else {
        blockedImageMessage = blockedImageMessage || `${imageField}: ${imageResult.error || 'Image upload failed.'}`;
      }
    }
  }

  if (blockedImageMessage) {
    job.offImageStage = 'blocked';
    job.offStage = computeOffStage(job);
    job.status = 'blocked';
    job.lastError = blockedImageMessage;
    await recordEvent(job, {
      eventType: 'off_image_upload_blocked',
      stage: 'off_image_upload',
      status: 'blocked',
      message: blockedImageMessage,
      payload: {
        imageResults: job.offImageResults || {},
      },
    });
    await context.persistJob?.();
    return;
  }

  if (retryableErrors.length > 0) {
    job.offImageStage = computeOffImageStage(job);
    job.offStage = computeOffStage(job);
    job.lastError = summarizeOffImageFailure(job);
    await context.persistJob?.();
    throw retryableErrors[0];
  }

  job.offImageStage = computeOffImageStage(job);
  job.offStage = computeOffStage(job);
  job.offResult = {
    ...(job.offResult || {}),
    ...buildOffProgressSummary(job),
  };
  job.lastError = null;
  await recordEvent(job, {
    eventType: 'off_image_upload_cycle_completed',
    stage: 'off_image_upload',
    status: 'success',
    message: 'Open Food Facts image upload completed.',
    payload: job.offResult,
  });
  await context.persistJob?.();
}

function summarizeCleanupFailure(trace = []) {
  const last = [...trace].reverse().find((item) => !item.success);
  if (!last) return 'All configured AI routes failed for this cycle.';
  return `All configured AI routes failed for this cycle. Last route: ${last.providerLabel} / ${last.model} (${last.maskedKey}) — ${last.error}`;
}

async function processAiCleanupStage(job, context) {
  if (job.aiCleanupStage !== 'pending') return;
  if (job.localOcrStage === 'skipped') {
    job.aiCleanupStage = 'skipped';
    await context.persistJob?.();
    return;
  }
  if (job.localOcrStage !== 'done') {
    return;
  }

  const routes = buildCleanupRoutes(context.userPrefs || {});
  if (!routes.length) {
    job.aiCleanupStage = 'blocked';
    job.status = 'blocked';
    job.lastError = 'No enabled provider routes are configured. Add at least one API key and text model.';
    await recordEvent(job, {
      eventType: 'ai_cleanup_blocked',
      stage: 'ai_cleanup',
      status: 'blocked',
      message: job.lastError,
    });
    await context.persistJob?.();
    return;
  }

  const connectivity = await getCurrentConnectivity().catch(() => ({ online: true }));
  if (!connectivity.online) {
    throw new Error('Device is offline. AI cleanup will continue when the app reconnects.');
  }

  try {
    const result = await normalizeOcrText({
      productHints: {
        barcode: job.productSnapshot.barcode,
        name: job.requestedName || job.productSnapshot.name,
        brand: job.productSnapshot.brand,
      },
      ocrText: job.localOcrRaw,
      providerRegistry: context.userPrefs,
      attemptedRouteIds: job.currentCleanupAttemptedRouteIds || [],
      onAttempt: async (attempt) => {
        job.cleanupTrace = [...(job.cleanupTrace || []), attempt];
        job.currentCleanupAttemptedRouteIds = [...(job.currentCleanupAttemptedRouteIds || []), attempt.routeId];
        await recordEvent(job, {
          eventType: attempt.success ? 'ai_cleanup_route_succeeded' : 'ai_cleanup_route_failed',
          stage: 'ai_cleanup',
          status: attempt.success ? 'success' : 'error',
          providerId: attempt.providerId,
          providerLabel: attempt.providerLabel,
          model: attempt.model,
          maskedKey: attempt.maskedKey,
          routeId: attempt.routeId,
          message: attempt.success ? 'Route succeeded.' : attempt.error,
          payload: attempt,
        });
        await context.persistJob?.();
      },
    });

    job.cleanupResult = {
      ...result.cleanJson,
      rawOCRText: result.rawText || job.localOcrRaw?.combinedText || '',
    };
    job.aiCleanupRoute = {
      providerId: result.route.providerId,
      providerLabel: result.route.providerLabel,
      model: result.route.model,
      maskedKey: result.route.maskedKey,
      routeId: result.route.id,
    };
    job.aiCleanupStage = 'done';
    job.currentCleanupAttemptedRouteIds = [];
    job.lastError = null;

    applyJobToProductContext(job, context.productDispatch);
    await recordEvent(job, {
      eventType: 'ai_cleanup_completed',
      stage: 'ai_cleanup',
      status: 'success',
      providerId: job.aiCleanupRoute.providerId,
      providerLabel: job.aiCleanupRoute.providerLabel,
      model: job.aiCleanupRoute.model,
      maskedKey: job.aiCleanupRoute.maskedKey,
      routeId: job.aiCleanupRoute.routeId,
      message: 'AI cleanup completed with a cleaned JSON result.',
    });
    await context.persistJob?.();
  } catch (error) {
    if (error.code === 'routes_exhausted') {
      job.lastError = summarizeCleanupFailure(error.trace || job.cleanupTrace || []);
      job.currentCleanupAttemptedRouteIds = [];
      await context.persistJob?.();
      throw error;
    }

    if (isTransientProviderError(error) || classifyGenericFailure(error.message)) {
      throw error;
    }

    job.aiCleanupStage = 'blocked';
    job.status = 'blocked';
    job.lastError = error.message;
    await recordEvent(job, {
      eventType: 'ai_cleanup_blocked',
      stage: 'ai_cleanup',
      status: 'blocked',
      message: error.message,
    });
    await context.persistJob?.();
  }
}

async function processSupabaseStage(job, context) {
  if (job.supabaseStage !== 'pending') return;

  const hasBackPhotos = Boolean(job.photoPaths.ingredients || job.photoPaths.nutrition);
  if (hasBackPhotos && job.aiCleanupStage !== 'done') {
    return;
  }
  if (!hasBackPhotos && job.localOcrStage === 'pending') {
    return;
  }

  const supabaseCreds = getSupabaseCredentials(context.userPrefs || {});
  if (!supabaseCreds.url || !supabaseCreds.key) {
    job.supabaseStage = 'blocked';
    job.status = 'blocked';
    job.lastError = 'Supabase credentials are missing, so the cleaned product data cannot be saved yet.';
    await recordEvent(job, {
      eventType: 'supabase_persist_blocked',
      stage: 'supabase_persist',
      status: 'blocked',
      message: job.lastError,
    });
    await context.persistJob?.();
    return;
  }

  const mergedProduct = buildProductFromJob({
    ...job,
    status: 'running',
  });

  const saveResult = await saveProduct(mergedProduct);
  if (!saveResult.success) {
    if (saveResult.offline || isRetryableSupabaseError(saveResult)) {
      throw new Error(saveResult.error || 'Product persistence failed temporarily.');
    }
    job.supabaseStage = 'blocked';
    job.status = 'blocked';
    job.lastError = saveResult.error || 'Could not persist product data to Supabase.';
    await recordEvent(job, {
      eventType: 'supabase_persist_failed',
      stage: 'supabase_persist',
      status: 'blocked',
      message: job.lastError,
    });
    await context.persistJob?.();
    return;
  }

  await recordScan(mergedProduct.barcode, job.contributorEmail || context.userPrefs?.email || null).catch(() => {});

  const contributionResult = await logUserContribution({
    barcode: mergedProduct.barcode,
    productName: mergedProduct.name,
    contributorEmail: job.contributorEmail || context.userPrefs?.email || null,
    rawOcr: job.localOcrRaw?.combinedText || null,
    filteredData: job.cleanupResult || job.localOcrResult || null,
    ingredients: mergedProduct.ingredients || [],
    frontUploaded: Boolean(job.offImageResults?.front?.success),
    backOcrd: Boolean(job.localOcrRaw),
    status: 'approved',
    cleanupTrace: job.cleanupTrace || [],
    providerRoute: job.aiCleanupRoute || null,
  });

  if (!contributionResult.success) {
    if (contributionResult.offline || isRetryableSupabaseError(contributionResult)) {
      throw new Error(contributionResult.error || 'Contribution logging failed temporarily.');
    }
    job.supabaseStage = 'blocked';
    job.status = 'blocked';
    job.lastError = contributionResult.error || 'Could not store contribution metadata.';
    await recordEvent(job, {
      eventType: 'supabase_contribution_failed',
      stage: 'supabase_persist',
      status: 'blocked',
      message: job.lastError,
    });
    await context.persistJob?.();
    return;
  }

  job.supabaseStage = 'done';
  job.lastError = null;
  applyJobToProductContext(job, context.productDispatch);
  await recordEvent(job, {
    eventType: 'supabase_persist_completed',
    stage: 'supabase_persist',
    status: 'success',
    message: 'Product and contribution data were saved to Supabase.',
  });
  await context.persistJob?.();
}

async function processJob(job, context = {}) {
  syncOffStageState(job);
  job.status = 'running';
  job.updatedAt = nowIso();

  const transientErrors = [];

  try {
    await processLocalOcrStage(job, context);
  } catch (error) {
    transientErrors.push(error);
  }

  try {
    await processOffStage(job, context);
  } catch (error) {
    transientErrors.push(error);
  }

  try {
    await processAiCleanupStage(job, context);
  } catch (error) {
    transientErrors.push(error);
  }

  try {
    await processSupabaseStage(job, context);
  } catch (error) {
    transientErrors.push(error);
  }

  if (transientErrors.length > 0) {
    throw transientErrors[0];
  }

  const hasBlockedStage = [job.offNameStage, job.offImageStage, job.localOcrStage, job.aiCleanupStage, job.supabaseStage].includes('blocked');
  if (job.status === 'blocked' || hasBlockedStage) {
    job.offStage = computeOffStage(job);
    job.status = 'blocked';
    applyJobToProductContext(job, context.productDispatch);
    return;
  }

  const stagesSuccessful = isSuccessfulStage(job.offNameStage)
    && isSuccessfulStage(job.offImageStage)
    && isSuccessfulStage(job.localOcrStage)
    && isSuccessfulStage(job.aiCleanupStage)
    && isSuccessfulStage(job.supabaseStage);

  if (stagesSuccessful) {
    job.offStage = computeOffStage(job);
    job.status = 'completed';
    job.completedAt = job.completedAt || nowIso();
    job.lastError = null;
    applyJobToProductContext(job, context.productDispatch);
    return;
  }

  job.offStage = computeOffStage(job);
  job.status = 'pending';
  applyJobToProductContext(job, context.productDispatch);
}

function shouldProcessJob(job, includeBlocked = false) {
  if (!job) return false;
  if (job.status === 'completed') return false;
  if (job.status === 'blocked') return includeBlocked;
  if (!job.nextAttemptAt) return true;
  return Date.parse(job.nextAttemptAt) <= Date.now();
}

export async function listContributionJobs() {
  const queue = await readQueue();
  return queue.sort((left, right) => Date.parse(right.updatedAt || right.createdAt) - Date.parse(left.updatedAt || left.createdAt));
}

export async function getJobStatus() {
  const queue = await listContributionJobs();
  return summarize(queue);
}

export function isContributionQueueProcessing() {
  return processing;
}

export async function clearBlockedJobs() {
  const queue = await readQueue();
  const blockedJobs = queue.filter((job) => job.status === 'blocked');
  await Promise.all(blockedJobs.map((job) => cleanupPhotos(job.photoPaths)));
  const filteredQueue = queue.filter((job) => job.status !== 'blocked');
  await writeQueue(filteredQueue);
  return summarize(filteredQueue);
}

export async function requeueBlockedJobs() {
  const queue = await readQueue();
  const updatedQueue = queue.map((job) => (
    job.status === 'blocked'
      ? syncOffStageState({
          ...job,
          status: 'pending',
          offNameStage: job.offNameStage === 'blocked' ? 'pending' : job.offNameStage,
          offImageStage: job.offImageStage === 'blocked' ? 'pending' : job.offImageStage,
          offImageResults: retainSuccessfulOffImageResults(job.offImageResults || {}),
          localOcrStage: job.localOcrStage === 'blocked' ? 'pending' : job.localOcrStage,
          aiCleanupStage: job.aiCleanupStage === 'blocked' ? 'pending' : job.aiCleanupStage,
          supabaseStage: job.supabaseStage === 'blocked' ? 'pending' : job.supabaseStage,
          lastError: null,
          nextAttemptAt: nowIso(),
          updatedAt: nowIso(),
          currentCleanupAttemptedRouteIds: [],
        })
      : job
  ));
  await writeQueue(updatedQueue);
  return summarize(updatedQueue);
}

export async function enqueueContributionJob({ product, photos, productName, contributorEmail }) {
  const jobId = createJobId();
  const photoPaths = await persistPhotos(jobId, photos);
  const hasBackPhotos = Boolean(photoPaths.ingredients || photoPaths.nutrition);
  const hasAnyPhotos = Boolean(photoPaths.front || photoPaths.ingredients || photoPaths.nutrition);

  const job = {
    id: jobId,
    type: 'contribution',
    status: 'pending',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    nextAttemptAt: nowIso(),
    attemptCount: 0,
    lastError: null,
    contributorEmail: contributorEmail || null,
    requestedName: productName || '',
    productSnapshot: sanitizeProductSnapshot(product),
    photoPaths,
    offNameStage: 'pending',
    offImageStage: hasAnyPhotos ? 'pending' : 'skipped',
    offStage: hasAnyPhotos ? 'pending' : 'pending',
    localOcrStage: hasBackPhotos ? 'pending' : 'skipped',
    aiCleanupStage: hasBackPhotos ? 'pending' : 'skipped',
    supabaseStage: 'pending',
    offResult: null,
    offImageResults: {},
    localOcrRaw: null,
    localOcrResult: null,
    cleanupResult: null,
    cleanupTrace: [],
    currentCleanupAttemptedRouteIds: [],
    aiCleanupRoute: null,
  };

  const queue = await readQueue();
  queue.push(syncOffStageState(job));
  await writeQueue(queue);
  return syncOffStageState(job);
}

export async function submitProductContribution({ product, photos, productName, userPrefs, productDispatch }) {
  const normalizedName = normalizeContributionName(productName, product?.name);
  if (!normalizedName) {
    throw new Error('Enter the real product name before sending it to Open Food Facts.');
  }

  const job = await enqueueContributionJob({
    product,
    photos,
    productName: normalizedName,
    contributorEmail: userPrefs?.email || null,
  });

  applyJobToProductContext(job, productDispatch);

  await processPendingJobs({
    userPrefs,
    productDispatch,
    includeBlocked: false,
  });

  const queue = await listContributionJobs();
  const latestJob = queue.find((item) => item.id === job.id) || job;

  return {
    jobId: latestJob.id,
    state: latestJob.status,
    message: buildSyncMessage(latestJob),
    product: buildProductFromJob(latestJob),
  };
}

export async function processPendingJobs(context = {}) {
  if (processing) {
    return { processed: 0, retried: 0, blocked: 0, skipped: true, ...(await getJobStatus()) };
  }

  processing = true;

  try {
    await ensureDirectories();
    let queue = await readQueue();
    let processed = 0;
    let retried = 0;
    let blocked = 0;

    for (const job of queue) {
      if (!shouldProcessJob(job, context.includeBlocked)) continue;

      if (job.status === 'blocked' && context.includeBlocked) {
        job.status = 'pending';
        job.offNameStage = job.offNameStage === 'blocked' ? 'pending' : job.offNameStage;
        job.offImageStage = job.offImageStage === 'blocked' ? 'pending' : job.offImageStage;
        job.offImageResults = retainSuccessfulOffImageResults(job.offImageResults || {});
        job.offStage = computeOffStage(job);
        job.localOcrStage = job.localOcrStage === 'blocked' ? 'pending' : job.localOcrStage;
        job.aiCleanupStage = job.aiCleanupStage === 'blocked' ? 'pending' : job.aiCleanupStage;
        job.supabaseStage = job.supabaseStage === 'blocked' ? 'pending' : job.supabaseStage;
        job.lastError = null;
        job.nextAttemptAt = nowIso();
        job.currentCleanupAttemptedRouteIds = [];
      }

      const persistJob = async () => {
        job.updatedAt = nowIso();
        await writeQueue(queue);
      };

      try {
        await processJob(job, {
          ...context,
          persistJob,
        });
        if (job.status === 'completed') {
          processed += 1;
        } else if (job.status === 'blocked') {
          blocked += 1;
        }
      } catch (error) {
        const retryable = isTransientProviderError(error) || classifyGenericFailure(error.message);
        if (retryable) {
          job.status = 'pending';
          job.attemptCount += 1;
          job.nextAttemptAt = computeNextAttempt(job.attemptCount);
          job.lastError = error.message;
          retried += 1;
        } else {
          job.status = 'blocked';
          job.lastError = error.message;
          blocked += 1;
        }
        job.offStage = computeOffStage(job);
        job.updatedAt = nowIso();
        applyJobToProductContext(job, context.productDispatch);
        await recordEvent(job, {
          eventType: retryable ? 'job_requeued' : 'job_blocked',
          stage: 'job',
          status: retryable ? 'pending' : 'blocked',
          attemptNumber: job.attemptCount,
          message: error.message,
        });
        await writeQueue(queue);
        logError('Contribution Queue Job', error, { jobId: job.id, barcode: job.productSnapshot?.barcode });
      }
    }

    const cutoff = Date.now() - RETAIN_COMPLETED_MS;
    const retainedQueue = [];
    for (const job of queue) {
      if (job.status === 'completed' && Date.parse(job.completedAt || job.updatedAt || job.createdAt) < cutoff) {
        await cleanupPhotos(job.photoPaths);
        continue;
      }
      retainedQueue.push(job);
    }

    queue = retainedQueue;
    await writeQueue(queue);
    return {
      processed,
      retried,
      blocked,
      ...summarize(queue),
    };
  } finally {
    processing = false;
  }
}

export function attachContributionQueueToAppState(handler) {
  return AppState.addEventListener('change', handler);
}
