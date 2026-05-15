import NetInfo from '@react-native-community/netinfo';

function toConnectivitySnapshot(state) {
  return {
    online: Boolean(state?.isConnected && state?.isInternetReachable !== false),
    type: state?.type || 'unknown',
    details: state?.details || null,
    raw: state,
  };
}

export async function getCurrentConnectivity() {
  const state = await NetInfo.fetch();
  return toConnectivitySnapshot(state);
}

export function startConnectivityWatchdog({ onReconnect, onChange } = {}) {
  let lastOnline = null;

  const notify = (state) => {
    const snapshot = toConnectivitySnapshot(state);
    const changed = lastOnline !== snapshot.online;

    onChange?.(snapshot);
    if (snapshot.online && changed) {
      onReconnect?.(snapshot);
    }

    lastOnline = snapshot.online;
  };

  NetInfo.fetch().then(notify).catch(() => {});
  const unsubscribe = NetInfo.addEventListener(notify);
  return unsubscribe;
}
