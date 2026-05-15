// Ffads — Food Scanner & Analyzer
import 'react-native-gesture-handler'; // Must be FIRST
import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import AppNavigator from './src/navigation/AppNavigator';
import { ProductProvider } from './src/store/ProductContext';
import { UserProvider } from './src/store/UserContext';
import { colors } from './src/theme/colors';

import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';

import { startConnectivityWatchdog } from './src/services/connectivity';
import { processPendingJobs, attachContributionQueueToAppState } from './src/services/contributionQueue';
import { useUser } from './src/store/UserContext';
import { useProducts } from './src/store/ProductContext';

function AppRuntime() {
  const { userPrefs } = useUser();
  const { productDispatch } = useProducts();

  const runPendingJobs = React.useCallback(() => {
    if (!userPrefs?.loaded) return;
    processPendingJobs({
      userPrefs,
      productDispatch,
      includeBlocked: false,
    }).catch(() => {});
  }, [userPrefs, productDispatch]);

  const providerSignature = React.useMemo(() => JSON.stringify({
    activeProviderId: userPrefs?.activeProviderId,
    providers: userPrefs?.providers || [],
    offUsername: userPrefs?.offUsername || '',
    offPassword: userPrefs?.offPassword || '',
    supabaseUrl: userPrefs?.supabaseUrl || '',
    supabaseAnonKey: userPrefs?.supabaseAnonKey || '',
  }), [userPrefs]);

  React.useEffect(() => {
    if (!userPrefs?.loaded) return undefined;

    runPendingJobs();

    const unsubscribeConnectivity = startConnectivityWatchdog({
      onReconnect: () => runPendingJobs(),
    });

    const appStateSubscription = attachContributionQueueToAppState((nextState) => {
      if (nextState === 'active') {
        runPendingJobs();
      }
    });

    return () => {
      unsubscribeConnectivity?.();
      appStateSubscription?.remove?.();
    };
  }, [userPrefs?.loaded, runPendingJobs]);

  React.useEffect(() => {
    if (!userPrefs?.loaded) return;
    runPendingJobs();
  }, [providerSignature, userPrefs?.loaded, runPendingJobs]);

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <SafeAreaProvider>
          <UserProvider>
            <ProductProvider>
              <AppRuntime />
            </ProductProvider>
          </UserProvider>
        </SafeAreaProvider>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}
