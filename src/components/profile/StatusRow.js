// Ffads — Profile: StatusRow utility component
import React from 'react';
import { View, Text } from 'react-native';
import { styles } from '../profile/profileStyles';

export default function StatusRow({ label, value, active }) {
  return (
    <View style={styles.statusRow}>
      <View style={[styles.statusDot, { backgroundColor: active ? '#22C55E' : '#F59E0B' }]} />
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={[styles.statusValue, { color: active ? '#22C55E' : '#F59E0B' }]}>{value}</Text>
    </View>
  );
}
