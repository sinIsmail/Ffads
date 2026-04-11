// Ffads — AI Card Preview (compact, for scanner list)
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing, borderRadius, shadows } from '../theme/spacing';
import { calculateScore, getScoreColor } from '../utils/scoring';
import { classifyIngredients } from '../utils/ingredientDictionary';

export default function AICardPreview({ product, onPress }) {
  const [dynamicImage, setDynamicImage] = React.useState(null);

  React.useEffect(() => {
    let isMounted = true;
    if (!product.images?.front && !product.frontPhotoBase64 && product.barcode) {
      // Background fetch thumbnail if it was dropped from memory during Supabase caching
      fetch(`https://world.openfoodfacts.org/api/v2/product/${product.barcode}?fields=image_front_url`)
        .then(res => res.json())
        .then(json => {
          if (isMounted && json.status === 1 && json.product?.image_front_url) {
            setDynamicImage(json.product.image_front_url);
          }
        })
        .catch(() => {});
    }
    return () => { isMounted = false; };
  }, [product.barcode, product.images, product.frontPhotoBase64]);

  const classified = classifyIngredients(product.ingredients || []);
  const { score } = calculateScore({
    nutrition: product.nutrition,
    classifiedIngredients: classified,
  });
  const scoreColor = getScoreColor(score);

  const timeAgo = getTimeAgo(product.scannedAt);

  const displayImage = product.images?.front 
    || dynamicImage 
    || (product.frontPhotoBase64 ? `data:image/jpeg;base64,${product.frontPhotoBase64}` : null);

  return (
    <TouchableOpacity
      style={[styles.card, shadows.sm]}
      onPress={() => onPress?.(product)}
      activeOpacity={0.7}
    >
      {/* Left: Product image or placeholder */}
      <View style={[styles.imageContainer, { borderColor: scoreColor + '30' }]}>
        {displayImage ? (
          <Image source={{ uri: displayImage }} style={styles.image} />
        ) : (
          <Text style={styles.placeholder}>📦</Text>
        )}
      </View>

      {/* Middle: Product info */}
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{product.name}</Text>
        <Text style={styles.brand} numberOfLines={1}>{product.brand}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.time}>{timeAgo}</Text>
        </View>
      </View>

      {/* Right: Score */}
      <View style={[styles.scoreCircle, { borderColor: scoreColor }]}>
        <Text style={[styles.scoreText, { color: scoreColor }]}>{score}</Text>
      </View>
    </TouchableOpacity>
  );
}

function getTimeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now - date) / 1000);

  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return 'Yesterday';
  return `${Math.floor(diff / 86400)}d ago`;
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    marginHorizontal: spacing.lg,
    marginVertical: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    gap: 12,
  },
  imageContainer: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#EAE8E3',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    width: 52,
    height: 52,
    borderRadius: 16,
  },
  placeholder: {
    fontSize: 24,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 2,
  },
  brand: {
    fontSize: 12,
    fontWeight: '500',
    color: '#999',
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  verdictPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  verdictText: {
    fontSize: 10,
    fontWeight: '700',
  },
  time: {
    fontSize: 11,
    fontWeight: '500',
    color: '#999',
  },
  scoreCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  scoreText: {
    fontSize: 16,
    fontWeight: '800',
  },
});
