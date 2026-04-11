// Ffads — Profile: AI Tab (Gemini Model selector)
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../../theme/colors';
import { GEMINI_MODELS } from '../../utils/constants';
import { styles } from '../profile/profileStyles';

const TAG_COLORS = {
  recommended: { bg: '#22C55E20', text: '#16A34A' },
  fast:        { bg: '#3B82F620', text: '#2563EB' },
  powerful:    { bg: '#A855F720', text: '#7C3AED' },
  legacy:      { bg: '#F59E0B20', text: '#D97706' },
};

export default function AITab({ userPrefs, userDispatch }) {
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
