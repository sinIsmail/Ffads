// Ffads — Custom Animated Floating Tab Bar
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Platform, Animated } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../theme/colors';
import { borderRadius, shadows } from '../theme/spacing';

const TAB_CONFIG = {
  Compare: { icon: 'swap-horizontal', iconFocused: 'swap-horizontal', label: 'Compare' },
  Scanner: { icon: 'scan-outline', iconFocused: 'scan', label: 'Scanner' },
  Profile: { icon: 'person-outline', iconFocused: 'person', label: 'Profile' },
};

function TabItem({ route, index, state, descriptors, navigation }) {
  const isFocused = state.index === index;
  const config = TAB_CONFIG[route.name] || {};
  
  // Animation value for scaling
  const scale = useRef(new Animated.Value(isFocused ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: isFocused ? 1 : 0,
      useNativeDriver: false,
      friction: 6,
      tension: 120,
    }).start();
  }, [isFocused]);

  const onPress = () => {
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (!isFocused && !event.defaultPrevented) {
      Haptics.selectionAsync(); // Premium haptic bump
      navigation.navigate(route.name);
    }
  };

  const bgColor = scale.interpolate({
    inputRange: [0, 1],
    outputRange: ['transparent', colors.primarySoft],
  });

  const iconY = scale.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -2],
  });

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={styles.tabButton}
    >
      <Animated.View style={[styles.tabContent, { backgroundColor: bgColor }]}>
        <Animated.View style={{ transform: [{ translateY: iconY }] }}>
          <Ionicons
            name={isFocused ? config.iconFocused : config.icon}
            size={isFocused ? 24 : 22}
            color={isFocused ? colors.primaryDark : colors.textMuted}
          />
        </Animated.View>
        
        {isFocused && (
          <Animated.Text 
            style={[styles.label, { opacity: scale, transform: [{ scale }] }]}
            numberOfLines={1}
          >
            {config.label}
          </Animated.Text>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

export default function FloatingTabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets();
  
  return (
    <View style={[styles.wrapper, { bottom: (Platform.OS === 'ios' ? 24 : 16) + insets.bottom }]}>
      <BlurView intensity={70} tint="light" style={[styles.container, shadows.lg]}>
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
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 20,
    right: 20,
    borderRadius: borderRadius['2xl'],
    overflow: 'hidden', // Ensures BlurView respects border radius on iOS
  },
  container: {
    flexDirection: 'row',
    borderRadius: borderRadius['2xl'],
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.6)', // Base translucency
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: borderRadius.xl,
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primaryDark,
  },
});
