// Ffads — AICard Helpers (Animal detection + Risk level utilities)

// ─────────────────────────────────────────────────────────
// Animal lookup map
// ─────────────────────────────────────────────────────────
export const ANIMAL_MAP = {
  beef:     { emoji: '🐄', label: 'Beef (Cow)',     def: 'Cattle-derived — not vegetarian/vegan.' },
  cow:      { emoji: '🐄', label: 'Cow',            def: 'Cattle-derived ingredient.' },
  chicken:  { emoji: '🐔', label: 'Chicken',        def: 'Poultry-derived — not vegetarian.' },
  pork:     { emoji: '🐷', label: 'Pork (Pig)',     def: 'Pig-derived — not halal/kosher.' },
  pig:      { emoji: '🐷', label: 'Pig',            def: 'Pig-derived — not halal/kosher.' },
  fish:     { emoji: '🐟', label: 'Fish',           def: 'Marine animal-derived ingredient.' },
  seafood:  { emoji: '🦐', label: 'Seafood',        def: 'Derived from shellfish or seafood.' },
  shrimp:   { emoji: '🦐', label: 'Shrimp',         def: 'Shellfish — common allergen.' },
  crab:     { emoji: '🦀', label: 'Crab',           def: 'Crustacean — common allergen.' },
  lobster:  { emoji: '🦞', label: 'Lobster',        def: 'Crustacean — common allergen.' },
  lamb:     { emoji: '🐑', label: 'Lamb (Sheep)',   def: 'Sheep-derived ingredient.' },
  sheep:    { emoji: '🐑', label: 'Sheep',          def: 'Sheep-derived ingredient.' },
  goat:     { emoji: '🐐', label: 'Goat',           def: 'Goat-derived ingredient.' },
  dairy:    { emoji: '🥛', label: 'Dairy (Milk)',   def: 'Milk-derived — contains lactose, not vegan.' },
  milk:     { emoji: '🥛', label: 'Milk',           def: 'Dairy-derived — not suitable for vegans.' },
  egg:      { emoji: '🥚', label: 'Egg',            def: 'Poultry egg-derived — not vegan.' },
  honey:    { emoji: '🍯', label: 'Honey (Bee)',    def: 'Bee-produced sweetener — not vegan.' },
  gelatin:  { emoji: '🦴', label: 'Gelatin',        def: 'Derived from animal bones/skin — not vegetarian.' },
  lard:     { emoji: '🐷', label: 'Lard (Pig Fat)', def: 'Pig fat — not halal/kosher.' },
  tallow:   { emoji: '🐄', label: 'Tallow (Beef)',  def: 'Beef fat — not vegetarian/vegan.' },
  whey:     { emoji: '🥛', label: 'Whey (Dairy)',   def: 'Cheese by-product — not vegan.' },
  casein:   { emoji: '🥛', label: 'Casein (Milk)',  def: 'Milk protein — not vegan.' },
  collagen: { emoji: '🦴', label: 'Collagen',       def: 'Usually sourced from animal connective tissue.' },
  duck:     { emoji: '🦆', label: 'Duck',           def: 'Poultry-derived ingredient.' },
  turkey:   { emoji: '🦃', label: 'Turkey',         def: 'Poultry-derived ingredient.' },
  salmon:   { emoji: '🐟', label: 'Salmon',         def: 'Fatty fish — not vegetarian.' },
  tuna:     { emoji: '🐟', label: 'Tuna',           def: 'Marine fish — not vegetarian.' },
  anchovy:  { emoji: '🐟', label: 'Anchovy',        def: 'Small saltwater fish — common in sauces.' },
  shellfish:{ emoji: '🦪', label: 'Shellfish',      def: 'Mollusk/crustacean — common allergen.' },
  oyster:   { emoji: '🦪', label: 'Oyster',         def: 'Mollusk — common allergen.' },
  squid:    { emoji: '🦑', label: 'Squid',          def: 'Cephalopod marine ingredient.' },
  rabbit:   { emoji: '🐇', label: 'Rabbit',         def: 'Game meat-derived ingredient.' },
  deer:     { emoji: '🦌', label: 'Venison',        def: 'Deer meat-derived ingredient.' },
  venison:  { emoji: '🦌', label: 'Venison',        def: 'Deer meat-derived ingredient.' },
};

export function detectAnimals(details) {
  if (!details) return [];
  const lower = details.toLowerCase();
  const found = [];
  const seen = new Set();
  for (const [key, val] of Object.entries(ANIMAL_MAP)) {
    if (lower.includes(key) && !seen.has(val.label)) {
      seen.add(val.label);
      found.push(val);
    }
  }
  if (found.length === 0) {
    found.push({ emoji: '🐾', label: 'Animal-derived', def: 'Contains ingredients sourced from animals.' });
  }
  return found;
}

// ─────────────────────────────────────────────────────────
// Risk helpers
// ─────────────────────────────────────────────────────────
export function getRiskLevel(riskText) {
  if (!riskText) return 'low';
  const l = riskText.toLowerCase();
  if (l.includes('carcinogen') || l.includes('cancer') || l.includes('severe') || l.includes('ban')) return 'high';
  if (l.includes('moderate') || l.includes('linked') || l.includes('endocrine') || l.includes('hormone')) return 'medium';
  return 'low';
}

export const RISK_CFG = {
  high:   { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', icon: '☠️', label: 'HIGH RISK' },
  medium: { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', icon: '⚠️', label: 'MEDIUM'    },
  low:    { color: '#059669', bg: '#ECFDF5', border: '#A7F3D0', icon: '⚡', label: 'LOW RISK'  },
};
