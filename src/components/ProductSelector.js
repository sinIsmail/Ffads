// Ffads — Product Selector (for Compare tab)
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, FlatList } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing, borderRadius, shadows } from '../theme/spacing';
import { useProducts } from '../store/ProductContext';
import { calculateScore, getScoreColor } from '../utils/scoring';
import { classifyIngredients } from '../utils/ingredientDictionary';

export default function ProductSelector({ selectedIds = [], onToggle }) {
  const { productState } = useProducts();
  const products = productState.products;

  const renderItem = ({ item }) => {
    const isSelected = selectedIds.includes(item.id);
    const classified = classifyIngredients(item.ingredients || []);
    const { score } = calculateScore({ nutrition: item.nutrition, classifiedIngredients: classified });
    const scoreColor = getScoreColor(score);

    return (
      <TouchableOpacity
        style={[
          styles.item,
          isSelected && styles.itemSelected,
          isSelected && { borderColor: colors.primary },
        ]}
        onPress={() => onToggle?.(item.id)}
        activeOpacity={0.7}
      >
        {isSelected && (
          <View style={styles.checkmark}>
            <Text style={styles.checkmarkText}>✓</Text>
          </View>
        )}
        
        <View style={styles.imageBox}>
          {item.images?.front ? (
            <Image source={{ uri: item.images.front }} style={styles.image} />
          ) : (
            <Text style={styles.placeholder}>📦</Text>
          )}
        </View>

        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.brand} numberOfLines={1}>{item.brand}</Text>
        <View style={[styles.scorePill, { backgroundColor: scoreColor + '15' }]}>
          <Text style={[styles.scoreText, { color: scoreColor }]}>{score}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <FlatList
      data={products}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.list}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: 10,
  },
  item: {
    width: 120,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.borderLight,
    marginRight: 10,
    ...shadows.sm,
  },
  itemSelected: {
    backgroundColor: colors.primarySoft,
  },
  checkmark: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  checkmarkText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
  },
  imageBox: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    overflow: 'hidden',
  },
  image: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.md,
  },
  placeholder: {
    fontSize: 28,
  },
  name: {
    ...typography.captionBold,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 2,
  },
  brand: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 6,
  },
  scorePill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  scoreText: {
    fontSize: 13,
    fontWeight: '800',
  },
});
