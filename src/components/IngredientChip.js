// Ffads — Ingredient Chip Component
import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { borderRadius } from '../theme/spacing';

const COLOR_MAP = {
  green: { bg: colors.ingredientGreenBg, text: colors.ingredientGreen, border: colors.ingredientGreen + '40' },
  yellow: { bg: colors.ingredientYellowBg, text: colors.ingredientYellow, border: colors.ingredientYellow + '40' },
  red: { bg: colors.ingredientRedBg, text: colors.ingredientRed, border: colors.ingredientRed + '40' },
};

export default function IngredientChip({ ingredient, onPress }) {
  const colorScheme = COLOR_MAP[ingredient.color] || COLOR_MAP.yellow;

  return (
    <TouchableOpacity
      style={[
        styles.chip,
        {
          backgroundColor: colorScheme.bg,
          borderColor: colorScheme.border,
        },
      ]}
      onPress={() => onPress?.(ingredient)}
      activeOpacity={0.7}
    >
      <Text style={[styles.dot, { color: colorScheme.text }]}>●</Text>
      <Text style={[styles.label, { color: colorScheme.text }]} numberOfLines={1}>
        {ingredient.name}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    margin: 3,
    gap: 6,
  },
  dot: {
    fontSize: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    maxWidth: 150,
  },
});
