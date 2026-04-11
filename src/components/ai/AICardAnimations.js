// Ffads — AICard Animated Sub-components
import React, { useRef, useEffect } from 'react';
import { View, Text, Animated, Easing } from 'react-native';
import { styles } from './AICard.styles';

export function PulsingDot({ delay = 0 }) {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 600, delay, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return <Animated.View style={[styles.pulsingDot, { opacity }]} />;
}

export function ShimmerLine({ width = '80%', height = 12, style }) {
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shimmer, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const translateX = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-100, 250] });
  return (
    <View style={[{ width, height, backgroundColor: '#F1F5F9', borderRadius: 6, overflow: 'hidden', marginBottom: 8 }, style]}>
      <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, width: 80, backgroundColor: '#E2E8F0', borderRadius: 6, transform: [{ translateX }] }} />
    </View>
  );
}

export function ScoreCircle({ score }) {
  const color = score >= 70 ? '#059669' : score >= 40 ? '#D97706' : '#DC2626';
  const bg    = score >= 70 ? '#ECFDF5' : score >= 40 ? '#FFFBEB' : '#FEF2F2';
  const label = score >= 70 ? 'SAFE'    : score >= 40 ? 'CAUTION'  : 'RISKY';
  const scaleAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(scaleAnim, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }).start();
  }, []);
  return (
    <Animated.View style={[styles.scoreOuter, { borderColor: color, transform: [{ scale: scaleAnim }] }]}>
      <View style={[styles.scoreInner, { backgroundColor: bg }]}>
        <Text style={[styles.scoreNum, { color }]}>{score}</Text>
        <Text style={[styles.scoreSlash, { color: color + 'AA' }]}>/100</Text>
      </View>
      <View style={[styles.scoreBadge, { backgroundColor: color }]}>
        <Text style={styles.scoreBadgeText}>{label}</Text>
      </View>
    </Animated.View>
  );
}
