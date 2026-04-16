// Ffads — Floating Tab Bar (White Niche Redesign)
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Platform, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

// Design tokens — white niche, black accent
const C = {
  white:    '#FFFFFF',
  ink:      '#0A0A0A',
  inkSoft:  '#9A9A9A',
  inkFaint: '#EFEFEF',
  border:   '#E5E5E5',
};

const TAB_CONFIG = {
  Compare: { icon: 'swap-horizontal-outline', iconFocused: 'swap-horizontal', label: 'Compare' },
  Scanner: { icon: 'scan-outline',            iconFocused: 'scan',            label: 'Scanner' },
  Profile: { icon: 'person-outline',          iconFocused: 'person',          label: 'Profile'  },
};

function TabItem({ route, index, state, navigation }) {
  const isFocused = state.index === index;
  const config = TAB_CONFIG[route.name] || {};

  // Active indicator width — slides from 0 to full
  const activeAnim = useRef(new Animated.Value(isFocused ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(activeAnim, {
      toValue: isFocused ? 1 : 0,
      useNativeDriver: false,
      friction: 8,
      tension: 140,
    }).start();
  }, [isFocused]);

  const onPress = () => {
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (!isFocused && !event.defaultPrevented) {
      Haptics.selectionAsync();
      navigation.navigate(route.name);
    }
  };

  // Pill background — transparent → very light grey
  const pillBg = activeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(0,0,0,0)', 'rgba(0,0,0,0.05)'],
  });

  const iconY = activeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -1],
  });

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={styles.tabButton}>
      <Animated.View style={[styles.tabPill, { backgroundColor: pillBg }]}>

        {/* Icon */}
        <Animated.View style={{ transform: [{ translateY: iconY }] }}>
          <Ionicons
            name={isFocused ? config.iconFocused : config.icon}
            size={isFocused ? 22 : 21}
            color={isFocused ? C.ink : C.inkSoft}
          />
        </Animated.View>

        {/* Label — only when focused */}
        {isFocused && (
          <Animated.Text style={[styles.label, { opacity: activeAnim }]} numberOfLines={1}>
            {config.label}
          </Animated.Text>
        )}
      </Animated.View>

      {/* Thin dot indicator below icon */}
      <Animated.View
        style={[
          styles.dot,
          {
            opacity: activeAnim,
            transform: [{ scaleX: activeAnim }],
          },
        ]}
      />
    </TouchableOpacity>
  );
}

export default function FloatingTabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.wrapper,
        { bottom: (Platform.OS === 'ios' ? 28 : 18) + insets.bottom },
      ]}
    >
      <View style={styles.container}>
        {state.routes.map((route, index) => (
          <TabItem
            key={route.key}
            route={route}
            index={index}
            state={state}
            descriptors={descriptors}
            navigation={navigation}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 24,
    right: 24,
    // Drop shadow — very subtle, editorial
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.10,
    shadowRadius: 24,
    elevation: 12,
  },
  container: {
    flexDirection: 'row',
    backgroundColor: C.white,
    borderRadius: 28,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    gap: 5,
    minWidth: 46,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: C.ink,
    letterSpacing: -0.2,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.ink,
    marginTop: 4,
  },
});
