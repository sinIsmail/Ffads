// Ffads — Product Detail Screen
// UI → analysis.service (never calls Gemini/Supabase directly)
import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Alert, ActivityIndicator, Platform, Dimensions,
} from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width - 32; // minus horizontal padding
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing, borderRadius, shadows } from '../theme/spacing';
import { useProducts } from '../store/ProductContext';
import { useUser, getGeminiKey, getOFFCredentials, getAllGeminiKeys } from '../store/UserContext';
import AICard from '../components/AICard';
import IngredientChip from '../components/IngredientChip';
import IngredientModal from '../components/IngredientModal';
import NutritionTable from '../components/NutritionTable';
import AllergyWarning from '../components/AllergyWarning';
import OCRScannerOverlay from '../components/OCRScannerOverlay';
import { checkAllergens } from '../utils/allergens';
import { calculateScore, calculateSafePortion } from '../utils/scoring';
import { calculateMacroScore } from '../utils/thresholds';
import { analyzeProduct } from '../services/analysis.service';
import { getSupabaseClient, logUserContribution, saveProduct } from '../services/supabase';
import { processProductPhotos } from '../services/gemini';
import { contributeToOFF, isOFFConfigured } from '../services/openfoodfacts';
import ScoreBreakdownModal from '../components/ScoreBreakdownModal';
import AIQualityModal from '../components/AIQualityModal';

export default function ProductDetailScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { productId } = route.params;
  const { productState, productDispatch } = useProducts();
  const { userPrefs, userDispatch } = useUser();
  
  const product = productState.history.find((p) => p.id === productId)
    || productState.sessionScans.find((p) => p.id === productId);
  const [selectedIngredient, setSelectedIngredient] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiProgress, setAiProgress] = useState('');
  const [analysisResult, setAnalysisResult] = useState(null);
  const [ocrVisible, setOcrVisible] = useState(false);
  const [classified, setClassified] = useState([]);
  const [evaluatingIngredients, setEvaluatingIngredients] = useState(false);
  const [macroModalVisible, setMacroModalVisible] = useState(false);
  const [aiModalVisible, setAiModalVisible] = useState(false);
  const [insightExpanded, setInsightExpanded] = useState(false);
  const [offImages, setOffImages] = useState([]);

  // Fetch Open Food Facts Images Directly on Mount
  React.useEffect(() => {
    if (!product?.barcode) return;
    let isMounted = true;
    (async () => {
      try {
        const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${product.barcode}?fields=image_front_url,image_ingredients_url,image_nutrition_url`);
        const json = await res.json();
        if (json.status === 1 && json.product && isMounted) {
            const urls = [
                json.product.image_front_url,
                json.product.image_nutrition_url,
                json.product.image_ingredients_url
            ].filter(Boolean);
            if (urls.length > 0) setOffImages(urls);
        }
      } catch (err) {
        console.warn('Failed to fetch OFF images for carousel', err.message);
      }
    })();
    return () => { isMounted = false; };
  }, [product?.barcode]);

  // Open OCR overlay — no login required, OFF credentials are in .env
  const handleContribute = useCallback(() => {
    setOcrVisible(true);
  }, []);

  // Handle photos from OCR overlay
  // photos = { front, ingredients, nutrition } — each is { uri, base64 } | null
  //
  // Flow:
  //   Step 1 — Gemini OCRs BOTH back photos (ingredients + nutrition) in one call
  //   Step 2 — Update local product context so UI refreshes immediately
  //   Step 3 — Save raw OCR + structured result to Supabase user_contributions
  //   Step 4 — Upload ALL 3 images to Open Food Facts (front, ingredients, nutrition)
  const handleOCRSubmit = async (photos, productName) => {
    setOcrVisible(false);
    setAnalyzing(true);

    // Resolve all credentials from UserContext (API tab is the source of truth)
    const offCreds = getOFFCredentials(userPrefs);
    console.log('[Contribute] OFF user:', offCreds.username || 'NOT SET');

    // ── Step 1: OCR the back photos with Gemini ─────────────────────────
    let ocrData = null;
    const hasBackPhotos = !!(photos.ingredients || photos.nutrition);

    if (hasBackPhotos) {
      try {
        setAiProgress('[1/3] Gemini is reading the package back...');
        console.log('[Contribute] Step 1: Starting Gemini OCR...');
        console.log('[Contribute]   ingredients photo:', !!photos.ingredients);
        console.log('[Contribute]   nutrition photo:',   !!photos.nutrition);

        // Pass ALL keys so Gemini can rotate on 429
        const allKeys = getAllGeminiKeys(userPrefs);
        console.log('[Contribute] Gemini keys available:', allKeys.length);

        ocrData = await processProductPhotos(
          {
            ingredients: photos.ingredients?.base64 || null,
            nutrition:   photos.nutrition?.base64   || null,
          },
          allKeys,
          userPrefs.geminiModel
        );

        console.log(
          '[Contribute] Step 1 ✅ OCR done.',
          'name:', ocrData.name,
          '| brand:', ocrData.brand,
          '| ingredients:', ocrData.ingredients?.length,
        );
      } catch (ocrErr) {
        console.error('[Contribute] Step 1 ❌ Gemini OCR FAILED:', ocrErr.message);
        Alert.alert(
          '⚠️ OCR Failed',
          `Gemini could not read the package photos.\n\nError: ${ocrErr.message}\n\nImages will still be uploaded to Open Food Facts.`
        );
        // Don't stop — we can still upload photos without OCR data
      }
    } else {
      console.warn('[Contribute] No back photos — skipping OCR.');
    }

    // ── Step 2: Update local product state so the UI refreshes ─────────
    if (ocrData) {
      // Build the merged product so we can use it for the Supabase save below
      const mergedProduct = {
        ...product,
        name:           productName || ocrData.name || product.name,
        brand:          ocrData.brand || product.brand,
        ingredients:    ocrData.ingredients?.length > 0 ? ocrData.ingredients : product.ingredients,
        ingredientsRaw: ocrData.ingredientsRaw || product.ingredientsRaw,
        nutrition:      ocrData.nutrition || product.nutrition,
        source:         'ocr',
      };

      try {
        console.log('[Contribute] Step 2a: Updating product context...');
        productDispatch({
          type: 'UPDATE_PRODUCT',
          payload: { id: product.id, ...mergedProduct },
        });
        console.log('[Contribute] Step 2a ✅ Product context updated — UI will refresh.');
      } catch (dispatchErr) {
        console.error('[Contribute] Step 2a ❌ Failed to update local state:', dispatchErr.message);
      }

      // Also persist the enriched product to Supabase `products` table
      // so the data survives app restarts and is visible in history.
      try {
        console.log('[Contribute] Step 2b: Persisting enriched product to Supabase products table...');
        const saveResult = await saveProduct(mergedProduct);
        if (saveResult.success) {
          console.log('[Contribute] Step 2b ✅ Product saved to Supabase.');
        } else if (!saveResult.offline) {
          console.warn('[Contribute] Step 2b ⚠️ Supabase save failed:', saveResult.error);
        }
      } catch (saveErr) {
        console.error('[Contribute] Step 2b ❌ Unexpected error saving product:', saveErr.message);
      }
    }

    // ── Step 3: Persist raw OCR + structured data to Supabase ──────────
    if (ocrData) {
      try {
        setAiProgress('[2/3] Saving to database...');
        console.log('[Contribute] Step 3: Saving to Supabase...');
        const client = getSupabaseClient();
        if (client) {
          const { error: supErr } = await client.from('user_contributions').insert({
            barcode:             product.barcode,
            product_name:        ocrData.name || product.name,
            raw_ocr_text:        ocrData.rawOCRText || '',
            gemini_filtered_data: {
              ingredients:    ocrData.ingredients,
              ingredientsRaw: ocrData.ingredientsRaw,
              nutrition:      ocrData.nutrition,
            },
            front_photo_uploaded: !!photos.front,
            back_photo_ocrd:      hasBackPhotos,
          });
          if (supErr) {
            console.error('[Contribute] Step 3 ❌ Supabase error:', supErr.message);
          } else {
            console.log('[Contribute] Step 3 ✅ Saved to Supabase.');
          }
        } else {
          console.warn('[Contribute] Step 3 ⚠️ Supabase not configured, skipping.');
        }
      } catch (supaErr) {
        console.error('[Contribute] Step 3 ❌ Unexpected Supabase error:', supaErr.message);
      }
    }

    // ── Step 4: Upload ALL 3 images to Open Food Facts ─────────────────
    try {
      setAiProgress('[3/3] Uploading to Open Food Facts...');
      console.log('[Contribute] Step 4: Uploading to OFF...');

      if (isOFFConfigured(offCreds)) {
        const productToSend = {
          barcode:        product.barcode,
          name:           productName || ocrData?.name || product.name,
          brand:          ocrData?.brand || product.brand,
          ingredientsRaw: ocrData?.ingredientsRaw || product.ingredientsRaw,
          nutrition:      ocrData?.nutrition || product.nutrition,
        };

        // OFF expects: [front_base64, nutrition_base64, ingredients_base64]
        // (index matches the imageFields array in contributeToOFF)
        const imagesToUpload = [
          photos.front?.base64       || null,  // → imgupload_front
          photos.nutrition?.base64   || null,  // → imgupload_nutrition
          photos.ingredients?.base64 || null,  // → imgupload_ingredients
        ];

        const offResult = await contributeToOFF(productToSend, imagesToUpload, offCreds);
        console.log('[Contribute] Step 4 result:', JSON.stringify(offResult));

        if (offResult.success) {
          const imgCount = offResult.imageResults?.filter(r => r.success).length || 0;
          
          logUserContribution({
            barcode: product.barcode,
            productName: productName || ocrData?.name || product.name,
            rawOcr: ocrData?.rawOCRText || null,
            filteredData: ocrData || null,
            frontUploaded: imgCount > 0,
            backOcrd: !!ocrData
          });

          Alert.alert(
            '✅ Done!',
            [
              ocrData ? `✓ Data extracted from ${hasBackPhotos ? 'back photos' : 'images'} by Gemini.` : null,
              offResult.textUploaded ? '✓ Product text data saved to Open Food Facts.' : null,
              imgCount > 0 ? `✓ ${imgCount} image(s) uploaded to Open Food Facts.` : null,
            ].filter(Boolean).join('\n')
          );
        } else {
          Alert.alert(
            '⚠️ Partial Success',
            `${ocrData ? 'Data extracted and saved locally.\n' : ''}OFF upload failed: ${offResult.error || 'Unknown'}`
          );
        }
      } else {
        // No OFF credentials — just show what OCR found
        Alert.alert(
          ocrData ? '✅ Extraction Complete' : 'No Photos Processed',
          ocrData
            ? `Product data extracted by Gemini and saved.\n\nTo contribute photos to Open Food Facts, go to Profile → API tab and add your OFF username & password.`
            : 'No back photos were captured, so no data was extracted.'
        );
      }
    } catch (offErr) {
      console.error('[Contribute] Step 4 ❌ OFF upload FAILED:', offErr.message);
      Alert.alert(
        '⚠️ Upload Failed',
        `${ocrData ? 'Product data was extracted and saved, but ' : ''}Open Food Facts upload failed:\n${offErr.message}`
      );
    } finally {
      setAnalyzing(false);
      setAiProgress('');
    }
  };



  const toggleAI = useCallback(() => {
    userDispatch({ type: 'TOGGLE_AI_ENABLED' });
  }, [userDispatch]);

  // Hook Phase 2/4: Local-Only Ingredient Classification (ZERO API calls on mount)
  // Colors are derived purely from the local dictionary on page open.
  // Gemini is NEVER called here — it only fires when the user taps "Analyze".
  React.useEffect(() => {
    if (!product?.ingredients || product.ingredients.length === 0) {
      setClassified([]);
      return;
    }
    const { classifyIngredients } = require('../utils/ingredientDictionary');
    const localResult = classifyIngredients(product.ingredients);
    setClassified(localResult);
  }, [product?.ingredients]);

  // Local allergen check
  const allergenWarnings = useMemo(
    () => checkAllergens(product?.ingredients || [], userPrefs.allergies),
    [product?.ingredients, userPrefs.allergies]
  );

  // Phase 3: Dual-Engine Local Score
  const scoreResult = useMemo(
    () => calculateScore({
      nutrition: product?.nutrition,
      classifiedIngredients: classified,
      allergenWarnings,
      healthMode: userPrefs.healthMode,
    }),
    [product?.nutrition, classified, allergenWarnings, userPrefs.healthMode]
  );

  // New FSSAI/WHO Local Macro Math (Zero AI)
  const macroResult = useMemo(() => {
    return calculateMacroScore(product?.nutrition);
  }, [product?.nutrition]);

  // Max Safe Portion Calculator
  const safePortion = useMemo(
    () => calculateSafePortion(product?.nutrition),
    [product?.nutrition]
  );

  const handleIngredientPress = useCallback((ingredient) => {
    setSelectedIngredient(ingredient);
    setModalVisible(true);
  }, []);

  // Run Deep AI Analysis (single Gemini call → cache → reveal AICard)
  const hasIngredients = product?.ingredients && product.ingredients.length > 0;

  const handleAnalyzeClick = useCallback(async () => {
    if (!product || analyzing) return;
    
    // If already analyzed, do nothing (AICard is already showing)
    if (product.analyzed && (analysisResult?.aiData || product.aiData)) return;

    setAnalyzing(true);
    try {
      const result = await analyzeProduct(product, {
        geminiModel: userPrefs.geminiModel,
        geminiApiKey: getAllGeminiKeys(userPrefs),
        onProgress: (info) => {
          setAiProgress(`[${info.step}/${info.total}] ${info.label}`);
        }
      });

      setAnalysisResult(result);

      productDispatch({
        type: 'UPDATE_PRODUCT',
        payload: {
          id: product.id,
          analyzed: true,
          aiData: result.aiData,
          score: result.localData?.score,
        },
      });

      if (result.error) {
        Alert.alert('⚠️ Analysis Issue', result.error);
      }
    } catch (error) {
      Alert.alert('Analysis Failed', error.message || 'Could not complete analysis.');
    } finally {
      setAnalyzing(false);
      setAiProgress('');
    }
  }, [product, analyzing, analysisResult, userPrefs, productDispatch]);

  if (!product) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Product not found</Text>
      </View>
    );
  }

  // Group ingredients by color (color comes from dictionary, NOT Gemini)
  const redIngredients = classified.filter((i) => i.color === 'red');
  const yellowIngredients = classified.filter((i) => i.color === 'yellow');
  const greenIngredients = classified.filter((i) => i.color === 'green');

  const displayInsight = analysisResult?.aiInsight || product.aiInsight;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{product.name}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Product Image Carousel (from Open Food Facts) */}
        <View style={styles.imageSection}>
          {offImages.length > 0 ? (
            <>
              <ScrollView 
                horizontal 
                pagingEnabled 
                showsHorizontalScrollIndicator={false}
                style={{ width: SCREEN_WIDTH }}
              >
                {offImages.map((uri, idx) => (
                  <Image key={idx} source={{ uri }} style={{ width: SCREEN_WIDTH, height: 240, borderRadius: 16 }} resizeMode="cover" />
                ))}
              </ScrollView>
              <View style={styles.dotRow}>
                {offImages.map((_, idx) => (
                  <View key={idx} style={styles.dotIndicator} />
                ))}
              </View>
            </>
          ) : product.images?.front ? (
            <Image source={{ uri: product.images.front }} style={styles.productImage} />
          ) : (
            <LinearGradient colors={colors.gradientPurple} style={styles.placeholderImage}>
              <Ionicons name="cube-outline" size={48} color="rgba(255,255,255,0.7)" />
              <Text style={styles.placeholderText}>No image available</Text>
            </LinearGradient>
          )}
        </View>

        {/* Product Info */}
        <View style={styles.infoSection}>
          <Text style={styles.productName}>{product.name}</Text>
          <Text style={styles.brand}>{product.brand}</Text>
          <View style={styles.metaRow}>
            {product.source === 'openfoodfacts' && (
              <View style={[styles.sourceBadge, { backgroundColor: colors.secondarySoft }]}>
                <Text style={[styles.sourceText, { color: colors.secondaryDark }]}>Open Food Facts</Text>
              </View>
            )}
            {product.source === 'cache' && (
              <View style={[styles.sourceBadge, { backgroundColor: colors.primarySoft }]}>
                <Text style={[styles.sourceText, { color: colors.primaryDark }]}>Cached</Text>
              </View>
            )}
            {product.source === 'ocr' && (
              <View style={[styles.sourceBadge, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="sparkles" size={11} color="#92400E" style={{ marginRight: 3 }} />
                <Text style={[styles.sourceText, { color: '#92400E' }]}>Gemini AI Extracted</Text>
              </View>
            )}
          </View>

        </View>

        {/* ═══ RAW DATA RATING (Zero AI — Instant from nutrition table) ═══ */}
        <View style={styles.rawRatingCard}>
          <View style={styles.rawRatingHeader}>
            <Ionicons name="nutrition-outline" size={18} color="#1A1A1A" />
            <Text style={styles.rawRatingTitle}>Health Check</Text>
            <Text style={styles.rawRatingSubtitle}>WHO / FSSAI Limits</Text>
          </View>

          {macroResult.missingData ? (
            <View style={styles.rawRatingBody}>
              <Ionicons name="alert-circle-outline" size={20} color="#999" />
              <Text style={styles.rawRatingMissing}>Nutrition data not available for this product.</Text>
            </View>
          ) : (
            <View style={styles.rawRatingBody}>
              {/* Score Circle */}
              <View style={[styles.rawScoreCircle, 
                macroResult.score >= 8 ? styles.rawScoreGreen : 
                macroResult.score >= 5 ? styles.rawScoreYellow : styles.rawScoreRed
              ]}>
                <Text style={styles.rawScoreNumber}>{macroResult.score}</Text>
                <Text style={styles.rawScoreMax}>/10</Text>
              </View>

              {/* Breach Tags */}
              <View style={styles.rawBreachList}>
                {macroResult.breaches.length === 0 ? (
                  <View style={styles.rawSafeBadge}>
                    <Ionicons name="checkmark-circle" size={16} color="#047857" />
                    <Text style={styles.rawSafeText}>All within safe limits</Text>
                  </View>
                ) : (
                  macroResult.breaches.map((b, i) => (
                    <View key={i} style={styles.rawBreachBadge}>
                      <Ionicons name="warning" size={14} color="#B45309" />
                      <Text style={styles.rawBreachText}>
                        {b.source}: High {b.type} ({b.value}{b.unit})
                      </Text>
                    </View>
                  ))
                )}
              </View>
            </View>
          )}
        </View>

        {/* ═══ Deep AI Analysis Card (3-State: Idle Button → Loading → Results) ═══ */}
        <AICard
          isIdle={!product.analyzed && !analysisResult?.aiData && !product.aiData && !analyzing}
          isLoading={analyzing}
          hasIngredients={hasIngredients}
          progressText={aiProgress}
          onAnalyze={handleAnalyzeClick}
          animalContentFlag={analysisResult?.aiData?.animalContentFlag ?? product.aiData?.animalContentFlag}
          animalContentDetails={analysisResult?.aiData?.animalContentDetails ?? product.aiData?.animalContentDetails}
          harmfulChemicals={analysisResult?.aiData?.harmfulChemicals ?? product.aiData?.harmfulChemicals}
          aiScore={analysisResult?.aiData?.aiScore ?? product.aiData?.aiScore}
          aiRecommendation={analysisResult?.aiData?.aiRecommendation ?? product.aiData?.aiRecommendation}
        />



        {/* Doctor-Grade Max Safe Portion Limit */}
        {safePortion && !safePortion.isSafe && (
          <View style={[styles.section, { marginBottom: spacing.xl }]}>
            <View style={[styles.safePortionCard, safePortion.isSevere && styles.safePortionSevere]}>
              <View style={styles.safePortionHeader}>
                <Ionicons 
                  name={safePortion.isSevere ? "warning" : "information-circle"} 
                  size={20} 
                  color={safePortion.isSevere ? '#EF4444' : '#F59E0B'} 
                />
                <Text style={styles.safePortionTitle}>Max Safe Portion</Text>
              </View>
              <Text style={styles.safePortionValue}>
                {safePortion.maxGrams} <Text style={styles.safePortionUnit}>grams / ml per day</Text>
              </Text>
              <Text style={styles.safePortionDesc}>
                {safePortion.message}
              </Text>
            </View>
          </View>
        )}

        {/* Allergy Warnings */}
        {allergenWarnings.length > 0 && (
          <View style={styles.section}>
            <AllergyWarning warnings={allergenWarnings} />
          </View>
        )}

        {/* Ingredients */}
        {classified.length > 0 && (
          <View style={styles.section}>
            <View style={styles.rowLabel}>
              <Ionicons name="flask" size={18} color={colors.text} style={{ marginRight: 6 }} />
              <Text style={styles.sectionTitle}>Ingredients ({classified.length})</Text>
              {evaluatingIngredients && <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 10 }} />}
            </View>

            {redIngredients.length > 0 && (
              <>
                <View style={styles.rowLabel}>
                  <Ionicons name="alert-circle" size={14} color="#EF4444" style={{ marginRight: 4 }} />
                  <Text style={styles.colorGroupLabel}>Risky ({redIngredients.length})</Text>
                </View>
                <View style={styles.chipContainer}>
                  {redIngredients.map((ing, idx) => (
                    <IngredientChip key={`r${idx}`} ingredient={ing} onPress={handleIngredientPress} />
                  ))}
                </View>
              </>
            )}
            {yellowIngredients.length > 0 && (
              <>
                <View style={styles.rowLabel}>
                  <Ionicons name="warning" size={14} color="#F59E0B" style={{ marginRight: 4 }} />
                  <Text style={styles.colorGroupLabel}>Caution ({yellowIngredients.length})</Text>
                </View>
                <View style={styles.chipContainer}>
                  {yellowIngredients.map((ing, idx) => (
                    <IngredientChip key={`y${idx}`} ingredient={ing} onPress={handleIngredientPress} />
                  ))}
                </View>
              </>
            )}
            {greenIngredients.length > 0 && (
              <>
                <View style={styles.rowLabel}>
                  <Ionicons name="checkmark-circle" size={14} color="#22C55E" style={{ marginRight: 4 }} />
                  <Text style={styles.colorGroupLabel}>Safe ({greenIngredients.length})</Text>
                </View>
                <View style={styles.chipContainer}>
                  {greenIngredients.map((ing, idx) => (
                    <IngredientChip key={`g${idx}`} ingredient={ing} onPress={handleIngredientPress} />
                  ))}
                </View>
              </>
            )}
          </View>
        )}

        {/* Nutrition Table */}
        {product.nutrition && Object.keys(product.nutrition).length > 0 && (
          <View style={styles.section}>
            <NutritionTable nutrition={product.nutrition} />
          </View>
        )}

        {/* Contribute Button (Always shown) */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.contributeBtn} onPress={handleContribute} activeOpacity={0.8}>
            <Ionicons name="camera-outline" size={20} color="#FFF" />
            <Text style={styles.contributeBtnText}>Upload Product Photos</Text>
          </TouchableOpacity>
          <Text style={styles.analyzeHint}>
            Help us improve the database by uploading better photos for this product.
          </Text>
        </View>


        <Text style={styles.barcodeText}>Barcode: {product.barcode}</Text>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Ingredient Modal */}
      <IngredientModal
        visible={modalVisible}
        ingredient={selectedIngredient}
        onClose={() => setModalVisible(false)}
      />

      <OCRScannerOverlay
        visible={ocrVisible}
        onCancel={() => setOcrVisible(false)}
        onSubmit={handleOCRSubmit}
      />

      {/* Breakdown Modals */}
      <ScoreBreakdownModal 
        visible={macroModalVisible} 
        onClose={() => setMacroModalVisible(false)} 
        macro={scoreResult.macro} 
      />
      <AIQualityModal 
        visible={aiModalVisible} 
        onClose={() => setAiModalVisible(false)} 
        quality={scoreResult.ingredientQuality} 
        classifiedIngredients={classified} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  errorText: {
    ...typography.body, color: colors.textSecondary,
    textAlign: 'center', marginTop: 100,
  },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 8,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', ...shadows.sm,
  },
  headerTitle: { ...typography.h4, color: colors.text, flex: 1, textAlign: 'center' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.xl },

  imageSection: {
    marginBottom: spacing.lg, borderRadius: borderRadius.xl,
    overflow: 'hidden', ...shadows.md,
  },
  productImage: { width: '100%', height: 220, borderRadius: borderRadius.xl },
  placeholderImage: {
    width: '100%', height: 180, borderRadius: borderRadius.xl,
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  placeholderText: { ...typography.caption, color: 'rgba(255,255,255,0.8)' },
  dotRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    gap: 6, marginTop: 8,
  },
  dotIndicator: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#CBD5E1',
  },

  // ── Raw Data Rating (Phase 1) ──
  rawRatingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginBottom: spacing.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    ...shadows.sm,
  },
  rawRatingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  rawRatingTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1A1A1A',
    flex: 1,
  },
  rawRatingSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  rawRatingBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  rawRatingMissing: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    marginLeft: 8,
  },
  rawScoreCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  rawScoreGreen: { backgroundColor: '#D1FAE5' },
  rawScoreYellow: { backgroundColor: '#FEF3C7' },
  rawScoreRed: { backgroundColor: '#FEE2E2' },
  rawScoreNumber: {
    fontSize: 28,
    fontWeight: '900',
    color: '#1A1A1A',
  },
  rawScoreMax: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
    marginTop: 6,
  },
  rawBreachList: {
    flex: 1,
    gap: 6,
  },
  rawSafeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  rawSafeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#047857',
  },
  rawBreachBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  rawBreachText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#B45309',
  },

  infoSection: { marginBottom: spacing.lg },
  productName: { ...typography.h2, color: colors.text, marginBottom: 4 },
  brand: { ...typography.body, color: colors.textSecondary, marginBottom: 8 },
  metaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  sourceBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: borderRadius.full,
    alignSelf: 'flex-start',
  },
  sourceText: { ...typography.small, fontWeight: '600' },

  scoreSection: { marginBottom: spacing.xl, flexDirection: 'row', justifyContent: 'space-between' },
  scoreCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.xl,
    padding: spacing.xl, alignItems: 'center', borderWidth: 2,
    ...shadows.sm,
  },
  scoreValue: { fontSize: 36, fontWeight: '800' },
  scoreLabel: { ...typography.captionBold, color: colors.textSecondary, marginTop: 4 },
  scoreGrade: { ...typography.caption, color: colors.textMuted, marginTop: 2 },

  section: { marginBottom: spacing.xl },
  rowLabel: { flexDirection: 'row', alignItems: 'center' },
  sectionTitle: { ...typography.h4, color: colors.text },
  colorGroupLabel: {
    ...typography.captionBold, color: colors.textSecondary,
  },
  chipContainer: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.sm, marginTop: 8 },

  safePortionCard: {
    backgroundColor: '#F9FAFB', borderRadius: borderRadius.xl, padding: spacing.xl,
    borderWidth: 1, borderColor: '#E5E7EB', ...shadows.sm,
  },
  safePortionSevere: {
    backgroundColor: '#FEF2F2', borderColor: '#FECACA',
  },
  safePortionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.xs,
  },
  safePortionTitle: {
    ...typography.captionBold, color: colors.textSecondary,
  },
  safePortionValue: {
    ...typography.h2, color: colors.text,
  },
  safePortionUnit: {
    ...typography.caption, color: colors.textMuted, fontWeight: 'normal',
  },
  safePortionDesc: {
    ...typography.caption, color: colors.textSecondary, marginTop: 4, lineHeight: 20,
  },

  insightCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.xl,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border, ...shadows.sm,
    marginTop: 8,
  },
  insightCategoryBadge: {
    backgroundColor: colors.primarySoft, paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: borderRadius.full, alignSelf: 'flex-start', marginBottom: 12,
  },
  insightCategory: { ...typography.captionBold, color: colors.primaryDark },
  insightSummary: {
    ...typography.bodyBold, color: colors.text, lineHeight: 22, marginBottom: 10,
  },
  insightExplanation: {
    ...typography.body, color: colors.textSecondary, lineHeight: 20, marginBottom: 12,
  },
  recommendationBox: {
    backgroundColor: colors.secondarySoft, padding: spacing.md,
    borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.secondary + '30',
  },
  recommendationTitle: { ...typography.captionBold, color: colors.secondaryDark, marginBottom: 4 },
  recommendationText: { ...typography.body, color: colors.text, lineHeight: 20 },

  alternativesBox: {
    marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)',
  },
  alternativesTitle: {
    ...typography.captionBold, color: colors.primaryDark,
  },
  altChip: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primarySoft,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: borderRadius.full, marginRight: 8,
  },
  altText: {
    ...typography.captionBold, color: colors.primaryDark, marginLeft: 6,
  },

  analyzeBtn: { borderRadius: borderRadius.lg, overflow: 'hidden', ...shadows.md },
  analyzeBtnGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, gap: 10,
  },
  analyzeBtnText: { ...typography.bodyBold, color: '#FFF' },
  analyzeHint: {
    ...typography.caption, color: colors.textMuted, textAlign: 'center', marginTop: 8,
  },
  toggleAiBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, marginTop: 12, gap: 6,
    borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
  },
  toggleAiBtnText: {
    ...typography.bodyBold,
  },
  contributeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, gap: 10, borderRadius: borderRadius.lg,
    backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primary,
  },
  contributeBtnText: {
    ...typography.bodyBold, color: colors.primaryDark,
  },
  closeInsightBtn: {
    flexDirection: 'row', alignItems: 'center', marginTop: spacing.md,
    alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12,
    backgroundColor: '#F1F5F9', borderRadius: borderRadius.full,
  },
  closeInsightText: {
    ...typography.captionBold, color: colors.textSecondary, marginLeft: 6,
  },
  barcodeText: {
    ...typography.caption,
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: spacing.xl,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 1,
  }
});
