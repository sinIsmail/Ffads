// Ffads — Gemini Service Barrel (re-exports everything for backward compat)
// Import from '../services/gemini' continues to work.

export { callGeminiWithRotation } from './core';
export { runDeepAnalysis, analyzeIngredient } from './analysis';
export { processProductPhotos } from './ocr';
export { evaluateIngredientsForCache } from './cache';
export { isGeminiConfigured, validateGeminiApiKey } from './validation';
