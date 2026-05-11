import React, { useEffect, useRef } from 'react';
import { Tabs } from 'expo-router';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { COLORS } from '../constants/theme';
import { useAuth } from '../contexts/AuthContext';
import { useImpersonation } from '../contexts/ImpersonationContext';
import AuthModal from '../components/AuthModal';

export default function TabLayout() {
  const { isAuthenticated, profile, isLoading, profileMissing, setShowAuthModal } = useAuth();
  const { effectiveProfile, isImpersonating } = useImpersonation();
  const router = useRouter();
  const hasRedirectedClient = useRef(false);
  const hasRedirectedMissing = useRef(false);
  const hasRedirectedTrainer = useRef(false);

  // Redirect users with missing profiles back to the index error screen
  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated && profileMissing && !hasRedirectedMissing.current) {
      hasRedirectedMissing.current = true;
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, profileMissing]);

  // Only redirect client-role users to the client portal
  // But NOT when admin is impersonating
  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      hasRedirectedClient.current = false;
      hasRedirectedMissing.current = false;
      hasRedirectedTrainer.current = false;
      return;
    }

    // Don't redirect if impersonating - admin stays in tabs
    if (isImpersonating) return;

    if (profile?.role === 'client' && !hasRedirectedClient.current) {
      hasRedirectedClient.current = true;
      router.replace('/(client)');
    }
  }, [isAuthenticated, isLoading, profile?.role, isImpersonating]);

  // Redirect trainers to their dedicated Trainer Home tab
  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    if (isImpersonating) return;
    if (profile?.role === 'trainer' && !hasRedirectedTrainer.current) {
      hasRedirectedTrainer.current = true;
      router.replace('/(tabs)/trainer-home');
    }
  }, [isAuthenticated, isLoading, profile?.role, isImpersonating]);


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

  // Client role — show loading while redirect fires (unless impersonating)
  if (profile?.role === 'client' && !isImpersonating) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  const isAdmin = profile?.role === 'admin';
  const isFranchiseManager = profile?.role === 'franchise_manager';
  const isTrainer = profile?.role === 'trainer';
  const isDietitian = profile?.role === 'dietitian';
  const isCoachRole = isTrainer || isDietitian;
  // Admin: Dashboard + Franchises only
  // Franchise Manager: Dashboard + Contacts (clients tab)
  // Trainers: Home + Schedule + Clients + Coaches + My KPIs
  // Dietitians: Dashboard + Clients + Schedule + Coaches + My KPIs


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
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid" size={size} color={color} />
          ),
          // Hide Dashboard tab for trainers (they use Trainer Home)
          href: isTrainer ? null : '/(tabs)',
        }}
      />

      <Tabs.Screen
        name="trainer-home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
          // Only trainers see the Trainer Home tab
          href: isTrainer ? '/(tabs)/trainer-home' : null,
        }}
      />




      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Schedule',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar" size={size} color={color} />
          ),
          // Hidden from bottom tab bar for all roles — accessible from Dashboard tab selector
          href: null,
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: isFranchiseManager ? 'Contacts' : 'Clients',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people" size={size} color={color} />
          ),
          // Hide for admin (admin only manages franchises)
          href: isAdmin ? null : '/(tabs)/clients',
        }}
      />
      <Tabs.Screen
        name="franchises"
        options={{
          title: 'Franchises',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="business" size={size} color={color} />
          ),
          // Only admin sees Franchises tab
          href: isAdmin ? '/(tabs)/franchises' : null,
        }}
      />

      <Tabs.Screen
        name="coaches"
        options={{
          title: 'Coaches',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-circle" size={size} color={color} />
          ),
          // Hide for admin and franchise manager
          href: (isAdmin || isFranchiseManager) ? null : '/(tabs)/coaches',
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: isCoachRole ? 'My KPIs' : 'Reports',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name={isCoachRole ? 'ribbon' : 'bar-chart'} size={size} color={color} />
          ),
          // Hidden from bottom tab bar for all roles — 7 Strategies & Marketing now on Dashboard
          href: null,
        }}
      />



      <Tabs.Screen
        name="admin"
        options={{
          title: 'Admin',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="shield-checkmark" size={size} color={color} />
          ),
          // Hide admin tab for everyone now
          href: null,
        }}
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
