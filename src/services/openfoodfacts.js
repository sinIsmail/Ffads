// Ffads — Open Food Facts Service
// Docs: https://openfoodfacts.github.io/openfoodfacts-server/api/
import * as FileSystem from 'expo-file-system/legacy';   // legacy needed for EncodingType in SDK 54
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── App identity (sent with every OFF request for contributor credit) ────────
const APP_NAME    = 'Ffads';
const APP_VERSION = '1.0.0';
const DEVICE_UUID_KEY = '@ffads_device_uuid';

// Lazy-loaded persistent device UUID (generated once, stored in AsyncStorage)
let _deviceUuid = null;
async function getDeviceUuid() {
  if (_deviceUuid) return _deviceUuid;
  try {
    const stored = await AsyncStorage.getItem(DEVICE_UUID_KEY);
    if (stored) { _deviceUuid = stored; return _deviceUuid; }
    // Generate a simple RFC-4122 v4 UUID
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
    await AsyncStorage.setItem(DEVICE_UUID_KEY, uuid);
    _deviceUuid = uuid;
  } catch {
    _deviceUuid = 'unknown-device';
  }
  return _deviceUuid;
}

// ─── Constants ────────────────────────────────────────────────────────────────
// CGI write endpoint (text data)
const OFF_CGI_URL = 'https://world.openfoodfacts.org/cgi/product_jqm2.pl';
// CGI write endpoint (image uploads)
const OFF_IMAGE_URL = 'https://world.openfoodfacts.org/cgi/product_image_upload.pl';

// Read endpoint (barcode lookup)
const BASE_URL = process.env.EXPO_PUBLIC_OFF_API_BASE_URL || 'https://world.openfoodfacts.org/api/v2';

// OFF requires a descriptive User-Agent or they block the request
// Format: AppName/Version (contact)
const USER_AGENT = `${APP_NAME}/${APP_VERSION} (contact@ffads.app)`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build the Authorization header value for Basic Auth.
 * OFF's legacy CGI also accepts user_id+password in the body,
 * but sending both gives the best compatibility.
 */
function buildAuthHeader(username, password) {
  // btoa is available in React Native Hermes engine
  const b64 = btoa(`${username}:${password}`);
  return `Basic ${b64}`;
}

/**
 * Append the standard OFF contributor-tracking fields to any FormData.
 * These make your uploads appear under your account on OFF.
 */
async function appendContributorFields(formData, username) {
  const uuid = await getDeviceUuid();
  formData.append('app_name',    APP_NAME);
  formData.append('app_version', APP_VERSION);
  formData.append('app_uuid',    uuid);
  // user_id is the OFF account name — required for credit
  formData.append('user_id',     username);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Look up a product by barcode from Open Food Facts
 */
export async function lookupBarcode(barcode) {
  try {
    const response = await fetch(`${BASE_URL}/product/${barcode}.json`, {
      headers: { 'User-Agent': USER_AGENT },
    });

    if (!response.ok) {
      console.warn(`🌍 [OFF] Lookup → ⚠️ HTTP ${response.status} for barcode "${barcode}"`);
      return null;
    }

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.warn(`🌍 [OFF] Lookup → ⚠️ Invalid JSON response for barcode "${barcode}"`);
      return null;
    }

    if (data.status !== 1 || !data.product) return null;
    return normalizeProduct(data.product, barcode);
  } catch (error) {
    console.error(`🌍 [OFF] Lookup → ❌ Failed for "${barcode}": ${error.message}`);
    return null;
  }
}

/**
 * Check if OFF credentials are configured
 */
export function isOFFConfigured(creds) {
  const u = creds?.username || process.env.EXPO_PUBLIC_OFF_USERNAME || '';
  const p = creds?.password || process.env.EXPO_PUBLIC_OFF_PASSWORD || '';
  return !!(u && p);
}

/**
 * Upload a SINGLE image to an Open Food Facts product.
 *
 * React Native FormData requires a real file:// URI — not a data:// URI.
 * We write the base64 to a temp file then attach it, and clean up afterward.
 *
 * @param {string} barcode
 * @param {string} base64Image  — raw base64 string (no data: prefix)
 * @param {'front'|'ingredients'|'nutrition'} imageField
 * @param {{ username, password }} creds
 */
export async function uploadImageToOFF(barcode, base64Image, imageField = 'front', creds = {}) {
  const username = creds.username || process.env.EXPO_PUBLIC_OFF_USERNAME || '';
  const password = creds.password || process.env.EXPO_PUBLIC_OFF_PASSWORD || '';

  if (!username || !password) {
    return { success: false, error: 'OFF credentials not configured — add them in Profile → API tab' };
  }

  // OFF field name mapping
  const fieldMap = {
    front:       'imgupload_front',
    ingredients: 'imgupload_ingredients',
    nutrition:   'imgupload_nutrition',
  };
  const offField = fieldMap[imageField] || 'imgupload_other';

  // Write base64 to a real temp file (RN FormData can't read data:// URIs)
  const tmpFileName = `off_${imageField}_${Date.now()}.jpg`;
  const tmpPath     = (FileSystem.cacheDirectory || '') + tmpFileName;

  try {
    await FileSystem.writeAsStringAsync(tmpPath, base64Image, {
      encoding: FileSystem.EncodingType.Base64,
    });
    console.log(`🌍 [OFF:Image] Step 1 → Temp file written: ${tmpFileName}`);

    // ── Build FormData ──────────────────────────────────────────────────────
    const formData = new FormData();
    formData.append('code', barcode);

    // Contributor tracking (required for your account to show as contributor)
    await appendContributorFields(formData, username);

    // Password — required alongside user_id for the legacy CGI endpoint
    formData.append('password', password);

    // Image attachment with real file:// URI
    formData.append(offField, {
      uri:  tmpPath,
      name: tmpFileName,
      type: 'image/jpeg',
    });

    // imagefield tells OFF which slot to put this image into
    formData.append('imagefield', imageField);

    console.log(`🌍 [OFF:Image] Step 2 → Uploading "${imageField}" image for barcode ${barcode}...`);

    // ── Send request ────────────────────────────────────────────────────────
    const response = await fetch(OFF_IMAGE_URL, {
      method: 'POST',
      body:   formData,
      headers: {
        'User-Agent':    USER_AGENT,
        'Authorization': buildAuthHeader(username, password),
        // DO NOT set Content-Type — let fetch set the multipart boundary
      },
    });

    const rawText = await response.text();
    console.log(`🌍 [OFF:Image] Step 3 → HTTP ${response.status} — ${rawText.substring(0, 150)}`);

    let result;
    try { result = JSON.parse(rawText); } catch { /* HTML error page fallthrough */ }

    if (result?.status === 1 || result?.status_verbose === 'fields saved') {
      console.log(`🌍 [OFF:Image] ✅ Image uploaded: ${barcode} (${imageField})`);
      return { success: true };
    }

    return {
      success: false,
      error: result?.status_verbose || result?.error || `HTTP ${response.status}`,
    };

  } catch (error) {
    console.error(`🌍 [OFF:Image] ❌ Upload failed (${imageField}): ${error.message}`);
    return { success: false, error: error.message };
  } finally {
    // Always clean up temp file
    FileSystem.deleteAsync(tmpPath, { idempotent: true }).catch(() => {});
  }
}

/**
 * Contribute product text data + up to 3 images to Open Food Facts.
 *
 * Step 1 — POST text fields (name, brand, ingredients, nutrition)
 * Step 2 — Upload each image sequentially [front, nutrition, ingredients]
 *
 * @param {Object}   product       — product data to submit
 * @param {string[]} base64Images  — [front_b64, nutrition_b64, ingredients_b64]
 * @param {{ username, password }} creds
 */
export async function contributeToOFF(product, base64Images = [], creds = {}) {
  const username = creds.username || process.env.EXPO_PUBLIC_OFF_USERNAME || '';
  const password = creds.password || process.env.EXPO_PUBLIC_OFF_PASSWORD || '';

  if (!username || !password) {
    return { success: false, error: 'OFF credentials not configured — add them in Profile → API tab' };
  }

  console.log(`\n🌍 [OFF:Contribute] START → barcode=${product.barcode} | user="${username}" | app=${APP_NAME} ${APP_VERSION}`);

  try {
    // ── Step 1: Submit text/structured data as x-www-form-urlencoded ──────────
    const textParams = new URLSearchParams();
    textParams.append('code', product.barcode);

    await appendContributorFields(textParams, username);
    textParams.append('password', password);

    // Product fields
    if (product.name) textParams.append('product_name', product.name);
    if (product.brand && product.brand !== 'Unknown Brand') {
      textParams.append('brands', product.brand);
    }
    if (product.ingredientsRaw) {
      textParams.append('ingredients_text', product.ingredientsRaw);
    }

    // Nutrition values
    if (product.nutrition) {
      const n = product.nutrition;
      if (n.energy)       textParams.append('nutriment_energy-kcal_100g',   String(n.energy));
      if (n.protein)      textParams.append('nutriment_proteins_100g',       String(n.protein));
      if (n.carbs)        textParams.append('nutriment_carbohydrates_100g',  String(n.carbs));
      if (n.sugar)        textParams.append('nutriment_sugars_100g',         String(n.sugar));
      if (n.fat)          textParams.append('nutriment_fat_100g',            String(n.fat));
      if (n.saturatedFat) textParams.append('nutriment_saturated-fat_100g', String(n.saturatedFat));
      if (n.fiber)        textParams.append('nutriment_fiber_100g',          String(n.fiber));
      if (n.sodium)       textParams.append('nutriment_sodium_100g',         String(n.sodium / 1000));
    }

    const textResponse = await fetch(OFF_CGI_URL, {
      method:  'POST',
      body:    textParams.toString(),
      headers: {
        'User-Agent':    USER_AGENT,
        'Authorization': buildAuthHeader(username, password),
        'Content-Type':  'application/x-www-form-urlencoded',
      },
    });

    const textRaw = await textResponse.text();
    console.log(`🌍 [OFF:Contribute] Step 1 → Text data HTTP ${textResponse.status}`);

    let textResult;
    try { textResult = JSON.parse(textRaw); } catch { /* ignore */ }
    console.log(`🌍 [OFF:Contribute] Step 1 → Result: ${textResult?.status_verbose || 'unknown'}`);

    // ── Step 2: Upload images sequentially ──────────────────────────────────
    // Order matches what ProductDetailScreen passes: [front, nutrition, ingredients]
    const imageFields  = ['front', 'nutrition', 'ingredients'];
    const imageResults = [];

    for (let i = 0; i < Math.min(base64Images.length, 3); i++) {
      if (!base64Images[i]) continue;

      const imgResult = await uploadImageToOFF(
        product.barcode,
        base64Images[i],
        imageFields[i],
        { username, password }
      );
      imageResults.push({ field: imageFields[i], ...imgResult });

      // Small throttle between image uploads to be a good API citizen
      if (i < base64Images.length - 1) {
        await new Promise(r => setTimeout(r, 400));
      }
    }

    const textSuccess    = textResult?.status === 1 || textResult?.status_verbose === 'fields saved';
    const anyImageSuccess = imageResults.some(r => r.success);

    return {
      success:      textSuccess || anyImageSuccess,
      textUploaded: textSuccess,
      imageResults,
    };

  } catch (error) {
    console.error(`🌍 [OFF:Contribute] ❌ Contribution FAILED: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function normalizeProduct(p, barcode) {
  const nutriments = p.nutriments || {};
  return {
    barcode,
    name:     p.product_name || p.product_name_en || 'Unknown Product',
    brand:    p.brands || 'Unknown Brand',
    category: p.categories_tags?.[0]?.replace('en:', '') || p.categories || 'Uncategorized',
    images: {
      front:       p.image_front_url       || p.image_url || null,
      ingredients: p.image_ingredients_url || null,
      nutrition:   p.image_nutrition_url   || null,
    },
    ingredients:    parseIngredientText(p.ingredients_text || p.ingredients_text_en || ''),
    ingredientsRaw: p.ingredients_text || p.ingredients_text_en || '',
    nutrition: {
      energy:       nutriments['energy-kcal_100g']  || nutriments['energy-kcal'] || 0,
      protein:      nutriments.proteins_100g         || 0,
      carbs:        nutriments.carbohydrates_100g    || 0,
      sugar:        nutriments.sugars_100g           || 0,
      fat:          nutriments.fat_100g              || 0,
      saturatedFat: nutriments['saturated-fat_100g'] || 0,
      fiber:        nutriments.fiber_100g            || 0,
      sodium:       nutriments.sodium_100g ? nutriments.sodium_100g * 1000 : 0,
    },
    nutriscore: p.nutriscore_grade || null,
    novaGroup:  p.nova_group       || null,
    source:     'openfoodfacts',
  };
}

function parseIngredientText(text) {
  if (!text) return [];
  return text
    .replace(/\([^)]*\)/g, '')
    .split(/[,;]/)
    .map((i) => i.trim())
    .filter((i) => i.length > 1);
}
