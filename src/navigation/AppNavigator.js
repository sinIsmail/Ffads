// Ffads — App Navigator
import React, { useState, useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator, TransitionPresets } from '@react-navigation/stack';

import ScannerScreen from '../screens/ScannerScreen';
import CompareScreen from '../screens/CompareScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ProductDetailScreen from '../screens/ProductDetailScreen';
import LoginScreen from '../screens/LoginScreen';
import FloatingTabBar from '../components/FloatingTabBar';
import { getSupabaseClient } from '../services/supabase';

const Tab = createBottomTabNavigator();
const RootStack = createStackNavigator();

function TabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
      initialRouteName="Scanner"
    >
      <Tab.Screen name="Compare" component={CompareScreen} />
      <Tab.Screen name="Scanner" component={ScannerScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const [initialRoute, setInitialRoute] = useState(null);

  useEffect(() => {
    async function checkAuth() {
      try {
        const client = getSupabaseClient();
        if (client) {
          const { data } = await client.auth.getSession();
          if (data?.session) {
            setInitialRoute('Main');
            return;
          }
        }
      } catch (e) {
        // If Supabase init fails, default to Login
      }
      setInitialRoute('Login');
    }
    
    // Slight delay to ensure UserContext has loaded async storage keys
    setTimeout(checkAuth, 100);
  }, []);

  if (!initialRoute) return null;

  return (
    <RootStack.Navigator
      initialRouteName={initialRoute}
      screenOptions={{
        headerShown: false,
        ...TransitionPresets.SlideFromRightIOS,
        cardStyle: { backgroundColor: '#F8F7FF' },
      }}
    >
      <RootStack.Screen name="Main" component={TabNavigator} />
      <RootStack.Screen name="ProductDetail" component={ProductDetailScreen} />
      <RootStack.Screen name="Login" component={LoginScreen} options={{ presentation: 'modal' }} />
    </RootStack.Navigator>
  );
}
