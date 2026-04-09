// Ffads - Deep AI Analysis Card (Premium Interactive Component)
// Starts as a tappable button → animates loading → reveals full AI results
import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

function PulsingDot({ delay = 0 }) {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 600, delay, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return <Animated.View style={[styles.pulsingDot, { opacity }]} />;
}

function ShimmerLine({ width = '80%', height = 12, style }) {
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shimmer, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const translateX = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-100, 200] });
  return (
    <View style={[{ width, height, backgroundColor: '#F0F0F0', borderRadius: 6, overflow: 'hidden' }, style]}>
      <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, width: 80, backgroundColor: '#E0E0E0', borderRadius: 6, transform: [{ translateX }] }} />
    </View>
  );
}

export default function AICard({
  // Analysis state
  isIdle,        // true = show the tappable button
  isLoading,     // true = show shimmer loading
  // AI data (shown when available)
  animalContentFlag,
  animalContentDetails,
  harmfulChemicals,
  aiScore,
  aiRecommendation,
  hasIngredients,
  progressText,
  onAnalyze,
}) {
  const fadeIn = useRef(new Animated.Value(0)).current;
  const hasData = aiScore !== undefined && aiScore !== null;

  useEffect(() => {
    if (hasData) {
      Animated.timing(fadeIn, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    }
  }, [hasData]);


  // ═══════════════════════════════════════════════════
  // STATE 1: Idle — Show tappable button (whenever no data and not loading)
  // ═══════════════════════════════════════════════════
  if (!isLoading && !hasData) {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={onAnalyze} disabled={!hasIngredients}>
        <LinearGradient
          colors={hasIngredients ? ['#1E1B4B', '#312E81'] : ['#D1D5DB', '#E5E7EB']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.idleCard, !hasIngredients && { opacity: 0.5 }]}
        >
          <View style={styles.idleInner}>
            <View style={styles.idleIconCircle}>
              <Ionicons name="sparkles" size={24} color="#A5B4FC" />
            </View>
            <View style={styles.idleTextBlock}>
              <Text style={styles.idleTitle}>Run Deep AI Analysis</Text>
              <Text style={styles.idleSubtitle}>
                {hasIngredients
                  ? 'Harmful chemicals • Animal content • AI score'
                  : 'No ingredients found — AI analysis unavailable'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#A5B4FC" />
          </View>
          {hasIngredients && (
            <View style={styles.idleBadgeRow}>
              <View style={styles.idleBadge}>
                <Ionicons name="flash" size={10} color="#6366F1" />
                <Text style={styles.idleBadgeText}>1 API call</Text>
              </View>
              <View style={styles.idleBadge}>
                <Ionicons name="cloud-done" size={10} color="#6366F1" />
                <Text style={styles.idleBadgeText}>Cached forever</Text>
              </View>
            </View>
          )}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  // ═══════════════════════════════════════════════════
  // STATE 2: Loading — Shimmer skeleton + pulsing dots
  // ═══════════════════════════════════════════════════
  if (isLoading) {
    return (
      <View style={styles.card}>
        <LinearGradient
          colors={['#1E1B4B', '#312E81']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.loadingHeader}
        >
          <View style={styles.loadingHeaderInner}>
            <View style={styles.pulsingRow}>
              <PulsingDot delay={0} />
              <PulsingDot delay={200} />
              <PulsingDot delay={400} />
            </View>
            <Text style={styles.loadingTitle}>{progressText || 'Analyzing ingredients...'}</Text>
          </View>
        </LinearGradient>
        <View style={styles.loadingBody}>
          <ShimmerLine width="60%" height={14} />
          <ShimmerLine width="90%" height={10} style={{ marginTop: 12 }} />
          <ShimmerLine width="75%" height={10} style={{ marginTop: 8 }} />
          <ShimmerLine width="40%" height={14} style={{ marginTop: 20 }} />
          <ShimmerLine width="85%" height={10} style={{ marginTop: 12 }} />
        </View>
      </View>
    );
  }

  // ═══════════════════════════════════════════════════
  // STATE 3: Results — Full AI card with fade-in
  // ═══════════════════════════════════════════════════
  if (!hasData) return null;

  const scoreColor = aiScore > 70 ? '#047857' : aiScore > 40 ? '#B45309' : '#DC2626';
  const scoreBg = aiScore > 70 ? '#D1FAE5' : aiScore > 40 ? '#FEF3C7' : '#FEE2E2';

  return (
    <Animated.View style={[styles.card, { opacity: fadeIn }]}>
      {/* Header */}
      <LinearGradient
        colors={['#1E1B4B', '#312E81']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.resultHeader}
      >
        <Ionicons name="sparkles" size={18} color="#A5B4FC" />
        <Text style={styles.resultHeaderTitle}>Deep AI Analysis</Text>
        <View style={[styles.resultScoreBadge, { backgroundColor: scoreBg }]}>
          <Text style={[styles.resultScoreText, { color: scoreColor }]}>{aiScore}/100</Text>
        </View>
      </LinearGradient>

      <View style={styles.resultBody}>
        {/* Animal Content */}
        <View style={styles.resultSection}>
          <View style={styles.resultSectionHeader}>
            <Ionicons name={animalContentFlag ? "alert-circle" : "leaf"} size={16} color={animalContentFlag ? '#DC2626' : '#047857'} />
            <Text style={styles.resultLabel}>Animal Content</Text>
          </View>
          <Text style={[styles.resultValue, { color: animalContentFlag ? '#DC2626' : '#047857' }]}>
            {animalContentFlag ? 'Detected' : 'None Detected'}
          </Text>
          {animalContentDetails && (
            <Text style={styles.resultDetail}>{animalContentDetails}</Text>
          )}
        </View>

        <View style={styles.divider} />

        {/* Harmful Chemicals */}
        <View style={styles.resultSection}>
          <View style={styles.resultSectionHeader}>
            <Ionicons name="skull-outline" size={16} color={harmfulChemicals?.length > 0 ? '#DC2626' : '#047857'} />
            <Text style={styles.resultLabel}>Harmful Chemicals</Text>
          </View>
          {harmfulChemicals && harmfulChemicals.length > 0 ? (
            harmfulChemicals.map((chem, i) => (
              <View key={i} style={styles.chemCard}>
                <Text style={styles.chemName}>{chem.name}</Text>
                {chem.realName && <Text style={styles.chemReal}>→ {chem.realName}</Text>}
                <Text style={styles.chemRisk}>{chem.risk}</Text>
              </View>
            ))
          ) : (
            <View style={styles.safeBadge}>
              <Ionicons name="shield-checkmark" size={14} color="#047857" />
              <Text style={styles.safeText}>No harmful chemicals detected</Text>
            </View>
          )}
        </View>

        <View style={styles.divider} />

        {/* Verdict */}
        {aiRecommendation && (
          <View style={styles.resultSection}>
            <View style={styles.resultSectionHeader}>
              <Ionicons name="chatbox-ellipses-outline" size={16} color="#6366F1" />
              <Text style={styles.resultLabel}>AI Verdict</Text>
            </View>
            <Text style={styles.verdictText}>{aiRecommendation}</Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // ── Idle State (Button) ──
  idleCard: {
    borderRadius: 20,
    padding: 20,
    marginVertical: 12,
  },
  idleInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  idleIconCircle: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(165, 180, 252, 0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  idleTextBlock: { flex: 1 },
  idleTitle: {
    fontSize: 17, fontWeight: '800', color: '#E0E7FF',
    letterSpacing: -0.3,
  },
  idleSubtitle: {
    fontSize: 12, color: '#A5B4FC', marginTop: 3,
    lineHeight: 16,
  },
  idleBadgeRow: {
    flexDirection: 'row', gap: 8, marginTop: 14,
  },
  idleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8,
  },
  idleBadgeText: {
    fontSize: 11, fontWeight: '600', color: '#C7D2FE',
  },

  // ── Card Container ──
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginVertical: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },

  // ── Loading State ──
  loadingHeader: {
    paddingHorizontal: 20, paddingVertical: 20,
  },
  loadingHeaderInner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  pulsingRow: { flexDirection: 'row', gap: 4 },
  pulsingDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#A5B4FC',
  },
  loadingTitle: {
    fontSize: 14, fontWeight: '700', color: '#C7D2FE',
  },
  loadingBody: {
    padding: 20,
  },

  // ── Result State ──
  resultHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16, gap: 8,
  },
  resultHeaderTitle: {
    fontSize: 16, fontWeight: '800', color: '#E0E7FF',
    flex: 1, letterSpacing: -0.3,
  },
  resultScoreBadge: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 12,
  },
  resultScoreText: {
    fontSize: 15, fontWeight: '900',
  },
  resultBody: {
    padding: 20, gap: 16,
  },
  resultSection: { gap: 6 },
  resultSectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  resultLabel: {
    fontSize: 12, fontWeight: '700', color: '#9CA3AF',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  resultValue: {
    fontSize: 15, fontWeight: '700',
  },
  resultDetail: {
    fontSize: 13, color: '#6B7280', lineHeight: 18,
  },
  divider: {
    height: 1, backgroundColor: '#F3F4F6',
  },
  chemCard: {
    backgroundColor: '#FEF2F2',
    padding: 12, borderRadius: 12,
    borderLeftWidth: 3, borderLeftColor: '#EF4444',
    marginTop: 4,
  },
  chemName: {
    fontSize: 14, fontWeight: '700', color: '#991B1B',
  },
  chemReal: {
    fontSize: 12, color: '#B91C1C', fontStyle: 'italic', marginTop: 1,
  },
  chemRisk: {
    fontSize: 12, color: '#7F1D1D', marginTop: 4, lineHeight: 16,
  },
  safeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10, alignSelf: 'flex-start',
  },
  safeText: {
    fontSize: 13, fontWeight: '600', color: '#047857',
  },
  verdictText: {
    fontSize: 15, fontWeight: '500', color: '#1F2937',
    lineHeight: 22,
  },
});
