// Ffads — Health Scoring Engine
import { WHO_THRESHOLDS, SCORING_WEIGHTS, HEALTH_MODES, HEALTH_CONDITIONS } from './constants';

/**
 * Calculate a health score 0–100 for a product
 * @param {Object} params
 * @param {Object} params.nutrition - { sugar, fat, saturatedFat, sodium, fiber, protein, energy } per 100g
 * @param {Array} params.classifiedIngredients - ingredients with color/flags from dictionary
 * @param {Array} params.allergenWarnings - output from checkAllergens
 * @param {string} params.healthMode - 'relaxed' | 'strict' | 'fitness'
 * @param {string[]} params.healthConditions - ['diabetes', 'hypertension', ...] from user prefs
 * @returns {{ score, grade, color, deductions, bonuses }}
 */
export function calculateScore({ nutrition = {}, classifiedIngredients = [], allergenWarnings = [], healthMode = 'relaxed', healthConditions = [] }) {
  // 1. MACRO SCORE LOGIC (Continuous Interpolation)
  let macroScore = 100;
  const deductions = [];
  const bonuses = [];
  const mode = HEALTH_MODES[healthMode] || HEALTH_MODES.relaxed;

  const penaltyMultiplier = mode.sugarPenalty ? 1.3 : 1;

  // Build condition-based multipliers per nutrient
  // e.g. if user has diabetes → sugar penalty is 1.8x harsher
  const conditionMultipliers = { sugar: 1, fat: 1, saturatedFat: 1, sodium: 1 };
  for (const cid of healthConditions) {
    const cond = HEALTH_CONDITIONS.find(c => c.id === cid);
    if (cond && conditionMultipliers[cond.nutrient] !== undefined) {
      conditionMultipliers[cond.nutrient] = Math.max(conditionMultipliers[cond.nutrient], cond.multiplier);
    }
    // obesity affects both sugar and fat
    if (cid === 'obesity') {
      conditionMultipliers.fat = Math.max(conditionMultipliers.fat, 1.3);
    }
  }

  // Helper for continuous deduction
  const applyDeduction = (name, amount, threshold, maxWeight, unit, nutrientKey) => {
    // Apply condition-based multiplier to the penalty
    const condMul = conditionMultipliers[nutrientKey] || 1;
    if (amount != null && amount > threshold) {
      let d = (amount / threshold) * maxWeight * condMul;
      d = Math.min(d, maxWeight * 2); // cap slightly higher for condition-based
      macroScore -= d;
      const condNote = condMul > 1 ? ` (${condMul}x due to health condition)` : '';
      deductions.push({
        reason: `Excess ${name}${condNote}`,
        amount: Math.round(d),
        detail: `${amount}${unit} per 100g`
      });
    }
  };

  applyDeduction('Sugar', nutrition.sugar, WHO_THRESHOLDS.sugar.high, SCORING_WEIGHTS.sugar * penaltyMultiplier, 'g', 'sugar');
  applyDeduction('Fat', nutrition.fat, WHO_THRESHOLDS.fat.high, SCORING_WEIGHTS.fat, 'g', 'fat');
  applyDeduction('Saturated Fat', nutrition.saturatedFat, WHO_THRESHOLDS.saturatedFat.high, SCORING_WEIGHTS.saturatedFat, 'g', 'saturatedFat');
  applyDeduction('Sodium', nutrition.sodium, WHO_THRESHOLDS.sodium.high, SCORING_WEIGHTS.sodium, 'mg', 'sodium');

  // Apply Rayner Model "Health-Washing" Cap
  const totalDeductions = deductions.reduce((sum, d) => sum + d.amount, 0);
  const healthWashingCapTriggered = totalDeductions > 20;

  // Bonuses
  if (nutrition.fiber != null && nutrition.fiber >= WHO_THRESHOLDS.fiber.good) {
    if (!healthWashingCapTriggered) {
      const b = Math.abs(SCORING_WEIGHTS.fiber);
      macroScore += b;
      bonuses.push({ reason: 'Good fiber content', amount: b, detail: `${nutrition.fiber}g per 100g` });
    } else {
      bonuses.push({ reason: 'Fiber bonus capped due to high sugar/fat', amount: 0, detail: `${nutrition.fiber}g per 100g` });
    }
  }

  if (nutrition.protein != null && nutrition.protein >= WHO_THRESHOLDS.protein.good) {
    if (!healthWashingCapTriggered) {
      const b = Math.abs(SCORING_WEIGHTS.protein) * (mode.proteinBonus ? 1.5 : 1);
      macroScore += b;
      bonuses.push({ reason: 'Good protein content', amount: b, detail: `${nutrition.protein}g per 100g` });
    } else {
      bonuses.push({ reason: 'Protein bonus capped due to high sugar/fat', amount: 0, detail: `${nutrition.protein}g per 100g` });
    }
  }

  // 2. INGREDIENT LOGIC
  let ingredientScore = 100;
  const ingredientDeductions = [];

  classifiedIngredients.forEach((ing) => {
    // Parse severity from new API or fallback to legacy format
    let severity = 0;
    if (ing.health_risk_score !== undefined) {
      severity = ing.health_risk_score;
    } else {
      if (ing.color === 'red') severity = 8;
      else if (ing.color === 'yellow') severity = 4;
      else if (ing.color === 'green') severity = 1;
    }

    if (severity >= 7) {
      ingredientScore -= 10;
      ingredientDeductions.push({ reason: `High risk: ${ing.name}`, amount: 10 });
    } else if (severity >= 5) {
      ingredientScore -= 4;
      ingredientDeductions.push({ reason: `Moderate risk: ${ing.name}`, amount: 4 });
    }
  });

  if (allergenWarnings.length > 0) {
    const d = SCORING_WEIGHTS.allergenConflict;
    macroScore -= d;
    ingredientScore -= d;
    deductions.push({ reason: `${allergenWarnings.length} allergen conflict(s)`, amount: d });
  }

  macroScore = Math.max(0, Math.min(100, Math.round(macroScore)));
  ingredientScore = Math.max(0, Math.min(100, Math.round(ingredientScore)));

  return {
    // Legacy support to prevent breaking old screens that expect a single score object
    score: macroScore,
    grade: getGrade(macroScore),
    scoreColor: getScoreColor(macroScore),
    deductions,
    bonuses,

    // New Multi-Vector architectural objects
    macro: {
      score: macroScore,
      grade: getGrade(macroScore),
      color: getScoreColor(macroScore),
      deductions,
      bonuses,
    },
    ingredientQuality: {
      score: ingredientScore,
      grade: getGrade(ingredientScore),
      color: getScoreColor(ingredientScore),
      deductions: ingredientDeductions,
    }
  };
}

function getGrade(score) {
  if (score >= 80) return 'Excellent';
  if (score >= 65) return 'Good';
  if (score >= 45) return 'Fair';
  if (score >= 25) return 'Poor';
  return 'Bad';
}

export function getScoreColor(score) {
  if (score >= 80) return '#22C55E';
  if (score >= 65) return '#84CC16';
  if (score >= 45) return '#F59E0B';
  if (score >= 25) return '#F97316';
  return '#EF4444';
}

export function getVerdict(score) {
  if (score >= 70) return { label: 'Safe Choice', color: '#22C55E', emoji: '✅' };
  if (score >= 45) return { label: 'Use Caution', color: '#F59E0B', emoji: '⚠️' };
  return { label: 'Avoid', color: '#EF4444', emoji: '🚫' };
}

/**
 * Calculates absolute maximum safe daily portion based on WHO Daily Allowances
 * Daily Limits: Sugar 50g, Sodium 2000mg, Saturated Fat 20g
 * Input nutrition is strictly per 100g
 */
export function calculateSafePortion(nutrition) {
  if (!nutrition || Object.keys(nutrition).length === 0) return null;

  const DAILY_LIMITS = {
    sugar: 50,       // 50g
    sodium: 2000,    // 2000mg
    saturatedFat: 20 // 20g
  };

  let limitBottleneck = null;
  let maxSafeGrams = Infinity;

  // Calculate portion bound by Sugar
  if (nutrition.sugar != null && typeof nutrition.sugar === 'number' && nutrition.sugar > 1) {
    const limit = (DAILY_LIMITS.sugar / nutrition.sugar) * 100;
    if (limit < maxSafeGrams) {
      maxSafeGrams = limit;
      limitBottleneck = 'Sugar';
    }
  }

  // Calculate portion bound by Sodium
  if (nutrition.sodium != null && typeof nutrition.sodium === 'number' && nutrition.sodium > 50) {
    const limit = (DAILY_LIMITS.sodium / nutrition.sodium) * 100;
    if (limit < maxSafeGrams) {
      maxSafeGrams = limit;
      limitBottleneck = 'Sodium';
    }
  }

  // Calculate portion bound by Saturated Fat
  if (nutrition.saturatedFat != null && typeof nutrition.saturatedFat === 'number' && nutrition.saturatedFat > 1) {
    const limit = (DAILY_LIMITS.saturatedFat / nutrition.saturatedFat) * 100;
    if (limit < maxSafeGrams) {
      maxSafeGrams = limit;
      limitBottleneck = 'Saturated Fat';
    }
  }

  if (maxSafeGrams === Infinity) {
    return {
      isSafe: true,
      maxGrams: null,
      message: "No major threshold restrictions. Eat in moderation.",
      bottleneck: null
    };
  }

  // Round sensibly
  let roundedPortion = Math.ceil(maxSafeGrams / 50) * 50; // Round to nearest 50g roughly
  if (maxSafeGrams < 50) roundedPortion = Math.round(maxSafeGrams);

  const isSevere = roundedPortion <= 150;

  return {
    isSafe: false,
    maxGrams: roundedPortion, // Output is in grams/ml
    bottleneck: limitBottleneck,
    message: `Exceeds WHO daily limit for ${limitBottleneck} beyond ${roundedPortion} g/ml.`,
    isSevere
  };
}
