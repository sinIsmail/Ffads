import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Animated } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing, borderRadius, shadows } from '../theme/spacing';

export default function AIQualityModal({ visible, onClose, quality, classifiedIngredients = [] }) {
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (visible) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      fadeAnim.setValue(0);
    }
  }, [visible]);

  if (!visible || !quality) return null;

  // Filter for ingredients the AI actively warned us about
  const riskyIngredients = classifiedIngredients.filter(ing => ing.health_risk_score >= 5 || ing.color === 'red' || ing.color === 'yellow');

  return (
    <Modal transparent visible={visible} animationType="fade">
      <BlurView intensity={20} tint="dark" style={styles.absoluteFill}>
        <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
          
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>AI Ingredient Analysis</Text>
              <Text style={styles.subtitle}>Gemini Toxicity Evaluation</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* The Receipt */}
            <View style={styles.receiptBox}>
               <View style={styles.receiptRow}>
                 <Text style={styles.receiptItem}>Base Ingredient Score</Text>
                 <Text style={[styles.receiptAmount, { color: colors.textSecondary }]}>100</Text>
               </View>
               
               <View style={styles.divider} />

               {/* Deductions from Quality logic */}
               {quality.deductions && quality.deductions.map((d, index) => (
                  <View key={`dq-${index}`} style={styles.receiptRow}>
                     <View style={styles.receiptItemCol}>
                       <Text style={styles.receiptItemText}>{d.reason}</Text>
                     </View>
                     <Text style={[styles.receiptAmount, { color: colors.danger }]}>-{d.amount}</Text>
                  </View>
               ))}
               
               {(!quality.deductions || quality.deductions.length === 0) && (
                 <Text style={styles.perfectText}>No risky ingredients detected!</Text>
               )}

               <View style={[styles.divider, { borderTopWidth: 2, borderStyle: 'solid' }]} />

               {/* Total */}
               <View style={styles.receiptRow}>
                 <Text style={styles.receiptTotal}>Final Score</Text>
                 <Text style={[styles.receiptTotalAmount, { color: quality.color }]}>{quality.score}</Text>
               </View>
            </View>

            {/* AI Ingredient Deep Dive */}
            {riskyIngredients.length > 0 && (
              <View style={styles.aiBreakdown}>
                <Text style={styles.sectionHeading}>Flagged Ingredients Insights</Text>
                
                {riskyIngredients.map((ing, idx) => (
                  <View key={`ing-${idx}`} style={styles.aiCard}>
                    <View style={styles.aiCardHeader}>
                       <Text style={styles.aiIngName}>{ing.name}</Text>
                       <View style={[styles.riskBadge, { backgroundColor: ing.color === 'red' || ing.health_risk_score >= 7 ? '#FEF2F2' : '#FEF3C7' }]}>
                          <Text style={[styles.riskLabel, { color: ing.color === 'red' || ing.health_risk_score >= 7 ? colors.danger : colors.warning }]}>
                            Risk: {ing.health_risk_score ? `${ing.health_risk_score} / 10` : 'High'}
                          </Text>
                       </View>
                    </View>
                    {ing.ai_justification && (
                      <Text style={styles.aiDesc}>"{ing.ai_justification}"</Text>
                    )}
                    {!ing.ai_justification && ing.definition && (
                      <Text style={styles.aiDesc}>{ing.definition}</Text>
                    )}
                  </View>
                ))}
              </View>
            )}

            <View style={styles.infoBox}>
               <Ionicons name="sparkles" size={20} color={colors.primaryDark} />
               <Text style={[styles.infoText, { color: colors.primaryDark }]}>
                 Verified globally by Gemini 1.5 Flash AI model.
               </Text>
            </View>
          </ScrollView>

        </Animated.View>
      </BlurView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  absoluteFill: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius['2xl'],
    maxHeight: '85%',
    ...shadows.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    ...typography.h3,
    color: colors.text,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: spacing.lg,
  },
  perfectText: {
    ...typography.body,
    color: colors.success,
    fontStyle: 'italic',
    paddingVertical: 4,
  },
  receiptBox: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  receiptItemCol: {
    flex: 1,
    paddingRight: 12,
  },
  receiptItem: {
    ...typography.bodyBold,
    color: colors.text,
  },
  receiptItemText: {
    ...typography.body,
    color: colors.text,
  },
  receiptAmount: {
    ...typography.bodyBold,
  },
  divider: {
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderTopColor: colors.border,
    marginVertical: 10,
  },
  receiptTotal: {
    ...typography.h4,
    color: colors.text,
  },
  receiptTotalAmount: {
    ...typography.h3,
  },
  
  sectionHeading: {
    ...typography.h4,
    color: colors.primaryDark,
    marginBottom: spacing.md,
  },
  aiBreakdown: {
    marginBottom: spacing.lg,
  },
  aiCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  aiCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  aiIngName: {
    ...typography.bodyBold,
    color: colors.text,
    textTransform: 'capitalize',
    flex: 1,
    paddingRight: 8,
  },
  riskBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  riskLabel: {
    fontSize: 11,
    fontWeight: '800',
  },
  aiDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
    fontStyle: 'italic',
  },

  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.primarySoft,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    gap: 8,
    marginBottom: spacing.xxl,
  },
  infoText: {
    flex: 1,
    ...typography.captionBold,
    lineHeight: 18,
  }
});
