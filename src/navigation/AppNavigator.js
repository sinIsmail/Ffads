// src/navigation/AppNavigator.js
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator, TransitionPresets } from '@react-navigation/stack';

import ScannerScreen from '../screens/ScannerScreen';
import CompareScreen from '../screens/CompareScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ProductDetailScreen from '../screens/ProductDetailScreen';
import LoginScreen from '../screens/LoginScreen';
import AnimatedSplashScreen from '../screens/AnimatedSplashScreen';
import MyQrScreen from '../screens/MyQrScreen';
import CreateQrProductScreen from '../screens/CreateQrProductScreen';
import PersonalQrDetailScreen from '../screens/PersonalQrDetailScreen';

import FloatingTabBar from '../components/FloatingTabBar';
import SlideTabWrapper from '../components/SlideTabWrapper';
import { TabTransitionProvider } from './TabTransitionContext';

const Tab = createBottomTabNavigator();
const RootStack = createStackNavigator();

function TabNavigator() {
  return (
    <TabTransitionProvider>
      <Tab.Navigator
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{ headerShown: false }}
        initialRouteName="Scanner"
      >
        <Tab.Screen name="Compare">
          {(props) => (
            <SlideTabWrapper tabIndex={0}>
              <CompareScreen {...props} />
            </SlideTabWrapper>
          )}
        </Tab.Screen>
        <Tab.Screen name="Scanner">
          {(props) => (
            <SlideTabWrapper tabIndex={1}>
              <ScannerScreen {...props} />
            </SlideTabWrapper>
          )}
        </Tab.Screen>
        <Tab.Screen name="Profile">
          {(props) => (
            <SlideTabWrapper tabIndex={2}>
              <ProfileScreen {...props} />
            </SlideTabWrapper>
          )}
        </Tab.Screen>
      </Tab.Navigator>
    </TabTransitionProvider>
  );
}

export default function AppNavigator() {
  return (
    <RootStack.Navigator
      initialRouteName="Splash"
      screenOptions={{
        headerShown: false,
        ...TransitionPresets.SlideFromRightIOS,
        cardStyle: { backgroundColor: '#F8F7FF' },
      }}
    >
      <RootStack.Screen name="Splash" component={AnimatedSplashScreen} />
      <RootStack.Screen name="Main" component={TabNavigator} />
      <RootStack.Screen name="ProductDetail" component={ProductDetailScreen} />
      <RootStack.Screen name="MyQr" component={MyQrScreen} />
      <RootStack.Screen name="CreateQrProduct" component={CreateQrProductScreen} />
      <RootStack.Screen name="PersonalQrDetail" component={PersonalQrDetailScreen} />
      <RootStack.Screen name="Login" component={LoginScreen} options={{ presentation: 'modal' }} />
    </RootStack.Navigator>
  );
}
