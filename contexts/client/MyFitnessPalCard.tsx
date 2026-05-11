import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, TextInput,
  ActivityIndicator, Alert, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import {
  getMFPConnection, connectMFP, disconnectMFP, updateMFPSyncSettings,
  formatMFPSyncTime, MFP_BRAND,
  type MFPConnection,
} from '../../lib/myfitnesspalService';

interface MyFitnessPalCardProps {
  onConnectionChange?: (connected: boolean) => void;
}

export default function MyFitnessPalCard({ onConnectionChange }: MyFitnessPalCardProps) {
  const [connection, setConnection] = useState<MFPConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [showConnectForm, setShowConnectForm] = useState(false);
  const [username, setUsername] = useState('');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    loadConnection();
  }, []);

  const loadConnection = async () => {
    setLoading(true);
    const conn = await getMFPConnection();
    setConnection(conn);
    setLoading(false);
  };

  const handleConnect = async () => {
    if (!username.trim()) {
      Alert.alert('Error', 'Please enter your MyFitnessPal username or email');
      return;
    }
    setConnecting(true);
    const { connection: conn, error } = await connectMFP(username);
    setConnecting(false);

    if (error) {
      Alert.alert('Connection Failed', error);
      return;
    }

    setConnection(conn);
    setShowConnectForm(false);
    setUsername('');
    onConnectionChange?.(true);
    Alert.alert('Connected!', `Successfully linked to MyFitnessPal as ${conn?.displayName}`);
  };

  const handleDisconnect = () => {
    Alert.alert(
      'Disconnect MyFitnessPal',
      'This will stop syncing your food diary. Your existing imported data will remain.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            await disconnectMFP();
            setConnection(null);
            setExpanded(false);
            onConnectionChange?.(false);
          },
        },
      ]
    );
  };

  const handleToggleAutoSync = async (value: boolean) => {
    const updated = await updateMFPSyncSettings({ autoSync: value });
    if (updated) setConnection(updated);
  };

  const handleToggleSync = async (value: boolean) => {
    const updated = await updateMFPSyncSettings({ syncEnabled: value });
    if (updated) setConnection(updated);
  };

  if (loading) {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.mfpIconContainer}>
            <Image source={{ uri: MFP_BRAND.icon }} style={styles.mfpIcon} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{MFP_BRAND.name}</Text>
            <Text style={styles.cardSubtitle}>Loading...</Text>
          </View>
          <ActivityIndicator size="small" color={MFP_BRAND.color} />
        </View>
      </View>
    );
  }

  // Not connected state
  if (!connection?.connected) {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.mfpIconContainer}>
            <Image source={{ uri: MFP_BRAND.icon }} style={styles.mfpIcon} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{MFP_BRAND.name}</Text>
            <Text style={styles.cardSubtitle}>Sync your food diary automatically</Text>
          </View>
        </View>

        {!showConnectForm ? (
          <TouchableOpacity
            style={styles.connectBtn}
            onPress={() => setShowConnectForm(true)}
          >
            <Ionicons name="link-outline" size={18} color={COLORS.white} />
            <Text style={styles.connectBtnText}>Connect MyFitnessPal</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.connectForm}>
            <Text style={styles.formLabel}>Enter your MyFitnessPal username or email</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                placeholder="username or email"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!connecting}
              />
            </View>
            <View style={styles.formActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setShowConnectForm(false); setUsername(''); }}
                disabled={connecting}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.authBtn, connecting && { opacity: 0.7 }]}
                onPress={handleConnect}
                disabled={connecting}
              >
                {connecting ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <>
                    <Ionicons name="log-in-outline" size={16} color={COLORS.white} />
                    <Text style={styles.authBtnText}>Authorize</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
            <View style={styles.securityNote}>
              <Ionicons name="shield-checkmark-outline" size={12} color={COLORS.textMuted} />
              <Text style={styles.securityText}>
                Secure OAuth 2.0 connection. We never store your password.
              </Text>
            </View>
          </View>
        )}

        {/* Features list */}
        <View style={styles.featuresList}>
          {[
            { icon: 'sync-outline', text: 'Auto-sync food diary entries' },
            { icon: 'nutrition-outline', text: 'Import detailed macro data' },
            { icon: 'search-outline', text: 'Search MFP food database' },
            { icon: 'bar-chart-outline', text: 'Track weekly nutrition trends' },
          ].map((feat, i) => (
            <View key={i} style={styles.featureItem}>
              <Ionicons name={feat.icon as any} size={14} color={MFP_BRAND.color} />
              <Text style={styles.featureText}>{feat.text}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  // Connected state
  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.cardHeader}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <View style={styles.mfpIconContainer}>
          <Image source={{ uri: MFP_BRAND.icon }} style={styles.mfpIcon} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.connectedRow}>
            <Text style={styles.cardTitle}>{MFP_BRAND.name}</Text>
            <View style={styles.connectedBadge}>
              <View style={styles.connectedDot} />
              <Text style={styles.connectedText}>Connected</Text>
            </View>
          </View>
          <Text style={styles.cardSubtitle}>
            @{connection.username} · Last sync: {formatMFPSyncTime(connection.lastSyncAt)}
          </Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={COLORS.textMuted}
        />
      </TouchableOpacity>

      {/* Quick Stats */}
      <View style={styles.quickStats}>
        <View style={styles.quickStat}>
          <Ionicons name="flame-outline" size={14} color="#ff6b6b" />
          <Text style={styles.quickStatText}>14 day streak</Text>
        </View>
        <View style={styles.quickStatDivider} />
        <View style={styles.quickStat}>
          <Ionicons name="sync-outline" size={14} color={MFP_BRAND.color} />
          <Text style={styles.quickStatText}>
            {connection.autoSync ? 'Auto-sync on' : 'Manual sync'}
          </Text>
        </View>
      </View>

      {expanded && (
        <View style={styles.settingsSection}>
          {/* Sync Settings */}
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Sync Enabled</Text>
              <Text style={styles.settingDesc}>Allow data sync between platforms</Text>
            </View>
            <Switch
              value={connection.syncEnabled}
              onValueChange={handleToggleSync}
              trackColor={{ false: COLORS.border, true: MFP_BRAND.color + '60' }}
              thumbColor={connection.syncEnabled ? MFP_BRAND.color : '#f4f3f4'}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Auto-Sync</Text>
              <Text style={styles.settingDesc}>Automatically import new entries</Text>
            </View>
            <Switch
              value={connection.autoSync}
              onValueChange={handleToggleAutoSync}
              trackColor={{ false: COLORS.border, true: MFP_BRAND.color + '60' }}
              thumbColor={connection.autoSync ? MFP_BRAND.color : '#f4f3f4'}
            />
          </View>

          {/* Sync Frequency */}
          <View style={styles.frequencyRow}>
            <Text style={styles.settingLabel}>Sync Frequency</Text>
            <View style={styles.frequencyOptions}>
              {(['realtime', 'hourly', 'daily'] as const).map(freq => (
                <TouchableOpacity
                  key={freq}
                  style={[
                    styles.frequencyBtn,
                    connection.syncFrequency === freq && styles.frequencyBtnActive,
                  ]}
                  onPress={async () => {
                    const updated = await updateMFPSyncSettings({ syncFrequency: freq });
                    if (updated) setConnection(updated);
                  }}
                >
                  <Text style={[
                    styles.frequencyText,
                    connection.syncFrequency === freq && styles.frequencyTextActive,
                  ]}>
                    {freq.charAt(0).toUpperCase() + freq.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Account Info */}
          <View style={styles.accountInfo}>
            <Ionicons name="person-circle-outline" size={16} color={COLORS.textMuted} />
            <Text style={styles.accountText}>
              Connected as {connection.displayName} since{' '}
              {new Date(connection.connectedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </Text>
          </View>

          {/* Disconnect */}
          <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect}>
            <Ionicons name="unlink-outline" size={16} color={COLORS.danger} />
            <Text style={styles.disconnectText}>Disconnect MyFitnessPal</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  mfpIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: MFP_BRAND.colorLight,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  mfpIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  cardTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.text,
  },
  cardSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  connectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2ecc7115',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },
  connectedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2ecc71',
  },
  connectedText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#2ecc71',
  },
  // Quick Stats
  quickStats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
    marginHorizontal: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    gap: SPACING.md,
  },
  quickStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  quickStatText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  quickStatDivider: {
    width: 1,
    height: 14,
    backgroundColor: COLORS.border,
  },
  // Connect Form
  connectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: MFP_BRAND.color,
    marginHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
  },
  connectBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  connectForm: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  formLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  inputRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    height: 44,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  formActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  authBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: MFP_BRAND.color,
  },
  authBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.white,
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
  },
  securityText: {
    fontSize: 9,
    color: COLORS.textMuted,
    flex: 1,
  },
  // Features
  featuresList: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  featureText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  // Settings
  settingsSection: {
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
  },
  settingInfo: {
    flex: 1,
    marginRight: SPACING.md,
  },
  settingLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.text,
  },
  settingDesc: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  frequencyRow: {
    paddingVertical: SPACING.sm,
  },
  frequencyOptions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  frequencyBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  frequencyBtnActive: {
    backgroundColor: MFP_BRAND.colorLight,
    borderColor: MFP_BRAND.color,
  },
  frequencyText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  frequencyTextActive: {
    color: MFP_BRAND.color,
    fontWeight: '700',
  },
  accountInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    marginTop: SPACING.sm,
  },
  accountText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    flex: 1,
  },
  disconnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.danger + '30',
    marginTop: SPACING.sm,
  },
  disconnectText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.danger,
  },
});
