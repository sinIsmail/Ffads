// Ffads — Supabase Ingredients Knowledge (Production v2)
// FIXED (Bug #3): updateDeepIngredientKnowledge now uses UPSERT instead of UPDATE
// so writing deep data for a new ingredient (not yet in the table) always succeeds.

import { getClient } from './client';

/**
 * Get deep Gemini-generated knowledge for one ingredient.
 * Returns null if the ingredient has never been deep-analyzed.
 */
export async function getDeepIngredientKnowledge(name) {
  const client = getClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from('ingredients_knowledge')
      .select('what_is_it, purpose, risk_explanation, is_natural, is_ultra_processed, safer_alternatives, detailed_analyzed_at')
      .eq('name', name.toLowerCase().trim())
      .single();

    // Only return data if a deep analysis has already been performed
    if (error || !data || !data.detailed_analyzed_at) return null;

    return {
      whatIsIt:         data.what_is_it,
      purpose:          data.purpose,
      riskExplanation:  data.risk_explanation,
      isNatural:        data.is_natural,
      isUltraProcessed: data.is_ultra_processed,
      saferAlternatives: data.safer_alternatives || [],
      fromCache:        true,
    };
  } catch {
    return null;
  }
}

/**
 * Write or update deep Gemini knowledge for an ingredient.
 *
 * FIXED (Bug #3): Changed from .update() to .upsert() with onConflict: 'name'.
 *
 * Old behaviour: If the ingredient row didn't exist yet (hadn't been through Phase 1
 * batch evaluation), .update() would match 0 rows and the deep AI data was permanently
 * lost — the user would have to tap the ingredient again on the next app open.
 *
 * New behaviour: .upsert() creates the row if missing, or merges the deep fields if
 * the row already exists. Either way, the data is always persisted.
 */
export async function updateDeepIngredientKnowledge(name, deepData) {
  const client = getClient();
  if (!client) return false;

  try {
    const normalizedName = name.toLowerCase().trim();
    const { error } = await client
      .from('ingredients_knowledge')
      .upsert(
        {
          name:                 normalizedName,
          what_is_it:           deepData.whatIsIt         ?? null,
          purpose:              deepData.purpose           ?? null,
          risk_explanation:     deepData.riskExplanation   ?? null,
          is_natural:           deepData.isNatural         ?? null,
          is_ultra_processed:   deepData.isUltraProcessed  ?? null,
          safer_alternatives:   deepData.saferAlternatives ?? [],
          detailed_analyzed_at: new Date().toISOString(),
        },
        { onConflict: 'name' }  // ← The key fix: merge instead of silent no-op
      );

    if (error) {
      console.warn(`🧬 [Supabase:Ingredients] ⚠️ Upsert failed for "${normalizedName}": ${error.message}`);
      return false;
    }

    console.log(`🧬 [Supabase:Ingredients] ✅ Deep knowledge upserted for "${normalizedName}"`);
    return true;
  } catch (e) {
    console.error(`🧬 [Supabase:Ingredients] ❌ Unexpected error for "${name}": ${e.message}`);
    return false;
  }
}
