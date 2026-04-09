// Ffads — Supabase Client Layer
// This is the LOW-LEVEL data layer. Screens should NOT call this directly.
// Use product.service.js and analysis.service.js instead.

import { createClient } from '@supabase/supabase-js';

let supabase = null;
let currentUrl = null;
let currentKey = null;

export function setSupabaseCredentials(url, key) {
  if (url && key) {
    if (url !== currentUrl || key !== currentKey) {
      currentUrl = url;
      currentKey = key;
      supabase = createClient(url, key);
    }
  } else {
    // Revert to env vars
    currentUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || null;
    currentKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || null;
    if (currentUrl && currentKey) {
      supabase = createClient(currentUrl, currentKey);
    } else {
      supabase = null;
    }
  }
}

function getClient() {
  if (!supabase) {
    setSupabaseCredentials(); // Try init with env vars
  }
  return supabase;
}

/**
 * Expose client for feature services (analysis.service, etc.)
 */
export function getSupabaseClient() {
  return getClient();
}

/**
 * Check if Supabase is configured
 */
export function isConfigured() {
  return getClient() !== null;
}

/**
 * Ping Supabase to verify real connectivity.
 * Makes a lightweight query and measures latency.
 * @returns {Promise<{ connected: boolean, message: string, latencyMs?: number }>}
 */
export async function pingSupabase() {
  const client = getClient();
  if (!client) {
    return { connected: false, message: 'Supabase URL or Anon Key not configured in .env' };
  }

  try {
    const start = Date.now();
    // A minimal query — just count 1 row from any table to test connectivity
    const { data, error } = await client
      .from('products')
      .select('barcode', { count: 'exact', head: true })
      .limit(1);

    const latencyMs = Date.now() - start;

    if (error) {
      // Table might not exist yet but connection works
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        return { connected: true, message: `Connected (${latencyMs}ms) — table not created yet`, latencyMs };
      }
      return { connected: false, message: `DB error: ${error.message}` };
    }

    return { connected: true, message: `Connected — ${latencyMs}ms ping`, latencyMs };
  } catch (err) {
    return { connected: false, message: `Network error: ${err.message}` };
  }
}

// ─── Products ────────────────────────────────

export async function saveProduct(product) {
  const client = getClient();
  if (!client) return { success: false, offline: true };

  try {
    const { data, error } = await client
      .from('products')
      .upsert({
        barcode: product.barcode,
        name: product.name,
        brand: product.brand,
        category: product.category,
        ingredients: product.ingredients,
        ingredients_raw: product.ingredientsRaw,
        nutrition: product.nutrition,
        source: product.source,
        nutriscore: product.nutriscore,
        nova_group: product.novaGroup,
        scanned_at: product.scannedAt,
      }, { onConflict: 'barcode' })
      .select();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function saveProductAIData(barcode, aiData, model, mode) {
  const client = getClient();
  if (!client) return { success: false, offline: true };

  try {
    const { data, error } = await client
      .from('product_ai_data')
      .upsert({
        barcode: barcode,
        classification: aiData.classification,
        ai_insight: aiData.aiInsight,
        gemini_model: model,
        analysis_mode: mode,
      }, { onConflict: 'barcode' });

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.warn('[Supabase] Failed to save AI Data:', error.message);
    return { success: false, error: error.message };
  }
}


export async function getProducts(limit = 100) {
  const client = getClient();
  if (!client) return [];

  try {
    const { data, error } = await client
      .from('products')
      .select('*')
      .order('scanned_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data || []).map(normalizeProduct);
  } catch {
    return [];
  }
}

export async function getProductByBarcode(barcode) {
  const client = getClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from('products')
      .select('*')
      .eq('barcode', barcode)
      .single();

    if (error || !data) return null;
    return normalizeProduct(data);
  } catch {
    return null;
  }
}

/**
 * Fetch a complete product combining basic data (products) and AI insights (product_ai_data)
 */
export async function getCompleteProduct(barcode) {
  const client = getClient();
  if (!client) return null;
  
  try {
    const baseProduct = await getProductByBarcode(barcode);
    if (!baseProduct) return null;

    const { data: aiData, error: aiError } = await client
      .from('product_ai_data')
      .select('animal_content_flag, animal_content_details, ai_score, ai_recommendation')
      .eq('barcode', barcode)
      .single();

    if (aiError || !aiData) {
      return baseProduct; // Return just the base product if no AI data
    }

    return {
      ...baseProduct,
      analyzed: true,
      aiData: {
        animalContentFlag: aiData.animal_content_flag,
        animalContentDetails: aiData.animal_content_details,
        aiScore: aiData.ai_score,
        aiRecommendation: aiData.ai_recommendation
      }
    };
  } catch (err) {
    return null;
  }
}

export async function deleteProduct(barcode) {
  const client = getClient();
  if (!client) return false;

  try {
    const { error } = await client.from('products').delete().eq('barcode', barcode);
    return !error;
  } catch {
    return false;
  }
}

// ─── Ingredients Knowledge ───────────────────

export async function getDeepIngredientKnowledge(name) {
  const client = getClient();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from('ingredients_knowledge')
      .select('what_is_it, purpose, risk_explanation, is_natural, is_ultra_processed, safer_alternatives, detailed_analyzed_at')
      .eq('name', name.toLowerCase().trim())
      .single();

    if (error || !data || !data.detailed_analyzed_at) return null;
    
    return {
      whatIsIt: data.what_is_it,
      purpose: data.purpose,
      riskExplanation: data.risk_explanation,
      isNatural: data.is_natural,
      isUltraProcessed: data.is_ultra_processed,
      saferAlternatives: data.safer_alternatives || [],
      fromCache: true
    };
  } catch {
    return null;
  }
}

export async function updateDeepIngredientKnowledge(name, deepData) {
  const client = getClient();
  if (!client) return false;
  
  try {
    const { error } = await client
      .from('ingredients_knowledge')
      .update({
        what_is_it: deepData.whatIsIt,
        purpose: deepData.purpose,
        risk_explanation: deepData.riskExplanation,
        is_natural: deepData.isNatural,
        is_ultra_processed: deepData.isUltraProcessed,
        safer_alternatives: deepData.saferAlternatives,
        detailed_analyzed_at: new Date().toISOString()
      })
      .eq('name', name.toLowerCase().trim());
      
    // If the record doesn't exist, this does nothing which is fine (handled by Phase 1 evaluation).
    return !error;
  } catch {
    return false;
  }
}

// ─── User Scans (History) ────────────────────

export async function recordScan(barcode) {
  const client = getClient();
  if (!client) return;

  try {
    await client.from('user_scans').insert({ barcode });
  } catch {}
}

// ─── User Contributions ──────────────────────

export async function logUserContribution(payload) {
  const client = getClient();
  if (!client) return;

  try {
    const { error } = await client.from('user_contributions').insert([{
      barcode: payload.barcode,
      product_name: payload.productName || null,
      raw_ocr_text: payload.rawOcr || null,
      gemini_filtered_data: payload.filteredData || null,
      front_photo_uploaded: !!payload.frontUploaded,
      back_photo_ocrd: !!payload.backOcrd,
      status: 'approved' // auto-approve logic
    }]);
    
    if (error) console.warn('[Supabase] User Contribution Log failed:', error.message);
  } catch (e) {
    console.warn('[Supabase] User Contribution Error:', e.message);
  }
}

// ─── User Profiles ───────────────────────────

export async function saveUserProfile(deviceId, prefs) {
  const client = getClient();
  if (!client) return false;

  try {
    const { error } = await client
      .from('user_profiles')
      .upsert({
        device_id: deviceId,
        allergies: prefs.allergies,
        diet: prefs.diet,
        gemini_model: prefs.geminiModel,
        analysis_mode: prefs.analysisMode,
        health_mode: prefs.healthMode,
        off_enabled: prefs.offEnabled,
        ai_fallback: prefs.aiFallback,
        offline_mode: prefs.offlineMode,
      }, { onConflict: 'device_id' });

    return !error;
  } catch {
    return false;
  }
}

export async function getUserProfile(deviceId) {
  const client = getClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from('user_profiles')
      .select('*')
      .eq('device_id', deviceId)
      .single();

    if (error || !data) return null;
    return {
      allergies: data.allergies || [],
      diet: data.diet,
      geminiModel: data.gemini_model,
      analysisMode: data.analysis_mode,
      healthMode: data.health_mode,
      offEnabled: data.off_enabled,
      aiFallback: data.ai_fallback,
      offlineMode: data.offline_mode,
    };
  } catch {
    return null;
  }
}

// ─── Product Images ──────────────────────────

export async function saveProductImage(barcode, imageType, url) {
  const client = getClient();
  if (!client) return;

  try {
    await client.from('product_images').upsert({
      barcode,
      image_type: imageType,
      url,
    });
  } catch {}
}

export async function getProductImages(barcode) {
  const client = getClient();
  if (!client) return {};

  try {
    const { data } = await client
      .from('product_images')
      .select('*')
      .eq('barcode', barcode);

    const images = {};
    (data || []).forEach((row) => {
      images[row.image_type] = row.url || row.storage_path;
    });
    return images;
  } catch {
    return {};
  }
}

// ─── Helpers ─────────────────────────────────

function normalizeProduct(row) {
  return {
    id: row.id,
    barcode: row.barcode,
    name: row.name,
    brand: row.brand,
    category: row.category,
    ingredients: row.ingredients || [],
    ingredientsRaw: row.ingredients_raw,
    nutrition: row.nutrition || {},
    source: row.source,
    nutriscore: row.nutriscore,
    novaGroup: row.nova_group,
    scannedAt: row.scanned_at,
  };
}
