import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import QRCode from 'qrcode';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing, borderRadius, shadows } from '../theme/spacing';
import { useProducts } from '../store/ProductContext';
import { useUser, getActiveProvider } from '../store/UserContext';
import AICard from '../components/AICard';
import IngredientChip from '../components/IngredientChip';
import IngredientModal from '../components/IngredientModal';
import NutritionTable from '../components/NutritionTable';
import AllergyWarning from '../components/AllergyWarning';
import OCRScannerOverlay from '../components/OCRScannerOverlay';
import { checkAllergens } from '../utils/allergens';
import { calculateSafePortion } from '../utils/scoring';
import { calculateMacroScore } from '../utils/thresholds';
import { analyzeProduct } from '../services/analysis.service';
import { fetchProductImageUrls } from '../services/openfoodfacts';
import { submitProductContribution } from '../services/contributionQueue';
import { generateQrPdf } from '../services/qrPdf';
import { deletePersonalProduct } from '../services/supabase/personalProducts';

const SCREEN_WIDTH = Dimensions.get('window').width - 32;

const QR_RENDER_SIZE = 240;

function NativeQrCode({ modules, size = QR_RENDER_SIZE }) {
  if (!modules) return null;
  const cellSize = size / modules.size;
  const rows = [];
  for (let row = 0; row < modules.size; row++) {
    const cells = [];
    for (let col = 0; col < modules.size; col++) {
      const idx = row * modules.size + col;
      const isDark = modules.data[idx] === 1;
      cells.push(
        <View
          key={col}
          style={{
            width: cellSize,
            height: cellSize,
            backgroundColor: isDark ? '#111827' : '#FFFFFF',
          }}
        />
      );
    }
    rows.push(
      <View key={row} style={{ flexDirection: 'row' }}>
        {cells}
      </View>
    );
  }
  return (
    <View style={{ alignSelf: 'center', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#E5E7EB', marginBottom: spacing.lg }}>
      {rows}
    </View>
  );
}

function getSyncTone(status) {
  if (status === 'synced') {
    return { icon: 'checkmark-circle', color: '#166534', backgroundColor: '#DCFCE7', borderColor: '#86EFAC' };
  }
  if (status === 'blocked') {
    return { icon: 'alert-circle', color: '#991B1B', backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' };
  }
  if (status === 'running') {
    return { icon: 'sync', color: '#1D4ED8', backgroundColor: '#DBEAFE', borderColor: '#93C5FD' };
  }
  return { icon: 'cloud-upload-outline', color: '#92400E', backgroundColor: '#FEF3C7', borderColor: '#FCD34D' };
}

function getSyncTitle(sync = {}) {
  if (!sync) return 'Queued for sync';
  if (sync.status === 'synced') return 'Synced';
  if (sync.status === 'blocked') return 'Needs attention';
  if (sync.offNameStage === 'pending') return 'Syncing name';
  if (sync.offNameStage === 'done' && sync.offImageStage === 'pending') return 'Uploading images';
  if (sync.localOcrStage === 'done' && sync.aiCleanupStage === 'pending') return 'OCR ready';
  if (sync.aiCleanupStage === 'running' || (sync.status === 'running' && sync.aiCleanupStage === 'pending' && sync.localOcrStage === 'done')) {
    return 'Cleaning text';
  }
  if (sync.supabaseStage === 'pending' && sync.aiCleanupStage === 'done') return 'Saving result';
  if (sync.status === 'running') return 'Sync in progress';
  return 'Queued for sync';
}

export default function ProductDetailScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { productId } = route.params;
  const { productState, productDispatch } = useProducts();
  const { userPrefs } = useUser();

  const product = productState.history.find((item) => item.id === productId)
    || productState.sessionScans.find((item) => item.id === productId);

  const [selectedIngredient, setSelectedIngredient] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [ocrVisible, setOcrVisible] = useState(false);
  const [classified, setClassified] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiProgress, setAiProgress] = useState('');
  const [analysisResult, setAnalysisResult] = useState(null);
  const [offImages, setOffImages] = useState([]);
  const [imageState, setImageState] = useState('idle');
  const [contributing, setContributing] = useState(false);
  const [qrModules, setQrModules] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const localPreviewImages = useMemo(
    () => (product?.pendingLocalImages || []).filter(Boolean),
    [product?.pendingLocalImages]
  );

  const loadOffImages = useCallback(async () => {
    // Personal QR products use Cloudinary images — no OFF fetch needed
    if (product?.source === 'personal_qr') {
      const cloudinaryUrls = [
        product.images?.front,
        product.images?.ingredients,
        product.images?.nutrition,
      ].filter(Boolean);
      setOffImages(cloudinaryUrls);
      setImageState(cloudinaryUrls.length > 0 ? 'loaded' : 'empty');
      return;
    }

    if (!product?.barcode) {
      setOffImages([]);
      setImageState('empty');
      return;
    }

    setImageState('loading');

    try {
      const urls = await fetchProductImageUrls(product.barcode);
      setOffImages(urls);
      setImageState(urls.length > 0 ? 'loaded' : 'empty');
    } catch {
      setOffImages([]);
      setImageState('failed');
    }
  }, [product?.barcode, product?.source, product?.images]);

  useEffect(() => {
    loadOffImages().catch(() => {});
  }, [loadOffImages, product?.contributionSync?.status]);

  useEffect(() => {
    if (!product?.ingredients || product.ingredients.length === 0) {
      setClassified([]);
      return;
    }

    const { classifyIngredients } = require('../utils/ingredientDictionary');
    setClassified(classifyIngredients(product.ingredients));
  }, [product?.ingredients]);

  useEffect(() => {
    if (product?.source !== 'personal_qr' || !product?.barcode) return;
    try {
      const qr = QRCode.create(product.barcode, { errorCorrectionLevel: 'M' });
      setQrModules(qr.modules);
    } catch (_err) {
      setQrModules(null);
    }
  }, [product?.source, product?.barcode]);

  const allergenWarnings = useMemo(
    () => checkAllergens(product?.ingredients || [], userPrefs.allergies),
    [product?.ingredients, userPrefs.allergies]
  );

  const macroResult = useMemo(
    () => calculateMacroScore(product?.nutrition),
    [product?.nutrition]
  );

  const safePortion = useMemo(
    () => calculateSafePortion(product?.nutrition),
    [product?.nutrition]
  );

  const redIngredients = classified.filter((item) => item.color === 'red');
  const yellowIngredients = classified.filter((item) => item.color === 'yellow');
  const greenIngredients = classified.filter((item) => item.color === 'green');
  const activeAiScore = analysisResult?.aiData?.aiScore ?? product?.aiData?.aiScore;
  const isAiDataValid = activeAiScore !== null && activeAiScore !== undefined;
  const syncTone = getSyncTone(product?.contributionSync?.status);

  const handleContribute = useCallback(() => {
    if (!userPrefs.email) {
      Alert.alert(
        'Sign In Required',
        'Only signed-in users can upload new product photos from the detail screen.'
      );
      return;
    }

    setOcrVisible(true);
  }, [userPrefs.email]);

  const handleOCRSubmit = useCallback(async (photos, productName) => {
    setOcrVisible(false);
    setContributing(true);

    try {
      const contributionResult = await submitProductContribution({
        product,
        photos,
        productName,
        userPrefs,
        productDispatch,
      });

      if (contributionResult.state === 'completed') {
        loadOffImages().catch(() => {});
      }

      const title = contributionResult.state === 'completed'
        ? 'Upload Complete'
        : contributionResult.state === 'blocked'
          ? 'Saved Locally, Action Needed'
          : 'Saved Locally';

      Alert.alert(title, contributionResult.message);
    } catch (error) {
      Alert.alert('Upload Failed', error.message || 'The contribution could not be prepared.');
    } finally {
      setContributing(false);
    }
  }, [loadOffImages, product, productDispatch, userPrefs]);

  const handleDownloadPdf = async () => {
    if (!product) return;

    setDownloading(true);
    try {
      // Create a mock personal product shape that generateQrPdf expects
      const pdfProduct = {
        ffadzCode: product.barcode,
        name: product.name,
        brand: product.brand,
        nutrition: product.nutrition,
        ingredients: product.ingredients,
        images: {
          front: product.images?.front || null,
          ingredients: product.images?.ingredients || null,
          nutrition: product.images?.nutrition || null,
        }
      };

      const pdf = await generateQrPdf(pdfProduct);
      if (!pdf.success || !pdf.uri) {
        throw new Error(pdf.error || 'Could not generate the QR PDF.');
      }

      // Try SAF to let the user pick a save location (Downloads, etc.)
      let saved = false;
      try {
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
            permissions.directoryUri,
            `${pdfProduct.ffadzCode}.pdf`,
            'application/pdf'
          );
          const pdfBase64 = await FileSystem.readAsStringAsync(pdf.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          await FileSystem.writeAsStringAsync(fileUri, pdfBase64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          Alert.alert('PDF Saved', `${pdfProduct.ffadzCode}.pdf saved to your chosen folder.`);
          saved = true;
        }
      } catch (_safError) {
        // SAF unavailable or user cancelled — try sharing fallback
      }

      if (!saved) {
        try {
          const canShare = await Sharing.isAvailableAsync();
          if (canShare) {
            await Sharing.shareAsync(pdf.uri, {
              mimeType: 'application/pdf',
              dialogTitle: `Share ${pdfProduct.ffadzCode} PDF`,
            });
            saved = true;
          }
        } catch (_shareError) {
          // expo-sharing may fail on SDK version mismatch
        }
      }

      if (!saved) {
        Alert.alert('PDF Generated', `PDF ready at:\n${pdf.uri}\n\nSharing is unavailable on this build.`);
      }
    } catch (error) {
      Alert.alert('PDF Error', error.message || 'Could not generate the QR PDF.');
    } finally {
      setDownloading(false);
    }
  };

  const handleDeleteProduct = useCallback(() => {
    if (!product || product.source !== 'personal_qr') return;
    
    Alert.alert(
      'Delete QR Product',
      `Are you sure you want to delete "${product.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            const result = await deletePersonalProduct(product.personalProductId);
            if (result.success) {
              productDispatch({ type: 'REMOVE_PRODUCT', payload: product.id });
              navigation.goBack();
            } else {
              Alert.alert('Delete Failed', result.error || 'Could not delete product.');
            }
            setDeleting(false);
          },
        },
      ]
    );
  }, [product, navigation, productDispatch]);

  const handleAnalyzeClick = useCallback(async () => {
    if (!product || analyzing) return;

    const currentScore = analysisResult?.aiData?.aiScore ?? product.aiData?.aiScore;
    if (product.analyzed && currentScore !== null && currentScore !== undefined) return;

    setAnalyzing(true);
    try {
      const result = await analyzeProduct(product, {
        providerContext: getActiveProvider(userPrefs),
        onProgress: (info) => {
          setAiProgress(`[${info.step}/${info.total}] ${info.label}`);
        },
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
        Alert.alert('Analysis Issue', result.error);
      }
    } catch (error) {
      Alert.alert('Analysis Failed', error.message || 'Could not complete analysis.');
    } finally {
      setAnalyzing(false);
      setAiProgress('');
    }
  }, [analysisResult, analyzing, product, productDispatch, userPrefs]);

  const renderImageGallery = () => {
    if (offImages.length > 0) {
      return (
        <>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ width: SCREEN_WIDTH }}>
            {offImages.map((uri) => (
              <Image key={uri} source={{ uri }} style={styles.productImage} resizeMode="cover" />
            ))}
          </ScrollView>
          <View style={styles.dotRow}>
            {offImages.map((uri) => (
              <View key={`dot-${uri}`} style={styles.dotIndicator} />
            ))}
          </View>
        </>
      );
    }

    if (localPreviewImages.length > 0) {
      return (
        <>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ width: SCREEN_WIDTH }}>
            {localPreviewImages.map((uri) => (
              <Image key={uri} source={{ uri }} style={styles.productImage} resizeMode="cover" />
            ))}
          </ScrollView>
          <View style={styles.previewBanner}>
            <Ionicons name="images-outline" size={16} color="#92400E" />
            <Text style={styles.previewBannerText}>
              Showing local preview images until Open Food Facts finishes updating.
            </Text>
          </View>
        </>
      );
    }

    if (imageState === 'loading') {
      return (
        <View style={styles.loadingImageCard}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.loadingImageText}>Loading Open Food Facts images...</Text>
        </View>
      );
    }

    if (imageState === 'failed') {
      return (
        <View style={styles.loadingImageCard}>
          <Ionicons name="cloud-offline-outline" size={28} color="#64748B" />
          <Text style={styles.loadingImageText}>Could not load Open Food Facts images right now.</Text>
          <TouchableOpacity style={styles.retryImagesBtn} onPress={() => loadOffImages().catch(() => {})} activeOpacity={0.8}>
            <Ionicons name="refresh-outline" size={14} color="#1E3A8A" />
            <Text style={styles.retryImagesText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (product?.images?.front) {
      return <Image source={{ uri: product.images.front }} style={styles.productImage} resizeMode="cover" />;
    }

    return (
      <LinearGradient colors={colors.gradientPurple} style={styles.placeholderImage}>
        <Ionicons name="cube-outline" size={48} color="rgba(255,255,255,0.7)" />
        <Text style={styles.placeholderText}>No image available yet</Text>
      </LinearGradient>
    );
  };

  if (!product) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Product not found</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{product.name}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.imageSection}>
          {renderImageGallery()}
        </View>

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
            {(product.source === 'ocr' || product.source === 'ai_ocr') && (
              <View style={[styles.sourceBadge, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="sparkles" size={11} color="#92400E" style={{ marginRight: 4 }} />
                <Text style={[styles.sourceText, { color: '#92400E' }]}>AI Extracted</Text>
              </View>
            )}
            {product.source === 'personal_qr' && (
              <View style={[styles.sourceBadge, { backgroundColor: '#EEF2FF' }]}>
                <Ionicons name="qr-code-outline" size={11} color="#4338CA" style={{ marginRight: 4 }} />
                <Text style={[styles.sourceText, { color: '#4338CA' }]}>Personal QR</Text>
              </View>
            )}
          </View>
        </View>

        {product.contributionSync && (
          <View style={[styles.syncCard, { backgroundColor: syncTone.backgroundColor, borderColor: syncTone.borderColor }]}>
            <Ionicons name={syncTone.icon} size={18} color={syncTone.color} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.syncTitle, { color: syncTone.color }]}>
                {getSyncTitle(product.contributionSync)}
              </Text>
              <Text style={[styles.syncText, { color: syncTone.color }]}>
                {product.contributionSync.message}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.rawRatingCard}>
          <View style={styles.rawRatingHeader}>
            <Ionicons name="nutrition-outline" size={18} color="#1A1A1A" />
            <Text style={styles.rawRatingTitle}>Health Check</Text>
            <Text style={styles.rawRatingSubtitle}>WHO / FSSAI Limits</Text>
          </View>

          {macroResult.missingData ? (
            <View style={styles.rawRatingBody}>
              <Ionicons name="alert-circle-outline" size={20} color="#999" />
              <Text style={styles.rawRatingMissing}>Nutrition data is not available for this product.</Text>
            </View>
          ) : (
            <View style={styles.rawRatingBody}>
              <View style={[
                styles.rawScoreCircle,
                macroResult.score >= 8 ? styles.rawScoreGreen : macroResult.score >= 5 ? styles.rawScoreYellow : styles.rawScoreRed,
              ]}
              >
                <Text style={styles.rawScoreNumber}>{macroResult.score}</Text>
                <Text style={styles.rawScoreMax}>/10</Text>
              </View>

              <View style={styles.rawBreachList}>
                {macroResult.breaches.length === 0 ? (
                  <View style={styles.rawSafeBadge}>
                    <Ionicons name="checkmark-circle" size={16} color="#047857" />
                    <Text style={styles.rawSafeText}>All within safe limits</Text>
                  </View>
                ) : (
                  macroResult.breaches.map((breach, index) => (
                    <View key={`${breach.type}-${index}`} style={styles.rawBreachBadge}>
                      <Ionicons name="warning" size={14} color="#B45309" />
                      <Text style={styles.rawBreachText}>
                        {breach.source}: High {breach.type} ({breach.value}{breach.unit})
                      </Text>
                    </View>
                  ))
                )}
              </View>
            </View>
          )}
        </View>

        <AICard
          isIdle={!isAiDataValid && !analyzing}
          isLoading={analyzing}
          hasIngredients={Boolean(product?.ingredients?.length)}
          progressText={aiProgress}
          onAnalyze={handleAnalyzeClick}
          onClose={() => {}}
          animalContentFlag={analysisResult?.aiData?.animalContentFlag ?? product.aiData?.animalContentFlag}
          animalContentDetails={analysisResult?.aiData?.animalContentDetails ?? product.aiData?.animalContentDetails}
          harmfulChemicals={analysisResult?.aiData?.harmfulChemicals ?? product.aiData?.harmfulChemicals}
          aiScore={analysisResult?.aiData?.aiScore ?? product.aiData?.aiScore}
          aiRecommendation={analysisResult?.aiData?.aiRecommendation ?? product.aiData?.aiRecommendation}
        />

        {safePortion && !safePortion.isSafe && (
          <View style={styles.section}>
            <View style={[styles.safePortionCard, safePortion.isSevere && styles.safePortionSevere]}>
              <View style={styles.safePortionHeader}>
                <Ionicons name={safePortion.isSevere ? 'warning' : 'information-circle'} size={20} color={safePortion.isSevere ? '#EF4444' : '#F59E0B'} />
                <Text style={styles.safePortionTitle}>Max Safe Portion</Text>
              </View>
              <Text style={styles.safePortionValue}>
                {safePortion.maxGrams} <Text style={styles.safePortionUnit}>grams / ml per day</Text>
              </Text>
              <Text style={styles.safePortionDesc}>{safePortion.message}</Text>
            </View>
          </View>
        )}

        {allergenWarnings.length > 0 && (
          <View style={styles.section}>
            <AllergyWarning warnings={allergenWarnings} />
          </View>
        )}

        {product.source === 'personal_qr' && (
          <View style={styles.section}>
            <View style={styles.rowLabel}>
              <Ionicons name="qr-code" size={18} color={colors.text} style={{ marginRight: 6 }} />
              <Text style={styles.sectionTitle}>FFADZ QR Code</Text>
            </View>
            <View style={styles.qrCard}>
              {qrModules ? (
                <NativeQrCode modules={qrModules} />
              ) : (
                <View style={[styles.qrPlaceholder]}>
                  <ActivityIndicator size="small" color="#1D4ED8" />
                </View>
              )}
              <TouchableOpacity style={styles.downloadBtn} onPress={handleDownloadPdf} disabled={downloading || !qrModules} activeOpacity={0.85}>
                {downloading ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="download-outline" size={18} color="#FFF" />
                    <Text style={styles.downloadBtnText}>Download QR as PDF</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.downloadBtn, { backgroundColor: '#FEE2E2', marginTop: 12 }]} 
                onPress={handleDeleteProduct} 
                disabled={deleting} 
                activeOpacity={0.85}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="#EF4444" />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    <Text style={[styles.downloadBtnText, { color: '#EF4444' }]}>Delete Product</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {classified.length > 0 && (
          <View style={styles.section}>
            <View style={styles.rowLabel}>
              <Ionicons name="flask" size={18} color={colors.text} style={{ marginRight: 6 }} />
              <Text style={styles.sectionTitle}>Ingredients ({classified.length})</Text>
            </View>

            {redIngredients.length > 0 && (
              <>
                <View style={styles.rowLabel}>
                  <Ionicons name="alert-circle" size={14} color="#EF4444" style={{ marginRight: 4 }} />
                  <Text style={styles.colorGroupLabel}>Risky ({redIngredients.length})</Text>
                </View>
                <View style={styles.chipContainer}>
                  {redIngredients.map((ingredient, index) => (
                    <IngredientChip key={`red-${index}`} ingredient={ingredient} onPress={(item) => {
                      setSelectedIngredient(item);
                      setModalVisible(true);
                    }}
                    />
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
                  {yellowIngredients.map((ingredient, index) => (
                    <IngredientChip key={`yellow-${index}`} ingredient={ingredient} onPress={(item) => {
                      setSelectedIngredient(item);
                      setModalVisible(true);
                    }}
                    />
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
                  {greenIngredients.map((ingredient, index) => (
                    <IngredientChip key={`green-${index}`} ingredient={ingredient} onPress={(item) => {
                      setSelectedIngredient(item);
                      setModalVisible(true);
                    }}
                    />
                  ))}
                </View>
              </>
            )}
          </View>
        )}

        {product.nutrition && Object.keys(product.nutrition).length > 0 && (
          <View style={styles.section}>
            <NutritionTable nutrition={product.nutrition} />
          </View>
        )}

        {product.source !== 'personal_qr' && (
          <View style={styles.section}>
            <TouchableOpacity style={[styles.contributeBtn, contributing && { opacity: 0.7 }]} onPress={handleContribute} activeOpacity={0.8} disabled={contributing}>
              {contributing ? (
                <ActivityIndicator size="small" color={colors.primaryDark} />
              ) : (
                <Ionicons name="camera-outline" size={20} color={colors.primaryDark} />
              )}
              <Text style={styles.contributeBtnText}>
                {contributing ? 'Processing upload...' : 'Upload Product Photos'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.analyzeHint}>
              Upload front, ingredients, and nutrition photos. The app will keep retrying OCR and OFF sync until they finish or need attention.
            </Text>
          </View>
        )}

        <Text style={styles.barcodeText}>
          {product.source === 'personal_qr' ? `FFADZ Code: ${product.barcode}` : `Barcode: ${product.barcode}`}
        </Text>
        <View style={{ height: 120 }} />
      </ScrollView>

      <IngredientModal
        visible={modalVisible}
        ingredient={selectedIngredient}
        onClose={() => setModalVisible(false)}
      />

      <OCRScannerOverlay
        visible={ocrVisible}
        initialProductName={product?.name && product.name !== 'Unknown Product' ? product.name : ''}
        onCancel={() => setOcrVisible(false)}
        onSubmit={handleOCRSubmit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  errorText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  headerTitle: {
    ...typography.h4,
    color: colors.text,
    flex: 1,
    textAlign: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.xl },
  imageSection: {
    marginBottom: spacing.lg,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    ...shadows.md,
  },
  productImage: {
    width: SCREEN_WIDTH,
    height: 240,
    borderRadius: borderRadius.xl,
  },
  placeholderImage: {
    width: '100%',
    height: 200,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  placeholderText: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.8)',
  },
  dotRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  dotIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#CBD5E1',
  },
  previewBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    padding: 12,
    borderRadius: borderRadius.lg,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  previewBannerText: {
    ...typography.caption,
    color: '#92400E',
    flex: 1,
  },
  loadingImageCard: {
    height: 180,
    borderRadius: borderRadius.xl,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingImageText: {
    ...typography.body,
    color: '#475569',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  retryImagesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    backgroundColor: '#DBEAFE',
  },
  retryImagesText: {
    ...typography.captionBold,
    color: '#1E3A8A',
  },
  infoSection: { marginBottom: spacing.lg },
  productName: {
    ...typography.h2,
    color: colors.text,
    marginBottom: 4,
  },
  brand: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  metaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  sourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    alignSelf: 'flex-start',
  },
  sourceText: {
    ...typography.small,
    fontWeight: '600',
  },
  syncCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  syncTitle: {
    ...typography.captionBold,
    marginBottom: 2,
  },
  syncText: {
    ...typography.caption,
    lineHeight: 18,
  },
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
  section: { marginBottom: spacing.xl },
  rowLabel: { flexDirection: 'row', alignItems: 'center' },
  sectionTitle: {
    ...typography.h4,
    color: colors.text,
  },
  colorGroupLabel: {
    ...typography.captionBold,
    color: colors.textSecondary,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.sm,
    marginTop: 8,
  },
  safePortionCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...shadows.sm,
  },
  safePortionSevere: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  safePortionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.xs,
  },
  safePortionTitle: {
    ...typography.captionBold,
    color: colors.textSecondary,
  },
  safePortionValue: {
    ...typography.h2,
    color: colors.text,
  },
  safePortionUnit: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: 'normal',
  },
  safePortionDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 20,
  },
  contributeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  contributeBtnText: {
    ...typography.bodyBold,
    color: colors.primaryDark,
  },
  analyzeHint: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
  },
  barcodeText: {
    ...typography.caption,
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: spacing.xl,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 1,
  },
  qrCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...shadows.sm,
  },
  qrPlaceholder: {
    width: 240,
    height: 240,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: borderRadius.full,
    backgroundColor: '#111827',
  },
  downloadBtnText: {
    ...typography.bodyBold,
    color: '#FFF',
  },
});
