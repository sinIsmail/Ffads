// Ffads — Gemini Ingredient Cache Evaluation (Batch AI fallback)

import { GEMINI_API_BASE, resolveKeys, getModel } from './core';

/**
 * Call 6: AI Fallback for Unknown Ingredients (Batch)
 * Prompts Gemini to act as a toxicologist and evaluate an array of ingredients.
 * Returns a parsed array — safe against Gemini wrapping output in markdown fences.
 */
export async function evaluateIngredientsForCache(ingredientNames, apiKeys = null, model = null) {
  if (!ingredientNames || ingredientNames.length === 0) return [];

  const keys = resolveKeys(apiKeys);
  const selectedModel = model || getModel();

  console.log(`🧬 [Gemini:Cache] Batch evaluation → ${ingredientNames.length} ingredients | model="${selectedModel}" | keys=${keys.length}`);

  const prompt = `You are a strict toxicologist and food scientist.
Evaluate the following list of unknown food ingredients.

Ingredients to evaluate:
${ingredientNames.map(name => `- ${name}`).join('\n')}

Return ONLY a JSON array of objects strictly following this schema for each ingredient:
[
  {
    "name": "lowercase ingredient name exactly as provided",
    "health_risk_score": integer (1-10, where 1 is totally safe/natural, 10 is toxic, carcinogenic, or a highly risky artificial additive),
    "processing_level": integer (1-4, NOVA classification: 1=unprocessed/natural, 2=culinary ingredient, 3=processed, 4=ultra-processed),
    "is_vegan": boolean,
    "ai_justification": "1 concise sentence explaining the risk and processing rating"
  }
]

Rules:
- Give truthful, strict scores based on global health standards.
- Return raw JSON array only. No markdown, no code blocks, no extra text.`;

  let lastError = null;
  for (let attempt = 0; attempt < keys.length; attempt++) {
    const key = keys[attempt];
    if (!key) continue;

    try {
      console.log(`🧬 [Gemini:Cache] Attempt ${attempt + 1}/${keys.length} — key=...${key.slice(-6)}`);
      const startTime = Date.now();

      const url = `${GEMINI_API_BASE}/models/${selectedModel}:generateContent?key=${key}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 4096,  // increased — large batches need more tokens
          },
        }),
      });

      const elapsed = Date.now() - startTime;

      if (response.status === 429 || response.status === 503) {
        const body = await response.text();
        console.warn(`🧬 [Gemini:Cache] ⚠️ Key #${attempt + 1} rate-limited (HTTP ${response.status}) after ${elapsed}ms. Rotating...`);
        lastError = new Error(`Key #${attempt + 1} unavailable (${response.status}).`);
        lastError.isRateLimited = true;
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errText.substring(0, 200)}`);
      }

      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error('Empty response from Gemini');

      // Safe parse — strip markdown fences if present
      const cleaned = rawText.trim()
        .replace(/^```json?\s*/i, '')
        .replace(/```\s*$/, '')
        .trim();

      const parsed = JSON.parse(cleaned);

      if (attempt > 0) {
        console.log(`🧬 [Gemini:Cache] ✅ Key rotation: used key #${attempt + 1} after ${elapsed}ms`);
      } else {
        console.log(`🧬 [Gemini:Cache] ✅ Evaluated ${parsed.length || 0} ingredients in ${elapsed}ms`);
      }
      return Array.isArray(parsed) ? parsed : [];

    } catch (err) {
      if (err.isRateLimited) { lastError = err; continue; }
      console.error(`🧬 [Gemini:Cache] ❌ Key #${attempt + 1} FAILED: ${err.message}`);
      throw err;
    }
  }

  throw lastError || new Error('All Gemini API keys exhausted (rate limited).');
}
