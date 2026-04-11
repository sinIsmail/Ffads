// Ffads — Gemini Validation (Key testing + configuration check)

import { GEMINI_API_BASE, getApiKey } from './core';

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
