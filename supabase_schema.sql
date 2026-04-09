-- ============================================
-- Ffads — Supabase Database Schema v2.1
-- Run this in: Supabase Dashboard → SQL Editor
-- This script safely drops existing tables and recreates them.
-- ============================================

-- ─── MASTER RESET (Safe Drop) ───────────────
DROP TABLE IF EXISTS product_ai_data CASCADE;
DROP TABLE IF EXISTS product_images CASCADE;
DROP TABLE IF EXISTS user_scans CASCADE;
DROP TABLE IF EXISTS user_contributions CASCADE;
DROP TABLE IF EXISTS sync_queue CASCADE;
DROP TABLE IF EXISTS ingredient_dictionary CASCADE;
DROP TABLE IF EXISTS ingredients_knowledge CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;
DROP TABLE IF EXISTS threshold_limits CASCADE;

-- ─── Products Table ─────────────────────────
-- Basic product info — populated from OFF or OCR
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  barcode TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  brand TEXT DEFAULT 'Unknown',
  category TEXT DEFAULT 'Uncategorized',
  
  -- Ingredients (stored as JSON array of strings)
  ingredients JSONB DEFAULT '[]'::jsonb,
  ingredients_raw TEXT,
  
  -- Nutrition per 100g
  nutrition JSONB DEFAULT '{}'::jsonb,
  
  -- Source
  source TEXT DEFAULT 'manual',  -- 'openfoodfacts' | 'manual' | 'ocr'
  nutriscore TEXT,
  nova_group INTEGER,
  
  -- Timestamps
  scanned_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_scanned_at ON products(scanned_at DESC);


-- ─── Threshold Limits (FSSAI/WHO) ──────────────
-- Synchronized locally bounds values. Can be updated over-the-air.
CREATE TABLE IF NOT EXISTS threshold_limits (
  key TEXT PRIMARY KEY,
  value NUMERIC NOT NULL,
  unit TEXT DEFAULT 'g',
  source TEXT DEFAULT 'WHO',
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Note: App contains hardcoded offline fallbacks (Sugar >10g, Sodium >400mg, Sat Fat >5g)

-- ─── Product AI Data Table ──────────────────
-- AI analysis results — cached here so Gemini is not called again
-- Contains separated queries to prevent AI tokens waste
CREATE TABLE IF NOT EXISTS product_ai_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  barcode TEXT UNIQUE NOT NULL REFERENCES products(barcode) ON DELETE CASCADE,
  
  -- Single Deep Analysis Result (1 Gemini call)
  animal_content_flag BOOLEAN DEFAULT FALSE,
  animal_content_details TEXT,
  harmful_chemicals JSONB DEFAULT '[]'::jsonb,  -- [{name, realName, risk}]
  ai_score INTEGER CHECK (ai_score >= 0 AND ai_score <= 100),
  ai_recommendation TEXT,
  
  -- Meta
  gemini_model TEXT,
  analysis_mode TEXT,
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_ai_barcode ON product_ai_data(barcode);


-- ─── Product Images (Supabase Storage references) ───
CREATE TABLE IF NOT EXISTS product_images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  barcode TEXT NOT NULL REFERENCES products(barcode) ON DELETE CASCADE,
  image_type TEXT NOT NULL,  -- 'front' | 'ingredients' | 'nutrition'
  storage_path TEXT,         -- Supabase Storage path
  url TEXT,                  -- Public URL (from OFF or storage)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_images_barcode ON product_images(barcode);


-- ─── Ingredient Dictionary ──────────────────
-- Master ingredient database — used for color coding
CREATE TABLE IF NOT EXISTS ingredient_dictionary (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  color TEXT NOT NULL DEFAULT 'yellow',      -- 'green' | 'yellow' | 'red'
  category TEXT DEFAULT 'unknown',
  definition TEXT,
  flags JSONB DEFAULT '[]'::jsonb,           -- ['ultra-processed', 'additive', etc.]
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ingredient_name ON ingredient_dictionary(name);


-- ─── Ingredients AI Knowledge Cache (Dynamic) ─
-- Global cache populated by Gemini, eliminating redundant API calls
CREATE TABLE IF NOT EXISTS ingredients_knowledge (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  health_risk_score INTEGER CHECK (health_risk_score >= 1 AND health_risk_score <= 10),
  processing_level INTEGER CHECK (processing_level >= 1 AND processing_level <= 4),
  is_vegan BOOLEAN DEFAULT TRUE,
  ai_justification TEXT,
  
  -- Deep Insights (Populated on-demand when user taps ingredient)
  what_is_it TEXT,
  purpose TEXT,
  risk_explanation TEXT,
  is_natural BOOLEAN,
  is_ultra_processed BOOLEAN,
  safer_alternatives JSONB,
  detailed_analyzed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ingredients_knowledge_name ON ingredients_knowledge(name);

CREATE TRIGGER trg_ingredients_knowledge_updated
  BEFORE UPDATE ON ingredients_knowledge
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ─── User Profiles ──────────────────────────
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id TEXT UNIQUE NOT NULL,
  
  allergies JSONB DEFAULT '[]'::jsonb,
  diet TEXT DEFAULT 'omnivore',
  gemini_model TEXT DEFAULT 'gemini-2.0-flash',
  analysis_mode TEXT DEFAULT 'balanced',
  health_mode TEXT DEFAULT 'relaxed',
  off_enabled BOOLEAN DEFAULT TRUE,
  ai_fallback BOOLEAN DEFAULT TRUE,
  offline_mode BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── User Scans (History) ───────────────────
CREATE TABLE IF NOT EXISTS user_scans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  barcode TEXT NOT NULL REFERENCES products(barcode) ON DELETE CASCADE,
  device_id TEXT REFERENCES user_profiles(device_id) ON DELETE CASCADE,
  scanned_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_scans_barcode ON user_scans(barcode);
CREATE INDEX IF NOT EXISTS idx_user_scans_date ON user_scans(scanned_at DESC);

-- ─── User Contributions ─────────────────────
-- Tracks explicit user contributions (Upload Photos)
-- front photo → uploaded to Open Food Facts
-- back photo  → OCR'd by Gemini, raw + filtered data stored here
CREATE TABLE IF NOT EXISTS user_contributions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  barcode TEXT NOT NULL,
  product_name TEXT,                          -- Extracted from Gemini OCR
  raw_ocr_text TEXT,                          -- Raw Gemini response (for debugging)
  gemini_filtered_data JSONB,                 -- Structured { ingredients, nutrition }
  front_photo_uploaded BOOLEAN DEFAULT FALSE, -- Was front photo sent to OFF?
  back_photo_ocrd BOOLEAN DEFAULT FALSE,      -- Was back photo scanned by Gemini?
  image_urls JSONB DEFAULT '[]'::jsonb,       -- Legacy: keep for compat
  status TEXT DEFAULT 'approved',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_contributions_user ON user_contributions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_contributions_barcode ON user_contributions(barcode);

-- ─── Offline Sync Queue ─────────────────────
CREATE TABLE IF NOT EXISTS sync_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);


-- ─── Auto-update timestamps ─────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_products_updated
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_user_profiles_updated
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ─── Row Level Security ─────────────────────
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_ai_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_dictionary ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients_knowledge ENABLE ROW LEVEL SECURITY;

ALTER TABLE threshold_limits ENABLE ROW LEVEL SECURITY;

-- Open access with anon key (tighten with auth later)
CREATE POLICY "anon_all" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON product_ai_data FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON product_images FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON ingredient_dictionary FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON user_scans FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON user_profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON user_contributions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON sync_queue FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON ingredients_knowledge FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON threshold_limits FOR ALL USING (true) WITH CHECK (true);


-- ============================================
-- ✅ 8 tables:
--   products            — basic product data
--   product_ai_data     — cached AI analysis (separate from product)
--   product_images      — image storage references
--   ingredient_dictionary — master ingredient DB
--   user_scans          — scan history
--   user_profiles       — user preferences
--   user_contributions  — tracked user uploads (OCR/gemini)
--   sync_queue          — offline job queue
--   ingredients_knowledge — Dynamic global cache backed by AI
-- ============================================
