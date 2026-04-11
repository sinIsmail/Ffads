// Ffads — Profile: API Tab (Gemini keys, OFF creds, Supabase config)
import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, Alert, ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { getAllGeminiKeys } from '../../store/UserContext';
import { validateGeminiApiKey } from '../../services/gemini';
import { isConfigured as isSupabaseConfigured, pingSupabase as pingSupabaseService } from '../../services/supabase';
import { styles } from '../profile/profileStyles';

export default function ApiTab({ userPrefs, userDispatch, onClearHistory }) {
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
