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

export default function App() {
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
