import React, { createContext, useContext, useEffect, useReducer, useRef } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabaseClient } from '../services/supabase';
import { syncThresholds } from '../utils/thresholds';
import {
  ensureProviderRegistry,
  getProviderById,
  reindexProviders,
  sortProvidersByPriority,
} from '../services/ai/providerPresets';

const USER_PREFS_KEY = '@ffads_user_prefs';
const getUserPrefsKey = (userId) => (userId ? `@ffads_user_prefs_${userId}` : USER_PREFS_KEY);

const defaultRegistry = ensureProviderRegistry({});

const defaultPrefs = {
  allergies: [],
  healthConditions: [],
  healthMode: 'relaxed',
  diet: 'omnivore',
  analysisMode: 'balanced',
  geminiModel: defaultRegistry.providers.find((provider) => provider.id === 'gemini')?.textModels?.[0] || 'gemini-2.5-flash',
  geminiApiKeys: [],
  geminiActiveKeyIndex: 0,
  providers: defaultRegistry.providers,
  activeProviderId: defaultRegistry.activeProviderId,
  offUsername: '',
  offPassword: '',
  offContactEmail: process.env.EXPO_PUBLIC_OFF_CONTACT_EMAIL || '',
  email: '',
  fullName: '',
  aiEnabled: false,
  loaded: false,
  sessionExpired: false,
};

function migratePrefs(payload = {}) {
  const registry = ensureProviderRegistry(payload);
  const geminiProvider = getProviderById(registry.providers, 'gemini');
  const geminiApiKeys = Array.isArray(payload.geminiApiKeys)
    ? payload.geminiApiKeys.filter(Boolean)
    : (payload.geminiApiKey ? [payload.geminiApiKey] : []);

  const mergedGeminiKeys = [
    ...(geminiProvider?.apiKeys || []),
    ...geminiApiKeys.filter((key) => !geminiProvider?.apiKeys?.includes(key)),
  ];

  return {
    ...defaultPrefs,
    ...payload,
    providers: registry.providers,
    activeProviderId: registry.activeProviderId,
    geminiModel: geminiProvider?.textModels?.[0] || payload.geminiModel || defaultPrefs.geminiModel,
    geminiApiKeys: mergedGeminiKeys,
    geminiActiveKeyIndex: Math.min(payload.geminiActiveKeyIndex || 0, Math.max(0, mergedGeminiKeys.length - 1)),
  };
}

function updateProviderCollection(state, providerId, changes) {
  const providers = state.providers.map((provider) => (
    provider.id === providerId
      ? { ...provider, ...changes }
      : provider
  ));

  const registry = ensureProviderRegistry({ ...state, providers });
  const geminiProvider = getProviderById(registry.providers, 'gemini');

  return {
    ...state,
    providers: registry.providers,
    activeProviderId: registry.activeProviderId,
    geminiModel: geminiProvider?.textModels?.[0] || state.geminiModel,
    geminiApiKeys: geminiProvider?.apiKeys || state.geminiApiKeys,
  };
}

function moveProviderPriority(providers, providerId, direction) {
  const ordered = sortProvidersByPriority(providers);
  const fromIndex = ordered.findIndex((provider) => provider.id === providerId);
  if (fromIndex < 0) return providers;

  const delta = direction === 'up' ? -1 : 1;
  const toIndex = fromIndex + delta;
  if (toIndex < 0 || toIndex >= ordered.length) return providers;

  const next = [...ordered];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return reindexProviders(next);
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_PREFS':
      return { ...migratePrefs(action.payload), loaded: true };
    case 'SET_PROVIDERS': {
      const registry = ensureProviderRegistry({ ...state, providers: action.payload });
      const geminiProvider = getProviderById(registry.providers, 'gemini');
      return {
        ...state,
        providers: registry.providers,
        activeProviderId: registry.activeProviderId,
        geminiModel: geminiProvider?.textModels?.[0] || state.geminiModel,
        geminiApiKeys: geminiProvider?.apiKeys || state.geminiApiKeys,
      };
    }
    case 'UPDATE_PROVIDER':
      return updateProviderCollection(state, action.payload.id, action.payload.changes || {});
    case 'MOVE_PROVIDER_PRIORITY': {
      const providers = moveProviderPriority(state.providers, action.payload.id, action.payload.direction);
      const registry = ensureProviderRegistry({ ...state, providers });
      return {
        ...state,
        providers: registry.providers,
        activeProviderId: registry.activeProviderId,
      };
    }
    case 'SET_ACTIVE_PROVIDER':
      return { ...state, activeProviderId: action.payload };
    case 'TOGGLE_ALLERGY': {
      const exists = state.allergies.includes(action.payload);
      return {
        ...state,
        allergies: exists
          ? state.allergies.filter((value) => value !== action.payload)
          : [...state.allergies, action.payload],
      };
    }
    case 'SET_DIET':
      return { ...state, diet: action.payload };
    case 'SET_ANALYSIS_MODE':
      return { ...state, analysisMode: action.payload };
    case 'SET_GEMINI_MODEL':
      return updateProviderCollection({
        ...state,
        geminiModel: action.payload,
      }, 'gemini', {
        textModels: action.payload ? [action.payload] : [],
        textModel: action.payload || '',
      });
    case 'SET_GEMINI_KEY':
      return updateProviderCollection({
        ...state,
        geminiApiKeys: action.payload ? [action.payload] : [],
        geminiActiveKeyIndex: 0,
      }, 'gemini', {
        apiKeys: action.payload ? [action.payload] : [],
        apiKey: action.payload || '',
      });
    case 'SET_GEMINI_KEYS': {
      const nextKeys = (action.payload || []).filter(Boolean);
      return updateProviderCollection({
        ...state,
        geminiApiKeys: nextKeys,
        geminiActiveKeyIndex: 0,
      }, 'gemini', {
        apiKeys: nextKeys,
        apiKey: nextKeys[0] || '',
      });
    }
    case 'ADD_GEMINI_KEY': {
      const nextKeys = [...(state.geminiApiKeys || []), action.payload].filter(Boolean);
      return updateProviderCollection({
        ...state,
        geminiApiKeys: nextKeys,
      }, 'gemini', {
        apiKeys: nextKeys,
        apiKey: nextKeys[0] || '',
      });
    }
    case 'REMOVE_GEMINI_KEY': {
      const nextKeys = (state.geminiApiKeys || []).filter((_, index) => index !== action.payload);
      return updateProviderCollection({
        ...state,
        geminiApiKeys: nextKeys,
        geminiActiveKeyIndex: Math.min(state.geminiActiveKeyIndex, Math.max(0, nextKeys.length - 1)),
      }, 'gemini', {
        apiKeys: nextKeys,
        apiKey: nextKeys[0] || '',
      });
    }
    case 'SET_ACTIVE_GEMINI_KEY':
      return { ...state, geminiActiveKeyIndex: action.payload };
    case 'ROTATE_GEMINI_KEY': {
      const keys = state.geminiApiKeys || [];
      if (keys.length <= 1) return state;
      return {
        ...state,
        geminiActiveKeyIndex: (state.geminiActiveKeyIndex + 1) % keys.length,
      };
    }
    case 'SET_SUPABASE_URL':
    case 'SET_SUPABASE_KEY':
      // no-op — Supabase credentials are now read exclusively from .env
      return state;
    case 'SET_OFF_CREDENTIALS':
      return {
        ...state,
        offUsername: action.payload.username,
        offPassword: action.payload.password,
        offContactEmail: action.payload.contactEmail ?? state.offContactEmail,
      };
    case 'TOGGLE_AI_ENABLED':
      return { ...state, aiEnabled: !state.aiEnabled };
    case 'SET_HEALTH_MODE':
      return { ...state, healthMode: action.payload };
    case 'TOGGLE_HEALTH_CONDITION': {
      const exists = state.healthConditions.includes(action.payload);
      return {
        ...state,
        healthConditions: exists
          ? state.healthConditions.filter((value) => value !== action.payload)
          : [...state.healthConditions, action.payload],
      };
    }
    case 'SET_EMAIL':
      return { ...state, email: action.payload || '', sessionExpired: false };
    case 'SET_FULL_NAME':
      return { ...state, fullName: action.payload || '' };
    case 'SESSION_EXPIRED':
      return { ...state, email: '', fullName: '', sessionExpired: true };
    default:
      return state;
  }
}

const UserContext = createContext();

export function UserProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, defaultPrefs);
  const sessionCheckedRef = useRef(false);
  const currentStorageKeyRef = useRef(USER_PREFS_KEY);

  useEffect(() => {
    let isMounted = true;
    let timeoutId;

    (async () => {
      try {
        const loadPromise = (async () => {
          // Step 1: Try to detect a saved Supabase session in AsyncStorage.
          // supabase-js v2 stores the session under a key like:
          // "sb-<project-ref>-auth-token" — we scan for it to find the userId
          // so we can load the correct user-scoped prefs key immediately,
          // avoiding the "No credentials" window at startup.
          let userId = null;
          try {
            const allKeys = await AsyncStorage.getAllKeys();
            const sessionKey = allKeys.find(
              (k) => k.startsWith('sb-') && k.endsWith('-auth-token')
            );
            if (sessionKey) {
              const sessionRaw = await AsyncStorage.getItem(sessionKey);
              const sessionData = sessionRaw ? JSON.parse(sessionRaw) : null;
              userId = sessionData?.user?.id || sessionData?.session?.user?.id || null;
            }
          } catch {
            // Non-fatal — fall through to guest key
          }

          // Step 2: Load from user-scoped key if we found a userId, else guest key
          const preferredKey = userId ? getUserPrefsKey(userId) : USER_PREFS_KEY;
          if (userId && preferredKey !== USER_PREFS_KEY) {
            currentStorageKeyRef.current = preferredKey;
          }

          const raw = await AsyncStorage.getItem(preferredKey);
          return raw ? JSON.parse(raw) : {};
        })();

        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('AsyncStorage timeout after 5s')), 5000);
        });

        const parsed = await Promise.race([loadPromise, timeoutPromise]);
        clearTimeout(timeoutId);
        if (!isMounted) return;

        dispatch({ type: 'SET_PREFS', payload: parsed });
      } catch {
        if (!isMounted) return;
        dispatch({ type: 'SET_PREFS', payload: {} });
      }
    })();

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (!state.loaded) return;
    const { loaded, ...prefs } = state;
    AsyncStorage.setItem(currentStorageKeyRef.current, JSON.stringify(prefs)).catch(() => {});
    syncThresholds();
  }, [state]);

  useEffect(() => {
    if (!state.loaded || sessionCheckedRef.current) return;
    sessionCheckedRef.current = true;

    const client = getSupabaseClient();
    if (!client) return;

    // Restore session on mount
    (async () => {
      try {
        const { data: { session }, error } = await client.auth.getSession();
        if (error || !session) return;

        const email = session.user.email || '';
        const name = session.user.user_metadata?.full_name || '';
        if (!state.email) dispatch({ type: 'SET_EMAIL', payload: email });
        if (!state.fullName && name) dispatch({ type: 'SET_FULL_NAME', payload: name });
      } catch {
        // Keep the app usable even if session restore fails while offline.
      }
    })();

    // Subscribe to auth state changes — set up once, never torn down on email/name change
    let authSubscription;
    try {
      const authListener = client.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
          currentStorageKeyRef.current = USER_PREFS_KEY;
          dispatch({ type: 'SET_EMAIL', payload: '' });
          dispatch({ type: 'SET_FULL_NAME', payload: '' });
          return;
        }

        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
          const userId = session.user.id;
          const email = session.user.email || '';
          const fullName = session.user.user_metadata?.full_name || '';
          const scopedKey = getUserPrefsKey(userId);

          if (scopedKey !== currentStorageKeyRef.current) {
            currentStorageKeyRef.current = scopedKey;
            try {
              const raw = await AsyncStorage.getItem(scopedKey);
              const savedPrefs = raw ? JSON.parse(raw) : {};
              dispatch({ type: 'SET_PREFS', payload: { ...savedPrefs, email, fullName } });
            } catch {
              dispatch({ type: 'SET_EMAIL', payload: email });
              dispatch({ type: 'SET_FULL_NAME', payload: fullName });
            }
            return;
          }

          dispatch({ type: 'SET_EMAIL', payload: email });
          if (fullName) dispatch({ type: 'SET_FULL_NAME', payload: fullName });
        }
      });
      authSubscription = authListener?.data?.subscription;
    } catch {
      authSubscription = null;
    }

    // Re-verify session whenever the app returns to the foreground.
    // This prevents iOS "fossilized" client issues where the token goes
    // stale after the app is suspended for a long time.
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (!client) return;
      if (nextState === 'active') {
        client.auth.startAutoRefresh();
      } else {
        client.auth.stopAutoRefresh();
      }
    });

    return () => {
      authSubscription?.unsubscribe();
      appStateSubscription?.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.loaded]); // ← intentionally only 'loaded' — avoids re-subscribing on every login

  return (
    <UserContext.Provider value={{ userPrefs: state, userDispatch: dispatch, sessionExpired: state.sessionExpired }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within UserProvider');
  }
  return context;
}

export function getActiveProvider(userPrefs) {
  const registry = ensureProviderRegistry(userPrefs || {});
  return getProviderById(registry.providers, registry.activeProviderId) || registry.providers[0] || null;
}

export function getGeminiKey(userPrefs) {
  const provider = getProviderById(userPrefs?.providers || [], 'gemini');
  return provider?.apiKeys?.[userPrefs?.geminiActiveKeyIndex || 0]
    || provider?.apiKey
    || userPrefs?.geminiApiKeys?.[userPrefs?.geminiActiveKeyIndex || 0]
    || process.env.EXPO_PUBLIC_GEMINI_API_KEY
    || null;
}

export function getAllGeminiKeys(userPrefs) {
  const provider = getProviderById(userPrefs?.providers || [], 'gemini');
  if (provider?.apiKeys?.length) {
    return provider.apiKeys;
  }
  return Array.isArray(userPrefs?.geminiApiKeys) ? userPrefs.geminiApiKeys.filter(Boolean) : [];
}

export function getSupabaseCredentials() {
  // Credentials are now exclusively from .env — not from user preferences.
  return {
    url: process.env.EXPO_PUBLIC_SUPABASE_URL || '',
    key: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
  };
}

export function getOFFCredentials(userPrefs) {
  return {
    username: userPrefs?.offUsername || process.env.EXPO_PUBLIC_OFF_USERNAME || '',
    password: userPrefs?.offPassword || process.env.EXPO_PUBLIC_OFF_PASSWORD || '',
    contactEmail: userPrefs?.offContactEmail || process.env.EXPO_PUBLIC_OFF_CONTACT_EMAIL || 'contact@ffads.app',
  };
}
