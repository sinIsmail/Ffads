// Ffads — Constants (WHO thresholds, FSSAI limits, scoring weights)
export const WHO_THRESHOLDS = {
  // Per 100g
  sugar: { low: 5, medium: 12.5, high: 22.5 },
  fat: { low: 3, medium: 10, high: 20 },
  saturatedFat: { low: 1.5, medium: 5, high: 10 },
  sodium: { low: 120, medium: 400, high: 600 },  // mg
  fiber: { good: 3, excellent: 6 },               // g
  protein: { good: 5, excellent: 10 },             // g
};

export const FSSAI_LIMITS = {
  transFat: 0.2,       // g per 100g
  caffeine: 150,       // mg per serving
  addedSugar: 10,      // % of energy
};

export const SCORING_WEIGHTS = {
  sugar: 15,
  fat: 10,
  saturatedFat: 10,
  sodium: 12,
  additives: 15,
  ultraProcessed: 10,
  allergenConflict: 10,
  fiber: -5,           // bonus (reduces deduction)
  protein: -3,         // bonus
  naturalIngredients: -5, // bonus
};

export const ANALYSIS_MODES = {
  fast: { calls: 2, detail: 'basic' },
  balanced: { calls: 3, detail: 'moderate' },
  deep: { calls: 4, detail: 'comprehensive' },
};

export const HEALTH_MODES = {
  relaxed: { threshold: 0.8-0 },
  strict: { threshold: 1.2 },
  fitness: { threshold: 1.0, proteinBonus: true, sugarPenalty: true },
};

export const DIET_TYPES = ['veg', 'non-veg'];

export const ALLERGEN_LIST = [
  { id: 'milk', label: 'Milk & Dairy', emoji: '🥛' },
  { id: 'peanuts', label: 'Peanuts', emoji: '🥜' },
  { id: 'gluten', label: 'Gluten', emoji: '🌾' },
  { id: 'soy', label: 'Soy', emoji: '🫘' },
  { id: 'eggs', label: 'Eggs', emoji: '🥚' },
  { id: 'treeNuts', label: 'Tree Nuts', emoji: '🌰' },
  { id: 'shellfish', label: 'Shellfish', emoji: '🦐' },
  { id: 'fish', label: 'Fish', emoji: '🐟' },
  { id: 'sesame', label: 'Sesame', emoji: '🫘' },
  { id: 'sulphites', label: 'Sulphites', emoji: '⚗️' },
];

// Gemini models available on the free tier — updated April 2026
// Limits are per-project defaults; actual quotas may vary in AI Studio
export const GEMINI_MODELS = [
  {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    description: 'Hybrid reasoning, 1M context, thinking budgets',
    rpm: 10, rpd: 500, tpm: '250K',
    tag: 'recommended',
  },
  {
    id: 'gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash Lite',
    description: 'Smallest & most cost-effective, great at scale',
    rpm: 15, rpd: 1500, tpm: '250K',
    tag: 'fast',
  },
  {
    id: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    description: 'State-of-art coding & complex reasoning',
    rpm: 5, rpd: 50, tpm: '150K',
    tag: 'powerful',
  },
  {
    id: 'gemini-2.0-flash',
    label: 'Gemini 2.0 Flash',
    description: 'Fast & capable (legacy, being deprecated)',
    rpm: 10, rpd: 1500, tpm: '250K',
    tag: 'legacy',
  },
  {
    id: 'gemini-2.0-flash-lite',
    label: 'Gemini 2.0 Flash Lite',
    description: 'Ultra-fast lightweight (legacy, being deprecated)',
    rpm: 15, rpd: 1500, tpm: '250K',
    tag: 'legacy',
  },
];

