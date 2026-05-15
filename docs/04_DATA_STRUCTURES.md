# 04 — Data Structures

Every important object shape in the Ffads codebase, with field explanations.

---

## 1. Product Object

The central data unit. Lives in `ProductContext` (session + history).

```js
{
  // Identity
  id: "uuid-v4-string",               // local unique id (generated on scan)
  barcode: "8901234567890",           // EAN-13 or FFADZ-XXXXX for personal
  name: "Maggi 2-Minute Noodles",
  brand: "Nestle",
  category: "Noodles",
  source: "openfoodfacts",            // "openfoodfacts" | "cache" | "ocr" | "ai_ocr" | "personal_qr"

  // Nutrition (always per 100g)
  nutrition: {
    energy: 400,        // kcal
    protein: 8.5,       // g
    carbs: 62,          // g
    sugar: 3.2,         // g
    fat: 12,            // g
    saturatedFat: 5.4,  // g
    transFat: 0.1,      // g  ← FSSAI mandatory
    fiber: 1.8,         // g
    sodium: 870,        // mg
    caffeine: null,     // mg  ← only relevant for drinks
  },

  // Ingredients
  ingredients: ["Wheat Flour", "Palm Oil", "Salt", "MSG"],
  ingredientsRaw: "WHEAT FLOUR (MAIDA) 70%, PALM OIL 12%, SALT...",

  // Regulatory
  nutriscore: "D",                    // Nutri-Score grade (from OFF)
  novaGroup: 4,                       // NOVA processing level 1–4

  // Images
  images: {
    front: "https://cloudinary.com/...",
    ingredients: "https://cloudinary.com/...",
    nutrition: "https://cloudinary.com/...",
  },
  pendingLocalImages: ["/path/to/local.jpg"],  // before OFF sync

  // AI Analysis (optional)
  aiData: {
    harmfulChemicals: [
      { name: "MSG", realName: "Monosodium Glutamate", risk: "May cause headaches in sensitive individuals" }
    ],
    animalContentFlag: false,
    animalContentDetails: null,
    aiScore: 42,
    aiRecommendation: "High sodium content. Limit consumption to once a week.",
  },

  // Timestamps
  scannedAt: "2026-04-29T08:00:00.000Z",
  analyzed: true,

  // OCR / Contribution metadata
  needsOCR: false,
  contributionSync: {               // present if product was contributed via OCR
    jobId: "job_1714380000_abc123",
    status: "synced",               // "synced" | "queued" | "running" | "blocked"
    message: "Synced successfully.",
    offNameStage: "done",
    offImageStage: "done",
    localOcrStage: "done",
    aiCleanupStage: "done",
    supabaseStage: "done",
    lastError: null,
    cleanupTrace: [],
    offImageResults: {},
  },

  // Personal QR fields (only when source === "personal_qr")
  personalProductId: "uuid",
  source: "personal_qr",
  description: "My homemade granola",
}
```

---

## 2. Contribution Job Object

Lives in `AsyncStorage` under `@ffads_contribution_jobs_v2`. Each job is one product upload.

```js
{
  id: "job_1714380000_abc123",    // unique job id
  status: "pending",              // "pending" | "running" | "blocked" | "completed"
  createdAt: "2026-04-29T...",
  updatedAt: "2026-04-29T...",
  attemptCount: 2,
  nextAttemptAt: "2026-04-29T...",  // exponential backoff timestamp
  lastError: null,

  // What product this is about
  productSnapshot: { ...Product },  // sanitized copy at time of submission
  requestedName: "Maggi Noodles",   // name user typed in OCR overlay
  contributorEmail: "user@example.com",

  // Photo file paths (local device storage)
  photoPaths: {
    front: "/data/user/0/.../ffads_jobs/job_1_front.jpg",
    ingredients: "/data/user/0/.../ffads_jobs/job_1_ingredients.jpg",
    nutrition: null,
  },

  // Stage tracking (each can be: "pending" | "done" | "skipped" | "blocked")
  offNameStage: "done",         // Stage 1: push name to Open Food Facts
  offImageStage: "done",        // Stage 2: push images to Open Food Facts
  offStage: "done",             // Combined OFF stage
  localOcrStage: "done",        // Stage 3: ML Kit OCR extract
  aiCleanupStage: "done",       // Stage 4: AI normalize OCR text
  supabaseStage: "pending",     // Stage 5: save to Supabase

  // Results of each stage
  offResult: { nameSynced: true, imageCount: 2 },
  offImageResults: {
    front: { success: true, uploadedAt: "..." },
    ingredients: { success: true, uploadedAt: "..." },
    nutrition: { success: false, blocked: true, error: "403" },
  },
  localOcrRaw: { ingredientsText: "...", nutritionText: "...", combinedText: "..." },
  localOcrResult: { ...provisional Product shape },
  cleanupResult: { name: "...", brand: "...", ingredients: [...], nutrition: {...} },
  aiCleanupRoute: { providerId: "gemini", model: "gemini-2.5-flash", maskedKey: "***abc123" },
  cleanupTrace: [
    { routeId: "gemini:0:0", success: true, ... }
  ],
  currentCleanupAttemptedRouteIds: [],
}
```

---

## 3. AI Provider Registry

Stored in `UserContext` state under `providers`. Persisted to AsyncStorage.

```js
{
  providers: [
    {
      id: "gemini",
      label: "Gemini",
      kind: "gemini",                       // "gemini" | "openai" | "ollama"
      enabled: true,
      priority: 0,                          // lower = higher priority
      textModels: ["gemini-2.5-flash"],
      textModel: "gemini-2.5-flash",
      apiKeys: ["AIzaSy..."],
      apiKey: "AIzaSy...",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    },
    {
      id: "openai_custom",
      label: "My OpenAI",
      kind: "openai",
      enabled: false,
      priority: 1,
      textModels: ["gpt-4o-mini"],
      apiKeys: ["sk-..."],
      baseUrl: "https://api.openai.com",
    }
  ],
  activeProviderId: "gemini",
}
```

---

## 4. AI Route Object

A flat route built by `buildCleanupRoutes()`. Used by the fallback executor.

```js
{
  id: "gemini:0:0",             // providerId:modelIndex:keyIndex
  providerId: "gemini",
  providerLabel: "Gemini",
  providerPriority: 0,
  kind: "gemini",
  baseUrl: "https://generativelanguage.googleapis.com/v1beta",
  model: "gemini-2.5-flash",
  apiKey: "AIzaSy...",
  keyIndex: 0,
  modelIndex: 0,
  maskedKey: "***abc123",
}
```

---

## 5. MacroScore Result

Output of `calculateMacroScore(nutrition)` from `thresholds.js`.

```js
{
  score: 7,              // 0–10 (starts at 10, deducted per breach)
  missingData: false,
  breaches: [
    {
      type: "Sodium",
      value: 870,
      unit: "mg",
      limit: 400,
      message: "Exceeds limit (870mg > 400mg)",
      source: "WHO",
    },
    {
      type: "Trans Fat",
      value: 0.5,
      unit: "g",
      limit: 0.2,
      message: "Exceeds FSSAI limit (0.5g > 0.2g)",
      source: "FSSAI",
    }
  ]
}
```

---

## 6. Full Score Result

Output of `calculateScore()` from `scoring.js`. Used in CompareScreen.

```js
{
  // Legacy fields (backward compat)
  score: 42,
  grade: "Fair",
  scoreColor: "#F59E0B",
  deductions: [
    { reason: "Excess Sodium (1.6x due to health condition)", amount: 18, detail: "870mg per 100g" }
  ],
  bonuses: [
    { reason: "Good protein content", amount: 3, detail: "8.5g per 100g" }
  ],

  // New multi-vector
  macro: { score: 42, grade: "Fair", color: "#F59E0B", deductions: [...], bonuses: [...] },
  ingredientQuality: { score: 70, grade: "Good", color: "#84CC16", deductions: [...] },
}
```

---

## 7. Safe Portion Result

Output of `calculateSafePortion(nutrition)` from `scoring.js`.

```js
{
  isSafe: false,
  maxGrams: 230,             // rounded to nearest 50g
  bottleneck: "Sodium",      // which nutrient is the limiting factor
  message: "Exceeds WHO daily limit for Sodium beyond 230 g/ml.",
  isSevere: false,           // true if maxGrams <= 150
}
```

---

## 8. UserPrefs Object (UserContext state)

```js
{
  // Loaded flag
  loaded: true,
  sessionExpired: false,

  // Health settings
  allergies: ["milk", "peanuts"],
  healthConditions: ["diabetes"],
  healthMode: "strict",
  diet: "vegetarian",

  // AI settings
  analysisMode: "balanced",
  geminiModel: "gemini-2.5-flash",
  geminiApiKeys: ["AIzaSy..."],
  geminiActiveKeyIndex: 0,
  providers: [...],
  activeProviderId: "gemini",
  aiEnabled: true,

  // Backend credentials
  supabaseUrl: "https://xxxx.supabase.co",
  supabaseAnonKey: "eyJh...",

  // Open Food Facts
  offUsername: "ffadsapp",
  offPassword: "...",
  offContactEmail: "contact@ffads.app",

  // Auth
  email: "user@example.com",
  fullName: "Ismail",
}
```

---

## 9. Supabase `products` Row

```sql
{
  id: uuid,
  barcode: "8901234567890",
  name: "Maggi 2-Minute Noodles",
  brand: "Nestle",
  category: "Noodles",
  ingredients: ["Wheat Flour", "Palm Oil"],   -- jsonb array
  ingredients_raw: "WHEAT FLOUR (MAIDA)...",
  nutrition: { energy: 400, sugar: 3.2 },     -- jsonb object
  source: "openfoodfacts",
  nutriscore: "D",
  nova_group: 4,
  scanned_at: "2026-04-29T08:00:00Z",
  created_at: "2026-04-29T08:00:00Z",
  updated_at: "2026-04-29T08:00:00Z"
}
```

---

## 10. Processing Event (telemetry)

Every stage in the contribution pipeline emits a `processing_events` row:

```js
{
  job_id: "job_1714380000_abc123",
  event_type: "ai_cleanup_route_succeeded",
  stage: "ai_cleanup",
  status: "success",
  barcode: "8901234567890",
  provider_id: "gemini",
  provider_label: "Gemini",
  model: "gemini-2.5-flash",
  masked_key: "***abc123",
  route_id: "gemini:0:0",
  attempt_number: 1,
  message: "Route succeeded.",
  payload: { ... },
  created_at: "2026-04-29T08:00:00Z"
}
```
