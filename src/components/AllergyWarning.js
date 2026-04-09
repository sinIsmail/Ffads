// Ffads — Allergy Warning Component
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing, borderRadius } from '../theme/spacing';

export default function AllergyWarning({ warnings }) {
  if (!warnings || warnings.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.icon}>🚨</Text>
        <Text style={styles.title}>Allergy Alert!</Text>
      </View>
      
      {warnings.map((warning, idx) => (
        <View key={idx} style={styles.warningRow}>
          <Text style={styles.emoji}>{warning.allergenEmoji}</Text>
          <View style={styles.warningContent}>
            <Text style={styles.allergenName}>Contains {warning.allergenLabel}</Text>
            <Text style={styles.matchedIngredient}>
              Found in: {warning.matchedIngredient}
            </Text>
          </View>
          <View style={styles.avoidBadge}>
            <Text style={styles.avoidText}>AVOID</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FEF2F2',
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 2,
    borderColor: '#FECACA',
    borderStyle: 'dashed',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  icon: {
    fontSize: 20,
  },
  title: {
    ...typography.h4,
    color: colors.danger,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: borderRadius.md,
    marginBottom: 8,
    gap: 10,
  },
  emoji: {
    fontSize: 24,
  },
  warningContent: {
    flex: 1,
  },
  allergenName: {
    ...typography.bodyBold,
    color: colors.danger,
  },
  matchedIngredient: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  avoidBadge: {
    backgroundColor: colors.danger,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  avoidText: {
    ...typography.badge,
    color: '#FFFFFF',
  },
});
