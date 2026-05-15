import {
  getSupabaseClient,
  saveProduct,
  setAIProcessingStatus,
  getDeepIngredientKnowledge,
  updateDeepIngredientKnowledge,
} from './supabase';
import { calculateMacroScore } from '../utils/thresholds';
import { logError } from './telemetry';
import {
  runDeepAnalysis as runProviderAnalysis,
  analyzeIngredient as runIngredientAnalysis,
  resolveProviderContext,
  isProviderConfigured,
} from './ai';

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 6;

async function pollForCachedResult(supabase, barcode) {
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    try {
      const { data } = await supabase
        .from('product_ai_data')
        .select('status, animal_content_flag, animal_content_details, harmful_chemicals, ai_score, ai_recommendation')
        .eq('barcode', barcode)
        .single();

      if (data && data.status === 'done' && data.ai_score !== null) {
        return {
          animalContentFlag: data.animal_content_flag,
          animalContentDetails: data.animal_content_details,
          harmfulChemicals: data.harmful_chemicals || [],
          aiScore: data.ai_score,
          aiRecommendation: data.ai_recommendation,
        };
      }

      if (data?.status === 'failed') {
        return null;
      }
    } catch {
      // Keep polling. The next attempt may succeed.
    }
  }

  return null;
}

function normalizeAiData(result) {
  const source = Array.isArray(result) && result.length > 0
    ? result[0]
    : (result?.analysis || result || {});

  const aiScore = source?.aiScore ?? source?.ai_score ?? source?.score ?? null;
  if (aiScore === null || aiScore === undefined) {
    throw new Error('The AI returned a malformed response. Please try again.');
  }

  return {
    animalContentFlag: source?.animalContentFlag ?? source?.animal_content_flag ?? false,
    animalContentDetails: source?.animalContentDetails ?? source?.animal_content_details ?? null,
    harmfulChemicals: source?.harmfulChemicals ?? source?.harmful_chemicals ?? [],
    aiScore,
    aiRecommendation: source?.aiRecommendation ?? source?.ai_recommendation ?? null,
  };
}

export async function analyzeProduct(product, options = {}) {
  const { providerContext = null, onProgress = null } = options;
  const provider = resolveProviderContext(providerContext);

  const payload = {
    localData: calculateMacroScore(product.nutrition),
    aiData: null,
    aiPowered: false,
    cached: false,
  };

  if (!product.ingredients || product.ingredients.length === 0) {
    return { ...payload, error: 'No ingredients available for AI analysis.' };
  }

  if (!isProviderConfigured(provider)) {
    return {
      ...payload,
      error: 'AI analysis requires a configured provider. Add one in Profile > AI Routing & Models.',
    };
  }

  const supabase = getSupabaseClient();
  let lockAcquired = false;

  if (supabase && product.barcode) {
    try {
      onProgress?.({ step: 1, total: 2, label: 'Checking database...' });

      const { data, error } = await supabase
        .from('product_ai_data')
        .select('status, animal_content_flag, animal_content_details, harmful_chemicals, ai_score, ai_recommendation')
        .eq('barcode', product.barcode)
        .single();

      if (!error && data) {
        if (data.status === 'done' && data.ai_score !== null) {
          return {
            ...payload,
            aiData: {
              animalContentFlag: data.animal_content_flag,
              animalContentDetails: data.animal_content_details,
              harmfulChemicals: data.harmful_chemicals || [],
              aiScore: data.ai_score,
              aiRecommendation: data.ai_recommendation,
            },
            aiPowered: true,
            cached: true,
          };
        }

        if (data.status === 'processing') {
          const polledData = await pollForCachedResult(supabase, product.barcode);
          if (polledData) {
            return {
              ...payload,
              aiData: polledData,
              aiPowered: true,
              cached: true,
            };
          }
        }
      } else {
        lockAcquired = await setAIProcessingStatus(product.barcode, 'processing');
      }
    } catch {
      // Cache lookup is a performance optimization, not a requirement.
    }
  }

  onProgress?.({ step: 1, total: 2, label: 'Preparing deep analysis...' });
  await new Promise((resolve) => setTimeout(resolve, 2000));

  try {
    onProgress?.({ step: 2, total: 2, label: 'Running AI analysis...' });
    const providerResult = await runProviderAnalysis(product, provider);
    const aiData = normalizeAiData(providerResult);

    const finalPayload = {
      ...payload,
      aiData,
      aiPowered: true,
    };

    if (product.barcode && supabase) {
      (async () => {
        try {
          const saved = await saveProduct(product);
          if (!saved?.success) {
            if (lockAcquired) {
              await setAIProcessingStatus(product.barcode, 'failed').catch(() => {});
            }
            return;
          }

          const { error } = await supabase.from('product_ai_data').upsert({
            barcode: product.barcode,
            animal_content_flag: aiData.animalContentFlag,
            animal_content_details: aiData.animalContentDetails,
            harmful_chemicals: aiData.harmfulChemicals,
            ai_score: aiData.aiScore,
            ai_recommendation: aiData.aiRecommendation,
            gemini_model: provider?.textModel || provider?.visionModel || null,
            status: 'done',
            analyzed_at: new Date().toISOString(),
          }, { onConflict: 'barcode' });

          if (error && lockAcquired) {
            await setAIProcessingStatus(product.barcode, 'failed').catch(() => {});
          }
        } catch (error) {
          logError('AnalysisService Cache Write', error, { barcode: product.barcode });
          if (lockAcquired) {
            await setAIProcessingStatus(product.barcode, 'failed').catch(() => {});
          }
        }
      })();
    }

    return finalPayload;
  } catch (error) {
    logError('AnalysisService AI Call Failed', error, { barcode: product.barcode });
    if (lockAcquired && product.barcode) {
      await setAIProcessingStatus(product.barcode, 'failed').catch(() => {});
    }
    return { ...payload, error: error.message };
  }
}

export async function analyzeIngredientDetail(ingredientName, providerContext = null) {
  const cachedInsight = await getDeepIngredientKnowledge(ingredientName);
  if (cachedInsight) {
    return cachedInsight;
  }

  const provider = resolveProviderContext(providerContext);
  if (!isProviderConfigured(provider)) {
    return null;
  }

  try {
    const aiData = await runIngredientAnalysis(ingredientName, provider);

    if (aiData) {
      (async () => {
        try {
          await updateDeepIngredientKnowledge(ingredientName, aiData);
        } catch (error) {
          logError('Ingredient Knowledge Cache', error, { ingredientName });
        }
      })();
    }

    return aiData;
  } catch (error) {
    logError('Ingredient Detail Analysis', error, { ingredientName });
    return null;
  }
}
