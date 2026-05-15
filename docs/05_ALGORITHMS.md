# 05 — Algorithms

Every non-trivial algorithm in the codebase, explained in plain language.

---

## 1. Macro Score Calculator (`thresholds.js`)

**Purpose:** Instantly check if a product breaches FSSAI/WHO hard limits. Returns a `/10` score with named breach objects.

**Complexity:** O(1) — constant time regardless of product.

**Algorithm:**
```
score = 10 (start perfect)

for each nutrient in [sugar, sodium, satFat, transFat, caffeine]:
    1. parseNum(nutrition[nutrient])  ← strips units, handles null
    2. if value > THRESHOLD[nutrient].value:
        breaches.push({ type, value, limit, source })
        score -= penalty (sugar: -3, sodium: -3, satFat: -2, transFat: -3, caffeine: -2)

score = max(0, score)
return { score, breaches, missingData }
```

**Key design decision:** Penalties are **additive deductions** from 10, not percentage-based. This makes it predictable: "3 breaches = score 2/10" is intuitive.

**Sync mechanism:** `THRESHOLDS` is a module-level mutable object. On app launch, `syncThresholds()` fetches overrides from Supabase `threshold_limits` table and overwrites the defaults — so FSSAI limit updates are pushed without a code release.

---

## 2. Full Health Score (`scoring.js → calculateScore()`)

**Purpose:** Compute a 0–100 composite health score combining macronutrition, ingredient quality, and user health profile.

**Complexity:** O(n) where n = number of classified ingredients.

**Algorithm (Multi-Vector):**

```
VECTOR 1: Macro Score (starts at 100)
  penaltyMultiplier = 1.3 if healthMode === 'fitness' else 1.0
  
  conditionMultipliers = { sugar: 1, fat: 1, saturatedFat: 1, sodium: 1 }
  for each healthCondition in user.healthConditions:
      conditionMultipliers[condition.nutrient] = max(current, condition.multiplier)
  
  applyDeduction(nutrient, amount, WHO_THRESHOLD.high, maxWeight, condMul):
      if amount > threshold:
          deduction = (amount / threshold) * maxWeight * condMul
          deduction = min(deduction, maxWeight * 2)  ← cap to prevent insane scores
          macroScore -= deduction

  Nutrients penalized:
      Sugar        → weight 15 (× 1.3 in fitness mode, × 1.8 for diabetes)
      Fat          → weight 10
      Saturated Fat→ weight 10
      Sodium       → weight 12 (× 1.6 for hypertension, × 2.0 for kidney disease)
  
  Health-Washing Cap:
      if totalDeductions > 20:
          fiber bonus BLOCKED
          protein bonus BLOCKED
      else:
          fiber bonus: +5 if fiber >= 3g
          protein bonus: +3 × 1.5 in fitness mode if protein >= 5g

VECTOR 2: Ingredient Quality Score (starts at 100)
  for each ingredient in classifiedIngredients:
      severity = ingredient.health_risk_score  ← from ingredientDictionary
      if severity >= 7: -10 points
      if severity >= 5: -4 points

ALLERGEN OVERRIDE:
  if allergenWarnings.length > 0:
      macroScore -= 10
      ingredientScore -= 10

Output: { score, grade, macro: {...}, ingredientQuality: {...} }
```

**Why the health-washing cap?** A product can't get fiber/protein bonuses if it's loaded with sugar and fat. This prevents manufacturers from gaming the score by adding trace amounts of fiber to an otherwise junk product.

---

## 3. Safe Portion Calculator (`scoring.js → calculateSafePortion()`)

**Purpose:** Calculate the maximum grams per day of this product before exceeding WHO daily allowances.

**Complexity:** O(1)

**Algorithm (WHO Daily Limit Division):**
```
DAILY_LIMITS = { sugar: 50g, sodium: 2000mg, saturatedFat: 20g }

for each nutrient in [sugar, sodium, saturatedFat]:
    if product has this nutrient:
        maxPortionFromThisNutrient = (DAILY_LIMIT / nutrition[nutrient]) * 100
        if this is the lowest so far:
            maxSafeGrams = maxPortionFromThisNutrient
            limitBottleneck = nutrient name

Round to nearest 50g for clean display.
Return the most restrictive bound.
```

**Example:** Maggi has 870mg sodium per 100g.
- `(2000 / 870) * 100 = 229g` → "You can safely eat ~230g per day before hitting sodium limits."

---

## 4. AI Provider Fallback Chain (`ai/index.js → executeJsonWithFallback()`)

**Purpose:** Try multiple AI providers in priority order. If one fails, move to the next. Log every attempt.

**Complexity:** O(r) where r = number of routes (providers × models × keys).

**Algorithm:**
```
routes = buildCleanupRoutes(registry)
  → flattens: [
      { id: "gemini:0:0", provider: Gemini, model: flash, key: key1 },
      { id: "gemini:0:1", provider: Gemini, model: flash, key: key2 },
      { id: "openai:0:0", provider: OpenAI, model: gpt-4o-mini, key: key1 },
    ]

attempted = [...previouslyAttemptedRouteIds]  ← skips already-tried routes across retry cycles

for each route in routes:
    if route.id in attempted: skip
    
    try:
        result = callRouteJson(route, prompt)
        trace.push({ success: true, ...route })
        return { data: result, route, trace }
    catch error:
        classified = classifyTransportError(error)
        trace.push({ success: false, error, retryable: classified.retryable })
        attempted.push(route.id)
        continue

throw routes_exhausted error with full trace
```

**Key insight:** `attemptedRouteIds` is persisted in the contribution job. This means if a job is interrupted mid-way (user closes app), on the next run it skips routes that already failed and doesn't re-spend API quota.

---

## 5. Contribution Queue Processor (`contributionQueue.js`)

**Purpose:** Process a 5-stage async pipeline for each product contribution. Survive interruption, retry on reconnect.

**Complexity:** O(s) per job where s = number of stages.

**The State Machine:**

```
Each stage: "pending" → "running" → "done" | "skipped" | "blocked"

                    ┌─────────────────────────────────────────┐
                    │            Job Status                    │
                    │  pending → running → completed           │
                    │                  ↘ blocked               │
                    └─────────────────────────────────────────┘

Stage 1: OFF Name Sync
    if !credentials → blocked
    if name invalid → blocked
    POST product name to Open Food Facts → done | retryable error | blocked

Stage 2: OFF Image Upload
    for each photo slot [front, ingredients, nutrition]:
        if already succeeded → skip
        POST image to OFF
        if success → mark done
        if retryable → throw (retry next cycle)
        if blocked → mark blocked + stop

Stage 3: Local OCR
    ML Kit recognizeText(ingredientsUri, nutritionUri)
    build provisional product shape
    if OCR fails → blocked

Stage 4: AI Cleanup
    buildCleanupRoutes(userPrefs)
    executeJsonWithFallback(prompt)
    if no routes → blocked
    if offline → throw (retry)
    if routes_exhausted → throw (retry with fresh routes next cycle)

Stage 5: Supabase Persist
    wait for aiCleanup to be done
    buildProductFromJob(job) → merge OCR+AI data into final Product
    saveProduct(product) to Supabase
    logUserContribution(...)
    recordScan(...)
    cleanupPhotos() → delete local temp files
```

**Exponential Backoff:**
```
baseDelay = min(15min, 30s × 2^(attemptCount-1))
jitter = random(0, 10s)
nextAttemptAt = now + baseDelay + jitter
```
This prevents thundering herd when many devices reconnect at the same time.

---

## 6. OCR Text Normalization

**Purpose:** Convert raw ML Kit OCR output (messy, fragmented) into clean structured JSON.

**Two-phase:**
1. **Phase 1 (instant, offline):** `buildProvisionalOcrResult()` uses regex to extract nutrition values from raw text.
2. **Phase 2 (network, AI):** `normalizeOcrText()` sends the text to the AI fallback chain which returns clean JSON.

**Phase 1 Regex Algorithm:**
```js
// For each nutrition field, try multiple regex patterns
energy: findValue([
    /energy[^0-9]{0,20}(\d+(?:[.,]\d+)?)/i,
    /kcal[^0-9]{0,10}(\d+(?:[.,]\d+)?)/i
])

// Ingredient list splitting
text.split(/\n|,|;|•/)
    .map(item => item.replace(/^\d+[).\s-]*/, '').trim())
    .filter(item => item.length > 1)
    .slice(0, 80)
```

**Phase 2 AI Prompt Engineering:**
The prompt enforces a strict JSON schema, provides product hints (name/brand/barcode from the scan), and specifies "normalize nutrition to per 100g" — this handles labels that show per-serving values.

---

## 7. Allergen Detection (`allergens.js → checkAllergens()`)

**Purpose:** Find which of the user's allergens are present in the ingredient list.

**Complexity:** O(n × m) where n = ingredients count, m = user's allergen count.

**Algorithm:**
```
for each userAllergen in user.allergies:
    for each ingredient in product.ingredients:
        if ingredient text contains allergen keyword:
            add to warnings (avoid duplicates)
```

---

## 8. Ingredient Dictionary Lookup (`ingredientDictionary.js`)

**Purpose:** Classify each ingredient as red/yellow/green with a risk score.

**Complexity:** O(n × d) where d = dictionary size (~500 entries).

**Algorithm:**
```
for each ingredient in list:
    1. Exact match in dictionary → return entry
    2. Partial match (ingredient contains dictionary key) → return entry
    3. No match → return { color: 'green', health_risk_score: 0 }
```

---

## 9. FFADZ Code Generation (PostgreSQL)

**Purpose:** Generate a unique 5-character alphanumeric code for personal products.

**Algorithm:**
```sql
LOOP
    next_code = 'FFADZ-' + upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5))
    EXIT WHEN NOT EXISTS (SELECT 1 FROM personal_products WHERE ffadz_code = next_code)
END LOOP
RETURN next_code
```

This is a **UUID-sampling** approach with collision checking — effectively O(1) since UUID collisions in 5 chars are astronomically rare.

---

## 10. User Preference Migration (`UserContext.js → migratePrefs()`)

**Purpose:** When loading saved prefs from AsyncStorage, upgrade old formats to the new provider registry format.

**Algorithm:**
```
legacyKey: geminiApiKey (single string) 
newFormat: geminiApiKeys (array) + providers[] registry

migration:
1. If geminiApiKey exists → wrap in array
2. Merge with any keys already in providers[gemini].apiKeys
3. Deduplicate
4. Assign to providers[gemini].apiKeys
5. Set geminiModel from providers[gemini].textModels[0]
6. Compute activeProviderId from ensureProviderRegistry()
```

This ensures users who set up Gemini on an old build get their key correctly imported into the new multi-provider system without losing it.
