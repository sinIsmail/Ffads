import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const APP_NAME = 'Ffads';
const APP_VERSION = '1.0.0';
const DEFAULT_CONTACT_EMAIL = process.env.EXPO_PUBLIC_OFF_CONTACT_EMAIL || 'contact@ffads.app';
const DEVICE_UUID_KEY = '@ffads_device_uuid';

const OFF_CGI_URL = 'https://world.openfoodfacts.org/cgi/product_jqm2.pl';
const OFF_IMAGE_URL = 'https://world.openfoodfacts.org/cgi/product_image_upload.pl';
const BASE_URL = process.env.EXPO_PUBLIC_OFF_API_BASE_URL || 'https://world.openfoodfacts.org/api/v2';

let deviceUuidCache = null;

function getExpoAppMeta() {
  const expoConfig = Constants.expoConfig || {};
  return {
    appName: String(expoConfig.name || APP_NAME).trim() || APP_NAME,
    appVersion: String(expoConfig.version || APP_VERSION).trim() || APP_VERSION,
  };
}

export function getOFFAppMeta(overrides = {}) {
  const expoMeta = getExpoAppMeta();
  const appName = String(overrides.appName || expoMeta.appName || APP_NAME).trim() || APP_NAME;
  const appVersion = String(overrides.appVersion || expoMeta.appVersion || APP_VERSION).trim() || APP_VERSION;
  const contactEmail = String(overrides.contactEmail || DEFAULT_CONTACT_EMAIL).trim() || DEFAULT_CONTACT_EMAIL;

  return {
    appName,
    appVersion,
    contactEmail,
    userAgent: `${appName}/${appVersion} (${contactEmail})`,
  };
}

async function getDeviceUuid() {
  if (deviceUuidCache) return deviceUuidCache;

  try {
    const stored = await AsyncStorage.getItem(DEVICE_UUID_KEY);
    if (stored) {
      deviceUuidCache = stored;
      return stored;
    }

    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
      const random = (Math.random() * 16) | 0;
      const value = char === 'x' ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    });

    await AsyncStorage.setItem(DEVICE_UUID_KEY, uuid);
    deviceUuidCache = uuid;
    return uuid;
  } catch {
    deviceUuidCache = 'unknown-device';
    return deviceUuidCache;
  }
}

async function appendContributorFields(target, username, appMeta = null) {
  const uuid = await getDeviceUuid();
  const resolvedAppMeta = appMeta || getOFFAppMeta();
  target.append('app_name', resolvedAppMeta.appName);
  target.append('app_version', resolvedAppMeta.appVersion);
  target.append('app_uuid', uuid);
  target.append('user_id', username);
}

function parseJsonSafely(rawText) {
  try {
    return JSON.parse(rawText);
  } catch {
    return null;
  }
}

function isRetryableStatus(status) {
  return status === 429 || status >= 500;
}

function isRetryableMessage(message = '') {
  return /network|timeout|timed out|failed to fetch|socket/i.test(message);
}

function createFailure(error, options = {}) {
  return {
    success: false,
    error,
    retryable: options.retryable ?? false,
    blocked: options.blocked ?? !options.retryable,
    statusCode: options.statusCode ?? null,
    details: options.details ?? null,
  };
}

function normalizeProduct(product, barcode) {
  const nutriments = product.nutriments || {};

  return {
    barcode,
    name: product.product_name || product.product_name_en || 'Unknown Product',
    brand: product.brands || 'Unknown Brand',
    category: product.categories_tags?.[0]?.replace('en:', '') || product.categories || 'Uncategorized',
    images: {
      front: product.image_front_url || product.image_url || null,
      ingredients: product.image_ingredients_url || null,
      nutrition: product.image_nutrition_url || null,
    },
    ingredients: parseIngredientText(product.ingredients_text || product.ingredients_text_en || ''),
    ingredientsRaw: product.ingredients_text || product.ingredients_text_en || '',
    nutrition: {
      energy: nutriments['energy-kcal_100g'] || nutriments['energy-kcal'] || 0,
      protein: nutriments.proteins_100g || 0,
      carbs: nutriments.carbohydrates_100g || 0,
      sugar: nutriments.sugars_100g || 0,
      fat: nutriments.fat_100g || 0,
      saturatedFat: nutriments['saturated-fat_100g'] || 0,
      fiber: nutriments.fiber_100g || 0,
      sodium: nutriments.sodium_100g ? nutriments.sodium_100g * 1000 : 0,
    },
    nutriscore: product.nutriscore_grade || null,
    novaGroup: product.nova_group || null,
    source: 'openfoodfacts',
  };
}

function parseIngredientText(text) {
  if (!text) return [];

  return text
    .replace(/\([^)]*\)/g, '')
    .split(/[,;]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 1);
}

export function isOFFConfigured(creds) {
  const username = creds?.username || process.env.EXPO_PUBLIC_OFF_USERNAME || '';
  const password = creds?.password || process.env.EXPO_PUBLIC_OFF_PASSWORD || '';
  return Boolean(username && password);
}

export async function lookupBarcode(barcode) {
  try {
    const response = await fetch(`${BASE_URL}/product/${barcode}.json`, {
      headers: { 'User-Agent': getOFFAppMeta().userAgent },
    });

    if (!response.ok) {
      return null;
    }

    const rawText = await response.text();
    const data = parseJsonSafely(rawText);
    if (data?.status !== 1 || !data?.product) {
      return null;
    }

    return normalizeProduct(data.product, barcode);
  } catch {
    return null;
  }
}

export async function fetchProductImageUrls(barcode) {
  if (!barcode) return [];

  const response = await fetch(
    `${BASE_URL}/product/${barcode}.json?fields=image_front_url,image_ingredients_url,image_nutrition_url,image_url`,
    {
      headers: { 'User-Agent': getOFFAppMeta().userAgent },
    }
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const rawText = await response.text();
  const data = parseJsonSafely(rawText);
  if (data?.status !== 1 || !data?.product) {
    return [];
  }

  return [
    data.product.image_front_url || data.product.image_url || null,
    data.product.image_nutrition_url || null,
    data.product.image_ingredients_url || null,
  ]
    .filter(Boolean)
    .map((url) => url.replace('http://', 'https://'));
}

function summarizeImageUploadErrors(imageResults = []) {
  return imageResults
    .filter((result) => !result.success)
    .map((result) => `${result.field}: ${result.error}`)
    .join(' | ');
}

function isLikelyFileUri(value = '') {
  return /^(file:\/\/|content:\/\/|\/|[A-Za-z]:\\)/.test(value);
}

async function resolveImageUploadUri(imagePathOrBase64, imageField = 'front') {
  if (!imagePathOrBase64) {
    return { uri: null, cleanup: null };
  }

  if (typeof imagePathOrBase64 === 'object' && imagePathOrBase64.uri) {
    return { uri: imagePathOrBase64.uri, cleanup: null };
  }

  if (typeof imagePathOrBase64 === 'string' && isLikelyFileUri(imagePathOrBase64)) {
    return { uri: imagePathOrBase64, cleanup: null };
  }

  const base64Image = typeof imagePathOrBase64 === 'object'
    ? imagePathOrBase64.base64
    : imagePathOrBase64;

  const tempFileName = `off_${imageField}_${Date.now()}.jpg`;
  const tempPath = `${FileSystem.cacheDirectory || ''}${tempFileName}`;

  await FileSystem.writeAsStringAsync(tempPath, base64Image, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return {
    uri: tempPath,
    cleanup: () => FileSystem.deleteAsync(tempPath, { idempotent: true }).catch(() => {}),
  };
}

export async function syncProductNameToOFF({ barcode, name, creds = {}, appMeta = null }) {
  const username = creds.username || process.env.EXPO_PUBLIC_OFF_USERNAME || '';
  const password = creds.password || process.env.EXPO_PUBLIC_OFF_PASSWORD || '';
  const resolvedAppMeta = getOFFAppMeta({ contactEmail: creds.contactEmail, ...(appMeta || {}) });

  if (!username || !password) {
    return createFailure('OFF credentials are missing. Add them in Profile > API.', {
      blocked: true,
    });
  }

  const normalizedName = String(name || '').trim();
  if (!barcode || !normalizedName) {
    return createFailure('A product name is required before syncing to Open Food Facts.', {
      blocked: true,
    });
  }

  try {
    const body = new URLSearchParams();
    body.append('code', barcode);
    await appendContributorFields(body, username, resolvedAppMeta);
    body.append('password', password);
    body.append('product_name', normalizedName);

    const response = await fetch(OFF_CGI_URL, {
      method: 'POST',
      body: body.toString(),
      headers: {
        'User-Agent': resolvedAppMeta.userAgent,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const rawText = await response.text();
    const result = parseJsonSafely(rawText);
    const success = response.ok && (result?.status === 1 || result?.status_verbose === 'fields saved');

    if (success) {
      return {
        success: true,
        nameSynced: true,
        statusCode: response.status,
      };
    }

    return createFailure(
      result?.status_verbose || result?.error || `HTTP ${response.status}`,
      {
        retryable: isRetryableStatus(response.status),
        statusCode: response.status,
        details: rawText,
      }
    );
  } catch (error) {
    return createFailure(error.message, {
      retryable: isRetryableMessage(error.message),
    });
  }
}

export async function uploadImageToOFF({ barcode, imagePathOrBase64, imageField = 'front', creds = {}, appMeta = null }) {
  const username = creds.username || process.env.EXPO_PUBLIC_OFF_USERNAME || '';
  const password = creds.password || process.env.EXPO_PUBLIC_OFF_PASSWORD || '';
  const resolvedAppMeta = getOFFAppMeta({ contactEmail: creds.contactEmail, ...(appMeta || {}) });
  let cleanupUploadSource = null;

  if (!username || !password) {
    return createFailure('OFF credentials are missing. Add them in Profile > API.', {
      blocked: true,
    });
  }

  const fieldMap = {
    front: 'imgupload_front',
    ingredients: 'imgupload_ingredients',
    nutrition: 'imgupload_nutrition',
  };
  const offField = fieldMap[imageField] || 'imgupload_other';

  try {
    const uploadSource = await resolveImageUploadUri(imagePathOrBase64, imageField);
    cleanupUploadSource = uploadSource.cleanup || null;
    if (!uploadSource.uri) {
      return createFailure(`No ${imageField} image was provided for upload.`, {
        blocked: true,
      });
    }

    const formData = new FormData();
    formData.append('code', barcode);
    await appendContributorFields(formData, username, resolvedAppMeta);
    formData.append('password', password);
    formData.append(offField, {
      uri: uploadSource.uri,
      name: `off_${imageField}_${Date.now()}.jpg`,
      type: 'image/jpeg',
    });
    formData.append('imagefield', imageField);

    const response = await fetch(OFF_IMAGE_URL, {
      method: 'POST',
      body: formData,
      headers: {
        'User-Agent': resolvedAppMeta.userAgent,
      },
    });

    const rawText = await response.text();
    const result = parseJsonSafely(rawText);
    const success = response.ok && (result?.status === 1 || result?.status_verbose === 'fields saved');

    if (success) {
      return {
        success: true,
        field: imageField,
        statusCode: response.status,
      };
    }

    return createFailure(
      result?.status_verbose || result?.error || `HTTP ${response.status}`,
      {
        retryable: isRetryableStatus(response.status),
        statusCode: response.status,
        details: rawText,
      }
    );
  } catch (error) {
    return createFailure(error.message, {
      retryable: isRetryableMessage(error.message),
    });
  } finally {
    cleanupUploadSource?.();
  }
}

export async function contributeToOFF({ barcode, name, creds = {}, appMeta = null, images = {} }) {
  const nameResult = await syncProductNameToOFF({
    barcode,
    name,
    creds,
    appMeta,
  });

  if (!nameResult.success) {
    return {
      success: false,
      nameSynced: false,
      imageResults: [],
      retryable: Boolean(nameResult.retryable),
      blocked: Boolean(nameResult.blocked),
      statusCode: nameResult.statusCode ?? null,
      error: nameResult.error,
      nameResult,
    };
  }

  const imageFields = ['front', 'nutrition', 'ingredients'];
  const imageResults = [];

  for (const imageField of imageFields) {
    if (!images?.[imageField]) continue;

    const imageResult = await uploadImageToOFF({
      barcode,
      imageField,
      imagePathOrBase64: images[imageField],
      creds,
      appMeta,
    });

    imageResults.push({ field: imageField, ...imageResult });
  }

  const anyFailure = imageResults.some((result) => !result.success);
  const anyRetryableFailure = imageResults.some((result) => !result.success && result.retryable);

  return {
    success: !anyFailure,
    nameSynced: true,
    nameResult,
    imageResults,
    retryable: anyFailure && anyRetryableFailure,
    blocked: anyFailure && !anyRetryableFailure,
    error: anyFailure ? summarizeImageUploadErrors(imageResults) : null,
  };
}
