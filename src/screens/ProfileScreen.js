// Ffads — Profile Screen (Tabbed, API Keys, Cleaned up)
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Animated, Dimensions, TextInput, KeyboardAvoidingView, Platform,
  ActivityIndicator, Image, Modal
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing, borderRadius, shadows } from '../theme/spacing';
import { useUser, getGeminiKey, getAllGeminiKeys, getOFFCredentials } from '../store/UserContext';
import { useProducts } from '../store/ProductContext';
import { ALLERGEN_LIST, DIET_TYPES, GEMINI_MODELS } from '../utils/constants';
import AICardPreview from '../components/AICardPreview';
import { validateGeminiApiKey } from '../services/gemini';
import { isConfigured as isSupabaseConfigured, pingSupabase as pingSupabaseService, getSupabaseClient } from '../services/supabase';

const TABS = ['Health', 'AI', 'API', 'History'];
const { width } = Dimensions.get('window');

export default function ProfileScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { userPrefs, userDispatch } = useUser();
  const { productState, productDispatch } = useProducts();

  // Profile State
  const [profileName, setProfileName] = useState('Food Explorer');
  const [profileEmail, setProfileEmail] = useState('@guest');
  const [avatarUri, setAvatarUri] = useState(null);

  // UI State
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [newNameInput, setNewNameInput] = useState('');
  
  // Tab Modals mapping the old complex screens
  const [activeModal, setActiveModal] = useState(null); // 'health', 'ai', 'api', 'history'

  useEffect(() => {
    async function loadProfileData() {
      // Load Avatar
      const savedUri = await AsyncStorage.getItem('@ffads_user_avatar');
      if (savedUri) setAvatarUri(savedUri);

      // Load Supabase Identity
      const client = getSupabaseClient();
      if (client) {
        const { data } = await client.auth.getUser();
        if (data?.user) {
          setProfileName(data.user.user_metadata?.full_name || 'Food Explorer');
          setProfileEmail(data.user.email);
        }
      }
    }
    loadProfileData();
  }, []);

  const handlePickImage = async () => {
    try {
      const ImagePicker = require('expo-image-picker');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      });
      if (!result.canceled) {
        const uri = result.assets[0].uri;
        setAvatarUri(uri);
        await AsyncStorage.setItem('@ffads_user_avatar', uri);
      }
    } catch (err) {
      Alert.alert('Native Module Missing', 'Expo Image Picker needs to be rebuilt into your Dev Client.');
    }
  };

  const handleSaveProfile = async () => {
    if (!newNameInput.trim()) return;
    setProfileName(newNameInput);
    setEditModalVisible(false);
    
    // Push update to Supabase
    const client = getSupabaseClient();
    if (client) {
      await client.auth.updateUser({ data: { full_name: newNameInput } });
    }
  };

  const handleClearHistory = useCallback(() => {
    Alert.alert(
      'Clear All History?',
      'This will delete all your scanned products from history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: () => productDispatch({ type: 'CLEAR_HISTORY' }) },
      ]
    );
  }, [productDispatch]);

  const handleProductPress = useCallback((product) => {
    navigation.navigate('ProductDetail', { productId: product.id });
  }, [navigation]);

  const totalScans = productState.history.length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* User Header */}
        <View style={styles.headerBlock}>
          <TouchableOpacity onPress={() => { setNewNameInput(profileName); setEditModalVisible(true); }} style={styles.avatarWrap}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarImagePlaceholder}>
                <Ionicons name="person" size={40} color="#666" />
              </View>
            )}
            <View style={styles.editBadge}>
              <Ionicons name="pencil" size={12} color="#FFF" />
            </View>
          </TouchableOpacity>
          <Text style={styles.nameText}>{profileName}</Text>
          <Text style={styles.emailText}>{profileEmail}</Text>
        </View>

        {/* Stats Row */}
        <View style={styles.statsContainer}>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{totalScans}</Text>
            <Text style={styles.statLabel}>Products Scanned</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{userPrefs.geminiApiKeys?.length || 0}</Text>
            <Text style={styles.statLabel}>API Keys Active</Text>
          </View>
        </View>

        {/* Settings Menu List */}
        <View style={styles.menuContainer}>
          <TouchableOpacity style={styles.menuRow} onPress={() => { setNewNameInput(profileName); setEditModalVisible(true); }}>
            <View style={styles.menuIconBox}><Ionicons name="person-outline" size={18} color="#1A1A1A" /></View>
            <Text style={styles.menuRowText}>Edit Profile</Text>
            <Ionicons name="chevron-forward" size={18} color="#CCC" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuRow} onPress={() => setActiveModal('health')}>
            <View style={styles.menuIconBox}><Ionicons name="heart-outline" size={18} color="#1A1A1A" /></View>
            <Text style={styles.menuRowText}>Health Preferences</Text>
            <Ionicons name="chevron-forward" size={18} color="#CCC" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />
          
          <TouchableOpacity style={styles.menuRow} onPress={() => setActiveModal('history')}>
             <View style={styles.menuIconBox}><Ionicons name="time-outline" size={18} color="#1A1A1A" /></View>
             <Text style={styles.menuRowText}>Scan History</Text>
             <Ionicons name="chevron-forward" size={18} color="#CCC" />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionHeader}>Developer Core</Text>
        <View style={styles.menuContainer}>
          <TouchableOpacity style={styles.menuRow} onPress={() => setActiveModal('ai')}>
            <View style={[styles.menuIconBox, {backgroundColor: '#E0E7FF'}]}><Ionicons name="sparkles-outline" size={18} color="#4338CA" /></View>
            <Text style={styles.menuRowText}>AI Routing & Models</Text>
            <Ionicons name="chevron-forward" size={18} color="#CCC" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />
          <TouchableOpacity style={styles.menuRow} onPress={() => setActiveModal('api')}>
            <View style={[styles.menuIconBox, {backgroundColor: '#FEF3C7'}]}><Ionicons name="server-outline" size={18} color="#D97706" /></View>
            <Text style={styles.menuRowText}>Supabase & Custom Connections</Text>
            <Ionicons name="chevron-forward" size={18} color="#CCC" />
          </TouchableOpacity>
        </View>

        {/* Footer / Sign Out */}
        <TouchableOpacity style={styles.logoutBtnModern} onPress={async () => {
          Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign Out', style: 'destructive', onPress: async () => {
                const client = getSupabaseClient();
                if (client) await client.auth.signOut();
                Alert.alert('Signed out', 'You are now browsing as a guest.');
                setProfileEmail('@guest');
            }}
          ]);
        }}>
          <Text style={styles.logoutTextModern}>Log Out</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Legacy Modals */}
      <Modal visible={activeModal !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setActiveModal(null)}>
        <SafeAreaView style={{flex: 1, backgroundColor: '#FAF9F6'}}>
          <View style={styles.modalSubHeader}>
            <TouchableOpacity onPress={() => setActiveModal(null)} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={24} color="#1A1A1A" />
            </TouchableOpacity>
            <Text style={styles.modalSubTitle}>{activeModal === 'health' ? 'Health Prefs' : activeModal === 'ai' ? 'AI Logic' : activeModal === 'api' ? 'Developer Auth' : 'Scan History'}</Text>
          </View>
          <ScrollView contentContainerStyle={{padding: 24, paddingBottom: 100}}>
            {activeModal === 'health' && <HealthTab userPrefs={userPrefs} userDispatch={userDispatch} />}
            {activeModal === 'ai' && <AITab userPrefs={userPrefs} userDispatch={userDispatch} />}
            {activeModal === 'api' && <ApiTab userPrefs={userPrefs} userDispatch={userDispatch} onClearHistory={handleClearHistory} />}
            {activeModal === 'history' && <HistoryTab history={productState.history} onPressProduct={handleProductPress} />}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal visible={editModalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.editCard}>
            <View style={styles.modalSubHeader}>
              <Text style={styles.modalSubTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}><Ionicons name="close" size={24} color="#1A1A1A" /></TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.avatarPicker} onPress={handlePickImage} activeOpacity={0.8}>
               {avatarUri ? <Image source={{ uri: avatarUri }} style={styles.avatarImageLarge} /> : <View style={styles.avatarImagePlaceholderLarge}><Ionicons name="camera" size={32} color="#666" /></View>}
               <Text style={styles.changePhotoText}>Change Photo</Text>
            </TouchableOpacity>

            <Text style={styles.inputLabelVintage}>Full Name</Text>
            <TextInput style={styles.vintageInput} value={newNameInput} onChangeText={setNewNameInput} placeholder="Your Name" placeholderTextColor="#999" />
            
            <Text style={styles.inputLabelVintage}>Email Address</Text>
            <TextInput style={[styles.vintageInput, { backgroundColor: '#F0F0F0', color: '#999' }]} value={profileEmail} editable={false} />

            <TouchableOpacity style={styles.saveBtnVintage} onPress={handleSaveProfile}>
              <Text style={styles.saveBtnTextVintage}>Save Changes</Text>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

// ─── Health Tab ──────────────────────────────
function HealthTab({ userPrefs, userDispatch }) {
  return (
    <View style={styles.tabContent}>
      {/* Allergies */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="warning" size={20} color={colors.accent} />
          <Text style={styles.cardTitle}>Allergy Preferences</Text>
        </View>
        <Text style={styles.cardSubtitle}>
          Products containing these will trigger warnings
        </Text>
        <View style={styles.chipGrid}>
          {ALLERGEN_LIST.map((allergen) => {
            const selected = userPrefs.allergies.includes(allergen.id);
            return (
              <TouchableOpacity
                key={allergen.id}
                style={[styles.allergyChip, selected && styles.allergyChipOn]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  userDispatch({ type: 'TOGGLE_ALLERGY', payload: allergen.id });
                }}
                activeOpacity={0.7}
              >
                {/* Fallback to simple icon since we stripped emojis */}
                <Ionicons 
                  name={selected ? "alert-circle" : "alert-circle-outline"} 
                  size={18} 
                  color={selected ? colors.primary : colors.textMuted} 
                  style={{ marginRight: 4 }} 
                />
                <Text style={[styles.chipLabel, selected && styles.chipLabelOn]}>
                  {allergen.label}
                </Text>
                {selected && (
                  <Ionicons name="checkmark-circle" size={16} color={colors.primary} style={{ marginLeft: 6 }} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Diet */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="leaf" size={20} color={colors.secondary} />
          <Text style={styles.cardTitle}>Diet Preference</Text>
        </View>
        <View style={styles.dietRow}>
          {DIET_TYPES.map((diet) => {
            const selected = userPrefs.diet === diet;
            return (
              <TouchableOpacity
                key={diet}
                style={[styles.dietPill, selected && styles.dietPillOn]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  userDispatch({ type: 'SET_DIET', payload: diet });
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.dietText, selected && styles.dietTextOn]}>
                  {diet.charAt(0).toUpperCase() + diet.slice(1)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

// ─── AI Tab ─────────────────────────────────
function AITab({ userPrefs, userDispatch }) {
  const TAG_COLORS = {
    recommended: { bg: '#22C55E20', text: '#16A34A' },
    fast:        { bg: '#3B82F620', text: '#2563EB' },
    powerful:    { bg: '#A855F720', text: '#7C3AED' },
    legacy:      { bg: '#F59E0B20', text: '#D97706' },
  };

  return (
    <View style={styles.tabContent}>
      {/* Gemini Model */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="hardware-chip" size={20} color="#667EEA" />
          <Text style={styles.cardTitle}>Gemini Model</Text>
          <View style={styles.freeBadge}>
            <Text style={styles.freeText}>FREE TIER</Text>
          </View>
        </View>
        <Text style={styles.cardSubtitle}>
          Free-tier limits reset daily. Check AI Studio for your exact quota.
        </Text>

        {GEMINI_MODELS.map((model) => {
          const selected = userPrefs.geminiModel === model.id;
          const tagColor = TAG_COLORS[model.tag] || TAG_COLORS.recommended;
          return (
            <TouchableOpacity
              key={model.id}
              style={[styles.modelRow, selected && styles.modelRowOn]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                userDispatch({ type: 'SET_GEMINI_MODEL', payload: model.id });
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.modelRadio, selected && styles.modelRadioOn]}>
                {selected && <View style={styles.modelRadioDot} />}
              </View>
              <View style={styles.modelInfo}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <Text style={[styles.modelName, selected && styles.modelNameOn]}>
                    {model.label}
                  </Text>
                  <View style={[styles.modelTagBadge, { backgroundColor: tagColor.bg }]}>
                    <Text style={[styles.modelTagText, { color: tagColor.text }]}>
                      {model.tag.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <Text style={styles.modelDesc}>{model.description}</Text>
                {/* Rate limit chips */}
                <View style={styles.limitRow}>
                  <View style={styles.limitChip}>
                    <Text style={styles.limitLabel}>RPM</Text>
                    <Text style={styles.limitValue}>{model.rpm}</Text>
                  </View>
                  <View style={styles.limitChip}>
                    <Text style={styles.limitLabel}>RPD</Text>
                    <Text style={styles.limitValue}>{model.rpd.toLocaleString()}</Text>
                  </View>
                  <View style={styles.limitChip}>
                    <Text style={styles.limitLabel}>TPM</Text>
                    <Text style={styles.limitValue}>{model.tpm}</Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Legend */}
        <View style={styles.legendBox}>
          <Text style={styles.legendTitle}>Rate Limit Legend</Text>
          <Text style={styles.legendItem}>RPM = Requests per Minute</Text>
          <Text style={styles.legendItem}>RPD = Requests per Day</Text>
          <Text style={styles.legendItem}>TPM = Tokens per Minute</Text>
        </View>
      </View>
    </View>
  );
}

// ─── API Tab ──────────────────────
function ApiTab({ userPrefs, userDispatch, onClearHistory }) {
  const geminiKeys = getAllGeminiKeys(userPrefs);
  const activeKeyIndex = userPrefs.geminiActiveKeyIndex || 0;
  const [newKeyInput, setNewKeyInput] = useState('');
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);

  // Supabase state
  const [localSupaUrl, setLocalSupaUrl] = useState(userPrefs.supabaseUrl || '');
  const [localSupaKey, setLocalSupaKey] = useState(userPrefs.supabaseAnonKey || '');
  const [showSupaKey, setShowSupaKey] = useState(false);
  const hasUnsavedSupa = localSupaUrl !== (userPrefs.supabaseUrl || '') || localSupaKey !== (userPrefs.supabaseAnonKey || '');
  const [supabasePinging, setSupabasePinging] = useState(false);
  const [supabaseResult, setSupabaseResult] = useState(null);
  const supabaseConfigured = isSupabaseConfigured();

  // Open Food Facts credentials state
  const [localOFFUser, setLocalOFFUser]   = useState(userPrefs.offUsername || '');
  const [localOFFPass, setLocalOFFPass]   = useState(userPrefs.offPassword || '');
  const [showOFFPass, setShowOFFPass]     = useState(false);
  const hasUnsavedOFF = localOFFUser !== (userPrefs.offUsername || '') || localOFFPass !== (userPrefs.offPassword || '');
  const offIsSet = !!(userPrefs.offUsername && userPrefs.offPassword);

  const handleSaveOFF = useCallback(() => {
    userDispatch({
      type: 'SET_OFF_CREDENTIALS',
      payload: { username: localOFFUser.trim(), password: localOFFPass.trim() },
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [localOFFUser, localOFFPass, userDispatch]);

  // Auto-check supabase on mount
  useEffect(() => {
    if (supabaseConfigured) handlePingSupabase();
  }, []);

  const handleAddKey = useCallback(async () => {
    const trimmed = newKeyInput.trim();
    if (!trimmed) return;
    if (geminiKeys.includes(trimmed)) {
      Alert.alert('Duplicate', 'This key is already in your list.');
      return;
    }
    if (!trimmed.startsWith('AIza')) {
      Alert.alert('Invalid Key', 'Gemini API keys start with "AIza". Please check your key.');
      return;
    }

    // Save immediately — don't block on validation
    userDispatch({ type: 'ADD_GEMINI_KEY', payload: trimmed });
    // If this is the first key, make it active
    if (geminiKeys.length === 0) {
      userDispatch({ type: 'SET_ACTIVE_GEMINI_KEY', payload: 0 });
    }
    setNewKeyInput('');
    setValidationResult(null);

    // Validate in background (non-blocking)
    setValidating(true);
    try {
      const result = await validateGeminiApiKey(trimmed);
      setValidationResult(result);
      if (!result.valid) {
        Alert.alert(
          '⚠️ Key May Be Invalid',
          `Key was saved but validation failed: ${result.message}\n\nYou can still try using it.`
        );
      }
    } catch (e) {
      setValidationResult({ valid: null, message: `Validation check failed: ${e.message}` });
    } finally {
      setValidating(false);
    }
  }, [newKeyInput, geminiKeys, userDispatch]);

  const handleRemoveKey = useCallback((index) => {
    Alert.alert('Remove Key', `Remove API key #${index + 1}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => {
        userDispatch({ type: 'REMOVE_GEMINI_KEY', payload: index });
      }},
    ]);
  }, [userDispatch]);

  const handleSetActive = useCallback((index) => {
    userDispatch({ type: 'SET_ACTIVE_GEMINI_KEY', payload: index });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [userDispatch]);

  const handleTestKey = useCallback(async (key, index) => {
    setValidating(true);
    setValidationResult(null);
    try {
      const result = await validateGeminiApiKey(key);
      setValidationResult({ ...result, testedIndex: index });
    } catch (e) {
      setValidationResult({ valid: false, message: e.message, testedIndex: index });
    } finally {
      setValidating(false);
    }
  }, []);

  const handleSaveSupa = useCallback(async () => {
    const trimmedUrl = localSupaUrl.trim();
    const trimmedKey = localSupaKey.trim();
    userDispatch({ type: 'SET_SUPABASE_URL', payload: trimmedUrl });
    userDispatch({ type: 'SET_SUPABASE_KEY', payload: trimmedKey });
    
    // Wait briefly for context + supabase singleton to sync
    setTimeout(() => {
      handlePingSupabase();
    }, 100);
  }, [localSupaUrl, localSupaKey, userDispatch]);

  const handlePingSupabase = useCallback(async () => {
    setSupabasePinging(true);
    setSupabaseResult(null);
    try {
      const result = await pingSupabaseService();
      setSupabaseResult(result);
    } catch (e) {
      setSupabaseResult({ connected: false, message: e.message });
    } finally {
      setSupabasePinging(false);
    }
  }, []);

  const statusIcon = validationResult === null
    ? 'ellipse-outline'
    : validationResult.valid === true
      ? 'checkmark-circle'
      : validationResult.valid === false
        ? 'close-circle'
        : 'remove-circle-outline';

  const statusColor = validationResult === null
    ? colors.textMuted
    : validationResult.valid === true
      ? '#22C55E'
      : validationResult.valid === false
        ? '#EF4444'
        : '#F59E0B';

  const supaColor = supabaseResult === null
    ? colors.textMuted
    : supabaseResult.connected ? '#22C55E' : '#EF4444';

  return (
    <View style={styles.tabContent}>
      {/* ── Gemini API Keys (Multi-Key) ── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="key" size={20} color={colors.primary} />
          <Text style={styles.cardTitle}>Gemini API Keys</Text>
          <View style={styles.keyCountBadge}>
            <Text style={styles.keyCountText}>{geminiKeys.length}</Text>
          </View>
        </View>
        <Text style={styles.cardSubtitle}>
          Add multiple keys for auto-rotation. If one hits its rate limit, the next key is used automatically.
        </Text>

        {/* Existing Keys List — tap row to set active */}
        {geminiKeys.map((key, index) => {
          const isActive = index === activeKeyIndex;
          return (
            <TouchableOpacity
              key={index}
              style={[styles.keyRow, isActive && styles.keyRowActive]}
              onPress={() => handleSetActive(index)}
              activeOpacity={0.75}
            >
              <View style={styles.keyInfo}>
                <View style={styles.keyLabelRow}>
                  <Text style={styles.keyIndex}>#{index + 1}</Text>
                  {isActive ? (
                    <View style={styles.activeBadge}>
                      <Ionicons name="flash" size={10} color="#FFF" />
                      <Text style={styles.activeBadgeText}>Active</Text>
                    </View>
                  ) : (
                    <Text style={[styles.keyIndex, { color: colors.textMuted }]}>Tap to activate</Text>
                  )}
                </View>
                <Text style={styles.keyPreview} numberOfLines={1}>
                  {key.substring(0, 12)}...{key.substring(key.length - 4)}
                </Text>
              </View>
              <View style={styles.keyActions}>
                <TouchableOpacity
                  style={styles.keyActionBtn}
                  onPress={(e) => { e.stopPropagation?.(); handleTestKey(key, index); }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="flask" size={16} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.keyActionBtn, { marginLeft: 6 }]}
                  onPress={(e) => { e.stopPropagation?.(); handleRemoveKey(index); }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="trash" size={16} color="#EF4444" />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })}

        {geminiKeys.length === 0 && (
          <View style={styles.emptyKeysBox}>
            <Ionicons name="key-outline" size={24} color={colors.textMuted} />
            <Text style={styles.emptyKeysText}>No API keys added yet</Text>
          </View>
        )}

        {/* Add New Key */}
        <View style={styles.addKeySection}>
          <View style={styles.apiInputRow}>
            <TextInput
              style={[styles.apiInput, { flex: 1 }]}
              placeholder="Paste a new API key..."
              placeholderTextColor={colors.textMuted}
              value={newKeyInput}
              onChangeText={setNewKeyInput}
              autoCorrect={false}
              autoCapitalize="none"
              secureTextEntry
            />
            <TouchableOpacity
              style={[styles.addKeyBtn, !newKeyInput.trim() && { opacity: 0.4 }]}
              onPress={handleAddKey}
              disabled={!newKeyInput.trim() || validating}
              activeOpacity={0.8}
            >
              {validating ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Ionicons name="add" size={20} color="#FFF" />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Validation Result */}
        {validationResult && (
          <View style={[styles.resultBanner, {
            backgroundColor: validationResult.valid ? '#22C55E15' : '#EF444415',
            borderColor: validationResult.valid ? '#22C55E40' : '#EF444440',
            marginTop: spacing.sm,
          }]}>
            <Ionicons
              name={validationResult.valid ? 'checkmark-circle' : 'close-circle'}
              size={18}
              color={validationResult.valid ? '#22C55E' : '#EF4444'}
            />
            <Text style={[styles.resultMessage, { flex: 1 }]}>
              {validationResult.testedIndex !== undefined ? `Key #${validationResult.testedIndex + 1}: ` : ''}
              {validationResult.message}
            </Text>
          </View>
        )}
      </View>

      {/* ── Gemini Model Selector ── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="sparkles" size={20} color={colors.primary} />
          <Text style={styles.cardTitle}>AI Model</Text>
          <View style={[styles.keyCountBadge, { marginLeft: 'auto' }]}>
            <Text style={styles.keyCountText}>{userPrefs.geminiModel || 'gemini-2.5-flash'}</Text>
          </View>
        </View>
        <Text style={styles.cardSubtitle}>
          Select the Gemini model used for all AI features (OCR, analysis, ingredient evaluation).
        </Text>
        <View style={{ gap: 6, marginTop: 8 }}>
          {GEMINI_MODELS.map((m) => {
            const active = (userPrefs.geminiModel || 'gemini-2.5-flash') === m.id;
            return (
              <TouchableOpacity
                key={m.id}
                style={[styles.keyRow, active && styles.keyRowActive]}
                onPress={() => {
                  userDispatch({ type: 'SET_GEMINI_MODEL', payload: m.id });
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                activeOpacity={0.75}
              >
                <View style={{ flex: 1 }}>
                  <View style={styles.keyLabelRow}>
                    <Text style={styles.keyIndex}>{m.label}</Text>
                    {active && (
                      <View style={styles.activeBadge}>
                        <Ionicons name="checkmark" size={10} color="#FFF" />
                        <Text style={styles.activeBadgeText}>Selected</Text>
                      </View>
                    )}
                    {m.tag && !active && (
                      <View style={[styles.activeBadge, { backgroundColor: colors.textMuted }]}>
                        <Text style={styles.activeBadgeText}>{m.tag}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.keyPreview}>{m.description}</Text>
                  <Text style={styles.keyPreview}>{m.rpd.toLocaleString()} req/day • {m.rpm} req/min</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── Open Food Facts Credentials ── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="nutrition" size={20} color={offIsSet ? '#22C55E' : colors.textMuted} />
          <Text style={styles.cardTitle}>Open Food Facts</Text>
          {offIsSet && (
            <View style={[styles.keyCountBadge, { backgroundColor: '#22C55E20', marginLeft: 'auto' }]}>
              <Ionicons name="checkmark-circle" size={12} color="#22C55E" />
              <Text style={[styles.keyCountText, { color: '#22C55E' }]}>Connected</Text>
            </View>
          )}
        </View>
        <Text style={styles.cardSubtitle}>
          Used to upload product photos and contribute data to the Open Food Facts database.
        </Text>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Username</Text>
          <TextInput
            style={styles.apiInput}
            placeholder="your OFF username"
            placeholderTextColor={colors.textMuted}
            value={localOFFUser}
            onChangeText={setLocalOFFUser}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>

        <View style={[styles.inputGroup, { marginTop: 12 }]}>
          <Text style={styles.inputLabel}>Password</Text>
          <View style={styles.apiInputRow}>
            <TextInput
              style={[styles.apiInput, { flex: 1 }]}
              placeholder="your OFF password"
              placeholderTextColor={colors.textMuted}
              value={localOFFPass}
              onChangeText={setLocalOFFPass}
              secureTextEntry={!showOFFPass}
              autoCorrect={false}
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={[styles.keyActionBtn, { marginLeft: 8 }]}
              onPress={() => setShowOFFPass(v => !v)}
            >
              <Ionicons name={showOFFPass ? 'eye-off' : 'eye'} size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {hasUnsavedOFF && (
          <TouchableOpacity style={[styles.addKeyBtn, { marginTop: 12, alignSelf: 'stretch', borderRadius: borderRadius.lg }]} onPress={handleSaveOFF} activeOpacity={0.85}>
            <Text style={[styles.keyCountText, { color: '#FFF', fontSize: 14 }]}>Save Credentials</Text>
          </TouchableOpacity>
        )}

        {!hasUnsavedOFF && offIsSet && (
          <View style={[styles.resultBanner, { backgroundColor: '#22C55E15', borderColor: '#22C55E40', marginTop: 10 }]}>
            <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
            <Text style={[styles.resultMessage, { color: '#22C55E' }]}>
              Logged in as <Text style={{ fontWeight: '700' }}>{userPrefs.offUsername}</Text>
            </Text>
          </View>
        )}

        {!offIsSet && (
          <View style={[styles.resultBanner, { backgroundColor: '#F59E0B15', borderColor: '#F59E0B40', marginTop: 10 }]}>
            <Ionicons name="warning-outline" size={16} color="#F59E0B" />
            <Text style={[styles.resultMessage, { color: '#F59E0B' }]}>
              No credentials set — photos won't be uploaded to Open Food Facts
            </Text>
          </View>
        )}
      </View>

      {/* ── Supabase Status ── */}

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="server" size={20} color={supaColor} />
          <Text style={styles.cardTitle}>Supabase Database</Text>
        </View>
        <Text style={styles.cardSubtitle}>
          Configure your Supabase URL and Anon Key. Overrides .env variables if set.
        </Text>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Supabase URL</Text>
          <View style={styles.apiInputRow}>
            <TextInput
              style={[styles.apiInput, { flex: 1 }]}
              placeholder="https://..."
              placeholderTextColor={colors.textMuted}
              value={localSupaUrl}
              onChangeText={setLocalSupaUrl}
              autoCorrect={false}
              autoCapitalize="none"
              keyboardType="url"
            />
          </View>
        </View>

        <View style={[styles.inputGroup, { marginTop: 12 }]}>
          <Text style={styles.inputLabel}>Anon Key</Text>
          <View style={styles.apiInputRow}>
            <TextInput
              style={[styles.apiInput, { flex: 1 }]}
              placeholder="eyJhbGciOi..."
              placeholderTextColor={colors.textMuted}
              value={localSupaKey}
              onChangeText={setLocalSupaKey}
              autoCorrect={false}
              autoCapitalize="none"
              secureTextEntry={!showSupaKey}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowSupaKey(!showSupaKey)}
              activeOpacity={0.7}
            >
              <Ionicons name={showSupaKey ? 'eye-off' : 'eye'} size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.apiBtnRow}>
          <TouchableOpacity
            style={[styles.saveBtn, !hasUnsavedSupa && styles.saveBtnDisabled]}
            onPress={handleSaveSupa}
            disabled={!hasUnsavedSupa || supabasePinging}
            activeOpacity={0.8}
          >
            {supabasePinging ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Ionicons name="save" size={16} color="#FFF" />
                <Text style={styles.saveBtnText}>Save & Ping</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.testBtn}
            onPress={handlePingSupabase}
            disabled={supabasePinging || (!supabaseConfigured && !hasUnsavedSupa)}
            activeOpacity={0.8}
          >
            <Ionicons name="pulse" size={16} color={colors.primary} />
            <Text style={styles.testBtnText}>Ping</Text>
          </TouchableOpacity>
        </View>

        {hasUnsavedSupa && (
          <View style={styles.unsavedBanner}>
            <Ionicons name="information-circle" size={14} color="#D97706" />
            <Text style={styles.unsavedText}>Unsaved changes — tap Save & Ping</Text>
          </View>
        )}

        <View style={{ height: 16 }} />

        {!supabaseConfigured && !hasUnsavedSupa ? (
          <View style={[styles.resultBanner, {
            backgroundColor: '#F59E0B15', borderColor: '#F59E0B40',
          }]}>
            <Ionicons name="alert-circle" size={22} color="#D97706" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.resultTitle, { color: '#D97706' }]}>Not Configured</Text>
              <Text style={styles.resultMessage}>
                Supabase URL and Anon Key are missing. Data is only stored locally.
              </Text>
            </View>
          </View>
        ) : (
          <>
            {supabasePinging ? (
              <View style={styles.validatingRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.validatingText}>Pinging Supabase…</Text>
              </View>
            ) : supabaseResult ? (
              <View style={styles.resultBox}>
                <View style={[styles.resultBanner, {
                  backgroundColor: supabaseResult.connected ? '#22C55E15' : '#EF444415',
                  borderColor: supabaseResult.connected ? '#22C55E40' : '#EF444440',
                }]}>
                  <Ionicons
                    name={supabaseResult.connected ? 'checkmark-circle' : 'close-circle'}
                    size={22}
                    color={supaColor}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.resultTitle, { color: supaColor }]}>
                      {supabaseResult.connected ? '✓ Connected' : '✗ Failed'}
                    </Text>
                    <Text style={styles.resultMessage}>{supabaseResult.message}</Text>
                    {supabaseResult.latencyMs != null && (
                      <Text style={[styles.resultMessage, { color: colors.primary, fontWeight: '700', marginTop: 2 }]}>
                        Latency: {supabaseResult.latencyMs}ms
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            ) : null}
          </>
        )}
      </View>

      {/* Danger Zone */}
      <View style={[styles.card, styles.dangerCard]}>
        <View style={styles.cardHeader}>
          <Ionicons name="trash" size={20} color={colors.danger} />
          <Text style={[styles.cardTitle, { color: colors.danger }]}>Danger Zone</Text>
        </View>
        <TouchableOpacity style={styles.dangerBtn} onPress={onClearHistory} activeOpacity={0.8}>
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
          <Text style={styles.dangerBtnText}>Clear All Scan History</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}


// ─── History Tab ────────────────────────────
function HistoryTab({ history, onPressProduct }) {
  if (history.length === 0) {
    return (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyEmoji}>📜</Text>
        <Text style={styles.emptyTitle}>History is empty</Text>
        <Text style={styles.emptyDesc}>Products you scan will be saved here persistently.</Text>
      </View>
    );
  }

  return (
    <View style={styles.tabContent}>
      {history.map(product => (
        <AICardPreview key={product.id} product={product} onPress={onPressProduct} />
      ))}
    </View>
  );
}


function StatusRow({ label, value, active }) {
  return (
    <View style={styles.statusRow}>
      <View style={[styles.statusDot, { backgroundColor: active ? '#22C55E' : '#F59E0B' }]} />
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={[styles.statusValue, { color: active ? '#22C55E' : '#F59E0B' }]}>{value}</Text>
    </View>
  );
}

// ─── Styles ─────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingHorizontal: spacing.lg },

  // Header
  headerCard: {
    borderRadius: borderRadius.xl, padding: spacing.xl,
    alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.lg,
  },
  avatarRing: {
    width: 84, height: 84, borderRadius: 42,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 36 },
  headerName: { ...typography.h2, color: '#FFF', marginBottom: 4 },
  headerSub: { ...typography.caption, color: 'rgba(255,255,255,0.7)', marginBottom: 20 },

  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: borderRadius.lg, paddingVertical: 14, paddingHorizontal: 20,
    width: '100%',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { ...typography.h3, color: '#FFF' },
  statLabel: { ...typography.small, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  statDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.2)' },

  // Tab bar (scrollable to fit all items and prevent floating nav clipping)
  tabBarWrapper: {
    marginBottom: spacing.lg,
  },
  tabBar: {
    flexDirection: 'row', backgroundColor: colors.surface,
    borderRadius: borderRadius.lg, padding: 4,
    borderWidth: 1, borderColor: colors.border,
    minWidth: '100%'
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: borderRadius.md, gap: 6,
    minWidth: 80,
  },
  tabActive: { backgroundColor: colors.primarySoft },
  tabText: { ...typography.captionBold, color: colors.textMuted },
  tabTextActive: { color: colors.primary },

  // Tab content
  tabContent: { gap: 16 },

  // Cards
  card: {
    backgroundColor: colors.surface, borderRadius: borderRadius.xl,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border,
    ...shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4,
  },
  cardTitle: { ...typography.h4, color: colors.text, flex: 1 },
  cardSubtitle: { ...typography.caption, color: colors.textMuted, marginBottom: 14 },

  freeBadge: {
    backgroundColor: '#22C55E20', paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  freeText: { fontSize: 10, fontWeight: '800', color: '#22C55E' },

  // Inputs
  inputGroup: {
    marginTop: 12,
  },
  inputLabel: {
    ...typography.captionBold,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  apiInput: {
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    ...typography.body,
    color: colors.text,
  },

  // Allergy chips
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  allergyChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.surfaceMuted, borderWidth: 1.5, borderColor: colors.border,
    borderRadius: borderRadius.full, paddingHorizontal: 12, paddingVertical: 8,
  },
  allergyChipOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipEmoji: { fontSize: 14 },
  chipLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  chipLabelOn: { color: colors.primary },

  // Diet
  dietRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  dietPill: {
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceMuted, borderWidth: 1.5, borderColor: colors.border,
  },
  dietPillOn: { backgroundColor: colors.secondarySoft, borderColor: colors.secondary },
  dietText: { ...typography.captionBold, color: colors.textSecondary },
  dietTextOn: { color: colors.secondaryDark },

  // Model selector
  modelRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingVertical: 14, paddingHorizontal: 12,
    borderRadius: borderRadius.lg, marginTop: 6,
    backgroundColor: colors.surfaceMuted, borderWidth: 1.5, borderColor: 'transparent',
  },
  modelRowOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  modelRadio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  modelRadioOn: { borderColor: colors.primary },
  modelRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  modelInfo: { flex: 1 },
  modelName: { ...typography.bodyBold, color: colors.text },
  modelNameOn: { color: colors.primaryDark },
  modelDesc: { ...typography.small, color: colors.textMuted, marginTop: 1 },
  modelTagBadge: {
    paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: borderRadius.full,
  },
  modelTagText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },

  // Rate limit chips
  limitRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  limitChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.04)', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  limitLabel: { fontSize: 9, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.3 },
  limitValue: { fontSize: 10, fontWeight: '800', color: colors.text },

  // Legend
  legendBox: {
    marginTop: 14, padding: 12, borderRadius: borderRadius.md,
    backgroundColor: 'rgba(0,0,0,0.03)', borderWidth: 1, borderColor: colors.border,
  },
  legendTitle: { ...typography.captionBold, color: colors.textSecondary, marginBottom: 4 },
  legendItem: { ...typography.small, color: colors.textMuted, lineHeight: 16 },

  // API input row
  apiInputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border,
    borderRadius: borderRadius.md, overflow: 'hidden',
  },
  eyeBtn: {
    padding: 12,
  },

  // API action buttons
  apiBtnRow: {
    flexDirection: 'row', gap: 10, marginTop: 14,
  },
  saveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, paddingVertical: 12,
    borderRadius: borderRadius.lg, ...shadows.sm,
  },
  saveBtnDisabled: { backgroundColor: colors.textMuted, opacity: 0.5 },
  saveBtnText: { ...typography.captionBold, color: '#FFF' },
  testBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, paddingHorizontal: 20,
    borderRadius: borderRadius.lg, borderWidth: 1.5, borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  testBtnText: { ...typography.captionBold, color: colors.primary },

  // Unsaved banner
  unsavedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 10, paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: '#F59E0B15', borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: '#F59E0B30',
  },
  unsavedText: { ...typography.small, color: '#D97706', fontWeight: '600' },

  // Validation status
  validatingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12,
  },
  validatingText: { ...typography.body, color: colors.textSecondary },
  resultBox: { marginTop: 4 },
  resultBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    padding: 14, borderRadius: borderRadius.lg, borderWidth: 1,
  },
  resultTitle: { ...typography.bodyBold, marginBottom: 2 },
  resultMessage: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
  statusEmptyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10,
  },
  statusEmptyText: { ...typography.body, color: colors.textMuted },

  // Status (legacy)
  statusRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { ...typography.body, color: colors.text, flex: 1 },
  statusValue: { ...typography.captionBold },

  // Danger
  dangerCard: { borderColor: colors.danger + '20' },
  dangerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: borderRadius.lg,
    backgroundColor: colors.danger + '10', marginTop: 8,
  },
  dangerBtnText: { ...typography.bodyBold, color: colors.danger },

  // Empty state
  emptyCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.xl,
    padding: spacing.xl, alignItems: 'center', borderWidth: 1, borderColor: colors.border,
    ...shadows.sm, marginTop: spacing.md,
  },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { ...typography.h3, color: colors.text, marginBottom: 8 },
  emptyDesc: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },

  // Multi-key styles
  keyCountBadge: {
    backgroundColor: colors.primarySoft, paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: borderRadius.full, marginLeft: 'auto',
  },
  keyCountText: { ...typography.captionBold, color: colors.primaryDark },
  keyRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surfaceMuted, borderRadius: borderRadius.lg,
    padding: spacing.md, marginTop: spacing.sm, borderWidth: 1, borderColor: colors.border,
  },
  keyRowActive: {
    borderColor: colors.primary + '60', backgroundColor: colors.primarySoft + '30',
  },
  keyInfo: { flex: 1 },
  keyLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  keyIndex: { ...typography.captionBold, color: colors.textSecondary },
  activeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: colors.primary, paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  activeBadgeText: { fontSize: 9, fontWeight: '800', color: '#FFF' },
  keyPreview: { ...typography.caption, color: colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  keyActions: { flexDirection: 'row', alignItems: 'center' },
  keyActionBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border,
  },
  emptyKeysBox: {
    alignItems: 'center', paddingVertical: spacing.lg, gap: 8,
  },
  emptyKeysText: { ...typography.caption, color: colors.textMuted },
  addKeySection: { marginTop: spacing.md },
  addKeyBtn: {
    width: 44, height: 44, borderRadius: borderRadius.lg,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginLeft: 8,
  },

  // --- VINTAGE MINIMAL UI STYLES ---
  safeArea: { flex: 1, backgroundColor: '#FAF9F6' },
  headerBlock: {
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 32,
    backgroundColor: '#FAF9F6',
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
  },
  avatarImage: { width: 100, height: 100, borderRadius: 50 },
  avatarImagePlaceholder: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#EAE8E3',
    alignItems: 'center', justifyContent: 'center',
  },
  editBadge: {
    position: 'absolute', bottom: 0, right: 0,
    backgroundColor: '#1A1A1A',
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#FAF9F6',
  },
  nameText: { fontSize: 28, fontWeight: '800', color: '#1A1A1A', letterSpacing: -0.5 },
  emailText: { fontSize: 16, color: '#666666', marginTop: 4 },
  
  statsContainer: {
    flexDirection: 'row',
    marginHorizontal: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 20,
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  statBox: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, backgroundColor: 'rgba(0,0,0,0.05)' },
  statNum: { fontSize: 24, fontWeight: '800', color: '#1A1A1A' },
  statLabel: { fontSize: 11, fontWeight: '700', color: '#666666', marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.5 },

  sectionHeader: { fontSize: 13, fontWeight: '700', color: '#999', textTransform: 'uppercase', letterSpacing: 1, marginLeft: 36, marginBottom: 8, marginTop: 12 },
  menuContainer: {
    marginHorizontal: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 8,
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  menuRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 20 },
  menuDivider: { height: 1, backgroundColor: 'rgba(0,0,0,0.03)', marginHorizontal: 20 },
  menuIconBox: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  menuRowText: { flex: 1, fontSize: 16, fontWeight: '600', color: '#1A1A1A' },
  
  logoutBtnModern: { marginHorizontal: 24, backgroundColor: '#FEF2F2', borderRadius: 20, paddingVertical: 18, alignItems: 'center', marginBottom: 40, marginTop: 10 },
  logoutTextModern: { fontSize: 16, fontWeight: '700', color: '#EF4444' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  editCard: {
    backgroundColor: '#FAF9F6', borderTopLeftRadius: 32, borderTopRightRadius: 32,
    padding: 32, paddingBottom: 60,
    shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
  modalSubHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, paddingHorizontal: 24, paddingTop: 20 },
  modalTitle: { fontSize: 24, fontWeight: '800', color: '#1A1A1A' },
  modalSubTitle: { fontSize: 20, fontWeight: '800', color: '#1A1A1A' },
  modalCloseBtn: { padding: 8, backgroundColor: '#EAE8E3', borderRadius: 20 },

  avatarPicker: { alignItems: 'center', marginBottom: 32 },
  avatarImageLarge: { width: 120, height: 120, borderRadius: 60 },
  avatarImagePlaceholderLarge: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#EAE8E3', alignItems: 'center', justifyContent: 'center' },
  changePhotoText: { fontSize: 14, fontWeight: '600', color: '#666666', marginTop: 12 },

  inputLabelVintage: { fontSize: 13, fontWeight: '700', color: '#666666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginLeft: 4 },
  vintageInput: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, fontSize: 16, fontWeight: '500', color: '#1A1A1A',
    marginBottom: 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)'
  },
  saveBtnVintage: { backgroundColor: '#1A1A1A', borderRadius: 20, paddingVertical: 18, alignItems: 'center', marginTop: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 4 },
  saveBtnTextVintage: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
