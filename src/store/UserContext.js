// Ffads — User Preferences Context (with in-app API key storage)
import React, { createContext, useContext, useReducer, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setSupabaseCredentials, getSupabaseClient } from '../services/supabase';
import { syncThresholds } from '../utils/thresholds';

const USER_PREFS_KEY = '@ffads_user_prefs';
// Per-user isolation: scoped key prevents User B from seeing User A's allergies/keys
const getUserPrefsKey = (userId) => userId ? `@ffads_user_prefs_${userId}` : USER_PREFS_KEY;

const defaultPrefs = {
  allergies: [],
  healthConditions: [],
  healthMode: 'relaxed',
  diet: 'omnivore',
  geminiModel: 'gemini-2.5-flash',
  analysisMode: 'balanced',
  // Gemini API keys (managed in API tab)
  geminiApiKeys: [],
  geminiActiveKeyIndex: 0,
  // Supabase credentials (managed in API tab)
  supabaseUrl: '',
  supabaseAnonKey: '',
  // Open Food Facts credentials (managed in API tab)
  offUsername: '',
  offPassword: '',
  // User identity (set on login / profile load)
  email: '',
  fullName: '',
  aiEnabled: false,
  loaded: false,
  // Production: true when JWT refresh fails — triggers login redirect
  sessionExpired: false,
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_PREFS':
      console.log(`👤 [UserStore] SET_PREFS → Loading saved preferences`);
      return { ...state, ...action.payload, loaded: true };
    case 'TOGGLE_ALLERGY': {
      const exists = state.allergies.includes(action.payload);
      console.log(`👤 [UserStore] TOGGLE_ALLERGY → "${action.payload}" ${exists ? 'REMOVED' : 'ADDED'}`);
      return {
        ...state,
        allergies: exists
          ? state.allergies.filter((a) => a !== action.payload)
          : [...state.allergies, action.payload],
      };
    }
    case 'SET_DIET':
      console.log(`👤 [UserStore] SET_DIET → "${action.payload}"`);
      return { ...state, diet: action.payload };
    case 'SET_GEMINI_MODEL':
      console.log(`👤 [UserStore] SET_GEMINI_MODEL → "${action.payload}"`);
      return { ...state, geminiModel: action.payload };
    case 'SET_ANALYSIS_MODE':
      console.log(`👤 [UserStore] SET_ANALYSIS_MODE → "${action.payload}"`);
      return { ...state, analysisMode: action.payload };
    case 'SET_GEMINI_KEY':
      // Legacy compat: if someone dispatches with a single string, wrap it
      console.log(`👤 [UserStore] SET_GEMINI_KEY → ${action.payload ? '1 key set' : 'cleared'}`);
      return { ...state, geminiApiKeys: action.payload ? [action.payload] : [], geminiActiveKeyIndex: 0 };
    case 'SET_GEMINI_KEYS':
      console.log(`👤 [UserStore] SET_GEMINI_KEYS → ${action.payload?.length || 0} keys`);
      return { ...state, geminiApiKeys: action.payload || [], geminiActiveKeyIndex: 0 };
    case 'ADD_GEMINI_KEY': {
      const newKeys = [...(state.geminiApiKeys || []), action.payload].filter(Boolean);
      console.log(`👤 [UserStore] ADD_GEMINI_KEY → Now ${newKeys.length} total keys`);
      return { ...state, geminiApiKeys: newKeys };
    }
    case 'REMOVE_GEMINI_KEY': {
      const filtered = (state.geminiApiKeys || []).filter((_, i) => i !== action.payload);
      console.log(`👤 [UserStore] REMOVE_GEMINI_KEY → Removed index ${action.payload}, ${filtered.length} remaining`);
      return { ...state, geminiApiKeys: filtered, geminiActiveKeyIndex: Math.min(state.geminiActiveKeyIndex, Math.max(0, filtered.length - 1)) };
    }
    case 'SET_ACTIVE_GEMINI_KEY':
      console.log(`👤 [UserStore] SET_ACTIVE_GEMINI_KEY → index ${action.payload}`);
      return { ...state, geminiActiveKeyIndex: action.payload };
    case 'ROTATE_GEMINI_KEY': {
      const keys = state.geminiApiKeys || [];
      if (keys.length <= 1) return state;
      const nextIdx = (state.geminiActiveKeyIndex + 1) % keys.length;
      console.log(`👤 [UserStore] ROTATE_GEMINI_KEY → ${state.geminiActiveKeyIndex} → ${nextIdx} (of ${keys.length})`);
      return { ...state, geminiActiveKeyIndex: nextIdx };
    }
    case 'SET_SUPABASE_URL':
      console.log(`👤 [UserStore] SET_SUPABASE_URL → ${action.payload ? action.payload.substring(0, 30) + '...' : 'cleared'}`);
      return { ...state, supabaseUrl: action.payload };
    case 'SET_SUPABASE_KEY':
      console.log(`👤 [UserStore] SET_SUPABASE_KEY → ${action.payload ? '***' + action.payload.slice(-6) : 'cleared'}`);
      return { ...state, supabaseAnonKey: action.payload };
    case 'SET_OFF_CREDENTIALS':
      console.log(`👤 [UserStore] SET_OFF_CREDENTIALS → username="${action.payload.username}"`);
      return { ...state, offUsername: action.payload.username, offPassword: action.payload.password };
    case 'TOGGLE_AI_ENABLED':
      console.log(`👤 [UserStore] TOGGLE_AI_ENABLED → ${!state.aiEnabled ? 'ON' : 'OFF'}`);
      return { ...state, aiEnabled: !state.aiEnabled };
    case 'SET_HEALTH_MODE':
      console.log(`👤 [UserStore] SET_HEALTH_MODE → "${action.payload}"`);
      return { ...state, healthMode: action.payload };
    case 'TOGGLE_HEALTH_CONDITION': {
      const cid = action.payload;
      const exists = state.healthConditions.includes(cid);
      console.log(`👤 [UserStore] TOGGLE_HEALTH_CONDITION → "${cid}" ${exists ? 'REMOVED' : 'ADDED'}`);
      return {
        ...state,
        healthConditions: exists
          ? state.healthConditions.filter(c => c !== cid)
          : [...state.healthConditions, cid],
      };
    }
    case 'SET_EMAIL':
      console.log(`👤 [UserStore] SET_EMAIL → "${action.payload || 'cleared'}"`);
      return { ...state, email: action.payload || '', sessionExpired: false };
    case 'SET_FULL_NAME':
      console.log(`👤 [UserStore] SET_FULL_NAME → "${action.payload || 'cleared'}"`);
      return { ...state, fullName: action.payload || '' };
    // Production fix: JWT expired and auto-refresh failed — force to Login screen
    case 'SESSION_EXPIRED':
      console.warn(`👤 [UserStore] SESSION_EXPIRED → Clearing identity, navigator will redirect to Login`);
      return { ...state, email: '', fullName: '', sessionExpired: true };
    default:
      return state;
  }
}

const UserContext = createContext();

export function UserProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, defaultPrefs);
  // Bug #2: Track whether we've already attempted session restore so we only do it once
  const sessionCheckedRef = React.useRef(false);
  // Per-user isolation: track which storage key is currently active
  const currentStorageKeyRef = React.useRef(USER_PREFS_KEY);

  // ── Load prefs from AsyncStorage on mount (with 5s Timeout) ──
  useEffect(() => {
    let isMounted = true;
    let timeoutId;

    (async () => {
      try {
        console.log(`👤 [UserStore] INIT → Loading user preferences from AsyncStorage...`);
        const loadPromise = AsyncStorage.getItem(USER_PREFS_KEY);
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('AsyncStorage timeout after 5s')), 5000);
        });

        const raw = await Promise.race([loadPromise, timeoutPromise]);
        clearTimeout(timeoutId);

        if (!isMounted) return;

        const prefs = raw ? JSON.parse(raw) : {};
        console.log(`👤 [UserStore] INIT → ✅ Loaded prefs (email: ${prefs.email || 'none'}, keys: ${prefs.geminiApiKeys?.length || 0})`);
        dispatch({ type: 'SET_PREFS', payload: prefs });
      } catch (e) {
        if (!isMounted) return;
        console.error(`👤 [UserStore] INIT → ❌ Failed to load prefs (${e.message}) — using defaults`);
        dispatch({ type: 'SET_PREFS', payload: {} });
      }
    })();

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  // ── Persist to AsyncStorage + push credentials to Supabase singleton ──
  useEffect(() => {
    if (!state.loaded) return;
    const { loaded, ...prefs } = state;
    // Per-user isolation: always save to the CURRENT user-scoped key
    const storageKey = currentStorageKeyRef.current;
    console.log(`👤 [UserStore] PERSIST → Saving prefs to "${storageKey}" (email: ${prefs.email || 'none'}, model: ${prefs.geminiModel})`);
    AsyncStorage.setItem(storageKey, JSON.stringify(prefs)).catch(() => {});

    // Propagate dynamically loaded keys to singleton services
    const supaKeys = getSupabaseCredentials(state);
    setSupabaseCredentials(supaKeys.url, supaKeys.key);

    // Sync fallback FSSAI/WHO macro thresholds
    syncThresholds();
  }, [state]);

  // ── Bug #2: Auto-restore Supabase auth session + lifecycle listener ──
  useEffect(() => {
    if (!state.loaded || sessionCheckedRef.current) return;
    sessionCheckedRef.current = true;

    const client = getSupabaseClient();
    if (!client) {
      console.log(`👤 [UserStore] SESSION RESTORE → Supabase not configured, skipping`);
      return;
    }

    (async () => {
      try {
        console.log(`👤 [UserStore] SESSION RESTORE → Checking for saved Supabase session...`);
        const { data: { session }, error } = await client.auth.getSession();

        if (error) {
          console.warn(`👤 [UserStore] SESSION RESTORE → getSession error: ${error.message}`);
          return; // Network down — stay in current state, try again next launch
        }

        if (!session) {
          console.log(`👤 [UserStore] SESSION RESTORE → No session found (guest mode)`);
          return;
        }

        // Session exists — check if the token is still valid
        // (It may be expired after the user was offline for > 1 hour)
        const tokenExpiresAt = session.expires_at; // Unix timestamp in seconds
        const nowSecs        = Math.floor(Date.now() / 1000);
        const isExpired      = tokenExpiresAt && nowSecs > tokenExpiresAt;

        if (isExpired) {
          console.warn(`👤 [UserStore] SESSION RESTORE → Token expired (exp: ${tokenExpiresAt}, now: ${nowSecs}). Attempting refresh...`);
          try {
            const { data: refreshData, error: refreshError } = await client.auth.refreshSession();
            if (refreshError || !refreshData?.session) {
              // Refresh failed (offline or revoked) — force clean sign-out
              console.error(`👤 [UserStore] SESSION RESTORE → ❌ Refresh FAILED: ${refreshError?.message || 'no session'}`);
              await client.auth.signOut().catch(() => {}); // best-effort local clear
              dispatch({ type: 'SESSION_EXPIRED' });
              return;
            }
            // Token refreshed — use the new session
            const refreshedUser = refreshData.session.user;
            console.log(`👤 [UserStore] SESSION RESTORE → ✅ Token refreshed for "${refreshedUser.email}"`);
            if (!state.email) dispatch({ type: 'SET_EMAIL', payload: refreshedUser.email || '' });
            if (!state.fullName && refreshedUser.user_metadata?.full_name) {
              dispatch({ type: 'SET_FULL_NAME', payload: refreshedUser.user_metadata.full_name });
            }
            return;
          } catch (refreshErr) {
            console.error(`👤 [UserStore] SESSION RESTORE → ❌ Refresh threw: ${refreshErr.message}`);
            dispatch({ type: 'SESSION_EXPIRED' });
            return;
          }
        }

        // Token is still valid
        const email = session.user.email || '';
        const name  = session.user.user_metadata?.full_name || '';
        console.log(`👤 [UserStore] SESSION RESTORE → ✅ Valid session for "${email}"`);
        if (!state.email) dispatch({ type: 'SET_EMAIL', payload: email });
        if (!state.fullName && name) dispatch({ type: 'SET_FULL_NAME', payload: name });

      } catch (e) {
        console.warn(`👤 [UserStore] SESSION RESTORE → Unexpected error: ${e.message}`);
      }
    })();

    // Token Lifecycle Listener: watch for expirations, logouts, or explicit sign-ins
    let subscription;
    try {
      const resp = client.auth.onAuthStateChange(async (event, session) => {
        console.log(`👤 [UserStore] AUTH STATE EVENT → ${event}`);

        if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
          // Per-user isolation: on logout, wipe user-scoped key and reset to anonymous defaults
          console.log(`👤 [UserStore] SIGNED_OUT → Resetting to anonymous prefs key`);
          currentStorageKeyRef.current = USER_PREFS_KEY;
          dispatch({ type: 'SET_EMAIL', payload: '' });
          dispatch({ type: 'SET_FULL_NAME', payload: '' });

        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          if (session?.user) {
            const userId = session.user.id;
            const email  = session.user.email || '';
            const name   = session.user.user_metadata?.full_name || '';

            // Per-user isolation: switch to user-scoped storage key and load that user's prefs
            const userKey = getUserPrefsKey(userId);
            if (userKey !== currentStorageKeyRef.current) {
              console.log(`👤 [UserStore] SIGNED_IN → Switching storage key to "${userKey}"`);
              currentStorageKeyRef.current = userKey;
              try {
                const raw = await AsyncStorage.getItem(userKey);
                const savedPrefs = raw ? JSON.parse(raw) : {};
                console.log(`👤 [UserStore] Loaded user-scoped prefs for "${email}" (keys: ${savedPrefs.geminiApiKeys?.length || 0})`);
                dispatch({ type: 'SET_PREFS', payload: { ...savedPrefs, email, fullName: name } });
              } catch (e) {
                console.warn(`👤 [UserStore] Could not load user-scoped prefs: ${e.message}`);
                dispatch({ type: 'SET_EMAIL', payload: email });
                dispatch({ type: 'SET_FULL_NAME', payload: name });
              }
            } else {
              dispatch({ type: 'SET_EMAIL', payload: email });
              if (name) dispatch({ type: 'SET_FULL_NAME', payload: name });
            }
          }
        }
      });
      subscription = resp?.data?.subscription;
    } catch (e) {
      console.warn(`👤 [UserStore] AUTH STATE EVENT → Failed to attach listener: ${e.message}`);
    }

    return () => {
      subscription?.unsubscribe();
    };
  }, [state.loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <UserContext.Provider value={{ userPrefs: state, userDispatch: dispatch, sessionExpired: state.sessionExpired }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) throw new Error('useUser must be used within UserProvider');
  return context;
}

/**
 * Get the currently active Gemini API key (rotates on failure)
 */
export function getGeminiKey(userPrefs) {
  const keys = userPrefs?.geminiApiKeys || [];
  // Legacy compat: support old single-key field
  if (keys.length === 0 && userPrefs?.geminiApiKey) {
    return userPrefs.geminiApiKey || null;
  }
  const idx = userPrefs?.geminiActiveKeyIndex || 0;
  // Return null (not '') so callers can detect missing key and fall back
  return keys[idx] || process.env.EXPO_PUBLIC_GEMINI_API_KEY || null;
}

/**
 * Get all configured Gemini API keys
 */
export function getAllGeminiKeys(userPrefs) {
  const keys = userPrefs?.geminiApiKeys || [];
  if (keys.length === 0 && userPrefs?.geminiApiKey) {
    return [userPrefs.geminiApiKey];
  }
  return keys;
}

/**
 * Get Supabase URL and Key (in-app keys take priority over .env)
 */
export function getSupabaseCredentials(userPrefs) {
  const url = userPrefs?.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  const key = userPrefs?.supabaseAnonKey || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
  return { url, key };
}

/**
 * Get Open Food Facts credentials
 * In-app credentials (API tab) take priority over .env
 */
export function getOFFCredentials(userPrefs) {
  const username = userPrefs?.offUsername || process.env.EXPO_PUBLIC_OFF_USERNAME || '';
  const password = userPrefs?.offPassword || process.env.EXPO_PUBLIC_OFF_PASSWORD || '';
  return { username, password };
}
