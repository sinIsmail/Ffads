// Ffads — Ingredient Modal (Redesigned)
import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
} from 'react-native';
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { borderRadius } from '../theme/spacing';
import { useUser, getActiveProvider } from '../store/UserContext';
import { analyzeIngredientDetail } from '../services/analysis.service';

// ─── Risk config ────────────────────────────────────────────────────────────
const RISK = {
  green: {
    label: 'Low Risk',
    sublabel: 'Generally safe for regular consumption.',
    icon: 'checkmark-circle',
    color: '#16A34A',
    bg: '#DCFCE7',
    border: '#86EFAC',
    dot: '#22C55E',
  },
  yellow: {
    label: 'Use Moderately',
    sublabel: 'Moderate concern — fine in small amounts.',
    icon: 'warning',
    color: '#B45309',
    bg: '#FEF3C7',
    border: '#FCD34D',
    dot: '#F59E0B',
  },
  red: {
    label: 'High Concern',
    sublabel: 'Risky ingredient. Limit or avoid where possible.',
    icon: 'alert-circle',
    color: '#B91C1C',
    bg: '#FEE2E2',
    border: '#FCA5A5',
    dot: '#EF4444',
  },
};

// ─── Dietary tag definitions ─────────────────────────────────────────────────
const DIET_TAGS = [
  { key: 'vegan',       label: 'Vegan',       emoji: '🌱', color: '#16A34A', bg: '#DCFCE7' },
  { key: 'vegetarian',  label: 'Vegetarian',  emoji: '🥗', color: '#15803D', bg: '#F0FDF4' },
  { key: 'halal',       label: 'Halal',       emoji: '☪️',  color: '#1D4ED8', bg: '#DBEAFE' },
  { key: 'kosher',      label: 'Kosher',      emoji: '✡️',  color: '#6D28D9', bg: '#EDE9FE' },
  { key: 'gluten_free', label: 'Gluten-Free', emoji: '🌾', color: '#92400E', bg: '#FEF3C7' },
  { key: 'keto',        label: 'Keto',        emoji: '🥑', color: '#065F46', bg: '#ECFDF5' },
];

// ─── Skeleton shimmer block ───────────────────────────────────────────────────
function Shimmer({ width = '100%', height = 14, style }) {
  const anim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: 6,
          backgroundColor: '#E5E3F1',
          opacity: anim,
        },
        style,
      ]}
    />
  );
}

function AiSkeleton() {
  return (
    <View style={styles.skeletonBox}>
      <View style={styles.skeletonHeader}>
        <Ionicons name="sparkles" size={14} color={colors.purple} />
        <Text style={styles.skeletonLabel}>AI is analysing…</Text>
      </View>
      <Shimmer width="95%" height={13} style={{ marginBottom: 8 }} />
      <Shimmer width="80%" height={13} style={{ marginBottom: 8 }} />
      <Shimmer width="60%" height={13} />
    </View>
  );
}

// ─── Section wrapper ─────────────────────────────────────────────────────────
function Section({ title, children, accent }) {
  return (
    <View style={styles.section}>
      {title ? (
        <Text style={[styles.sectionTitle, accent && { color: accent }]}>
          {title.toUpperCase()}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

// ─── Pill tag ─────────────────────────────────────────────────────────────────
function Pill({ emoji, label, color, bg, icon }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg, borderColor: color + '40' }]}>
      {emoji ? <Text style={styles.pillEmoji}>{emoji}</Text> : null}
      {icon ? <Ionicons name={icon} size={13} color={color} /> : null}
      <Text style={[styles.pillLabel, { color }]}>{label}</Text>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function IngredientModal({ visible, ingredient, onClose }) {
  const sheetRef = useRef(null);
  const snapPoints = useMemo(() => ['75%', '92%'], []);
  const { userPrefs } = useUser();
  const [aiData, setAiData] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);

  useEffect(() => {
    let alive = true;

    if (visible && ingredient) {
      sheetRef.current?.present();
      setAiData(null);
      setLoadingAi(true);

      analyzeIngredientDetail(ingredient.name, getActiveProvider(userPrefs))
        .then((data) => { if (alive) setAiData(data); })
        .catch(() => { if (alive) setAiData(null); })
        .finally(() => { if (alive) setLoadingAi(false); });
    } else {
      sheetRef.current?.dismiss();
      setAiData(null);
      setLoadingAi(false);
    }

    return () => { alive = false; };
  }, [visible, ingredient, userPrefs]);

  const renderBackdrop = useCallback(
    (props) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0}>
        <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
      </BottomSheetBackdrop>
    ),
    []
  );

  if (!ingredient) return null;

  const risk = RISK[ingredient.color] || RISK.yellow;

  // Dietary compatibility derived from AI or dictionary flags
  const activeDietTags = DIET_TAGS.filter(({ key }) => {
    if (key === 'vegan') return aiData?.isVegan ?? !ingredient.flags?.includes('animal-derived');
    if (key === 'vegetarian') return aiData?.isVegan ?? !ingredient.flags?.includes('animal-derived');
    if (key === 'gluten_free') return !ingredient.flags?.includes('gluten');
    if (key === 'halal') return !(aiData?.isAnimalDerived) && !ingredient.flags?.includes('animal-derived');
    return false;
  });

  // Allergens
  const allergens = aiData?.commonAllergens?.filter(Boolean) ?? [];

  // Sourcing
  const isNatural = aiData?.isNatural ?? !ingredient.flags?.includes('artificial');
  const isUltraProcessed = aiData?.isUltraProcessed ?? ingredient.flags?.includes('ultra-processed');
  const isAnimalDerived = aiData?.isAnimalDerived ?? ingredient.flags?.includes('animal-derived');
  const hasEnvConcern = ingredient.flags?.includes('environmental-concern');

  // Daily limit & banned
  const dailyLimit = aiData?.dailyLimitMg;
  const bannedIn = aiData?.bannedInCountries?.filter(Boolean) ?? [];

  // Common name (AI) vs scientific (dictionary)
  const displayName = ingredient.name;
  const translatedName = aiData?.name && aiData.name.toLowerCase() !== displayName.toLowerCase()
    ? aiData.name
    : null;

  return (
    <BottomSheetModal
      ref={sheetRef}
      index={0}
      snapPoints={snapPoints}
      backdropComponent={renderBackdrop}
      onDismiss={onClose}
      backgroundStyle={styles.sheet}
      handleIndicatorStyle={styles.handle}
      enablePanDownToClose
    >
      <BottomSheetView style={styles.container}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {/* Risk dot */}
            <View style={[styles.riskDot, { backgroundColor: risk.dot }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.ingredientName} numberOfLines={2}>{displayName}</Text>
              {translatedName ? (
                <Text style={styles.translatedName}>"{translatedName}"</Text>
              ) : null}
            </View>
          </View>
          <TouchableOpacity
            style={styles.closeIcon}
            onPress={() => sheetRef.current?.dismiss()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* ── Risk card ── */}
        <View style={[styles.riskCard, { backgroundColor: risk.bg, borderColor: risk.border }]}>
          <Ionicons name={risk.icon} size={22} color={risk.color} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.riskLabel, { color: risk.color }]}>{risk.label}</Text>
            <Text style={[styles.riskSublabel, { color: risk.color }]}>{risk.sublabel}</Text>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >

          {/* ── What is it? ── */}
          <Section title="Plain English">
            <Text style={styles.bodyText}>
              {aiData?.whatIsIt || ingredient.definition || 'No description available.'}
            </Text>
          </Section>

          {/* ── Purpose ── */}
          {(aiData?.purpose || ingredient.definition) ? (
            <Section title="Why it's in this food">
              <Text style={styles.bodyText}>
                {aiData?.purpose || 'Used as an ingredient in this product.'}
              </Text>
            </Section>
          ) : null}

          {/* ── AI health summary (or skeleton) ── */}
          {loadingAi ? (
            <AiSkeleton />
          ) : aiData?.riskExplanation ? (
            <View style={styles.aiCard}>
              <View style={styles.aiCardHeader}>
                <Ionicons name="sparkles" size={15} color={colors.purple} />
                <Text style={styles.aiCardTitle}>AI Health Summary</Text>
              </View>
              <Text style={styles.aiCardText}>{aiData.riskExplanation}</Text>
            </View>
          ) : null}

          {/* ── Allergen warning ── */}
          {allergens.length > 0 ? (
            <View style={styles.allergenBox}>
              <Ionicons name="alert-circle" size={18} color="#B91C1C" />
              <View style={{ flex: 1 }}>
                <Text style={styles.allergenTitle}>Allergen Warning</Text>
                <Text style={styles.allergenBody}>
                  Contains or derived from: {allergens.join(', ')}
                </Text>
              </View>
            </View>
          ) : null}

          {/* ── Dietary compatibility ── */}
          {activeDietTags.length > 0 ? (
            <Section title="Dietary Compatibility">
              <View style={styles.pillRow}>
                {activeDietTags.map((tag) => (
                  <Pill key={tag.key} emoji={tag.emoji} label={tag.label} color={tag.color} bg={tag.bg} />
                ))}
              </View>
            </Section>
          ) : null}

          {/* ── Sourcing ── */}
          <Section title="Sourcing & Nature">
            <View style={styles.pillRow}>
              <Pill
                icon={isNatural ? 'leaf' : 'flask'}
                label={isNatural ? 'Natural Source' : 'Synthetically Made'}
                color={isNatural ? '#15803D' : '#B45309'}
                bg={isNatural ? '#F0FDF4' : '#FEF3C7'}
              />
              {isUltraProcessed ? (
                <Pill icon="cog" label="Ultra-Processed" color="#B91C1C" bg="#FEE2E2" />
              ) : null}
              {isAnimalDerived ? (
                <Pill icon="paw" label="Animal-Derived" color="#6D28D9" bg="#EDE9FE" />
              ) : null}
              {hasEnvConcern ? (
                <Pill icon="earth" label="Env. Concern" color="#92400E" bg="#FEF3C7" />
              ) : null}
            </View>
          </Section>

          {/* ── Daily limit ── */}
          {dailyLimit && dailyLimit > 0 ? (
            <Section title="Recommended Daily Limit">
              <View style={styles.infoRow}>
                <View style={styles.infoIcon}>
                  <Ionicons name="fitness" size={16} color={colors.secondary} />
                </View>
                <Text style={styles.infoText}>
                  <Text style={styles.infoValue}>{dailyLimit} mg</Text> per day (WHO guidance)
                </Text>
              </View>
            </Section>
          ) : null}

          {/* ── Banned in ── */}
          {bannedIn.length > 0 ? (
            <Section title="Regulatory Flags">
              <View style={styles.bannedBox}>
                <Ionicons name="ban" size={16} color="#B91C1C" />
                <Text style={styles.bannedText}>
                  Banned or restricted in: <Text style={styles.bannedCountries}>{bannedIn.join(', ')}</Text>
                </Text>
              </View>
            </Section>
          ) : null}

          {/* ── Safer alternatives ── */}
          {aiData?.saferAlternatives?.length > 0 ? (
            <Section title="Safer Alternatives">
              <View style={styles.pillRow}>
                {aiData.saferAlternatives.map((alt, i) => (
                  <Pill key={i} icon="checkmark-circle-outline" label={alt} color={colors.secondaryDark} bg={colors.secondarySoft} />
                ))}
              </View>
            </Section>
          ) : null}

          {/* Fuzzy match note */}
          {!aiData && ingredient.fuzzyMatch ? (
            <View style={styles.fuzzyNote}>
              <Ionicons name="information-circle-outline" size={15} color={colors.textMuted} />
              <Text style={styles.fuzzyText}>
                Approximate match. Add an AI provider in Profile for deeper insights.
              </Text>
            </View>
          ) : null}

          <View style={{ height: 24 }} />
        </ScrollView>

        {/* ── Close button ── */}
        <TouchableOpacity style={styles.closeBtn} onPress={() => sheetRef.current?.dismiss()} activeOpacity={0.85}>
          <Text style={styles.closeBtnText}>Got it</Text>
        </TouchableOpacity>

      </BottomSheetView>
    </BottomSheetModal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  sheet: { backgroundColor: colors.surface, borderRadius: 32 },
  handle: { backgroundColor: colors.borderLight, width: 40 },
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 6, paddingBottom: 20 },

  // Header
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 },
  headerLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1, marginRight: 8 },
  riskDot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  ingredientName: { ...typography.h3, color: colors.text, lineHeight: 26 },
  translatedName: { ...typography.caption, color: colors.textSecondary, marginTop: 2, fontStyle: 'italic' },
  closeIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },

  // Risk card
  riskCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: borderRadius.lg,
    borderWidth: 1, marginBottom: 18,
  },
  riskLabel: { ...typography.bodyBold },
  riskSublabel: { ...typography.caption, marginTop: 1, opacity: 0.85 },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 2 },

  // Section
  section: { marginBottom: 20 },
  sectionTitle: {
    ...typography.small,
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
    fontWeight: '700',
  },

  // Body text
  bodyText: { ...typography.body, color: colors.text, lineHeight: 24 },

  // AI card
  aiCard: {
    backgroundColor: colors.purpleSoft,
    borderRadius: borderRadius.lg,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.purpleLight,
  },
  aiCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  aiCardTitle: { ...typography.captionBold, color: colors.purpleDark },
  aiCardText: { ...typography.body, color: colors.text, lineHeight: 24 },

  // AI skeleton
  skeletonBox: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.lg,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  skeletonHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  skeletonLabel: { ...typography.captionBold, color: colors.purple },

  // Allergen warning
  allergenBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#FEE2E2', borderRadius: borderRadius.lg,
    padding: 14, marginBottom: 20,
    borderWidth: 1, borderColor: '#FCA5A5',
  },
  allergenTitle: { ...typography.captionBold, color: '#B91C1C', marginBottom: 3 },
  allergenBody: { ...typography.caption, color: '#7F1D1D', lineHeight: 18 },

  // Pills
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  pillEmoji: { fontSize: 13 },
  pillLabel: { ...typography.captionBold },

  // Info row (daily limit)
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.secondarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  infoText: { ...typography.body, color: colors.textSecondary, flex: 1 },
  infoValue: { fontWeight: '700', color: colors.text },

  // Banned countries
  bannedBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FFF7ED', borderRadius: borderRadius.md,
    padding: 12, borderWidth: 1, borderColor: '#FED7AA',
  },
  bannedText: { ...typography.caption, color: '#7C2D12', flex: 1, lineHeight: 18 },
  bannedCountries: { fontWeight: '700' },

  // Fuzzy note
  fuzzyNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: colors.surfaceMuted, borderRadius: borderRadius.md,
    padding: 12, borderWidth: 1, borderColor: colors.border,
  },
  fuzzyText: { ...typography.caption, color: colors.textMuted, flex: 1, lineHeight: 18 },

  // Close button
  closeBtn: {
    backgroundColor: colors.text,
    paddingVertical: 16,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    marginTop: 8,
  },
  closeBtnText: { ...typography.bodyBold, color: colors.textInverse },
});
