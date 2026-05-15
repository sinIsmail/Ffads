# 06 — Supabase: Database, Auth & Backend

---

## Database Tables

### `products` (the core catalogue)
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | Auto-generated |
| `barcode` | text UNIQUE | EAN-13 barcode |
| `name` | text | Product name |
| `brand` | text | Brand name |
| `category` | text | Food category |
| `ingredients` | jsonb | Array of strings |
| `ingredients_raw` | text | Raw text from label |
| `nutrition` | jsonb | `{energy, protein, carbs, sugar, fat, saturatedFat, fiber, sodium}` per 100g |
| `source` | text | `"openfoodfacts"` \| `"ocr"` \| `"manual"` |
| `nutriscore` | text | A–E grade |
| `nova_group` | integer | 1–4 processing level |
| `scanned_at` | timestamptz | When first scanned |

**Trigger:** `trg_products_updated_at` → auto-sets `updated_at` on every UPDATE.

**Index:** `idx_products_scanned_at` on `(scanned_at DESC)` — powers history queries.

---

### `product_ai_data` (AI analysis cache)
| Column | Type | Notes |
|--------|------|-------|
| `barcode` | text PK (FK → products) | Cascade delete |
| `animal_content_flag` | boolean | True if animal ingredients detected |
| `animal_content_details` | text | Which animal ingredients |
| `harmful_chemicals` | jsonb | Array of `{name, realName, risk}` |
| `ai_score` | numeric | 0–100 |
| `ai_recommendation` | text | 2-sentence recommendation |
| `gemini_model` | text | Which model was used |
| `status` | text | `"pending"` \| `"processing"` \| `"done"` \| `"failed"` |
| `analyzed_at` | timestamptz | When AI analysis completed |

**Why the `status` field?** The app uses it as a **distributed lock**. When Device A starts analyzing product X, it sets `status = 'processing'`. Device B, scanning the same product, sees `processing` and **polls** instead of re-analyzing — saving API quota.

---

### `product_images`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `barcode` | text FK → products | Cascade delete |
| `image_type` | text | `"front"` \| `"ingredients"` \| `"nutrition"` |
| `url` | text | Public URL |
| `storage_path` | text | Internal storage path |

**Unique constraint:** `(barcode, image_type)` — one image per type per product.

---

### `user_profiles`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `device_id` | text UNIQUE | For anonymous tracking |
| `allergies` | jsonb | Array of allergen IDs |
| `diet` | text | `"omnivore"` \| `"vegan"` etc. |
| `gemini_model` | text | Preferred model |
| `analysis_mode` | text | `"fast"` \| `"balanced"` \| `"deep"` |
| `health_mode` | text | `"relaxed"` \| `"strict"` \| `"fitness"` |
| `off_enabled` | boolean | Whether to use Open Food Facts |
| `ai_fallback` | boolean | Allow AI when OFF fails |
| `offline_mode` | boolean | Force offline mode |

---

### `user_scans`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `barcode` | text FK → products | Cascade delete |
| `user_id` | uuid FK → auth.users | Nullable (anonymous) |
| `user_email` | text | Denormalized for quick queries |
| `scanned_at` | timestamptz | |

**Index:** `idx_user_scans_user_email` on `(user_email, scanned_at DESC)` — powers user scan history queries.

---

### `user_contributions`
Records every OCR contribution submitted.

| Column | Type | Notes |
|--------|------|-------|
| `barcode` | text | |
| `product_name` | text | |
| `contributor_email` | text | |
| `raw_ocr_text` | text | Raw ML Kit output |
| `ai_filtered_data` | jsonb | What the AI returned |
| `gemini_filtered_data` | jsonb | Gemini-specific result |
| `front_photo_uploaded` | boolean | |
| `back_photo_ocrd` | boolean | |
| `ingredients` | jsonb | Final ingredient list |
| `status` | text | `"approved"` (default) |
| `cleanup_trace` | jsonb | Array of AI route attempts |
| `provider_route` | jsonb | Which route succeeded |

**Index:** `idx_user_contributions_email` on `(contributor_email, created_at DESC)`.

---

### `processing_events` (pipeline telemetry)
Every stage of every contribution job emits a row here. This is the **audit log**.

| Column | Type | Notes |
|--------|------|-------|
| `job_id` | text | Links to contribution job |
| `event_type` | text | e.g. `"ai_cleanup_route_succeeded"` |
| `stage` | text | e.g. `"ai_cleanup"` |
| `status` | text | `"info"` \| `"success"` \| `"error"` \| `"blocked"` |
| `barcode` | text | |
| `personal_product_id` | uuid FK | For personal product events |
| `provider_id` | text | `"gemini"` etc. |
| `model` | text | Model used |
| `masked_key` | text | Last 6 chars of API key (for debugging) |
| `route_id` | text | `"gemini:0:0"` |
| `attempt_number` | integer | |
| `message` | text | Human-readable event description |
| `payload` | jsonb | Additional event data |

---

### `personal_products`
Products created by users with a custom FFADZ QR code.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `ffadz_code` | text UNIQUE | `"FFADZ-AB12C"` — auto-generated |
| `owner_id` | uuid FK → auth.users | CASCADE delete |
| `owner_email` | text | Denormalized |
| `product_name` | text | |
| `brand` | text | |
| `description` | text | |
| `ingredients` | jsonb | |
| `ingredients_raw` | text | |
| `nutrition` | jsonb | |
| `qr_status` | text | `"active"` \| `"deactivated"` |

**Trigger:** `trg_assign_ffadz_code` → calls `generate_ffadz_code()` on INSERT.

**RLS Policies:**
- `SELECT`: anyone (public read — any scanner can see the product)
- `INSERT`: only if `auth.uid() = owner_id`
- `UPDATE`: only if `auth.uid() = owner_id`
- `DELETE`: only if `auth.uid() = owner_id`

---

### `personal_product_images`
Cloudinary images for personal products.

| Column | Type | Notes |
|--------|------|-------|
| `personal_product_id` | uuid FK | Cascade delete |
| `image_type` | text | `"front"` \| `"ingredients"` \| `"nutrition"` |
| `storage_provider` | text | `"cloudinary"` |
| `public_url` | text | Cloudinary CDN URL |
| `provider_public_id` | text | Cloudinary asset id |
| `width` / `height` | integer | Image dimensions |
| `bytes` | bigint | File size |
| `upload_mode` | text | `"signed"` (secure) |

**Unique constraint:** `(personal_product_id, image_type)`

**RLS:** Read public, write only by product owner (via JOIN to personal_products).

---

### `personal_product_scans`
Records every time someone scans a personal QR product.

| Column | Type | Notes |
|--------|------|-------|
| `personal_product_id` | uuid FK | |
| `ffadz_code` | text | Denormalized for fast lookup |
| `scanned_by_user_id` | uuid FK → auth.users | Nullable |
| `scanned_by_email` | text | |
| `source` | text | `"qr"` |

**RLS:** INSERT allowed by anyone (any scanner). SELECT only by product owner.

---

## How the App Initializes Supabase

```
App starts
    └── UserContext mounts
            └── loads AsyncStorage (supabaseUrl + supabaseAnonKey)
                    └── setSupabaseCredentials(url, key)
                            └── creates supabase client (lazy init)
                                    └── getSupabaseClient() returns the client

On every UserContext state change:
    setSupabaseCredentials() is called again
    (supports hot credential swap without restart)
```

The Supabase client is lazy — it is only created when credentials are available. Before that, `getSupabaseClient()` returns `null` and all callers check for null gracefully.

---

## Authentication Flow

```
LoginScreen
    └── supabase.auth.signInWithPassword({ email, password })
            └── onAuthStateChange fires: event = "SIGNED_IN"
                    └── UserContext picks up userId + email
                            └── loads user-scoped AsyncStorage key
                                    └── dispatches SET_PREFS with saved preferences
```

**Session restoration on cold start:**
```
UserContext effect (runs once after state.loaded = true)
    └── supabase.auth.getSession()
            └── if valid session:
                    dispatch SET_EMAIL + SET_FULL_NAME
            └── subscribe to onAuthStateChange
                    (handles TOKEN_REFRESHED, SIGNED_OUT, USER_DELETED)
```

---

## Row Level Security Summary

| Table | Public Read | Owner Write |
|-------|------------|-------------|
| `products` | ✅ (no RLS) | — |
| `product_ai_data` | ✅ (no RLS) | — |
| `personal_products` | ✅ via policy | owner_id = auth.uid() |
| `personal_product_images` | ✅ via policy | owner via JOIN |
| `personal_product_scans` | ❌ | owner via JOIN |

**Why no RLS on `products`?** It's a public food database. Any scan from any user contributes to the shared catalogue.

---

## SQL Functions

### `generate_ffadz_code()`
Generates a unique `FFADZ-XXXXX` code using UUID sampling + collision loop.

### `assign_ffadz_code()` (trigger function)
Called before INSERT on `personal_products`. If `ffadz_code` is null or blank, assigns one from `generate_ffadz_code()`.

### `set_updated_at()` (trigger function)
Called before UPDATE on all major tables. Sets `updated_at = now()`.

---

## Threshold Limits Table (optional)

Although not defined in the schema SQL, the app checks for a `threshold_limits` table:

```js
// Expected shape of each row:
{ key: "sugar", value: 10, unit: "g", source: "FSSAI" }
```

If this table exists and has rows, `syncThresholds()` overwrites the offline defaults on login. This allows FSSAI limit updates to be pushed to all apps without a code release.
