import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { spacing, borderRadius, shadows } from '../theme/spacing';
import { typography } from '../theme/typography';
import { listPersonalProducts, deletePersonalProduct } from '../services/supabase/personalProducts';
import { useUser } from '../store/UserContext';
import { useProducts } from '../store/ProductContext';

export default function MyQrScreen({ navigation }) {
  const { userPrefs } = useUser();
  const { productDispatch } = useProducts();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadProducts = useCallback(async () => {
    if (!userPrefs.email) {
      setProducts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const data = await listPersonalProducts(userPrefs.email);
    setProducts(data);
    setLoading(false);
  }, [userPrefs.email]);

  useFocusEffect(
    useCallback(() => {
      loadProducts().catch(() => setLoading(false));
    }, [loadProducts])
  );

  const handleProductPress = useCallback((personalProduct) => {
    // Transform personal product into standard product shape
    const standardProduct = {
      id: `personal_${personalProduct.id}`,
      barcode: personalProduct.ffadzCode || null,
      name: personalProduct.name,
      brand: personalProduct.brand || 'Personal Product',
      category: 'Personal QR',
      images: {
        front: personalProduct.images?.front || null,
        ingredients: personalProduct.images?.ingredients || null,
        nutrition: personalProduct.images?.nutrition || null,
      },
      ingredients: personalProduct.ingredients || [],
      nutrition: personalProduct.nutrition || {},
      scannedAt: new Date().toISOString(),
      analyzed: false,
      aiInsight: null,
      source: 'personal_qr',
      personalProductId: personalProduct.id,
      ffadzCode: personalProduct.ffadzCode || null,
    };

    productDispatch({ type: 'ADD_PRODUCT', payload: standardProduct });
    navigation.navigate('ProductDetail', { productId: standardProduct.id });
  }, [navigation, productDispatch]);

  const handleDeleteProduct = useCallback((product) => {
    Alert.alert(
      'Delete QR Product',
      `Are you sure you want to delete "${product.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            const result = await deletePersonalProduct(product.id);
            if (result.success) {
              setProducts((prev) => prev.filter((p) => p.id !== product.id));
              // Attempt to remove from context history if applicable
              // If the store supports REMOVE_PRODUCT, this will clean up the local cache
              productDispatch({ type: 'REMOVE_PRODUCT', payload: `personal_${product.id}` });
            } else {
              Alert.alert('Delete Failed', result.error || 'Could not delete product.');
            }
            setLoading(false);
          },
        },
      ]
    );
  }, [productDispatch]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>My QR</Text>
            <Text style={styles.subtitle}>Create personal FFADZ product codes and manage your QR catalog.</Text>
          </View>
          <TouchableOpacity style={styles.createBtn} onPress={() => navigation.navigate('CreateQrProduct')} activeOpacity={0.85}>
            <Ionicons name="add" size={18} color="#FFF" />
            <Text style={styles.createBtnText}>New QR</Text>
          </TouchableOpacity>
        </View>

        {!userPrefs.email ? (
          <View style={styles.card}>
            <Ionicons name="lock-closed-outline" size={28} color="#4338CA" />
            <Text style={styles.cardTitle}>Sign in to create QR products</Text>
            <Text style={styles.cardText}>
              Personal QR products are tied to your Supabase account so your uploads, images, and scan history stay with you.
            </Text>
            <TouchableOpacity style={styles.primaryAction} onPress={() => navigation.navigate('Login')} activeOpacity={0.85}>
              <Text style={styles.primaryActionText}>Sign In</Text>
            </TouchableOpacity>
          </View>
        ) : loading ? (
          <View style={styles.card}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.cardText}>Loading your QR products...</Text>
          </View>
        ) : products.length === 0 ? (
          <View style={styles.card}>
            <Ionicons name="qr-code-outline" size={36} color="#0F766E" />
            <Text style={styles.cardTitle}>No QR products yet</Text>
            <Text style={styles.cardText}>
              Upload your own product, add ingredients and nutrition, and the app will generate a unique FFADZ QR code for it.
            </Text>
            <TouchableOpacity style={styles.primaryAction} onPress={() => navigation.navigate('CreateQrProduct')} activeOpacity={0.85}>
              <Text style={styles.primaryActionText}>Create My First QR</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.list}>
            {products.map((product) => (
              <TouchableOpacity
                key={product.id}
                style={styles.productCard}
                onPress={() => handleProductPress(product)}
                activeOpacity={0.85}
              >
                {product.images.front ? (
                  <Image source={{ uri: product.images.front }} style={styles.productImage} />
                ) : (
                  <View style={[styles.productImage, styles.productImagePlaceholder]}>
                    <Ionicons name="cube-outline" size={24} color="#64748B" />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.productName} numberOfLines={1}>{product.name}</Text>
                  <Text style={styles.productBrand} numberOfLines={1}>{product.brand || 'No brand yet'}</Text>
                  <View style={styles.codeBadge}>
                    <Ionicons name="qr-code-outline" size={14} color="#1D4ED8" />
                    <Text style={styles.codeText}>{product.ffadzCode}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    handleDeleteProduct(product);
                  }}
                  style={{ padding: 8 }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="trash-outline" size={20} color="#EF4444" />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAF9F6' },
  content: { padding: spacing.xl, paddingBottom: 120 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.h2,
    color: '#1A1A1A',
  },
  subtitle: {
    ...typography.caption,
    color: '#64748B',
    marginTop: 4,
    maxWidth: 240,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#111827',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: borderRadius.full,
  },
  createBtnText: {
    ...typography.captionBold,
    color: '#FFF',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: 12,
    ...shadows.sm,
  },
  cardTitle: {
    ...typography.h4,
    color: '#111827',
    textAlign: 'center',
  },
  cardText: {
    ...typography.body,
    color: '#64748B',
    textAlign: 'center',
  },
  primaryAction: {
    marginTop: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: borderRadius.full,
  },
  primaryActionText: {
    ...typography.captionBold,
    color: '#FFF',
  },
  list: {
    gap: 12,
  },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.xl,
    padding: 14,
    ...shadows.sm,
  },
  productImage: {
    width: 72,
    height: 72,
    borderRadius: borderRadius.lg,
  },
  productImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E2E8F0',
  },
  productName: {
    ...typography.bodyBold,
    color: '#111827',
    marginBottom: 2,
  },
  productBrand: {
    ...typography.caption,
    color: '#64748B',
    marginBottom: 8,
  },
  codeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: '#DBEAFE',
  },
  codeText: {
    ...typography.captionBold,
    color: '#1D4ED8',
  },
});
