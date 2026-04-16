// Ffads — Supabase Users (Profiles + Product Images) — Production v2
// FIXED (Bug #6): saveProductImage() now uses onConflict: 'barcode, image_type'
// to prevent duplicate rows when the same image type is saved more than once.

import { getClient } from './client';

// ─── User Profiles ────────────────────────────────────────────────────────────

export async function saveUserProfile(deviceId, prefs) {
  const client = getClient();
  if (!client) return false;

  try {
    const { error } = await client
      .from('user_profiles')
      .upsert({
        device_id:     deviceId,
        allergies:     prefs.allergies,
        diet:          prefs.diet,
        gemini_model:  prefs.geminiModel,
        analysis_mode: prefs.analysisMode,
        health_mode:   prefs.healthMode,
        off_enabled:   prefs.offEnabled,
        ai_fallback:   prefs.aiFallback,
        offline_mode:  prefs.offlineMode,
      }, { onConflict: 'device_id' });

    if (error) {
      console.warn(`👤 [Supabase:Users] ⚠️ saveUserProfile failed: ${error.message}`);
      return false;
    }
    return true;
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
      allergies:    data.allergies    || [],
      diet:         data.diet,
      geminiModel:  data.gemini_model,
      analysisMode: data.analysis_mode,
      healthMode:   data.health_mode,
      offEnabled:   data.off_enabled,
      aiFallback:   data.ai_fallback,
      offlineMode:  data.offline_mode,
    };
  } catch {
    return null;
  }
}

// ─── Product Images ───────────────────────────────────────────────────────────

/**
 * Save or update a product image URL.
 *
 * FIXED (Bug #6): Added onConflict: 'barcode, image_type' so calling this
 * function multiple times for the same product+type updates the URL rather
 * than inserting a new duplicate row.
 *
 * Requires a unique constraint in Supabase:
 *   ALTER TABLE product_images ADD CONSTRAINT uq_product_images_barcode_type
 *     UNIQUE (barcode, image_type);
 * (Included in the v2 schema update SQL)
 */
export async function saveProductImage(barcode, imageType, url) {
  const client = getClient();
  if (!client) return;

  try {
    const { error } = await client.from('product_images').upsert(
      { barcode, image_type: imageType, url },
      { onConflict: 'barcode, image_type' }
    );
    if (error) {
      console.warn(`🖼️ [Supabase:Images] ⚠️ saveProductImage failed for "${barcode}/${imageType}": ${error.message}`);
    } else {
      console.log(`🖼️ [Supabase:Images] ✅ Image saved: "${barcode}" (${imageType})`);
    }
  } catch (e) {
    console.error(`🖼️ [Supabase:Images] ❌ Unexpected error: ${e.message}`);
  }
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
