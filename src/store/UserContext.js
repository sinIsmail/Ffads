// Ffads — User Preferences Context (with in-app API key storage)
import React, { createContext, useContext, useReducer, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setSupabaseCredentials } from '../services/supabase';
import { syncThresholds } from '../utils/thresholds';

const USER_PREFS_KEY = '@ffads_user_prefs';

const defaultPrefs = {
  allergies: [],
  diet: 'non-veg',
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
  aiEnabled: false,
  loaded: false,
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_PREFS':
      return { ...state, ...action.payload, loaded: true };
    case 'TOGGLE_ALLERGY': {
      const exists = state.allergies.includes(action.payload);
      return {
        ...state,
        allergies: exists
          ? state.allergies.filter((a) => a !== action.payload)
          : [...state.allergies, action.payload],
      };
    }
    case 'SET_DIET':
      return { ...state, diet: action.payload };
    case 'SET_GEMINI_MODEL':
      return { ...state, geminiModel: action.payload };
    case 'SET_ANALYSIS_MODE':
      return { ...state, analysisMode: action.payload };
    case 'SET_GEMINI_KEY':
      // Legacy compat: if someone dispatches with a single string, wrap it
      return { ...state, geminiApiKeys: action.payload ? [action.payload] : [], geminiActiveKeyIndex: 0 };
    case 'SET_GEMINI_KEYS':
      return { ...state, geminiApiKeys: action.payload || [], geminiActiveKeyIndex: 0 };
    case 'ADD_GEMINI_KEY': {
      const newKeys = [...(state.geminiApiKeys || []), action.payload].filter(Boolean);
      return { ...state, geminiApiKeys: newKeys };
    }
    case 'REMOVE_GEMINI_KEY': {
      const filtered = (state.geminiApiKeys || []).filter((_, i) => i !== action.payload);
      return { ...state, geminiApiKeys: filtered, geminiActiveKeyIndex: Math.min(state.geminiActiveKeyIndex, Math.max(0, filtered.length - 1)) };
    }
    case 'SET_ACTIVE_GEMINI_KEY':
      return { ...state, geminiActiveKeyIndex: action.payload };
    case 'ROTATE_GEMINI_KEY': {
      const keys = state.geminiApiKeys || [];
      if (keys.length <= 1) return state;
      const nextIdx = (state.geminiActiveKeyIndex + 1) % keys.length;
      console.log(`[KeyRotation] Rotating from key ${state.geminiActiveKeyIndex} → ${nextIdx}`);
      return { ...state, geminiActiveKeyIndex: nextIdx };
    }
    case 'SET_SUPABASE_URL':
      return { ...state, supabaseUrl: action.payload };
    case 'SET_SUPABASE_KEY':
      return { ...state, supabaseAnonKey: action.payload };
    case 'SET_OFF_CREDENTIALS':
      return { ...state, offUsername: action.payload.username, offPassword: action.payload.password };
    case 'TOGGLE_AI_ENABLED':
      return { ...state, aiEnabled: !state.aiEnabled };
    default:
      return state;
  }
}

const UserContext = createContext();

export function UserProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, defaultPrefs);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(USER_PREFS_KEY);
        dispatch({ type: 'SET_PREFS', payload: raw ? JSON.parse(raw) : {} });
      } catch {
        dispatch({ type: 'SET_PREFS', payload: {} });
      }
    })();
  }, []);

  useEffect(() => {
    if (!state.loaded) return;
    const { loaded, ...prefs } = state;
    AsyncStorage.setItem(USER_PREFS_KEY, JSON.stringify(prefs)).catch(() => {});
    
    // Propagate dynamically loaded keys to singleton services
    const supaKeys = getSupabaseCredentials(state);
    setSupabaseCredentials(supaKeys.url, supaKeys.key);
    
    // Sync fallback FSSAI/WHO macro thresholds
    syncThresholds();
  }, [state]);

  return (
    <UserContext.Provider value={{ userPrefs: state, userDispatch: dispatch }}>
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
