// Ffads — Gemini Core (API base, key resolution, API call + rotation)

export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export function getApiKey() {
  // Only used as last-resort fallback — callers should pass the key from UserContext
  return process.env.EXPO_PUBLIC_GEMINI_API_KEY || null;
}

export function getModel() {
  return process.env.EXPO_PUBLIC_GEMINI_MODEL || 'gemini-2.5-flash';
}

/**
 * Normalise apiKeys into a non-empty string[].
 * Accepts: string | string[] | null
 * Always appends the .env key as a last-resort fallback.
 */
export function resolveKeys(apiKeys) {
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
  console.log(`🤖 [Gemini:Core] Resolved ${keys.length} API key(s) (env fallback: ${envKey ? 'yes' : 'no'})`);
  return keys;
}

export async function callGemini(prompt, apiKey, model) {
  if (!apiKey) {
    throw new Error('Gemini API key not configured. Add EXPO_PUBLIC_GEMINI_API_KEY to your .env file.');
  }

  console.log(`🤖 [Gemini:Core] API CALL → model="${model}" | key=...${apiKey.slice(-6)} | prompt length=${prompt.length} chars`);
  const startTime = Date.now();

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

  const elapsed = Date.now() - startTime;

  if (!response.ok) {
    const err = await response.text();
    console.error(`🤖 [Gemini:Core] ❌ HTTP ${response.status} after ${elapsed}ms — ${err.substring(0, 150)}`);
    const error = new Error(`Gemini API error ${response.status}: ${err}`);
    error.status = response.status;
    error.isRateLimited = response.status === 429 || response.status === 503;
    throw error;
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');
  
  console.log(`🤖 [Gemini:Core] ✅ Response received in ${elapsed}ms (${text.length} chars)`);

  let cleanText = text.trim();
  
  // 1. Try stripping standard markdown fences
  cleanText = cleanText.replace(/^```[a-z]*\s*/im, '').replace(/```\s*$/i, '').trim();

  try {
    return JSON.parse(cleanText);
  } catch (err) {
    // 2. Failsafe: find the outermost JSON object/array if Gemini added conversational text
    const match = text.match(/([\[\{][\s\S]*[\]\}])/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch (fallbackErr) {
        console.error(`🤖 [Gemini:Core] ❌ Failsafe JSON Parse failed. Text was: ${match[1].substring(0, 150)}...`);
        throw new Error(`JSON Parse Error: ${fallbackErr.message}`);
      }
    }
    console.error(`🤖 [Gemini:Core] ❌ No JSON found in response. Text was: ${text.substring(0, 150)}...`);
    throw new Error(`JSON Parse Error: Original response was not JSON.`);
  }
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

  console.log(`🤖 [Gemini:Core] Rotation mode → ${apiKeys.length} keys available, starting at index ${startIndex}`);
  let lastError = null;
  for (let attempt = 0; attempt < apiKeys.length; attempt++) {
    const idx = (startIndex + attempt) % apiKeys.length;
    const key = apiKeys[idx];
    if (!key) continue;

    try {
      const result = await callGemini(prompt, key, model);
      if (attempt > 0) console.log(`🤖 [Gemini:Core] ✅ Rotation succeeded — used key #${idx + 1} after ${attempt} rotation(s)`);
      return { result, usedKeyIndex: idx };
    } catch (err) {
      lastError = err;
      if (err.isRateLimited) {
        console.warn(`🤖 [Gemini:Core] ⚠️ Key #${idx + 1} rate-limited (${err.status}). Rotating to next key...`);
        continue; // Try next key
      }
      throw err; // Non-429 errors should not rotate
    }
  }

  console.error(`🤖 [Gemini:Core] ❌ All ${apiKeys.length} keys exhausted (rate limited)`);
  throw lastError || new Error('All Gemini API keys exhausted (rate limited).');
}
