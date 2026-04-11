// Ffads — Compare Screen (Redesigned: Slot-based picker with search)
import React, { useMemo, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Modal, TextInput, FlatList, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing, borderRadius, shadows } from '../theme/spacing';
import { useProducts } from '../store/ProductContext';
import { calculateScore } from '../utils/scoring';
import { classifyIngredients } from '../utils/ingredientDictionary';

// ─── Product Search Modal ─────────────────────────────────────────────────────
function ProductSearchModal({ visible, onClose, onSelect, excludeId, allProducts }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allProducts.filter((p) => {
      if (p.id === excludeId) return false;
      if (!q) return true;
      return (
        p.name?.toLowerCase().includes(q) ||
        p.brand?.toLowerCase().includes(q) ||
        p.barcode?.includes(q)
      );
    });
  }, [query, allProducts, excludeId]);

  const handleSelect = useCallback((product) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSelect(product);
    setQuery('');
    onClose();
  }, [onSelect, onClose]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={modal.container}>
        {/* Modal Header */}
        <View style={modal.header}>
          <View style={modal.headerLeft}>
            <Text style={modal.title}>Search Products</Text>
            <Text style={modal.sub}>Choose from your scan history</Text>
          </View>
          <TouchableOpacity style={modal.closeBtn} onPress={() => { setQuery(''); onClose(); }}>
            <Ionicons name="close" size={20} color="#64748B" />
          </TouchableOpacity>
        </View>

        {/* Search bar */}
        <View style={modal.searchWrap}>
          <Ionicons name="search-outline" size={18} color="#94A3B8" style={{ marginLeft: 14 }} />
          <TextInput
            style={modal.searchInput}
            placeholder="Search by name, brand or barcode…"
            placeholderTextColor="#94A3B8"
            value={query}
            onChangeText={setQuery}
            autoFocus
            clearButtonMode="while-editing"
          />
        </View>

        {/* Product list */}
        {allProducts.length === 0 ? (
          <View style={modal.emptyWrap}>
            <Text style={{ fontSize: 40 }}>📦</Text>
            <Text style={modal.emptyTitle}>No products yet</Text>
            <Text style={modal.emptySub}>Scan some products first, then come back to compare them.</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={modal.emptyWrap}>
            <Text style={{ fontSize: 40 }}>🔍</Text>
            <Text style={modal.emptyTitle}>No matches</Text>
            <Text style={modal.emptySub}>Try a different name or brand.</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 60 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const classified = classifyIngredients(item.ingredients || []);
              const { score, scoreColor } = calculateScore({ nutrition: item.nutrition, classifiedIngredients: classified });
              return (
                <TouchableOpacity style={modal.productRow} onPress={() => handleSelect(item)} activeOpacity={0.75}>
                  {item.images?.front ? (
                    <Image source={{ uri: item.images.front }} style={modal.productImg} />
                  ) : (
                    <View style={modal.productImgPlaceholder}>
                      <Ionicons name="cube-outline" size={20} color="#CBD5E1" />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={modal.productName} numberOfLines={1}>{item.name}</Text>
                    <Text style={modal.productBrand} numberOfLines={1}>{item.brand || 'Unknown brand'}</Text>
                  </View>
                  {score != null && (
                    <View style={[modal.scorePill, { borderColor: scoreColor }]}>
                      <Text style={[modal.scorePillTxt, { color: scoreColor }]}>{score}</Text>
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

// ─── Slot Button ──────────────────────────────────────────────────────────────
function SlotButton({ label, product, onAdd, onRemove }) {
  if (!product) {
    return (
      <TouchableOpacity style={slot.empty} onPress={onAdd} activeOpacity={0.8}>
        <View style={slot.plusCircle}>
          <Ionicons name="add" size={26} color="#6366F1" />
        </View>
        <Text style={slot.emptyLabel}>{label}</Text>
        <Text style={slot.emptyHint}>Tap to add</Text>
      </TouchableOpacity>
    );
  }
  const classified = classifyIngredients(product.ingredients || []);
  const { score, scoreColor } = calculateScore({ nutrition: product.nutrition, classifiedIngredients: classified });
  return (
    <View style={slot.filled}>
      <TouchableOpacity style={slot.removeBtn} onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="close-circle" size={20} color="#94A3B8" />
      </TouchableOpacity>
      {product.images?.front ? (
        <Image source={{ uri: product.images.front }} style={slot.img} />
      ) : (
        <View style={slot.imgPlaceholder}>
          <Ionicons name="cube-outline" size={24} color="#CBD5E1" />
        </View>
      )}
      {score != null && (
        <View style={[slot.scoreBubble, { borderColor: scoreColor }]}>
          <Text style={[slot.scoreNum, { color: scoreColor }]}>{score}</Text>
        </View>
      )}
      <Text style={slot.name} numberOfLines={2}>{product.name}</Text>
      <Text style={slot.brand} numberOfLines={1}>{product.brand || ''}</Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function CompareScreen() {
  const insets = useSafeAreaInsets();
  const { productState } = useProducts();
  const allProducts = productState.history;

  const [slotA, setSlotA] = useState(null);  // product object | null
  const [slotB, setSlotB] = useState(null);
  const [pickingSlot, setPickingSlot] = useState(null); // 'A' | 'B' | null

  const openPicker = useCallback((which) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPickingSlot(which);
  }, []);

  const handleSelect = useCallback((product) => {
    if (pickingSlot === 'A') setSlotA(product);
    else setSlotB(product);
  }, [pickingSlot]);

  const clearSlot = useCallback((which) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (which === 'A') setSlotA(null);
    else setSlotB(null);
  }, []);

  const clearAll = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSlotA(null);
    setSlotB(null);
  }, []);

  // Compute analyses
  const analyses = useMemo(() => {
    return [slotA, slotB].filter(Boolean).map((p) => {
      const classified = classifyIngredients(p.ingredients || []);
      const result = calculateScore({ nutrition: p.nutrition, classifiedIngredients: classified });
      return { product: p, classified, ...result };
    });
  }, [slotA, slotB]);

  const ready = analyses.length === 2;
  const betterIdx = ready
    ? analyses[0].score >= analyses[1].score ? 0 : 1
    : -1;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Compare</Text>
          <Text style={styles.subtitle}>
            {ready ? 'Side-by-side analysis ready' : 'Add 2 products to compare'}
          </Text>
        </View>
        {(slotA || slotB) && (
          <TouchableOpacity style={styles.clearAllBtn} onPress={clearAll}>
            <Ionicons name="trash-outline" size={14} color="#EF4444" />
            <Text style={styles.clearAllTxt}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Slot Picker Row (Expands when empty, collapses when comparing) ── */}
      {!ready ? (
        <View style={styles.slotsRow}>
          <SlotButton label="Product A" product={slotA} onAdd={() => openPicker('A')} onRemove={() => clearSlot('A')} />
          <View style={styles.vsDivider}><Text style={styles.vsText}>VS</Text></View>
          <SlotButton label="Product B" product={slotB} onAdd={() => openPicker('B')} onRemove={() => clearSlot('B')} />
        </View>
      ) : (
        <View style={styles.compactPickerRow}>
          <TouchableOpacity style={styles.compactPickerBtn} onPress={() => openPicker('A')} activeOpacity={0.7}>
            <Ionicons name="swap-horizontal" size={14} color="#64748B" />
            <Text style={styles.compactPickerBtnTxt} numberOfLines={1}>{slotA.name}</Text>
          </TouchableOpacity>
          <Text style={styles.compactVs}>VS</Text>
          <TouchableOpacity style={styles.compactPickerBtn} onPress={() => openPicker('B')} activeOpacity={0.7}>
            <Text style={styles.compactPickerBtnTxt} numberOfLines={1}>{slotB.name}</Text>
            <Ionicons name="swap-horizontal" size={14} color="#64748B" />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Compare button (if both slots filled) ── */}
      {ready ? null : (
        <View style={styles.hintRow}>
          <Ionicons name="information-circle-outline" size={14} color="#94A3B8" />
          <Text style={styles.hintText}>
            {!slotA && !slotB ? 'Tap a slot to search and add a product' :
             !slotA ? 'Add Product A to start comparison' :
             'Add Product B to complete comparison'}
          </Text>
        </View>
      )}

      {/* ── Comparison Results ── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.results}
        showsVerticalScrollIndicator={false}
      >
        {!ready ? (
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 56 }}>⚖️</Text>
            <Text style={styles.emptyTitle}>No comparison yet</Text>
            <Text style={styles.emptySub}>
              Add two products using the slots above to see a detailed side-by-side analysis.
            </Text>
          </View>
        ) : (
          <>
            {/* Winner banner */}
            <View style={styles.winnerBanner}>
              <View style={styles.winnerLeft}>
                <Text style={styles.winnerIcon}>🏆</Text>
                <View>
                  <Text style={styles.winnerLabel}>Better Choice</Text>
                  <Text style={styles.winnerName} numberOfLines={1}>
                    {analyses[betterIdx].product.name}
                  </Text>
                </View>
              </View>
              <View style={[styles.winnerScore, { borderColor: analyses[betterIdx].scoreColor }]}>
                <Text style={[styles.winnerScoreNum, { color: analyses[betterIdx].scoreColor }]}>
                  {analyses[betterIdx].score}
                </Text>
              </View>
            </View>

            {/* Score cards */}
            <View style={styles.scoreCards}>
              {analyses.map((a, idx) => {
                const isWinner = idx === betterIdx;
                return (
                  <View key={a.product.id} style={[styles.scoreCard, isWinner && styles.scoreCardWinner]}>
                    {isWinner && (
                      <View style={styles.bestTag}>
                        <Text style={styles.bestTagTxt}>BEST ✓</Text>
                      </View>
                    )}
                    {a.product.images?.front ? (
                      <Image source={{ uri: a.product.images.front }} style={styles.cardImg} />
                    ) : (
                      <View style={styles.cardImgPlaceholder}>
                        <Ionicons name="cube-outline" size={28} color="#CBD5E1" />
                      </View>
                    )}
                    <View style={[styles.cardScoreBubble, { borderColor: a.scoreColor }]}>
                      <Text style={[styles.cardScoreNum, { color: a.scoreColor }]}>{a.score}</Text>
                    </View>
                    <Text style={styles.cardGrade}>{a.grade}</Text>
                    <Text style={styles.cardName} numberOfLines={2}>{a.product.name}</Text>
                    <Text style={styles.cardBrand} numberOfLines={1}>{a.product.brand || ''}</Text>
                  </View>
                );
              })}
            </View>

            {/* Nutrition table */}
            <View style={styles.tableCard}>
              <Text style={styles.tableTitle}>Nutrition Comparison</Text>
              {/* Column labels */}
              <View style={styles.colLabelRow}>
                <View style={{ flex: 2 }} />
                {analyses.map((a, i) => (
                  <View key={i} style={styles.colLabel}>
                    <Text style={styles.colLabelTxt} numberOfLines={1}>
                      {a.product.name.split(' ')[0]}
                    </Text>
                  </View>
                ))}
              </View>
              <NutRow icon="medical-outline"       label="Sugar"       values={analyses.map(a => fmtG(a.product.nutrition?.sugar))}         better={lower(analyses, a => a.product.nutrition?.sugar)} />
              <NutRow icon="water-outline"         label="Sodium"      values={analyses.map(a => fmtMg(a.product.nutrition?.sodium))}        better={lower(analyses, a => a.product.nutrition?.sodium)} />
              <NutRow icon="fast-food-outline"     label="Total Fat"   values={analyses.map(a => fmtG(a.product.nutrition?.fat))}            better={lower(analyses, a => a.product.nutrition?.fat)} />
              <NutRow icon="alert-circle-outline"  label="Sat. Fat"    values={analyses.map(a => fmtG(a.product.nutrition?.saturatedFat))}   better={lower(analyses, a => a.product.nutrition?.saturatedFat)} />
              <NutRow icon="fitness-outline"       label="Protein"     values={analyses.map(a => fmtG(a.product.nutrition?.protein))}        better={higher(analyses, a => a.product.nutrition?.protein)} />
              <NutRow icon="leaf-outline"          label="Fiber"       values={analyses.map(a => fmtG(a.product.nutrition?.fiber))}          better={higher(analyses, a => a.product.nutrition?.fiber)} />
              <NutRow icon="flash-outline"         label="Energy"      values={analyses.map(a => fmtKcal(a.product.nutrition?.energy))}      better={lower(analyses, a => a.product.nutrition?.energy)} />
              <NutRow icon="flask-outline"         label="Ingredients" values={analyses.map(a => String(a.product.ingredients?.length || 0))} better={lower(analyses, a => a.product.ingredients?.length || 0)} />
              <NutRow icon="warning-outline"       label="Risky Ingr." values={analyses.map(a => String(a.classified.filter(i => i.color === 'red').length))} better={lower(analyses, a => a.classified.filter(i => i.color === 'red').length)} last />
            </View>

            {/* Ingredient breakdown */}
            <View style={styles.tableCard}>
              <Text style={styles.tableTitle}>Ingredient Breakdown</Text>
              {analyses.map((a, idx) => {
                const green  = a.classified.filter(i => i.color === 'green').length;
                const yellow = a.classified.filter(i => i.color === 'yellow').length;
                const red    = a.classified.filter(i => i.color === 'red').length;
                const total  = a.classified.length;
                return (
                  <View key={idx} style={styles.breakdownBlock}>
                    <View style={styles.breakdownHeader}>
                      <Text style={styles.breakdownName} numberOfLines={1}>{a.product.name}</Text>
                      <Text style={styles.breakdownCount}>{total} ingredients</Text>
                    </View>
                    <View style={styles.breakdownBar}>
                      {green  > 0 && <View style={[styles.barSeg, { flex: green,  backgroundColor: '#22C55E' }]} />}
                      {yellow > 0 && <View style={[styles.barSeg, { flex: yellow, backgroundColor: '#F59E0B' }]} />}
                      {red    > 0 && <View style={[styles.barSeg, { flex: red,    backgroundColor: '#EF4444' }]} />}
                    </View>
                    <View style={styles.breakdownPills}>
                      {green  > 0 && <View style={[styles.breakdownPill, { backgroundColor: '#DCFCE7' }]}><Text style={[styles.breakdownPillTxt, { color: '#166534' }]}>✓ {green} Safe</Text></View>}
                      {yellow > 0 && <View style={[styles.breakdownPill, { backgroundColor: '#FEF9C3' }]}><Text style={[styles.breakdownPillTxt, { color: '#854D0E' }]}>⚠ {yellow} Caution</Text></View>}
                      {red    > 0 && <View style={[styles.breakdownPill, { backgroundColor: '#FEE2E2' }]}><Text style={[styles.breakdownPillTxt, { color: '#991B1B' }]}>✕ {red} Risky</Text></View>}
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ── Search Modal ── */}
      <ProductSearchModal
        visible={pickingSlot !== null}
        onClose={() => setPickingSlot(null)}
        onSelect={handleSelect}
        excludeId={pickingSlot === 'A' ? slotB?.id : slotA?.id}
        allProducts={allProducts}
      />
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function NutRow({ icon, label, values, better, last }) {
  return (
    <View style={[table.row, !last && table.rowBorder]}>
      <Ionicons name={icon} size={14} color="#94A3B8" style={{ marginRight: 6 }} />
      <Text style={table.label}>{label}</Text>
      {values.map((val, i) => (
        <View key={i} style={[table.cell, i === better && table.cellBetter]}>
          <Text style={[table.value, i === better && table.valueBetter]}>{val}</Text>
          {i === better && <Text style={table.checkmark}>✓</Text>}
        </View>
      ))}
    </View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtG(v)    { return v != null ? `${v}g`   : '—'; }
function fmtMg(v)   { return v != null ? `${v}mg`  : '—'; }
function fmtKcal(v) { return v != null ? `${v}`    : '—'; }

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

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8,
  },
  title:    { fontSize: 30, fontWeight: '800', color: '#0F172A', letterSpacing: -0.8 },
  subtitle: { fontSize: 13, color: '#94A3B8', marginTop: 2, fontWeight: '500' },
  clearAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: '#FEF2F2', borderRadius: 20, borderWidth: 1, borderColor: '#FECACA',
  },
  clearAllTxt: { fontSize: 12, fontWeight: '700', color: '#EF4444' },

  slotsRow: {
    flexDirection: 'row', alignItems: 'stretch',
    paddingHorizontal: 16, marginTop: 4, gap: 0,
  },
  vsDivider: {
    width: 36, alignItems: 'center', justifyContent: 'center',
  },
  vsText: { fontSize: 13, fontWeight: '900', color: '#CBD5E1', letterSpacing: 1 },

  compactPickerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingVertical: 8, gap: 12,
  },
  compactPickerBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#F1F5F9', paddingVertical: 10, paddingHorizontal: 16,
    borderRadius: 20, borderWidth: 1, borderColor: '#E2E8F0',
  },
  compactPickerBtnTxt: { fontSize: 13, fontWeight: '700', color: '#334155', flexShrink: 1 },
  compactVs: { fontSize: 12, fontWeight: '900', color: '#94A3B8' },

  hintRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 24, marginTop: 8,
  },
  hintText: { fontSize: 12, color: '#94A3B8', fontWeight: '500', flex: 1 },

  results: { paddingHorizontal: 16, paddingTop: 16 },

  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#1E293B', textAlign: 'center' },
  emptySub:   { fontSize: 14, color: '#94A3B8', textAlign: 'center', lineHeight: 20 },

  winnerBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#F0FDF4', borderRadius: 20, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: '#BBF7D0',
  },
  winnerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  winnerIcon: { fontSize: 28 },
  winnerLabel: { fontSize: 10, fontWeight: '700', color: '#166534', textTransform: 'uppercase', letterSpacing: 0.5 },
  winnerName:  { fontSize: 16, fontWeight: '800', color: '#14532D', marginTop: 2, flex: 1 },
  winnerScore: { width: 52, height: 52, borderRadius: 26, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  winnerScoreNum: { fontSize: 20, fontWeight: '900' },

  scoreCards:  { flexDirection: 'row', gap: 12, marginBottom: 16 },
  scoreCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16,
    alignItems: 'center', gap: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 3,
    borderWidth: 2, borderColor: '#F1F5F9',
  },
  scoreCardWinner: { borderColor: '#86EFAC', backgroundColor: '#F0FDF4' },
  bestTag: {
    position: 'absolute', top: 0, right: 0,
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: '#22C55E', borderTopRightRadius: 20, borderBottomLeftRadius: 14,
  },
  bestTagTxt: { fontSize: 9, fontWeight: '800', color: '#FFF', letterSpacing: 0.5 },
  cardImg: { width: 60, height: 60, borderRadius: 14 },
  cardImgPlaceholder: {
    width: 60, height: 60, borderRadius: 14,
    backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center',
  },
  cardScoreBubble: {
    width: 48, height: 48, borderRadius: 24, borderWidth: 2.5,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF',
  },
  cardScoreNum: { fontSize: 18, fontWeight: '900' },
  cardGrade:    { fontSize: 10, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase' },
  cardName:     { fontSize: 12, fontWeight: '800', color: '#1E293B', textAlign: 'center' },
  cardBrand:    { fontSize: 11, color: '#94A3B8', fontWeight: '500' },

  tableCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 2,
  },
  tableTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A', marginBottom: 16 },
  colLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  colLabel: { minWidth: 68, alignItems: 'center', marginLeft: 8 },
  colLabelTxt: { fontSize: 11, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase' },

  breakdownBlock: { marginBottom: 16 },
  breakdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  breakdownName:  { fontSize: 13, fontWeight: '700', color: '#1E293B', flex: 1 },
  breakdownCount: { fontSize: 12, color: '#94A3B8', fontWeight: '500' },
  breakdownBar: { flexDirection: 'row', borderRadius: 8, overflow: 'hidden', height: 10, gap: 2, marginBottom: 10 },
  barSeg: { borderRadius: 4 },
  breakdownPills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  breakdownPill:  { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  breakdownPillTxt: { fontSize: 11, fontWeight: '700' },
});

const slot = StyleSheet.create({
  empty: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 2,
    borderColor: '#E2E8F0', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', paddingVertical: 28, gap: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
  },
  plusCircle: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#C7D2FE',
  },
  emptyLabel: { fontSize: 14, fontWeight: '700', color: '#64748B' },
  emptyHint:  { fontSize: 11, color: '#94A3B8', fontWeight: '500' },

  filled: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 2,
    borderColor: '#C7D2FE', paddingVertical: 16, paddingHorizontal: 12,
    alignItems: 'center', gap: 6, position: 'relative',
    shadowColor: '#6366F1', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.09, shadowRadius: 10, elevation: 3,
  },
  removeBtn: {
    position: 'absolute', top: 8, right: 8, zIndex: 10,
  },
  img: { width: 56, height: 56, borderRadius: 14 },
  imgPlaceholder: {
    width: 56, height: 56, borderRadius: 14,
    backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center',
  },
  scoreBubble: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 2.5,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF',
  },
  scoreNum: { fontSize: 16, fontWeight: '900' },
  name:  { fontSize: 11, fontWeight: '800', color: '#1E293B', textAlign: 'center' },
  brand: { fontSize: 10, color: '#94A3B8', fontWeight: '500' },
});

const table = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  label: { fontSize: 13, fontWeight: '600', color: '#475569', flex: 2 },
  cell: {
    minWidth: 68, paddingVertical: 6, paddingHorizontal: 8,
    borderRadius: 10, alignItems: 'center', marginLeft: 8,
    backgroundColor: '#F8FAFC', flexDirection: 'row', gap: 4, justifyContent: 'center',
  },
  cellBetter: { backgroundColor: '#DCFCE7' },
  value:      { fontSize: 13, fontWeight: '800', color: '#334155' },
  valueBetter:{ color: '#166534' },
  checkmark:  { fontSize: 10, color: '#22C55E', fontWeight: '800' },
});

const modal = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    padding: 20, paddingTop: 24, borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  headerLeft: { flex: 1 },
  title:  { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  sub:    { fontSize: 13, color: '#94A3B8', marginTop: 2, fontWeight: '500' },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#E2E8F0',
  },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', margin: 16, borderRadius: 16,
    borderWidth: 1.5, borderColor: '#E2E8F0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  searchInput: {
    flex: 1, paddingHorizontal: 12, paddingVertical: 14,
    fontSize: 15, color: '#0F172A', fontWeight: '500',
  },

  emptyWrap: { alignItems: 'center', paddingTop: 80, gap: 10, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B', textAlign: 'center' },
  emptySub:   { fontSize: 14, color: '#94A3B8', textAlign: 'center', lineHeight: 20 },

  productRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: '#F1F5F9',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  productImg: { width: 48, height: 48, borderRadius: 12 },
  productImgPlaceholder: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center',
  },
  productName:  { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  productBrand: { fontSize: 12, color: '#94A3B8', marginTop: 2, fontWeight: '500' },
  scorePill: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF',
  },
  scorePillTxt: { fontSize: 13, fontWeight: '900' },
});
