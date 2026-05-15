# 07 — Problems Faced & How We Fixed Them

Every significant problem encountered during development, what caused it, and the solution applied.

---

## 1. `product_ai_data` Race Condition — Two Devices Analyzing the Same Product

**Problem:**
When two users scanned the same product at the same time and both hit "Analyze", both devices would fire the Gemini API call simultaneously — double the cost, and whoever finished last would overwrite the other.

**Root Cause:**
No distributed lock. Both devices checked the DB, found no `product_ai_data` row, and started analyzing.

**Fix:**
Introduced the `status` field as a **soft lock**:
```
Device A: INSERT product_ai_data with status = "processing"
Device B: sees status = "processing" → starts polling every 2s (up to 6 attempts)
Device A: finishes → UPDATE status = "done"
Device B: poll returns done → uses cached result
```
If Device A fails, it sets `status = "failed"` and Device B will reattempt on next launch.

---

## 2. OCR Contribution Queue Lost Jobs on App Kill

**Problem:**
If the user killed the app mid-contribution (after OCR but before Supabase save), the job was gone. Product was never saved.

**Root Cause:**
Initial implementation held job state only in memory.

**Fix:**
Introduced `AsyncStorage` persistence for the queue under key `@ffads_contribution_jobs_v2`. Jobs are written to AsyncStorage **after every stage**, not just at completion. On every app launch, the queue is reloaded and incomplete jobs resume from wherever they left off.

**Queue key versioning:** When the job schema changed (added `offNameStage`, `offImageStage`), a v2 key was introduced. v1 jobs are migrated in-place on first load and the v1 key is deleted.

---

## 3. Supabase Client Used Before Credentials Were Set

**Problem:**
On cold start, `getSupabaseClient()` was called before `UserContext` had loaded the credentials from AsyncStorage. This caused `supabase is null` crashes in services.

**Root Cause:**
Services were importing and calling Supabase immediately, before `UserContext` could hydrate.

**Fix:**
Made the Supabase client **lazy**: `getSupabaseClient()` returns `null` if credentials aren't set. Every caller wraps calls in:
```js
const client = getSupabaseClient();
if (!client) return;
```
Additionally, `setSupabaseCredentials(url, key)` creates a new client instance whenever credentials change — supporting hot-swap without restart.

---

## 4. AsyncStorage Load Hanging the Splash Screen Indefinitely

**Problem:**
On some devices, `AsyncStorage.getItem()` never resolved (a known Android bug). The app showed the splash screen forever.

**Root Cause:**
No timeout on the AsyncStorage read. If it hung, `userPrefs.loaded` never became `true`, and `AnimatedSplashScreen` never navigated away.

**Fix:**
Wrapped the AsyncStorage read in a `Promise.race()` with a 5-second timeout:
```js
const raw = await Promise.race([
    AsyncStorage.getItem(USER_PREFS_KEY),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
]);
```
If the timeout fires, default prefs are used and the app loads. The user can re-enter credentials manually.

---

## 5. Open Food Facts API Rejected Requests (Missing User-Agent)

**Problem:**
OFF was returning `403 Forbidden` on many product lookups.

**Root Cause:**
The OFF API **requires** a proper `User-Agent` header including the app name, version, and developer contact email. Generic fetch calls without headers were blocked.

**Fix:**
All `openfoodfacts.js` requests now include:
```
User-Agent: Ffads/1.0.0 (contact@ffads.app)
```
The contact email is configurable in user prefs as `offContactEmail`.

---

## 6. Supabase Auth Session Fired Twice Causing Login Loop

**Problem:**
When a user logged in, the splash screen would appear again and ask for login a second time.

**Root Cause:**
`onAuthStateChange` fired `SIGNED_IN` at mount AND again on `TOKEN_REFRESHED`. The second event triggered a re-load of user prefs from the new scoped AsyncStorage key, which dispatched `SET_PREFS` with `loaded: false`, reverting the app to splash.

**Fix:**
- Added `sessionCheckedRef` — a `useRef` flag that prevents the auth subscription from being set up more than once.
- Separated `getSession()` (one-time restore) from `onAuthStateChange` (ongoing listener).
- Only switch the storage key when it genuinely changes (`scopedKey !== currentStorageKeyRef.current`).

---

## 7. Product History Growing Unbounded and Slowing the App

**Problem:**
Power users who scanned hundreds of products saw the app slow down on launch because the entire history was loaded from AsyncStorage at once.

**Root Cause:**
No pagination or size limit on the history array.

**Partial Fix (current):**
- `DATA_VERSION = '3'` check clears stale history on schema changes automatically.
- History is stored as a flat JSON array — read once on mount, updates are minimal.

**Future:** Add a max-history cap (e.g., keep only last 200 products), trim on write.

---

## 8. AI Provider Fallback Retried Already-Failed Routes

**Problem:**
If the AI cleanup stage was interrupted midway (phone went offline), on the next retry it would start over from the first route — even if that route had already failed. This caused unnecessary API calls and slower job completion.

**Root Cause:**
`currentCleanupAttemptedRouteIds` was reset to `[]` on every retry cycle.

**Fix:**
The attempted route IDs are persisted in the job object in AsyncStorage. `executeJsonWithFallback()` accepts `attemptedRouteIds` and skips any already-tried routes. Only after successfully completing (or exhausting all routes) is the list reset.

---

## 9. NutritionTable Showed `undefined` When Nutrition Fields Were Missing

**Problem:**
Products from Open Food Facts often had incomplete nutrition data. The table would render `"undefined g"` or crash on `.toFixed()` of a non-number.

**Root Cause:**
`typeof value === 'number'` check was missing. `nutrition.sugar` could be `undefined`, `null`, `"3.2"` (string), or `0`.

**Fix:**
```js
{typeof value === 'number' ? value.toFixed(1) : value} {row.unit}
```
Plus: `calculateMacroScore()` uses `parseNum()` which handles all these cases:
```js
const parseNum = (val) => {
    if (val === undefined || val === null) return null;
    const num = Number(String(val).replace(/[^0-9.]/g, ''));
    return isNaN(num) ? null : num;
};
```

---

## 10. Cloudinary Upload Exposing API Secret on Device

**Problem:**
Cloudinary uploads require a signed request using the API secret. Hardcoding the secret in the app would expose it to anyone who decompiled the APK.

**Root Cause:**
Initial approach used unsigned uploads (less secure, with format restrictions) or tried to sign on-device.

**Fix:**
Cloudinary signing is done server-side via a **Supabase Edge Function** (not in this repo but referenced by `cloudinary.js`). The app sends the image parameters to the Edge Function, gets back a signature, then uploads directly to Cloudinary CDN. The API secret never leaves the server.

---

## 11. Scanner Tab Overlap / Layout Issues

**Problem:**
Scanner UI elements overlapped each other — the camera viewfinder, the scan result list, and the tab bar were all colliding.

**Root Cause:**
Absolute positioning was used for multiple elements without a coordinated layout strategy. Safe area insets were not consistently applied.

**Fix:**
- Consolidated the scan result list into the `SectionList` header using `ListHeaderComponent`
- Used `useSafeAreaInsets()` throughout for consistent bottom/top padding
- Replaced absolute positioning with flex layout for the main scanner container

---

## 12. OCR Text Quality Was Too Poor for Direct Parsing

**Problem:**
Raw ML Kit OCR text from nutrition label photos was chaotic — numbers ran together, units were missing, lines were in random order. Simple regex couldn't reliably extract values.

**Root Cause:**
Food labels have non-standard layouts. The app initially tried to parse OCR text with simple regex. This worked maybe 60% of the time.

**Fix:**
**Two-phase approach:**
1. Phase 1: Regex extraction gives a **provisional result** immediately (shown to user while AI runs).
2. Phase 2: AI cleanup normalizes the text with full context (product name hint, schema enforcement, per-100g normalization).

This gives the user immediate feedback and correct data once the AI responds.

---

## 13. Missing FSSAI Limits (Trans Fat, Caffeine)

**Problem:**
The app only checked Sugar, Sodium, and Saturated Fat — the three WHO limits. FSSAI mandates Trans Fat ≤ 0.2g and Caffeine ≤ 150mg, but these were only in `FSSAI_LIMITS` as constants never used in breach detection.

**Root Cause:**
The breach checker was written with only WHO limits in mind. FSSAI-specific limits were added to `constants.js` but not wired into `thresholds.js` or `NutritionTable`.

**Fix (April 2026):**
- Added `transFat` and `caffeine` to the offline `THRESHOLDS` object in `thresholds.js`
- Added breach checks for both (Trans Fat: -3 points, Caffeine: -2 points)
- Added `transFat` and `caffeine` to `WHO_THRESHOLDS` in `constants.js` with proper low/medium/high bands
- Added both rows to `NUTRITION_ROWS` in `NutritionTable.js` so they appear with level badges when data is present
