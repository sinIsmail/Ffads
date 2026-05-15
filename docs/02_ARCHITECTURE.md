# 02 — Architecture

## Design Philosophy

Ffads was built around three non-negotiable principles:

1. **Offline-first** — every critical feature works with zero internet
2. **No single point of failure** — if Supabase is down, use cache; if AI fails, fall to next provider; if OCR fails, show raw data
3. **User data privacy** — API keys stay on-device, only necessary data leaves the phone

---

## Folder Structure

```
Ffads/
├── src/
│   ├── components/        # Reusable UI pieces
│   │   ├── profile/       # Profile screen tabs (APITab, HealthTab, AITab...)
│   │   ├── scanner/       # Scanner-specific UI (barcode validators)
│   │   └── ai/            # AI-specific UI components
│   ├── navigation/        # React Navigation stack/tab setup
│   ├── screens/           # Full-screen views (9 screens)
│   ├── services/          # External integrations + business logic
│   │   ├── ai/            # AI provider abstraction layer
│   │   ├── gemini/        # Gemini-specific (legacy, now unified in ai/)
│   │   └── supabase/      # Supabase domain modules
│   ├── store/             # React Context + useReducer global state
│   ├── theme/             # Colors, typography, spacing tokens
│   └── utils/             # Pure functions — scoring, thresholds, constants
├── supabase_schema.sql    # Full DB schema (source of truth)
├── assets/                # Icons, splash images
└── docs/                  # This documentation folder
```

---

## Layer Architecture

```
┌────────────────────────────────────────────────────────┐
│                    SCREENS (UI Layer)                   │
│  ScannerScreen · ProductDetailScreen · CompareScreen   │
│  ProfileScreen · LoginScreen · CreateQrProductScreen  │
└───────────────────────────┬────────────────────────────┘
                            │ reads/dispatches
┌───────────────────────────▼────────────────────────────┐
│                  STORE (State Layer)                    │
│          UserContext · ProductContext · AppProvider     │
└──────────────┬────────────────────────┬────────────────┘
               │                        │
┌──────────────▼──────────┐  ┌──────────▼───────────────┐
│   SERVICES (API Layer)  │  │   UTILS (Logic Layer)     │
│  ai/  supabase/         │  │  scoring.js               │
│  contributionQueue.js   │  │  thresholds.js            │
│  openfoodfacts.js       │  │  allergens.js             │
│  cloudinary.js          │  │  constants.js             │
│  analysis.service.js    │  │  ingredientDictionary.js  │
└──────────────┬──────────┘  └───────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────┐
│                   EXTERNAL SERVICES                      │
│  Supabase · Open Food Facts · Gemini API                 │
│  OpenAI-compatible APIs · Ollama · Cloudinary            │
└──────────────────────────────────────────────────────────┘
```

---

## Why Each Folder Exists

### `src/screens/`
Full-screen views. Each screen owns its own local state and composes from components. Screens are dumb in terms of business logic — they call into services and utils.

### `src/components/`
Reusable UI primitives. The `profile/` subfolder exists because ProfileScreen is a tabbed view — splitting tabs into components keeps the parent file from becoming 2000+ lines. Same logic for `scanner/` and `ai/`.

### `src/services/`
Everything that talks to the outside world or contains complex async logic. Split by domain:
- `ai/` — the entire AI abstraction (provider fallback chain, OCR, prompts)
- `supabase/` — each Supabase table gets its own module
- Top-level files for external APIs (OFF, Cloudinary, connectivity)

### `src/store/`
Global state using React Context + `useReducer`. Deliberately minimal — only two contexts (User preferences, Product list). Everything else is local state or derived.

### `src/utils/`
Pure functions only. No side effects. No imports from services. These are the mathematical/logical core of the app: scoring, threshold calculation, allergen matching, ingredient classification.

### `src/theme/`
Design tokens. Separating theme from components means a single color change updates the entire app.

---

## State Management Pattern

We chose **Context + useReducer** over Redux for simplicity. The pattern is:

```
Action dispatched → reducer → new state → React re-renders
```

**UserContext** manages:
- User preferences (allergies, diet, health conditions, AI keys, Supabase credentials)
- Auth session (email, fullName, sessionExpired flag)
- AI provider registry (ordered list of configured providers)

**ProductContext** manages:
- `sessionScans` — products scanned this session (cleared on restart)
- `history` — all-time scan history (persisted to AsyncStorage)
- `compareSelection` — up to 2 product IDs chosen for comparison

---

## Offline-First Strategy

```
Every data request follows this chain:

1. In-memory store (instant, from Context)
      ↓ if missing
2. AsyncStorage (local disk, near-instant)
      ↓ if missing or stale
3. Supabase cache (network, fast)
      ↓ if missing
4. Open Food Facts API (external network)
      ↓ if missing
5. Manual OCR contribution (user captures it themselves)
```

When the device is offline, steps 3–5 fail gracefully and the app uses whatever is available from steps 1–2.
