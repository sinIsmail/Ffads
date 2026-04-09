// Ffads — Ingredient Detail Bottom Sheet
import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StyleSheet as RNStyleSheet, ActivityIndicator } from 'react-native';
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing, borderRadius } from '../theme/spacing';
import { useUser, getGeminiKey } from '../store/UserContext';
import { analyzeIngredientDetail } from '../services/analysis.service';

const COLOR_LABELS = {
  green: { label: 'Low Concern', icon: 'checkmark-circle', description: 'Generally safe for regular consumption.' },
  yellow: { label: 'Moderate Concern', icon: 'warning', description: 'Use in moderation. May have mild concerns.' },
  red: { label: 'High Concern', icon: 'alert-circle', description: 'Risky ingredient. Limit or avoid.' },
};

const FLAG_LABELS = {
  'ultra-processed': { label: 'Ultra-Processed', icon: 'cog', color: '#EF4444' },
  'additive': { label: 'Additive', icon: 'flask', color: '#F59E0B' },
  'artificial': { label: 'Artificial', icon: 'color-palette', color: '#F97316' },
  'risky': { label: 'Risky', icon: 'alert', color: '#EF4444' },
  'animal-derived': { label: 'Animal-Derived', icon: 'paw', color: '#8B5CF6' },
  'high-sugar': { label: 'High Sugar', icon: 'cube', color: '#EF4444' },
  'high-fat': { label: 'High Fat', icon: 'water', color: '#F97316' },
  'high-sodium-risk': { label: 'Sodium Risk', icon: 'water-outline', color: '#EF4444' },
  'allergen-milk': { label: 'Milk Allergen', icon: 'pint', color: '#DC2626' },
  'allergen-soy': { label: 'Soy Allergen', icon: 'leaf', color: '#DC2626' },
  'allergen-sulphites': { label: 'Sulphite Allergen', icon: 'flask-outline', color: '#DC2626' },
  'environmental-concern': { label: 'Environmental', icon: 'earth', color: '#F59E0B' },
};

export default function IngredientModal({ visible, ingredient, onClose }) {
  const bottomSheetModalRef = useRef(null);
  const snapPoints = useMemo(() => ['70%', '90%'], []);
  const { userPrefs } = useUser();
  
  const [aiData, setAiData] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);

  useEffect(() => {
    if (visible && ingredient) {
      bottomSheetModalRef.current?.present();
      
      // Auto-fetch deeper AI insight
      const key = getGeminiKey(userPrefs);
      if (key) {
        setLoadingAi(true);
        setAiData(null);
        analyzeIngredientDetail(ingredient.name, key, userPrefs.geminiModel)
          .then(data => setAiData(data))
          .catch(err => console.warn('AI Ingredient fetch failed:', err))
          .finally(() => setLoadingAi(false));
      }
    } else {
      bottomSheetModalRef.current?.dismiss();
      setAiData(null);
    }
  }, [visible, ingredient, userPrefs]);

  const renderBackdrop = useCallback(
    (props) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0}>
        <BlurView intensity={20} tint="dark" style={RNStyleSheet.absoluteFill} />
      </BottomSheetBackdrop>
    ),
    []
  );

  const handleDismiss = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!ingredient) return null;

  const colorInfo = COLOR_LABELS[ingredient.color] || COLOR_LABELS.yellow;

  return (
    <BottomSheetModal
      ref={bottomSheetModalRef}
      index={0}
      snapPoints={snapPoints}
      backdropComponent={renderBackdrop}
      onDismiss={handleDismiss}
      backgroundStyle={{ backgroundColor: colors.surface, borderRadius: 32 }}
      handleIndicatorStyle={{ backgroundColor: colors.borderLight, width: 40 }}
      enablePanDownToClose
    >
      <BottomSheetView style={styles.sheetContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.name}>{ingredient.name}</Text>
          <View style={[styles.riskBadge, { backgroundColor: getRiskBg(ingredient.color) }]}>
            <Ionicons name={colorInfo.icon} size={14} color={getRiskColor(ingredient.color)} />
            <Text style={[styles.riskLabel, { color: getRiskColor(ingredient.color) }]}>
              {colorInfo.label}
            </Text>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
          {/* AI Insights Loading State */}
          {loadingAi && (
            <View style={styles.aiLoadingState}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={styles.aiLoadingText}>Fetching deep AI insights...</Text>
            </View>
          )}

          {/* AI or Local Definition */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>What is it?</Text>
            <Text style={styles.definition}>
              {aiData?.whatIsIt || ingredient.definition}
            </Text>
          </View>
          
          {/* AI Purpose */}
          {aiData?.purpose && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Purpose in Food</Text>
              <Text style={styles.definition}>{aiData.purpose}</Text>
            </View>
          )}

          {/* Why it's flagged */}
          {ingredient.color !== 'green' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Local Dictionary Flag</Text>
              <Text style={styles.definition}>{colorInfo.description}</Text>
            </View>
          )}
          
          {/* AI Health Risk */}
          {aiData?.riskExplanation && (
            <View style={[styles.section, { backgroundColor: '#F9FAFB', padding: 12, borderRadius: 12 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <Ionicons name="sparkles" size={16} color={colors.primaryDark} style={{ marginRight: 6 }} />
                <Text style={styles.sectionTitle}>AI Health Assessment</Text>
              </View>
              <Text style={styles.definition}>{aiData.riskExplanation}</Text>
            </View>
          )}

          {/* Category */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Category</Text>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>
                {ingredient.category?.charAt(0).toUpperCase() + ingredient.category?.slice(1)}
              </Text>
            </View>
          </View>

          {/* Flags Container */}
          {(ingredient.flags?.length > 0 || aiData) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Characteristics</Text>
              <View style={styles.flagsContainer}>
                {/* Local Flags */}
                {ingredient.flags?.map((flag, idx) => {
                  const info = FLAG_LABELS[flag] || { label: flag, icon: 'pricetag', color: '#6B7280' };
                  return (
                    <View key={`f-${idx}`} style={[styles.flagBadge, { backgroundColor: info.color + '15' }]}>
                      <Ionicons name={info.icon} size={14} color={info.color} />
                      <Text style={[styles.flagLabel, { color: info.color }]}>{info.label}</Text>
                    </View>
                  );
                })}
                
                {/* AI Added Flags */}
                {aiData?.isNatural && (
                  <View style={[styles.flagBadge, { backgroundColor: '#22C55E15' }]}>
                    <Ionicons name="leaf" size={14} color="#22C55E" />
                    <Text style={[styles.flagLabel, { color: "#22C55E" }]}>Natural</Text>
                  </View>
                )}
                {aiData?.isUltraProcessed && (
                  <View style={[styles.flagBadge, { backgroundColor: '#EF444415' }]}>
                    <Ionicons name="cog" size={14} color="#EF4444" />
                    <Text style={[styles.flagLabel, { color: "#EF4444" }]}>Ultra-Processed</Text>
                  </View>
                )}
              </View>
            </View>
          )}
          
          {/* AI Safer Alternatives */}
          {aiData?.saferAlternatives?.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Safer Alternatives</Text>
              <View style={styles.flagsContainer}>
                {aiData.saferAlternatives.map((alt, idx) => (
                  <View key={`alt-${idx}`} style={[styles.flagBadge, { backgroundColor: colors.primarySoft }]}>
                    <Ionicons name="checkmark-circle-outline" size={14} color={colors.primaryDark} />
                    <Text style={[styles.flagLabel, { color: colors.primaryDark }]}>{alt}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {!aiData && ingredient.fuzzyMatch && (
            <View style={[styles.section, styles.fuzzyNote]}>
              <Text style={styles.fuzzyText}>
                This is an approximate match. Ensure you have an active Gemini key for detailed AI insights.
              </Text>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>

        <TouchableOpacity style={styles.closeBtn} onPress={() => bottomSheetModalRef.current?.dismiss()} activeOpacity={0.8}>
          <Text style={styles.closeBtnText}>Got it</Text>
        </TouchableOpacity>
      </BottomSheetView>
    </BottomSheetModal>
  );
}

function getRiskBg(color) {
  return color === 'green' ? colors.ingredientGreenBg : color === 'red' ? colors.ingredientRedBg : colors.ingredientYellowBg;
}
function getRiskColor(color) {
  return color === 'green' ? colors.ingredientGreen : color === 'red' ? colors.ingredientRed : colors.ingredientYellow;
}

const styles = StyleSheet.create({
  sheetContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  name: {
    ...typography.h3,
    color: colors.text,
    flex: 1,
    marginRight: 12,
  },
  riskBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    gap: 6,
  },
  riskLabel: { fontSize: 13, fontWeight: '700' },
  scroll: { flex: 1, marginBottom: 16 },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    ...typography.captionBold,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  definition: {
    ...typography.body,
    color: colors.text,
    lineHeight: 24,
  },
  categoryBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.md,
    alignSelf: 'flex-start',
  },
  categoryText: {
    ...typography.captionBold,
    color: colors.textSecondary,
  },
  flagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  flagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    gap: 6,
  },
  flagLabel: { fontSize: 13, fontWeight: '600' },
  fuzzyNote: {
    backgroundColor: '#F3F4F6',
    padding: 16,
    borderRadius: borderRadius.lg,
  },
  fuzzyText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  closeBtn: {
    backgroundColor: colors.text,
    paddingVertical: 16,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
  },
  closeBtnText: {
    ...typography.bodyBold,
    color: colors.textInverse,
  },
  aiLoadingState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primarySoft,
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  aiLoadingText: {
    ...typography.captionBold,
    color: colors.primaryDark,
  }
});
