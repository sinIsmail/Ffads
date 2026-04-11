// Ffads — Supabase Products (CRUD for products + AI data)

import { getClient } from './client';

// ─── Products ────────────────────────────────

export async function saveProduct(product) {
  const client = getClient();
  if (!client) {
    console.warn(`💾 [Supabase:Products] ⚠️ Client not configured — skipping save for "${product.barcode}"`);
    return { success: false, offline: true };
  }

  try {
    console.log(`💾 [Supabase:Products] WRITE → Upserting product "${product.name}" (${product.barcode}) into products table...`);
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

export async function saveProductAIData(barcode, aiData, model, mode) {
  const client = getClient();
  if (!client) {
    console.warn(`💾 [Supabase:AI] ⚠️ Client not configured — skipping AI data save for "${barcode}"`);
    return { success: false, offline: true };
  }

  try {
    console.log(`💾 [Supabase:AI] WRITE → Saving AI analysis result for "${barcode}" (model: ${model}, mode: ${mode})...`);
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
    console.log(`💾 [Supabase:AI] ✅ AI data cached for "${barcode}"`);
    return { success: true };
  } catch (error) {
    console.error(`💾 [Supabase:AI] ❌ WRITE FAILED for "${barcode}": ${error.message}`);
    return { success: false, error: error.message };
  }
}


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
    console.log(`💾 [Supabase:Products] DELETE → Removing "${barcode}" from products table...`);
    const { error } = await client.from('products').delete().eq('barcode', barcode);
    if (!error) console.log(`💾 [Supabase:Products] ✅ Deleted "${barcode}"`);
    return !error;
  } catch {
    return false;
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
