// Ffads — Analysis Service (Phase 2: Single AI Call Architecture)
// UI → analysis.service → gemini (1 call max) / local math
// 
// API BUDGET PER PRODUCT:
//   Product Open:  0 calls (local math only)
//   Analyze Tap:   1 call  (runDeepAnalysis — chemicals + animal + score)
//   Ingredient Tap: 0-1 calls (cached after first)

import * as gemini from './gemini';
import { getSupabaseClient } from './supabase';
import { calculateMacroScore } from '../utils/thresholds';

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

  let finalPayload = {
    localData: null,
    aiData: null,
    aiPowered: false,
    cached: false
  };

  // ── 1. Local Processing (Always runs, zero AI) ──
  finalPayload.localData = calculateMacroScore(product.nutrition);

  // ── SAFETY CHECK: Abort AI if no ingredients ──
  if (!product.ingredients || product.ingredients.length === 0) {
    console.log('[AnalysisService] No ingredients found — skipping AI entirely.');
    return { ...finalPayload, error: 'No ingredients available for AI analysis.' };
  }

  // If Gemini is off or missing keys, return local only
  if (!gemini.isGeminiConfigured(options.geminiApiKey)) {
    return finalPayload;
  }

  // ── 2. Check Global AI Cache ──
  const supabase = getSupabaseClient();
  if (supabase && product.barcode) {
    try {
      onProgress?.({ step: 1, total: 2, label: 'Checking database...' });
      const { data, error } = await supabase
        .from('product_ai_data')
        .select('*')
        .eq('barcode', product.barcode)
        .single();
        
      if (!error && data && data.ai_score !== null) {
        console.log(`[AnalysisService] Cache HIT for ${product.barcode} (0 API calls)`);
        finalPayload.aiData = {
          animalContentFlag: data.animal_content_flag,
          animalContentDetails: data.animal_content_details,
          harmfulChemicals: data.harmful_chemicals || [],
          aiScore: data.ai_score,
          aiRecommendation: data.ai_recommendation
        };
        finalPayload.aiPowered = true;
        finalPayload.cached = true;
        return finalPayload;
      }
    } catch (err) {
      console.warn('[AnalysisService] Cache check failed:', err.message);
    }
  }

  // ── 3. Deliberate 2-second UX delay ──
  onProgress?.({ step: 1, total: 2, label: 'Preparing deep analysis...' });
  await new Promise(resolve => setTimeout(resolve, 2000));

  // ── 4. Single Gemini Call ──
  try {
    onProgress?.({ step: 2, total: 2, label: 'Running AI analysis...' });
    console.log(`[AnalysisService] Executing SINGLE runDeepAnalysis for ${product.barcode}`);
    
    const result = await gemini.runDeepAnalysis(product, options.geminiApiKey, geminiModel);

    finalPayload.aiData = {
      animalContentFlag: result?.animalContentFlag ?? false,
      animalContentDetails: result?.animalContentDetails ?? null,
      harmfulChemicals: result?.harmfulChemicals ?? [],
      aiScore: result?.aiScore ?? null,
      aiRecommendation: result?.aiRecommendation ?? null
    };
    finalPayload.aiPowered = true;

    // ── 5. Cache to Supabase (fire & forget) ──
    if (product.barcode && supabase && result) {
      supabase.from('product_ai_data').upsert({
        barcode: product.barcode,
        animal_content_flag: result.animalContentFlag ?? false,
        animal_content_details: result.animalContentDetails ?? null,
        harmful_chemicals: result.harmfulChemicals ?? [],
        ai_score: result.aiScore,
        ai_recommendation: result.aiRecommendation,
        gemini_model: geminiModel,
      }, { onConflict: 'barcode' }).then(({ error }) => {
        if (error) console.warn('[AnalysisService] Supabase cache push failed:', error.message);
        else console.log(`[AnalysisService] Cached AI result for ${product.barcode}`);
      });
    }

    return finalPayload;
  } catch (error) {
    console.warn('[AnalysisService] AI call failed:', error.message);
    return { ...finalPayload, error: error.message };
  }
}

/**
 * Analyze a single ingredient — called when user taps on an ingredient chip.
 * Returns detailed AI analysis for that specific ingredient.
 * Falls back to local dictionary data if no API key.
 */
export async function analyzeIngredientDetail(ingredientName, apiKeys = null, model = null) {
  // 1. Check Global Supabase Cache
  const { getDeepIngredientKnowledge, updateDeepIngredientKnowledge } = require('./supabase');
  const cachedInsight = await getDeepIngredientKnowledge(ingredientName);
  
  if (cachedInsight) {
    console.log(`[DeepCache] Found rich AI knowledge for "${ingredientName}" in Supabase. (0 API Calls)`);
    return cachedInsight;
  }

  // 2. Fallback to Gemini AI if not configured/found
  if (!gemini.isGeminiConfigured(apiKeys)) {
    return null;
  }
  
  try {
    console.log(`[DeepCache] Missing rich AI knowledge for "${ingredientName}". Calling Gemini...`);
    const aiData = await gemini.analyzeIngredient(ingredientName, apiKeys, model);
    
    // 3. Save the result back to Supabase so we never call Gemini for this again
    if (aiData) {
      updateDeepIngredientKnowledge(ingredientName, aiData).then(success => {
        if (success) console.log(`[DeepCache] Saved rich AI knowledge for "${ingredientName}" to Supabase.`);
      });
    }
    
    return aiData;
  } catch (e) {
    console.warn('[AnalysisService] Ingredient detail AI failed:', e.message);
    return null;
  }
}
