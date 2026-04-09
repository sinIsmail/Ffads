// Ffads — Gemini AI Service

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function getApiKey() {
  // Only used as last-resort fallback — callers should pass the key from UserContext
  return process.env.EXPO_PUBLIC_GEMINI_API_KEY || null;
}

function getModel() {
  return process.env.EXPO_PUBLIC_GEMINI_MODEL || 'gemini-2.5-flash';
}

/**
 * Normalise apiKeys into a non-empty string[].
 * Accepts: string | string[] | null
 * Always appends the .env key as a last-resort fallback.
 */
function resolveKeys(apiKeys) {
  const envKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY || null;
  let keys = [];
  if (Array.isArray(apiKeys)) {
    keys = apiKeys.filter(k => k && k.trim());
  } else if (typeof apiKeys === 'string' && apiKeys.trim()) {
    keys = [apiKeys.trim()];
  }
  // Append .env key as final fallback (deduped)
  if (envKey && !keys.includes(envKey)) keys.push(envKey);
  if (keys.length === 0) {
    throw new Error(
      '[Gemini] No API keys found.\n' +
      '• Go to Profile → API tab → paste a key → tap +\n' +
      '• Or set EXPO_PUBLIC_GEMINI_API_KEY in .env'
    );
  }
  return keys;
}

async function callGemini(prompt, apiKey, model) {
  if (!apiKey) {
    throw new Error('Gemini API key not configured. Add EXPO_PUBLIC_GEMINI_API_KEY to your .env file.');
  }

  const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        topP: 0.8,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    const error = new Error(`Gemini API error ${response.status}: ${err}`);
    error.status = response.status;
    error.isRateLimited = response.status === 429 || response.status === 503;
    throw error;
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');
  return JSON.parse(text);
}

/**
 * Call Gemini with automatic key rotation on 429 errors.
 * Tries all available keys before giving up.
 * @param {string} prompt
 * @param {string[]} apiKeys - Array of API keys to try
 * @param {string} model
 * @param {number} startIndex - Which key index to start with
 * @returns {{ result: any, usedKeyIndex: number }}
 */
export async function callGeminiWithRotation(prompt, apiKeys, model, startIndex = 0) {
  if (!apiKeys || apiKeys.length === 0) {
    throw new Error('No Gemini API keys configured.');
  }

  let lastError = null;
  for (let attempt = 0; attempt < apiKeys.length; attempt++) {
    const idx = (startIndex + attempt) % apiKeys.length;
    const key = apiKeys[idx];
    if (!key) continue;

    try {
      const result = await callGemini(prompt, key, model);
      return { result, usedKeyIndex: idx };
    } catch (err) {
      lastError = err;
      if (err.isRateLimited) {
        console.warn(`[Gemini] Key #${idx + 1} rate limited (429). Trying next key...`);
        continue; // Try next key
      }
      throw err; // Non-429 errors should not rotate
    }
  }

  throw lastError || new Error('All Gemini API keys exhausted (rate limited).');
}


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

/**
 * Check if Gemini is configured (accepts optional in-app key override)
 */
export function isGeminiConfigured(apiKeys) {
  if (Array.isArray(apiKeys)) return apiKeys.some(k => k && k.trim());
  if (typeof apiKeys === 'string') return !!apiKeys.trim();
  return !!getApiKey();
}

/**
 * Validate a Gemini API key by sending a minimal test request.
 * Uses the models.list endpoint first (cheapest), falls back to a tiny generateContent call.
 * @param {string} apiKey  – The key to validate
 * @returns {Promise<{ valid: boolean, message: string, models?: string[] }>}
 */
export async function validateGeminiApiKey(apiKey) {
  if (!apiKey || apiKey.trim().length < 10) {
    return { valid: false, message: 'API key is too short or empty' };
  }

  try {
    // Step 1: Try listing available models — lightweight and free
    const listUrl = `${GEMINI_API_BASE}/models?key=${apiKey.trim()}`;
    const listRes = await fetch(listUrl, { method: 'GET' });

    if (listRes.status === 400 || listRes.status === 403) {
      return { valid: false, message: 'Invalid API key — rejected by Google' };
    }
    if (listRes.status === 401) {
      return { valid: false, message: 'Unauthorized — check your API key' };
    }
    if (!listRes.ok) {
      const errText = await listRes.text();
      return { valid: false, message: `API error ${listRes.status}: ${errText.slice(0, 120)}` };
    }

    const listData = await listRes.json();
    const modelNames = (listData.models || []).map(m => m.name?.replace('models/', '') || '');
    const textModels = modelNames.filter(n =>
      n.includes('gemini') && !n.includes('embedding') && !n.includes('imagen')
      && !n.includes('veo') && !n.includes('lyria') && !n.includes('tts')
    );

    // Step 2: Try a tiny generateContent call to confirm the key can actually call a model
    const testUrl = `${GEMINI_API_BASE}/models/gemini-2.5-flash-lite:generateContent?key=${apiKey.trim()}`;
    const testRes = await fetch(testUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Say OK' }] }],
        generationConfig: { maxOutputTokens: 3 },
      }),
    });

    if (testRes.ok) {
      return {
        valid: true,
        message: `Key is valid — ${textModels.length} Gemini models available`,
        models: textModels,
      };
    }

    // Key listed models but can't generate — might be wrong permissions
    if (testRes.status === 429) {
      return {
        valid: true,
        message: 'Key is valid (rate-limited right now). Try again later.',
        models: textModels,
      };
    }

    return {
      valid: true,
      message: `Key can list models but generation returned ${testRes.status}`,
      models: textModels,
    };
  } catch (err) {
    return { valid: false, message: `Network error: ${err.message}` };
  }
}

/**
 * Call 6: AI Fallback for Unknown Ingredients (Batch)
 * Prompts Gemini to act as a toxicologist and evaluate an array of ingredients.
 * Returns a parsed array — safe against Gemini wrapping output in markdown fences.
 */
export async function evaluateIngredientsForCache(ingredientNames, apiKeys = null, model = null) {
  if (!ingredientNames || ingredientNames.length === 0) return [];

  const keys = resolveKeys(apiKeys);
  const selectedModel = model || getModel();

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

      if (response.status === 429 || response.status === 503) {
        const body = await response.text();
        console.warn(`[Gemini Cache] Key #${attempt + 1} rate-limited/unavailable (${response.status}). Rotating...`);
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
        console.log(`[Gemini Cache] Key rotation: used key #${attempt + 1}`);
      }
      return Array.isArray(parsed) ? parsed : [];

    } catch (err) {
      if (err.isRateLimited) { lastError = err; continue; }
      console.error(`[Gemini Cache] Key #${attempt + 1} failed:`, err.message);
      throw err;
    }
  }

  throw lastError || new Error('All Gemini API keys exhausted (rate limited).');
}


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
  console.log('[Gemini OCR] Step 1: Validating inputs...');

  const hasIngredients = !!backPhotos?.ingredients;
  const hasNutrition   = !!backPhotos?.nutrition;

  if (!hasIngredients && !hasNutrition) {
    throw new Error('[Gemini OCR] No back photos provided — need at least one of: ingredients, nutrition.');
  }

  // Resolve keys (supports string, string[], or null — always adds .env key as last resort)
  const keys = resolveKeys(apiKeys);
  const selectedModel = (model && model.trim().includes('flash')) ? model.trim() : 'gemini-2.0-flash';
  console.log(`[Gemini OCR] Step 2: model="${selectedModel}" | keys available: ${keys.length} | ingredients:${hasIngredients} | nutrition:${hasNutrition}`);

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
    console.log('[Gemini OCR] Added ingredients photo.');
  }
  if (hasNutrition) {
    imageParts.push({ inlineData: { mimeType: 'image/jpeg', data: backPhotos.nutrition } });
    console.log('[Gemini OCR] Added nutrition photo.');
  }

  console.log(`[Gemini OCR] Step 3: Sending ${imageParts.length} image(s) — trying ${keys.length} key(s)...`);

  // Try each key in sequence, rotating on 429
  let lastError = null;
  for (let attempt = 0; attempt < keys.length; attempt++) {
    const key = keys[attempt];
    console.log(`[Gemini OCR] Attempt ${attempt + 1}/${keys.length} with key ending ...${key.slice(-6)}`);

    try {
      const url = `${GEMINI_API_BASE}/models/${selectedModel}:generateContent?key=${key}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }, ...imageParts] }],
          generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
        }),
      });

      console.log(`[Gemini OCR] HTTP ${response.status}`);

      if (response.status === 429) {
        const body = await response.text();
        const retryMatch = body.match(/retry.*?(\d+)s/i);
        const waitSec = retryMatch ? retryMatch[1] : '?';
        console.warn(`[Gemini OCR] Key #${attempt + 1} rate-limited (429). Retry in ~${waitSec}s. Trying next key...`);
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

      console.log('[Gemini OCR] Step 7: Parsing JSON output...');
      console.log('[Gemini OCR] Raw (first 400):', rawText.substring(0, 400));

      const cleaned = rawText.trim().replace(/^```json?\s*/i, '').replace(/```\s*$/, '');
      const productData = JSON.parse(cleaned);

      console.log('[Gemini OCR] ✅ Done! name:', productData.name, '| brand:', productData.brand, '| ingredients:', productData.ingredients?.length);

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
      console.error(`[Gemini OCR] Key #${attempt + 1} failed:`, err.message);
      throw err; // non-429 errors should not silently rotate
    }
  }

  // All keys exhausted
  const finalErr = new Error(
    `[Gemini OCR] All ${keys.length} API key(s) are rate-limited.\n` +
    `Wait a minute and try again, or add another API key in Profile → API tab.`
  );
  console.error(finalErr.message);
  throw finalErr;
}
