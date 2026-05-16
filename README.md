# Ffadz ✦ AI-Powered Food Intelligence

Ffadz (also known as Ffidz) is a premium, offline-capable mobile application built with React Native and Expo. It empowers users to scan food products, instantly analyze nutritional data, and determine health scores based on established WHO and FSSAI guidelines. 

## 📲 Try It Now
Experience the app directly on your Android device:
**[Download Ffadz APK (EAS Build)](https://expo.dev/artifacts/eas/mb3qkL5zvhGGPaLBQLLPPH.apk)**

---

## ⚡ Core Features
* **Smart OCR Scanning:** Real-time text recognition using ML Kit to extract nutritional facts directly from packaging.
* **Intelligent Scoring System:** Calculates a "Macro Score" and highlights breaches in dietary limits.
* **Offline-First Architecture:** Performs complex threshold calculations locally when offline, syncing with the cloud when connected.
* **Premium UI/UX:** A minimalist, aesthetic interface designed for smooth, intuitive navigation.

---

## ⚖️ Nutritional Thresholds (WHO & FSSAI)
The application evaluates products against strict health guidelines. The default offline limits are mapped in `src/utils/thresholds.js` and can be overridden dynamically via the Supabase backend. 

Nutrient Component,Limit Threshold (per 100g / serving),Point Deduction (If Exceeded),Scoring Rule / Explanation
Base Score,N/A,0,Every product starts with a perfect score of 10.
Sugar,> 10g,-3,Deduct 3 points if sugar exceeds 10g per 100g.
Sodium,> 400mg,-3,Deduct 3 points if sodium exceeds 400mg per 100g.
Saturated Fat,> 5g,-2,Deduct 2 points if saturated fat exceeds 5g per 100g.
Trans Fat,> 0.2g,-3,Deduct 3 points if trans fat exceeds 0.2g per 100g.
Caffeine,> 150mg,-2,Deduct 2 points if caffeine exceeds 150mg per serving.
Final Score Limit,N/A,N/A,The final score is floored at 0 (it cannot be negative).

*Note: Breaches negatively impact the overall product score (e.g., Trans Fat and Sugar deduct 3 points each).*

---

## 🛠 Tech Stack
* **Frontend:** React Native, Expo, React Navigation, Reanimated.
* **Backend:** Supabase (PostgreSQL, Auth, Storage).
* **AI & Vision:** Google ML Kit (Text Recognition), Gemini AI.
* **APIs:** Open Food Facts integration.

---

## 🚀 Installation & Setup

Want to run it locally or customize the code? Follow these steps:

### 1. Clone the Repository
bash
git clone [https://github.com/yourusername/ffadz.git](https://github.com/yourusername/ffadz.git)
cd ffadz

2. Install Dependencies
Bash

npm install

3. Database Setup (Supabase)

The backend is completely customizable. We have provided a ready-to-use SQL schema file.

    Create a new project on Supabase.

    Navigate to the SQL Editor in your Supabase dashboard.

    Open the supabase_schema.sql file included in this repository.

    Copy the contents, paste them into the SQL Editor, and click Run.

        Customization: Feel free to modify the table columns, change the threshold_limits, or tweak the RLS (Row Level Security) policies in this file to suit your specific needs before running it.

    Copy your Supabase URL and Anon Key into the .env file.

4. Start the Application

To run the development build:
Bash

npm run start

To run on Android specifically:
Bash

npm run android

📂 Project Architecture Overview

    /src/components: Reusable UI elements, modals, and scanner overlays.

    /src/screens: Main application views (Scanner, Compare, Profile).

    /src/services: Supabase client, Gemini API, OCR logic, and external data fetching.

    /src/utils: Scoring algorithms, allergen dictionaries, and offline threshold configurations.
