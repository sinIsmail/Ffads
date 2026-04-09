// Ffads — Typography System
import { Platform } from 'react-native';

const fontFamily = Platform.select({
  ios: 'System',
  android: 'Roboto',
  default: 'System',
});

export const typography = {
  // Font families
  fontFamily,
  fontFamilyBold: Platform.select({
    ios: 'System',
    android: 'Roboto',
    default: 'System',
  }),

  // Font sizes
  h1: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 40,
  },
  h2: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.3,
    lineHeight: 34,
  },
  h3: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: 28,
  },
  h4: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 24,
  },
  body: {
    fontSize: 15,
    fontWeight: '400',
    letterSpacing: 0.1,
    lineHeight: 22,
  },
  bodyBold: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.1,
    lineHeight: 22,
  },
  caption: {
    fontSize: 13,
    fontWeight: '400',
    letterSpacing: 0.2,
    lineHeight: 18,
  },
  captionBold: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
    lineHeight: 18,
  },
  small: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.3,
    lineHeight: 16,
  },
  badge: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    lineHeight: 14,
    textTransform: 'uppercase',
  },
};
