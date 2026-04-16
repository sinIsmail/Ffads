// Ffads — Compare Screen (White Niche Redesign)
import React, { useMemo, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Modal, TextInput, FlatList, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useProducts } from '../store/ProductContext';
import { calculateScore } from '../utils/scoring';
import { classifyIngredients } from '../utils/ingredientDictionary';

// ─── Design Tokens (White Niche) ─────────────────────────────────────────────
const C = {
  white:      '#FFFFFF',
  bg:         '#FFFFFF',
  ink:        '#0A0A0A',
  inkMid:     '#3D3D3D',
  inkSoft:    '#8A8A8A',
  inkFaint:   '#E8E8E8',
  inkGhost:   '#F5F5F5',
  accent:     '#0A0A0A',   // primary = black
  good:       '#16A34A',
  goodSoft:   '#F0FDF4',
  goodBorder: '#BBF7D0',
  warn:       '#CA8A04',
  warnSoft:   '#FEFCE8',
  bad:        '#DC2626',
  badSoft:    '#FEF2F2',
};

// ─── Product Search Modal ─────────────────────────────────────────────────────
function ProductSearchModal({ visible, onClose, onSelect, excludeId, allProducts }) {
  const [query, setQuery] = useState('');
  const insets = useSafeAreaInsets();

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
      <View style={[modal.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="dark-content" backgroundColor={C.white} />

        {/* Header */}
        <View style={modal.header}>
          <View style={{ flex: 1 }}>
            <Text style={modal.title}>Choose Product</Text>
            <Text style={modal.sub}>From your scan history</Text>
          </View>
          <TouchableOpacity style={modal.closeBtn} onPress={() => { setQuery(''); onClose(); }}>
            <Ionicons name="close" size={18} color={C.ink} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={modal.searchWrap}>
          <Ionicons name="search-outline" size={16} color={C.inkSoft} style={{ marginLeft: 14 }} />
          <TextInput
            style={modal.searchInput}
            placeholder="Search by name, brand or barcode…"
            placeholderTextColor={C.inkSoft}
            value={query}
            onChangeText={setQuery}
            autoFocus
            clearButtonMode="while-editing"
          />
        </View>

        {/* List */}
        {allProducts.length === 0 ? (
          <View style={modal.emptyWrap}>
            <Text style={modal.emptyIcon}>📦</Text>
            <Text style={modal.emptyTitle}>No products yet</Text>
            <Text style={modal.emptySub}>Scan some products first, then come back to compare them.</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={modal.emptyWrap}>
            <Text style={modal.emptyIcon}>🔍</Text>
            <Text style={modal.emptyTitle}>No matches</Text>
            <Text style={modal.emptySub}>Try a different name or brand.</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 80, gap: 1 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item, index }) => {
              const classified = classifyIngredients(item.ingredients || []);
              const { score, scoreColor } = calculateScore({ nutrition: item.nutrition, classifiedIngredients: classified });
              const isFirst = index === 0;
              const isLast  = index === filtered.length - 1;
              return (
                <TouchableOpacity
                  style={[
                    modal.productRow,
                    isFirst && { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
                    isLast  && { borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
                  ]}
                  onPress={() => handleSelect(item)}
                  activeOpacity={0.6}
                >
                  {item.images?.front ? (
                    <Image source={{ uri: item.images.front }} style={modal.productImg} />
                  ) : (
                    <View style={modal.productImgPlaceholder}>
                      <Ionicons name="cube-outline" size={18} color={C.inkSoft} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={modal.productName} numberOfLines={1}>{item.name}</Text>
                    <Text style={modal.productBrand} numberOfLines={1}>{item.brand || 'Unknown brand'}</Text>
                  </View>
                  {score != null && (
                    <Text style={[modal.scoreTag, { color: scoreColor }]}>{score}</Text>
                  )}
                  <Ionicons name="chevron-forward" size={14} color={C.inkFaint} />
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
      <TouchableOpacity style={slot.empty} onPress={onAdd} activeOpacity={0.7}>
        <View style={slot.plusRing}>
          <Ionicons name="add" size={22} color={C.ink} />
        </View>
        <Text style={slot.emptyLabel}>{label}</Text>
        <Text style={slot.emptyHint}>Tap to select</Text>
      </TouchableOpacity>
    );
  }
  const classified = classifyIngredients(product.ingredients || []);
  const { score, scoreColor } = calculateScore({ nutrition: product.nutrition, classifiedIngredients: classified });
  return (
    <View style={slot.filled}>
      <TouchableOpacity style={slot.removeBtn} onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="close-circle-outline" size={18} color={C.inkSoft} />
      </TouchableOpacity>
      {product.images?.front ? (
        <Image source={{ uri: product.images.front }} style={slot.img} />
      ) : (
        <View style={slot.imgPlaceholder}>
          <Ionicons name="cube-outline" size={22} color={C.inkSoft} />
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

  const [slotA, setSlotA] = useState(null);
  const [slotB, setSlotB] = useState(null);
  const [pickingSlot, setPickingSlot] = useState(null);

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
      <StatusBar barStyle="dark-content" backgroundColor={C.white} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>SIDE-BY-SIDE</Text>
          <Text style={styles.title}>Compare</Text>
        </View>
        {(slotA || slotB) && (
          <TouchableOpacity style={styles.clearAllBtn} onPress={clearAll}>
            <Text style={styles.clearAllTxt}>Clear all</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.divider} />

      {/* ── Slot Row ── */}
      {!ready ? (
        <View style={styles.slotsRow}>
          <SlotButton label="Product A" product={slotA} onAdd={() => openPicker('A')} onRemove={() => clearSlot('A')} />
          <View style={styles.vsDivider}><Text style={styles.vsText}>VS</Text></View>
          <SlotButton label="Product B" product={slotB} onAdd={() => openPicker('B')} onRemove={() => clearSlot('B')} />
        </View>
      ) : (
        <View style={styles.compactRow}>
          <TouchableOpacity style={styles.compactBtn} onPress={() => openPicker('A')} activeOpacity={0.6}>
            <Text style={styles.compactBtnTxt} numberOfLines={1}>{slotA.name}</Text>
            <Ionicons name="swap-horizontal-outline" size={13} color={C.inkSoft} />
          </TouchableOpacity>
          <Text style={styles.compactVs}>VS</Text>
          <TouchableOpacity style={styles.compactBtn} onPress={() => openPicker('B')} activeOpacity={0.6}>
            <Ionicons name="swap-horizontal-outline" size={13} color={C.inkSoft} />
            <Text style={styles.compactBtnTxt} numberOfLines={1}>{slotB.name}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Hint ── */}
      {!ready && (
        <Text style={styles.hintText}>
          {!slotA && !slotB ? 'Select two products to compare' :
           !slotA ? 'Select Product A' : 'Select Product B'}
        </Text>
      )}

      {/* ── Results ── */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.results} showsVerticalScrollIndicator={false}>
        {!ready ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>⚖️</Text>
            <Text style={styles.emptyTitle}>Nothing to compare</Text>
            <Text style={styles.emptySub}>Add two products using the slots above.</Text>
          </View>
        ) : (
          <>
            {/* Winner Banner */}
            <View style={styles.winnerBanner}>
              <View style={styles.winnerLeft}>
                <View style={styles.trophyBox}>
                  <Text style={{ fontSize: 16 }}>🏆</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.winnerLabel}>BETTER CHOICE</Text>
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

            {/* Score Cards */}
            <View style={styles.scoreCards}>
              {analyses.map((a, idx) => {
                const isWinner = idx === betterIdx;
                return (
                  <View key={a.product.id} style={[styles.scoreCard, isWinner && styles.scoreCardWinner]}>
                    {isWinner && (
                      <View style={styles.bestTag}>
                        <Text style={styles.bestTagTxt}>BEST</Text>
                      </View>
                    )}
                    {a.product.images?.front ? (
                      <Image source={{ uri: a.product.images.front }} style={styles.cardImg} />
                    ) : (
                      <View style={styles.cardImgPlaceholder}>
                        <Ionicons name="cube-outline" size={24} color={C.inkSoft} />
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

            {/* Nutrition Table */}
            <View style={styles.tableCard}>
              <Text style={styles.tableTitle}>Nutrition / 100g</Text>
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
              <NutRow icon="medical-outline"     label="Sugar"      values={analyses.map(a => fmtG(a.product.nutrition?.sugar))}         better={lower(analyses, a => a.product.nutrition?.sugar)} />
              <NutRow icon="water-outline"       label="Sodium"     values={analyses.map(a => fmtMg(a.product.nutrition?.sodium))}        better={lower(analyses, a => a.product.nutrition?.sodium)} />
              <NutRow icon="fast-food-outline"   label="Total Fat"  values={analyses.map(a => fmtG(a.product.nutrition?.fat))}            better={lower(analyses, a => a.product.nutrition?.fat)} />
              <NutRow icon="alert-circle-outline" label="Sat. Fat"  values={analyses.map(a => fmtG(a.product.nutrition?.saturatedFat))}   better={lower(analyses, a => a.product.nutrition?.saturatedFat)} />
              <NutRow icon="fitness-outline"     label="Protein"    values={analyses.map(a => fmtG(a.product.nutrition?.protein))}        better={higher(analyses, a => a.product.nutrition?.protein)} />
              <NutRow icon="leaf-outline"        label="Fiber"      values={analyses.map(a => fmtG(a.product.nutrition?.fiber))}          better={higher(analyses, a => a.product.nutrition?.fiber)} />
              <NutRow icon="flash-outline"       label="Energy"     values={analyses.map(a => fmtKcal(a.product.nutrition?.energy))}      better={lower(analyses, a => a.product.nutrition?.energy)} />
              <NutRow icon="flask-outline"       label="Ingr. Count" values={analyses.map(a => String(a.product.ingredients?.length || 0))} better={lower(analyses, a => a.product.ingredients?.length || 0)} />
              <NutRow icon="warning-outline"     label="Risky Ingr." values={analyses.map(a => String(a.classified.filter(i => i.color === 'red').length))} better={lower(analyses, a => a.classified.filter(i => i.color === 'red').length)} last />
            </View>

            {/* Ingredient Breakdown */}
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
                      <Text style={styles.breakdownCount}>{total} total</Text>
                    </View>
                    <View style={styles.breakdownBar}>
                      {green  > 0 && <View style={[styles.barSeg, { flex: green,  backgroundColor: '#22C55E' }]} />}
                      {yellow > 0 && <View style={[styles.barSeg, { flex: yellow, backgroundColor: '#F59E0B' }]} />}
                      {red    > 0 && <View style={[styles.barSeg, { flex: red,    backgroundColor: '#EF4444' }]} />}
                    </View>
                    <View style={styles.breakdownPills}>
                      {green  > 0 && <View style={[styles.breakdownPill, { backgroundColor: C.goodSoft }]}><Text style={[styles.breakdownPillTxt, { color: C.good }]}>✓ {green} Safe</Text></View>}
                      {yellow > 0 && <View style={[styles.breakdownPill, { backgroundColor: C.warnSoft }]}><Text style={[styles.breakdownPillTxt, { color: C.warn }]}>⚠ {yellow} Caution</Text></View>}
                      {red    > 0 && <View style={[styles.breakdownPill, { backgroundColor: C.badSoft  }]}><Text style={[styles.breakdownPillTxt, { color: C.bad  }]}>✕ {red} Risky</Text></View>}
                    </View>
                    {idx < analyses.length - 1 && <View style={styles.blockDivider} />}
                  </View>
                );
              })}
            </View>
          </>
        )}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Search Modal */}
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

// ─── NutRow ───────────────────────────────────────────────────────────────────
function NutRow({ icon, label, values, better, last }) {
  return (
    <View style={[table.row, !last && table.rowBorder]}>
      <Ionicons name={icon} size={13} color={C.inkSoft} style={{ marginRight: 8 }} />
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
function fmtG(v)    { return v != null ? `${v}g`  : '—'; }
function fmtMg(v)   { return v != null ? `${v}mg` : '—'; }
function fmtKcal(v) { return v != null ? `${v}`   : '—'; }

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
  root: { flex: 1, backgroundColor: C.white },

  header: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingTop: 16, paddingBottom: 16,
  },
  eyebrow: { fontSize: 10, fontWeight: '700', color: C.inkSoft, letterSpacing: 2, marginBottom: 4 },
  title:   { fontSize: 32, fontWeight: '800', color: C.ink, letterSpacing: -1 },
  clearAllBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: C.inkFaint },
  clearAllTxt: { fontSize: 12, fontWeight: '600', color: C.inkMid },
  divider: { height: 1, backgroundColor: C.inkFaint, marginHorizontal: 0 },

  slotsRow: {
    flexDirection: 'row', alignItems: 'stretch',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8, gap: 0,
  },
  vsDivider: { width: 32, alignItems: 'center', justifyContent: 'center' },
  vsText:    { fontSize: 11, fontWeight: '900', color: C.inkFaint, letterSpacing: 2 },

  compactRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14, gap: 10,
  },
  compactBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: C.inkFaint,
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12,
  },
  compactBtnTxt: { fontSize: 12, fontWeight: '700', color: C.inkMid, flex: 1 },
  compactVs: { fontSize: 11, fontWeight: '900', color: C.inkSoft },

  hintText: {
    fontSize: 12, color: C.inkSoft, fontWeight: '500',
    paddingHorizontal: 24, marginBottom: 4,
  },

  results: { paddingHorizontal: 20, paddingTop: 20 },

  emptyState: { alignItems: 'center', paddingTop: 80, gap: 12, paddingHorizontal: 32 },
  emptyIcon:  { fontSize: 48 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: C.ink },
  emptySub:   { fontSize: 14, color: C.inkSoft, textAlign: 'center', lineHeight: 20 },

  // Winner
  winnerBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.ink, borderRadius: 20, padding: 18, marginBottom: 16,
  },
  winnerLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  trophyBox: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center',
  },
  winnerLabel: { fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.5)', letterSpacing: 2, marginBottom: 3 },
  winnerName:  { fontSize: 15, fontWeight: '800', color: C.white, flex: 1 },
  winnerScore: {
    width: 50, height: 50, borderRadius: 25, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', backgroundColor: C.white,
  },
  winnerScoreNum: { fontSize: 18, fontWeight: '900' },

  // Score cards
  scoreCards: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  scoreCard: {
    flex: 1, backgroundColor: C.white, borderRadius: 20, padding: 16,
    alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: C.inkFaint,
  },
  scoreCardWinner: { borderColor: C.ink, borderWidth: 1.5 },
  bestTag: {
    position: 'absolute', top: 0, right: 0,
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: C.ink, borderTopRightRadius: 20, borderBottomLeftRadius: 14,
  },
  bestTagTxt: { fontSize: 8, fontWeight: '800', color: C.white, letterSpacing: 1 },
  cardImg: { width: 56, height: 56, borderRadius: 12, borderWidth: 1, borderColor: C.inkFaint },
  cardImgPlaceholder: {
    width: 56, height: 56, borderRadius: 12,
    backgroundColor: C.inkGhost, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.inkFaint,
  },
  cardScoreBubble: {
    width: 46, height: 46, borderRadius: 23, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', backgroundColor: C.white,
  },
  cardScoreNum: { fontSize: 17, fontWeight: '900' },
  cardGrade:    { fontSize: 9, fontWeight: '700', color: C.inkSoft, letterSpacing: 1, textTransform: 'uppercase' },
  cardName:     { fontSize: 11, fontWeight: '800', color: C.ink, textAlign: 'center', lineHeight: 15 },
  cardBrand:    { fontSize: 10, color: C.inkSoft, fontWeight: '500' },

  // Table card
  tableCard: {
    backgroundColor: C.white, borderRadius: 20, padding: 20, marginBottom: 16,
    borderWidth: 1, borderColor: C.inkFaint,
  },
  tableTitle: { fontSize: 15, fontWeight: '800', color: C.ink, marginBottom: 16, letterSpacing: -0.3 },
  colLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  colLabel:    { minWidth: 68, alignItems: 'center', marginLeft: 8 },
  colLabelTxt: { fontSize: 10, fontWeight: '700', color: C.inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Breakdown
  breakdownBlock:  { marginBottom: 8 },
  breakdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  breakdownName:   { fontSize: 13, fontWeight: '700', color: C.ink, flex: 1 },
  breakdownCount:  { fontSize: 11, color: C.inkSoft, fontWeight: '500' },
  breakdownBar:    { flexDirection: 'row', borderRadius: 6, overflow: 'hidden', height: 8, gap: 1, marginBottom: 10 },
  barSeg:          { borderRadius: 3 },
  breakdownPills:  { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  breakdownPill:   { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  breakdownPillTxt:{ fontSize: 11, fontWeight: '700' },
  blockDivider:    { height: 1, backgroundColor: C.inkFaint, marginTop: 16, marginBottom: 8 },
});

const slot = StyleSheet.create({
  empty: {
    flex: 1, backgroundColor: C.white, borderRadius: 16, borderWidth: 1.5,
    borderColor: C.inkFaint, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', paddingVertical: 32, gap: 10,
  },
  plusRing: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.inkGhost, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.inkFaint,
  },
  emptyLabel: { fontSize: 13, fontWeight: '700', color: C.inkMid },
  emptyHint:  { fontSize: 11, color: C.inkSoft, fontWeight: '500' },

  filled: {
    flex: 1, backgroundColor: C.white, borderRadius: 16, borderWidth: 1.5,
    borderColor: C.ink, paddingVertical: 16, paddingHorizontal: 12,
    alignItems: 'center', gap: 6, position: 'relative',
  },
  removeBtn:  { position: 'absolute', top: 8, right: 8, zIndex: 10 },
  img: { width: 52, height: 52, borderRadius: 12, borderWidth: 1, borderColor: C.inkFaint },
  imgPlaceholder: {
    width: 52, height: 52, borderRadius: 12,
    backgroundColor: C.inkGhost, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.inkFaint,
  },
  scoreBubble: {
    width: 42, height: 42, borderRadius: 21, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', backgroundColor: C.white,
  },
  scoreNum: { fontSize: 15, fontWeight: '900' },
  name:  { fontSize: 11, fontWeight: '800', color: C.ink, textAlign: 'center', lineHeight: 14 },
  brand: { fontSize: 10, color: C.inkSoft, fontWeight: '500' },
});

const table = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: C.inkGhost },
  label: { fontSize: 13, fontWeight: '600', color: C.inkMid, flex: 2 },
  cell: {
    minWidth: 68, paddingVertical: 7, paddingHorizontal: 8,
    borderRadius: 10, alignItems: 'center', marginLeft: 8,
    backgroundColor: C.inkGhost, flexDirection: 'row', gap: 4, justifyContent: 'center',
    borderWidth: 1, borderColor: C.inkFaint,
  },
  cellBetter:  { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  value:       { fontSize: 12, fontWeight: '800', color: C.inkMid },
  valueBetter: { color: '#15803D' },
  checkmark:   { fontSize: 10, color: '#22C55E', fontWeight: '800' },
});

const modal = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.white },
  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: C.inkFaint,
  },
  title:  { fontSize: 22, fontWeight: '800', color: C.ink, letterSpacing: -0.5 },
  sub:    { fontSize: 12, color: C.inkSoft, marginTop: 3, fontWeight: '500' },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: C.inkGhost, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.inkFaint,
  },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.inkGhost,
    marginHorizontal: 20, marginVertical: 12,
    borderRadius: 14, borderWidth: 1, borderColor: C.inkFaint,
  },
  searchInput: {
    flex: 1, paddingHorizontal: 12, paddingVertical: 14,
    fontSize: 14, color: C.ink, fontWeight: '500',
  },

  emptyWrap:  { alignItems: 'center', paddingTop: 80, gap: 10, paddingHorizontal: 32 },
  emptyIcon:  { fontSize: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: C.ink },
  emptySub:   { fontSize: 14, color: C.inkSoft, textAlign: 'center', lineHeight: 20 },

  productRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.white, padding: 14,
    borderWidth: 1, borderColor: C.inkFaint,
    borderRadius: 0,
  },
  productImg:            { width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: C.inkFaint },
  productImgPlaceholder: {
    width: 44, height: 44, borderRadius: 10,
    backgroundColor: C.inkGhost, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.inkFaint,
  },
  productName:  { fontSize: 14, fontWeight: '700', color: C.ink },
  productBrand: { fontSize: 12, color: C.inkSoft, marginTop: 2, fontWeight: '500' },
  scoreTag:     { fontSize: 14, fontWeight: '900', marginRight: 4 },
});
