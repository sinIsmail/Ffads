// Ffads — Supabase Service Barrel (re-exports everything for backward compat)
// Import from '../services/supabase' continues to work.

export { setSupabaseCredentials, getSupabaseClient, isConfigured, pingSupabase } from './client';
export { saveProduct, saveProductAIData, setAIProcessingStatus, getProducts, getProductByBarcode, getCompleteProduct, deleteProduct } from './products';
export { getDeepIngredientKnowledge, updateDeepIngredientKnowledge } from './ingredients';
export { recordScan, getUserScanHistory, getScanCount, logUserContribution, getUserContributions, getContributionCount } from './contributions';
export { saveUserProfile, getUserProfile, saveProductImage, getProductImages } from './users';
