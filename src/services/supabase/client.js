// Ffads — Supabase Client (Singleton — initialized once from .env at module load)
//
// The client is created a single time when this module is first imported.
// Credentials come exclusively from EXPO_PUBLIC_SUPABASE_URL and
// EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env file.
//
// setSupabaseCredentials() is kept as a no-op for backward compatibility
// so callers don't need to be changed all at once.

import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

let supabase = null;

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  console.log(`🔌 [Supabase:Client] ✅ Singleton initialized from .env (${SUPABASE_URL.substring(0, 30)}...)`);
} else {
  console.warn(`🔌 [Supabase:Client] ⚠️ EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY not set — Supabase is OFFLINE`);
}

/**
 * No-op — kept for backward compatibility.
 * Credentials are now read exclusively from .env at startup.
 * Calling this no longer has any effect.
 */
export function setSupabaseCredentials(_url, _key) {
  // intentionally empty — client is a singleton, never re-created at runtime
}

/** Returns the singleton Supabase client (or null if not configured). */
export function getClient() {
  return supabase;
}

/** Alias used by feature services. */
export function getSupabaseClient() {
  return supabase;
}

/** Returns true when the client is configured and ready. */
export function isConfigured() {
  return supabase !== null;
}

/**
 * Ping Supabase to verify real connectivity.
 * Makes a lightweight query and measures latency.
 * @returns {Promise<{ connected: boolean, message: string, latencyMs?: number }>}
 */
export async function pingSupabase() {
  if (!supabase) {
    console.warn(`🔌 [Supabase:Client] PING → ❌ Not configured`);
    return { connected: false, message: 'Supabase URL or Anon Key not set in .env' };
  }

  try {
    console.log(`🔌 [Supabase:Client] PING → Testing connection...`);
    const start = Date.now();
    const { error } = await supabase
      .from('products')
      .select('barcode', { count: 'exact', head: true })
      .limit(1);

    const latencyMs = Date.now() - start;

    if (error) {
      // Table might not exist yet but the connection itself works
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
