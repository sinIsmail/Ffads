// Ffads — Profile: Contributions Tab (My OFF uploads with ingredients table)
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getUserContributions } from '../../services/supabase';

export default function ContributionsTab({ userEmail }) {
  const [contributions, setContributions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const data = await getUserContributions(userEmail || null, 50);
      setContributions(data);
      setLoading(false);
    }
    load();
  }, [userEmail]);

  if (loading) {
    return (
      <View style={cs.center}>
        <ActivityIndicator size="large" color="#1A1A1A" />
        <Text style={cs.loadingText}>Loading contributions…</Text>
      </View>
    );
  }

  if (contributions.length === 0) {
    return (
      <View style={cs.emptyCard}>
        <Text style={cs.emptyEmoji}>📤</Text>
        <Text style={cs.emptyTitle}>No contributions yet</Text>
        <Text style={cs.emptyDesc}>
          {userEmail
            ? `No contributions found for ${userEmail}. When you upload products to Open Food Facts, they'll appear here.`
            : 'Sign in with Supabase or contribute a product to see your upload history here.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={cs.container}>
      <Text style={cs.summaryText}>
        {contributions.length} product{contributions.length !== 1 ? 's' : ''} contributed
      </Text>

      {contributions.map((c, idx) => {
        // Try dedicated ingredients column, fall back to gemini_filtered_data
        let ingredients = Array.isArray(c.ingredients) ? c.ingredients : [];
        if (ingredients.length === 0 && c.gemini_filtered_data?.ingredients) {
          ingredients = Array.isArray(c.gemini_filtered_data.ingredients)
            ? c.gemini_filtered_data.ingredients
            : [];
        }
        const date = new Date(c.created_at);
        const timeStr = date.toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric',
        }) + '  ' + date.toLocaleTimeString('en-US', {
          hour: '2-digit', minute: '2-digit',
        });

        return (
          <View key={c.id || idx} style={cs.card}>
            {/* Header */}
            <View style={cs.cardHeader}>
              <View style={cs.productInfo}>
                <Text style={cs.productName} numberOfLines={1}>
                  {c.product_name || 'Unknown Product'}
                </Text>
                <Text style={cs.barcode}>{c.barcode}</Text>
              </View>
              <View style={cs.badgeRow}>
                {c.front_photo_uploaded && (
                  <View style={[cs.badge, { backgroundColor: '#DBEAFE' }]}>
                    <Ionicons name="image-outline" size={10} color="#2563EB" />
                    <Text style={[cs.badgeText, { color: '#2563EB' }]}>Photo</Text>
                  </View>
                )}
                {c.back_photo_ocrd && (
                  <View style={[cs.badge, { backgroundColor: '#E0E7FF' }]}>
                    <Ionicons name="scan-outline" size={10} color="#4338CA" />
                    <Text style={[cs.badgeText, { color: '#4338CA' }]}>OCR</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Contributor & time */}
            <View style={cs.metaRow}>
              <Ionicons name="person-outline" size={12} color="#999" />
              <Text style={cs.metaText}>{c.contributor_email || 'Guest'}</Text>
              <Text style={cs.metaDot}>·</Text>
              <Ionicons name="time-outline" size={12} color="#999" />
              <Text style={cs.metaText}>{timeStr}</Text>
            </View>

            {/* Ingredients Table */}
            {ingredients.length > 0 ? (
              <View style={cs.tableWrap}>
                <View style={cs.tableHeader}>
                  <Text style={cs.tableHeaderCell}>#</Text>
                  <Text style={[cs.tableHeaderCell, { flex: 1 }]}>Ingredient</Text>
                </View>
                {ingredients.slice(0, 15).map((ing, i) => (
                  <View key={i} style={[cs.tableRow, i % 2 === 0 && cs.tableRowAlt]}>
                    <Text style={cs.tableCellNum}>{i + 1}</Text>
                    <Text style={[cs.tableCell, { flex: 1 }]} numberOfLines={1}>{ing}</Text>
                  </View>
                ))}
                {ingredients.length > 15 && (
                  <Text style={cs.moreText}>+{ingredients.length - 15} more ingredients</Text>
                )}
              </View>
            ) : (
              <View style={cs.noIngRow}>
                <Ionicons name="leaf-outline" size={14} color="#999" />
                <Text style={cs.noIngText}>No ingredients data</Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const cs = StyleSheet.create({
  container: { gap: 16 },
  center: { alignItems: 'center', paddingVertical: 40 },
  loadingText: { fontSize: 14, color: '#999', marginTop: 12 },

  summaryText: {
    fontSize: 13, fontWeight: '700', color: '#999',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 4,
  },

  emptyCard: {
    backgroundColor: '#FFFFFF', borderRadius: 24,
    padding: 32, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05, shadowRadius: 12, elevation: 2,
  },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A', marginBottom: 8 },
  emptyDesc: { fontSize: 14, color: '#999', textAlign: 'center', lineHeight: 20 },

  card: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)',
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 8,
  },
  productInfo: { flex: 1, marginRight: 8 },
  productName: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  barcode: { fontSize: 12, color: '#999', marginTop: 2, fontFamily: 'monospace' },

  badgeRow: { flexDirection: 'row', gap: 6 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12,
  },
  badgeText: { fontSize: 10, fontWeight: '700' },

  metaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)',
    marginBottom: 8,
  },
  metaText: { fontSize: 12, color: '#999' },
  metaDot: { fontSize: 12, color: '#CCC' },

  tableWrap: {
    borderRadius: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
  },
  tableHeader: {
    flexDirection: 'row', backgroundColor: '#F5F5F0',
    paddingVertical: 8, paddingHorizontal: 12,
  },
  tableHeaderCell: {
    fontSize: 11, fontWeight: '800', color: '#666',
    textTransform: 'uppercase', letterSpacing: 0.5,
    width: 30,
  },
  tableRow: {
    flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 12,
  },
  tableRowAlt: { backgroundColor: '#FAFAF8' },
  tableCellNum: {
    fontSize: 12, color: '#999', width: 30, fontWeight: '600',
  },
  tableCell: {
    fontSize: 13, color: '#1A1A1A', fontWeight: '500',
  },
  moreText: {
    fontSize: 12, color: '#999', fontStyle: 'italic',
    textAlign: 'center', paddingVertical: 8,
  },

  noIngRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8,
  },
  noIngText: { fontSize: 13, color: '#999' },
});
