# 08 — Code Evolution: How Simple Became Complex

This traces how each system in Ffads started simple and evolved into what it is today.

---

## 1. Product Scoring

### Version 1 — "Just check if it's bad"
```js
// The original. Literally this.
function isUnhealthy(sugar) {
    return sugar > 10;
}
```

### Version 2 — Multiple nutrients, simple thresholds
```js
function checkProduct(nutrition) {
    const warnings = [];
    if (nutrition.sugar > 10) warnings.push('High Sugar');
    if (nutrition.sodium > 400) warnings.push('High Sodium');
    if (nutrition.fat > 20) warnings.push('High Fat');
    return warnings;
}
```

### Version 3 — Score out of 10 (thresholds.js today)
```js
// Fixed-penalty breach checker
// Still fast, still offline, but returns a number
let score = 10;
if (sugar > 10) { breaches.push({...}); score -= 3; }
if (sodium > 400) { breaches.push({...}); score -= 3; }
if (satFat > 5) { breaches.push({...}); score -= 2; }
```

### Version 4 — Full 0–100 score with continuous interpolation (scoring.js today)
```js
// Proportional deduction: more sugar = more penalty
// Amount / threshold × weight × healthConditionMultiplier
applyDeduction('Sugar', sugar, WHO_THRESHOLDS.sugar.high, SCORING_WEIGHTS.sugar * penaltyMultiplier, ...);

// Health-washing cap (bonuses blocked if bad enough)
if (totalDeductions > 20) { fiberBonus = 0; }

// Two-vector: macro score + ingredient quality score
return { macro: { score }, ingredientQuality: { score } };
```

**Why the complexity?** A binary pass/fail was useless. A simple /10 was too coarse. The 0-100 model with condition-aware multipliers is what allows the app to show meaningful differences between a "Fair (48/100)" product and an "Avoid (22/100)" product.

---

## 2. AI Integration

### Version 1 — One Gemini key, hardcoded
```js
const GEMINI_KEY = "AIzaSy...";
const response = await fetch(`...?key=${GEMINI_KEY}`, {...});
```

### Version 2 — Key in user settings
```js
const key = userPrefs.geminiApiKey;  // stored in AsyncStorage
```

### Version 3 — Multiple keys (rotation)
```js
const keys = userPrefs.geminiApiKeys;
const activeKey = keys[userPrefs.geminiActiveKeyIndex];
// Rotate on 429 error
if (error.status === 429) dispatch({ type: 'ROTATE_GEMINI_KEY' });
```

### Version 4 — Multiple providers (Gemini + OpenAI + Ollama)
```js
// providerPresets.js — registry of ordered providers
providers: [
    { id: 'gemini', kind: 'gemini', apiKeys: [...], textModels: [...] },
    { id: 'openai_custom', kind: 'openai', baseUrl: '...', ... },
    { id: 'local_ollama', kind: 'ollama', baseUrl: 'http://localhost:11434', ... },
]
```

### Version 5 — Fallback chain with full trace + persistent retry (today)
```js
// buildCleanupRoutes() flattens providers × models × keys into flat route list
// executeJsonWithFallback() tries each, skips previously-failed routes
// attemptedRouteIds persisted in job → no duplicate retries across sessions
```

**Why the complexity?** Single provider = single point of failure. Free tier rate limits hit constantly during testing. Needing to add a backup key or a local Ollama model shouldn't require a code change.

---

## 3. Product Contribution Pipeline

### Version 1 — Direct upload, no queue
```js
// User takes photo → immediately tries to upload
const result = await uploadToOFF(photo);
if (result.ok) showSuccess(); else showError();
```
**Problem:** If network dropped mid-upload, the whole thing failed silently. User had no idea if it saved.

### Version 2 — Queue in memory
```js
let queue = [];
queue.push({ product, photo });
processQueue(); // runs the queue after each push
```
**Problem:** App kill = queue lost forever.

### Version 3 — Queue in AsyncStorage (v1)
```js
// Save queue to AsyncStorage after each mutation
await AsyncStorage.setItem('@ffads_contribution_jobs_v1', JSON.stringify(queue));
```
**Problem:** Schema changes broke old jobs silently. No stage tracking — if a job was 3/5 stages done and got interrupted, it restarted from stage 1.

### Version 4 — Versioned queue with stage machine (today, v2)
```js
// Each job has explicit stage fields
// "pending" | "running" | "done" | "skipped" | "blocked" per stage
// Processing events logged to Supabase for audit trail
// Exponential backoff with jitter
// v1 → v2 migration on first load
offNameStage: "done",
offImageStage: "pending",
localOcrStage: "done",
aiCleanupStage: "done",
supabaseStage: "pending",
```
**Why:** A 5-stage pipeline that interleaves 3 external APIs (OFF, ML Kit, AI) needs explicit state. Without per-stage tracking, any interruption requires restarting all stages — wasting API calls and money.

---

## 4. User Preferences Storage

### Version 1 — Single shared key
```js
const KEY = '@ffads_user_prefs';
AsyncStorage.setItem(KEY, JSON.stringify(prefs));
```
**Problem:** If user A logs in on a device that user B used, they get user B's settings.

### Version 2 — Per-user scoped key
```js
const KEY = userId ? `@ffads_user_prefs_${userId}` : '@ffads_user_prefs';
// Guest uses global key, logged-in user uses their own key
```

### Version 3 — Migration on sign-in (today)
```js
// On SIGNED_IN event:
const scopedKey = `@ffads_user_prefs_${userId}`;
if (scopedKey !== currentStorageKeyRef.current) {
    // Load the user's personal settings and apply them
    const savedPrefs = JSON.parse(await AsyncStorage.getItem(scopedKey));
    dispatch({ type: 'SET_PREFS', payload: { ...savedPrefs, email, fullName } });
}
```

---

## 5. Supabase Client Initialization

### Version 1 — Module-level constant
```js
// Crashed if credentials were missing
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
export default supabase;
```

### Version 2 — Lazy singleton
```js
let _client = null;
export function getSupabaseClient() {
    if (!_client && url && key) {
        _client = createClient(url, key);
    }
    return _client;
}
```

### Version 3 — Hot-swappable credentials (today)
```js
export function setSupabaseCredentials(url, key) {
    // Called on every UserContext state change
    // Creates a new client if credentials changed
    if (url !== _url || key !== _key) {
        _client = url && key ? createClient(url, key) : null;
        _url = url;
        _key = key;
    }
}
```
This allows users to enter their own Supabase credentials in the Profile screen and have them take effect immediately without restart.

---

## 6. Open Food Facts Integration

### Version 1 — Basic fetch
```js
const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
```

### Version 2 — Nutrition normalization
The OFF API returns nutrition per 100g AND per serving in inconsistent keys:
```js
// OFF uses _100g suffix in the "nutriments" object
const nutrition = {
    energy: product.nutriments['energy-kcal_100g'] || product.nutriments['energy_100g'] / 4.184,
    sugar: product.nutriments['sugars_100g'],
    ...
};
```

### Version 3 — Image URL fetching + User-Agent + error handling (today)
```js
// Multiple fallback URL patterns for images
// Required User-Agent header
// Retry logic for 429 rate limits
// Separate function for image upload (contributing new products)
```

---

## 7. Ingredient Classification

### Version 1 — Hardcoded short list
```js
const BAD_INGREDIENTS = ['MSG', 'aspartame', 'HFCS'];
const isBad = ingredients.some(i => BAD_INGREDIENTS.includes(i));
```

### Version 2 — Color-coded dictionary
```js
const DICT = {
    'msg': { color: 'red', reason: 'May cause headaches' },
    'aspartame': { color: 'yellow', reason: 'Artificial sweetener, debated' },
    'vitamin c': { color: 'green', reason: 'Antioxidant' },
};
```

### Version 3 — Risk scores + fuzzy matching + AI supplement (today)
```js
// ingredientDictionary.js: 500+ entries with health_risk_score 0-10
// Partial match: "contains MSG" still matches "MSG" entry
// ingredientCache.js: AI analyzes unknown ingredients, caches results for 7 days
// IngredientModal: shows full AI breakdown for any ingredient on tap
```

---

## 8. Personal QR Products

### Version 1 — Didn't exist

### Version 2 — Static QR code with no data
The first version just generated a QR with the barcode. Scanning it with any reader just showed the raw barcode.

### Version 3 — FFADZ-code QR → full product lookup (today)
```
1. CreateQrProductScreen → saves to Supabase personal_products
2. generate_ffadz_code() PostgreSQL trigger → assigns "FFADZ-XXXXX"
3. NativeQrCode component renders QR with that code
4. ScannerScreen detects "FFADZ-" prefix → fetches from Supabase personal_products
5. Transforms personal product into standard Product shape
6. Routes to ProductDetailScreen (same as any other scan)
```

The elegance: the FFADZ code is a Supabase lookup key. The "product database" for personal products IS Supabase. Scanning a FFADZ QR works on any device with the app installed.
