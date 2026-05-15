import { recognizeText, isOCRAvailable } from '../ocr';
import {
  ensureProviderRegistry,
  getProviderById,
  getProviderLabel,
  normalizeProvider,
  sortProvidersByPriority,
} from './providerPresets';

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAgMBgJ/gk1cAAAAASUVORK5CYII=';

const GEMINI_DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

function stripTrailingSlash(value = '') {
  return value.replace(/\/+$/, '');
}



function createProviderError(message, options = {}) {
  const error = new Error(message);
  error.status = options.status ?? null;
  error.retryable = options.retryable ?? false;
  error.code = options.code || 'provider_error';
  error.details = options.details || null;
  error.providerId = options.providerId || null;
  error.trace = options.trace || null;
  error.routeId = options.routeId || null;
  error.attemptedRouteIds = options.attemptedRouteIds || null;
  return error;
}

function classifyTransportError(error, providerId, routeId = null) {
  if (error?.code && error.providerId) return error;

  const message = error?.message || 'Unknown provider error';
  const isTimeout = /timeout|network request failed|timed out|socket|failed to fetch|network/i.test(message);
  return createProviderError(message, {
    retryable: isTimeout,
    code: isTimeout ? 'network' : 'provider_error',
    providerId,
    routeId,
  });
}

async function parseHttpError(response, providerId, routeId = null) {
  const body = await response.text().catch(() => '');
  const retryable = response.status === 429 || response.status >= 500;
  const code = response.status === 400
    ? 'bad_request'
    : response.status === 401 || response.status === 403
      ? 'invalid_credentials'
      : response.status === 404
        ? 'bad_endpoint'
        : retryable
          ? 'transient_http'
          : 'http_error';

  const baseMessage = body ? `${response.status}: ${body.slice(0, 220)}` : `HTTP ${response.status}`;
  return createProviderError(baseMessage, {
    status: response.status,
    retryable,
    code,
    details: body,
    providerId,
    routeId,
  });
}

function extractJsonCandidate(rawText = '') {
  const trimmed = String(rawText || '').trim().replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/i, '');

  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (!match) {
      throw createProviderError('Provider response was not valid JSON.', {
        retryable: false,
        code: 'bad_response',
      });
    }
    return JSON.parse(match[1]);
  }
}

function getOpenAICompatibleUrl(baseUrl = '') {
  const normalized = stripTrailingSlash(baseUrl);
  if (normalized.endsWith('/chat/completions')) return normalized;
  if (normalized.endsWith('/v1')) return `${normalized}/chat/completions`;
  return `${normalized}/v1/chat/completions`;
}

function getOllamaChatUrl(baseUrl = '') {
  const normalized = stripTrailingSlash(baseUrl);
  if (normalized.endsWith('/api/chat')) return normalized;
  if (normalized.endsWith('/v1')) return `${normalized.replace(/\/v1$/, '')}/api/chat`;
  return `${normalized}/api/chat`;
}

function getOllamaTagsUrl(baseUrl = '') {
  const normalized = stripTrailingSlash(baseUrl);
  if (normalized.endsWith('/api/tags')) return normalized;
  if (normalized.endsWith('/v1')) return `${normalized.replace(/\/v1$/, '')}/api/tags`;
  return `${normalized}/api/tags`;
}

function buildOpenAIMessage(prompt) {
  return prompt;
}

function maskApiKey(apiKey = '') {
  const trimmed = String(apiKey || '').trim();
  if (!trimmed) return 'no-key';
  if (trimmed.length <= 6) return `***${trimmed}`;
  return `***${trimmed.slice(-6)}`;
}

function buildAnalysisPrompt(product) {
  const ingredientStr = product.ingredients?.join(', ') || 'None provided';
  return `You are an elite food safety analyst combining toxicology, nutrition science, and ingredient forensics. Perform a deep analysis of this product in one pass.

Product: ${product.name || 'Unknown'}
Ingredients: ${ingredientStr}
Nutrition per 100g: Sugar ${product.nutrition?.sugar || 0}g, Sodium ${product.nutrition?.sodium || 0}mg, Saturated Fat ${product.nutrition?.saturatedFat || 0}g

Return ONLY a JSON object with this exact schema:
{
  "harmfulChemicals": [
    {
      "name": "ingredient as listed on pack",
      "realName": "what it actually is",
      "risk": "one sentence explanation"
    }
  ],
  "animalContentFlag": boolean,
  "animalContentDetails": "string or null",
  "aiScore": integer 0-100,
  "aiRecommendation": "two short sentences"
}

Rules:
- Return an empty array if no harmful chemicals are found.
- Flag animal ingredients like milk, egg, gelatin, honey, or carmine.
- Ultra-processed products with risky additives should score below 50.
- Return raw JSON only.`;
}

function buildIngredientPrompt(ingredientName) {
  return `You are a food science expert. Analyze this single ingredient in concise plain English.

Ingredient: "${ingredientName}"

Return ONLY a JSON object with this schema:
{
  "name": "normalized ingredient name",
  "whatIsIt": "1-2 sentence description",
  "purpose": "why it is used in food",
  "healthRisk": "low | moderate | high",
  "riskExplanation": "1-2 sentence risk summary",
  "isNatural": true,
  "isUltraProcessed": false,
  "isAnimalDerived": false,
  "commonAllergens": ["list"],
  "dailyLimitMg": 0,
  "bannedInCountries": ["list"],
  "saferAlternatives": ["list"]
}`;
}

function buildOcrCleanupPrompt(productHints = {}, ocrText = {}) {
  return `You clean OCR text extracted from food labels. Do not mention confidence, OCR, or commentary. Return only valid JSON.

Product hints:
- barcode: ${productHints.barcode || 'unknown'}
- provided name: ${productHints.name || 'unknown'}
- provided brand: ${productHints.brand || 'unknown'}

Ingredients OCR text:
${ocrText.ingredientsText || 'Not available'}

Nutrition OCR text:
${ocrText.nutritionText || 'Not available'}

Return this exact JSON schema:
{
  "name": "Product Name",
  "brand": "Brand Name",
  "ingredientsRaw": "Ingredients text as clean as possible",
  "ingredients": ["ingredient 1", "ingredient 2"],
  "nutrition": {
    "energy": number,
    "protein": number,
    "carbs": number,
    "sugar": number,
    "fat": number,
    "saturatedFat": number,
    "fiber": number,
    "sodium": number
  }
}

Rules:
- Use only the OCR text and product hints.
- If the product hint is more reliable than OCR for name or brand, use the hint.
- Normalize nutrition to per 100g when possible.
- Use 0 for missing or unreadable nutrition values.
- Keep ingredientsRaw readable and close to the OCR source.
- Return raw JSON only.`;
}

function normalizeNutritionObject(nutrition = {}) {
  return {
    energy: Number(nutrition?.energy) || 0,
    protein: Number(nutrition?.protein) || 0,
    carbs: Number(nutrition?.carbs) || 0,
    sugar: Number(nutrition?.sugar) || 0,
    fat: Number(nutrition?.fat) || 0,
    saturatedFat: Number(nutrition?.saturatedFat) || 0,
    fiber: Number(nutrition?.fiber) || 0,
    sodium: Number(nutrition?.sodium) || 0,
  };
}

function inferIngredientsList(text = '') {
  return String(text || '')
    .split(/\n|,|;|\u2022/)
    .map((item) => item.replace(/^\d+[\).\s-]*/, '').trim())
    .filter((item) => item.length > 1)
    .slice(0, 80);
}

function buildProvisionalNutrition(text = '') {
  const content = String(text || '').toLowerCase();
  const findValue = (patterns = []) => {
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) return Number(match[1].replace(',', '.')) || 0;
    }
    return 0;
  };

  return normalizeNutritionObject({
    energy: findValue([/energy[^0-9]{0,20}(\d+(?:[.,]\d+)?)/i, /kcal[^0-9]{0,10}(\d+(?:[.,]\d+)?)/i]),
    protein: findValue([/protein[^0-9]{0,20}(\d+(?:[.,]\d+)?)/i]),
    carbs: findValue([/carb(?:ohydrate)?s?[^0-9]{0,20}(\d+(?:[.,]\d+)?)/i]),
    sugar: findValue([/sugar(?:s)?[^0-9]{0,20}(\d+(?:[.,]\d+)?)/i]),
    fat: findValue([/fat[^0-9]{0,20}(\d+(?:[.,]\d+)?)/i]),
    saturatedFat: findValue([/saturated[^0-9]{0,20}(\d+(?:[.,]\d+)?)/i]),
    fiber: findValue([/fiber[^0-9]{0,20}(\d+(?:[.,]\d+)?)/i, /fibre[^0-9]{0,20}(\d+(?:[.,]\d+)?)/i]),
    sodium: findValue([/sodium[^0-9]{0,20}(\d+(?:[.,]\d+)?)/i]),
  });
}

async function callGeminiJson({ route, prompt }) {
  const apiKey = (route.apiKey || '').trim();
  if (!apiKey) {
    throw createProviderError('Gemini API key is missing.', {
      retryable: false,
      code: 'invalid_credentials',
      providerId: route.providerId,
      routeId: route.id,
    });
  }

  const url = `${stripTrailingSlash(route.baseUrl || GEMINI_DEFAULT_BASE_URL)}/models/${route.model}:generateContent?key=${apiKey}`;
  const parts = [{ text: prompt }];

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.2,
        topP: 0.8,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    throw await parseHttpError(response, route.providerId, route.id);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw createProviderError('Gemini returned an empty response.', {
      retryable: false,
      code: 'bad_response',
      providerId: route.providerId,
      routeId: route.id,
    });
  }

  return extractJsonCandidate(text);
}

async function callOpenAICompatibleJson({ route, prompt }) {
  if (!route.baseUrl) {
    throw createProviderError('The provider endpoint is missing.', {
      retryable: false,
      code: 'bad_endpoint',
      providerId: route.providerId,
      routeId: route.id,
    });
  }

  const headers = {
    'Content-Type': 'application/json',
  };
  if (route.apiKey) {
    headers.Authorization = `Bearer ${route.apiKey}`;
  }

  const response = await fetch(getOpenAICompatibleUrl(route.baseUrl), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: route.model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Return valid JSON only.',
        },
        {
          role: 'user',
          content: buildOpenAIMessage(prompt),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw await parseHttpError(response, route.providerId, route.id);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) {
    throw createProviderError('The provider returned an empty completion.', {
      retryable: false,
      code: 'bad_response',
      providerId: route.providerId,
      routeId: route.id,
    });
  }

  return extractJsonCandidate(text);
}

async function callOllamaJson({ route, prompt }) {
  if (!route.baseUrl) {
    throw createProviderError('Ollama endpoint is missing.', {
      retryable: false,
      code: 'bad_endpoint',
      providerId: route.providerId,
      routeId: route.id,
    });
  }

  const headers = {
    'Content-Type': 'application/json',
  };
  if (route.apiKey) {
    headers.Authorization = `Bearer ${route.apiKey}`;
  }

  const response = await fetch(getOllamaChatUrl(route.baseUrl), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: route.model,
      stream: false,
      format: 'json',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw await parseHttpError(response, route.providerId, route.id);
  }

  const data = await response.json();
  const text = data?.message?.content || data?.response;
  if (!text) {
    throw createProviderError('Ollama returned an empty response.', {
      retryable: false,
      code: 'bad_response',
      providerId: route.providerId,
      routeId: route.id,
    });
  }

  return extractJsonCandidate(text);
}

async function callRouteJson({ route, prompt }) {
  const model = route.model;

  if (!model) {
    throw createProviderError('The selected route does not have a model configured.', {
      retryable: false,
      code: 'missing_model',
      providerId: route.providerId,
      routeId: route.id,
    });
  }

  const activeRoute = {
    ...route,
    model,
  };

  try {
    if (activeRoute.kind === 'gemini') {
      return await callGeminiJson({ route: activeRoute, prompt });
    }

    if (activeRoute.kind === 'ollama') {
      return await callOllamaJson({ route: activeRoute, prompt });
    }

    return await callOpenAICompatibleJson({ route: activeRoute, prompt });
  } catch (error) {
    throw classifyTransportError(error, activeRoute.providerId, activeRoute.id);
  }
}

function getRegistry(providerLike = {}) {
  if (providerLike?.providers) {
    return ensureProviderRegistry(providerLike);
  }

  if (!providerLike) {
    return ensureProviderRegistry({});
  }

  const provider = normalizeProvider(providerLike, providerLike, 0);
  return ensureProviderRegistry({
    providers: [provider],
    activeProviderId: provider.id,
  });
}

export function getActiveProvider(userPrefs = {}) {
  const registry = ensureProviderRegistry(userPrefs);
  const provider = getProviderById(registry.providers, registry.activeProviderId) || registry.providers[0] || null;
  return provider ? normalizeProvider(provider, userPrefs) : null;
}

export function resolveProviderContext(providerLike) {
  if (!providerLike) return null;
  if (providerLike.providers) {
    return getActiveProvider(providerLike);
  }
  return normalizeProvider(providerLike);
}

export function isProviderConfigured(providerLike) {
  const registry = getRegistry(providerLike);
  return buildCleanupRoutes(registry).length > 0;
}

export function isTransientProviderError(error) {
  if (!error) return false;
  return Boolean(error.retryable);
}

export function buildCleanupRoutes(providerRegistry = {}) {
  const registry = getRegistry(providerRegistry);
  const orderedProviders = sortProvidersByPriority(registry.providers, registry.activeProviderId)
    .filter((provider) => provider.enabled !== false);

  const routes = [];

  orderedProviders.forEach((provider, providerIndex) => {
    const normalizedProvider = normalizeProvider(provider, registry, providerIndex);
    const textModels = normalizedProvider.textModels?.length
      ? normalizedProvider.textModels
      : (normalizedProvider.textModel ? [normalizedProvider.textModel] : []);
    const rawApiKeys = normalizedProvider.apiKeys?.length
      ? normalizedProvider.apiKeys
      : (normalizedProvider.apiKey ? [normalizedProvider.apiKey] : []);
    const apiKeys = rawApiKeys.length ? rawApiKeys : [null];

    if (!normalizedProvider.baseUrl && normalizedProvider.kind !== 'gemini') {
      return;
    }
    if (normalizedProvider.kind === 'gemini' && rawApiKeys.length === 0) {
      return;
    }
    if (!textModels.length) {
      return;
    }

    textModels.forEach((model, modelIndex) => {
      apiKeys.forEach((apiKey, keyIndex) => {
        routes.push({
          id: `${normalizedProvider.id}:${modelIndex}:${keyIndex}`,
          providerId: normalizedProvider.id,
          providerLabel: normalizedProvider.label,
          providerPriority: providerIndex,
          kind: normalizedProvider.kind,
          baseUrl: normalizedProvider.baseUrl,
          model,
          apiKey,
          keyIndex,
          modelIndex,
          maskedKey: maskApiKey(apiKey),
        });
      });
    });
  });

  return routes;
}

async function executeJsonWithFallback({
  providerRegistry,
  prompt,
  attemptedRouteIds = [],
  onAttempt = null,
}) {
  const routes = buildCleanupRoutes(providerRegistry);
  if (!routes.length) {
    throw createProviderError('No enabled provider routes are configured yet.', {
      retryable: false,
      code: 'no_routes',
    });
  }

  const trace = [];
  const attempted = [...attemptedRouteIds];

  for (const route of routes) {
    if (attempted.includes(route.id)) continue;

    try {
      const data = await callRouteJson({ route, prompt });
      const event = {
        routeId: route.id,
        providerId: route.providerId,
        providerLabel: route.providerLabel,
        model: route.model,
        maskedKey: route.maskedKey,
        retryable: false,
        success: true,
        attemptedAt: new Date().toISOString(),
      };
      trace.push(event);
      attempted.push(route.id);
      if (onAttempt) {
        await onAttempt(event);
      }

      return {
        data,
        trace,
        route,
        attemptedRouteIds: attempted,
      };
    } catch (error) {
      const normalized = classifyTransportError(error, route.providerId, route.id);
      const event = {
        routeId: route.id,
        providerId: route.providerId,
        providerLabel: route.providerLabel,
        model: route.model,
        maskedKey: route.maskedKey,
        retryable: normalized.retryable,
        success: false,
        error: normalized.message,
        code: normalized.code,
        status: normalized.status,
        attemptedAt: new Date().toISOString(),
      };
      trace.push(event);
      attempted.push(route.id);
      if (onAttempt) {
        await onAttempt(event);
      }
    }
  }

  throw createProviderError('All configured AI routes failed for this cycle.', {
    retryable: true,
    code: 'routes_exhausted',
    trace,
    attemptedRouteIds: attempted,
  });
}

export async function validateProvider(profile) {
  const provider = resolveProviderContext(profile);
  if (!provider) {
    return { valid: false, message: 'Provider is not configured.' };
  }

  const registry = getRegistry(provider);
  const routes = buildCleanupRoutes(registry);
  if (!routes.length) {
    return {
      valid: false,
      message: 'Add at least one API key and one text model for this provider before testing.',
    };
  }

  const firstRoute = routes[0];

  try {
    await callRouteJson({
      route: firstRoute,
      prompt: 'Return {"ok":true,"mode":"text"} as JSON.',
    });
    return {
      valid: true,
      message: 'Validation succeeded.',
    };
  } catch (error) {
    return {
      valid: false,
      message: error.message,
    };
  }
}

export async function validateProviderChain(providerRegistry) {
  const trace = [];

  try {
    const result = await executeJsonWithFallback({
      providerRegistry,
      prompt: 'Return {"ok":true,"mode":"chain"} as JSON.',
      onAttempt: async (event) => {
        trace.push(event);
      },
    });

    return {
      valid: true,
      message: `Fallback chain succeeded with ${result.route.providerLabel} / ${result.route.model}.`,
      attempts: trace,
      route: result.route,
    };
  } catch (error) {
    return {
      valid: false,
      message: error.message,
      attempts: error.trace || trace,
      route: null,
    };
  }
}

export async function runLocalOcr({ ingredientsUri = null, nutritionUri = null }) {
  if (!ingredientsUri && !nutritionUri) {
    throw createProviderError('No OCR photos were provided.', {
      retryable: false,
      code: 'bad_request',
    });
  }

  if (!isOCRAvailable()) {
    throw createProviderError(
      'On-device OCR is not available in this build yet. Rebuild the Android development client after installing the ML Kit OCR dependency.',
      {
        retryable: false,
        code: 'ocr_unavailable',
      }
    );
  }

  const warnings = [];
  const runForImage = async (uri, label) => {
    if (!uri) return { text: '', blocks: [], confidence: 0 };

    try {
      return await recognizeText(uri);
    } catch (error) {
      warnings.push(`${label} OCR failed: ${error.message}`);
      return { text: '', blocks: [], confidence: 0 };
    }
  };

  const ingredientsResult = await runForImage(ingredientsUri, 'Ingredients');
  const nutritionResult = await runForImage(nutritionUri, 'Nutrition');
  const combinedText = [ingredientsResult.text, nutritionResult.text].filter(Boolean).join('\n\n');

  if (!combinedText.trim()) {
    throw createProviderError('OCR did not find readable text in the ingredients or nutrition photos.', {
      retryable: false,
      code: 'ocr_empty',
      details: warnings,
    });
  }

  return {
    ingredientsText: ingredientsResult.text || '',
    nutritionText: nutritionResult.text || '',
    combinedText,
    confidence: Math.max(ingredientsResult.confidence || 0, nutritionResult.confidence || 0),
    warnings,
  };
}

export function buildProvisionalOcrResult(productHints = {}, ocrText = {}) {
  const ingredientsRaw = ocrText.ingredientsText || '';
  return {
    name: productHints.name || '',
    brand: productHints.brand || '',
    ingredientsRaw,
    ingredients: inferIngredientsList(ingredientsRaw),
    nutrition: buildProvisionalNutrition(ocrText.nutritionText || ''),
    rawOCRText: ocrText.combinedText || [ocrText.ingredientsText, ocrText.nutritionText].filter(Boolean).join('\n\n'),
    warnings: ocrText.warnings || [],
  };
}

export async function normalizeOcrText({
  productHints = {},
  ocrText = {},
  providerRegistry,
  attemptedRouteIds = [],
  onAttempt = null,
}) {
  const prompt = buildOcrCleanupPrompt(productHints, ocrText);
  const result = await executeJsonWithFallback({
    providerRegistry,
    prompt,
    attemptedRouteIds,
    onAttempt,
  });

  return {
    cleanJson: {
      name: result.data?.name || productHints.name || '',
      brand: result.data?.brand || productHints.brand || '',
      ingredientsRaw: result.data?.ingredientsRaw || ocrText.ingredientsText || '',
      ingredients: Array.isArray(result.data?.ingredients)
        ? result.data.ingredients.filter(Boolean)
        : inferIngredientsList(result.data?.ingredientsRaw || ocrText.ingredientsText || ''),
      nutrition: normalizeNutritionObject(result.data?.nutrition || {}),
    },
    trace: result.trace,
    route: result.route,
    attemptedRouteIds: result.attemptedRouteIds,
    rawText: ocrText.combinedText || '',
  };
}

export async function runDeepAnalysis(product, providerLike) {
  const result = await executeJsonWithFallback({
    providerRegistry: providerLike,
    prompt: buildAnalysisPrompt(product),
  });

  return result.data;
}

export async function analyzeIngredient(ingredientName, providerLike) {
  const result = await executeJsonWithFallback({
    providerRegistry: providerLike,
    prompt: buildIngredientPrompt(ingredientName),
  });

  return result.data;
}

export async function processProductPhotos(backPhotos, providerLike) {
  const normalized = await normalizeOcrText({
    productHints: {
      name: backPhotos?.name || '',
      brand: backPhotos?.brand || '',
      barcode: backPhotos?.barcode || '',
    },
    ocrText: {
      ingredientsText: backPhotos?.ingredientsText || '',
      nutritionText: backPhotos?.nutritionText || '',
      combinedText: backPhotos?.rawOCRText || '',
    },
    providerRegistry: providerLike,
  });

  return {
    ...normalized.cleanJson,
    rawOCRText: normalized.rawText || JSON.stringify(normalized.cleanJson),
  };
}

export async function pingOllama(profile) {
  const provider = resolveProviderContext(profile);
  if (!provider) {
    return { ok: false, message: 'Provider is not configured.' };
  }

  try {
    const response = await fetch(getOllamaTagsUrl(provider.baseUrl), {
      headers: provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {},
    });
    if (!response.ok) {
      throw await parseHttpError(response, provider.id);
    }
    return { ok: true, message: 'Ollama is reachable.' };
  } catch (error) {
    const normalized = classifyTransportError(error, provider.id);
    return { ok: false, message: normalized.message };
  }
}

export { maskApiKey };
