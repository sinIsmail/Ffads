import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import QRCode from 'qrcode';
import { colors } from '../theme/colors';
import { borderRadius, shadows, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import NutritionTable from '../components/NutritionTable';
import {
  getPersonalProductById,
  lookupPersonalQr,
  recordPersonalProductScan,
} from '../services/supabase/personalProducts';
import { generateQrPdf } from '../services/qrPdf';
import { useUser } from '../store/UserContext';

function formatIngredients(ingredients = []) {
  return ingredients.filter(Boolean);
}

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
    <View style={{ alignSelf: 'center', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#E5E7EB' }}>
      {rows}
    </View>
  );
}

export default function PersonalQrDetailScreen({ navigation, route }) {
  const { personalProductId, code, fromScanner } = route.params || {};
  const { userPrefs } = useUser();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [qrModules, setQrModules] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const loadProduct = useCallback(async () => {
    setLoading(true);
    const nextProduct = personalProductId
      ? await getPersonalProductById(personalProductId)
      : await lookupPersonalQr(code);
    setProduct(nextProduct);
    setLoading(false);

    if (nextProduct && fromScanner) {
      recordPersonalProductScan({
        personalProductId: nextProduct.id,
        ffadzCode: nextProduct.ffadzCode,
        scannedByEmail: userPrefs.email || null,
        source: 'qr',
      }).catch(() => {});
    }
  }, [code, fromScanner, personalProductId, userPrefs.email]);

  useEffect(() => {
    loadProduct().catch(() => setLoading(false));
  }, [loadProduct]);

  useEffect(() => {
    if (!product?.ffadzCode) return;
    try {
      const qr = QRCode.create(product.ffadzCode, { errorCorrectionLevel: 'M' });
      setQrModules(qr.modules);
    } catch (_err) {
      setQrModules(null);
    }
  }, [product?.ffadzCode]);

  const galleryImages = useMemo(
    () => [product?.images?.front, product?.images?.ingredients, product?.images?.nutrition].filter(Boolean),
    [product?.images?.front, product?.images?.ingredients, product?.images?.nutrition]
  );

  const handleDownloadPdf = async () => {
    if (!product) return;

    setDownloading(true);
    try {
      const pdf = await generateQrPdf(product);
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
            `${product.ffadzCode}.pdf`,
            'application/pdf'
          );
          const pdfBase64 = await FileSystem.readAsStringAsync(pdf.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          await FileSystem.writeAsStringAsync(fileUri, pdfBase64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          Alert.alert('PDF Saved', `${product.ffadzCode}.pdf saved to your chosen folder.`);
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
              dialogTitle: `Share ${product.ffadzCode} PDF`,
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

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.centerText}>Loading QR product...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!product) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerState}>
          <Ionicons name="search-outline" size={32} color="#64748B" />
          <Text style={styles.centerTitle}>QR product not found</Text>
          <Text style={styles.centerText}>This FFADZ code does not exist in Supabase yet.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.85}>
            <Ionicons name="chevron-back" size={20} color="#111827" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{product.name}</Text>
            <Text style={styles.subtitle}>{product.brand || 'No brand listed'}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.codeBadge}>
            <Ionicons name="qr-code-outline" size={18} color="#1D4ED8" />
            <Text style={styles.codeText}>{product.ffadzCode}</Text>
          </View>
          {qrModules ? (
            <NativeQrCode modules={qrModules} />
          ) : (
            <View style={[styles.qrImage, styles.qrPlaceholder]}>
              <ActivityIndicator size="small" color="#1D4ED8" />
            </View>
          )}
          <TouchableOpacity style={styles.downloadBtn} onPress={handleDownloadPdf} disabled={downloading || !qrModules} activeOpacity={0.85}>
            {downloading ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Ionicons name="download-outline" size={18} color="#FFF" />
                <Text style={styles.downloadBtnText}>Download PDF</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {galleryImages.length ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Product Images</Text>
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
              {galleryImages.map((uri) => (
                <Image key={uri} source={{ uri }} style={styles.galleryImage} />
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Ingredients</Text>
          <View style={styles.ingredientsList}>
            {formatIngredients(product.ingredients).map((ingredient, index) => (
              <View key={`${ingredient}-${index}`} style={styles.ingredientPill}>
                <Text style={styles.ingredientText}>{ingredient}</Text>
              </View>
            ))}
          </View>
        </View>

        <NutritionTable nutrition={product.nutrition} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAF9F6' },
  content: { padding: spacing.xl, paddingBottom: 120, gap: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  title: {
    ...typography.h3,
    color: '#111827',
  },
  subtitle: {
    ...typography.caption,
    color: '#64748B',
    marginTop: 2,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: 14,
    ...shadows.sm,
  },
  codeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    backgroundColor: '#DBEAFE',
  },
  codeText: {
    ...typography.bodyBold,
    color: '#1D4ED8',
  },
  qrImage: {
    width: 240,
    height: 240,
    alignSelf: 'center',
    borderRadius: borderRadius.lg,
    backgroundColor: '#FFFFFF',
  },
  qrPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DBEAFE',
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
  sectionTitle: {
    ...typography.h4,
    color: '#111827',
  },
  galleryImage: {
    width: 280,
    height: 320,
    borderRadius: borderRadius.lg,
    marginRight: 12,
  },
  ingredientsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  ingredientPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    backgroundColor: '#EEF2FF',
  },
  ingredientText: {
    ...typography.captionBold,
    color: '#4338CA',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: 10,
  },
  centerTitle: {
    ...typography.h4,
    color: '#111827',
  },
  centerText: {
    ...typography.body,
    color: '#64748B',
    textAlign: 'center',
  },
});
