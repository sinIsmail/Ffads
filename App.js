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

// Offline Queue Handlers
import { startConnectivityWatchdog, registerQueueHandlers } from './src/services/connectivity';
import { saveProduct } from './src/services/supabase';
import { contributeToOFF } from './src/services/openfoodfacts';

export default function App() {
  React.useEffect(() => {
    // Register the tasks the offline queue should execute when connection restores
    registerQueueHandlers({
      product_save:     (payload) => saveProduct(payload),
      off_contribution: (payload) => contributeToOFF(payload, null, {}),
    });
    // Start listening to network changes
    startConnectivityWatchdog();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <SafeAreaProvider>
          <UserProvider>
            <ProductProvider>
              <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
              <NavigationContainer>
                <AppNavigator />
              </NavigationContainer>
            </ProductProvider>
          </UserProvider>
        </SafeAreaProvider>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}
