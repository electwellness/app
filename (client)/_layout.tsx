import React, { useEffect, useRef } from 'react';
import { Tabs } from 'expo-router';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { COLORS } from '../constants/theme';
import { useAuth } from '../contexts/AuthContext';
import AuthModal from '../components/AuthModal';

export default function ClientTabLayout() {
  const { isAuthenticated, profile, isLoading, profileMissing } = useAuth();
  const router = useRouter();
  const hasRedirectedNonClient = useRef(false);
  const hasRedirectedMissing = useRef(false);

  // Redirect users with missing profiles back to the index error screen
  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated && profileMissing && !hasRedirectedMissing.current) {
      hasRedirectedMissing.current = true;
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, profileMissing]);

  // Only redirect non-client roles to the admin tabs
  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      hasRedirectedNonClient.current = false;
      hasRedirectedMissing.current = false;
      return;
    }

    if (profile && profile.role !== 'client' && !hasRedirectedNonClient.current) {
      hasRedirectedNonClient.current = true;
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isLoading, profile?.role]);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  // Not authenticated — show auth modal as a full-screen gate (no redirect)
  if (!isAuthenticated) {
    return (
      <View style={styles.loading}>
        <AuthModal visible={true} onClose={() => {}} />
      </View>
    );
  }

  // Profile missing — show loading while redirect to index fires
  if (profileMissing) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  // Non-client role — show loading while redirect fires
  if (profile && profile.role !== 'client') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }


  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.accent,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarStyle: {
          backgroundColor: COLORS.white,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 4,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'My Plan',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="biometrics"
        options={{
          title: 'Biometrics',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="pulse" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="journal"
        options={{
          title: 'Food Journal',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="nutrition" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
      {/* Hidden from tab bar — accessed via CTA on the Biometrics screen */}
      <Tabs.Screen
        name="postural-history"
        options={{ href: null }}
      />
    </Tabs>
  );
}


const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
});
