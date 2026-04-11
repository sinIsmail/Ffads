// Ffads — Barcode Validation Utilities (EAN-13, EAN-8, UPC-A)

/**
 * Validate EAN-13 checksum
 */
export function isValidEAN13(code) {
  if (code.length !== 13 || !/^\d+$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(code[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return check === parseInt(code[12]);
}

/**
 * Validate EAN-8 checksum
 */
export function isValidEAN8(code) {
  if (code.length !== 8 || !/^\d+$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    sum += parseInt(code[i]) * (i % 2 === 0 ? 3 : 1);
  }
  const check = (10 - (sum % 10)) % 10;
  return check === parseInt(code[7]);
}

/**
 * Check if barcode format is valid (any supported type)
 */
export function isValidBarcode(code, type) {
  if (!code || code.length < 4) return false;

  // EAN-13 validation
  if (type === 'ean13' || code.length === 13) return isValidEAN13(code);
  // EAN-8 validation
  if (type === 'ean8' || code.length === 8) return isValidEAN8(code);
  // UPC-A (12 digits) — accept if numeric
  if (code.length === 12 && /^\d+$/.test(code)) return true;
  // Other formats — basic check
  if (/^[\d\w\-]+$/.test(code) && code.length >= 6) return true;

  return false;
}
