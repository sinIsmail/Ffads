import React, { useEffect } from 'react';
import { Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import { useTabTransition } from '../navigation/TabTransitionContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SLIDE_DISTANCE = SCREEN_WIDTH * 0.15; // 15% parallax slide

// Spring config for the screen slide — matches the pill slide but slightly softer
const SCREEN_SPRING = { damping: 24, stiffness: 220, mass: 0.8 };

export default function SlideTabWrapper({ children, tabIndex }) {
  const isFocused = useIsFocused();
  const { directionRef } = useTabTransition();

  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    const dir = directionRef.current; // 1 (moving right) or -1 (moving left) or 0
    
    if (isFocused) {
      // Sliding IN
      if (dir !== 0) {
        // If we moved right (dir = 1), we come from the right (+).
        // If we moved left (dir = -1), we come from the left (-).
        translateX.value = dir * SLIDE_DISTANCE;
        opacity.value = 0;
        
        translateX.value = withSpring(0, SCREEN_SPRING);
        opacity.value = withTiming(1, { duration: 250 });
      } else {
        // Initial render
        translateX.value = 0;
        opacity.value = 1;
      }
    } else {
      // Sliding OUT
      if (dir !== 0) {
        // If we are moving right (dir = 1), this old screen slides out to the left (-).
        // If we are moving left (dir = -1), this old screen slides out to the right (+).
        translateX.value = withSpring(-dir * SLIDE_DISTANCE, SCREEN_SPRING);
        opacity.value = withTiming(0, { duration: 200 });
      }
    }
  }, [isFocused]);

  const animatedStyle = useAnimatedStyle(() => ({
    flex: 1,
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <Animated.View style={animatedStyle} pointerEvents={isFocused ? 'auto' : 'none'}>
      {children}
    </Animated.View>
  );
}
