// Ffads — Scanner Screen (Continuous Camera + Smart Barcode Validation)
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  StatusBar, TextInput, Platform, Dimensions, Animated,
  Keyboard, Vibration,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing, borderRadius, shadows } from '../theme/spacing';
import { useProducts } from '../store/ProductContext';
import { useUser, getAllGeminiKeys } from '../store/UserContext';
import AICardPreview from '../components/AICardPreview';
import EmptyState from '../components/EmptyState';
import OCRScannerOverlay from '../components/OCRScannerOverlay';
import { scanProduct } from '../services/product.service';
import { processProductPhotos } from '../services/gemini';
import { saveProduct, recordScan, logUserContribution } from '../services/supabase';
import { getOFFCredentials, isOFFConfigured, contributeToOFF } from '../services/openfoodfacts';
import { isValidBarcode, isValidEAN8, isValidEAN13 } from '../components/scanner/barcodeValidators';
import { logError, logEvent } from '../services/telemetry';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCAN_CONFIDENCE_THRESHOLD = 3; // Must read same barcode 3 times

export default function ScannerScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { productState, productDispatch } = useProducts();
  const { userPrefs } = useUser();
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const [toast, setToast] = useState(null);
  
  // OCR Flow State
  const [ocrVisible, setOcrVisible] = useState(false);
  const [pendingProduct, setPendingProduct] = useState(null);

  // Barcode confidence tracking
  const readCountRef = useRef({});       // { barcode: count }
  const lastAcceptedRef = useRef('');     // prevent re-scanning same product
  const cooldownRef = useRef(false);     // brief cooldown after accepting
  const toastTimeoutRef = useRef(null);
  const toastAnim = useRef(new Animated.Value(-100)).current;
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  // Bug Fix: Guard all async state updates — never call setState on an unmounted component
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Bug Fix: Clear pending toast timer on unmount to prevent memory leaks
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // Animate scan line
  useEffect(() => {
    if (!cameraOpen) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(scanLineAnim, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [cameraOpen]);

  // Show toast (replaces Alert.alert)
  const showToast = useCallback((message, type = 'success', duration = 3000) => {
    if (!isMountedRef.current) return; // Guard: don't update if unmounted
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, type });

    Animated.spring(toastAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start();

    toastTimeoutRef.current = setTimeout(() => {
      if (!isMountedRef.current) return; // Guard: component may have unmounted during timeout
      Animated.timing(toastAnim, {
        toValue: -100,
        duration: 200,
        useNativeDriver: true,
      }).start(() => { if (isMountedRef.current) setToast(null); });
    }, duration);
  }, [toastAnim]);




  // Handle camera barcode detection (confidence-based)
  const handleBarcodeScanned = useCallback(({ data, type }) => {
    if (cooldownRef.current || !data) return;

    // Skip if same as last accepted
    if (data === lastAcceptedRef.current) return;

    // Validate format
    if (!isValidBarcode(data, type)) return;

    // Build confidence — require multiple reads of same barcode
    const counts = readCountRef.current;
    counts[data] = (counts[data] || 0) + 1;

    // Clear other barcode counts (only track latest)
    Object.keys(counts).forEach((k) => {
      if (k !== data) delete counts[k];
    });

    if (counts[data] < SCAN_CONFIDENCE_THRESHOLD) return;

    // Confidence reached — accept this barcode
    counts[data] = 0;
    lastAcceptedRef.current = data;
    cooldownRef.current = true;

    // Haptic feedback
    Vibration.vibrate(80);

    // Process (camera stays open)
    processBarcode(data);

    // Cooldown: don't accept new scans for 3 seconds
    setTimeout(() => {
      cooldownRef.current = false;
    }, 3000);
  // Bug Fix: isValidBarcode is a stable import, not state/prop — removed from dep array
  // to prevent unnecessary callback recreation on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processBarcode]);

  // Process barcode through product.service
  const processBarcode = useCallback(async (barcode) => {
    if (!barcode || scanning) return;
    setScanning(true);

    try {
      const { product, source } = await scanProduct(barcode);
      
      if (product.needsOCR) {
        setPendingProduct(product);
        setOcrVisible(true);
      } else {
        productDispatch({ type: 'ADD_PRODUCT', payload: product });
        setBarcodeInput('');

        // Persist scan history to Supabase (non-blocking background task)
        console.log(`📷 [Scanner] Saving product "${product.name}" to Supabase + logging scan...`);
        (async () => {
          try {
            const r = await saveProduct(product);
            if (r?.success) {
              // recordScan has FK on products(barcode) so must run after saveProduct succeeds
              await recordScan(product.barcode, userPrefs.email || null);
            } else {
              logError('Scanner saveProduct Error (Partial Failure)', r?.error || 'unknown', { barcode: product.barcode });
            }
          } catch (e) {
            logError('Scanner Supabase Background Save', e, { barcode: product.barcode });
          }
        })();

        if (source === 'cache') {
          showToast(`📦 ${product.name} — already in history`, 'info');
        } else if (source === 'openfoodfacts') {
          showToast(`✅ ${product.name} by ${product.brand}`, 'success');
        } else {
          showToast(`📷 Product added`, 'warning');
        }
      }
    } catch (error) {
      if (scanning) {
        showToast('❌ Lookup failed — check connection', 'error');
      }
    } finally {
      setScanning(false);
    }
  }, [scanning, productDispatch, showToast, userPrefs.email]);

  const handleCancelScan = useCallback(() => {
    setScanning(false);
    showToast('Scan cancelled', 'info');
  }, [showToast]);

  const handleManualScan = useCallback(() => {
    const barcode = barcodeInput.trim();
    if (!barcode) {
      showToast('Type a barcode number or use the camera', 'info');
      return;
    }
    Keyboard.dismiss();
    processBarcode(barcode);
  }, [barcodeInput, processBarcode, showToast]);

  const handleOpenCamera = useCallback(async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        showToast('Camera permission needed for scanning', 'error');
        return;
      }
    }
    readCountRef.current = {};
    lastAcceptedRef.current = '';
    cooldownRef.current = false;
    setCameraOpen(true);
  }, [permission, requestPermission, showToast]);

  const handleProductPress = useCallback((product) => {
    navigation.navigate('ProductDetail', { productId: product.id });
  }, [navigation]);

  const handleOCRSubmit = async (photos, productName) => {
    try {
      const allKeys = getAllGeminiKeys(userPrefs);
      console.log(`\n📷 ═══════════════════════════════════════════`);
      console.log(`📷 [Scanner:OCR] START — ${allKeys.length} key(s) available | model: ${userPrefs.geminiModel}`);
      console.log(`📷 ═══════════════════════════════════════════`);

      // Call Gemini Vision to extract data
      const ocrData = await processProductPhotos(
        {
          ingredients: photos.ingredients?.base64 || null,
          nutrition:   photos.nutrition?.base64   || null,
        },
        allKeys,
        userPrefs.geminiModel
      );
      
      // Merge extracted fields — user-typed productName takes priority
      const finalProduct = {
        ...pendingProduct,
        name: productName || (ocrData.name !== 'Product Name' && ocrData.name ? ocrData.name : pendingProduct.name),
        brand: ocrData.brand !== 'Brand Name' && ocrData.brand ? ocrData.brand : pendingProduct.brand,
        ingredients: ocrData.ingredients || [],
        ingredientsRaw: ocrData.ingredientsRaw || '',
        nutrition: ocrData.nutrition || {},
        needsOCR: false,
        source: 'ai_ocr',
        frontPhotoBase64: photos.front?.base64 || null, // kept for display/storage
      };

      productDispatch({ type: 'ADD_PRODUCT', payload: finalProduct });
      if (isMountedRef.current) {
        setOcrVisible(false);
        setPendingProduct(null);
        setBarcodeInput('');
      }

      // Bug Fix: Replace .then() chain with async IIFE — no state updates inside,
      // so safe even if the user navigates away before this resolves.
      (async () => {
        try {
          const r = await saveProduct(finalProduct);
          if (r?.success) {
            console.log(`📷 [Scanner:OCR] ✅ Product saved to Supabase: "${finalProduct.name}" (${finalProduct.barcode})`);
            // recordScan has FK on products(barcode), must run after saveProduct
            await recordScan(finalProduct.barcode, userPrefs.email || null).catch(e =>
              logError('Scanner OCR recordScan', e, { barcode: finalProduct.barcode })
            );

            let frontUploaded = false;

            // Attempt Open Food Facts upload in background if configured
            const offCreds = getOFFCredentials(userPrefs);
            if (isOFFConfigured(offCreds)) {
              console.log(`📷 [Scanner:OCR] OFF configured — attempting background upload to Open Food Facts...`);
              try {
                const offPayload = {
                  barcode: finalProduct.barcode,
                  name:    finalProduct.name,
                  brand:   finalProduct.brand,
                  ingredientsRaw: finalProduct.ingredientsRaw,
                  nutrition:      finalProduct.nutrition,
                };
                const imagesToUpload = [
                  photos.front?.base64 || null,
                  null, // no separate nutrition photo
                  photos.back?.base64  || null,
                ];
                const offResult = await contributeToOFF(offPayload, imagesToUpload, offCreds);
                if (offResult.success) {
                  console.log(`📷 [Scanner:OCR] ✅ Background OFF upload successful`);
                  frontUploaded = !!photos.front;
                } else {
                  console.warn(`📷 [Scanner:OCR] ⚠️ Background OFF upload failed: ${offResult.error}`);
                }
              } catch (offErr) {
                logError('Scanner OCR OFF Upload', offErr, { barcode: finalProduct.barcode });
              }
            }

            logUserContribution({
              barcode:          finalProduct.barcode,
              productName:      finalProduct.name,
              contributorEmail: userPrefs.email || null,
              rawOcr:          ocrData.rawOCRText,
              filteredData:    ocrData,
              ingredients:     finalProduct.ingredients || [],
              frontUploaded:   frontUploaded,
              backOcrd:        true,
            });
          } else if (r?.error) {
            logError('Scanner OCR Supabase Save', r.error, { barcode: finalProduct.barcode });
          }
        } catch (bgErr) {
          logError('Scanner OCR Background Chain', bgErr, { barcode: finalProduct.barcode });
        }
      })();

      showToast(`✨ OCR Success: ${finalProduct.name}`, 'success');
      logEvent('Product_OCR_Scanned', { barcode: finalProduct.barcode });
      navigation.navigate('ProductDetail', { productId: finalProduct.id });

    } catch (error) {
      logError('Scanner Main OCR Flow', error, { originalName: pendingProduct?.name });
      if (isMountedRef.current) {
        showToast(`❌ OCR failed: ${error.message?.substring(0, 80) || 'Unknown error'}`, 'error');
        // Failsafe (Partial Failure): add without OCR data so user can still view the product
        productDispatch({ type: 'ADD_PRODUCT', payload: pendingProduct });
        setOcrVisible(false);
        setPendingProduct(null);
      }
    }
  };

  // Flatten products for FlatList
  const allProducts = productState.sessionScans;

  const scanLineTranslate = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 100],
  });

  const toastBgColor = toast?.type === 'success' ? '#047857'
    : toast?.type === 'error' ? '#DC2626'
    : toast?.type === 'warning' ? '#D97706'
    : '#1A1A1A';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      {/* ── Toast Banner (replaces Alert) ── */}
      {toast && (
        <Animated.View
          style={[
            styles.toast,
            { backgroundColor: toastBgColor, transform: [{ translateY: toastAnim }] },
          ]}
        >
          <Text style={styles.toastText}>{toast.message}</Text>
        </Animated.View>
      )}

      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Scan a Product</Text>
        </View>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>{allProducts.length}</Text>
          <Text style={styles.headerBadgeSub}>scans</Text>
        </View>
      </View>

      {/* ── Camera / Scanner Area ── */}
      <View style={styles.scannerArea}>
        {cameraOpen ? (
          <View style={styles.cameraContainer}>
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'],
              }}
              onBarcodeScanned={handleBarcodeScanned}
            />

            {/* Scan overlay */}
            <View style={styles.cameraOverlay}>
              {/* Dim top and bottom */}
              <View style={styles.dimZone} />
              
              {/* Scan frame */}
              <View style={styles.scanFrameRow}>
                <View style={styles.dimZone} />
                <View style={styles.scanFrame}>
                  <View style={[styles.scanCorner, styles.scanTL]} />
                  <View style={[styles.scanCorner, styles.scanTR]} />
                  <View style={[styles.scanCorner, styles.scanBL]} />
                  <View style={[styles.scanCorner, styles.scanBR]} />
                  {/* Animated scan line */}
                  <Animated.View
                    style={[
                      styles.scanLine,
                      { transform: [{ translateY: scanLineTranslate }] },
                    ]}
                  />
                </View>
                <View style={styles.dimZone} />
              </View>

              <View style={styles.dimZone} />
            </View>

            {/* Status bar */}
            <View style={styles.cameraStatusBar}>
              {scanning ? (
                <TouchableOpacity style={styles.statusPill} onPress={handleCancelScan} activeOpacity={0.7}>
                  <Text style={styles.statusText}>⏳ Looking up… (Tap to cancel)</Text>
                  <Ionicons name="close-circle" size={16} color="#FFF" style={{ marginLeft: 6 }} />
                </TouchableOpacity>
              ) : cooldownRef.current ? (
                <View style={[styles.statusPill, { backgroundColor: 'rgba(34,197,94,0.8)' }]}>
                  <Text style={styles.statusText}>✅ Scanned! Point at next product</Text>
                </View>
              ) : (
                <View style={styles.statusPill}>
                  <Text style={styles.statusText}>📷 Point at a barcode</Text>
                </View>
              )}
            </View>

            {/* Close button */}
            <TouchableOpacity
              style={styles.closeCameraBtn}
              onPress={() => setCameraOpen(false)}
            >
              <Ionicons name="close" size={22} color="#FFF" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.cameraLaunchArea}
            onPress={handleOpenCamera}
            activeOpacity={0.85}
          >
            <View style={styles.cameraLaunchBox}>
              <View style={styles.cameraIconCircle}>
                <Ionicons name="camera" size={32} color="#FFF" />
              </View>
              <Text style={styles.cameraLaunchTitle}>Tap to Scan</Text>
              <Text style={styles.cameraLaunchSubtitle}>Continuous multi-scan mode</Text>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </View>
          </TouchableOpacity>
        )}

        {/* Manual input */}
        <View style={styles.inputRow}>
          <View style={styles.inputContainer}>
            <Ionicons name="barcode" size={20} color={colors.textMuted} />
            <TextInput
              style={styles.input}
              placeholder="Or type barcode number..."
              placeholderTextColor={colors.textMuted}
              value={barcodeInput}
              onChangeText={setBarcodeInput}
              keyboardType="number-pad"
              returnKeyType="search"
              onSubmitEditing={handleManualScan}
            />
          </View>
          <TouchableOpacity
            style={[styles.searchBtn, scanning && { opacity: 0.8 }]}
            onPress={scanning ? handleCancelScan : handleManualScan}
            activeOpacity={0.8}
          >
            <View style={[styles.searchBtnInner, scanning && { backgroundColor: '#EF4444' }]}>
              <Ionicons name={scanning ? 'close' : 'search'} size={20} color="#FFF" />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Product List ── */}
      <FlatList
        data={allProducts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <AICardPreview product={item} onPress={handleProductPress} />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="scan-outline"
            title="No products scanned yet"
            message="Tap the camera above or type a barcode to get started."
          />
        }
        ListFooterComponent={<View style={{ height: 100 }} />}
        showsVerticalScrollIndicator={false}
        style={styles.list}
        contentContainerStyle={allProducts.length === 0 ? styles.emptyList : undefined}
      />

      <OCRScannerOverlay
        visible={ocrVisible}
        onCancel={() => {
          setOcrVisible(false);
          // Fail gracefully, act like source = manual
          productDispatch({ type: 'ADD_PRODUCT', payload: pendingProduct });
          setPendingProduct(null);
        }}
        onSubmit={handleOCRSubmit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF9F6' },

  // Toast
  toast: {
    position: 'absolute',
    top: 50,
    left: spacing.xl,
    right: spacing.xl,
    zIndex: 100,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 4,
  },
  toastText: {
    fontSize: 14, fontWeight: '700', color: '#FFF', textAlign: 'center',
  },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
  },
  greeting: { fontSize: 13, fontWeight: '600', color: '#999', marginBottom: 2, letterSpacing: 0.3 },
  title: { fontSize: 32, fontWeight: '800', color: '#1A1A1A', letterSpacing: -1 },
  headerBadge: {
    backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 20, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  headerBadgeText: { fontSize: 20, fontWeight: '800', color: '#1A1A1A' },
  headerBadgeSub: { fontSize: 10, fontWeight: '700', color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Scanner area
  scannerArea: { marginHorizontal: spacing.xl, marginBottom: spacing.sm },

  // Camera closed — Vintage dark card
  cameraLaunchArea: {
    borderRadius: 24, overflow: 'hidden',
    marginBottom: spacing.md,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 5,
  },
  cameraLaunchBox: {
    height: 170, justifyContent: 'center', alignItems: 'center', gap: 10,
    backgroundColor: '#1A1A1A',
  },
  cameraIconCircle: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  cameraLaunchTitle: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
  cameraLaunchSubtitle: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.5)' },
  corner: {
    position: 'absolute', width: 24, height: 24,
    borderColor: 'rgba(255,255,255,0.2)', borderWidth: 2,
  },
  cornerTL: { top: 14, left: 14, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 8 },
  cornerTR: { top: 14, right: 14, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 8 },
  cornerBL: { bottom: 14, left: 14, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 8 },
  cornerBR: { bottom: 14, right: 14, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 8 },

  // Camera open
  cameraContainer: {
    height: 240, borderRadius: 24, overflow: 'hidden',
    marginBottom: spacing.md, backgroundColor: '#000',
  },
  camera: { flex: 1 },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'column',
  },
  dimZone: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  scanFrameRow: { flexDirection: 'row', height: 120 },
  scanFrame: {
    width: SCREEN_WIDTH * 0.65,
    height: 120,
    position: 'relative',
  },
  scanCorner: {
    position: 'absolute', width: 28, height: 28,
    borderColor: '#EF4444', borderWidth: 3,
  },
  scanTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 8 },
  scanTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 8 },
  scanBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 8 },
  scanBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 8 },
  scanLine: {
    position: 'absolute',
    left: 4,
    right: 4,
    height: 2,
    backgroundColor: '#EF4444',
    borderRadius: 1,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },

  // Camera status bar
  cameraStatusBar: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  statusPill: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statusText: { fontSize: 12, fontWeight: '700', color: '#FFF' },

  closeCameraBtn: {
    position: 'absolute', top: 10, right: 10,
    width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Input
  inputRow: { flexDirection: 'row', gap: 10 },
  inputContainer: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderRadius: 20,
    paddingHorizontal: 16, gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  input: {
    flex: 1, paddingVertical: Platform.OS === 'ios' ? 16 : 12,
    fontSize: 15, fontWeight: '500', color: '#1A1A1A',
  },
  searchBtn: { borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 3 },
  searchBtnDisabled: { opacity: 0.6 },
  searchBtnInner: { width: 52, height: 52, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1A1A1A' },

  // List
  list: { flex: 1 },
  emptyList: { flexGrow: 1 },
});
