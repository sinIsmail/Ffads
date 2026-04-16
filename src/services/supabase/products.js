// Ffads — Supabase Products (CRUD for products + AI data)
// Production v2 — Fixed saveProductAIData columns + AI concurrency lock

import { getClient } from './client';

// ─── Products ─────────────────────────────────────────────────────────────────

export async function saveProduct(product) {
  const client = getClient();
  if (!client) {
    console.warn(`💾 [Supabase:Products] ⚠️ Client not configured — skipping save for "${product.barcode}"`);
    return { success: false, offline: true };
  }

  try {
    console.log(`💾 [Supabase:Products] WRITE → Upserting product "${product.name}" (${product.barcode})...`);
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
    console.log(`💾 [Supabase:Products] ✅ Product saved: "${product.name}" (${product.barcode})`);
    return { success: true, data };
  } catch (error) {
    console.error(`💾 [Supabase:Products] ❌ WRITE FAILED for "${product.barcode}": ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Save AI analysis result for a product.
 * 
 * FIXED (Bug #1): Previous version wrote wrong columns (classification, ai_insight).
 * Now writes correct schema columns: animal_content_flag, harmful_chemicals, ai_score, etc.
 */
export async function saveProductAIData(barcode, aiData, model, mode) {
  const client = getClient();
  if (!client) {
    console.warn(`💾 [Supabase:AI] ⚠️ Client not configured — skipping AI data save for "${barcode}"`);
    return { success: false, offline: true };
  }

  try {
    console.log(`💾 [Supabase:AI] WRITE → Saving AI result for "${barcode}" (model: ${model}, mode: ${mode})...`);
    const { error } = await client
      .from('product_ai_data')
      .upsert({
        barcode,
        animal_content_flag:    aiData.animalContentFlag    ?? false,
        animal_content_details: aiData.animalContentDetails ?? null,
        harmful_chemicals:      aiData.harmfulChemicals     ?? [],
        ai_score:               aiData.aiScore              ?? null,
        ai_recommendation:      aiData.aiRecommendation     ?? null,
        gemini_model:           model                       ?? null,
        analysis_mode:          mode                        ?? null,
        status:                 'done',
        analyzed_at:            new Date().toISOString(),
      }, { onConflict: 'barcode' });

    if (error) throw error;
    console.log(`💾 [Supabase:AI] ✅ AI data cached correctly for "${barcode}"`);
    return { success: true };
  } catch (error) {
    console.error(`💾 [Supabase:AI] ❌ WRITE FAILED for "${barcode}": ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Set the AI analysis status for a product barcode.
 * Used as a concurrency lock to prevent 50 simultaneous Gemini calls for the same product.
 * 
 * @param {string} barcode
 * @param {'processing'|'done'|'failed'} status
 */
export async function setAIProcessingStatus(barcode, status) {
  const client = getClient();
  if (!client) return false;

  try {
    const { error } = await client
      .from('product_ai_data')
      .upsert({ barcode, status }, { onConflict: 'barcode' });

    if (error) {
      console.warn(`💾 [Supabase:AI] ⚠️ Failed to set status="${status}" for "${barcode}": ${error.message}`);
      return false;
    }
    console.log(`💾 [Supabase:AI] 🔒 Status set → "${barcode}" = "${status}"`);
    return true;
  } catch {
    return false;
  }
}

// ─── Read Operations ──────────────────────────────────────────────────────────

export async function getProducts(limit = 100) {
  const client = getClient();
  if (!client) return [];

  try {
    console.log(`💾 [Supabase:Products] READ → Fetching up to ${limit} products...`);
    const { data, error } = await client
      .from('products')
      .select('*')
      .order('scanned_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    console.log(`💾 [Supabase:Products] ✅ Fetched ${data?.length || 0} products`);
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
 * Fetch a complete product: base data + AI insights merged.
 * Also reads harmful_chemicals which was previously missing from the select.
 */
export async function getCompleteProduct(barcode) {
  const client = getClient();
  if (!client) return null;

  try {
    const baseProduct = await getProductByBarcode(barcode);
    if (!baseProduct) return null;

    const { data: aiData, error: aiError } = await client
      .from('product_ai_data')
      .select('animal_content_flag, animal_content_details, harmful_chemicals, ai_score, ai_recommendation, status')
      .eq('barcode', barcode)
      .single();

    // If no AI data, or AI data is still processing, return base product only
    if (aiError || !aiData || aiData.status === 'processing') {
      return baseProduct;
    }

    return {
      ...baseProduct,
      analyzed: true,
      aiData: {
        animalContentFlag:    aiData.animal_content_flag,
        animalContentDetails: aiData.animal_content_details,
        harmfulChemicals:     aiData.harmful_chemicals || [],
        aiScore:              aiData.ai_score,
        aiRecommendation:     aiData.ai_recommendation,
      },
    };
  } catch {
    return null;
  }
}

export async function deleteProduct(barcode) {
  const client = getClient();
  if (!client) return false;

  try {
    console.log(`💾 [Supabase:Products] DELETE → Removing "${barcode}"...`);
    const { error } = await client.from('products').delete().eq('barcode', barcode);
    if (!error) console.log(`💾 [Supabase:Products] ✅ Deleted "${barcode}"`);
    return !error;
  } catch {
    return false;
  }
}

// ─── Internal Helper ──────────────────────────────────────────────────────────

function normalizeProduct(row) {
  return {
    id:             row.id,
    barcode:        row.barcode,
    name:           row.name,
    brand:          row.brand,
    category:       row.category,
    ingredients:    row.ingredients    || [],
    ingredientsRaw: row.ingredients_raw,
    nutrition:      row.nutrition      || {},
    source:         row.source,
    nutriscore:     row.nutriscore,
    novaGroup:      row.nova_group,
    scannedAt:      row.scanned_at,
  };
}
