import React, { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { colors } from '../theme/colors';
import { borderRadius, shadows, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { createPersonalProduct } from '../services/supabase/personalProducts';
import { getCloudinaryDefaults } from '../services/cloudinary';
import { useUser } from '../store/UserContext';
import { useProducts } from '../store/ProductContext';

const IMAGE_SLOTS = [
  { key: 'front', label: 'Front Image', hint: 'Main package photo', icon: 'image-outline', accent: '#D1FAE5', iconColor: '#047857' },
  { key: 'ingredients', label: 'Ingredients Image', hint: 'Back label ingredients list', icon: 'list-outline', accent: '#DBEAFE', iconColor: '#1D4ED8' },
  { key: 'nutrition', label: 'Nutrition Image', hint: 'Nutrition table photo', icon: 'bar-chart-outline', accent: '#FEF3C7', iconColor: '#B45309' },
];

const NUTRITION_FIELDS = [
  { key: 'energy', label: 'Energy (kcal)' },
  { key: 'protein', label: 'Protein (g)' },
  { key: 'carbs', label: 'Carbs (g)' },
  { key: 'sugar', label: 'Sugar (g)' },
  { key: 'fat', label: 'Fat (g)' },
  { key: 'saturatedFat', label: 'Sat. Fat (g)' },
  { key: 'fiber', label: 'Fiber (g)' },
  { key: 'sodium', label: 'Sodium (mg)' },
];

async function compressPhoto(uri) {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1440 } }],
    {
      compress: 0.78,
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );
  return result.uri;
}

function parseIngredients(raw = '') {
  return raw
    .split(/\n|,|;/)
    .map((item) => item.trim())
    .filter((item) => item.length > 1);
}

function normalizeNutritionInput(values = {}) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, Number(value) || 0])
  );
}

function hasMeaningfulNutrition(values = {}) {
  return Object.values(values).some((value) => Number(value) > 0);
}

function getSaveErrorTitle(message = '') {
  const normalized = String(message || '').toLowerCase();
  if (normalized.includes('cloudinary')) return 'Image Upload Failed';
  if (normalized.includes('supabase')) return 'Database Save Failed';
  if (normalized.includes('sign in')) return 'Sign In Required';
  return 'Save Failed';
}

export default function CreateQrProductScreen({ navigation }) {
  const { userPrefs } = useUser();
  const { productDispatch } = useProducts();
  const cloudinary = useMemo(() => getCloudinaryDefaults(), []);

  const [productName, setProductName] = useState('');
  const [ingredientsRaw, setIngredientsRaw] = useState('');
  const [images, setImages] = useState({ front: null, ingredients: null, nutrition: null });
  const [nutrition, setNutrition] = useState({
    energy: '',
    protein: '',
    carbs: '',
    sugar: '',
    fat: '',
    saturatedFat: '',
    fiber: '',
    sodium: '',
  });
  const [saving, setSaving] = useState(false);

  const readyCount = useMemo(
    () => Object.values(images).filter(Boolean).length,
    [images]
  );

  const updateNutrition = (key, value) => {
    setNutrition((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const pickPhoto = async (slot) => {
    const chooseSource = () => new Promise((resolve) => {
      Alert.alert(
        `Add ${slot.label}`,
        `Choose how to add the ${slot.label.toLowerCase()}.`,
        [
          { text: 'Camera', onPress: () => resolve('camera') },
          { text: 'Gallery', onPress: () => resolve('gallery') },
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
        ]
      );
    });

    const source = await chooseSource();
    if (!source) return;

    const permission = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Permission Required', 'Please allow photo access to continue.');
      return;
    }

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.85 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.85 });

    if (result.canceled || !result.assets?.length) {
      return;
    }

    const compressedUri = await compressPhoto(result.assets[0].uri);
    setImages((current) => ({
      ...current,
      [slot.key]: {
        uri: compressedUri,
      },
    }));
  };

  const clearPhoto = (slotKey) => {
    setImages((current) => ({
      ...current,
      [slotKey]: null,
    }));
  };

  const handleSave = async () => {
    if (!userPrefs.email) {
      Alert.alert('Sign In Required', 'Sign in before creating personal QR products.');
      return;
    }

    if (!productName.trim()) {
      Alert.alert('Product Name Required', 'Enter the product name before saving.');
      return;
    }

    if (readyCount < 3) {
      Alert.alert('3 Images Required', 'Add front, ingredients, and nutrition images before saving.');
      return;
    }

    if (!ingredientsRaw.trim()) {
      Alert.alert('Ingredients Required', 'Enter the ingredients list before saving.');
      return;
    }

    if (!hasMeaningfulNutrition(nutrition)) {
      Alert.alert('Nutrition Required', 'Enter at least one nutrition value before saving.');
      return;
    }

    setSaving(true);
    try {
      const result = await createPersonalProduct({
        productName: productName.trim(),
        brand: '',
        description: '',
        ingredientsRaw,
        ingredients: parseIngredients(ingredientsRaw),
        nutrition: normalizeNutritionInput(nutrition),
        images,
      });

      if (!result.success || !result.product?.id) {
        Alert.alert(getSaveErrorTitle(result.error), result.error || 'The QR product could not be created.');
        return;
      }

      // Transform personal product into standard product shape
      const standardProduct = {
        id: `personal_${result.product.id}`,
        barcode: result.product.ffadzCode || null,
        name: result.product.name,
        brand: result.product.brand || 'Personal Product',
        category: 'Personal QR',
        images: {
          front: result.product.images?.front || null,
          ingredients: result.product.images?.ingredients || null,
          nutrition: result.product.images?.nutrition || null,
        },
        ingredients: result.product.ingredients || [],
        nutrition: result.product.nutrition || {},
        scannedAt: new Date().toISOString(),
        analyzed: false,
        aiInsight: null,
        source: 'personal_qr',
        personalProductId: result.product.id,
        ffadzCode: result.product.ffadzCode || null,
      };

      productDispatch({ type: 'ADD_PRODUCT', payload: standardProduct });

      navigation.replace('ProductDetail', { productId: standardProduct.id });
    } catch (error) {
      Alert.alert(getSaveErrorTitle(error.message), error.message || 'The QR product could not be created.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>MY QR</Text>
          <Text style={styles.title}>Create your own FFADZ product</Text>
          <Text style={styles.subtitle}>
            Add one product name, 3 product images, the ingredients list, and the nutrition table. We’ll save the product in Supabase and host the images in Cloudinary.
          </Text>
          <View style={styles.heroMetaRow}>
            <View style={styles.metaPill}>
              <Ionicons name="cloud-upload-outline" size={14} color="#0F766E" />
              <Text style={styles.metaPillText}>{cloudinary.cloudName}</Text>
            </View>
            <View style={styles.metaPill}>
              <Ionicons name="shield-checkmark-outline" size={14} color="#4338CA" />
              <Text style={styles.metaPillText}>{cloudinary.uploadMode}</Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Product Name</Text>
          <Text style={styles.helperText}>This is the only basic field needed here.</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Maggi Noodles Masala"
            value={productName}
            onChangeText={setProductName}
            autoCapitalize="words"
            autoCorrect={false}
          />
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>3 Product Images</Text>
            <Text style={styles.progressText}>{readyCount}/3 ready</Text>
          </View>
          <Text style={styles.helperText}>These image URLs are saved in Cloudinary and tracked in Supabase.</Text>

          <View style={styles.imageStack}>
            {IMAGE_SLOTS.map((slot) => (
              <View key={slot.key} style={styles.imageRowCard}>
                <TouchableOpacity onPress={() => pickPhoto(slot)} activeOpacity={0.85}>
                  {images[slot.key]?.uri ? (
                    <Image source={{ uri: images[slot.key].uri }} style={styles.imageThumb} />
                  ) : (
                    <View style={[styles.imageThumb, styles.imagePlaceholder]}>
                      <Ionicons name={slot.icon} size={24} color={slot.iconColor} />
                    </View>
                  )}
                </TouchableOpacity>

                <View style={styles.imageRowInfo}>
                  <View style={[styles.imageBadge, { backgroundColor: slot.accent }]}>
                    <Text style={[styles.imageBadgeText, { color: slot.iconColor }]}>{slot.label}</Text>
                  </View>
                  <Text style={styles.imageHint}>{slot.hint}</Text>
                  <View style={styles.imageActionRow}>
                    <TouchableOpacity style={styles.smallActionBtn} onPress={() => pickPhoto(slot)} activeOpacity={0.85}>
                      <Ionicons name={images[slot.key]?.uri ? 'refresh-outline' : 'add-outline'} size={16} color="#111827" />
                      <Text style={styles.smallActionText}>{images[slot.key]?.uri ? 'Replace' : 'Add'}</Text>
                    </TouchableOpacity>
                    {images[slot.key]?.uri ? (
                      <TouchableOpacity style={styles.smallGhostBtn} onPress={() => clearPhoto(slot.key)} activeOpacity={0.85}>
                        <Ionicons name="trash-outline" size={16} color="#B91C1C" />
                        <Text style={styles.smallGhostText}>Remove</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Ingredients List</Text>
          <Text style={styles.helperText}>Paste or type each ingredient on a new line.</Text>
          <TextInput
            style={[styles.input, styles.largeTextArea]}
            placeholder={'Water\nSugar\nMilk solids'}
            value={ingredientsRaw}
            onChangeText={setIngredientsRaw}
            multiline
            textAlignVertical="top"
          />
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Nutrition Table</Text>
          <Text style={styles.helperText}>Enter values per 100g exactly like the label.</Text>
          <View style={styles.nutritionGrid}>
            {NUTRITION_FIELDS.map((field) => (
              <View key={field.key} style={styles.nutritionCell}>
                <Text style={styles.fieldLabel}>{field.label}</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  value={nutrition[field.key]}
                  onChangeText={(value) => updateNutrition(field.key, value)}
                  keyboardType="decimal-pad"
                />
              </View>
            ))}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.88}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <Ionicons name="qr-code-outline" size={18} color="#FFF" />
              <Text style={styles.saveBtnText}>Save And Generate QR</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F4F1EA' },
  content: {
    padding: spacing.xl,
    paddingBottom: 140,
    gap: 16,
  },
  heroCard: {
    backgroundColor: '#111827',
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    gap: 10,
    ...shadows.md,
  },
  eyebrow: {
    ...typography.captionBold,
    color: '#C4B5FD',
    letterSpacing: 1,
  },
  title: {
    ...typography.h2,
    color: '#FFFFFF',
  },
  subtitle: {
    ...typography.body,
    color: '#CBD5E1',
  },
  heroMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  metaPillText: {
    ...typography.captionBold,
    color: '#FFFFFF',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: 12,
    ...shadows.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionTitle: {
    ...typography.h4,
    color: '#111827',
  },
  helperText: {
    ...typography.caption,
    color: '#64748B',
  },
  progressText: {
    ...typography.captionBold,
    color: '#1D4ED8',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#111827',
    fontSize: 15,
  },
  largeTextArea: {
    minHeight: 160,
  },
  imageStack: {
    gap: 12,
  },
  imageRowCard: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    padding: 12,
    borderRadius: borderRadius.lg,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  imageThumb: {
    width: 88,
    height: 104,
    borderRadius: borderRadius.lg,
    backgroundColor: '#E5E7EB',
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageRowInfo: {
    flex: 1,
    gap: 8,
  },
  imageBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
  },
  imageBadgeText: {
    ...typography.captionBold,
  },
  imageHint: {
    ...typography.caption,
    color: '#64748B',
  },
  imageActionRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  smallActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  smallActionText: {
    ...typography.captionBold,
    color: '#111827',
  },
  smallGhostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEE2E2',
    borderRadius: borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  smallGhostText: {
    ...typography.captionBold,
    color: '#B91C1C',
  },
  nutritionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  nutritionCell: {
    width: '48%',
    gap: 6,
  },
  fieldLabel: {
    ...typography.captionBold,
    color: '#334155',
  },
  saveBtn: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: borderRadius.xl,
    backgroundColor: '#111827',
    ...shadows.sm,
  },
  saveBtnDisabled: {
    opacity: 0.75,
  },
  saveBtnText: {
    ...typography.bodyBold,
    color: '#FFF',
  },
});
