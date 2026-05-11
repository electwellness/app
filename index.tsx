import React, { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from './contexts/AuthContext';
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS, BRAND } from './constants/theme';
import AuthModal from './components/AuthModal';

export default function Index() {
  const { isAuthenticated, profile, isLoading, profileMissing, user, signOut } = useAuth();
  const router = useRouter();
  const hasRedirected = useRef(false);

  useEffect(() => {
    if (isLoading) {
      hasRedirected.current = false;
      return;
    }

    if (!isAuthenticated) {
      hasRedirected.current = false;
      return;
    }

    // Don't redirect if profile is missing — show the error screen instead
    if (profileMissing) {
      hasRedirected.current = false;
      return;
    }

    // Prevent multiple redirects
    if (hasRedirected.current) return;
    hasRedirected.current = true;

    // Route clients to the client portal
    if (profile?.role === 'client') {
      router.replace('/(client)');
    } else {
      // All other roles go to the admin/staff dashboard
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isLoading, profile?.role, profileMissing, router]);

  // Reset redirect flag when auth state changes to unauthenticated
  useEffect(() => {
    if (!isAuthenticated) {
      hasRedirected.current = false;
    }
  }, [isAuthenticated]);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  // Not authenticated - show auth modal as mandatory gate
  if (!isAuthenticated) {
    return (
      <View style={styles.loading}>
        <AuthModal visible={true} onClose={() => {}} />
      </View>
    );
  }

  // Authenticated but no profile record — show clear error message
  if (profileMissing) {
    return (
      <View style={styles.errorContainer}>
        <View style={styles.errorCard}>
          {/* Brand Header */}
          <Image
            source={{ uri: BRAND.logoIcon }}
            style={styles.errorLogo}
            resizeMode="contain"
          />

          {/* Error Icon */}
          <View style={styles.errorIconCircle}>
            <Ionicons name="alert-circle" size={48} color={COLORS.danger} />
          </View>

          {/* Title */}
          <Text style={styles.errorTitle}>Account Setup Incomplete</Text>

          {/* Description */}
          <Text style={styles.errorDescription}>
            Your login was successful, but your account profile could not be found. This usually means your account was not fully set up in the system.
          </Text>

          {/* User Info */}
          <View style={styles.errorInfoBox}>
            <Ionicons name="mail-outline" size={16} color={COLORS.textSecondary} />
            <Text style={styles.errorInfoText}>
              {user?.email || 'Unknown email'}
            </Text>
          </View>

          {/* What to do */}
          <View style={styles.errorStepsBox}>
            <Text style={styles.errorStepsTitle}>What to do:</Text>
            <View style={styles.errorStepRow}>
              <View style={styles.errorStepNumber}>
                <Text style={styles.errorStepNumberText}>1</Text>
              </View>
              <Text style={styles.errorStepText}>
                Sign out using the button below
              </Text>
            </View>
            <View style={styles.errorStepRow}>
              <View style={styles.errorStepNumber}>
                <Text style={styles.errorStepNumberText}>2</Text>
              </View>
              <Text style={styles.errorStepText}>
                Contact your Elect Wellness administrator to verify your account is properly set up
              </Text>
            </View>
            <View style={styles.errorStepRow}>
              <View style={styles.errorStepNumber}>
                <Text style={styles.errorStepNumberText}>3</Text>
              </View>
              <Text style={styles.errorStepText}>
                Once resolved, sign back in with your email and password
              </Text>
            </View>
          </View>

          {/* Sign Out Button */}
          <TouchableOpacity
            style={styles.signOutBtn}
            onPress={signOut}
            activeOpacity={0.8}
          >
            <Ionicons name="log-out-outline" size={20} color={COLORS.white} />
            <Text style={styles.signOutBtnText}>Sign Out</Text>
          </TouchableOpacity>

          {/* Support Note */}
          <Text style={styles.supportNote}>
            If this issue persists, please contact support with your email address so we can resolve it.
          </Text>
        </View>
      </View>
    );
  }

  // Show loading while redirecting
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={COLORS.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  // Profile Missing Error Screen
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.lg,
  },
  errorCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xxl,
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    ...SHADOWS.lg,
  },
  errorLogo: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginBottom: SPACING.lg,
  },
  errorIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.dangerLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  errorTitle: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '800',
    color: COLORS.primary,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  errorDescription: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.lg,
  },
  errorInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.navy50,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.lg,
    alignSelf: 'stretch',
  },
  errorInfoText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    fontWeight: '600',
    flex: 1,
  },
  errorStepsBox: {
    alignSelf: 'stretch',
    backgroundColor: COLORS.brandBlueLight,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  errorStepsTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.md,
  },
  errorStepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  errorStepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  errorStepNumberText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '800',
    color: COLORS.white,
  },
  errorStepText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.primaryLight,
    lineHeight: 21,
    flex: 1,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.danger,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xxl,
    gap: SPACING.sm,
    alignSelf: 'stretch',
    marginBottom: SPACING.lg,
    ...SHADOWS.md,
  },
  signOutBtnText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.white,
  },
  supportNote: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    fontStyle: 'italic',
  },
});
