// Ffads — Ingredient Dictionary
// Color meanings: green = safer, yellow = caution, red = risky

const INGREDIENT_DB = {
  // === GREEN — Safe / Natural / Beneficial ===
  'water': { color: 'green', category: 'base', definition: 'Pure water, the most basic safe ingredient.', flags: [] },
  'salt': { color: 'yellow', category: 'mineral', definition: 'Sodium chloride. Needed in small amounts but excessive intake raises blood pressure.', flags: ['high-sodium-risk'] },
  'sugar': { color: 'red', category: 'sweetener', definition: 'Refined sucrose. Excessive consumption linked to obesity, diabetes, and heart disease.', flags: ['ultra-processed', 'high-sugar'] },
  'whole wheat flour': { color: 'green', category: 'grain', definition: 'Flour made from whole wheat grains. Retains fiber and nutrients.', flags: [] },
  'refined wheat flour': { color: 'yellow', category: 'grain', definition: 'Processed flour stripped of bran and germ (maida). Low in fiber.', flags: ['ultra-processed'] },
  'maida': { color: 'yellow', category: 'grain', definition: 'Refined wheat flour. Low nutritional value, high glycemic index.', flags: ['ultra-processed'] },
  'rice flour': { color: 'green', category: 'grain', definition: 'Flour made from ground rice. Naturally gluten-free.', flags: [] },
  'oats': { color: 'green', category: 'grain', definition: 'Whole grain oats rich in beta-glucan fiber.', flags: [] },
  'palm oil': { color: 'red', category: 'oil', definition: 'High in saturated fat. Linked to cardiovascular risk and deforestation.', flags: ['high-fat', 'environmental-concern'] },
  'olive oil': { color: 'green', category: 'oil', definition: 'Heart-healthy monounsaturated fat. Rich in antioxidants.', flags: [] },
  'sunflower oil': { color: 'green', category: 'oil', definition: 'Light oil with vitamin E. Moderate omega-6 content.', flags: [] },
  'coconut oil': { color: 'yellow', category: 'oil', definition: 'High in saturated fat but contains medium-chain triglycerides (MCTs).', flags: ['high-fat'] },
  'butter': { color: 'yellow', category: 'dairy', definition: 'High in saturated fat. Contains vitamins A, D, E.', flags: ['high-fat', 'allergen-milk'] },
  'milk solids': { color: 'yellow', category: 'dairy', definition: 'Dried milk components. Common allergen.', flags: ['allergen-milk'] },
  'skimmed milk powder': { color: 'green', category: 'dairy', definition: 'Low-fat dried milk. Good source of protein and calcium.', flags: ['allergen-milk'] },
  'whey protein': { color: 'green', category: 'dairy', definition: 'High-quality protein from milk. Common allergen for dairy-sensitive.', flags: ['allergen-milk'] },
  'casein': { color: 'yellow', category: 'dairy', definition: 'Milk protein. Strong allergen for dairy-sensitive individuals.', flags: ['allergen-milk'] },

  // === Sweeteners ===
  'high fructose corn syrup': { color: 'red', category: 'sweetener', definition: 'Highly processed sweetener linked to obesity and metabolic syndrome.', flags: ['ultra-processed', 'high-sugar'] },
  'hfcs': { color: 'red', category: 'sweetener', definition: 'High fructose corn syrup. Ultra-processed sweetener.', flags: ['ultra-processed', 'high-sugar'] },
  'aspartame': { color: 'red', category: 'sweetener', definition: 'Artificial sweetener (E951). Controversial health debates. Avoid in phenylketonuria.', flags: ['artificial', 'additive'] },
  'sucralose': { color: 'yellow', category: 'sweetener', definition: 'Artificial sweetener 600x sweeter than sugar. Generally considered safe in moderation.', flags: ['artificial'] },
  'stevia': { color: 'green', category: 'sweetener', definition: 'Natural zero-calorie sweetener derived from Stevia rebaudiana leaves.', flags: [] },
  'jaggery': { color: 'yellow', category: 'sweetener', definition: 'Unrefined sugar with some minerals. Still high in sugar.', flags: ['high-sugar'] },
  'honey': { color: 'yellow', category: 'sweetener', definition: 'Natural sweetener with antioxidants. Still high in sugar.', flags: ['high-sugar', 'animal-derived'] },
  'invert sugar': { color: 'red', category: 'sweetener', definition: 'Processed sugar that is sweeter and absorbs faster than regular sugar.', flags: ['ultra-processed', 'high-sugar'] },

  // === Additives — Preservatives ===
  'sodium benzoate': { color: 'red', category: 'preservative', definition: 'Preservative (E211). Can form benzene with vitamin C. Linked to hyperactivity.', flags: ['additive', 'risky'] },
  'potassium sorbate': { color: 'yellow', category: 'preservative', definition: 'Preservative (E202). Generally safe but can cause mild allergic reactions.', flags: ['additive'] },
  'sodium metabisulphite': { color: 'red', category: 'preservative', definition: 'Preservative (E223). Can trigger asthma and allergic reactions in sensitive people.', flags: ['additive', 'allergen-sulphites'] },
  'tbhq': { color: 'red', category: 'preservative', definition: 'Tert-butylhydroquinone. Synthetic antioxidant preservative. Possible health concerns at high doses.', flags: ['additive', 'ultra-processed'] },
  'bha': { color: 'red', category: 'preservative', definition: 'Butylated hydroxyanisole (E320). Possible endocrine disruptor and carcinogen.', flags: ['additive', 'risky'] },
  'bht': { color: 'yellow', category: 'preservative', definition: 'Butylated hydroxytoluene (E321). Synthetic antioxidant. Mixed safety evidence.', flags: ['additive'] },

  // === Additives — Colors ===
  'tartrazine': { color: 'red', category: 'color', definition: 'Yellow food dye (E102). Linked to hyperactivity in children and allergic reactions.', flags: ['additive', 'artificial', 'risky'] },
  'sunset yellow': { color: 'red', category: 'color', definition: 'Orange-yellow dye (E110). Associated with hyperactivity.', flags: ['additive', 'artificial', 'risky'] },
  'caramel color': { color: 'yellow', category: 'color', definition: 'Brown coloring. Some types (Class III/IV) may contain 4-MEI, a potential carcinogen.', flags: ['additive'] },
  'turmeric extract': { color: 'green', category: 'color', definition: 'Natural yellow colorant from turmeric. Has anti-inflammatory properties.', flags: [] },
  'beetroot extract': { color: 'green', category: 'color', definition: 'Natural red colorant from beets. Safe and nutritious.', flags: [] },

  // === Additives — Flavor ===
  'msg': { color: 'yellow', category: 'flavor', definition: 'Monosodium glutamate (E621). Common flavor enhancer. May cause sensitivity in some people.', flags: ['additive'] },
  'monosodium glutamate': { color: 'yellow', category: 'flavor', definition: 'Flavor enhancer (E621). Generally safe but may cause "Chinese restaurant syndrome" in sensitive individuals.', flags: ['additive'] },
  'natural flavors': { color: 'green', category: 'flavor', definition: 'Flavoring derived from natural sources. Vague labeling — actual source may vary.', flags: [] },
  'artificial flavors': { color: 'yellow', category: 'flavor', definition: 'Synthetically created flavoring compounds. Generally safe but not natural.', flags: ['artificial'] },

  // === Emulsifiers & Stabilizers ===
  'lecithin': { color: 'green', category: 'emulsifier', definition: 'Natural emulsifier, often from soy or sunflower. Generally safe.', flags: ['allergen-soy'] },
  'soy lecithin': { color: 'green', category: 'emulsifier', definition: 'Emulsifier from soybeans. Soy allergen concern.', flags: ['allergen-soy'] },
  'carrageenan': { color: 'yellow', category: 'stabilizer', definition: 'Seaweed-derived thickener (E407). Some evidence of gut inflammation.', flags: ['additive'] },
  'xanthan gum': { color: 'green', category: 'stabilizer', definition: 'Natural thickener (E415). Safe and commonly used.', flags: [] },
  'guar gum': { color: 'green', category: 'stabilizer', definition: 'Natural thickener from guar beans (E412). High in fiber. Generally safe.', flags: [] },
  'polysorbate 80': { color: 'red', category: 'emulsifier', definition: 'Synthetic emulsifier (E433). May affect gut barrier and microbiome.', flags: ['additive', 'ultra-processed'] },

  // === Animal-derived ===
  'gelatin': { color: 'yellow', category: 'thickener', definition: 'Protein from animal collagen. Not suitable for vegetarians/vegans.', flags: ['animal-derived'] },
  'carmine': { color: 'yellow', category: 'color', definition: 'Red dye from crushed cochineal insects (E120). Not vegan.', flags: ['animal-derived', 'additive'] },
  'shellac': { color: 'yellow', category: 'glaze', definition: 'Resin secreted by lac bugs. Used as a coating. Not vegan.', flags: ['animal-derived'] },
  'lard': { color: 'yellow', category: 'fat', definition: 'Pig fat. Not suitable for vegetarians, vegans, halal, or kosher diets.', flags: ['animal-derived', 'high-fat'] },

  // === Vitamins & Minerals ===
  'vitamin c': { color: 'green', category: 'vitamin', definition: 'Ascorbic acid. Essential antioxidant vitamin.', flags: [] },
  'vitamin a': { color: 'green', category: 'vitamin', definition: 'Essential for vision, immune function, and skin health.', flags: [] },
  'iron': { color: 'green', category: 'mineral', definition: 'Essential mineral for blood oxygen transport.', flags: [] },
  'calcium': { color: 'green', category: 'mineral', definition: 'Essential mineral for bones and teeth.', flags: [] },
  'folic acid': { color: 'green', category: 'vitamin', definition: 'Vitamin B9. Essential for cell growth and prenatal development.', flags: [] },

  // === Common processed ingredients ===
  'maltodextrin': { color: 'yellow', category: 'filler', definition: 'Highly processed starch derivative. High glycemic index. Used as filler.', flags: ['ultra-processed'] },
  'modified starch': { color: 'yellow', category: 'filler', definition: 'Chemically or physically altered starch. Ultra-processed ingredient.', flags: ['ultra-processed'] },
  'hydrogenated vegetable oil': { color: 'red', category: 'oil', definition: 'Contains trans fats. Strongly linked to heart disease.', flags: ['ultra-processed', 'high-fat', 'risky'] },
  'partially hydrogenated oil': { color: 'red', category: 'oil', definition: 'Source of artificial trans fats. Banned or restricted in many countries.', flags: ['ultra-processed', 'high-fat', 'risky'] },
  'interesterified fat': { color: 'red', category: 'oil', definition: 'Chemically modified fat. Potential metabolic concerns.', flags: ['ultra-processed', 'high-fat'] },
};

export function lookupIngredient(name) {
  const key = name.toLowerCase().trim();
  if (INGREDIENT_DB[key]) return { name, ...INGREDIENT_DB[key] };
  
  // Fuzzy match — check if any DB key is contained in the name
  for (const [dbKey, data] of Object.entries(INGREDIENT_DB)) {
    if (key.includes(dbKey) || dbKey.includes(key)) {
      return { name, ...data, fuzzyMatch: true };
    }
  }
  
  // Unknown ingredient — default yellow
  return {
    name,
    color: 'yellow',
    category: 'unknown',
    definition: 'This ingredient was not found in our database. Tap Analyze for AI-powered classification.',
    flags: [],
    unknown: true,
  };
}

export function classifyIngredients(ingredientList) {
  return ingredientList.map((name) => lookupIngredient(name));
}

export default INGREDIENT_DB;
