// Ffads — Allergen Matching Engine
import { ALLERGEN_LIST } from './constants';

// Keywords that map to allergen IDs
const ALLERGEN_KEYWORDS = {
  milk: ['milk', 'dairy', 'lactose', 'casein', 'whey', 'cream', 'butter', 'ghee', 'cheese', 'yogurt', 'curd', 'paneer', 'milk solids', 'skimmed milk', 'whole milk'],
  peanuts: ['peanut', 'groundnut', 'arachis', 'monkey nut'],
  gluten: ['wheat', 'barley', 'rye', 'oat', 'spelt', 'kamut', 'triticale', 'semolina', 'durum', 'maida', 'gluten', 'flour'],
  soy: ['soy', 'soya', 'soybean', 'soy lecithin', 'soy sauce', 'edamame', 'tofu', 'tempeh'],
  eggs: ['egg', 'albumin', 'lysozyme', 'mayonnaise', 'meringue', 'ovalbumin', 'ovomucin'],
  treeNuts: ['almond', 'cashew', 'walnut', 'pistachio', 'pecan', 'hazelnut', 'macadamia', 'brazil nut', 'chestnut', 'pine nut'],
  shellfish: ['shrimp', 'prawn', 'crab', 'lobster', 'crayfish', 'shellfish', 'crustacean'],
  fish: ['fish', 'anchovy', 'cod', 'salmon', 'tuna', 'sardine', 'mackerel', 'fish sauce', 'fish oil'],
  sesame: ['sesame', 'tahini', 'til'],
  sulphites: ['sulphite', 'sulfite', 'sulphur dioxide', 'sodium metabisulphite', 'sodium bisulphite', 'e220', 'e221', 'e222', 'e223', 'e224', 'e225', 'e226', 'e227', 'e228'],
};

/**
 * Check ingredient list against user's selected allergens
 * @param {string[]} ingredients - list of ingredient names
 * @param {string[]} userAllergens - list of allergen IDs (e.g., ['milk', 'peanuts'])
 * @returns {Array<{ allergenId, allergenLabel, allergenEmoji, matchedIngredient, severity }>}
 */
export function checkAllergens(ingredients, userAllergens) {
  if (!ingredients || !userAllergens || userAllergens.length === 0) return [];

  const warnings = [];
  const normalizedIngredients = ingredients.map((i) => i.toLowerCase().trim());

  for (const allergenId of userAllergens) {
    const keywords = ALLERGEN_KEYWORDS[allergenId] || [];
    const allergenInfo = ALLERGEN_LIST.find((a) => a.id === allergenId);

    for (const ingredient of normalizedIngredients) {
      for (const keyword of keywords) {
        if (ingredient.includes(keyword)) {
          warnings.push({
            allergenId,
            allergenLabel: allergenInfo?.label || allergenId,
            allergenEmoji: allergenInfo?.emoji || '⚠️',
            matchedIngredient: ingredient,
            severity: 'high',
          });
          break; // one match per ingredient per allergen is enough
        }
      }
    }
  }

  // Deduplicate by allergenId (keep first match)
  const seen = new Set();
  return warnings.filter((w) => {
    if (seen.has(w.allergenId + ':' + w.matchedIngredient)) return false;
    seen.add(w.allergenId + ':' + w.matchedIngredient);
    return true;
  });
}

/**
 * Get a simple yes/no for whether a product has any allergen conflicts
 */
export function hasAllergenConflict(ingredients, userAllergens) {
  return checkAllergens(ingredients, userAllergens).length > 0;
}
