// Ffads — Product Store Context
// Session scans (cleared on restart) + persistent history
import React, { createContext, useContext, useReducer, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const HISTORY_KEY = '@ffads_history';
const DATA_VERSION_KEY = '@ffads_data_version';
const CURRENT_VERSION = '3';

const initialState = {
  sessionScans: [],       // cleared on app restart
  history: [],            // persisted across restarts
  compareSelection: [],
  loaded: false,
};

function reducer(state, action) {
  switch (action.type) {
    case 'LOAD_HISTORY':
      return { ...state, history: action.payload, loaded: true };

    case 'ADD_PRODUCT': {
      const product = action.payload;
      // Add to session
      const sessionExists = state.sessionScans.find((p) => p.barcode === product.barcode);
      const newSession = sessionExists
        ? state.sessionScans.map((p) => p.barcode === product.barcode ? { ...p, ...product } : p)
        : [product, ...state.sessionScans];

      // Add to history
      const histExists = state.history.find((p) => p.barcode === product.barcode);
      const newHistory = histExists
        ? state.history.map((p) => p.barcode === product.barcode ? { ...p, ...product } : p)
        : [product, ...state.history];

      console.log(`🗂️ [ProductStore] ADD_PRODUCT → "${product.name}" (${product.barcode}) | session: ${newSession.length} | history: ${newHistory.length}`);
      return { ...state, sessionScans: newSession, history: newHistory };
    }

    case 'UPDATE_PRODUCT': {
      const update = (list) => list.map((p) =>
        p.id === action.payload.id ? { ...p, ...action.payload } : p
      );
      console.log(`🗂️ [ProductStore] UPDATE_PRODUCT → id="${action.payload.id}"`);
      return {
        ...state,
        sessionScans: update(state.sessionScans),
        history: update(state.history),
      };
    }

    case 'DELETE_PRODUCT':
      console.log(`🗂️ [ProductStore] DELETE_PRODUCT → id="${action.payload}"`);
      return {
        ...state,
        sessionScans: state.sessionScans.filter((p) => p.id !== action.payload),
        history: state.history.filter((p) => p.id !== action.payload),
        compareSelection: state.compareSelection.filter((id) => id !== action.payload),
      };

    case 'CLEAR_HISTORY':
      console.log(`🗂️ [ProductStore] CLEAR_HISTORY → Wiping all session + history data`);
      return { ...state, sessionScans: [], history: [], compareSelection: [] };

    case 'TOGGLE_COMPARE': {
      const id = action.payload;
      const sel = state.compareSelection;
      if (sel.includes(id)) return { ...state, compareSelection: sel.filter((i) => i !== id) };
      if (sel.length >= 2) return { ...state, compareSelection: [sel[1], id] };
      return { ...state, compareSelection: [...sel, id] };
    }

    case 'CLEAR_COMPARE':
      return { ...state, compareSelection: [] };

    default:
      return state;
  }
}

const ProductContext = createContext();

export function ProductProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Load history on mount — session stays empty
  useEffect(() => {
    (async () => {
      try {
        console.log(`🗂️ [ProductStore] INIT → Loading history from AsyncStorage...`);
        const savedVer = await AsyncStorage.getItem(DATA_VERSION_KEY);
        if (savedVer !== CURRENT_VERSION) {
          console.warn(`🗂️ [ProductStore] ⚠️ Data version mismatch (saved: ${savedVer}, current: ${CURRENT_VERSION}) — clearing stale history`);
          await AsyncStorage.removeItem(HISTORY_KEY);
          await AsyncStorage.setItem(DATA_VERSION_KEY, CURRENT_VERSION);
          dispatch({ type: 'LOAD_HISTORY', payload: [] });
          return;
        }
        const raw = await AsyncStorage.getItem(HISTORY_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        console.log(`🗂️ [ProductStore] INIT → ✅ Loaded ${parsed.length} products from local history`);
        dispatch({ type: 'LOAD_HISTORY', payload: parsed });
      } catch {
        console.error(`🗂️ [ProductStore] INIT → ❌ Failed to load history — starting fresh`);
        dispatch({ type: 'LOAD_HISTORY', payload: [] });
      }
    })();
  }, []);

  // Persist history on change
  useEffect(() => {
    if (!state.loaded) return;
    console.log(`🗂️ [ProductStore] PERSIST → Saving ${state.history.length} products to AsyncStorage...`);
    AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(state.history)).catch(() => {});
  }, [state.history, state.loaded]);

  return (
    <ProductContext.Provider value={{ productState: state, productDispatch: dispatch }}>
      {children}
    </ProductContext.Provider>
  );
}

export function useProducts() {
  const context = useContext(ProductContext);
  if (!context) throw new Error('useProducts must be used within ProductProvider');
  return context;
}

// Group by date
export function groupProductsByDate(products) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups = { today: [], yesterday: [], older: [] };
  for (const p of products) {
    const d = new Date(p.scannedAt);
    if (d >= today) groups.today.push(p);
    else if (d >= yesterday) groups.yesterday.push(p);
    else groups.older.push(p);
  }
  return groups;
}
