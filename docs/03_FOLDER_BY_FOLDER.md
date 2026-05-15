# 03 — Folder-by-Folder Reference

## `src/screens/` — The 9 Screens

### `ScannerScreen.js` (41 KB — largest file)
**What it does:** The main screen. Runs the camera, detects barcodes, orchestrates the full scan-to-display pipeline.

**Key responsibilities:**
- Manages camera lifecycle (permission request, mount/unmount)
- Debounces barcode detection to prevent duplicate scans
- Calls Open Food Facts API for product lookup
- Falls back to Supabase if OFF fails
- Dispatches `ADD_PRODUCT` to ProductContext
- Hosts the Scanner Tabs UI (History, Session, Compare)

**Why it's so large:** It coordinates 4 external systems (camera, OFF, Supabase, store) and renders a real-time viewfinder. Most of the size is the Scanner tab UI.

---

### `ProductDetailScreen.js` (37 KB)
**What it does:** Shows everything about a scanned product — images, nutrition, ingredients, AI analysis, Health Check card, OCR contribution button.

**Key responsibilities:**
- Fetches OFF product images (lazy, with retry)
- Runs `calculateMacroScore()` (memoized)
- Runs `calculateSafePortion()` (memoized)
- Runs `checkAllergens()` (memoized)
- Renders ingredient chips with red/yellow/green classification
- Handles AI analysis button → `analyzeProduct()`
- Renders QR code for personal products (`NativeQrCode` component)
- Handles OCR upload flow via `OCRScannerOverlay`

---

### `CompareScreen.js` (31 KB)
**What it does:** Side-by-side comparison of 2 products with full nutrient diffs and ingredient analysis.

---

### `ProfileScreen.js` (15 KB)
**What it does:** The settings hub. Hosts 5 tabs:
- `HealthTab` — allergies, diet, health conditions, health mode
- `ApiTab` — Supabase, Gemini keys, OpenAI, Ollama config, provider ordering
- `AITab` — AI model selection, analysis mode
- `ContributionsTab` — shows contribution queue status
- `HistoryTab` — scan history

---

### `LoginScreen.js` (10 KB)
**What it does:** Supabase Auth email/password login + signup. Also handles magic link. On success, writes `email` and `fullName` to UserContext.

---

### `CreateQrProductScreen.js` (17 KB)
**What it does:** Form to create a personal QR product. Collects name, brand, description, nutrition values, ingredients, and up to 3 photos. Saves to Supabase `personal_products` table + uploads images to Cloudinary.

---

### `MyQrScreen.js` (10 KB)
**What it does:** Lists all personal QR products owned by the logged-in user. Fetches from Supabase `personal_products`.

---

### `PersonalQrDetailScreen.js` (11 KB)
**What it does:** Shows the detail view for a personal QR product (before it is merged into the standard ProductDetail flow). Displays the native QR code and Cloudinary images.

---

### `AnimatedSplashScreen.js` (2.3 KB)
**What it does:** Shows an animated logo while the app bootstraps (AsyncStorage loads, Supabase session restores). Transitions to the main navigator when `userPrefs.loaded === true`.

---

## `src/components/` — The 15+ Components

### `NutritionTable.js`
Renders a styled table of all nutrition rows. Uses `WHO_THRESHOLDS` to show Low/Med/High badges. Rows: Energy, Protein, Carbs, Sugar, Total Fat, Saturated Fat, **Trans Fat**, Fiber, Sodium, **Caffeine** (last two added with FSSAI limits).

### `AICard.js` / `AICardPreview.js`
`AICard` is a thin proxy that renders `AICardPreview`. `AICardPreview` shows the AI analysis result: score ring, harmful chemicals list, animal content flag, recommendation.

### `AIQualityModal.js`
Modal for testing/validating the configured AI provider chain before running real analysis.

### `AllergyWarning.js`
Displays allergen conflicts between user's allergy list and product ingredients. Shows matching allergen name + emoji.

### `IngredientChip.js`
A pill-shaped chip for each ingredient, colored red/yellow/green based on risk level.

### `IngredientModal.js` (12 KB)
Bottom sheet modal for ingredient deep-dive. Shows the ingredient's risk explanation, health risk level, animal-derived flag, banned countries, safer alternatives — powered by the ingredient cache.

### `OCRScannerOverlay.js` (16 KB)
A full-screen camera overlay for capturing the 3 product photos (front, ingredients, nutrition). Has a live preview grid, slot indicators, and submission logic.

### `FloatingTabBar.js`
Custom floating bottom tab bar (glassmorphism style).

### `ScoreBreakdownModal.js`
Modal showing the exact math behind the health score — deductions, bonuses, WHO threshold math.

### `ScoreBadge.js` / `VerdictBadge.js`
Small inline badges showing score number or "Safe/Caution/Avoid" verdict.

### `ScanGroupHeader.js`
Section header for grouped scan history (Today / Yesterday / Older).

### `ProductSelector.js`
Dropdown/selector for picking a product for comparison.

### `EmptyState.js`
Generic empty state illustration component.

---

## `src/services/` — The Business Logic Layer

### `analysis.service.js`
**The orchestration layer for product analysis.** Combines `calculateMacroScore()` (local) with AI provider analysis. Handles caching: checks Supabase first, polls if another device is analyzing the same product, writes result back.

### `contributionQueue.js` (37 KB — most complex file)
**The persistent job queue for product contributions.** When a user uploads a new product, a `Job` object is created and saved to AsyncStorage. The queue processes jobs in stages:
1. OFF name sync
2. OFF image upload  
3. Local OCR (ML Kit)
4. AI cleanup (normalize OCR text)
5. Supabase persist

Each stage can be `pending | running | done | skipped | blocked`. Jobs persist across app restarts and retry automatically.

### `openfoodfacts.js` (13 KB)
**Open Food Facts API integration.** Handles product lookup by barcode, product image URL fetching, name sync, and image upload. Implements proper `User-Agent` headers (required by OFF policy).

### `cloudinary.js` (9.5 KB)
**Cloudinary image upload service.** Used for personal QR product images. Implements signed upload (never exposes the API secret on-device — uses Supabase to generate signatures).

### `ingredientCache.js` (8.8 KB)
**Local cache for AI ingredient analysis results.** Checks AsyncStorage before making AI calls. Saves results so the same ingredient is never re-analyzed. Has expiry logic (7 days).

### `connectivity.js`
**Network state checker.** Uses `@react-native-community/netinfo` to check if the device is online before making expensive network calls.

### `ocr.js`
**Thin wrapper** around `@react-native-ml-kit/text-recognition`. Handles the `isOCRAvailable()` check and `recognizeText(uri)` call.

### `telemetry.js`
**Error logging.** `logError(context, error, metadata)` — currently a console wrapper with a hook for future Sentry/Crashlytics integration.

### `queue.js` (6.8 KB)
**Low-level queue primitives** shared by the contribution queue system. Handles read/write/lock.

### `product.service.js`
**Thin product normalization layer.** Normalizes raw OFF API responses into the internal Product shape.

### `qrPdf.js` (4.5 KB)
**PDF generation for personal QR products.** Uses `expo-print` to generate a styled PDF containing the product's QR code.

### `gemini.js`
**Legacy stub.** Single re-export that points to the new `ai/` system for backwards compatibility.

---

## `src/services/ai/` — The AI Abstraction

### `index.js` (24 KB — the core)
The entire AI provider system lives here:
- `buildAnalysisPrompt()` — product analysis prompt (ingredients → harmful chemicals)
- `buildIngredientPrompt()` — single ingredient deep-dive prompt
- `buildOcrCleanupPrompt()` — OCR text → clean JSON prompt
- `callGeminiJson()` — Gemini API caller
- `callOpenAICompatibleJson()` — any OpenAI-compatible endpoint
- `callOllamaJson()` — local Ollama
- `callRouteJson()` — dispatcher (routes to correct caller based on `kind`)
- `executeJsonWithFallback()` — tries all routes in order, collects trace
- `buildCleanupRoutes()` — builds the flat list of routes from the provider registry
- `runLocalOcr()` — runs ML Kit OCR on ingredient/nutrition photos
- `buildProvisionalOcrResult()` — creates a rough product shape from raw OCR
- `normalizeOcrText()` — sends OCR to AI for cleanup
- `runDeepAnalysis()` — full product analysis
- `analyzeIngredient()` — single ingredient analysis

### `providerPresets.js` (7 KB)
Manages the **provider registry** — the ordered list of AI providers the user has configured. Handles migration from old single-key format to the new multi-provider format.

---

## `src/services/supabase/` — Database Layer

| File | Tables accessed |
|------|----------------|
| `client.js` | Supabase client initialization, credential hot-swap |
| `products.js` | `products`, `product_ai_data`, `product_images` |
| `users.js` | `user_profiles`, `user_scans` |
| `contributions.js` | `user_contributions` |
| `ingredients.js` | `ingredient_knowledge` (deep ingredient cache) |
| `personalProducts.js` | `personal_products`, `personal_product_images`, `personal_product_scans` |
| `processing.js` | `processing_events` (telemetry for contribution jobs) |
| `index.js` | Re-exports everything for clean imports |

---

## `src/store/` — Global State

### `UserContext.js` (14 KB)
- Reducer with 20+ action types
- Loads from AsyncStorage on mount (with 5s timeout)
- Saves to AsyncStorage on every state change
- Listens to Supabase `onAuthStateChange`
- Per-user storage keys (`@ffads_user_prefs_<userId>`)
- Exports helpers: `getActiveProvider()`, `getGeminiKey()`, `getOFFCredentials()`, `getSupabaseCredentials()`

### `ProductContext.js`
- `sessionScans` (in-memory only) + `history` (AsyncStorage)
- Version-gated history (`DATA_VERSION = '3'`) — stale data auto-cleared
- `groupProductsByDate()` helper exported for ScannerScreen

### `AppProvider.js`
Wraps both contexts into a single `<AppProvider>` for clean mounting in `App.js`.

---

## `src/utils/` — Pure Logic

### `thresholds.js`
Offline-first breach detector. Holds the `THRESHOLDS` object (synced from Supabase on login). `calculateMacroScore()` runs in O(1) with no network calls.

### `scoring.js`
Full 0–100 health scoring engine. Two-vector: macronutrients + ingredient risk. Implements health-washing cap (fiber/protein bonuses blocked if deductions > 20).

### `constants.js`
All WHO + FSSAI threshold constants, scoring weights, health condition multipliers, allergen list, Gemini model presets.

### `allergens.js`
`checkAllergens(ingredients, userAllergies)` — O(n×m) scan. Returns matching allergen objects.

### `ingredientDictionary.js` (11 KB)
Hardcoded ingredient classification dictionary. Returns red/yellow/green + risk score for known ingredients. Supports fuzzy partial matching.

---

## `src/theme/` — Design System

| File | What it defines |
|------|----------------|
| `colors.js` | All color tokens (primary, surface, text, gradients, score colors) |
| `typography.js` | Text style presets (h1–h4, body, bodyBold, caption, label) |
| `spacing.js` | Spacing scale (xs/sm/md/lg/xl), borderRadius presets, shadow presets |
