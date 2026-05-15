import * as openfoodfacts from './openfoodfacts';
import { getCompleteProduct } from './supabase';

export async function scanProduct(barcode) {
  try {
    const cachedProduct = await getCompleteProduct(barcode);
    if (cachedProduct) {
      return {
        product: { ...cachedProduct, id: `product_${Date.now()}` },
        source: 'cache',
        isNew: false,
      };
    }
  } catch {
    // Cache lookup is best-effort. Continue to Open Food Facts.
  }

  try {
    const offProduct = await openfoodfacts.lookupBarcode(barcode);
    if (offProduct) {
      return {
        product: {
          id: `product_${Date.now()}`,
          ...offProduct,
          scannedAt: new Date().toISOString(),
          analyzed: false,
          aiInsight: null,
        },
        source: 'openfoodfacts',
        isNew: true,
      };
    }
  } catch {
    // OFF lookup is best-effort. Fall back to manual placeholder.
  }

  return {
    product: {
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
    },
    source: 'manual',
    isNew: true,
  };
}
