// Ffads — Nutrition Table Component
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing, borderRadius } from '../theme/spacing';
import { WHO_THRESHOLDS } from '../utils/constants';

const NUTRITION_ROWS = [
  { key: 'energy', label: 'Energy', unit: 'kcal', icon: '🔥' },
  { key: 'protein', label: 'Protein', unit: 'g', icon: '💪' },
  { key: 'carbs', label: 'Carbohydrates', unit: 'g', icon: '🍞' },
  { key: 'sugar', label: 'Sugar', unit: 'g', icon: '🍬', threshold: WHO_THRESHOLDS.sugar },
  { key: 'fat', label: 'Total Fat', unit: 'g', icon: '🧈', threshold: WHO_THRESHOLDS.fat },
  { key: 'saturatedFat', label: 'Saturated Fat', unit: 'g', icon: '🥓', threshold: WHO_THRESHOLDS.saturatedFat },
  { key: 'fiber', label: 'Fiber', unit: 'g', icon: '🌿', isBonus: true },
  { key: 'sodium', label: 'Sodium', unit: 'mg', icon: '🧂', threshold: WHO_THRESHOLDS.sodium },
];

export default function NutritionTable({ nutrition }) {
  if (!nutrition) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Nutrition Facts</Text>
      <Text style={styles.subtitle}>Per 100g serving</Text>

      <View style={styles.table}>
        {NUTRITION_ROWS.map((row, idx) => {
          const value = nutrition[row.key];
          if (value == null) return null;

          const level = row.threshold ? getLevel(value, row.threshold, row.isBonus) : null;

          return (
            <View key={row.key} style={[styles.row, idx % 2 === 0 && styles.rowEven]}>
              <View style={styles.rowLeft}>
                <Text style={styles.icon}>{row.icon}</Text>
                <Text style={styles.label}>{row.label}</Text>
              </View>
              <View style={styles.rowRight}>
                <Text style={styles.value}>
                  {typeof value === 'number' ? value.toFixed(1) : value} {row.unit}
                </Text>
                {level && (
                  <View style={[styles.levelBadge, { backgroundColor: level.bg }]}>
                    <Text style={[styles.levelText, { color: level.color }]}>{level.label}</Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function getLevel(value, threshold, isBonus = false) {
  if (isBonus) {
    if (value >= 6) return { label: 'Excellent', color: colors.ingredientGreen, bg: colors.ingredientGreenBg };
    if (value >= 3) return { label: 'Good', color: colors.ingredientGreen, bg: colors.ingredientGreenBg };
    return null;
  }

  if (value > (threshold.high || Infinity)) return { label: 'High', color: colors.ingredientRed, bg: colors.ingredientRedBg };
  if (value > (threshold.medium || threshold.low)) return { label: 'Med', color: colors.ingredientYellow, bg: colors.ingredientYellowBg };
  if (value <= (threshold.low || 0)) return { label: 'Low', color: colors.ingredientGreen, bg: colors.ingredientGreenBg };
  return null;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    ...typography.h4,
    color: colors.text,
    marginBottom: 2,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  table: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  rowEven: {
    backgroundColor: colors.surfaceMuted,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  icon: {
    fontSize: 16,
    width: 22,
  },
  label: {
    ...typography.body,
    color: colors.text,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  value: {
    ...typography.bodyBold,
    color: colors.text,
    minWidth: 70,
    textAlign: 'right',
  },
  levelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    minWidth: 38,
    alignItems: 'center',
  },
  levelText: {
    fontSize: 10,
    fontWeight: '700',
  },
});
