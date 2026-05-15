const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
const DEFAULT_OPENAI_COMPAT_BASE_URL = 'https://api.openai.com/v1';

export const PROVIDER_PRESET_ORDER = [
  'gemini',
  'nvidia-nim',
  'ollama',
  'custom-openai-compatible',
];

export const PROVIDER_PRESETS = {
  gemini: {
    id: 'gemini',
    label: 'Gemini',
    kind: 'gemini',
    baseUrl: DEFAULT_GEMINI_BASE_URL,
    apiKeys: [],
    textModels: ['gemini-2.5-flash'],
    enabled: true,
    priority: 0,
  },
  'nvidia-nim': {
    id: 'nvidia-nim',
    label: 'Nvidia NIM',
    kind: 'openai_compatible',
    baseUrl: DEFAULT_NVIDIA_BASE_URL,
    apiKeys: [],
    textModels: [],
    enabled: true,
    priority: 1,
  },
  ollama: {
    id: 'ollama',
    label: 'Local Ollama',
    kind: 'ollama',
    baseUrl: DEFAULT_OLLAMA_BASE_URL,
    apiKeys: [],
    textModels: [],
    enabled: true,
    priority: 2,
  },
  'custom-openai-compatible': {
    id: 'custom-openai-compatible',
    label: 'Custom OpenAI-Compatible',
    kind: 'openai_compatible',
    baseUrl: DEFAULT_OPENAI_COMPAT_BASE_URL,
    apiKeys: [],
    textModels: [],
    enabled: true,
    priority: 3,
  },
};

function toStringList(values = []) {
  const input = Array.isArray(values) ? values : [values];
  const unique = [];

  input.forEach((value) => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (!trimmed || unique.includes(trimmed)) return;
    unique.push(trimmed);
  });

  return unique;
}

function getLegacyGeminiKeys(seed = {}) {
  return toStringList([
    ...(seed?.providers?.find((provider) => provider.id === 'gemini')?.apiKeys || []),
    seed?.providers?.find((provider) => provider.id === 'gemini')?.apiKey || '',
    ...(Array.isArray(seed?.geminiApiKeys) ? seed.geminiApiKeys : []),
    seed?.geminiApiKey || '',
    process.env.EXPO_PUBLIC_GEMINI_API_KEY || '',
  ]);
}

function getLegacyGeminiTextModels(seed = {}) {
  return toStringList([
    ...(seed?.providers?.find((provider) => provider.id === 'gemini')?.textModels || []),
    seed?.providers?.find((provider) => provider.id === 'gemini')?.textModel || '',
    seed?.geminiModel || '',
    process.env.EXPO_PUBLIC_GEMINI_MODEL || '',
    ...PROVIDER_PRESETS.gemini.textModels,
  ]);
}



function getProviderSeedArrays(provider = {}, base = {}) {
  return {
    apiKeys: toStringList([
      ...(provider.apiKeys || []),
      provider.apiKey || '',
      ...(base.apiKeys || []),
      base.apiKey || '',
    ]),
    textModels: toStringList([
      ...(provider.textModels || []),
      provider.textModel || '',
      ...(base.textModels || []),
      base.textModel || '',
    ]),
  };
}

export function sortProvidersByPriority(providers = [], activeProviderId = null) {
  return [...providers]
    .sort((left, right) => {
      const leftPriority = Number.isFinite(left?.priority) ? left.priority : 999;
      const rightPriority = Number.isFinite(right?.priority) ? right.priority : 999;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return String(left?.label || left?.id || '').localeCompare(String(right?.label || right?.id || ''));
    })
    .sort((left, right) => {
      if (!activeProviderId) return 0;
      if (left.id === activeProviderId) return -1;
      if (right.id === activeProviderId) return 1;
      return 0;
    });
}

export function reindexProviders(providers = []) {
  return sortProvidersByPriority(providers).map((provider, index) => ({
    ...provider,
    priority: index,
  }));
}

export function buildDefaultProviders(seed = {}) {
  const geminiKeys = getLegacyGeminiKeys(seed);
  const geminiTextModels = getLegacyGeminiTextModels(seed);

  return PROVIDER_PRESET_ORDER.map((presetId, index) => {
    const preset = PROVIDER_PRESETS[presetId];
    if (presetId !== 'gemini') {
      return {
        ...preset,
        priority: index,
        apiKey: preset.apiKeys[0] || '',
        textModel: preset.textModels[0] || '',
      };
    }

    return {
      ...preset,
      priority: index,
      apiKeys: geminiKeys,
      apiKey: geminiKeys[0] || '',
      textModels: geminiTextModels,
      textModel: geminiTextModels[0] || '',
    };
  });
}

export function normalizeProvider(provider, seed = {}, fallbackPriority = 999) {
  const preset = PROVIDER_PRESETS[provider?.id] || null;
  const base = preset || {
    id: provider?.id || `provider-${Date.now()}`,
    label: provider?.label || 'Custom Provider',
    kind: provider?.kind || 'openai_compatible',
    baseUrl: '',
    apiKeys: [],
    textModels: [],
    enabled: true,
    priority: fallbackPriority,
  };

  const seeded = getProviderSeedArrays(provider || {}, base);
  const normalized = {
    ...base,
    ...provider,
    id: provider?.id || base.id,
    label: provider?.label || base.label,
    kind: provider?.kind || base.kind,
    baseUrl: provider?.baseUrl ?? base.baseUrl,
    apiKeys: seeded.apiKeys,
    textModels: seeded.textModels,
    enabled: provider?.enabled ?? base.enabled,
    priority: Number.isFinite(provider?.priority) ? provider.priority : (base.priority ?? fallbackPriority),
  };

  if (normalized.id === 'gemini') {
    normalized.apiKeys = getLegacyGeminiKeys({
      ...seed,
      providers: [normalized],
    });
    normalized.textModels = getLegacyGeminiTextModels({
      ...seed,
      providers: [normalized],
    });
  }

  normalized.apiKey = normalized.apiKeys[0] || '';
  normalized.textModel = normalized.textModels[0] || '';

  return normalized;
}

export function ensureProviderRegistry(prefs = {}) {
  const defaults = buildDefaultProviders(prefs);
  const existingProviders = Array.isArray(prefs.providers) ? prefs.providers : [];
  const existingMap = new Map(existingProviders.map((provider) => [provider.id, provider]));

  const baseProviders = defaults.map((provider, index) => (
    normalizeProvider(existingMap.get(provider.id) || provider, prefs, index)
  ));

  const extraProviders = existingProviders
    .filter((provider) => !PROVIDER_PRESET_ORDER.includes(provider.id))
    .map((provider, index) => normalizeProvider(provider, prefs, defaults.length + index));

  const providers = reindexProviders([...baseProviders, ...extraProviders]);
  const activeProviderId = providers.some((provider) => provider.id === prefs.activeProviderId && provider.enabled)
    ? prefs.activeProviderId
    : (providers.find((provider) => provider.enabled)?.id || providers[0]?.id || 'gemini');

  return {
    providers,
    activeProviderId,
  };
}

export function getProviderById(providers = [], providerId) {
  return providers.find((provider) => provider.id === providerId) || null;
}

export function getProviderLabel(provider) {
  if (!provider) return 'Unknown Provider';
  return provider.label || provider.id || 'Unknown Provider';
}
