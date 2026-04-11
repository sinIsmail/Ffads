// Ffads — Supabase Users (Profiles + Product Images)

import { getClient } from './client';

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
