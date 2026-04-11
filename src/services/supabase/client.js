// Ffads — Supabase Client (Connection management + ping)

import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

let supabase = null;
let currentUrl = null;
let currentKey = null;

export function setSupabaseCredentials(url, key) {
  if (url && key) {
    if (url !== currentUrl || key !== currentKey) {
      currentUrl = url;
      currentKey = key;
      supabase = createClient(url, key, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      });
      console.log(`🔌 [Supabase:Client] ✅ Client initialized (URL: ${url.substring(0, 30)}...)`);
    }
  } else {
    // Revert to env vars
    currentUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || null;
    currentKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || null;
    if (currentUrl && currentKey) {
      supabase = createClient(currentUrl, currentKey, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      });
      console.log(`🔌 [Supabase:Client] ✅ Client initialized from .env`);
    } else {
      supabase = null;
      console.warn(`🔌 [Supabase:Client] ⚠️ No credentials found — Supabase is OFFLINE`);
    }
  }
}

export function getClient() {
  if (!supabase) {
    setSupabaseCredentials(); // Try init with env vars
  }
  return supabase;
}

/**
 * Expose client for feature services (analysis.service, etc.)
 */
export function getSupabaseClient() {
  return getClient();
}

/**
 * Check if Supabase is configured
 */
export function isConfigured() {
  return getClient() !== null;
}

/**
 * Ping Supabase to verify real connectivity.
 * Makes a lightweight query and measures latency.
 * @returns {Promise<{ connected: boolean, message: string, latencyMs?: number }>}
 */
export async function pingSupabase() {
  const client = getClient();
  if (!client) {
    console.warn(`🔌 [Supabase:Client] PING → ❌ Not configured`);
    return { connected: false, message: 'Supabase URL or Anon Key not configured in .env' };
  }

  try {
    console.log(`🔌 [Supabase:Client] PING → Testing connection...`);
    const start = Date.now();
    // A minimal query — just count 1 row from any table to test connectivity
    const { data, error } = await client
      .from('products')
      .select('barcode', { count: 'exact', head: true })
      .limit(1);

    const latencyMs = Date.now() - start;

    if (error) {
      // Table might not exist yet but connection works
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.log(`🔌 [Supabase:Client] PING → ✅ Connected (${latencyMs}ms) — table not created yet`);
        return { connected: true, message: `Connected (${latencyMs}ms) — table not created yet`, latencyMs };
      }
      console.error(`🔌 [Supabase:Client] PING → ❌ DB error: ${error.message}`);
      return { connected: false, message: `DB error: ${error.message}` };
    }

    console.log(`🔌 [Supabase:Client] PING → ✅ Connected — ${latencyMs}ms`);
    return { connected: true, message: `Connected — ${latencyMs}ms ping`, latencyMs };
  } catch (err) {
    console.error(`🔌 [Supabase:Client] PING → ❌ Network error: ${err.message}`);
    return { connected: false, message: `Network error: ${err.message}` };
  }
}
