import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  TextInput,
  Platform,
  Dimensions,
  Animated,
  Keyboard,
  Vibration,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { useProducts } from '../store/ProductContext';
import { useUser } from '../store/UserContext';
import AICardPreview from '../components/AICardPreview';
import EmptyState from '../components/EmptyState';
import OCRScannerOverlay from '../components/OCRScannerOverlay';
import { scanProduct } from '../services/product.service';
import { saveProduct } from '../services/supabase/products';
import { recordScan } from '../services/supabase/contributions';
import { lookupPersonalQr, recordPersonalProductScan } from '../services/supabase/personalProducts';
import { submitProductContribution } from '../services/contributionQueue';
import { isValidBarcode } from '../components/scanner/barcodeValidators';
import { logError, logEvent } from '../services/telemetry';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCAN_COOLDOWN_MS = 1800;
const CAMERA_FEEDBACK_MS = 1800;
const MODE_CARD_WIDTH = SCREEN_WIDTH - (spacing.xl * 2);

const AnimatedPressable = ({ children, onPress, style, activeOpacity = 0.95 }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const onPressIn = useCallback(() => Animated.spring(scale, { toValue: 0.97, friction: 6, tension: 100, useNativeDriver: true }).start(), [scale]);
  const onPressOut = useCallback(() => Animated.spring(scale, { toValue: 1, friction: 6, tension: 100, useNativeDriver: true }).start(), [scale]);
  return (
    <Animated.View style={[style, { transform: [{ scale }] }]}>
      <TouchableOpacity activeOpacity={activeOpacity} onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} style={{ flex: 1 }}>
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
};

const SCANNER_MODES = [
  {
    key: 'barcode',
    title: 'Barcode Scanner',
    subtitle: 'Use this for Open Food Facts and normal product barcodes.',
    icon: 'barcode-outline',
    barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'],
  },
  {
    key: 'qr',
    title: 'FFADZ QR Scanner',
    subtitle: 'Use this for your personal FFADZ QR products stored in Supabase.',
    icon: 'qr-code-outline',
    barcodeTypes: ['qr'],
  },
];

export default function ScannerScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { productState, productDispatch } = useProducts();
  const { userPrefs } = useUser();
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scannerMode, setScannerMode] = useState('barcode');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const [cameraFeedback, setCameraFeedback] = useState(null);
  const [toast, setToast] = useState(null);
  const [ocrVisible, setOcrVisible] = useState(false);
  const [pendingProduct, setPendingProduct] = useState(null);

  const modeScrollRef = useRef(null);
  const lastAcceptedRef = useRef('');
  const cooldownRef = useRef(false);
  const toastTimeoutRef = useRef(null);
  const feedbackTimeoutRef = useRef(null);
  const toastAnim = useRef(new Animated.Value(-100)).current;
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const tabSlideAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const loadingDotAnim = useRef(new Animated.Value(0)).current;
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!cameraOpen) return undefined;

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(scanLineAnim, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ])
    );

    loop.start();
    return () => loop.stop();
  }, [cameraOpen, scanLineAnim]);

  // Pulse ring animation for launch icon
  useEffect(() => {
    if (cameraOpen) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.18, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [cameraOpen, pulseAnim]);

  // Loading dots animation when scanning
  useEffect(() => {
    if (!scanning) {
      loadingDotAnim.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.timing(loadingDotAnim, { toValue: 1, duration: 1200, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [scanning, loadingDotAnim]);

  const resetScannerMemory = useCallback(() => {
    lastAcceptedRef.current = '';
    cooldownRef.current = false;
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    setCameraFeedback(null);
  }, []);

  const setTransientCameraFeedback = useCallback((message, tone = 'info', duration = CAMERA_FEEDBACK_MS) => {
    if (!isMountedRef.current) return;

    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    setCameraFeedback({ message, tone });

    if (duration > 0) {
      feedbackTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          setCameraFeedback(null);
        }
      }, duration);
    }
  }, []);

  const showToast = useCallback((message, type = 'success', duration = 3000) => {
    if (!isMountedRef.current) return;

    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, type });

    Animated.spring(toastAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start();

    toastTimeoutRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      Animated.timing(toastAnim, {
        toValue: -100,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        if (isMountedRef.current) {
          setToast(null);
        }
      });
    }, duration);
  }, [toastAnim]);

  const processBarcode = useCallback(async (barcode) => {
    if (!barcode || scanning) return;
    setScanning(true);
    setTransientCameraFeedback('Barcode detected. Looking it up...', 'working', 0);

    try {
      const { product, source } = await scanProduct(barcode);

      if (product.needsOCR) {
        if (!userPrefs.email) {
          productDispatch({ type: 'ADD_PRODUCT', payload: product });
          Alert.alert(
            'Sign In Required',
            'Sign in before uploading product photos or running OCR for products that are not already in the database.'
          );
          showToast('Sign in to upload OCR photos for new products', 'warning', 4500);
        } else {
          setPendingProduct(product);
          setOcrVisible(true);
        }
      } else {
        productDispatch({ type: 'ADD_PRODUCT', payload: product });
        setBarcodeInput('');

        (async () => {
          try {
            const result = await saveProduct(product);
            if (result?.success) {
              await recordScan(product.barcode, userPrefs.email || null);
            } else if (result?.error) {
              logError('Scanner saveProduct Error', result.error, { barcode: product.barcode });
            }
          } catch (error) {
            logError('Scanner Background Save', error, { barcode: product.barcode });
          }
        })();

        if (source === 'cache') {
          showToast(`${product.name} is already in your history`, 'info');
        } else if (source === 'openfoodfacts') {
          showToast(`${product.name} by ${product.brand}`, 'success');
        } else {
          showToast('Product added', 'warning');
        }

        setTransientCameraFeedback(`Opened ${product.name}`, 'success');
      }
    } catch (error) {
      logError('Scanner Barcode Lookup', error, { barcode });
      showToast('Lookup failed - check connection', 'error');
      setTransientCameraFeedback('Lookup failed. Try again or type the barcode.', 'error');
    } finally {
      setScanning(false);
    }
  }, [productDispatch, scanning, setTransientCameraFeedback, showToast, userPrefs.email]);

  const processQr = useCallback(async (rawValue) => {
    if (!rawValue || scanning) return;
    setScanning(true);
    setTransientCameraFeedback('QR detected. Opening your FFADZ product...', 'working', 0);

    try {
      const normalized = rawValue.trim().toUpperCase();
      if (!normalized.startsWith('FFADZ-')) {
        showToast('This QR code is not a FFADZ product code', 'warning');
        setTransientCameraFeedback('QR scanned, but it is not a FFADZ code.', 'warning');
        return;
      }

      const personalProduct = await lookupPersonalQr(normalized);
      if (!personalProduct) {
        showToast('QR product not found in Supabase', 'warning');
        setTransientCameraFeedback('FFADZ QR not found in Supabase yet.', 'warning');
        return;
      }

      // Transform personal product into standard product shape
      const standardProduct = {
        id: `personal_${personalProduct.id}`,
        barcode: personalProduct.ffadzCode,
        name: personalProduct.name,
        brand: personalProduct.brand || 'Personal Product',
        category: 'Personal QR',
        images: {
          front: personalProduct.images?.front || null,
          ingredients: personalProduct.images?.ingredients || null,
          nutrition: personalProduct.images?.nutrition || null,
        },
        ingredients: personalProduct.ingredients || [],
        nutrition: personalProduct.nutrition || {},
        scannedAt: new Date().toISOString(),
        analyzed: false,
        aiInsight: null,
        source: 'personal_qr',
        personalProductId: personalProduct.id,
        ffadzCode: personalProduct.ffadzCode,
      };

      productDispatch({ type: 'ADD_PRODUCT', payload: standardProduct });

      // Record the scan in Supabase (fire-and-forget)
      recordPersonalProductScan({
        personalProductId: personalProduct.id,
        ffadzCode: personalProduct.ffadzCode,
        scannedByEmail: userPrefs.email || null,
        source: 'qr',
      }).catch(() => {});

      showToast(`Opened ${personalProduct.name}`, 'success');
      setTransientCameraFeedback(`Opened ${personalProduct.name}`, 'success');
      navigation.navigate('ProductDetail', { productId: standardProduct.id });
    } catch (error) {
      logError('Scanner QR Lookup', error, { qr: rawValue });
      showToast('QR lookup failed - check connection', 'error');
      setTransientCameraFeedback('QR lookup failed. Check your connection and retry.', 'error');
    } finally {
      setScanning(false);
    }
  }, [navigation, productDispatch, scanning, setTransientCameraFeedback, showToast, userPrefs.email]);

  const handleBarcodeScanned = useCallback(({ data, type }) => {
    if (cooldownRef.current || !data) return;

    if (scannerMode === 'barcode') {
      const normalized = data.trim();
      if (normalized === lastAcceptedRef.current) return;
      if (!isValidBarcode(normalized, type)) {
        setTransientCameraFeedback('Hold steady on a clear retail barcode.', 'warning');
        return;
      }

      lastAcceptedRef.current = normalized;
      cooldownRef.current = true;
      Vibration.vibrate(80);
      processBarcode(normalized);
    } else {
      lastAcceptedRef.current = data;
      cooldownRef.current = true;
      Vibration.vibrate(80);
      processQr(data);
    }

    setTimeout(() => {
      cooldownRef.current = false;
      if (!scanning) {
        setTransientCameraFeedback('Ready for the next code.', 'success');
      }
    }, SCAN_COOLDOWN_MS);
  }, [processBarcode, processQr, scannerMode, scanning, setTransientCameraFeedback]);

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

    if (!isValidBarcode(barcode, null)) {
      showToast('Enter a valid retail barcode number', 'warning');
      setTransientCameraFeedback('That barcode format looks invalid. Check the digits and try again.', 'warning');
      return;
    }

    Keyboard.dismiss();
    processBarcode(barcode);
  }, [barcodeInput, processBarcode, setTransientCameraFeedback, showToast]);

  const handleOpenCamera = useCallback(async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        showToast('Camera permission needed for scanning', 'error');
        return;
      }
    }

    resetScannerMemory();
    setCameraOpen(true);
  }, [permission, requestPermission, resetScannerMemory, showToast]);

  const handleProductPress = useCallback((product) => {
    navigation.navigate('ProductDetail', { productId: product.id });
  }, [navigation]);

  const handleModeChange = useCallback((nextMode) => {
    const nextIndex = SCANNER_MODES.findIndex((m) => m.key === nextMode);
    Animated.spring(tabSlideAnim, {
      toValue: nextIndex,
      useNativeDriver: true,
      friction: 8,
      tension: 120,
    }).start();
    setScannerMode(nextMode);
    resetScannerMemory();
    setBarcodeInput('');
  }, [resetScannerMemory, tabSlideAnim]);

  const scrollToMode = useCallback((modeKey) => {
    const nextIndex = SCANNER_MODES.findIndex((item) => item.key === modeKey);
    if (nextIndex < 0) return;
    modeScrollRef.current?.scrollTo({ x: nextIndex * MODE_CARD_WIDTH, animated: true });
    handleModeChange(modeKey);
  }, [handleModeChange]);

  const handleModeScrollEnd = useCallback((event) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / MODE_CARD_WIDTH);
    const nextMode = SCANNER_MODES[nextIndex]?.key || 'barcode';
    handleModeChange(nextMode);
  }, [handleModeChange]);

  const handleOCRSubmit = async (photos, productName) => {
    try {
      const contributionResult = await submitProductContribution({
        product: pendingProduct,
        photos,
        productName,
        userPrefs,
        productDispatch,
      });

      const syncedProduct = contributionResult.product || {
        ...pendingProduct,
        name: productName || pendingProduct?.name,
      };

      if (isMountedRef.current) {
        setOcrVisible(false);
        setPendingProduct(null);
        setBarcodeInput('');
      }

      if (contributionResult.state === 'completed') {
        showToast(`Upload synced: ${syncedProduct.name}`, 'success');
      } else if (contributionResult.state === 'blocked') {
        showToast(`Saved locally. Action needed: ${contributionResult.message}`, 'warning', 4500);
      } else {
        showToast(`Saved locally. ${contributionResult.message}`, 'info', 4500);
      }

      logEvent('Product_OCR_Scanned', {
        barcode: syncedProduct.barcode,
        queueState: contributionResult.state,
      });

      navigation.navigate('ProductDetail', { productId: syncedProduct.id });
    } catch (error) {
      logError('Scanner Main OCR Flow', error, { originalName: pendingProduct?.name });
      if (isMountedRef.current) {
        const fallbackProduct = {
          ...pendingProduct,
          name: productName || pendingProduct?.name,
        };
        productDispatch({ type: 'ADD_PRODUCT', payload: fallbackProduct });
        showToast(`Upload setup failed: ${error.message?.substring(0, 80) || 'Unknown error'}`, 'error');
        setOcrVisible(false);
        setPendingProduct(null);
      }
    }
  };

  const allProducts = productState.sessionScans;
  const scanLineTranslate = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 100],
  });

  const toastBgColor = toast?.type === 'success'
    ? '#047857'
    : toast?.type === 'error'
      ? '#DC2626'
      : toast?.type === 'warning'
        ? '#D97706'
        : '#1A1A1A';

  const currentModeConfig = SCANNER_MODES.find((item) => item.key === scannerMode) || SCANNER_MODES[0];
  const cameraStatusTone = scanning
    ? 'working'
    : (cameraFeedback?.tone || (cooldownRef.current ? 'success' : 'idle'));
  const cameraStatusText = scanning
    ? 'Looking up code... Tap to cancel'
    : (cameraFeedback?.message
      || (cooldownRef.current
        ? 'Scanned. Point at the next code.'
        : (scannerMode === 'barcode' ? 'Point at a barcode' : 'Point at a FFADZ QR code')));
  const cameraStatusStyle = [
    styles.statusPill,
    cameraStatusTone === 'success' && styles.statusPillSuccess,
    cameraStatusTone === 'warning' && styles.statusPillWarning,
    cameraStatusTone === 'error' && styles.statusPillError,
    cameraStatusTone === 'working' && styles.statusPillWorking,
  ];

  const renderHeader = () => (
    <View style={styles.listHeaderContainer}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Vision</Text>
          <Text style={styles.headerSubtitle}>
            {scannerMode === 'barcode' ? 'Standard retail barcode detection' : 'FFADZ personal QR network'}
          </Text>
        </View>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>{allProducts.length}</Text>
          <Text style={styles.headerBadgeSub}>scans</Text>
        </View>
      </View>

      <View style={styles.modeSection}>
        <View style={styles.modeTabsRow}>
          {SCANNER_MODES.map((mode, index) => {
            const isActive = scannerMode === mode.key;
            const tabColors = index === 0
              ? ['#FF6B6B', '#FF8E8E']   // coral for Barcode
              : ['#4ECDC4', '#3BAF9F'];  // teal for QR
            const tabBgColors = index === 0
              ? ['#FFF5F5', '#FFE8E8']
              : ['#E8FFFE', '#D1FAF7'];
            return (
              <TouchableOpacity
                key={mode.key}
                style={[
                  styles.modeTabCard,
                  isActive && (index === 0 ? styles.modeTabCardActiveBarcode : styles.modeTabCardActiveQr),
                ]}
                onPress={() => handleModeChange(mode.key)}
                activeOpacity={0.85}
              >
                {isActive ? (
                  <LinearGradient
                    colors={tabColors}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.modeTabIconGradient}
                  >
                    <Ionicons name={mode.icon} size={22} color="#FFFFFF" />
                  </LinearGradient>
                ) : (
                  <LinearGradient
                    colors={tabBgColors}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.modeTabIconGradient}
                  >
                    <Ionicons
                      name={mode.icon}
                      size={22}
                      color={index === 0 ? '#FF6B6B' : '#4ECDC4'}
                    />
                  </LinearGradient>
                )}
                <View style={styles.modeTabTextBlock}>
                  <Text
                    style={[
                      styles.modeTabTitle,
                      isActive && (index === 0 ? styles.modeTabTitleBarcode : styles.modeTabTitleQr),
                    ]}
                    numberOfLines={1}
                  >
                    {index === 0 ? 'Barcode' : 'FFADZ QR'}
                  </Text>
                  <Text style={styles.modeTabSubtitle} numberOfLines={1}>
                    {index === 0 ? 'Retail products' : 'Personal codes'}
                  </Text>
                </View>
                {isActive && (
                  <View
                    style={[
                      styles.modeTabActiveDot,
                      index === 0
                        ? { backgroundColor: '#FF6B6B' }
                        : { backgroundColor: '#4ECDC4' },
                    ]}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.scannerArea}>
        {cameraOpen ? (
          <View style={styles.cameraContainer}>
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: currentModeConfig.barcodeTypes,
              }}
              onBarcodeScanned={handleBarcodeScanned}
            />

            <View style={styles.cameraOverlay}>
              <View style={styles.dimZone} />
              <View style={styles.scanFrameRow}>
                <View style={styles.dimZone} />
                <View style={styles.scanFrame}>
                  <View style={[styles.hudCornerActive, styles.hudTL]} />
                  <View style={[styles.hudCornerActive, styles.hudTR]} />
                  <View style={[styles.hudCornerActive, styles.hudBL]} />
                  <View style={[styles.hudCornerActive, styles.hudBR]} />
                  <Animated.View
                    style={[
                      styles.scanLine,
                      { transform: [{ translateY: scanLineTranslate }] },
                    ]}
                  >
                    <LinearGradient
                      colors={['rgba(56,189,248,0)', 'rgba(56,189,248,0.8)', 'rgba(56,189,248,0)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{ flex: 1 }}
                    />
                  </Animated.View>
                </View>
                <View style={styles.dimZone} />
              </View>
              <View style={styles.dimZone} />
            </View>

            {/* Scanning loading overlay */}
            {scanning && (
              <View style={styles.scanningOverlay}>
                <BlurView intensity={60} tint="dark" style={styles.scanningOverlayBlur}>
                  <LinearGradient
                    colors={[
                      scannerMode === 'barcode' ? 'rgba(255,107,107,0.15)' : 'rgba(78,205,196,0.15)',
                      'transparent',
                    ]}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={[
                    styles.scanningIconRing,
                    scannerMode === 'barcode'
                      ? { borderColor: '#FF8E8E' }
                      : { borderColor: '#4ECDC4' },
                  ]}>
                    <Ionicons
                      name={scannerMode === 'barcode' ? 'barcode-outline' : 'qr-code-outline'}
                      size={32}
                      color={scannerMode === 'barcode' ? '#FF8E8E' : '#4ECDC4'}
                    />
                  </View>
                  <Text style={styles.scanningTitle}>Looking it up…</Text>
                  <Text style={styles.scanningSubtitle}>Fetching product data</Text>
                  <TouchableOpacity
                    style={[
                      styles.scanningCancelBtn,
                      scannerMode === 'barcode'
                        ? { borderColor: 'rgba(255,107,107,0.5)' }
                        : { borderColor: 'rgba(78,205,196,0.5)' },
                    ]}
                    onPress={handleCancelScan}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close" size={14} color="#CBD5E1" />
                    <Text style={styles.scanningCancelText}>Cancel</Text>
                  </TouchableOpacity>
                </BlurView>
              </View>
            )}

            <View style={styles.cameraStatusBar}>
              {!scanning && (
                <BlurView intensity={40} tint="dark" style={cameraStatusStyle}>
                  <Text style={styles.statusText}>{cameraStatusText}</Text>
                </BlurView>
              )}
            </View>

            <TouchableOpacity style={styles.closeCameraBtn} onPress={() => setCameraOpen(false)}>
              <BlurView intensity={40} tint="dark" style={styles.closeCameraBlur}>
                <Ionicons name="close" size={20} color="#FFF" />
              </BlurView>
            </TouchableOpacity>
          </View>
        ) : (
          <AnimatedPressable style={styles.cameraLaunchArea} onPress={handleOpenCamera}>
            <LinearGradient
              colors={['#0F172A', '#1A2540', '#1E293B']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cameraLaunchBox}
            >
              {/* Centered icon with pulse ring */}
              <View style={styles.launchIconWrapper}>
                <Animated.View
                  style={[
                    styles.launchIconPulseRing,
                    {
                      transform: [{ scale: pulseAnim }],
                      opacity: pulseAnim.interpolate({
                        inputRange: [1, 1.18],
                        outputRange: [0.35, 0],
                      }),
                    },
                    scannerMode === 'qr' && styles.launchIconPulseRingQr,
                  ]}
                />
                <LinearGradient
                  colors={
                    scannerMode === 'barcode'
                      ? ['#FF6B6B', '#FF8E8E']
                      : ['#4ECDC4', '#3BAF9F']
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.launchIconGradientCircle}
                >
                  <Ionicons name={currentModeConfig.icon} size={34} color="#FFFFFF" />
                </LinearGradient>
              </View>

              {/* Bottom text */}
              <View style={styles.launchTextBlock}>
                <Text style={styles.cameraLaunchTitle}>
                  {scannerMode === 'barcode' ? 'Initialize Vision' : 'Scan FFADZ QR'}
                </Text>
                <Text style={styles.cameraLaunchSubtitle}>
                  {scannerMode === 'barcode' ? 'Tap to activate AI camera' : 'Tap to scan personal code'}
                </Text>
              </View>

              {/* HUD corners */}
              <View style={[styles.hudCorner, styles.hudTL]} />
              <View style={[styles.hudCorner, styles.hudTR]} />
              <View style={[styles.hudCorner, styles.hudBL]} />
              <View style={[styles.hudCorner, styles.hudBR]} />
            </LinearGradient>
          </AnimatedPressable>
        )}

        {scannerMode === 'barcode' ? (
          <View style={styles.inputRow}>
            <View style={styles.inputContainer}>
              <Ionicons name="barcode" size={20} color="#94A3B8" />
              <TextInput
                style={styles.input}
                placeholder="Or type barcode number..."
                placeholderTextColor="#94A3B8"
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
              <LinearGradient
                colors={scanning ? ['#EF4444', '#DC2626'] : ['#0F172A', '#1E293B']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.searchBtnInner}
              >
                <Ionicons name={scanning ? 'close' : 'search'} size={20} color="#38BDF8" />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.qrHintCard}>
            <Ionicons name="information-circle-outline" size={18} color="#38BDF8" />
            <Text style={styles.qrHintText}>
              Scan only QR codes that start with <Text style={styles.qrHintTextStrong}>FFADZ-</Text>. Personal QR products are loaded securely from Supabase.
            </Text>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

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

      <FlatList
        data={allProducts}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeader}
        renderItem={({ item }) => (
          <AICardPreview product={item} onPress={handleProductPress} />
        )}
        ListEmptyComponent={(
          <EmptyState
            icon="scan-outline"
            title="No products scanned yet"
            message="Initialize vision to start extracting product data."
          />
        )}
        ListFooterComponent={<View style={{ height: 100 }} />}
        showsVerticalScrollIndicator={false}
        style={styles.list}
        contentContainerStyle={allProducts.length === 0 ? styles.emptyList : undefined}
      />

      <OCRScannerOverlay
        visible={ocrVisible}
        initialProductName={pendingProduct?.name && pendingProduct.name !== 'Unknown Product' ? pendingProduct.name : ''}
        onCancel={() => {
          setOcrVisible(false);
          productDispatch({ type: 'ADD_PRODUCT', payload: pendingProduct });
          setPendingProduct(null);
        }}
        onSubmit={handleOCRSubmit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  toast: {
    position: 'absolute',
    top: 50,
    left: spacing.xl,
    right: spacing.xl,
    zIndex: 100,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  toastText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  title: { fontSize: 32, fontWeight: '800', color: '#1A1A1A', letterSpacing: -1 },
  headerSubtitle: { fontSize: 13, color: '#64748B', marginTop: 2 },
  headerBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  headerBadgeText: { fontSize: 20, fontWeight: '800', color: '#1A1A1A' },
  headerBadgeSub: { fontSize: 10, fontWeight: '700', color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 },
  modeSection: {
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  modeTabsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modeTabCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#F1F5F9',
    shadowColor: '#2D2B55',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  modeTabCardActiveBarcode: {
    borderColor: '#FF8E8E',
    backgroundColor: '#FFF8F8',
    shadowColor: '#FF6B6B',
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 5,
  },
  modeTabCardActiveQr: {
    borderColor: '#4ECDC4',
    backgroundColor: '#F0FEFD',
    shadowColor: '#4ECDC4',
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 5,
  },
  modeTabIconGradient: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTabTextBlock: {
    flex: 1,
  },
  modeTabTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: -0.2,
  },
  modeTabTitleBarcode: {
    color: '#E55555',
  },
  modeTabTitleQr: {
    color: '#3BAF9F',
  },
  modeTabSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: '#A09DC0',
    marginTop: 2,
  },
  modeTabActiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  scannerArea: { marginHorizontal: spacing.xl, marginBottom: spacing.sm },
  cameraLaunchArea: {
    borderRadius: 24,
    marginBottom: spacing.md,
    backgroundColor: '#FFFFFF',
  },
  cameraLaunchBox: {
    height: 190,
    position: 'relative',
    backgroundColor: 'transparent',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 4,
  },
  cameraIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  /* Launch box centered icon */
  launchIconWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 44,          // leave room for text at bottom
    alignItems: 'center',
    justifyContent: 'center',
  },
  launchIconPulseRing: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FF6B6B',
  },
  launchIconPulseRingQr: {
    backgroundColor: '#4ECDC4',
  },
  launchIconGradientCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF6B6B',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  launchTextBlock: {
    position: 'absolute',
    bottom: 18,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 2,
  },
  cameraLaunchTitle: { fontSize: 17, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3 },
  cameraLaunchSubtitle: { fontSize: 12, fontWeight: '500', color: 'rgba(255,255,255,0.5)' },
  /* Scanning overlay */
  scanningOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  scanningOverlayBlur: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  scanningIconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  scanningTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  scanningSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.55)',
  },
  scanningCancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
  },
  scanningCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#CBD5E1',
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#CBD5E1',
    borderWidth: 2,
  },
  cornerTL: { top: 14, left: 14, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 8 },
  cornerTR: { top: 14, right: 14, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 8 },
  cornerBL: { bottom: 14, left: 14, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 8 },
  cornerBR: { bottom: 14, right: 14, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 8 },
  /* HUD corners for launch box (white, subtle) */
  hudCorner: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderColor: 'rgba(255,255,255,0.3)',
    borderWidth: 2,
  },
  hudTL: { top: 12, left: 12, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 6 },
  hudTR: { top: 12, right: 12, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 6 },
  hudBL: { bottom: 12, left: 12, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 6 },
  hudBR: { bottom: 12, right: 12, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 6 },
  /* HUD corners for active camera (cyan/accent) */
  hudCornerActive: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderColor: '#38BDF8',
    borderWidth: 2.5,
  },
  cameraContainer: {
    height: 240,
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: spacing.md,
    backgroundColor: '#000',
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
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: '#EF4444',
    borderWidth: 3,
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
  cameraStatusBar: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statusPillSuccess: {
    backgroundColor: 'rgba(34,197,94,0.85)',
  },
  statusPillWarning: {
    backgroundColor: 'rgba(217,119,6,0.88)',
  },
  statusPillError: {
    backgroundColor: 'rgba(220,38,38,0.88)',
  },
  statusPillWorking: {
    backgroundColor: 'rgba(15,23,42,0.85)',
  },
  statusText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  closeCameraBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeCameraBlur: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputRow: { flexDirection: 'row', gap: 10 },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 1,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  input: {
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? 16 : 12,
    fontSize: 15,
    fontWeight: '500',
    color: '#1A1A1A',
  },
  searchBtn: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  searchBtnInner: {
    width: 52,
    height: 52,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A1A1A',
  },
  qrHintCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#DBEAFE',
    borderRadius: 18,
    padding: 14,
  },
  qrHintText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: '#1E3A8A',
  },
  qrHintTextStrong: {
    fontWeight: '800',
    color: '#1D4ED8',
  },
  list: { flex: 1 },
  emptyList: { flexGrow: 1 },
});
