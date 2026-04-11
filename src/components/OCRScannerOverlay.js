// Ffads — OCR Scanner Overlay
// 3 photo slots + product name input
//   front       → uploaded to Open Food Facts as product front image
//   ingredients → uploaded to OFF + sent to Gemini for OCR
//   nutrition   → uploaded to OFF + sent to Gemini for OCR
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
  ActivityIndicator, Modal, Animated, Alert, ScrollView, TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing, borderRadius, shadows } from '../theme/spacing';

const PHOTO_SLOTS = [
  {
    key: 'front',
    label: 'Front',
    hint: 'Logo & product name',
    icon: 'image-outline',
    ocrByGemini: false,
    badge: { label: 'OFF Upload', icon: 'cloud-upload-outline' },
  },
  {
    key: 'ingredients',
    label: 'Ingredients',
    hint: 'Ingredients list on back',
    icon: 'document-text-outline',
    ocrByGemini: true,
    badge: { label: 'Gemini OCR', icon: 'sparkles' },
  },
  {
    key: 'nutrition',
    label: 'Nutrition',
    hint: 'Nutrition facts table',
    icon: 'bar-chart-outline',
    ocrByGemini: true,
    badge: { label: 'Gemini OCR', icon: 'sparkles' },
  },
];

export default function OCRScannerOverlay({ visible, onCancel, onSubmit }) {
  const [photos, setPhotos] = useState({ front: null, ingredients: null, nutrition: null });
  const [productName, setProductName] = useState('');
  const [processing, setProcessing] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const fadeAnim = useState(new Animated.Value(0))[0];

  useEffect(() => {
    if (visible) {
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      setPhotos({ front: null, ingredients: null, nutrition: null });
      setProductName('');
      setProcessing(false);
      setLoadingStep('');
    }
  }, [visible]);

  // Max base64 size we'll send to Gemini Vision (~900KB base64 ≈ ~675KB image)
  const MAX_BASE64_KB = 900;

  const handleCapture = async (slotKey) => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Camera Required', 'Please allow camera access in your device settings.');
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,   // Restored crop & rotate UI per user request
        quality: 0.3,          // ← Keep quality low to prevent memory crashes
        base64: true,
      });
      if (!result.canceled && result.assets?.length > 0) {
        const asset = result.assets[0];
        if (!asset.base64) {
          Alert.alert('Photo Error', 'Could not read photo data. Please try again.');
          return;
        }

        const sizeKB = Math.round(asset.base64.length / 1024);
        console.log(`📸 [OCR:Overlay] Captured "${slotKey}" photo (~${sizeKB}KB)`);

        if (sizeKB > MAX_BASE64_KB) {
          // Image is still too large even at low quality (very high-res sensor)
          Alert.alert(
            'Photo Too Large',
            `This photo is ${sizeKB}KB — Gemini works best under ${MAX_BASE64_KB}KB.\n\nMove closer to the label and retake, or use the Gallery to pick a cropped image.`,
            [
              { text: 'Retake', style: 'cancel' },
              {
                text: 'Use Anyway',
                onPress: () => {
                  setPhotos(prev => ({ ...prev, [slotKey]: { uri: asset.uri, base64: asset.base64 } }));
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                },
              },
            ]
          );
          return;
        }

        setPhotos(prev => ({ ...prev, [slotKey]: { uri: asset.uri, base64: asset.base64 } }));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err) {
      console.error(`📸 [OCR:Overlay] ❌ Camera error for "${slotKey}": ${err.message}`);
      Alert.alert('Camera Error', err.message);
    }
  };

  const removePhoto = (slotKey) => {
    setPhotos(prev => ({ ...prev, [slotKey]: null }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleProcess = () => {
    const capturedCount = Object.values(photos).filter(Boolean).length;
    if (capturedCount === 0) {
      Alert.alert('No Photos', 'Take at least one photo before continuing.');
      return;
    }
    const hasOCRPhoto = photos.ingredients !== null || photos.nutrition !== null;
    if (!hasOCRPhoto && photos.front !== null) {
      Alert.alert(
        'No Back Photo',
        'Without an Ingredients or Nutrition photo, we can only upload the front image — no data will be extracted.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue Anyway', onPress: () => doSubmit() },
        ]
      );
      return;
    }
    doSubmit();
  };

  const doSubmit = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      setProcessing(true);
      setLoadingStep('Preparing...');
      // Pass both photos and the product name the user typed
      await onSubmit(photos, productName.trim());
    } catch (err) {
      console.error(`📸 [OCR:Overlay] ❌ Submit error: ${err.message}`);
      Alert.alert('Error', err.message || 'Failed to process photos.');
    } finally {
      setProcessing(false);
      setLoadingStep('');
    }
  };

  const capturedCount = Object.values(photos).filter(Boolean).length;

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="fade">
      <BlurView intensity={80} tint="dark" style={styles.fill}>
        <Animated.View style={[styles.container, { opacity: fadeAnim }]}>

          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Contribute Product</Text>
              <Text style={styles.subtitle}>3 photos · Ingredients + Nutrition scanned by Gemini</Text>
            </View>
            <TouchableOpacity onPress={onCancel} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          {!processing ? (
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

              {/* ── Product Name ── */}
              <View style={styles.nameSection}>
                <View style={styles.nameLabelRow}>
                  <Ionicons name="pricetag-outline" size={16} color={colors.primary} />
                  <Text style={styles.nameLabel}>Product Name</Text>
                  <Text style={styles.nameHint}>(optional — helps Open Food Facts)</Text>
                </View>
                <TextInput
                  style={styles.nameInput}
                  placeholder="e.g. Maggi 2-Minute Noodles..."
                  placeholderTextColor={colors.textMuted}
                  value={productName}
                  onChangeText={setProductName}
                  returnKeyType="done"
                  autoCapitalize="words"
                  autoCorrect={false}
                />
              </View>

              {/* ── Info banner ── */}
              <View style={styles.infoBanner}>
                <Ionicons name="information-circle-outline" size={15} color={colors.primaryDark} />
                <Text style={styles.infoText}>
                  All 3 photos are uploaded to Open Food Facts.{' '}
                  <Text style={{ fontWeight: '700' }}>Ingredients</Text> +{' '}
                  <Text style={{ fontWeight: '700' }}>Nutrition</Text> photos are also scanned by Gemini AI.
                </Text>
              </View>

              {/* ── Photo slots ── */}
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

                      <View style={[styles.roleBadge, slot.ocrByGemini && styles.roleBadgeAI]}>
                        <Ionicons
                          name={slot.badge.icon}
                          size={10}
                          color={slot.ocrByGemini ? colors.primaryDark : colors.textMuted}
                        />
                        <Text style={[styles.roleText, slot.ocrByGemini && { color: colors.primaryDark }]}>
                          {slot.badge.label}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>

              {/* ── Progress dots ── */}
              <View style={styles.progressRow}>
                {PHOTO_SLOTS.map(slot => (
                  <View key={slot.key} style={[styles.dot, photos[slot.key] && styles.dotFilled]} />
                ))}
                <Text style={styles.progressText}>{capturedCount} / 3 photos</Text>
              </View>

              {/* ── Submit ── */}
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
                      ? `Extract & Contribute (${capturedCount} photo${capturedCount > 1 ? 's' : ''})`
                      : 'Capture at least 1 photo'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

            </ScrollView>
          ) : (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 20 }} />
              <Text style={styles.loadingTitle}>Processing…</Text>
              <Text style={styles.loadingSubtitle}>
                {loadingStep || 'Gemini AI is scanning the back photos…'}
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
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
    overflow: 'hidden', maxHeight: '95%',
    ...shadows.xl,
  },
  header: {
    flexDirection: 'row', alignItems: 'flex-start',
    padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { ...typography.h3, color: colors.text },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  closeBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center', justifyContent: 'center', marginLeft: 8,
  },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },

  // Product name
  nameSection: { marginBottom: spacing.md },
  nameLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  nameLabel: { ...typography.bodyBold, color: colors.text, fontSize: 14 },
  nameHint: { ...typography.caption, color: colors.textMuted, fontSize: 11 },
  nameInput: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: 12,
    fontSize: 15,
  },

  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: colors.primarySoft,
    borderRadius: borderRadius.lg, padding: spacing.md,
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
    position: 'absolute', top: 5, right: 5,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(239,68,68,0.9)',
    alignItems: 'center', justifyContent: 'center',
  },
  doneCheck: {
    position: 'absolute', bottom: 5, left: 5,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(34,197,94,0.9)',
    alignItems: 'center', justifyContent: 'center',
  },
  emptySlot: {
    width: '100%', aspectRatio: 3 / 4,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  tapText: { ...typography.caption, color: colors.textSecondary, fontSize: 11 },
  retakeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    justifyContent: 'center', marginTop: 6,
  },
  retakeText: { ...typography.caption, color: colors.primary, fontSize: 11 },
  roleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.full,
    paddingHorizontal: 6, paddingVertical: 3,
    marginTop: 6, alignSelf: 'flex-start',
  },
  roleBadgeAI: { backgroundColor: colors.primarySoft },
  roleText: { fontSize: 10, fontWeight: '700', color: colors.textMuted },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.lg },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotFilled: { backgroundColor: colors.primary },
  progressText: { ...typography.caption, color: colors.textMuted, marginLeft: 4 },

  submitBtn: { borderRadius: borderRadius.xl, overflow: 'hidden' },
  submitGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 18, gap: 10,
  },
  submitText: { ...typography.bodyBold, color: '#FFF' },

  loadingState: { padding: 48, alignItems: 'center', justifyContent: 'center' },
  loadingTitle: { ...typography.h3, color: colors.text, marginBottom: 8 },
  loadingSubtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
});
