# 01 — Project Overview: What Is Ffads?

## The Core Idea

**Ffads** (Food Facts and Diet Scanner) is a mobile-first React Native app that lets you **scan any food product barcode**, instantly see what is inside, and make an informed choice about whether to eat it.

The app is designed for the **Indian food market** and follows **FSSAI + WHO regulatory limits** to flag unsafe nutrient levels.

---

## What the App Does

### 1. Barcode Scanning
- Point the camera at any product barcode
- App detects and decodes it in real-time using `expo-camera`
- Looks up the product in **Open Food Facts** (the world's largest open food database) and the local **Supabase cache**

### 2. Instant Health Check (Offline-capable)
- Runs `calculateMacroScore()` immediately — no internet required
- Checks Sugar, Sodium, Saturated Fat, Trans Fat, Caffeine against **FSSAI/WHO limits**
- Displays a `/10` score with breach badges

### 3. Full Scoring (0–100)
- `calculateScore()` runs a **multi-vector** analysis combining:
  - Macro nutrition (sugar, fat, sodium, fiber, protein)
  - Ingredient risk (red/yellow/green classification from `ingredientDictionary.js`)
  - Allergen conflicts (user's personal allergy settings)
  - Health condition modifiers (diabetes → 1.8x sugar penalty, etc.)

### 4. AI Deep Analysis
- Optional, requires a configured AI provider key (Gemini, OpenAI-compatible, or local Ollama)
- Sends product ingredients to a **provider fallback chain**
- Returns: `harmfulChemicals`, `animalContentFlag`, `aiScore` (0–100), `aiRecommendation`
- Results are **cached in Supabase** so the same product is never analyzed twice

### 5. OCR Product Upload
- If a product is not in Open Food Facts, the user can photograph the label
- **On-device ML Kit OCR** extracts the text
- AI cleans it up into structured JSON
- Product is uploaded to Open Food Facts and saved to Supabase
- This whole process runs as a **persistent background queue** that retries on reconnect

### 6. Personal QR Products
- Users can create their own products with a custom `FFADZ-XXXXX` code
- Generates a QR code → anyone who scans it sees the product info
- Images stored on Cloudinary
- Full RLS protection in Supabase (only owner can edit/delete)

### 7. Compare Screen
- Side-by-side comparison of up to 2 scanned products
- Shows scores, nutrients, ingredients diff

---

## Who Uses It

| User type | Primary use |
|-----------|------------|
| Health-conscious shoppers | Scan before buying |
| Parents | Check children's snacks |
| Diabetics / hypertensives | See condition-adjusted scores |
| Vegans / allergen sufferers | Instant animal/allergen flags |
| Food contributors | Add missing products to the global database |

---

## Technology Decisions

| Decision | Why |
|----------|-----|
| **React Native + Expo** | Cross-platform (Android first), fast iteration, rich native camera/haptics APIs |
| **Supabase** | Postgres + Auth + RLS + realtime — entire backend in one service |
| **Open Food Facts** | World's largest open food database — free, no API key required |
| **Cloudinary** | Signed uploads for product images without exposing a backend |
| **Multiple AI providers** | No vendor lock-in — Gemini, OpenAI, Ollama all work via one fallback chain |
| **AsyncStorage** | Offline-first — product history and queue survive app restarts |
| **ML Kit OCR** | Free, on-device, no privacy concerns for label scanning |

---

## What This App Is NOT

- Not a calorie tracker (no meal logging)
- Not a barcode price comparison tool
- Not a nutritionist replacement — it surfaces data, the user decides
