/**
 * OfflineIndicator
 *
 * A subtle, animated indicator shown in the food journal when the device is
 * offline or there are queued entries waiting to sync. Displays:
 * - Offline banner with cloud-offline icon
 * - Syncing spinner when processing queue
 * - Pending count badge
 * - Conflict resolution count
 */

import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../../constants/theme';
import {
  offlineFoodQueue,
  subscribeToFoodQueue,
  type FoodQueueState,
  type FoodQueueSyncStatus,
} from '../../lib/offlineFoodJournalQueue';

interface OfflineIndicatorProps {
  /** Compact mode shows a smaller inline badge instead of a full bar */
  compact?: boolean;
}

export default function OfflineIndicator({ compact = false }: OfflineIndicatorProps) {
  const [state, setState] = useState<FoodQueueState>(offlineFoodQueue.getState());
  const slideAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const unsubscribe = subscribeToFoodQueue((newState) => {
      setState(newState);
    });
    return unsubscribe;
  }, []);

  // Animate in/out based on visibility
  const shouldShow = !state.isOnline || state.queueCount > 0 || state.isSyncing;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: shouldShow ? 1 : 0,
      tension: 80,
      friction: 12,
      useNativeDriver: true,
    }).start();
  }, [shouldShow]);

  // Pulse animation when syncing
  useEffect(() => {
    if (state.isSyncing) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.6, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [state.isSyncing]);

  if (!shouldShow) return null;

  const handleRetry = () => {
    offlineFoodQueue.forceSync();
  };

  // Determine display config
  const config = getDisplayConfig(state);

  if (compact) {
    return (
      <Animated.View
        style={[
          styles.compactContainer,
          { backgroundColor: config.bgColor, borderColor: config.borderColor },
          {
            opacity: slideAnim,
            transform: [{ scale: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
          },
        ]}
      >
        {state.isSyncing ? (
          <ActivityIndicator size="small" color={config.iconColor} />
        ) : (
          <Ionicons name={config.icon as any} size={12} color={config.iconColor} />
        )}
        <Text style={[styles.compactText, { color: config.textColor }]} numberOfLines={1}>
          {config.shortLabel}
        </Text>
        {state.queueCount > 0 && !state.isSyncing && (
          <View style={[styles.compactBadge, { backgroundColor: config.iconColor }]}>
            <Text style={styles.compactBadgeText}>{state.queueCount}</Text>
          </View>
        )}
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: config.bgColor, borderColor: config.borderColor },
        {
          opacity: slideAnim,
          transform: [
            {
              translateY: slideAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [-20, 0],
              }),
            },
          ],
        },
      ]}
    >
      <Animated.View style={[styles.row, { opacity: state.isSyncing ? pulseAnim : 1 }]}>
        <View style={[styles.iconCircle, { backgroundColor: config.iconColor + '20' }]}>
          {state.isSyncing ? (
            <ActivityIndicator size="small" color={config.iconColor} />
          ) : (
            <Ionicons name={config.icon as any} size={16} color={config.iconColor} />
          )}
        </View>

        <View style={styles.textContainer}>
          <Text style={[styles.label, { color: config.textColor }]}>{config.label}</Text>
          <Text style={[styles.sublabel, { color: config.textColor + 'aa' }]}>{config.sublabel}</Text>
        </View>

        {state.queueCount > 0 && (
          <View style={[styles.badge, { backgroundColor: config.iconColor }]}>
            <Text style={styles.badgeText}>{state.queueCount}</Text>
          </View>
        )}

        {state.syncStatus === 'error' && (
          <TouchableOpacity style={styles.retryBtn} onPress={handleRetry} activeOpacity={0.7}>
            <Ionicons name="refresh-outline" size={14} color={config.iconColor} />
            <Text style={[styles.retryText, { color: config.iconColor }]}>Retry</Text>
          </TouchableOpacity>
        )}
      </Animated.View>

      {state.conflictsResolved > 0 && state.syncStatus === 'synced' && (
        <View style={styles.conflictRow}>
          <Ionicons name="git-merge-outline" size={10} color={COLORS.textMuted} />
          <Text style={styles.conflictText}>
            {state.conflictsResolved} conflict{state.conflictsResolved !== 1 ? 's' : ''} auto-resolved
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

// ── Display Config ──

function buildQueueDescription(state: FoodQueueState): string {
  const parts: string[] = [];
  if (state.pendingAdds > 0) {
    parts.push(`${state.pendingAdds} food add${state.pendingAdds !== 1 ? 's' : ''}`);
  }
  if (state.pendingDeletes > 0) {
    parts.push(`${state.pendingDeletes} delete${state.pendingDeletes !== 1 ? 's' : ''}`);
  }
  if (state.pendingWaterUpserts > 0) {
    parts.push(`${state.pendingWaterUpserts} water update${state.pendingWaterUpserts !== 1 ? 's' : ''}`);
  }
  if (parts.length === 0) return `${state.queueCount} entry${state.queueCount !== 1 ? 'ies' : ''}`;
  return parts.join(', ');
}

function getDisplayConfig(state: FoodQueueState) {
  const queueDesc = buildQueueDescription(state);

  if (!state.isOnline) {
    return {
      icon: 'cloud-offline-outline',
      label: 'You\'re Offline',
      shortLabel: 'Offline',
      sublabel: state.queueCount > 0
        ? `${queueDesc} will sync when reconnected`
        : 'Entries will be saved locally',
      bgColor: '#f39c1208',
      borderColor: '#f39c1225',
      iconColor: '#f39c12',
      textColor: '#b27d10',
    };
  }

  if (state.isSyncing) {
    return {
      icon: 'sync-outline',
      label: 'Syncing Entries',
      shortLabel: 'Syncing...',
      sublabel: `Processing ${queueDesc}...`,
      bgColor: '#0E8AC808',
      borderColor: '#0E8AC825',
      iconColor: '#0E8AC8',
      textColor: '#0A6FA0',
    };
  }

  if (state.syncStatus === 'error') {
    return {
      icon: 'alert-circle-outline',
      label: 'Sync Failed',
      shortLabel: 'Sync Error',
      sublabel: state.lastError || `${queueDesc} pending`,
      bgColor: '#e74c3c08',
      borderColor: '#e74c3c25',
      iconColor: '#e74c3c',
      textColor: '#c0392b',
    };
  }

  if (state.syncStatus === 'partial') {
    return {
      icon: 'warning-outline',
      label: 'Partial Sync',
      shortLabel: 'Partial',
      sublabel: `${queueDesc} still pending`,
      bgColor: '#f39c1208',
      borderColor: '#f39c1225',
      iconColor: '#f39c12',
      textColor: '#b27d10',
    };
  }

  // Queue has items but status is idle/synced (shouldn't normally happen, but handle it)
  if (state.queueCount > 0) {
    return {
      icon: 'time-outline',
      label: 'Pending Sync',
      shortLabel: 'Pending',
      sublabel: `${queueDesc} queued`,
      bgColor: '#0E8AC808',
      borderColor: '#0E8AC825',
      iconColor: '#0E8AC8',
      textColor: '#0A6FA0',
    };
  }

  // Fallback (shouldn't be visible)
  return {
    icon: 'checkmark-circle-outline',
    label: 'Synced',
    shortLabel: 'Synced',
    sublabel: 'All entries up to date',
    bgColor: '#2ecc7108',
    borderColor: '#2ecc7125',
    iconColor: '#2ecc71',
    textColor: '#27ae60',
  };
}


const styles = StyleSheet.create({
  container: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    padding: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  iconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
  },
  label: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
  },
  sublabel: {
    fontSize: 9,
    fontWeight: '500',
    marginTop: 1,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.white,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: COLORS.white,
    ...SHADOWS.sm,
  },
  retryText: {
    fontSize: 10,
    fontWeight: '700',
  },
  conflictRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingLeft: 42, // Align with text after icon circle
  },
  conflictText: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: '600',
  },

  // Compact mode
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
  },
  compactText: {
    fontSize: 9,
    fontWeight: '700',
    maxWidth: 80,
  },
  compactBadge: {
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  compactBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: COLORS.white,
  },
});
