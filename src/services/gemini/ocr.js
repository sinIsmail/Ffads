// Ffads — Gemini OCR (Multimodal product photo extraction)

import { GEMINI_API_BASE, resolveKeys } from './core';

/**
 * Call 5: Multimodal OCR — scans the BACK photos of the product package.
 *
 * Accepts up to 2 photos: ingredients-list photo and nutrition-table photo.
 * Both are sent together in ONE Gemini Vision call for best extraction.
 *
 * @param {{ ingredients: string|null, nutrition: string|null }} backPhotos
 *   base64 strings for each photo (null means photo was not taken)
 * @param {string} apiKey - optional API key override
 * @param {string} model  - optional Gemini model override
 * @returns {Promise<{ name, brand, ingredients, ingredientsRaw, nutrition, rawOCRText }>}
 */
export async function processProductPhotos(backPhotos, apiKeys = null, model = null) {
  const hasIngredients = !!backPhotos?.ingredients;
  const hasNutrition   = !!backPhotos?.nutrition;

  console.log(`\n📸 ═══════════════════════════════════════════`);
  console.log(`📸 [Gemini:OCR] START — processProductPhotos`);
  console.log(`📸 [Gemini:OCR]   └─ ingredients photo: ${hasIngredients ? '✅' : '❌'} | nutrition photo: ${hasIngredients ? '✅' : '❌'}`);
  console.log(`📸 ═══════════════════════════════════════════`);

  if (!hasIngredients && !hasNutrition) {
    console.error(`📸 [Gemini:OCR] ❌ ABORT — No back photos provided`);
    throw new Error('[Gemini OCR] No back photos provided — need at least one of: ingredients, nutrition.');
  }

  // Resolve keys (supports string, string[], or null — always adds .env key as last resort)
  const keys = resolveKeys(apiKeys);
  const selectedModel = (model && model.trim().includes('flash')) ? model.trim() : 'gemini-2.0-flash';
  console.log(`📸 [Gemini:OCR] Step 1 → model="${selectedModel}" | ${keys.length} key(s) available`);

  const photoDescriptions = [
    hasIngredients && 'the INGREDIENTS LIST',
    hasNutrition   && 'the NUTRITION FACTS TABLE',
  ].filter(Boolean).join(' and ');

  const promptText = `You are a world-class food product data extractor.
I have attached ${[hasIngredients, hasNutrition].filter(Boolean).length} photo(s) of the back of a food product package, showing ${photoDescriptions}.

Extract ALL relevant data and return ONLY a valid JSON object with this exact schema:
{
  "name": "Product Name (guess from any visible text if not on these photos)",
  "brand": "Brand Name (guess from any visible text)",
  "ingredientsRaw": "Full raw ingredients text exactly as printed on the pack",
  "ingredients": ["ingredient 1", "ingredient 2", "..."],
  "nutrition": {
    "energy": number (kcal per 100g),
    "protein": number (g per 100g),
    "carbs": number (g per 100g),
    "sugar": number (g per 100g),
    "fat": number (g per 100g),
    "saturatedFat": number (g per 100g),
    "fiber": number (g per 100g),
    "sodium": number (mg per 100g)
  }
}

Rules:
- If a nutrition value is missing or unreadable, use 0.
- Normalize all nutrition values to per-100g.
- ingredientsRaw: copy the text verbatim from the ingredients photo if available.
- ingredients: split ingredientsRaw into a clean array (split on commas).
- Return raw JSON only. No markdown, no code blocks, no explanation.`;

  const imageParts = [];
  if (hasIngredients) {
    imageParts.push({ inlineData: { mimeType: 'image/jpeg', data: backPhotos.ingredients } });
    console.log(`📸 [Gemini:OCR] Step 2 → Added ingredients photo (~${Math.round(backPhotos.ingredients.length / 1024)}KB)`);
  }
  if (hasNutrition) {
    imageParts.push({ inlineData: { mimeType: 'image/jpeg', data: backPhotos.nutrition } });
    console.log(`📸 [Gemini:OCR] Step 2 → Added nutrition photo (~${Math.round(backPhotos.nutrition.length / 1024)}KB)`);
  }

  console.log(`📸 [Gemini:OCR] Step 3 → Sending ${imageParts.length} image(s) to Gemini Vision...`);

  // Try each key in sequence, rotating on 429
  let lastError = null;
  for (let attempt = 0; attempt < keys.length; attempt++) {
    const key = keys[attempt];
    console.log(`📸 [Gemini:OCR] Attempt ${attempt + 1}/${keys.length} — key=...${key.slice(-6)}`);

    try {
      const startTime = Date.now();
      const url = `${GEMINI_API_BASE}/models/${selectedModel}:generateContent?key=${key}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }, ...imageParts] }],
          generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
        }),
      });

      const elapsed = Date.now() - startTime;
      console.log(`📸 [Gemini:OCR] Step 4 → HTTP ${response.status} (${elapsed}ms)`);

      if (response.status === 429) {
        const body = await response.text();
        const retryMatch = body.match(/retry.*?(\d+)s/i);
        const waitSec = retryMatch ? retryMatch[1] : '?';
        console.warn(`📸 [Gemini:OCR] ⚠️ Key #${attempt + 1} rate-limited (429). Retry in ~${waitSec}s. Rotating...`);
        lastError = new Error(`Key #${attempt + 1} rate-limited. Retry in ~${waitSec}s.`);
        lastError.isRateLimited = true;
        continue; // rotate to next key
      }

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`HTTP ${response.status}: ${errBody.substring(0, 300)}`);
      }

      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        const reason = data.candidates?.[0]?.finishReason || data.promptFeedback?.blockReason || 'unknown';
        throw new Error(`Empty response from Gemini. Reason: ${reason}`);
      }

      console.log(`📸 [Gemini:OCR] Step 5 → Parsing JSON (${rawText.length} chars)...`);

      const cleaned = rawText.trim().replace(/^```json?\s*/i, '').replace(/```\s*$/, '');
      const productData = JSON.parse(cleaned);

      console.log(`📸 [Gemini:OCR] ✅ OCR COMPLETE in ${elapsed}ms!`);
      console.log(`📸 [Gemini:OCR]   └─ Name: "${productData.name}" | Brand: "${productData.brand}" | Ingredients: ${productData.ingredients?.length || 0}`);
      console.log(`📸 [Gemini:OCR] END\n`);

      return {
        name: productData.name || '',
        brand: productData.brand || '',
        ingredients: Array.isArray(productData.ingredients) ? productData.ingredients : [],
        ingredientsRaw: productData.ingredientsRaw || '',
        nutrition: {
          energy:       productData.nutrition?.energy       || 0,
          protein:      productData.nutrition?.protein      || 0,
          carbs:        productData.nutrition?.carbs        || 0,
          sugar:        productData.nutrition?.sugar        || 0,
          fat:          productData.nutrition?.fat          || 0,
          saturatedFat: productData.nutrition?.saturatedFat || 0,
          fiber:        productData.nutrition?.fiber        || 0,
          sodium:       productData.nutrition?.sodium       || 0,
        },
        rawOCRText: rawText,
      };

    } catch (err) {
      if (err.isRateLimited) { lastError = err; continue; }
      console.error(`📸 [Gemini:OCR] ❌ Key #${attempt + 1} FAILED: ${err.message}`);
      throw err; // non-429 errors should not silently rotate
    }
  }

  // All keys exhausted
  const finalErr = new Error(
    `[Gemini OCR] All ${keys.length} API key(s) are rate-limited.\n` +
    `Wait a minute and try again, or add another API key in Profile → API tab.`
  );
  console.error(`📸 [Gemini:OCR] ❌ ALL KEYS EXHAUSTED`);
  throw finalErr;
}
