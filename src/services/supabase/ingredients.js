// Ffads — Supabase Ingredients Knowledge

import { getClient } from './client';

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
