// Ffads — Analysis Service (Phase 2: Single AI Call Architecture)
// UI → analysis.service → gemini (1 call max) / local math
// 
// API BUDGET PER PRODUCT:
//   Product Open:  0 calls (local math only)
//   Analyze Tap:   1 call  (runDeepAnalysis — chemicals + animal + score)
//   Ingredient Tap: 0-1 calls (cached after first)

import * as gemini from './gemini';
import { getSupabaseClient, saveProduct } from './supabase';
import { calculateMacroScore } from '../utils/thresholds';
import { logError } from './telemetry';

/**
 * MAIN ANALYSIS FLOW
 * 
 * 1. Safety Check — abort if no ingredients
 * 2. Supabase Cache Check — return cached AI if exists
 * 3. Deliberate 2s UX delay
 * 4. Single Gemini Call (runDeepAnalysis)
 * 5. Cache result to Supabase
 */
export async function analyzeProduct(product, options = {}) {
  const {
    geminiModel = null,
    onProgress = null,
  } = options;

  console.log(`\n🔬 ═══════════════════════════════════════════`);
  console.log(`🔬 [AnalysisService] START — analyzeProduct("${product.barcode}")`);
  console.log(`🔬 ═══════════════════════════════════════════`);

  let finalPayload = {
    localData: null,
    aiData: null,
    aiPowered: false,
    cached: false
  };

  // ── 1. Local Processing (Always runs, zero AI) ──
  finalPayload.localData = calculateMacroScore(product.nutrition);
  console.log(`🔬 [AnalysisService] Step 1/5 → Local macro score calculated:`, finalPayload.localData?.score ?? 'N/A');

  // ── SAFETY CHECK: Abort AI if no ingredients ──
  if (!product.ingredients || product.ingredients.length === 0) {
    console.warn(`🔬 [AnalysisService] ⚠️ ABORT — No ingredients found for "${product.barcode}". Returning local-only result.`);
    return { ...finalPayload, error: 'No ingredients available for AI analysis.' };
  }
  console.log(`🔬 [AnalysisService] Step 1/5 → ${product.ingredients.length} ingredients available for AI`);

  // If Gemini is off or missing keys, return local only with an error so the UI doesn't vanish
  if (!gemini.isGeminiConfigured(options.geminiApiKey)) {
    console.warn(`🔬 [AnalysisService] ⚠️ ABORT — No Gemini API key configured. Returning local-only result.`);
    return { ...finalPayload, error: 'AI Analysis requires a Gemini API Key. Please add your key in the Profile screen.' };
  }

  // ── 2. Check Global AI Cache ──
  const supabase = getSupabaseClient();
  if (supabase && product.barcode) {
    try {
      onProgress?.({ step: 1, total: 2, label: 'Checking database...' });
      console.log(`🔬 [AnalysisService] Step 2/5 → Checking Supabase AI cache for "${product.barcode}"...`);
      const { data, error } = await supabase
        .from('product_ai_data')
        .select('*')
        .eq('barcode', product.barcode)
        .single();
        
      if (!error && data && data.ai_score !== null) {
        console.log(`🔬 [AnalysisService] Step 2/5 → ✅ CACHE HIT! Score=${data.ai_score} for "${product.barcode}" (0 API calls used)`);
        finalPayload.aiData = {
          animalContentFlag: data.animal_content_flag,
          animalContentDetails: data.animal_content_details,
          harmfulChemicals: data.harmful_chemicals || [],
          aiScore: data.ai_score,
          aiRecommendation: data.ai_recommendation
        };
        finalPayload.aiPowered = true;
        finalPayload.cached = true;
        console.log(`🔬 [AnalysisService] END — Returning cached AI result ✅\n`);
        return finalPayload;
      } else {
        console.log(`🔬 [AnalysisService] Step 2/5 → CACHE MISS — No AI data found, proceeding to Gemini`);
      }
    } catch (err) {
      console.warn(`🔬 [AnalysisService] Step 2/5 → ⚠️ Cache check failed: ${err.message}`);
    }
  }

  // ── 3. Deliberate 2-second UX delay ──
  onProgress?.({ step: 1, total: 2, label: 'Preparing deep analysis...' });
  console.log(`🔬 [AnalysisService] Step 3/5 → 2s UX delay (building anticipation)...`);
  await new Promise(resolve => setTimeout(resolve, 2000));

  // ── 4. Single Gemini Call ──
  try {
    onProgress?.({ step: 2, total: 2, label: 'Running AI analysis...' });
    console.log(`🔬 [AnalysisService] Step 4/5 → 🤖 Calling Gemini runDeepAnalysis for "${product.barcode}" (model: ${geminiModel || 'default'})...`);
    const startTime = Date.now();
    
    const result = await gemini.runDeepAnalysis(product, options.geminiApiKey, geminiModel);
    const elapsed = Date.now() - startTime;

    let dataObj = result;
    if (Array.isArray(result) && result.length > 0) {
      dataObj = result[0];
    } else if (result?.analysis) {
      dataObj = result.analysis;
    }

    const aiScoreVal = dataObj?.aiScore ?? dataObj?.ai_score ?? dataObj?.score ?? null;
    console.log(`🔬 [AnalysisService] Step 4/5 → Gemini responded in ${elapsed}ms — raw score: ${aiScoreVal}`);
    
    // If we STILL can't find a score, the AI hallucinated the JSON structure completely.
    if (aiScoreVal === null || aiScoreVal === undefined) {
      console.error(`🔬 [AnalysisService] ❌ Gemini returned malformed response — no score found in response keys: [${Object.keys(dataObj || {}).join(', ')}]`);
      throw new Error("The AI returned a malformed response. Please tap evaluate again to retry.");
    }

    finalPayload.aiData = {
      animalContentFlag: dataObj?.animalContentFlag ?? dataObj?.animal_content_flag ?? false,
      animalContentDetails: dataObj?.animalContentDetails ?? dataObj?.animal_content_details ?? null,
      harmfulChemicals: dataObj?.harmfulChemicals ?? dataObj?.harmful_chemicals ?? [],
      aiScore: aiScoreVal,
      aiRecommendation: dataObj?.aiRecommendation ?? dataObj?.ai_recommendation ?? null
    };
    finalPayload.aiPowered = true;
    console.log(`🔬 [AnalysisService] Step 4/5 → ✅ AI Result: score=${aiScoreVal}, animal=${finalPayload.aiData.animalContentFlag}, chemicals=${finalPayload.aiData.harmfulChemicals?.length || 0}`);

    // ── 5. Cache to Supabase (fire & forget async IIFE) ──
    // Bug #5 fix: was a nested .then().then() chain — inner errors were silently lost
    // and a failed saveProduct would skip the upsert entirely, causing repeat Gemini calls.
    if (product.barcode && supabase && result) {
      (async () => {
        try {
          console.log(`🔬 [AnalysisService] Step 5/5 → 💾 Ensuring product exists in Supabase for FK constraint...`);
          // saveProduct must succeed first — product_ai_data.barcode FK references products.barcode
          const saved = await saveProduct(product);
          if (!saved?.success) {
            console.warn(`🔬 [AnalysisService] Step 5/5 → ⚠️ saveProduct failed (${saved?.error}), skipping AI cache write`);
            return;
          }

          console.log(`🔬 [AnalysisService] Step 5/5 → 💾 Upserting AI result to product_ai_data for "${product.barcode}"...`);
          const { error } = await supabase.from('product_ai_data').upsert({
            barcode: product.barcode,
            animal_content_flag: finalPayload.aiData.animalContentFlag,
            animal_content_details: finalPayload.aiData.animalContentDetails,
            harmful_chemicals: finalPayload.aiData.harmfulChemicals,
            ai_score: finalPayload.aiData.aiScore,
            ai_recommendation: finalPayload.aiData.aiRecommendation,
            gemini_model: geminiModel,
          }, { onConflict: 'barcode' });

          if (error) {
            logError('AnalysisService Cache Write', error, { barcode: product.barcode });
          } else {
            console.log(`🔬 [AnalysisService] Step 5/5 → ✅ AI result cached to Supabase for "${product.barcode}"`);
          }
        } catch (cacheErr) {
          logError('AnalysisService Unexpected Cache Error', cacheErr, { barcode: product.barcode });
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
 * Analyze a single ingredient — called when user taps on an ingredient chip.
 * Returns detailed AI analysis for that specific ingredient.
 * Falls back to local dictionary data if no API key.
 */
export async function analyzeIngredientDetail(ingredientName, apiKeys = null, model = null) {
  console.log(`\n🧪 [IngredientDetail] START — Deep analysis for "${ingredientName}"`);

  // 1. Check Global Supabase Cache
  const { getDeepIngredientKnowledge, updateDeepIngredientKnowledge } = require('./supabase');
  const cachedInsight = await getDeepIngredientKnowledge(ingredientName);
  
  if (cachedInsight) {
    console.log(`🧪 [IngredientDetail] ✅ CACHE HIT — Found existing AI knowledge for "${ingredientName}" (0 API calls)`);
    return cachedInsight;
  }

  // 2. Fallback to Gemini AI if not configured/found
  if (!gemini.isGeminiConfigured(apiKeys)) {
    console.warn(`🧪 [IngredientDetail] ⚠️ No Gemini API key — cannot analyze "${ingredientName}"`);
    return null;
  }
  
  try {
    console.log(`🧪 [IngredientDetail] CACHE MISS — Calling Gemini for "${ingredientName}"...`);
    const startTime = Date.now();
    const aiData = await gemini.analyzeIngredient(ingredientName, apiKeys, model);
    const elapsed = Date.now() - startTime;
    console.log(`🧪 [IngredientDetail] ✅ Gemini responded in ${elapsed}ms for "${ingredientName}"`);
    
    // 3. Save the result back to Supabase so we never call Gemini for this again
    if (aiData) {
      updateDeepIngredientKnowledge(ingredientName, aiData).then(success => {
        if (success) console.log(`🧪 [IngredientDetail] 💾 Saved AI knowledge for "${ingredientName}" to Supabase cache`);
        else console.warn(`🧪 [IngredientDetail] ⚠️ Failed to cache AI knowledge for "${ingredientName}"`);
      });
    }
    
    return aiData;
  } catch (e) {
    console.error(`🧪 [IngredientDetail] ❌ AI call FAILED for "${ingredientName}": ${e.message}`);
    return null;
  }
}
