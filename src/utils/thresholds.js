// Ffads — Threshold & Limits Calculator (Offline First)
import { getSupabaseClient } from '../services/supabase';

// Offline Defaults (WHO / FSSAI Guidelines)
// These values act as a permanent, instant fallback if the user is offline or Supabase fails.
let THRESHOLDS = {
  sugar: { value: 10, unit: 'g', alert_level: 'High' },     // >10g per 100g
  sodium: { value: 400, unit: 'mg', alert_level: 'High' },    // >400mg per 100g
  satFat: { value: 5, unit: 'g', alert_level: 'High' },       // >5g per 100g
};

let loadedFromDB = false;

/**
 * Fetch the latest threshold limits from Supabase to overwrite local defaults.
 * This runs silently in the background on app launch.
 */
export async function syncThresholds() {
  const client = getSupabaseClient();
  if (!client) return;

  try {
    const { data, error } = await client.from('threshold_limits').select('*');
    if (!error && data && data.length > 0) {
      data.forEach((row) => {
        if (THRESHOLDS[row.key]) {
          THRESHOLDS[row.key] = {
            value: Number(row.value),
            unit: row.unit,
            source: row.source,
          };
        }
      });
      loadedFromDB = true;
      console.log('[Thresholds] Synced latest WHO/FSSAI macro limits from cloud.');
    }
  } catch (e) {
    console.warn('[Thresholds] Failed to sync limits, relying on offline defaults.', e.message);
  }
}

/**
 * Calculate Macro Score and return breaches based on simple local math, 0 API calls.
 * Gracefully handles missing or malformed nutrition data.
 * 
 * @param {Object} nutrition - The nutrition block from the product (per 100g)
 * @returns {Object} { breaches: Array, score: Number, missingData: Boolean }
 */
export function calculateMacroScore(nutrition) {
  const breaches = [];
  let score = 10; // Start at perfect 10
  let missingData = false;

  if (!nutrition || Object.keys(nutrition).length === 0) {
    return { breaches: [], score: null, missingData: true };
  }

  // Helper safely extract numbers
  const parseNum = (val) => {
    if (val === undefined || val === null) return null;
    const num = Number(String(val).replace(/[^0-9.]/g, ''));
    return isNaN(num) ? null : num;
  };

  const sugar = parseNum(nutrition.sugar || nutrition.sugars);
  const sodium = parseNum(nutrition.sodium);
  const satFat = parseNum(nutrition.saturatedFat || nutrition['saturated-fat']);

  if (sugar === null && sodium === null && satFat === null) {
    missingData = true; // completely un-parseable
  }

  // Check Sugar
  if (sugar !== null && sugar > THRESHOLDS.sugar.value) {
    breaches.push({
      type: 'Sugar',
      value: sugar,
      unit: THRESHOLDS.sugar.unit,
      limit: THRESHOLDS.sugar.value,
      message: `Exceeds limit (${sugar}g > ${THRESHOLDS.sugar.value}g)`,
      source: THRESHOLDS.sugar.source || 'WHO'
    });
    score -= 3;
  }

  // Check Sodium
  if (sodium !== null && sodium > THRESHOLDS.sodium.value) {
    breaches.push({
      type: 'Sodium',
      value: sodium,
      unit: THRESHOLDS.sodium.unit,
      limit: THRESHOLDS.sodium.value,
      message: `Exceeds limit (${sodium}mg > ${THRESHOLDS.sodium.value}mg)`,
      source: THRESHOLDS.sodium.source || 'WHO'
    });
    score -= 3;
  }

  // Check Saturated Fat
  if (satFat !== null && satFat > THRESHOLDS.satFat.value) {
    breaches.push({
      type: 'Saturated Fat',
      value: satFat,
      unit: THRESHOLDS.satFat.unit,
      limit: THRESHOLDS.satFat.value,
      message: `Exceeds limit (${satFat}g > ${THRESHOLDS.satFat.value}g)`,
      source: THRESHOLDS.satFat.source || 'WHO'
    });
    score -= 2;
  }

  // Floor score at 0
  score = Math.max(0, score);

  return { breaches, score, missingData };
}

export function getThresholds() {
  return THRESHOLDS;
}
