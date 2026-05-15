import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { validateProvider, validateProviderChain, maskApiKey } from '../../services/ai';
import {
  getJobStatus,
  processPendingJobs,
  requeueBlockedJobs,
  clearBlockedJobs,
  listContributionJobs,
} from '../../services/contributionQueue';
import {
  isConfigured as isSupabaseConfigured,
  pingSupabase as pingSupabaseService,
} from '../../services/supabase';
import { styles } from '../profile/profileStyles';

function normalizeStringList(values = [], fallback = '') {
  const list = Array.isArray(values) ? values : [values];
  const normalized = list.map((value) => String(value || ''));
  if (normalized.length === 0) {
    return fallback ? [fallback] : [''];
  }
  return normalized;
}

function buildProviderDrafts(providers = []) {
  return Object.fromEntries(
    providers.map((provider) => [
      provider.id,
      {
        baseUrl: provider.baseUrl || '',
        apiKeys: normalizeStringList(provider.apiKeys || provider.apiKey || ''),
        textModels: normalizeStringList(provider.textModels || provider.textModel || ''),
        enabled: provider.enabled !== false,
      },
    ])
  );
}

function getProviderKindLabel(kind) {
  if (kind === 'gemini') return 'Gemini';
  if (kind === 'ollama') return 'Ollama';
  return 'OpenAI-Compatible';
}

function getValidationColors(result) {
  if (!result) {
    return { icon: 'information-circle-outline', color: '#64748B', backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' };
  }
  if (result.valid) {
    return { icon: 'checkmark-circle', color: '#16A34A', backgroundColor: '#DCFCE7', borderColor: '#86EFAC' };
  }
  return { icon: 'close-circle', color: '#DC2626', backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' };
}

function arraysEqual(left = [], right = []) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function buildDraftProvider(provider, draft) {
  return {
    ...provider,
    baseUrl: (draft?.baseUrl ?? provider.baseUrl ?? '').trim(),
    apiKeys: (draft?.apiKeys || provider.apiKeys || []).map((value) => value.trim()).filter(Boolean),
    textModels: (draft?.textModels || provider.textModels || []).map((value) => value.trim()).filter(Boolean),
    enabled: draft?.enabled ?? provider.enabled,
  };
}

function RouteTrace({ attempts = [] }) {
  if (!attempts.length) return null;

  return (
    <View style={styles.routeTraceList}>
      {attempts.slice(0, 8).map((attempt) => (
        <View key={`${attempt.routeId}-${attempt.attemptedAt}`} style={styles.routeTraceRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.routeTraceTitle}>
              {attempt.providerLabel || attempt.providerId} · {attempt.model || 'No model'}
            </Text>
            <Text style={styles.routeTraceMeta}>
              {attempt.maskedKey || 'no-key'} · {attempt.success ? 'success' : (attempt.code || 'failed')}
            </Text>
            {attempt.error ? (
              <Text style={styles.routeTraceError} numberOfLines={2}>
                {attempt.error}
              </Text>
            ) : null}
          </View>
          <Ionicons
            name={attempt.success ? 'checkmark-circle' : 'alert-circle'}
            size={18}
            color={attempt.success ? '#16A34A' : '#DC2626'}
          />
        </View>
      ))}
    </View>
  );
}

function ListField({ label, values, placeholder, onChangeList, secureTextEntry = false, showSecrets = false, onToggleSecrets = null }) {
  const updateValue = (index, nextValue) => {
    const next = [...values];
    next[index] = nextValue;
    onChangeList(next);
  };

  const removeValue = (index) => {
    const next = values.filter((_, itemIndex) => itemIndex !== index);
    onChangeList(next.length ? next : ['']);
  };

  const addValue = () => {
    onChangeList([...(values || []), '']);
  };

  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      {(values || []).map((value, index) => (
        <View key={`${label}-${index}`} style={styles.repeatableRow}>
          <View style={[styles.apiInputRow, { flex: 1 }]}>
            <TextInput
              style={[styles.apiInput, { flex: 1 }]}
              placeholder={placeholder}
              value={value}
              onChangeText={(nextValue) => updateValue(index, nextValue)}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={secureTextEntry && !showSecrets}
            />
            {secureTextEntry && index === 0 && onToggleSecrets ? (
              <TouchableOpacity style={styles.eyeBtn} onPress={onToggleSecrets} activeOpacity={0.7}>
                <Ionicons name={showSecrets ? 'eye-off' : 'eye'} size={20} color="#64748B" />
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity style={styles.iconActionBtn} onPress={() => removeValue(index)} activeOpacity={0.8}>
            <Ionicons name="remove" size={16} color="#DC2626" />
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity style={styles.smallInlineBtn} onPress={addValue} activeOpacity={0.8}>
        <Ionicons name="add" size={16} color="#4338CA" />
        <Text style={styles.smallInlineBtnText}>Add {label}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function ApiTab({ userPrefs, userDispatch, productDispatch, onClearHistory }) {
  const providers = userPrefs.providers || [];
  const [draftProviders, setDraftProviders] = useState(() => buildProviderDrafts(providers));
  const [providerValidation, setProviderValidation] = useState({});
  const [providerBusy, setProviderBusy] = useState({});
  const [showProviderSecrets, setShowProviderSecrets] = useState({});
  const [chainValidation, setChainValidation] = useState(null);
  const [chainBusy, setChainBusy] = useState(false);

  const [supabasePinging, setSupabasePinging] = useState(false);
  const [supabaseResult, setSupabaseResult] = useState(null);

  const [localOFFUser, setLocalOFFUser] = useState(userPrefs.offUsername || '');
  const [localOFFPass, setLocalOFFPass] = useState(userPrefs.offPassword || '');
  const [localOFFContact, setLocalOFFContact] = useState(userPrefs.offContactEmail || '');
  const [showOFFPass, setShowOFFPass] = useState(false);

  const [queueBusy, setQueueBusy] = useState(false);
  const [queueStatus, setQueueStatus] = useState({
    pending: 0,
    running: 0,
    blocked: 0,
    completed: 0,
    lastError: null,
  });
  const [recentAttempts, setRecentAttempts] = useState([]);

  useEffect(() => {
    setDraftProviders(buildProviderDrafts(providers));
  }, [providers]);

  useEffect(() => {
    setLocalOFFUser(userPrefs.offUsername || '');
    setLocalOFFPass(userPrefs.offPassword || '');
    setLocalOFFContact(userPrefs.offContactEmail || '');
  }, [userPrefs.offUsername, userPrefs.offPassword, userPrefs.offContactEmail]);

  const mergedProviders = useMemo(
    () => providers.map((provider) => buildDraftProvider(provider, draftProviders[provider.id])),
    [draftProviders, providers]
  );

  const refreshQueueStatus = useCallback(async () => {
    const [status, jobs] = await Promise.all([
      getJobStatus(),
      listContributionJobs(),
    ]);
    setQueueStatus(status);
    const flattenedAttempts = jobs
      .flatMap((job) => job?.cleanupTrace || [])
      .sort((left, right) => Date.parse(right.attemptedAt || 0) - Date.parse(left.attemptedAt || 0));
    setRecentAttempts(flattenedAttempts.slice(0, 8));
    return status;
  }, []);

  useEffect(() => {
    refreshQueueStatus().catch(() => {});
  }, [refreshQueueStatus]);

  const hasUnsavedOFF = (
    localOFFUser !== (userPrefs.offUsername || '')
    || localOFFPass !== (userPrefs.offPassword || '')
    || localOFFContact !== (userPrefs.offContactEmail || '')
  );
  const offConfigured = Boolean(userPrefs.offUsername && userPrefs.offPassword);
  const supabaseConfigured = isSupabaseConfigured();

  const activeProviderId = userPrefs.activeProviderId;

  const updateProviderDraftField = useCallback((providerId, field, value) => {
    setDraftProviders((current) => ({
      ...current,
      [providerId]: {
        ...current[providerId],
        [field]: value,
      },
    }));
  }, []);

  const updateProviderDraftList = useCallback((providerId, field, value) => {
    setDraftProviders((current) => ({
      ...current,
      [providerId]: {
        ...current[providerId],
        [field]: value,
      },
    }));
  }, []);

  const toggleProviderSecret = useCallback((providerId) => {
    setShowProviderSecrets((current) => ({
      ...current,
      [providerId]: !current[providerId],
    }));
  }, []);

  const setProviderLoading = useCallback((providerId, value) => {
    setProviderBusy((current) => ({
      ...current,
      [providerId]: value,
    }));
  }, []);

  const handleSaveProvider = useCallback((providerId) => {
    const provider = providers.find((item) => item.id === providerId);
    const draft = draftProviders[providerId];
    if (!provider || !draft) return;

    const nextProvider = buildDraftProvider(provider, draft);

    userDispatch({
      type: 'UPDATE_PROVIDER',
      payload: {
        id: providerId,
        changes: {
          baseUrl: nextProvider.baseUrl,
          apiKeys: nextProvider.apiKeys,
          apiKey: nextProvider.apiKeys[0] || '',
          textModels: nextProvider.textModels,
          textModel: nextProvider.textModels[0] || '',
          enabled: Boolean(nextProvider.enabled),
        },
      },
    });

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [draftProviders, providers, userDispatch]);

  const handleTestProvider = useCallback(async (provider) => {
    const draft = draftProviders[provider.id];
    if (!draft) return;

    setProviderLoading(provider.id, true);
    try {
      const result = await validateProvider(buildDraftProvider(provider, draft));
      setProviderValidation((current) => ({
        ...current,
        [provider.id]: result,
      }));
    } catch (error) {
      setProviderValidation((current) => ({
        ...current,
        [provider.id]: {
          valid: false,
          message: error.message || 'Provider validation failed.',
        },
      }));
    } finally {
      setProviderLoading(provider.id, false);
    }
  }, [draftProviders, setProviderLoading]);

  const handleTestChain = useCallback(async () => {
    setChainBusy(true);
    setChainValidation(null);
    try {
      const result = await validateProviderChain({
        ...userPrefs,
        providers: mergedProviders,
      });
      setChainValidation(result);
    } finally {
      setChainBusy(false);
    }
  }, [mergedProviders, userPrefs]);

  const handleSaveOFF = useCallback(() => {
    userDispatch({
      type: 'SET_OFF_CREDENTIALS',
      payload: {
        username: localOFFUser.trim(),
        password: localOFFPass.trim(),
        contactEmail: localOFFContact.trim(),
      },
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [localOFFContact, localOFFPass, localOFFUser, userDispatch]);

  const handlePingSupabase = useCallback(async () => {
    setSupabasePinging(true);
    setSupabaseResult(null);
    try {
      const result = await pingSupabaseService();
      setSupabaseResult(result);
    } catch (error) {
      setSupabaseResult({ connected: false, message: error.message });
    } finally {
      setSupabasePinging(false);
    }
  }, []);

  const runQueue = useCallback(async (options = {}) => {
    setQueueBusy(true);
    try {
      if (options.requeueBlocked) {
        await requeueBlockedJobs();
      }

      const result = await processPendingJobs({
        userPrefs,
        productDispatch,
        includeBlocked: false,
      });
      setQueueStatus(result);
      await refreshQueueStatus();
      return result;
    } finally {
      setQueueBusy(false);
    }
  }, [productDispatch, refreshQueueStatus, userPrefs]);

  const handleClearBlockedJobs = useCallback(async () => {
    setQueueBusy(true);
    try {
      const result = await clearBlockedJobs();
      setQueueStatus(result);
      await refreshQueueStatus();
    } finally {
      setQueueBusy(false);
    }
  }, [refreshQueueStatus]);

  const queueCards = useMemo(() => ([
    { label: 'Pending', value: queueStatus.pending || 0, color: '#F59E0B' },
    { label: 'Running', value: queueStatus.running || 0, color: '#2563EB' },
    { label: 'Blocked', value: queueStatus.blocked || 0, color: '#DC2626' },
    { label: 'Done', value: queueStatus.completed || 0, color: '#16A34A' },
  ]), [queueStatus]);

  return (
    <View style={styles.tabContent}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="link-outline" size={20} color="#0F766E" />
          <Text style={styles.cardTitle}>Provider Connections</Text>
        </View>
        <Text style={styles.cardSubtitle}>
          Save endpoints, multiple API keys, and multiple text models for Gemini, Nvidia NIM, Ollama, or any OpenAI-compatible backend.
        </Text>
        <View style={styles.apiBtnRow}>
          <TouchableOpacity style={styles.testBtn} onPress={handleTestChain} disabled={chainBusy} activeOpacity={0.8}>
            {chainBusy ? (
              <ActivityIndicator size="small" color="#4338CA" />
            ) : (
              <>
                <Ionicons name="trail-sign-outline" size={16} color="#4338CA" />
                <Text style={styles.testBtnText}>Test Full Fallback Chain</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
        {chainValidation ? (
          <View style={[styles.resultBanner, { marginTop: 12, backgroundColor: getValidationColors(chainValidation).backgroundColor, borderColor: getValidationColors(chainValidation).borderColor }]}>
            <Ionicons name={getValidationColors(chainValidation).icon} size={18} color={getValidationColors(chainValidation).color} />
            <Text style={[styles.resultMessage, { flex: 1, color: getValidationColors(chainValidation).color }]}>
              {chainValidation.message}
            </Text>
          </View>
        ) : null}
        <RouteTrace attempts={chainValidation?.attempts || []} />
      </View>

      {providers.map((provider) => {
        const draft = draftProviders[provider.id] || {};
        const validation = providerValidation[provider.id];
        const validationColors = getValidationColors(validation);
        const hasUnsavedProvider = (
          (draft.baseUrl || '') !== (provider.baseUrl || '')
          || !arraysEqual((draft.apiKeys || []).map((value) => value.trim()).filter(Boolean), provider.apiKeys || [])
          || !arraysEqual((draft.textModels || []).map((value) => value.trim()).filter(Boolean), provider.textModels || [])
          || Boolean(draft.enabled) !== Boolean(provider.enabled)
        );

        return (
          <View key={provider.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="server-outline" size={20} color={provider.id === activeProviderId ? '#4338CA' : '#64748B'} />
              <Text style={styles.cardTitle}>{provider.label}</Text>
              <View style={styles.providerKindBadge}>
                <Text style={styles.providerKindText}>{getProviderKindLabel(provider.kind)}</Text>
              </View>
            </View>

            <View style={styles.providerRowFooter}>
              <Text style={styles.providerMetaText}>
                {provider.id === activeProviderId ? 'Primary route in the fallback chain' : `Priority ${provider.priority + 1} fallback`}
              </Text>
              <Text style={styles.providerMetaText}>
                {draft.enabled ? 'Enabled' : 'Disabled'}
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Endpoint</Text>
              <View style={styles.apiInputRow}>
                <TextInput
                  style={[styles.apiInput, { flex: 1 }]}
                  placeholder="https://your-endpoint"
                  value={draft.baseUrl}
                  onChangeText={(value) => updateProviderDraftField(provider.id, 'baseUrl', value)}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            <ListField
              label="API Keys"
              values={draft.apiKeys || ['']}
              placeholder={provider.kind === 'ollama' ? 'Optional for secured Ollama setups' : 'Enter API key'}
              onChangeList={(value) => updateProviderDraftList(provider.id, 'apiKeys', value)}
              secureTextEntry
              showSecrets={Boolean(showProviderSecrets[provider.id])}
              onToggleSecrets={() => toggleProviderSecret(provider.id)}
            />

            <ListField
              label="Text Models"
              values={draft.textModels || ['']}
              placeholder="Enter text model id"
              onChangeList={(value) => updateProviderDraftList(provider.id, 'textModels', value)}
            />

            <TouchableOpacity
              style={[styles.providerToggle, draft.enabled && styles.providerToggleOn]}
              onPress={() => updateProviderDraftField(provider.id, 'enabled', !draft.enabled)}
              activeOpacity={0.8}
            >
              <Ionicons name={draft.enabled ? 'checkmark-circle' : 'close-circle-outline'} size={16} color={draft.enabled ? '#166534' : '#64748B'} />
              <Text style={[styles.providerToggleText, draft.enabled && styles.providerToggleTextOn]}>
                {draft.enabled ? 'Provider enabled for automatic fallback' : 'Provider disabled'}
              </Text>
            </TouchableOpacity>

            <View style={styles.apiBtnRow}>
              <TouchableOpacity
                style={[styles.saveBtn, !hasUnsavedProvider && styles.saveBtnDisabled]}
                onPress={() => handleSaveProvider(provider.id)}
                disabled={!hasUnsavedProvider}
                activeOpacity={0.8}
              >
                <Ionicons name="save-outline" size={16} color="#FFF" />
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.testBtn}
                onPress={() => handleTestProvider(provider)}
                disabled={providerBusy[provider.id]}
                activeOpacity={0.8}
              >
                {providerBusy[provider.id] ? (
                  <ActivityIndicator size="small" color="#4338CA" />
                ) : (
                  <>
                    <Ionicons name="flask-outline" size={16} color="#4338CA" />
                    <Text style={styles.testBtnText}>Test Provider</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {(draft.apiKeys || []).filter((value) => value.trim()).length > 0 ? (
              <View style={styles.keyPreviewStack}>
                {(draft.apiKeys || []).filter((value) => value.trim()).slice(0, 3).map((apiKey, index) => (
                  <Text key={`${provider.id}-key-${index}`} style={styles.providerMetaText}>
                    Key {index + 1}: {maskApiKey(apiKey)}
                  </Text>
                ))}
              </View>
            ) : null}

            {validation ? (
              <View style={[styles.resultBanner, { backgroundColor: validationColors.backgroundColor, borderColor: validationColors.borderColor, marginTop: 12 }]}>
                <Ionicons name={validationColors.icon} size={18} color={validationColors.color} />
                <Text style={[styles.resultMessage, { flex: 1, color: validationColors.color }]}>
                  {validation.message}
                </Text>
              </View>
            ) : null}
          </View>
        );
      })}

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="nutrition-outline" size={20} color={offConfigured ? '#16A34A' : '#64748B'} />
          <Text style={styles.cardTitle}>Open Food Facts</Text>
        </View>
        <Text style={styles.cardSubtitle}>
          These credentials are used for syncing the product name and 3 images to Open Food Facts. Use your OFF username, not your email. The app also sends its name, version, and this contact email in the OFF-compliant User-Agent.
        </Text>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Username (not email)</Text>
          <View style={styles.apiInputRow}>
            <TextInput
              style={[styles.apiInput, { flex: 1 }]}
              placeholder="Your Open Food Facts username"
              value={localOFFUser}
              onChangeText={setLocalOFFUser}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Password</Text>
          <View style={styles.apiInputRow}>
            <TextInput
              style={[styles.apiInput, { flex: 1 }]}
              placeholder="Your Open Food Facts password"
              value={localOFFPass}
              onChangeText={setLocalOFFPass}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!showOFFPass}
            />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowOFFPass((value) => !value)} activeOpacity={0.7}>
              <Ionicons name={showOFFPass ? 'eye-off' : 'eye'} size={20} color="#64748B" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>User-Agent Contact Email</Text>
          <View style={styles.apiInputRow}>
            <TextInput
              style={[styles.apiInput, { flex: 1 }]}
              placeholder="contact@ffads.app"
              value={localOFFContact}
              onChangeText={setLocalOFFContact}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
          </View>
        </View>

        <View style={styles.apiBtnRow}>
          <TouchableOpacity
            style={[styles.saveBtn, !hasUnsavedOFF && styles.saveBtnDisabled]}
            onPress={handleSaveOFF}
            disabled={!hasUnsavedOFF}
            activeOpacity={0.8}
          >
            <Ionicons name="save-outline" size={16} color="#FFF" />
            <Text style={styles.saveBtnText}>Save OFF Credentials</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.resultBanner, { marginTop: 12, backgroundColor: offConfigured ? '#DCFCE7' : '#FEF3C7', borderColor: offConfigured ? '#86EFAC' : '#FCD34D' }]}>
          <Ionicons name={offConfigured ? 'checkmark-circle' : 'alert-circle'} size={18} color={offConfigured ? '#16A34A' : '#D97706'} />
          <Text style={[styles.resultMessage, { flex: 1, color: offConfigured ? '#166534' : '#92400E' }]}>
            {offConfigured
              ? `Configured as ${userPrefs.offUsername}. User-Agent contact: ${userPrefs.offContactEmail || 'contact@ffads.app'}`
              : 'No OFF credentials saved yet. Image sync jobs will stay blocked until you add them.'}
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="server-outline" size={20} color={supabaseResult?.connected ? '#16A34A' : '#0F766E'} />
          <Text style={styles.cardTitle}>Supabase Database</Text>
        </View>
        <Text style={styles.cardSubtitle}>
          Supabase stores user-linked text, OCR results, personal QR products, and processing telemetry.
        </Text>

        {/* ENV-sourced status — no editable inputs */}
        <View style={[styles.resultBanner, { marginTop: 4, backgroundColor: supabaseConfigured ? '#EFF6FF' : '#FEF3C7', borderColor: supabaseConfigured ? '#BFDBFE' : '#FCD34D' }]}>
          <Ionicons
            name={supabaseConfigured ? 'checkmark-circle-outline' : 'alert-circle'}
            size={18}
            color={supabaseConfigured ? '#2563EB' : '#D97706'}
          />
          <Text style={[styles.resultMessage, { flex: 1, color: supabaseConfigured ? '#1D4ED8' : '#92400E' }]}>
            {supabaseConfigured
              ? `Configured from .env  ·  ${(process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/^https?:\/\//, '').substring(0, 36)}…`
              : 'Not configured — set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env file, then restart Expo with --clear.'}
          </Text>
        </View>

        <View style={[styles.apiBtnRow, { marginTop: 12 }]}>
          <TouchableOpacity style={styles.testBtn} onPress={handlePingSupabase} disabled={supabasePinging || !supabaseConfigured} activeOpacity={0.8}>
            {supabasePinging ? (
              <ActivityIndicator size="small" color="#4338CA" />
            ) : (
              <>
                <Ionicons name="pulse-outline" size={16} color="#4338CA" />
                <Text style={styles.testBtnText}>Ping Supabase</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {supabaseResult ? (
          <View style={[styles.resultBanner, { marginTop: 12, backgroundColor: supabaseResult.connected ? '#DCFCE7' : '#FEE2E2', borderColor: supabaseResult.connected ? '#86EFAC' : '#FCA5A5' }]}>
            <Ionicons name={supabaseResult.connected ? 'checkmark-circle' : 'close-circle'} size={18} color={supabaseResult.connected ? '#16A34A' : '#DC2626'} />
            <Text style={[styles.resultMessage, { flex: 1, color: supabaseResult.connected ? '#166534' : '#991B1B' }]}>
              {supabaseResult.message}
              {supabaseResult.latencyMs != null ? ` (${supabaseResult.latencyMs}ms)` : ''}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="sync-outline" size={20} color="#4338CA" />
          <Text style={styles.cardTitle}>Queue Diagnostics</Text>
        </View>
        <Text style={styles.cardSubtitle}>
          The queue tracks OFF upload, local OCR, text-based AI cleanup attempts, and Supabase persistence. Note: Images are NEVER sent to the AI backend; they are processed locally.
        </Text>

        <View style={styles.queueGrid}>
          {queueCards.map((card) => (
            <View key={card.label} style={styles.queueStatCard}>
              <Text style={[styles.queueStatValue, { color: card.color }]}>{card.value}</Text>
              <Text style={styles.queueStatLabel}>{card.label}</Text>
            </View>
          ))}
        </View>

        {queueStatus.lastError ? (
          <View style={[styles.resultBanner, { marginTop: 12, backgroundColor: '#F8FAFC', borderColor: '#CBD5E1' }]}>
            <Ionicons name="warning-outline" size={18} color="#475569" />
            <Text style={[styles.resultMessage, { flex: 1 }]}>
              Last queue error: {queueStatus.lastError}
            </Text>
          </View>
        ) : null}

        <View style={styles.apiBtnRow}>
          <TouchableOpacity style={styles.saveBtn} onPress={() => runQueue()} disabled={queueBusy} activeOpacity={0.8}>
            {queueBusy ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Ionicons name="play-outline" size={16} color="#FFF" />
                <Text style={styles.saveBtnText}>Retry Now</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.testBtn} onPress={refreshQueueStatus} disabled={queueBusy} activeOpacity={0.8}>
            <Ionicons name="refresh-outline" size={16} color="#4338CA" />
            <Text style={styles.testBtnText}>Refresh</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.apiBtnRow}>
          <TouchableOpacity style={styles.testBtn} onPress={() => runQueue({ requeueBlocked: true })} disabled={queueBusy} activeOpacity={0.8}>
            <Ionicons name="reload-outline" size={16} color="#4338CA" />
            <Text style={styles.testBtnText}>Retry Blocked</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.testBtn} onPress={handleClearBlockedJobs} disabled={queueBusy} activeOpacity={0.8}>
            <Ionicons name="trash-outline" size={16} color="#4338CA" />
            <Text style={styles.testBtnText}>Clear Blocked</Text>
          </TouchableOpacity>
        </View>

        <RouteTrace attempts={recentAttempts} />
      </View>

      <View style={[styles.card, styles.dangerCard]}>
        <View style={styles.cardHeader}>
          <Ionicons name="trash-outline" size={20} color="#DC2626" />
          <Text style={[styles.cardTitle, { color: '#DC2626' }]}>Danger Zone</Text>
        </View>
        <TouchableOpacity style={styles.dangerBtn} onPress={onClearHistory} activeOpacity={0.8}>
          <Ionicons name="trash-outline" size={18} color="#DC2626" />
          <Text style={styles.dangerBtnText}>Clear All Scan History</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
