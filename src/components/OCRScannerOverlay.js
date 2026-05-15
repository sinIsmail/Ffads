import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Modal,
  Animated,
  Alert,
  ScrollView,
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing, borderRadius, shadows } from '../theme/spacing';

async function compressPhoto(uri) {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1024 } }],
      {
        compress: 0.6,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      }
    );

    return { uri: result.uri, base64: result.base64 };
  } catch {
    return null;
  }
}

const PHOTO_SLOTS = [
  {
    key: 'front',
    label: 'Front',
    hint: 'Logo and product name',
    icon: 'image-outline',
    ocrByAI: false,
    badge: { label: 'OFF Upload', icon: 'cloud-upload-outline' },
  },
  {
    key: 'ingredients',
    label: 'Ingredients',
    hint: 'Ingredients list on back',
    icon: 'document-text-outline',
    ocrByAI: true,
    badge: { label: 'Local OCR', icon: 'document-text-outline' },
  },
  {
    key: 'nutrition',
    label: 'Nutrition',
    hint: 'Nutrition facts table',
    icon: 'bar-chart-outline',
    ocrByAI: true,
    badge: { label: 'Local OCR', icon: 'document-text-outline' },
  },
];

export default function OCRScannerOverlay({ visible, onCancel, onSubmit, initialProductName = '' }) {
  const [photos, setPhotos] = useState({ front: null, ingredients: null, nutrition: null });
  const [productName, setProductName] = useState('');
  const [processing, setProcessing] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const fadeAnim = useState(new Animated.Value(0))[0];
  const MAX_BASE64_KB = 600;

  useEffect(() => {
    if (!visible) return;

    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    setPhotos({ front: null, ingredients: null, nutrition: null });
    setProductName(/^unknown product$/i.test(initialProductName || '') ? '' : initialProductName);
    setProcessing(false);
    setLoadingStep('');
  }, [fadeAnim, initialProductName, visible]);

  const handleCapture = async (slotKey) => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera Required', 'Please allow camera access in your device settings.');
        return;
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
        base64: false,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const asset = result.assets[0];
      if (!asset.uri) {
        Alert.alert('Photo Error', 'Could not read photo URI. Please try again.');
        return;
      }

      const compressed = await compressPhoto(asset.uri);
      const photoData = compressed ?? { uri: asset.uri, base64: null };

      if (!photoData.base64) {
        Alert.alert('Compression Failed', 'Could not prepare the photo. Please try again.');
        return;
      }

      const sizeKB = Math.round(photoData.base64.length / 1024);
      if (sizeKB > MAX_BASE64_KB) {
        Alert.alert(
          'Photo Too Large',
          `Even after compression this photo is ${sizeKB}KB. Move closer to the label and retake it.`
        );
        return;
      }

      setPhotos((current) => ({ ...current, [slotKey]: photoData }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (error) {
      Alert.alert('Camera Error', error.message);
    }
  };

  const removePhoto = (slotKey) => {
    setPhotos((current) => ({ ...current, [slotKey]: null }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const doSubmit = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      setProcessing(true);
      setLoadingStep('Preparing product name sync, Open Food Facts upload, local OCR, and AI cleanup...');
      await onSubmit(photos, productName.trim());
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to process photos.');
    } finally {
      setProcessing(false);
      setLoadingStep('');
    }
  };

  const handleProcess = () => {
    const capturedCount = Object.values(photos).filter(Boolean).length;
    if (capturedCount === 0) {
      Alert.alert('No Photos', 'Take at least one photo before continuing.');
      return;
    }

    if (!productName.trim()) {
      Alert.alert('Product Name Required', 'Enter the product name before sending the contribution to Open Food Facts.');
      return;
    }

    const hasOCRPhoto = photos.ingredients !== null || photos.nutrition !== null;
    if (!hasOCRPhoto && photos.front !== null) {
      Alert.alert(
        'No Back Photo',
        'Without an ingredients or nutrition photo, only the front image can be uploaded and no OCR text will be extracted.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue Anyway', onPress: () => doSubmit() },
        ]
      );
      return;
    }

    doSubmit();
  };

  const capturedCount = Object.values(photos).filter(Boolean).length;
  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="fade">
      <BlurView intensity={80} tint="dark" style={styles.fill}>
        <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Contribute Product</Text>
              <Text style={styles.subtitle}>3 photos | Ingredients and Nutrition use on-device OCR, then the selected AI cleanup chain</Text>
            </View>
            <TouchableOpacity onPress={onCancel} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          {!processing ? (
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              <View style={styles.nameSection}>
                <View style={styles.nameLabelRow}>
                  <Ionicons name="pricetag-outline" size={16} color={colors.primary} />
                  <Text style={styles.nameLabel}>Product Name</Text>
                  <Text style={styles.nameHint}>(required)</Text>
                </View>
                <TextInput
                  style={styles.nameInput}
                  placeholder="e.g. Maggi 2-Minute Noodles"
                  placeholderTextColor={colors.textMuted}
                  value={productName}
                  onChangeText={setProductName}
                  returnKeyType="done"
                  autoCapitalize="words"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.infoBanner}>
                <Ionicons name="information-circle-outline" size={15} color={colors.primaryDark} />
                <Text style={styles.infoText}>
                  All 3 photos are uploaded to Open Food Facts. Ingredients and Nutrition photos are read with on-device OCR first, then cleaned into JSON through your selected provider fallback chain.
                </Text>
              </View>

              <View style={styles.photoGrid}>
                {PHOTO_SLOTS.map((slot) => {
                  const photo = photos[slot.key];
                  return (
                    <View key={slot.key} style={styles.photoSlot}>
                      <Text style={styles.slotLabel}>{slot.label}</Text>
                      <Text style={styles.slotHint} numberOfLines={1}>{slot.hint}</Text>

                      {photo ? (
                        <View style={styles.imageWrapper}>
                          <Image source={{ uri: photo.uri }} style={styles.image} resizeMode="cover" />
                          <TouchableOpacity style={styles.removeBtn} onPress={() => removePhoto(slot.key)}>
                            <Ionicons name="close" size={12} color="#FFF" />
                          </TouchableOpacity>
                          <View style={styles.doneCheck}>
                            <Ionicons name="checkmark" size={12} color="#FFF" />
                          </View>
                        </View>
                      ) : (
                        <TouchableOpacity style={styles.emptySlot} onPress={() => handleCapture(slot.key)} activeOpacity={0.75}>
                          <Ionicons name={slot.icon} size={28} color={colors.textSecondary} />
                          <Text style={styles.tapText}>Tap to capture</Text>
                        </TouchableOpacity>
                      )}

                      {photo && (
                        <TouchableOpacity style={styles.retakeBtn} onPress={() => handleCapture(slot.key)}>
                          <Ionicons name="camera-outline" size={12} color={colors.primary} />
                          <Text style={styles.retakeText}>Retake</Text>
                        </TouchableOpacity>
                      )}

                      <View style={[styles.roleBadge, slot.ocrByAI && styles.roleBadgeAI]}>
                        <Ionicons
                          name={slot.badge.icon}
                          size={10}
                          color={slot.ocrByAI ? colors.primaryDark : colors.textMuted}
                        />
                        <Text style={[styles.roleText, slot.ocrByAI && { color: colors.primaryDark }]}>
                          {slot.badge.label}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>

              <View style={styles.progressRow}>
                {PHOTO_SLOTS.map((slot) => (
                  <View key={slot.key} style={[styles.dot, photos[slot.key] && styles.dotFilled]} />
                ))}
                <Text style={styles.progressText}>{capturedCount} / 3 photos</Text>
              </View>

              <TouchableOpacity
                style={[styles.submitBtn, capturedCount === 0 && { opacity: 0.35 }]}
                onPress={handleProcess}
                disabled={capturedCount === 0}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={capturedCount > 0 ? colors.gradientPrimary : ['#888', '#666']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.submitGradient}
                >
                  <Ionicons name="sparkles" size={20} color="#FFF" />
                  <Text style={styles.submitText}>
                    {capturedCount > 0
                      ? `Extract and Contribute (${capturedCount} photo${capturedCount > 1 ? 's' : ''})`
                      : 'Capture at least 1 photo'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 20 }} />
              <Text style={styles.loadingTitle}>Processing...</Text>
              <Text style={styles.loadingSubtitle}>
                {loadingStep || 'Running local OCR and sending only text to the provider cleanup chain...'}
              </Text>
            </View>
          )}
        </Animated.View>
      </BlurView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', padding: spacing.md },
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius['2xl'],
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    overflow: 'hidden',
    maxHeight: '95%',
    ...shadows.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { ...typography.h3, color: colors.text },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  nameSection: { marginBottom: spacing.md },
  nameLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  nameLabel: { ...typography.bodyBold, color: colors.text, fontSize: 14 },
  nameHint: { ...typography.caption, color: colors.textMuted, fontSize: 11 },
  nameInput: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.primarySoft,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  infoText: { ...typography.caption, color: colors.primaryDark, flex: 1, lineHeight: 18 },
  photoGrid: { flexDirection: 'row', gap: 10, marginBottom: spacing.md },
  photoSlot: { flex: 1 },
  slotLabel: { ...typography.bodyBold, color: colors.text, fontSize: 13, marginBottom: 2 },
  slotHint: { ...typography.caption, color: colors.textMuted, marginBottom: 8, fontSize: 11 },
  imageWrapper: { width: '100%', aspectRatio: 3 / 4, borderRadius: borderRadius.lg, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  removeBtn: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(239,68,68,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneCheck: {
    position: 'absolute',
    bottom: 5,
    left: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(34,197,94,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySlot: {
    width: '100%',
    aspectRatio: 3 / 4,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  tapText: { ...typography.caption, color: colors.textSecondary, fontSize: 11 },
  retakeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    justifyContent: 'center',
    marginTop: 6,
  },
  retakeText: { ...typography.caption, color: colors.primary, fontSize: 11 },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.full,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  roleBadgeAI: { backgroundColor: colors.primarySoft },
  roleText: { fontSize: 10, fontWeight: '700', color: colors.textMuted },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.lg },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotFilled: { backgroundColor: colors.primary },
  progressText: { ...typography.caption, color: colors.textMuted, marginLeft: 4 },
  submitBtn: { borderRadius: borderRadius.xl, overflow: 'hidden' },
  submitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 10,
  },
  submitText: { ...typography.bodyBold, color: '#FFF' },
  loadingState: { padding: 48, alignItems: 'center', justifyContent: 'center' },
  loadingTitle: { ...typography.h3, color: colors.text, marginBottom: 8 },
  loadingSubtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
});
