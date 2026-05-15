import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { validateProvider } from '../../services/ai';
import { styles } from '../profile/profileStyles';

function getActiveProvider(userPrefs) {
  const providers = userPrefs?.providers || [];
  return providers.find((provider) => provider.id === userPrefs?.activeProviderId) || providers[0] || null;
}

function getKindLabel(kind) {
  if (kind === 'gemini') return 'Gemini';
  if (kind === 'ollama') return 'Ollama';
  return 'OpenAI-Compatible';
}

export default function AITab({ userPrefs, userDispatch }) {
  const providers = userPrefs.providers || [];
  const activeProvider = useMemo(() => getActiveProvider(userPrefs), [userPrefs]);
  const [testingActive, setTestingActive] = useState(false);
  const [activeValidation, setActiveValidation] = useState(null);

  const handleSelectProvider = (providerId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    userDispatch({ type: 'SET_ACTIVE_PROVIDER', payload: providerId });
  };

  const moveProvider = (providerId, direction) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    userDispatch({
      type: 'MOVE_PROVIDER_PRIORITY',
      payload: {
        id: providerId,
        direction,
      },
    });
  };

  const handleTestActive = async () => {
    if (!activeProvider) return;
    setTestingActive(true);
    try {
      const result = await validateProvider(activeProvider);
      setActiveValidation(result);
    } finally {
      setTestingActive(false);
    }
  };

  return (
    <View style={styles.tabContent}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="git-network-outline" size={20} color="#4338CA" />
          <Text style={styles.cardTitle}>AI Routing Priority</Text>
        </View>
        <Text style={styles.cardSubtitle}>
          Pick the primary provider here. If a request fails, the app automatically walks the remaining enabled providers in this order.
        </Text>

        {providers.map((provider, index) => {
          const selected = provider.id === userPrefs.activeProviderId;
          return (
            <TouchableOpacity
              key={provider.id}
              style={[styles.providerChoice, selected && styles.providerChoiceActive]}
              onPress={() => handleSelectProvider(provider.id)}
              activeOpacity={0.8}
            >
              <View style={styles.providerChoiceHeader}>
                <View style={[styles.modelRadio, selected && styles.modelRadioOn]}>
                  {selected && <View style={styles.modelRadioDot} />}
                </View>
                <View style={styles.modelInfo}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <Text style={[styles.modelName, selected && styles.modelNameOn]}>{provider.label}</Text>
                    <View style={styles.providerKindBadge}>
                      <Text style={styles.providerKindText}>{getKindLabel(provider.kind)}</Text>
                    </View>
                    {provider.supportsVision ? (
                      <View style={[styles.providerKindBadge, { backgroundColor: '#DCFCE7' }]}>
                        <Text style={[styles.providerKindText, { color: '#166534' }]}>Vision Test</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.modelDesc}>
                    {provider.baseUrl || 'No endpoint saved yet'}
                  </Text>
                  <View style={styles.providerRowFooter}>
                    <Text style={styles.providerMetaText}>Priority {index + 1}</Text>
                    <Text style={styles.providerMetaText}>
                      Keys: {provider.apiKeys?.length || 0}
                    </Text>
                    <Text style={styles.providerMetaText}>
                      Text models: {provider.textModels?.length || 0}
                    </Text>
                    <Text style={styles.providerMetaText}>
                      {provider.enabled ? 'Enabled' : 'Disabled'}
                    </Text>
                  </View>
                </View>
                <View style={styles.priorityControls}>
                  <TouchableOpacity
                    style={styles.iconActionBtn}
                    onPress={() => moveProvider(provider.id, 'up')}
                    disabled={index === 0}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="chevron-up" size={16} color={index === 0 ? '#CBD5E1' : '#334155'} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.iconActionBtn}
                    onPress={() => moveProvider(provider.id, 'down')}
                    disabled={index === providers.length - 1}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="chevron-down" size={16} color={index === providers.length - 1 ? '#CBD5E1' : '#334155'} />
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {activeProvider ? (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="hardware-chip-outline" size={20} color="#0F766E" />
            <Text style={styles.cardTitle}>Active Route Summary</Text>
          </View>
          <Text style={styles.cardSubtitle}>
            OCR cleanup and deep analysis try the active provider first, then fall back through the remaining enabled providers.
          </Text>

          <View style={styles.helperNote}>
            <Ionicons name="information-circle-outline" size={16} color="#475569" />
            <Text style={styles.helperNoteText}>
              Active text route: {activeProvider.label} using {activeProvider.textModels?.[0] || 'no text model'} and {activeProvider.apiKeys?.length || 0} configured API key(s).
            </Text>
          </View>

          {activeProvider.textModels?.slice(0, 3).map((model, index) => (
            <View key={`${activeProvider.id}-text-${model}-${index}`} style={styles.summaryPill}>
              <Ionicons name="code-working-outline" size={14} color="#4338CA" />
              <Text style={styles.summaryPillText}>Text model {index + 1}: {model}</Text>
            </View>
          ))}

          {activeProvider.visionModels?.slice(0, 3).map((model, index) => (
            <View key={`${activeProvider.id}-vision-${model}-${index}`} style={styles.summaryPill}>
              <Ionicons name="images-outline" size={14} color="#0F766E" />
              <Text style={styles.summaryPillText}>Vision test model {index + 1}: {model}</Text>
            </View>
          ))}

          <View style={styles.apiBtnRow}>
            <TouchableOpacity style={styles.testBtn} onPress={handleTestActive} disabled={testingActive} activeOpacity={0.8}>
              {testingActive ? (
                <ActivityIndicator size="small" color="#4338CA" />
              ) : (
                <>
                  <Ionicons name="flask-outline" size={16} color="#4338CA" />
                  <Text style={styles.testBtnText}>Test Current Route</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {activeValidation ? (
            <View style={[styles.resultBanner, { marginTop: 12, backgroundColor: activeValidation.valid ? '#DCFCE7' : '#FEE2E2', borderColor: activeValidation.valid ? '#86EFAC' : '#FCA5A5' }]}>
              <Ionicons name={activeValidation.valid ? 'checkmark-circle' : 'close-circle'} size={18} color={activeValidation.valid ? '#16A34A' : '#DC2626'} />
              <Text style={[styles.resultMessage, { flex: 1, color: activeValidation.valid ? '#166534' : '#991B1B' }]}>
                {activeValidation.message}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
