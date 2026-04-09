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
  // === Step 1: Check Supabase global cache ===
  try {
    const cachedProduct = await getCompleteProduct(barcode);
    if (cachedProduct) {
      console.log(`[ProductService] Found complete product in Supabase cache: ${barcode}`);
      return { 
        product: { ...cachedProduct, id: `product_${Date.now()}` }, 
        source: 'cache', 
        isNew: false 
      };
    }
  } catch (err) {
    console.warn('[ProductService] Supabase cache lookup failed:', err.message);
  }

  // === Step 2: Check Open Food Facts ===
  try {
    const offResult = await openfoodfacts.lookupBarcode(barcode);
    if (offResult) {
      const product = {
        id: `product_${Date.now()}`,
        ...offResult,
        scannedAt: new Date().toISOString(),
        analyzed: false,
        aiInsight: null,
      };

      return { product, source: 'openfoodfacts', isNew: true };
    }
  } catch (err) {
    console.warn('[ProductService] OFF lookup failed:', err.message);
  }

  // === Step 2: Not found anywhere — manual entry ===
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

  return { product, source: 'manual', isNew: true };
}

/**
 * Contribute product data to Open Food Facts
 * Called after user has analyzed a product that wasn't in OFF
 */
export async function contributeToOFF(product) {
  // Only contribute if we have meaningful data
  if (!product.barcode || !product.name || product.name.startsWith('Product ')) {
    return { success: false, reason: 'Not enough data to contribute' };
  }

  try {
    const success = await openfoodfacts.contributeProduct(product);
    return { success };
  } catch (error) {
    // Queue for later
    await queue.enqueue('off_contribution', product);
    return { success: false, queued: true };
  }
}
