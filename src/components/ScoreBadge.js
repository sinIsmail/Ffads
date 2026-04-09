// Ffads — Score Badge Component
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { getScoreColor } from '../utils/scoring';

export default function ScoreBadge({ score, size = 64, animated = true }) {
  const animValue = useRef(new Animated.Value(0)).current;
  const scaleValue = useRef(new Animated.Value(0.5)).current;
  const scoreColor = getScoreColor(score);

  useEffect(() => {
    if (animated) {
      Animated.parallel([
        Animated.timing(animValue, {
          toValue: score / 100,
          duration: 1200,
          useNativeDriver: false,
        }),
        Animated.spring(scaleValue, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      animValue.setValue(score / 100);
      scaleValue.setValue(1);
    }
  }, [score]);

  const displayScore = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 100],
  });

  const borderWidth = size * 0.06;
  const innerSize = size - borderWidth * 2;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth,
          borderColor: scoreColor,
          transform: [{ scale: scaleValue }],
        },
      ]}
    >
      <View
        style={[
          styles.inner,
          {
            width: innerSize,
            height: innerSize,
            borderRadius: innerSize / 2,
            backgroundColor: scoreColor + '15',
          },
        ]}
      >
        <AnimatedNumber value={displayScore} color={scoreColor} size={size} />
        <Text style={[styles.label, { fontSize: size * 0.15, color: scoreColor }]}>
          SCORE
        </Text>
      </View>
    </Animated.View>
  );
}

function AnimatedNumber({ value, color, size }) {
  const [displayValue, setDisplayValue] = React.useState(0);

  useEffect(() => {
    const listener = value.addListener(({ value: v }) => {
      setDisplayValue(Math.round(v));
    });
    return () => value.removeListener(listener);
  }, [value]);

  return (
    <Text style={[styles.score, { fontSize: size * 0.32, color }]}>
      {displayValue}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  score: {
    fontWeight: '800',
    letterSpacing: -1,
  },
  label: {
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: -2,
  },
});
