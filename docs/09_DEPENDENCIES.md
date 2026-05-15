# 09 — Dependencies

Every package in `package.json`, why it's there, and what it does.

---

## Core Framework

| Package | Version | Purpose |
|---------|---------|---------|
| `expo` | ~54.0.33 | The Expo SDK — manages the entire React Native build, native modules, and dev tooling |
| `react` | 19.1.0 | UI library |
| `react-native` | 0.81.5 | Native mobile primitives (View, Text, TouchableOpacity, etc.) |

---

## Navigation

| Package | Version | Purpose |
|---------|---------|---------|
| `@react-navigation/native` | ^7.2.2 | Core navigation library |
| `@react-navigation/native-stack` | ^7.14.10 | Native stack navigator (used for main stack: Splash → Scanner → Detail) |
| `@react-navigation/bottom-tabs` | ^7.15.9 | Bottom tab bar navigator |
| `@react-navigation/stack` | ^7.8.9 | JS stack (used for modal-style screens) |
| `react-native-screens` | ~4.16.0 | Native screen management (required by react-navigation) |
| `react-native-safe-area-context` | ~5.6.0 | Safe area insets for notches and home indicators |
| `react-native-gesture-handler` | ~2.28.0 | Required by react-navigation for gesture support |
| `react-native-reanimated` | ~4.1.1 | Animation engine (used for animated splash, tab transitions) |

---

## Storage & State

| Package | Version | Purpose |
|---------|---------|---------|
| `@react-native-async-storage/async-storage` | 2.2.0 | Persistent key-value storage. Used for: product history, user prefs, contribution queue |

---

## Backend

| Package | Version | Purpose |
|---------|---------|---------|
| `@supabase/supabase-js` | ^2.101.1 | Official Supabase client. Handles: Postgres queries, Auth, Realtime |

---

## Camera & Media

| Package | Version | Purpose |
|---------|---------|---------|
| `expo-camera` | ~17.0.10 | Camera access + barcode scanning |
| `expo-image-picker` | ~17.0.10 | Photo library access for product image upload |
| `expo-image-manipulator` | ~14.0.8 | Image resizing/compression before upload |
| `expo-av` | ~16.0.8 | Audio/Video (used for scan sound feedback) |

---

## On-Device ML

| Package | Version | Purpose |
|---------|---------|---------|
| `@react-native-ml-kit/text-recognition` | ^2.0.0 | On-device OCR using Google ML Kit. Extracts text from food label photos without any network call. Required to build the Android dev client |

---

## File System

| Package | Version | Purpose |
|---------|---------|---------|
| `expo-file-system` | ~19.0.21 | Read/write local files. Used by: contribution queue (stores photo copies), QR PDF generation |

---

## Sharing & Export

| Package | Version | Purpose |
|---------|---------|---------|
| `expo-print` | ^55.0.13 | Generates PDF from HTML (used for QR code PDF download) |
| `expo-sharing` | ^55.0.18 | System share sheet (used to share the generated PDF) |

---

## UI

| Package | Version | Purpose |
|---------|---------|---------|
| `@expo/vector-icons` | ^15.1.1 | Icon set (Ionicons used throughout the app) |
| `expo-linear-gradient` | ~15.0.8 | Gradient backgrounds (used for glassmorphism effects, score circles) |
| `expo-blur` | ~15.0.8 | Blur effects (used for the floating tab bar) |
| `expo-haptics` | ~15.0.8 | Haptic feedback on scan detection |
| `@gorhom/bottom-sheet` | ^5.2.8 | Smooth bottom sheet component (used for ingredient modals) |

---

## QR Code

| Package | Version | Purpose |
|---------|---------|---------|
| `qrcode` | ^1.5.4 | JavaScript QR code generation. Used to render the FFADZ QR code as native `<View>` elements (not an image) — this allows it to be included in the PDF without image loading issues |

---

## Networking

| Package | Version | Purpose |
|---------|---------|---------|
| `@react-native-community/netinfo` | ^12.0.1 | Network state detection. Used by contribution queue to skip AI cleanup steps when offline |

---

## Dev / Build

| Package | Version | Purpose |
|---------|---------|---------|
| `expo-dev-client` | ~6.0.20 | Custom dev client build (required for ML Kit OCR since it's a native module not included in Expo Go) |
| `expo-constants` | ~18.0.13 | Access to `expo-constants.expoConfig` and environment variables |
| `expo-splash-screen` | ~31.0.13 | Managed splash screen that prevents the white flash on launch |
| `expo-status-bar` | ~3.0.9 | Status bar appearance control |

---

## Dev Dependencies (Build Tools)

| Package | Version | Purpose |
|---------|---------|---------|
| `@expo/ngrok` | ^4.1.3 | Tunnel for testing on physical devices via ngrok |
| `cloudflared` | ^0.7.1 | Cloudflare tunnel alternative to ngrok |
| `localtunnel` | ^2.0.2 | Another tunnel option (localtunnel.me) |
| `typescript` | ~5.9.2 | TypeScript for type checking (tsconfig.json present) |
| `@types/react` | ~19.1.10 | React type definitions |

---

## Custom Dev Scripts (package.json)

| Script | What it does |
|--------|-------------|
| `npm start` | Standard Expo start |
| `npm run dev:lan` | Start with dev client on LAN (port 8089, 2 workers) |
| `npm run dev:tunnel` | Start with Expo tunnel |
| `npm run dev:ngrok` | Start with ngrok via PowerShell script |
| `npm run dev:cloudflare` | Start with cloudflared tunnel |
| `npm run dev:localtunnel` | Start with localtunnel.me |
| `npm run build:dev:android` | EAS build for Android dev profile |

---

## Why So Many Tunnel Scripts?

Testing an Expo app on a physical Android device requires the phone to reach the Metro bundler. Options:
- **LAN**: Phone and laptop on same WiFi — works at home, not at a café
- **ngrok/cloudflare/localtunnel**: HTTP tunnel — works everywhere but has latency

Multiple scripts let the developer pick the fastest available option depending on network conditions.

---

## Packages NOT Used (and Why)

| Package | Why not used |
|---------|-------------|
| **Redux** | Context + useReducer is sufficient. Redux adds boilerplate without benefit at this scale |
| **TailwindCSS / NativeWind** | Vanilla StyleSheet keeps styling co-located and avoids class explosion |
| **React Query** | Most data fetching is one-shot or event-driven, not cache-first polling |
| **Sentry** | `telemetry.js` has a `logError()` stub ready for Sentry integration when needed |
| **Firebase** | Supabase covers the same needs with better Postgres querying and open-source SQL |
