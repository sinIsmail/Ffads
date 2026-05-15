# 📚 Ffads — Full Project Documentation

> **Last Updated:** April 2026  
> **App Version:** 1.0.0 (Expo SDK 54, React Native 0.81.5)  
> **Author:** Generated from the live codebase

---

## 🗂️ Documentation Files

| # | File | What It Covers |
|---|------|---------------|
| 00 | `00_INDEX.md` | This file — navigation hub |
| 01 | `01_PROJECT_OVERVIEW.md` | What Ffads does, why it exists, big-picture goals |
| 02 | `02_ARCHITECTURE.md` | Folder structure, why each folder exists, design principles |
| 03 | `03_FOLDER_BY_FOLDER.md` | Every folder → every file → what it does |
| 04 | `04_DATA_STRUCTURES.md` | Every important data shape in the app (Product, Job, Provider, etc.) |
| 05 | `05_ALGORITHMS.md` | Every algorithm: scoring, OCR pipeline, fallback chain, safe portion |
| 06 | `06_SUPABASE.md` | Full database schema, RLS policies, triggers, how the app talks to Supabase |
| 07 | `07_PROBLEMS_AND_FIXES.md` | Every major problem faced + how it was solved |
| 08 | `08_CODE_EVOLUTION.md` | How simple code grew into complex systems, step by step |
| 09 | `09_DEPENDENCIES.md` | Every package, why it was chosen, what it does |

---

## 🧠 Quick Mental Model

```
User scans barcode
       │
       ▼
ScannerScreen (camera + barcode detection)
       │
       ├── Open Food Facts API (product lookup)
       ├── Supabase cache (fastest path)
       └── OCR fallback (if no data found)
              │
              ▼
       ProductDetailScreen
              │
              ├── calculateMacroScore()     ← thresholds.js  (fast, offline)
              ├── calculateScore()          ← scoring.js     (full 0-100 score)
              ├── calculateSafePortion()    ← scoring.js     (portion math)
              ├── NutritionTable            ← WHO/FSSAI badges
              ├── checkAllergens()          ← allergens.js
              └── AI Deep Analysis          ← ai/index.js + analysis.service.js
                         │
                         ▼
                  Gemini / OpenAI / Ollama (provider fallback chain)
                         │
                         ▼
                  Supabase product_ai_data cache
```
