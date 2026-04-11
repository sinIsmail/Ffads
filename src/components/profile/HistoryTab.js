// Ffads — Profile: History Tab
import React from 'react';
import { View, Text } from 'react-native';
import AICardPreview from '../AICardPreview';
import { styles } from '../profile/profileStyles';

export default function HistoryTab({ history, onPressProduct }) {
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
