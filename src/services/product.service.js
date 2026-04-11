// Ffads — Product Service (Feature Layer)
// This is the ONLY file that UI screens should call for product operations.
// UI → product.service → local storage / openfoodfacts

import * as openfoodfacts from './openfoodfacts';
import * as queue from './queue';
import { getCompleteProduct } from './supabase';

/**
 * SCAN FLOW: The main product lookup flow
 * 
 * 1. Check Open Food Facts
 * 2. If not found, create placeholder for OCR
 * Note: Local async storage (sessionScans/history) is checked BEFORE calling this by the ScannerScreen
 * 
 * @param {string} barcode
 * @returns {{ product, source: 'openfoodfacts'|'manual', isNew: true }}
 */
export async function scanProduct(barcode) {
  console.log(`\n📦 ═══════════════════════════════════════════`);
  console.log(`📦 [ProductService] START — scanProduct("${barcode}")`);
  console.log(`📦 ═══════════════════════════════════════════`);

  // === Step 1: Check Supabase global cache ===
  try {
    console.log(`📦 [ProductService] Step 1/3 → Checking Supabase global cache...`);
    const cachedProduct = await getCompleteProduct(barcode);
    if (cachedProduct) {
      console.log(`📦 [ProductService] Step 1/3 → ✅ CACHE HIT! Found "${cachedProduct.name}" in Supabase`);
      console.log(`📦 [ProductService] END — Returning cached product\n`);
      return { 
        product: { ...cachedProduct, id: `product_${Date.now()}` }, 
        source: 'cache', 
        isNew: false 
      };
    }
    console.log(`📦 [ProductService] Step 1/3 → CACHE MISS — Not in Supabase`);
  } catch (err) {
    console.warn(`📦 [ProductService] Step 1/3 → ⚠️ Supabase cache lookup failed: ${err.message}`);
  }

  // === Step 2: Check Open Food Facts ===
  try {
    console.log(`📦 [ProductService] Step 2/3 → Querying Open Food Facts API...`);
    const offResult = await openfoodfacts.lookupBarcode(barcode);
    if (offResult) {
      const product = {
        id: `product_${Date.now()}`,
        ...offResult,
        scannedAt: new Date().toISOString(),
        analyzed: false,
        aiInsight: null,
      };
      console.log(`📦 [ProductService] Step 2/3 → ✅ FOUND on OFF! "${product.name}" by ${product.brand}`);
      console.log(`📦 [ProductService]   └─ Ingredients: ${product.ingredients?.length || 0} | Nutrition keys: ${Object.keys(product.nutrition || {}).length}`);
      console.log(`📦 [ProductService] END — Returning OFF product\n`);
      return { product, source: 'openfoodfacts', isNew: true };
    }
    console.log(`📦 [ProductService] Step 2/3 → NOT FOUND on Open Food Facts`);
  } catch (err) {
    console.warn(`📦 [ProductService] Step 2/3 → ⚠️ OFF lookup failed: ${err.message}`);
  }

  // === Step 3: Not found anywhere — manual entry ===
  console.log(`📦 [ProductService] Step 3/3 → Creating MANUAL placeholder (needs OCR)`);
  const product = {
    id: `product_${Date.now()}`,
    barcode,
    name: `Product ${barcode.slice(-4)}`,
    brand: 'Unknown',
    category: 'Uncategorized',
    images: { front: null, ingredients: null, nutrition: null },
    ingredients: [],
    nutrition: {},
    scannedAt: new Date().toISOString(),
    analyzed: false,
    aiInsight: null,
    source: 'manual',
    needsOCR: true,
  };

  console.log(`📦 [ProductService] END — Returning manual placeholder (OCR required)\n`);
  return { product, source: 'manual', isNew: true };
}

/**
 * Contribute product data to Open Food Facts
 * Called after user has analyzed a product that wasn't in OFF
 */
export async function contributeToOFF(product) {
  console.log(`📤 [ProductService] contributeToOFF — barcode="${product.barcode}", name="${product.name}"`);

  // Only contribute if we have meaningful data
  if (!product.barcode || !product.name || product.name.startsWith('Product ')) {
    console.warn(`📤 [ProductService] ⚠️ Skipping OFF contribution — not enough data`);
    return { success: false, reason: 'Not enough data to contribute' };
  }

  try {
    const success = await openfoodfacts.contributeProduct(product);
    console.log(`📤 [ProductService] ${success ? '✅ Contributed' : '❌ Failed'} to OFF`);
    return { success };
  } catch (error) {
    console.warn(`📤 [ProductService] ❌ OFF contribution failed, queuing for later: ${error.message}`);
    // Queue for later
    await queue.enqueue('off_contribution', product);
    return { success: false, queued: true };
  }
}
