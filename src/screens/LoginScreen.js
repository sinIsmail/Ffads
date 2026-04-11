// Ffads — Login Screen
import React, { useState } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, 
  KeyboardAvoidingView, Platform 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getSupabaseClient } from '../services/supabase';
import { useUser } from '../store/UserContext';

// Aesthetic Colors & Metrics
const aestheticColors = {
  background: '#FAF9F6',
  surface: '#FFFFFF',
  primaryText: '#1A1A1A',
  secondaryText: '#666666',
  buttonBg: '#1A1A1A',
  buttonText: '#FFFFFF',
  inputBorder: 'rgba(0,0,0,0.05)',
  shadow: 'rgba(0,0,0,0.06)'
};

export default function LoginScreen({ navigation }) {
  const { userDispatch } = useUser();
  const [isLogin, setIsLogin] = useState(true);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Return to whatever screen we came from
  const navigateBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.replace('Main');
    }
  };

  const handleAuth = async () => {
    if (!email || !password || (!isLogin && !fullName)) {
      Alert.alert('Error', 'Please fill in all required fields.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters.');
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      Alert.alert('Error', 'Supabase is not configured.');
      return;
    }

    setLoading(true);
    console.log(`\n🔐 ═══════════════════════════════════════════`);
    console.log(`🔐 [Auth] ${isLogin ? 'LOGIN' : 'SIGNUP'} → email="${email}"${!isLogin ? ` | name="${fullName}"` : ''}`);
    console.log(`🔐 ═══════════════════════════════════════════`);
    let result;

    if (!isLogin) {
      result = await client.auth.signUp({ 
        email, 
        password,
        options: { data: { full_name: fullName } }
      });
    } else {
      result = await client.auth.signInWithPassword({ email, password });
    }

    setLoading(false);

    if (result.error) {
      console.error(`🔐 [Auth] ❌ FAILED: ${result.error.message}`);
      Alert.alert('Authentication Failed', result.error.message);
    } else {
      console.log(`🔐 [Auth] ✅ SUCCESS — user authenticated as "${email}"`);
      userDispatch({ type: 'SET_EMAIL', payload: email });
      // Save full name so ProfileScreen can display it immediately
      const name = result.data?.user?.user_metadata?.full_name || fullName || '';
      if (name) {
        console.log(`🔐 [Auth] Saving full name: "${name}"`);
        userDispatch({ type: 'SET_FULL_NAME', payload: name });
      }
      Alert.alert('Success', !isLogin ? 'Account created successfully!' : 'Logged in successfully.');
      navigateBack();
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.topBar}>
          <TouchableOpacity onPress={navigateBack} style={styles.skipBtn}>
            <Text style={styles.skipBtnText}>Skip for now</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <View style={styles.headerBlock}>
            <Text style={styles.title}>
              {isLogin ? 'Welcome back' : 'Create account'}
            </Text>
            <Text style={styles.subtitle}>
              {isLogin ? 'Sign in to access your saved recipes and scans.' : 'Join us to save and share your food discoveries.'}
            </Text>
          </View>

          <View style={styles.formBlock}>
            {!isLogin && (
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="Full Name"
                  placeholderTextColor={aestheticColors.secondaryText}
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                />
              </View>
            )}

            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Email Address"
                placeholderTextColor={aestheticColors.secondaryText}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <View style={[styles.inputContainer, { flexDirection: 'row', alignItems: 'center' }]}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Password"
                placeholderTextColor={aestheticColors.secondaryText}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity 
                style={{ padding: 15, paddingRight: 20 }} 
                onPress={() => setShowPassword(!showPassword)}
                activeOpacity={0.7}
              >
                <Ionicons 
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'} 
                  size={20} 
                  color={aestheticColors.secondaryText} 
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.primaryBtn} onPress={handleAuth} disabled={loading}>
              {loading ? (
                <ActivityIndicator color={aestheticColors.buttonText} />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {isLogin ? 'Log In' : 'Sign Up'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.footerBlock}>
          <TouchableOpacity onPress={() => setIsLogin(!isLogin)} style={styles.toggleBtn}>
            <Text style={styles.footerText}>
              {isLogin ? "Don't have an account? " : "Already have an account? "}
              <Text style={styles.footerTextBold}>
                {isLogin ? 'Sign up' : 'Log in'}
              </Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: aestheticColors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },
  topBar: {
    paddingTop: 16,
    paddingBottom: 24,
    flexDirection: 'row',
  },
  backBtn: {
    padding: 8,
    marginLeft: -8,
  },
  skipBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: aestheticColors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: aestheticColors.inputBorder,
    shadowColor: aestheticColors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 2,
  },
  skipBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: aestheticColors.secondaryText,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  headerBlock: {
    marginBottom: 40,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: aestheticColors.primaryText,
    letterSpacing: -1,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: aestheticColors.secondaryText,
    lineHeight: 22,
  },
  formBlock: {
    gap: 16,
  },
  inputContainer: {
    backgroundColor: aestheticColors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: aestheticColors.inputBorder,
    shadowColor: aestheticColors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 2,
  },
  input: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    fontSize: 16,
    color: aestheticColors.primaryText,
    fontWeight: '500',
  },
  forgotBtn: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
  },
  forgotText: {
    fontSize: 14,
    fontWeight: '600',
    color: aestheticColors.secondaryText,
  },
  primaryBtn: {
    backgroundColor: aestheticColors.buttonBg,
    borderRadius: 20,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 4,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: aestheticColors.buttonText,
  },
  footerBlock: {
    paddingBottom: 32,
    alignItems: 'center',
  },
  toggleBtn: {
    padding: 16,
  },
  footerText: {
    fontSize: 15,
    color: aestheticColors.secondaryText,
  },
  footerTextBold: {
    fontWeight: '700',
    color: aestheticColors.primaryText,
  },
});
