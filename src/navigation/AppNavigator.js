// src/navigation/AppNavigator.js
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator, TransitionPresets } from '@react-navigation/stack';

import ScannerScreen from '../screens/ScannerScreen';
import CompareScreen from '../screens/CompareScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ProductDetailScreen from '../screens/ProductDetailScreen';
import LoginScreen from '../screens/LoginScreen';
import AnimatedSplashScreen from '../screens/AnimatedSplashScreen'; // Import your new screen
import FloatingTabBar from '../components/FloatingTabBar';

const Tab = createBottomTabNavigator();
const RootStack = createStackNavigator();

function TabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false }}
      initialRouteName="Scanner"
    >
      <Tab.Screen name="Compare" component={CompareScreen} />
      <Tab.Screen name="Scanner" component={ScannerScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <RootStack.Navigator
      initialRouteName="Splash" // Start the app on the splash screen
      screenOptions={{
        headerShown: false,
        ...TransitionPresets.SlideFromRightIOS,
        cardStyle: { backgroundColor: '#F8F7FF' },
      }}
    >
      {/* Add the splash screen to your stack */}
      <RootStack.Screen name="Splash" component={AnimatedSplashScreen} />
      <RootStack.Screen name="Main" component={TabNavigator} />
      <RootStack.Screen name="ProductDetail" component={ProductDetailScreen} />
      <RootStack.Screen name="Login" component={LoginScreen} options={{ presentation: 'modal' }} />
    </RootStack.Navigator>
  );
}