// Ffads — Compare Screen (Redesigned)
import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing, borderRadius, shadows } from '../theme/spacing';
import { useProducts } from '../store/ProductContext';
import EmptyState from '../components/EmptyState';
import { calculateScore, getScoreColor } from '../utils/scoring';
import { classifyIngredients } from '../utils/ingredientDictionary';

export default function CompareScreen() {
  const insets = useSafeAreaInsets();
  const { productState, productDispatch } = useProducts();
  const { history: products, compareSelection } = productState;

  const selectedProducts = useMemo(() =>
    compareSelection.map((id) => products.find((p) => p.id === id)).filter(Boolean),
    [compareSelection, products]
  );

  const analyses = useMemo(() =>
    selectedProducts.map((p) => {
      const classified = classifyIngredients(p.ingredients || []);
      const result = calculateScore({ nutrition: p.nutrition, classifiedIngredients: classified });
      return { product: p, classified, ...result };
    }),
    [selectedProducts]
  );

  const handleToggle = (id) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    productDispatch({ type: 'TOGGLE_COMPARE', payload: id });
  };

  const betterIdx = analyses.length === 2
    ? analyses[0].score >= analyses[1].score ? 0 : 1
    : -1;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Compare</Text>
        <Text style={styles.subtitle}>
          {compareSelection.length}/2 selected
        </Text>
      </View>

      {/* Product Picker — Vertical Cards */}
      <View style={styles.pickerContainer}>
        <Text style={styles.pickerSectionTitle}>Select Products</Text>
        <Text style={styles.pickerHint}>Tap two items to compare</Text>
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={styles.pickerScroll}
          contentContainerStyle={styles.pickerContent}
        >
        {products.map((p, index) => {
          const selected = compareSelection.includes(p.id);
          const selIndex = compareSelection.indexOf(p.id);
          return (
            <TouchableOpacity
              key={p.id}
              style={[styles.pickerCard, selected && styles.pickerCardOn]}
              onPress={() => handleToggle(p.id)}
              activeOpacity={0.7}
            >
              {/* Selection indicator */}
              <View style={[styles.pickerRadio, selected && styles.pickerRadioOn]}>
                {selected && <Text style={styles.pickerRadioText}>{selIndex + 1}</Text>}
              </View>

              {/* Product image */}
              {p.images?.front ? (
                <Image source={{ uri: p.images.front }} style={styles.pickerImg} />
              ) : (
                <View style={styles.pickerPlaceholder}>
                  <Ionicons name="cube-outline" size={20} color="#999" />
                </View>
              )}

              {/* Product info */}
              <View style={styles.pickerInfo}>
                <Text style={styles.pickerName} numberOfLines={1}>{p.name}</Text>
                <Text style={styles.pickerBrand} numberOfLines={1}>{p.brand || 'Unknown Brand'}</Text>
              </View>

              {selected && (
                <Ionicons name="checkmark-circle" size={22} color="#047857" />
              )}
            </TouchableOpacity>
          );
        })}
        {products.length === 0 && (
          <View style={styles.pickerEmptyBox}>
            <Ionicons name="scan-outline" size={32} color="#CCC" />
            <Text style={styles.pickerEmpty}>Scan products first to compare them</Text>
          </View>
        )}
      </ScrollView>
      </View>

      {/* Comparison Content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {selectedProducts.length < 2 ? (
          <EmptyState
            icon="scale-outline"
            title={selectedProducts.length === 0 ? 'Pick 2 products' : 'Pick 1 more'}
            message="Select products from the row above to compare nutrition, ingredients, and health scores."
          />
        ) : (
          <>
            {/* Winner Banner */}
            {betterIdx >= 0 && (
              <View style={styles.winnerBanner}>
                <Ionicons name="ribbon" size={28} color="#047857" />
                <View style={styles.winnerInfo}>
                  <Text style={styles.winnerLabel}>Better Choice</Text>
                  <Text style={styles.winnerName}>{analyses[betterIdx].product.name}</Text>
                </View>
                <Text style={styles.winnerScore}>{analyses[betterIdx].score}</Text>
              </View>
            )}

            {/* Score Cards */}
            <View style={styles.scoresRow}>
              {analyses.map((a, idx) => {
                const isWinner = idx === betterIdx;
                return (
                  <View
                    key={a.product.id}
                    style={[styles.scoreCard, isWinner && styles.scoreCardWinner]}
                  >
                    {isWinner && (
                      <View style={styles.winnerTag}>
                        <Text style={styles.winnerTagText}>BEST</Text>
                      </View>
                    )}
                    {a.product.images?.front ? (
                      <Image source={{ uri: a.product.images.front }} style={styles.scoreImg} />
                    ) : (
                      <View style={styles.scoreImgPlaceholder}>
                        <Ionicons name="cube-outline" size={32} color={colors.textMuted} />
                      </View>
                    )}
                    <View style={[styles.scoreBubble, { borderColor: a.scoreColor }]}>
                      <Text style={[styles.scoreNum, { color: a.scoreColor }]}>
                        {a.score}
                      </Text>
                    </View>
                    <Text style={styles.scoreGrade}>{a.grade}</Text>
                    <Text style={styles.scoreName} numberOfLines={2}>{a.product.name}</Text>
                    <Text style={styles.scoreBrand}>{a.product.brand}</Text>
                  </View>
                );
              })}
            </View>

            {/* Detailed Comparison Table */}
            <View style={styles.tableCard}>
              <Text style={styles.tableTitle}>Detailed Comparison</Text>
              
              <TableRow icon="medical-outline" label="Sugar" values={analyses.map(a => fmtG(a.product.nutrition?.sugar))} better={lower(analyses, a => a.product.nutrition?.sugar)} />
              <TableRow icon="water-outline" label="Sodium" values={analyses.map(a => fmtMg(a.product.nutrition?.sodium))} better={lower(analyses, a => a.product.nutrition?.sodium)} />
              <TableRow icon="fast-food-outline" label="Total Fat" values={analyses.map(a => fmtG(a.product.nutrition?.fat))} better={lower(analyses, a => a.product.nutrition?.fat)} />
              <TableRow icon="alert-circle-outline" label="Sat. Fat" values={analyses.map(a => fmtG(a.product.nutrition?.saturatedFat))} better={lower(analyses, a => a.product.nutrition?.saturatedFat)} />
              <TableRow icon="fitness-outline" label="Protein" values={analyses.map(a => fmtG(a.product.nutrition?.protein))} better={higher(analyses, a => a.product.nutrition?.protein)} />
              <TableRow icon="leaf-outline" label="Fiber" values={analyses.map(a => fmtG(a.product.nutrition?.fiber))} better={higher(analyses, a => a.product.nutrition?.fiber)} />
              <TableRow icon="flash-outline" label="Energy" values={analyses.map(a => fmtKcal(a.product.nutrition?.energy))} better={lower(analyses, a => a.product.nutrition?.energy)} />
              <TableRow icon="flask-outline" label="Ingredients" values={analyses.map(a => String(a.product.ingredients?.length || 0))} better={lower(analyses, a => a.product.ingredients?.length || 0)} />
              <TableRow icon="warning-outline" label="Risky Count" values={analyses.map(a => String(a.classified.filter(i => i.color === 'red').length))} better={lower(analyses, a => a.classified.filter(i => i.color === 'red').length)} last />
            </View>

            {/* Ingredient Breakdown */}
            <View style={styles.tableCard}>
              <Text style={styles.tableTitle}>Ingredient Breakdown</Text>
              {analyses.map((a, idx) => (
                <View key={idx} style={styles.breakdownRow}>
                  <Text style={styles.breakdownName} numberOfLines={1}>{a.product.name}</Text>
                  <View style={styles.breakdownBars}>
                    <BarSegment
                      count={a.classified.filter(i => i.color === 'green').length}
                      total={a.classified.length}
                      color="#22C55E"
                    />
                    <BarSegment
                      count={a.classified.filter(i => i.color === 'yellow').length}
                      total={a.classified.length}
                      color="#F59E0B"
                    />
                    <BarSegment
                      count={a.classified.filter(i => i.color === 'red').length}
                      total={a.classified.length}
                      color="#EF4444"
                    />
                  </View>
                </View>
              ))}
              <View style={styles.legendRow}>
                <LegendDot color="#22C55E" label="Safe" />
                <LegendDot color="#F59E0B" label="Caution" />
                <LegendDot color="#EF4444" label="Risky" />
              </View>
            </View>
          </>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

// ─── Sub-components ──────────────────────────

function TableRow({ icon, label, values, better, last }) {
  return (
    <View style={[styles.tRow, !last && styles.tRowBorder]}>
      <Ionicons name={icon} size={16} color={colors.textSecondary} style={{ marginRight: 6 }} />
      <Text style={styles.tLabel}>{label}</Text>
      {values.map((val, idx) => (
        <View key={idx} style={[styles.tCell, idx === better && styles.tCellBetter]}>
          <Text style={[styles.tValue, idx === better && styles.tValueBetter]}>
            {val}
          </Text>
        </View>
      ))}
    </View>
  );
}

function BarSegment({ count, total, color }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  if (pct === 0) return null;
  return (
    <View style={{ width: `${pct}%`, height: 8, backgroundColor: color, borderRadius: 4 }} />
  );
}

function LegendDot({ color, label }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

// ─── Helpers ─────────────────────────────────

function fmtG(v) { return v != null ? `${v}g` : '—'; }
function fmtMg(v) { return v != null ? `${v}mg` : '—'; }
function fmtKcal(v) { return v != null ? `${v}` : '—'; }

function lower(analyses, getter) {
  if (analyses.length < 2) return -1;
  const a = getter(analyses[0]), b = getter(analyses[1]);
  if (a == null || b == null || a === b) return -1;
  return a < b ? 0 : 1;
}
function higher(analyses, getter) {
  if (analyses.length < 2) return -1;
  const a = getter(analyses[0]), b = getter(analyses[1]);
  if (a == null || b == null || a === b) return -1;
  return a > b ? 0 : 1;
}

// ─── Styles ─────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF9F6' },
  header: {
    paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.sm,
  },
  title: { fontSize: 32, fontWeight: '800', color: '#1A1A1A', letterSpacing: -1 },
  subtitle: { ...typography.caption, color: '#666666', marginTop: 2, fontWeight: '500' },

  // Picker — Vertical card list
  pickerContainer: { marginBottom: 8, paddingHorizontal: 24 },
  pickerSectionTitle: { fontSize: 18, fontWeight: '800', color: '#1A1A1A', marginBottom: 4 },
  pickerHint: { fontSize: 13, fontWeight: '500', color: '#999', marginBottom: 16 },
  pickerScroll: { maxHeight: 200 },
  pickerContent: { gap: 8, paddingBottom: 8 },
  pickerCard: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    backgroundColor: '#FFFFFF', borderRadius: 20, gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
    borderWidth: 2, borderColor: 'transparent',
  },
  pickerCardOn: { borderColor: '#04785720', backgroundColor: '#F0FDF4' },
  pickerRadio: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#DDD',
    alignItems: 'center', justifyContent: 'center',
  },
  pickerRadioOn: { borderColor: '#047857', backgroundColor: '#047857' },
  pickerRadioText: { fontSize: 11, fontWeight: '800', color: '#FFF' },
  pickerImg: { width: 40, height: 40, borderRadius: 12 },
  pickerPlaceholder: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: '#EAE8E3',
    alignItems: 'center', justifyContent: 'center',
  },
  pickerInfo: { flex: 1 },
  pickerName: { fontSize: 14, fontWeight: '700', color: '#1A1A1A' },
  pickerBrand: { fontSize: 11, fontWeight: '500', color: '#999', marginTop: 2 },
  pickerEmptyBox: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  pickerEmpty: { fontSize: 13, fontWeight: '500', color: '#999' },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: 100 },

  // Winner
  winnerBanner: {
    flexDirection: 'row', alignItems: 'center', padding: 18,
    backgroundColor: '#ECFDF5', borderRadius: 24, marginBottom: spacing.lg, gap: 12,
  },
  winnerIcon: { fontSize: 28 },
  winnerInfo: { flex: 1 },
  winnerLabel: { fontSize: 13, fontWeight: '700', color: '#065F46', textTransform: 'uppercase', letterSpacing: 0.5 },
  winnerName: { fontSize: 18, fontWeight: '800', color: '#065F46', marginTop: 2 },
  winnerScore: { fontSize: 32, fontWeight: '800', color: '#047857' },

  // Score cards
  scoresRow: { flexDirection: 'row', gap: 16, marginBottom: spacing.lg },
  scoreCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 24,
    padding: spacing.lg, alignItems: 'center', 
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 3,
    borderWidth: 2, borderColor: 'transparent', gap: 8,
  },
  scoreCardWinner: { borderColor: '#10B98120', backgroundColor: '#F0FDF4' },
  winnerTag: {
    position: 'absolute', top: -1, right: -1,
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: '#10B981',
    borderTopRightRadius: 24, borderBottomLeftRadius: 16,
  },
  winnerTagText: { fontSize: 9, fontWeight: '800', color: '#FFF', letterSpacing: 0.5 },
  scoreImg: { width: 64, height: 64, borderRadius: 16 },
  scoreImgPlaceholder: {
    width: 64, height: 64, borderRadius: 16, backgroundColor: '#EAE8E3',
    alignItems: 'center', justifyContent: 'center',
  },
  scoreBubble: {
    width: 52, height: 52, borderRadius: 26, borderWidth: 3,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF',
    marginTop: 4
  },
  scoreNum: { fontSize: 20, fontWeight: '800' },
  scoreGrade: { fontSize: 11, fontWeight: '700', color: '#666666', textTransform: 'uppercase' },
  scoreName: { fontSize: 12, fontWeight: '800', color: '#1A1A1A', textAlign: 'center', marginTop: 4 },
  scoreBrand: { fontSize: 11, fontWeight: '600', color: '#999999' },

  // Table
  tableCard: {
    backgroundColor: '#FFFFFF', borderRadius: 24,
    padding: spacing.xl, marginBottom: spacing.lg, 
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 3,
  },
  tableTitle: { fontSize: 18, fontWeight: '800', color: '#1A1A1A', marginBottom: 20 },
  tRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
  },
  tRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' },
  tLabel: { fontSize: 13, fontWeight: '600', color: '#666666', flex: 1 },
  tCell: {
    minWidth: 65, paddingVertical: 6, paddingHorizontal: 10,
    borderRadius: 8, alignItems: 'center', marginLeft: 8,
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  tCellBetter: { backgroundColor: '#ECFDF5' },
  tValue: { fontSize: 13, fontWeight: '800', color: '#1A1A1A' },
  tValueBetter: { color: '#047857' },

  // Breakdown
  breakdownRow: { marginTop: 16 },
  breakdownName: { fontSize: 12, fontWeight: '700', color: '#1A1A1A', marginBottom: 8 },
  breakdownBars: { flexDirection: 'row', borderRadius: 8, overflow: 'hidden', gap: 2, height: 10 },
  legendRow: { flexDirection: 'row', gap: 16, marginTop: 24, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, fontWeight: '600', color: '#666666' },
});
