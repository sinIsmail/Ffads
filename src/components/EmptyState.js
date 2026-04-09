// Ffads — Empty State Component
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';

export default function EmptyState({ icon = 'cube-outline', title, message, children }) {
  return (
    <View style={styles.container}>
      {icon && <Ionicons name={icon} size={64} color={colors.textMuted} style={styles.icon} />}
      <Text style={styles.title}>{title}</Text>
      {message && <Text style={styles.message}>{message}</Text>}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  icon: {
    marginBottom: 20,
    opacity: 0.4,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1A1A1A',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    fontWeight: '500',
    color: '#999',
    textAlign: 'center',
    lineHeight: 22,
  },
});
