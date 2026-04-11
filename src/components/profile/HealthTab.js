// Ffads — Profile: Health Preferences (Functional — affects product scoring)
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ALLERGEN_LIST, DIET_TYPES, HEALTH_CONDITIONS, HEALTH_MODES } from '../../utils/constants';

export default function HealthTab({ userPrefs, userDispatch }) {
  const healthModeKeys = Object.keys(HEALTH_MODES);

  return (
    <View style={s.container}>

      {/* ── Health Conditions ── */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <Text style={s.cardIcon}>🩺</Text>
          <View style={s.cardTitleBlock}>
            <Text style={s.cardTitle}>Health Conditions</Text>
            <Text style={s.cardDesc}>
              Select conditions you have. Scoring penalties for related nutrients will be amplified automatically.
            </Text>
          </View>
        </View>

        <View style={s.grid}>
          {HEALTH_CONDITIONS.map(cond => {
            const active = (userPrefs.healthConditions || []).includes(cond.id);
            return (
              <TouchableOpacity
                key={cond.id}
                style={[s.conditionCard, active && s.conditionCardActive]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  userDispatch({ type: 'TOGGLE_HEALTH_CONDITION', payload: cond.id });
                }}
                activeOpacity={0.7}
              >
                <Text style={s.condIcon}>{cond.icon}</Text>
                <Text style={[s.condLabel, active && s.condLabelActive]}>{cond.label}</Text>
                <Text style={s.condDesc}>{cond.desc}</Text>
                {active && (
                  <View style={s.activeCheck}>
                    <Ionicons name="checkmark" size={12} color="#FFF" />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {(userPrefs.healthConditions || []).length > 0 && (
          <View style={s.infoBanner}>
            <Ionicons name="information-circle" size={16} color="#0369A1" />
            <Text style={s.infoText}>
              Product scores will be stricter for {(userPrefs.healthConditions || []).map(id => {
                const c = HEALTH_CONDITIONS.find(h => h.id === id);
                return c ? c.label : id;
              }).join(', ')}
            </Text>
          </View>
        )}
      </View>



      {/* ── Allergies ── */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <Text style={s.cardIcon}>⚠️</Text>
          <View style={s.cardTitleBlock}>
            <Text style={s.cardTitle}>Allergy Alerts</Text>
            <Text style={s.cardDesc}>
              Products containing these allergens will trigger warnings and score deductions.
            </Text>
          </View>
        </View>

        <View style={s.chipGrid}>
          {ALLERGEN_LIST.map(allergen => {
            const active = userPrefs.allergies.includes(allergen.id);
            return (
              <TouchableOpacity
                key={allergen.id}
                style={[s.chip, active && s.chipActive]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  userDispatch({ type: 'TOGGLE_ALLERGY', payload: allergen.id });
                }}
                activeOpacity={0.7}
              >
                <Text style={s.chipEmoji}>{allergen.emoji}</Text>
                <Text style={[s.chipLabel, active && s.chipLabelActive]}>{allergen.label}</Text>
                {active && <Ionicons name="checkmark-circle" size={14} color="#DC2626" style={{ marginLeft: 4 }} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── Diet ── */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <Text style={s.cardIcon}>🍽️</Text>
          <View style={s.cardTitleBlock}>
            <Text style={s.cardTitle}>Diet Type</Text>
            <Text style={s.cardDesc}>Affects how the AI evaluates animal-derived ingredients.</Text>
          </View>
        </View>

        <View style={s.dietGrid}>
          {DIET_TYPES.map(diet => {
            const active = userPrefs.diet === diet.id;
            return (
              <TouchableOpacity
                key={diet.id}
                style={[s.dietCard, active && s.dietCardActive]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  userDispatch({ type: 'SET_DIET', payload: diet.id });
                }}
                activeOpacity={0.7}
              >
                <Text style={s.dietIcon}>{diet.icon}</Text>
                <Text style={[s.dietLabel, active && s.dietLabelActive]}>{diet.label}</Text>
                <Text style={s.dietDesc}>{diet.desc}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

    </View>
  );
}

const s = StyleSheet.create({
  container: { gap: 20 },

  card: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)',
  },
  cardHeader: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  cardIcon: { fontSize: 24, marginTop: 2 },
  cardTitleBlock: { flex: 1 },
  cardTitle: { fontSize: 17, fontWeight: '800', color: '#1A1A1A', marginBottom: 4 },
  cardDesc: { fontSize: 13, color: '#999', lineHeight: 18 },

  // Health Conditions grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  conditionCard: {
    width: '47%', backgroundColor: '#F9F9F6', borderRadius: 16,
    padding: 14, borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.06)',
    position: 'relative',
  },
  conditionCardActive: {
    backgroundColor: '#EEF2FF', borderColor: '#6366F1',
  },
  condIcon: { fontSize: 24, marginBottom: 6 },
  condLabel: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', marginBottom: 2 },
  condLabelActive: { color: '#4338CA' },
  condDesc: { fontSize: 11, color: '#999', lineHeight: 14 },
  activeCheck: {
    position: 'absolute', top: 10, right: 10,
    backgroundColor: '#6366F1', width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    marginTop: 14, padding: 12, borderRadius: 12,
    backgroundColor: '#E0F2FE', borderWidth: 1, borderColor: '#BAE6FD',
  },
  infoText: { fontSize: 12, color: '#0369A1', flex: 1, lineHeight: 16 },

  // Scoring mode
  modeRow: { flexDirection: 'row', gap: 10 },
  modePill: {
    flex: 1, backgroundColor: '#F9F9F6', borderRadius: 16,
    padding: 14, alignItems: 'center',
    borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.06)',
  },
  modePillActive: { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' },
  modeIcon: { fontSize: 24, marginBottom: 6 },
  modeLabel: { fontSize: 13, fontWeight: '800', color: '#1A1A1A', marginBottom: 2 },
  modeLabelActive: { color: '#92400E' },
  modeDesc: { fontSize: 10, color: '#999', textAlign: 'center', lineHeight: 13 },

  // Allergens
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F9F9F6', borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.06)',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8,
  },
  chipActive: { backgroundColor: '#FEF2F2', borderColor: '#DC2626' },
  chipEmoji: { fontSize: 14 },
  chipLabel: { fontSize: 12, fontWeight: '600', color: '#666' },
  chipLabelActive: { color: '#DC2626', fontWeight: '700' },

  // Diet
  dietGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  dietCard: {
    width: '47%', backgroundColor: '#F9F9F6', borderRadius: 16,
    padding: 14, alignItems: 'center',
    borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.06)',
  },
  dietCardActive: { backgroundColor: '#ECFDF5', borderColor: '#059669' },
  dietIcon: { fontSize: 28, marginBottom: 6 },
  dietLabel: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', marginBottom: 2 },
  dietLabelActive: { color: '#059669' },
  dietDesc: { fontSize: 11, color: '#999' },
});
