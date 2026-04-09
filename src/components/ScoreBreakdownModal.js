import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Animated } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing, borderRadius, shadows } from '../theme/spacing';

export default function ScoreBreakdownModal({ visible, onClose, macro }) {
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

  if (!visible || !macro) return null;

  return (
    <Modal transparent visible={visible} animationType="fade">
      <BlurView intensity={20} tint="dark" style={styles.absoluteFill}>
        <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
          
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Macro Analysis</Text>
              <Text style={styles.subtitle}>WHO Threshold Mathematics</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* The Receipt */}
            <View style={styles.receiptBox}>
               <View style={styles.receiptRow}>
                 <Text style={styles.receiptItem}>Base Score</Text>
                 <Text style={[styles.receiptAmount, { color: colors.textSecondary }]}>100</Text>
               </View>
               
               <View style={styles.divider} />

               {/* Deductions */}
               {macro.deductions && macro.deductions.map((d, index) => (
                  <View key={`d-${index}`} style={styles.receiptRow}>
                     <View style={styles.receiptItemCol}>
                       <Text style={styles.receiptItemText}>{d.reason}</Text>
                       {d.detail && <Text style={styles.receiptItemDetail}>{d.detail}</Text>}
                     </View>
                     <Text style={[styles.receiptAmount, { color: colors.danger }]}>-{d.amount}</Text>
                  </View>
               ))}

               {/* Bonuses */}
               {macro.bonuses && macro.bonuses.map((b, index) => (
                  <View key={`b-${index}`} style={styles.receiptRow}>
                     <View style={styles.receiptItemCol}>
                       <Text style={styles.receiptItemText}>{b.reason}</Text>
                       {b.detail && <Text style={styles.receiptItemDetail}>{b.detail}</Text>}
                     </View>
                     <Text style={[styles.receiptAmount, { color: b.amount > 0 ? colors.success : colors.textMuted }]}>
                       {b.amount > 0 ? `+${b.amount}` : '0'}
                     </Text>
                  </View>
               ))}

               <View style={[styles.divider, { borderTopWidth: 2, borderStyle: 'solid' }]} />

               {/* Total */}
               <View style={styles.receiptRow}>
                 <Text style={styles.receiptTotal}>Final Score</Text>
                 <Text style={[styles.receiptTotalAmount, { color: macro.color }]}>{macro.score}</Text>
               </View>
            </View>

            <View style={styles.infoBox}>
               <Ionicons name="information-circle-outline" size={20} color={colors.textSecondary} />
               <Text style={styles.infoText}>
                 This score is derived purely from WHO macronutrient limits (Sugar, Fat, Sodium).
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
    maxHeight: '80%',
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
  receiptBox: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
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
  receiptItemDetail: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
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
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    gap: 8,
    marginBottom: spacing.xxl,
  },
  infoText: {
    flex: 1,
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  }
});
