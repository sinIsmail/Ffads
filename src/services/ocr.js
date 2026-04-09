// Ffads — OCR Service
// Requires a development build with ML Kit.
// This service extracts text from food label images.

/**
 * Extract text from an image using ML Kit Text Recognition
 * @param {string} imageUri - local file URI of the image
 * @returns {Promise<{ text: string, blocks: Array, confidence: number }>}
 */
export async function recognizeText(imageUri) {
  // ML Kit requires native modules — only available in development builds
  try {
    const TextRecognition = require('@react-native-ml-kit/text-recognition');
    const result = await TextRecognition.default.recognize(imageUri);
    
    return {
      text: result.text,
      blocks: result.blocks || [],
      confidence: 1.0,
    };
  } catch (error) {
    throw new Error(
      'OCR not available. Build a development build with: npx eas build --profile development --platform android'
    );
  }
}

/**
 * Check if ML Kit text recognition is available
 */
export function isOCRAvailable() {
  try {
    require('@react-native-ml-kit/text-recognition');
    return true;
  } catch {
    return false;
  }
}
