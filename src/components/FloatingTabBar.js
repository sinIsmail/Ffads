// Ffads — Floating Tab Bar (Sliding Pill, Reanimated 3)
//
// Architecture: Option B — one absolute sliding pill behind icon/label layers.
// • translate/scale on the pill = UI-thread only, zero layout thrashing.
// • Pill starts opacity:0, revealed only after first onLayout resolves (no flash).
// • Labels fade in/out independently from the pill slide.
// • hitSlop keeps inactive icon-only targets large enough to tap.
// • Spring config: stiff + slightly bouncy for a physical, weighted feel.

import React, { useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTabTransition } from '../navigation/TabTransitionContext';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  white:    '#FFFFFF',
  ink:      '#0A0A0A',
  inkSoft:  '#9A9A9A',
  border:   '#E5E5E5',
  bg:       '#FFFFFF',
};

// ─── Tab definitions ──────────────────────────────────────────────────────────
const TABS = [
  { name: 'Compare', icon: 'swap-horizontal-outline', iconActive: 'swap-horizontal', label: 'Compare' },
  { name: 'Scanner', icon: 'scan-outline',            iconActive: 'scan',            label: 'Scanner'  },
  { name: 'Profile', icon: 'person-outline',          iconActive: 'person',          label: 'Profile'  },
];

// ─── Spring configs ───────────────────────────────────────────────────────────
const PILL_SPRING  = { damping: 22, stiffness: 200, mass: 0.8 };  // slide — weighted glide
const SNAP_SPRING  = { damping: 14, stiffness: 160, mass: 0.6 };  // snap-back — bouncy shrink
const LABEL_SPRING = { damping: 22, stiffness: 200, mass: 0.6 };  // label fade

// ─── Main component ───────────────────────────────────────────────────────────
export default function FloatingTabBar({ state, navigation }) {
  const insets = useSafeAreaInsets();
  const tabCount = TABS.length;
  const { directionRef, prevIndexRef } = useTabTransition();

  // Shared values for the sliding pill
  const pillX     = useSharedValue(0);
  const pillW     = useSharedValue(0);
  const pillReady = useSharedValue(0); // 0 = hidden, 1 = visible (after first measure)

  // Per-tab progress: 0 = inactive, 1 = active
  // Fixed to 3 tabs — hooks must not be called in loops
  const p0 = useSharedValue(state.index === 0 ? 1 : 0);
  const p1 = useSharedValue(state.index === 1 ? 1 : 0);
  const p2 = useSharedValue(state.index === 2 ? 1 : 0);
  const tabProgress = useRef([p0, p1, p2]).current;

  // Per-tab layout measurements
  const tabLayouts = useRef(TABS.map(() => ({ x: 0, w: 0, measured: false }))).current;

  // Track which tab is currently active so animateTo knows the FROM position
  const currentIndexRef = useRef(state.index);

  // ── Animate pill to a given tab (with blob-stretch) ───────────────────────
  const animateTo = useCallback((nextIndex) => {
    const from = tabLayouts[currentIndexRef.current];
    const to   = tabLayouts[nextIndex];
    if (!to.measured) return;

    // Set direction for screen transition wrapper
    directionRef.current = nextIndex > currentIndexRef.current ? 1 : -1;
    prevIndexRef.current = currentIndexRef.current;

    const goingRight = to.x > (from.x || 0);

    if (goingRight) {
      // Stretch rightward: keep left edge, expand right edge to destination
      const stretchW = (to.x + to.w) - (from.measured ? from.x : pillX.value);
      pillW.value = withSequence(
        withTiming(Math.max(stretchW, to.w + 32), { duration: 90 }),
        withSpring(to.w, SNAP_SPRING)
      );
      pillX.value = withSpring(to.x, PILL_SPRING);
    } else {
      // Stretch leftward: slide X left first, expand right edge back to current right
      const fromRight = (from.measured ? from.x + from.w : pillX.value + pillW.value);
      const stretchW  = fromRight - to.x;
      pillX.value = withSpring(to.x, PILL_SPRING);
      pillW.value = withSequence(
        withTiming(Math.max(stretchW, to.w + 32), { duration: 90 }),
        withSpring(to.w, SNAP_SPRING)
      );
    }

    TABS.forEach((_, i) => {
      tabProgress[i].value = withSpring(i === nextIndex ? 1 : 0, LABEL_SPRING);
    });

    currentIndexRef.current = nextIndex;
  }, [tabLayouts, pillX, pillW, tabProgress]);

  // ── Handle tab press ───────────────────────────────────────────────────────
  const handlePress = useCallback((route, index) => {
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (state.index !== index && !event.defaultPrevented) {
      Haptics.selectionAsync();
      animateTo(index);
      navigation.navigate(route.name);
    }
  }, [state.index, navigation, animateTo]);

  // ── Pill animated style ────────────────────────────────────────────────────
  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }],
    width: pillW.value,
    opacity: pillReady.value,
  }));

  // ── onLayout per tab ───────────────────────────────────────────────────────
  const handleTabLayout = useCallback((index, event) => {
    const { x, width } = event.nativeEvent.layout;
    tabLayouts[index].x = x;
    tabLayouts[index].w = width;
    tabLayouts[index].measured = true;

    // Once the active tab is measured for the first time, set pill position
    // and reveal it — prevents the "flash to top-left" bug.
    if (index === state.index && pillReady.value === 0) {
      pillX.value = x;
      pillW.value = width;
      pillReady.value = withSpring(1, { damping: 20, stiffness: 200 });
      tabProgress[index].value = 1;
    }
  }, [state.index, tabLayouts, pillX, pillW, pillReady, tabProgress]);

  return (
    <View
      style={[
        styles.wrapper,
        { bottom: (Platform.OS === 'ios' ? 28 : 18) + insets.bottom },
      ]}
    >
      <View style={styles.container}>

        {/* ── Sliding pill (absolute, behind everything) ── */}
        <Animated.View style={[styles.pill, pillStyle]} pointerEvents="none" />

        {/* ── Tab buttons ── */}
        {state.routes.map((route, index) => {
          const cfg = TABS.find((t) => t.name === route.name) || TABS[index];
          const progress = tabProgress[index];

          return (
            <TabButton
              key={route.key}
              cfg={cfg}
              progress={progress}
              onPress={() => handlePress(route, index)}
              onLayout={(e) => handleTabLayout(index, e)}
            />
          );
        })}
      </View>
    </View>
  );
}

// ─── TabButton ────────────────────────────────────────────────────────────────
// progress: 0 = fully inactive, 1 = fully active
function TabButton({ cfg, progress, onPress, onLayout }) {

  // Pill background is behind this, so we just control:
  //   • flex ratio (active tab is wider)
  //   • label opacity / width
  //   • icon color (grey → white)

  const containerStyle = useAnimatedStyle(() => ({
    flex: interpolate(progress.value, [0, 1], [1, 2], Extrapolation.CLAMP),
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5, 1], [0, 0, 1], Extrapolation.CLAMP),
    // Collapse width when opacity is 0 so it doesn't push siblings
    maxWidth: interpolate(progress.value, [0, 0.4, 1], [0, 0, 72], Extrapolation.CLAMP),
  }));


  return (
    <TouchableOpacity
      onPress={onPress}
      onLayout={onLayout}
      activeOpacity={0.85}
      hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
      style={styles.tabTouch}
    >
      <Animated.View style={[styles.tabInner, containerStyle]}>

        {/* Icon — color interpolates grey → white */}
        <AnimatedIcon cfg={cfg} progress={progress} />

        {/* Label — fades in, collapses out */}
        <Animated.Text style={[styles.label, labelStyle]} numberOfLines={1}>
          {cfg.label}
        </Animated.Text>

      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── AnimatedIcon ─────────────────────────────────────────────────────────────
// Separate component so we can use useAnimatedStyle for icon color without
// touching Ionicons directly (which doesn't accept Animated colors).
// We layer two icons: grey outline (inactive) fades out, white filled fades in.
function AnimatedIcon({ cfg, progress }) {
  const activeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5, 1], [0, 0, 1], Extrapolation.CLAMP),
    position: 'absolute',
  }));

  const inactiveStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5, 1], [1, 0, 0], Extrapolation.CLAMP),
  }));

  return (
    <View style={styles.iconWrap}>
      {/* Inactive: grey outline */}
      <Animated.View style={inactiveStyle}>
        <Ionicons name={cfg.icon} size={21} color={C.inkSoft} />
      </Animated.View>
      {/* Active: white filled — sits absolute on top */}
      <Animated.View style={activeStyle}>
        <Ionicons name={cfg.iconActive} size={22} color={C.white} />
      </Animated.View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center', // Center the compact pill
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.10,
    shadowRadius: 24,
    elevation: 12,
  },
  container: {
    flexDirection: 'row',
    backgroundColor: C.bg,
    borderRadius: 28,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    position: 'relative',       // pill is absolute inside here
    overflow: 'hidden',         // pill clips to the rounded container
  },

  // The sliding pill — absolute, behind all tab buttons
  pill: {
    position: 'absolute',
    top: 8,
    bottom: 8,
    left: 0,
    backgroundColor: C.ink,
    borderRadius: 20,
  },

  // Each tab's outer touch area
  tabTouch: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Inner animated container (flex ratio changes to push siblings)
  tabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 6,
    overflow: 'hidden',
  },

  // Icon wrapper — stack inactive + active on top of each other
  iconWrap: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },

  label: {
    fontSize: 13,
    fontWeight: '700',
    color: C.white,
    letterSpacing: -0.3,
    overflow: 'hidden',
  },
});
