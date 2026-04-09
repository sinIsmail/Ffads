// Ffads — Verdict Badge Component
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getVerdict } from '../utils/scoring';
import { borderRadius } from '../theme/spacing';

export default function VerdictBadge({ score, style }) {
  const verdict = getVerdict(score);

  return (
    <View style={[styles.badge, { backgroundColor: verdict.color + '18' }, style]}>
      <Text style={styles.emoji}>{verdict.emoji}</Text>
      <Text style={[styles.label, { color: verdict.color }]}>{verdict.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    gap: 6,
  },
  emoji: {
    fontSize: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
