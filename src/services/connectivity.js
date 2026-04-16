// Ffads — Connectivity Watchdog (Phase 5)
// Uses NetInfo to auto-flush the offline queue immediately upon WiFi/Cellular reconnect.

import NetInfo from '@react-native-community/netinfo';
import { processQueue, isQueueProcessing } from './queue';
import { pingSupabase } from './supabase';

let _handlers = {};
let _isOnline = false;

/**
 * Register the handler functions the queue should use.
 */
export function registerQueueHandlers(handlers) {
  _handlers = handlers;
}

/**
 * Start listening for network state changes.
 */
export function startConnectivityWatchdog() {
  console.log(`🌐 [Connectivity] Watchdog initialized`);

  // NetInfo listener fires whenever the phone connects/disconnects
  const unsubscribe = NetInfo.addEventListener(state => {
    const onlineNow = !!(state.isConnected && state.isInternetReachable !== false);
    
    if (onlineNow && !_isOnline) {
      console.log(`🌐 [Connectivity] 📶 Network reconnected! Type: ${state.type}`);
      // Only flush if we're not already processing
      if (!isQueueProcessing()) {
        flushQueueIfDBReachable();
      }
    } else if (!onlineNow && _isOnline) {
      console.log(`🌐 [Connectivity] 📵 Network disconnected.`);
    }
    _isOnline = onlineNow;
  });

  return unsubscribe; // Return for explicit teardown if ever needed
}

/**
 * Validates actual connectivity to Supabase before triggering the queue.
 * (Sometimes WiFi connects but the internet is trapped behind a captive portal).
 */
async function flushQueueIfDBReachable() {
  console.log('🌐 [Connectivity] Ping Supabase before flushing queue...');
  const { connected } = await pingSupabase();
  
  if (connected) {
    console.log('🌐 [Connectivity] ✅ Supabase is reachable. Autostarting queue process...');
    await processQueue(_handlers);
  } else {
    console.log('🌐 [Connectivity] ⚠️ Supabase not reachable yet despite network connection.');
  }
}
