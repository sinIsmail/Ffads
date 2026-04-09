import { getSupabaseClient } from './supabase';
import { evaluateIngredientsForCache } from './gemini';
import { lookupIngredient } from '../utils/ingredientDictionary';

// ── Batch limits ───────────────────────────────────────────────────────────────
// Prevent truncated JSON (Gemini output budget) and rate-limit spikes.
const MAX_BATCH_SIZE  = 15;   // Process up to 15 ingredients in a single prompt
const MAX_TOTAL_EVAL  = 30;   // Maximum total ingredients to evaluate in one go
const BATCH_DELAY_MS  = 1500; // 1.5 seconds between batches to avoid 429s

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Derive a UI color from stored numeric scores.
 * This is the SINGLE source of truth for ingredient color — no Gemini needed.
 *
 * @param {number} healthRiskScore  1–10  (1=safe, 10=toxic)
 * @param {number} processingLevel  1–4   (NOVA: 1=unprocessed, 4=ultra-processed)
 */
export function computeIngredientColor(healthRiskScore = 5, processingLevel = 3) {
  if (healthRiskScore >= 7 || processingLevel >= 4) return 'red';
  if (healthRiskScore >= 4 || processingLevel >= 3) return 'yellow';
  return 'green';
}

/**
 * Fetches ingredient evaluations using a 3-tier priority chain:
 *   Tier 1 — Local dictionary  (instant, zero network)
 *   Tier 2 — Supabase cache    (fast, zero Gemini)
 *   Tier 3 — Gemini AI batch   (only for truly unknown, capped)
 *
 * Color is ALWAYS computed by formula from health_risk_score — never stored in DB.
 *
 * @param {string[]} ingredientNames
 * @param {string[]|string} apiKeys
 * @returns {Promise<Array>}
 */
export async function getAndEvaluateIngredients(ingredientNames, apiKeys = null) {
  if (!ingredientNames || ingredientNames.length === 0) return [];

  // 1. Clean inputs
  const cleanedNames = ingredientNames
    .map(n => n.toLowerCase().trim())
    .filter(n => n.length > 0);

  if (cleanedNames.length === 0) return [];

  // ── Tier 1: Local dictionary ────────────────────────────────────────────────
  // Known ingredients (sugar, palm oil, etc.) are colored immediately with no network.
  const results        = [];
  const needsNetwork   = [];

  for (const name of cleanedNames) {
    const local = lookupIngredient(name);
    if (!local.unknown) {
      // Convert dictionary entry to the unified schema used by the UI
      results.push({
        name,
        color:              local.color,
        health_risk_score:  local.color === 'red' ? 8 : local.color === 'yellow' ? 5 : 2,
        processing_level:   local.flags?.includes('ultra-processed') ? 4 : 2,
        is_vegan:           !local.flags?.includes('animal-derived'),
        ai_justification:   local.definition || '',
        fromDictionary:     true,
      });
    } else {
      needsNetwork.push(name);
    }
  }

  if (needsNetwork.length === 0) return results;

  // ── Tier 2: Supabase cache ─────────────────────────────────────────────────
  const supabase = getSupabaseClient();
  let cachedIngredients = [];
  let stillMissing      = needsNetwork;

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('ingredients_knowledge')
        .select('name, health_risk_score, processing_level, is_vegan, ai_justification')
        .in('name', needsNetwork);

      if (error) {
        console.warn('[Cache] Supabase fetch error:', error.message);
      } else if (data?.length > 0) {
        // Compute color from stored scores — color is NOT a DB column
        cachedIngredients = data.map(ing => ({
          ...ing,
          color: computeIngredientColor(ing.health_risk_score, ing.processing_level),
        }));
        const cachedNames = cachedIngredients.map(i => i.name);
        stillMissing = needsNetwork.filter(n => !cachedNames.includes(n));
      }
    } catch (e) {
      console.warn('[Cache] Network error connecting to Supabase:', e.message);
    }
  }

  // ── Tier 3: Gemini AI batch ─────────────────────────────────────────────────
  let newlyEvaluated = [];

  if (stillMissing.length > 0) {
    // Apply total cap
    if (stillMissing.length > MAX_TOTAL_EVAL) {
      console.warn(`[Cache] Capping AI at ${MAX_TOTAL_EVAL}/${stillMissing.length} unknowns.`);
      stillMissing = stillMissing.slice(0, MAX_TOTAL_EVAL);
    }

    const chunks = [];
    for (let i = 0; i < stillMissing.length; i += MAX_BATCH_SIZE) {
      chunks.push(stillMissing.slice(i, i + MAX_BATCH_SIZE));
    }

    console.log(
      `[Cache] AI Fallback: ${stillMissing.length} unknowns → ${chunks.length} batch(es)`
    );

    for (let ci = 0; ci < chunks.length; ci++) {
      if (ci > 0) await delay(BATCH_DELAY_MS);

      const chunk = chunks[ci];
      console.log(`[Cache] Batch ${ci + 1}/${chunks.length}: evaluating [${chunk.join(', ')}]`);

      try {
        const raw = await evaluateIngredientsForCache(chunk, apiKeys);
        const batchResult = Array.isArray(raw) ? raw : [];

        // Add color via formula — DO NOT include color when saving to DB
        const colorized = batchResult.map(ing => ({
          ...ing,
          color: computeIngredientColor(ing.health_risk_score, ing.processing_level),
        }));

        newlyEvaluated = [...newlyEvaluated, ...colorized];

        // Persist to Supabase — strip the computed `color` field (not a DB column)
        if (supabase && colorized.length > 0) {
          const toInsert = colorized.map(({ color, fromDictionary, ...dbFields }) => dbFields);
          supabase
            .from('ingredients_knowledge')
            .insert(toInsert)
            .then(({ error }) => {
              if (error) console.warn(`[Cache] Batch ${ci + 1} save error:`, error.message);
              else console.log(`[Cache] Cached ${toInsert.length} ingredients (batch ${ci + 1}).`);
            });
        }
      } catch (e) {
        console.error(`[Cache] Batch ${ci + 1} AI Fallback Failed:`, e.message);
        // Yellow defaults for this chunk only
        const fallback = chunk.map(name => ({
          name,
          health_risk_score:  5,
          processing_level:   3,
          is_vegan:           true,
          ai_justification:   'Evaluation failed — defaulting to moderate risk.',
          color:              'yellow',
        }));
        newlyEvaluated = [...newlyEvaluated, ...fallback];
      }
    }
  }

  // Merge all tiers
  return [...results, ...cachedIngredients, ...newlyEvaluated];
}
