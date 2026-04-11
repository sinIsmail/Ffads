// Ffads — Gemini Analysis (Deep analysis + single ingredient)

import { resolveKeys, callGeminiWithRotation, getModel } from './core';

/**
 * SINGLE OPTIMIZED AI CALL — Deep Analysis
 * 
 * Combines: harmful chemicals check + animal content + AI rating
 * into ONE Gemini prompt. This is the ONLY product-level AI call.
 */
export async function runDeepAnalysis(product, apiKeys = null, model = null) {
  const keys = resolveKeys(apiKeys);
  const ingredientStr = product.ingredients?.join(', ') || 'None provided';
  
  const prompt = `You are an elite food safety analyst combining toxicology, nutrition science, and ingredient forensics. Perform a DEEP analysis of this product in one pass.

Product: ${product.name || 'Unknown'}
Ingredients: ${ingredientStr}
Nutrition per 100g: Sugar ${product.nutrition?.sugar || 0}g, Sodium ${product.nutrition?.sodium || 0}mg, Sat Fat ${product.nutrition?.saturatedFat || 0}g

Return ONLY a JSON object with this EXACT schema:
{
  "harmfulChemicals": [
    {
      "name": "ingredient as listed on pack",
      "realName": "what it actually is (the wolf in sheep clothing name)",
      "risk": "1-sentence explanation of why it is dangerous"
    }
  ],
  "animalContentFlag": boolean,
  "animalContentDetails": "string or null",
  "aiScore": integer 0-100,
  "aiRecommendation": "A punchy 2-sentence final verdict"
}

STRICT RULES:
1. harmfulChemicals: Look for carcinogens, banned additives, ingredients hiding under safe-sounding names. If NONE found return empty array.
2. animalContentFlag: true if ANY ingredient is animal-derived (milk, egg, gelatin, honey, carmine).
3. aiScore: 0=toxic ultra-processed, 100=perfectly healthy whole food. Ultra-processed with additives MUST score below 50.
4. aiRecommendation: Honest, direct. Tell the user whether they should eat this.
5. Return raw JSON only. No markdown.`;

  const { result } = await callGeminiWithRotation(prompt, keys, model || getModel());
  return result;
}


/**
 * Call 5: Analyze a single ingredient in detail (on-demand, when user taps)
 */
export async function analyzeIngredient(ingredientName, apiKeys = null, model = null) {
  const keys = resolveKeys(apiKeys);
  const prompt = `You are a food science expert. Analyze this single food ingredient in detail.

Ingredient: "${ingredientName}"

Return a JSON object with:
{
  "name": "normalized ingredient name",
  "whatIsIt": "1-2 sentence plain-language description of what this ingredient is",
  "purpose": "why it's used in food products (e.g. preservative, emulsifier, flavor)",
  "healthRisk": "low" | "moderate" | "high",
  "riskExplanation": "1-2 sentences about any health concerns",
  "isNatural": true | false,
  "isUltraProcessed": true | false,
  "isAnimalDerived": true | false,
  "commonAllergens": ["list of allergens this may trigger, if any"],
  "dailyLimitMg": number or null (WHO/FDA recommended daily limit if applicable),
  "bannedInCountries": ["list of countries where this is banned, if any"],
  "saferAlternatives": ["1-2 natural alternatives if this is risky"]
}

Rules:
- Be factual and cite WHO/FDA guidelines where relevant
- If the ingredient is generally safe, say so clearly
- Keep explanations concise and consumer-friendly`;

  const { result } = await callGeminiWithRotation(prompt, keys, model || getModel());
  return result;
}
