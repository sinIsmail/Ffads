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
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, type });

    Animated.spring(toastAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start();

    toastTimeoutRef.current = setTimeout(() => {
      Animated.timing(toastAnim, {
        toValue: -100,
        duration: 200,
        useNativeDriver: true,
      }).start(() => setToast(null));
    }, duration);
  }, [toastAnim]);

  // Validate EAN-13 checksum
  const isValidEAN13 = useCallback((code) => {
    if (code.length !== 13 || !/^\d+$/.test(code)) return false;
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(code[i]) * (i % 2 === 0 ? 1 : 3);
    }
    const check = (10 - (sum % 10)) % 10;
    return check === parseInt(code[12]);
  }, []);

  // Validate EAN-8 checksum
  const isValidEAN8 = useCallback((code) => {
    if (code.length !== 8 || !/^\d+$/.test(code)) return false;
    let sum = 0;
    for (let i = 0; i < 7; i++) {
      sum += parseInt(code[i]) * (i % 2 === 0 ? 3 : 1);
    }
    const check = (10 - (sum % 10)) % 10;
    return check === parseInt(code[7]);
  }, []);

  // Check if barcode format is valid
  const isValidBarcode = useCallback((code, type) => {
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
  }, [isValidEAN13, isValidEAN8]);

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
  }, [isValidBarcode]);

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

        // Persist scan history to Supabase
        saveProduct(product).then(r => {
          if (r?.success) recordScan(product.barcode);
        }).catch(e => console.warn('[Scanner] Supabase save error:', e.message));

        if (source === 'cache') {
          showToast(`📦 ${product.name} — already in history`, 'info');
        } else if (source === 'openfoodfacts') {
          showToast(`✅ ${product.name} by ${product.brand}`, 'success');
        } else {
          showToast(`📷 Product added`, 'warning');
        }
      }
    } catch (error) {
      showToast('❌ Lookup failed — check connection', 'error');
    } finally {
      setScanning(false);
    }
  }, [scanning, productDispatch, showToast]);

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
      console.log('[Scanner OCR] Keys available:', allKeys.length, '| model:', userPrefs.geminiModel);

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
      setOcrVisible(false);
      setPendingProduct(null);
      setBarcodeInput('');

      // Persist to Supabase in background (non-blocking)
      saveProduct(finalProduct).then(r => {
        if (r?.success) {
          console.log('[Scanner] Product saved to Supabase:', finalProduct.barcode);
          recordScan(finalProduct.barcode);
          logUserContribution({
             barcode: finalProduct.barcode,
             productName: finalProduct.name,
             rawOcr: ocrData.rawOCRText,
             filteredData: ocrData,
             frontUploaded: false,
             backOcrd: true
          });
        } else if (r?.error) {
          console.warn('[Scanner] Supabase save failed:', r.error);
        }
      }).catch(e => console.warn('[Scanner] Supabase save error:', e.message));

      showToast(`✨ OCR Success: ${finalProduct.name}`, 'success');
      navigation.navigate('ProductDetail', { productId: finalProduct.id });

    } catch (error) {
      console.warn('OCR Error', error);
      showToast(`❌ OCR failed: ${error.message?.substring(0, 80) || 'Unknown error'}`, 'error');
      // Failsafe: add without OCR data so user can view/edit the product
      productDispatch({ type: 'ADD_PRODUCT', payload: pendingProduct });
      setOcrVisible(false);
      setPendingProduct(null);
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
          <Text style={styles.greeting}>👋 Hello!</Text>
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
                <View style={styles.statusPill}>
                  <Text style={styles.statusText}>⏳ Looking up…</Text>
                </View>
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
            style={[styles.searchBtn, scanning && styles.searchBtnDisabled]}
            onPress={handleManualScan}
            disabled={scanning}
            activeOpacity={0.8}
          >
            <View style={[styles.searchBtnInner, scanning && { backgroundColor: '#CCC' }]}>
              <Ionicons name={scanning ? 'hourglass' : 'search'} size={20} color="#FFF" />
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
