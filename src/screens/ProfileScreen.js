// Ffads — Profile Screen (Tabbed, API Keys, Cleaned up)
import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Alert, TextInput, KeyboardAvoidingView, Platform,
  Image, Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUser } from '../store/UserContext';
import { useProducts } from '../store/ProductContext';
import { getSupabaseClient, getContributionCount } from '../services/supabase';

// Extracted tab components
import HealthTab from '../components/profile/HealthTab';
import AITab from '../components/profile/AITab';
import ApiTab from '../components/profile/ApiTab';
import HistoryTab from '../components/profile/HistoryTab';
import ContributionsTab from '../components/profile/ContributionsTab';

// Shared styles
import { styles } from '../components/profile/profileStyles';
import { colors } from '../theme/colors';

export default function ProfileScreen({ navigation }) {
  const { userPrefs, userDispatch } = useUser();
  const { productState, productDispatch } = useProducts();

  // Profile State
  const [profileName, setProfileName] = useState('Food Explorer');
  const [profileEmail, setProfileEmail] = useState('@guest');
  const [avatarUri, setAvatarUri] = useState(null);
  const [contributionCount, setContributionCount] = useState(0);

  // UI State
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [newNameInput, setNewNameInput] = useState('');
  
  // Tab Modals
  const [activeModal, setActiveModal] = useState(null);

  useEffect(() => {
    async function loadProfileData() {
      // Load Avatar
      const savedUri = await AsyncStorage.getItem('@ffads_user_avatar');
      if (savedUri) setAvatarUri(savedUri);

      // Use persisted email/name from UserContext first (set by LoginScreen)
      if (userPrefs.email) {
        setProfileEmail(userPrefs.email);
      }
      if (userPrefs.fullName) {
        setProfileName(userPrefs.fullName);
      }

      // Load Supabase Identity (overrides if available)
      const client = getSupabaseClient();
      if (client) {
        try {
          const { data } = await client.auth.getUser();
          if (data?.user?.email) {
            const supaName = data.user.user_metadata?.full_name || '';
            if (supaName) {
              setProfileName(supaName);
              userDispatch({ type: 'SET_FULL_NAME', payload: supaName });
            }
            setProfileEmail(data.user.email);
            userDispatch({ type: 'SET_EMAIL', payload: data.user.email });
          }
        } catch {}
      }

      // Load contribution count for this user's email
      const email = userPrefs.email || null;
      const count = await getContributionCount(email);
      setContributionCount(count);
    }
    loadProfileData();
  }, [userPrefs.email, userPrefs.fullName]);

  const handlePickImage = async () => {
    try {
      const ImagePicker = require('expo-image-picker');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      });
      if (!result.canceled) {
        const uri = result.assets[0].uri;
        setAvatarUri(uri);
        await AsyncStorage.setItem('@ffads_user_avatar', uri);
      }
    } catch (err) {
      Alert.alert('Native Module Missing', 'Expo Image Picker needs to be rebuilt into your Dev Client.');
    }
  };

  const handleSaveProfile = async () => {
    if (!newNameInput.trim()) return;
    setProfileName(newNameInput);
    setEditModalVisible(false);
    
    const client = getSupabaseClient();
    if (client) {
      await client.auth.updateUser({ data: { full_name: newNameInput } });
    }
  };

  const handleClearHistory = useCallback(() => {
    Alert.alert(
      'Clear All History?',
      'This will delete all your scanned products from history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: () => productDispatch({ type: 'CLEAR_HISTORY' }) },
      ]
    );
  }, [productDispatch]);

  const handleProductPress = useCallback((product) => {
    navigation.navigate('ProductDetail', { productId: product.id });
  }, [navigation]);

  const totalScans = productState.history.length;

  // Count today's scans
  const todayStr = new Date().toDateString();
  const todayScans = productState.history.filter(p => {
    if (!p.scannedAt) return false;
    return new Date(p.scannedAt).toDateString() === todayStr;
  }).length;

  const modalTitles = {
    health: 'Health & Diet',
    ai: 'AI Logic',
    api: 'Developer Auth',
    history: 'Scan History',
    contributions: 'My Contributions',
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* User Header */}
        <View style={styles.headerBlock}>
          <TouchableOpacity onPress={() => { setNewNameInput(profileName); setEditModalVisible(true); }} style={styles.avatarWrap}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarImagePlaceholder}>
                <Ionicons name="person" size={40} color="#666" />
              </View>
            )}
            <View style={styles.editBadge}>
              <Ionicons name="pencil" size={12} color="#FFF" />
            </View>
          </TouchableOpacity>
          <Text style={styles.nameText}>{profileName}</Text>
          <Text style={styles.emailText}>{profileEmail}</Text>

          {/* Auth Button directly under email */}
          {userPrefs?.email ? (
            <TouchableOpacity style={styles.headerAuthBtn} onPress={async () => {
              Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign Out', style: 'destructive', onPress: async () => {
                    const client = getSupabaseClient();
                    if (client) await client.auth.signOut();
                    userDispatch({ type: 'SET_EMAIL', payload: null });
                    userDispatch({ type: 'SET_FULL_NAME', payload: null });
                    Alert.alert('Signed out', 'You are now browsing as a guest.');
                    setProfileEmail('@guest');
                    setProfileName('Food Explorer');
                }}
              ]);
            }}>
              <Text style={styles.headerAuthBtnText}>Sign Out</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.headerAuthBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => navigation.navigate('Login')}>
              <Text style={[styles.headerAuthBtnText, { color: '#FFF' }]}>Sign In / Register</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Stats Row — 3 columns */}
        <View style={styles.statsContainer}>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{totalScans}</Text>
            <Text style={styles.statLabel}>Total Scanned</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{todayScans}</Text>
            <Text style={styles.statLabel}>Scanned Today</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{contributionCount}</Text>
            <Text style={styles.statLabel}>Contributed</Text>
          </View>
        </View>

        {/* Settings Menu List */}
        <View style={styles.menuContainer}>
          <TouchableOpacity style={styles.menuRow} onPress={() => { setNewNameInput(profileName); setEditModalVisible(true); }}>
            <View style={styles.menuIconBox}><Ionicons name="person-outline" size={18} color="#1A1A1A" /></View>
            <Text style={styles.menuRowText}>Edit Profile</Text>
            <Ionicons name="chevron-forward" size={18} color="#CCC" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuRow} onPress={() => setActiveModal('health')}>
            <View style={[styles.menuIconBox, { backgroundColor: '#FEE2E2' }]}>
              <Ionicons name="fitness-outline" size={18} color="#DC2626" />
            </View>
            <Text style={styles.menuRowText}>Health & Diet</Text>
            <Ionicons name="chevron-forward" size={18} color="#CCC" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuRow} onPress={() => setActiveModal('history')}>
             <View style={styles.menuIconBox}><Ionicons name="time-outline" size={18} color="#1A1A1A" /></View>
             <Text style={styles.menuRowText}>Scan History</Text>
             <Ionicons name="chevron-forward" size={18} color="#CCC" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuRow} onPress={() => setActiveModal('contributions')}>
            <View style={[styles.menuIconBox, { backgroundColor: '#ECFDF5' }]}>
              <Ionicons name="cloud-upload-outline" size={18} color="#059669" />
            </View>
            <Text style={styles.menuRowText}>My Contributions</Text>
            <View style={styles.menuBadge}>
              <Text style={styles.menuBadgeText}>{contributionCount}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#CCC" />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionHeader}>Developer Core</Text>
        <View style={styles.menuContainer}>
          <TouchableOpacity style={styles.menuRow} onPress={() => setActiveModal('ai')}>
            <View style={[styles.menuIconBox, {backgroundColor: '#E0E7FF'}]}><Ionicons name="sparkles-outline" size={18} color="#4338CA" /></View>
            <Text style={styles.menuRowText}>AI Routing & Models</Text>
            <Ionicons name="chevron-forward" size={18} color="#CCC" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />
          <TouchableOpacity style={styles.menuRow} onPress={() => setActiveModal('api')}>
            <View style={[styles.menuIconBox, {backgroundColor: '#FEF3C7'}]}><Ionicons name="server-outline" size={18} color="#D97706" /></View>
            <Text style={styles.menuRowText}>Supabase & Custom Connections</Text>
            <Ionicons name="chevron-forward" size={18} color="#CCC" />
          </TouchableOpacity>
        </View>

        {/* Footer / Sign Out removed from here and moved to header */}

      </ScrollView>

      {/* Tab Modals */}
      <Modal visible={activeModal !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setActiveModal(null)}>
        <SafeAreaView style={{flex: 1, backgroundColor: '#FAF9F6'}}>
          <View style={styles.modalSubHeader}>
            <TouchableOpacity onPress={() => setActiveModal(null)} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={24} color="#1A1A1A" />
            </TouchableOpacity>
            <Text style={styles.modalSubTitle}>{modalTitles[activeModal] || ''}</Text>
          </View>
          <ScrollView contentContainerStyle={{padding: 24, paddingBottom: 100}}>

            {activeModal === 'health' && <HealthTab userPrefs={userPrefs} userDispatch={userDispatch} />}
            {activeModal === 'ai' && <AITab userPrefs={userPrefs} userDispatch={userDispatch} />}
            {activeModal === 'api' && <ApiTab userPrefs={userPrefs} userDispatch={userDispatch} onClearHistory={handleClearHistory} />}
            {activeModal === 'history' && <HistoryTab history={productState.history} onPressProduct={handleProductPress} />}
            {activeModal === 'contributions' && <ContributionsTab userEmail={profileEmail !== '@guest' ? profileEmail : null} />}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal visible={editModalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.editCard}>
            <View style={styles.modalSubHeader}>
              <Text style={styles.modalSubTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}><Ionicons name="close" size={24} color="#1A1A1A" /></TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.avatarPicker} onPress={handlePickImage} activeOpacity={0.8}>
               {avatarUri ? <Image source={{ uri: avatarUri }} style={styles.avatarImageLarge} /> : <View style={styles.avatarImagePlaceholderLarge}><Ionicons name="camera" size={32} color="#666" /></View>}
               <Text style={styles.changePhotoText}>Change Photo</Text>
            </TouchableOpacity>

            <Text style={styles.inputLabelVintage}>Full Name</Text>
            <TextInput style={styles.vintageInput} value={newNameInput} onChangeText={setNewNameInput} placeholder="Your Name" placeholderTextColor="#999" />
            
            <Text style={styles.inputLabelVintage}>Email Address</Text>
            <TextInput style={[styles.vintageInput, { backgroundColor: '#F0F0F0', color: '#999' }]} value={profileEmail} editable={false} />

            <TouchableOpacity style={styles.saveBtnVintage} onPress={handleSaveProfile}>
              <Text style={styles.saveBtnTextVintage}>Save Changes</Text>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </View>
      </Modal>

    </SafeAreaView>
  );
}
