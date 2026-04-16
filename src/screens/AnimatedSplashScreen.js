// src/screens/AnimatedSplashScreen.js
import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { getSupabaseClient } from '../services/supabase';

export default function AnimatedSplashScreen({ navigation }) {
  const [authRoute, setAuthRoute] = useState(null);
  const [isVideoFinished, setIsVideoFinished] = useState(false);

  // 1. Check Supabase auth in the background
  useEffect(() => {
    async function checkAuth() {
      try {
        const client = getSupabaseClient();
        if (client) {
          const { data } = await client.auth.getSession();
          if (data?.session) {
            setAuthRoute('Main');
            return;
          }
        }
      } catch (e) {
        console.error("Auth check failed", e);
      }
      setAuthRoute('Login');
    }
    
    checkAuth();
  }, []);

  // 2. Mark video as finished when playback naturally ends
  const handlePlaybackStatusUpdate = (status) => {
    if (status.didJustFinish) {
      setIsVideoFinished(true);
    }
  };

  // 3. Trigger navigation ONLY when BOTH the video is done AND auth is checked
  useEffect(() => {
    if (isVideoFinished && authRoute) {
      navigation.replace(authRoute);
    }
  }, [isVideoFinished, authRoute, navigation]);

  return (
    <View style={styles.container}>
      <Video
        source={require('../../assets/SPLASH-DEMO.mp4')} 
        style={styles.video} // <-- Applied custom size style here
        resizeMode={ResizeMode.CONTAIN} // <-- Changed to CONTAIN to prevent cropping
        shouldPlay                      
        isLooping={false}               
        onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffffff', // Black background
    alignItems: 'center',
    justifyContent: 'center',
  },
  video: {
    // Adjust these percentages to make the video smaller or larger
    width: '100%', 
    height: '100%', 
  },
});