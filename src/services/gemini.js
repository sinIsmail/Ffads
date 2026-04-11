// Ffads — Gemini Service (Redirected to services/gemini/)
// This file re-exports from the new modular location for backward compatibility.
export {
  callGeminiWithRotation,
  runDeepAnalysis,
  analyzeIngredient,
  processProductPhotos,
  evaluateIngredientsForCache,
  isGeminiConfigured,
  validateGeminiApiKey,
} from './gemini/index';
