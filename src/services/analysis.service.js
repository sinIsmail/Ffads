// Ffads — Analysis Service (Production v2)
// UI → analysis.service → gemini (1 call max) / local math
//
// API BUDGET PER PRODUCT:
//   Product Open:   0 calls (local math only)
//   Analyze Tap:    1 call  (runDeepAnalysis — chemicals + animal + score)
//   Ingredient Tap: 0-1 calls (cached after first)
//
// PRODUCTION FIX: AI Concurrency Lock
//   When 50 users scan the same unknown product simultaneously, this service
//   inserts status='processing' as a DB-level lock before calling Gemini.
//   Other callers poll the status and wait instead of firing duplicate calls.

import * as gemini from './gemini';
import { getSupabaseClient, saveProduct, setAIProcessingStatus, getDeepIngredientKnowledge, updateDeepIngredientKnowledge } from './supabase';
import { calculateMacroScore } from '../utils/thresholds';
import { logError } from './telemetry';

// ─── Internal polling helper ───────────────────────────────────────────────────
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 6; // 6 × 2s = 12s max wait

async function pollForCachedResult(supabase, barcode) {
  console.log(`🔬 [AnalysisService] ⏳ Another process is analyzing "${barcode}" — polling for result...`);
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    try {
      const { data } = await supabase
        .from('product_ai_data')
        .select('status, animal_content_flag, animal_content_details, harmful_chemicals, ai_score, ai_recommendation')
        .eq('barcode', barcode)
        .single();

      if (data && data.status === 'done' && data.ai_score !== null) {
        console.log(`🔬 [AnalysisService] ✅ Polled result ready after ${attempt + 1} attempt(s)`);
        return {
          animalContentFlag:    data.animal_content_flag,
          animalContentDetails: data.animal_content_details,
          harmfulChemicals:     data.harmful_chemicals || [],
          aiScore:              data.ai_score,
          aiRecommendation:     data.ai_recommendation,
        };
      }
      if (data?.status === 'failed') {
        console.warn(`🔬 [AnalysisService] ⚠️ Polled status: failed — proceeding with own Gemini call`);
        return null; // Fall through to our own Gemini call
      }
    } catch { /* ignore poll errors */ }
    console.log(`🔬 [AnalysisService] ⏳ Poll attempt ${attempt + 1}/${POLL_MAX_ATTEMPTS} — still processing...`);
  }
  console.warn(`🔬 [AnalysisService] ⚠️ Poll timeout after ${POLL_MAX_ATTEMPTS} attempts — proceeding with own call`);
  return null;
}

/**
 * MAIN ANALYSIS FLOW
 *
 * 1. Safety Check — abort if no ingredients
 * 2. Supabase Cache Check — return cached AI if exists
 *    2a. If status='processing' → poll/wait instead of duplicate Gemini call
 *    2b. If no row → INSERT lock row (status='processing') before calling Gemini
 * 3. Deliberate 2s UX delay
 * 4. Single Gemini Call (runDeepAnalysis)
 * 5. Cache result to Supabase (status → 'done')
 */
export async function analyzeProduct(product, options = {}) {
  const {
    geminiModel = null,
    onProgress  = null,
  } = options;

  console.log(`\n🔬 ═══════════════════════════════════════════`);
  console.log(`🔬 [AnalysisService] START — analyzeProduct("${product.barcode}")`);
  console.log(`🔬 ═══════════════════════════════════════════`);

  let finalPayload = {
    localData: null,
    aiData:    null,
    aiPowered: false,
    cached:    false,
  };

  // ── 1. Local Processing (Always runs, zero AI) ─────────────────────────────
  finalPayload.localData = calculateMacroScore(product.nutrition);
  console.log(`🔬 [AnalysisService] Step 1/5 → Local macro score: ${finalPayload.localData?.score ?? 'N/A'}`);

  if (!product.ingredients || product.ingredients.length === 0) {
    console.warn(`🔬 [AnalysisService] ⚠️ ABORT — No ingredients for "${product.barcode}". Local-only result.`);
    return { ...finalPayload, error: 'No ingredients available for AI analysis.' };
  }

  if (!gemini.isGeminiConfigured(options.geminiApiKey)) {
    console.warn(`🔬 [AnalysisService] ⚠️ ABORT — No Gemini API key. Local-only result.`);
    return { ...finalPayload, error: 'AI Analysis requires a Gemini API Key. Please add your key in the Profile screen.' };
  }

  // ── 2. Supabase Cache Check (with Concurrency Lock) ───────────────────────
  const supabase = getSupabaseClient();
  let lockAcquired = false;

  if (supabase && product.barcode) {
    try {
      onProgress?.({ step: 1, total: 2, label: 'Checking database...' });
      console.log(`🔬 [AnalysisService] Step 2/5 → Checking Supabase AI cache for "${product.barcode}"...`);

      const { data, error } = await supabase
        .from('product_ai_data')
        .select('status, animal_content_flag, animal_content_details, harmful_chemicals, ai_score, ai_recommendation')
        .eq('barcode', product.barcode)
        .single();

      if (!error && data) {
        if (data.status === 'done' && data.ai_score !== null) {
          // ── CACHE HIT ──
          console.log(`🔬 [AnalysisService] Step 2/5 → ✅ CACHE HIT! Score=${data.ai_score} (0 API calls)`);
          finalPayload.aiData = {
            animalContentFlag:    data.animal_content_flag,
            animalContentDetails: data.animal_content_details,
            harmfulChemicals:     data.harmful_chemicals || [],
            aiScore:              data.ai_score,
            aiRecommendation:     data.ai_recommendation,
          };
          finalPayload.aiPowered = true;
          finalPayload.cached    = true;
          console.log(`🔬 [AnalysisService] END — Returning cached AI result ✅\n`);
          return finalPayload;
        }

        if (data.status === 'processing') {
          // ── CONCURRENCY LOCK: Another user is analyzing this right now ──
          console.log(`🔬 [AnalysisService] Step 2/5 → 🔒 Status=processing detected — polling...`);
          const polledData = await pollForCachedResult(supabase, product.barcode);
          if (polledData) {
            finalPayload.aiData    = polledData;
            finalPayload.aiPowered = true;
            finalPayload.cached    = true;
            console.log(`🔬 [AnalysisService] END — Returning polled AI result ✅\n`);
            return finalPayload;
          }
          // Poll timed out — fall through to make our own call
          // The previous lock row will be overwritten when we complete
        }
      } else {
        // ── CACHE MISS: No row exists — acquire the lock ──
        console.log(`🔬 [AnalysisService] Step 2/5 → CACHE MISS — Acquiring processing lock...`);
        lockAcquired = await setAIProcessingStatus(product.barcode, 'processing');
        if (lockAcquired) {
          console.log(`🔬 [AnalysisService] Step 2/5 → 🔒 Lock acquired for "${product.barcode}"`);
        }
      }
    } catch (err) {
      console.warn(`🔬 [AnalysisService] Step 2/5 → ⚠️ Cache check failed: ${err.message}`);
    }
  }

  // ── 3. Deliberate 2-second UX delay ───────────────────────────────────────
  onProgress?.({ step: 1, total: 2, label: 'Preparing deep analysis...' });
  console.log(`🔬 [AnalysisService] Step 3/5 → 2s UX delay...`);
  await new Promise(resolve => setTimeout(resolve, 2000));

  // ── 4. Single Gemini Call ─────────────────────────────────────────────────
  try {
    onProgress?.({ step: 2, total: 2, label: 'Running AI analysis...' });
    console.log(`🔬 [AnalysisService] Step 4/5 → 🤖 Calling Gemini for "${product.barcode}" (model: ${geminiModel || 'default'})...`);
    const startTime = Date.now();

    const result  = await gemini.runDeepAnalysis(product, options.geminiApiKey, geminiModel);
    const elapsed = Date.now() - startTime;

    let dataObj = result;
    if (Array.isArray(result) && result.length > 0) dataObj = result[0];
    else if (result?.analysis) dataObj = result.analysis;

    const aiScoreVal = dataObj?.aiScore ?? dataObj?.ai_score ?? dataObj?.score ?? null;
    console.log(`🔬 [AnalysisService] Step 4/5 → Gemini responded in ${elapsed}ms — raw score: ${aiScoreVal}`);

    if (aiScoreVal === null || aiScoreVal === undefined) {
      console.error(`🔬 [AnalysisService] ❌ Malformed Gemini response — keys: [${Object.keys(dataObj || {}).join(', ')}]`);
      // Release lock on failure so next user can retry.
      // Bug Fix: Added .catch(()=>{}) — if Supabase is also down here, without this guard
      // the await throws an unhandled rejection that crashes the Hermes JS engine.
      if (lockAcquired && supabase) await setAIProcessingStatus(product.barcode, 'failed').catch(() => {});
      throw new Error('The AI returned a malformed response. Please tap evaluate again to retry.');
    }

    finalPayload.aiData = {
      animalContentFlag:    dataObj?.animalContentFlag    ?? dataObj?.animal_content_flag    ?? false,
      animalContentDetails: dataObj?.animalContentDetails ?? dataObj?.animal_content_details ?? null,
      harmfulChemicals:     dataObj?.harmfulChemicals     ?? dataObj?.harmful_chemicals      ?? [],
      aiScore:              aiScoreVal,
      aiRecommendation:     dataObj?.aiRecommendation     ?? dataObj?.ai_recommendation      ?? null,
    };
    finalPayload.aiPowered = true;
    console.log(`🔬 [AnalysisService] Step 4/5 → ✅ score=${aiScoreVal}, animal=${finalPayload.aiData.animalContentFlag}, chemicals=${finalPayload.aiData.harmfulChemicals?.length || 0}`);

    // ── 5. Cache to Supabase (fire & forget, with proper error surface) ──────
    if (product.barcode && supabase && result) {
      (async () => {
        try {
          console.log(`🔬 [AnalysisService] Step 5/5 → 💾 Ensuring product row exists (FK constraint)...`);
          const saved = await saveProduct(product);
          if (!saved?.success) {
            console.warn(`🔬 [AnalysisService] Step 5/5 → ⚠️ saveProduct failed (${saved?.error}), skipping AI cache`);
            if (lockAcquired) await setAIProcessingStatus(product.barcode, 'failed');
            return;
          }

          console.log(`🔬 [AnalysisService] Step 5/5 → 💾 Writing AI result to product_ai_data...`);
          const { error } = await supabase.from('product_ai_data').upsert({
            barcode:                product.barcode,
            animal_content_flag:    finalPayload.aiData.animalContentFlag,
            animal_content_details: finalPayload.aiData.animalContentDetails,
            harmful_chemicals:      finalPayload.aiData.harmfulChemicals,
            ai_score:               finalPayload.aiData.aiScore,
            ai_recommendation:      finalPayload.aiData.aiRecommendation,
            gemini_model:           geminiModel,
            status:                 'done',
            analyzed_at:            new Date().toISOString(),
          }, { onConflict: 'barcode' });

          if (error) {
            logError('AnalysisService Cache Write', error, { barcode: product.barcode });
            // Bug Fix: Added .catch(()=>{}) to prevent unhandled rejection
            // if Supabase is simultaneously down while we're clearing the lock.
            if (lockAcquired) await setAIProcessingStatus(product.barcode, 'failed').catch(() => {});
          } else {
            console.log(`🔬 [AnalysisService] Step 5/5 → ✅ AI result cached for "${product.barcode}"`);
          }
        } catch (cacheErr) {
          logError('AnalysisService Unexpected Cache Error', cacheErr, { barcode: product.barcode });
          if (lockAcquired) await setAIProcessingStatus(product.barcode, 'failed').catch(() => {});
        }
      })();
    }

    console.log(`🔬 [AnalysisService] END — Full AI analysis complete ✅\n`);
    return finalPayload;

  } catch (error) {
    logError('AnalysisService AI Call Failed', error, { barcode: product.barcode });
    return { ...finalPayload, error: error.message };
  }
}

/**
 * Analyze a single ingredient in detail (called when user taps an ingredient chip).
 * Cache-first: checks Supabase before calling Gemini.
 * Saves result back to Supabase using upsert so the write always succeeds.
 */
export async function analyzeIngredientDetail(ingredientName, apiKeys = null, model = null) {
  console.log(`\n🧪 [IngredientDetail] START — Deep analysis for "${ingredientName}"`);

  // Bug Fix: Replaced CommonJS require() — mixing require() inside an ES module
  // can silently fail or cause bundler warnings in Metro. Use top-level ES imports instead.
  // getDeepIngredientKnowledge and updateDeepIngredientKnowledge are now imported at the top.
  const cachedInsight = await getDeepIngredientKnowledge(ingredientName);

  if (cachedInsight) {
    console.log(`🧪 [IngredientDetail] ✅ CACHE HIT — Found for "${ingredientName}" (0 API calls)`);
    return cachedInsight;
  }

  if (!gemini.isGeminiConfigured(apiKeys)) {
    console.warn(`🧪 [IngredientDetail] ⚠️ No Gemini API key — cannot analyze "${ingredientName}"`);
    return null;
  }

  try {
    console.log(`🧪 [IngredientDetail] CACHE MISS — Calling Gemini for "${ingredientName}"...`);
    const startTime = Date.now();
    const aiData    = await gemini.analyzeIngredient(ingredientName, apiKeys, model);
    const elapsed   = Date.now() - startTime;
    console.log(`🧪 [IngredientDetail] ✅ Gemini responded in ${elapsed}ms for "${ingredientName}"`);

    // FIXED (Bug #5): was .then() — now await inside an async IIFE for proper error capture
    if (aiData) {
      (async () => {
        try {
          const ok = await updateDeepIngredientKnowledge(ingredientName, aiData);
          if (ok) console.log(`🧪 [IngredientDetail] 💾 Saved AI knowledge for "${ingredientName}"`);
          else    console.warn(`🧪 [IngredientDetail] ⚠️ Failed to cache knowledge for "${ingredientName}"`);
        } catch (e) {
          console.error(`🧪 [IngredientDetail] ❌ Cache write error for "${ingredientName}": ${e.message}`);
        }
      })();
    }

    return aiData;
  } catch (e) {
    console.error(`🧪 [IngredientDetail] ❌ AI call FAILED for "${ingredientName}": ${e.message}`);
    return null;
  }
}
