/**
 * OfflineStatusBar
 *
 * A visual indicator bar for the schedule screen that shows:
 * - Online/offline connectivity status
 * - Pending queued operations count
 * - Sync progress animation
 * - Last synced timestamp
 * - Force sync / retry button
 * - Expandable details panel
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../../constants/theme';
import {
  scheduleOffline,
  type ScheduleOfflineState,
  type ScheduleSyncStatus,
  type QueuedOperation,
} from '../../lib/scheduleOfflineService';

interface OfflineStatusBarProps {
  /** Called after a successful sync so the parent can reload from DB */
  onSyncComplete?: () => void;
  /** Compact mode for tight layouts */
  compact?: boolean;
}

const STATUS_CONFIG: Record<ScheduleSyncStatus, {
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
  label: string;
}> = {
  idle: {
    icon: 'cloud-outline',
    color: COLORS.textMuted,
    bgColor: COLORS.borderLight,
    borderColor: COLORS.borderLight,
    label: 'Ready',
  },
  syncing: {
    icon: 'sync-outline',
    color: COLORS.accent,
    bgColor: COLORS.accent + '08',
    borderColor: COLORS.accent + '25',
    label: 'Syncing...',
  },
  synced: {
    icon: 'cloud-done-outline',
    color: '#27ae60',
    bgColor: '#27ae6008',
    borderColor: '#27ae6020',
    label: 'All Synced',
  },
  offline: {
    icon: 'cloud-offline-outline',
    color: '#e67e22',
    bgColor: '#e67e2208',
    borderColor: '#e67e2225',
    label: 'Offline Mode',
  },
  error: {
    icon: 'alert-circle-outline',
    color: '#e74c3c',
    bgColor: '#e74c3c08',
    borderColor: '#e74c3c20',
    label: 'Sync Error',
  },
  partial: {
    icon: 'warning-outline',
    color: '#f39c12',
    bgColor: '#f39c1208',
    borderColor: '#f39c1220',
    label: 'Partial Sync',
  },
};

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return 'Never';
  const now = new Date();
  const then = new Date(isoString);
  const diffMs = now.getTime() - then.getTime();
  if (diffMs < 0) return 'Just now';
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 10) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getOperationLabel(type: string): string {
  switch (type) {
    case 'create': return 'Create appointment';
    case 'createBulk': return 'Create recurring series';
    case 'updateStatus': return 'Update status';
    case 'delete': return 'Delete appointment';
    case 'reschedule': return 'Reschedule';
    case 'bulkReschedule': return 'Bulk reschedule';
    case 'bulkCancel': return 'Bulk cancel';
    case 'bulkDelete': return 'Bulk delete';
    default: return type;
  }
}

export default function OfflineStatusBar({ onSyncComplete, compact = false }: OfflineStatusBarProps) {
  const [state, setState] = useState<ScheduleOfflineState>(scheduleOffline.getState());
  const [relativeTime, setRelativeTime] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [queueItems, setQueueItems] = useState<QueuedOperation[]>([]);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const prevStatusRef = useRef<ScheduleSyncStatus>(state.syncStatus);

  // Subscribe to state changes
  useEffect(() => {
    const unsub = scheduleOffline.subscribe((newState) => {
      setState(newState);
      setQueueItems(scheduleOffline.getQueue());

      // Notify parent when sync completes
      if (
        prevStatusRef.current === 'syncing' &&
        (newState.syncStatus === 'synced' || newState.syncStatus === 'partial') &&
        onSyncComplete
      ) {
        onSyncComplete();
      }
      prevStatusRef.current = newState.syncStatus;
    });
    return unsub;
  }, [onSyncComplete]);

  // Update relative time every 15s
  useEffect(() => {
    const update = () => setRelativeTime(formatRelativeTime(state.lastSyncedAt));
    update();
    const interval = setInterval(update, 15000);
    return () => clearInterval(interval);
  }, [state.lastSyncedAt]);

  // Pulse animation for syncing
  useEffect(() => {
    if (state.syncStatus === 'syncing') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.5, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [state.syncStatus, pulseAnim]);

  // Slide animation for expand/collapse
  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: isExpanded ? 1 : 0,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [isExpanded, slideAnim]);

  const handleForceSync = useCallback(async () => {
    setIsRetrying(true);
    try {
      await scheduleOffline.forceSync();
    } finally {
      setIsRetrying(false);
    }
  }, []);

  const handleClearQueue = useCallback(() => {
    scheduleOffline.clearQueue();
    setIsExpanded(false);
  }, []);

  const config = STATUS_CONFIG[state.syncStatus];
  const showBar = state.syncStatus !== 'idle' && state.syncStatus !== 'synced';
  const hasPending = state.pendingCount > 0;
  const canRetry = state.syncStatus === 'error' || state.syncStatus === 'partial' || state.syncStatus === 'offline';

  // Don't render if everything is synced and no pending items
  // (unless we're offline or have errors)
  if (!showBar && !hasPending && state.isOnline) {
    return null;
  }

  // ── Compact mode ──
  if (compact) {
    if (state.syncStatus === 'synced' && !hasPending && state.isOnline) return null;

    return (
      <TouchableOpacity
        style={[styles.compactBar, { backgroundColor: config.bgColor, borderColor: config.borderColor }]}
        onPress={canRetry ? handleForceSync : () => setIsExpanded(!isExpanded)}
        activeOpacity={0.7}
        disabled={state.isSyncing}
      >
        {state.isSyncing ? (
          <ActivityIndicator size={10} color={config.color} />
        ) : (
          <Ionicons name={config.icon as any} size={12} color={config.color} />
        )}
        <Text style={[styles.compactText, { color: config.color }]}>
          {hasPending ? `${state.pendingCount} pending` : config.label}
        </Text>
        {state.lastSyncedAt && state.syncStatus === 'synced' && (
          <Text style={styles.compactTime}>{relativeTime}</Text>
        )}
      </TouchableOpacity>
    );
  }

  // ── Full mode ──
  return (
    <View style={styles.container}>
      {/* Main Status Bar */}
      <TouchableOpacity
        style={[styles.mainBar, { backgroundColor: config.bgColor, borderColor: config.borderColor }]}
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={0.7}
      >
        {/* Status Icon */}
        <Animated.View style={[styles.iconWrap, { opacity: pulseAnim }]}>
          {state.isSyncing ? (
            <ActivityIndicator size={14} color={config.color} />
          ) : (
            <Ionicons name={config.icon as any} size={16} color={config.color} />
          )}
        </Animated.View>

        {/* Status Info */}
        <View style={styles.infoSection}>
          <View style={styles.topRow}>
            <Text style={[styles.statusLabel, { color: config.color }]}>{config.label}</Text>
            {hasPending && (
              <View style={[styles.pendingBadge, { backgroundColor: config.color + '18' }]}>
                <Ionicons name="layers-outline" size={10} color={config.color} />
                <Text style={[styles.pendingBadgeText, { color: config.color }]}>
                  {state.pendingCount} pending
                </Text>
              </View>
            )}
          </View>
          <View style={styles.bottomRow}>
            {!state.isOnline && (
              <View style={styles.offlineChip}>
                <View style={styles.offlineDot} />
                <Text style={styles.offlineChipText}>No connection</Text>
              </View>
            )}
            {state.isOnline && (
              <View style={styles.onlineChip}>
                <View style={styles.onlineDot} />
                <Text style={styles.onlineChipText}>Connected</Text>
              </View>
            )}
            {state.lastSyncedAt && (
              <Text style={styles.syncTime}>Synced {relativeTime}</Text>
            )}
          </View>
        </View>

        {/* Quick Action */}
        {canRetry && !isExpanded && (
          <TouchableOpacity
            style={[styles.retryBtn, { borderColor: config.color + '30' }]}
            onPress={handleForceSync}
            disabled={isRetrying}
          >
            {isRetrying ? (
              <ActivityIndicator size={11} color={config.color} />
            ) : (
              <Ionicons name="refresh" size={12} color={config.color} />
            )}
            <Text style={[styles.retryText, { color: config.color }]}>Sync</Text>
          </TouchableOpacity>
        )}

        {/* Expand Chevron */}
        <Ionicons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={COLORS.textMuted}
          style={{ marginLeft: 4 }}
        />
      </TouchableOpacity>

      {/* Expanded Details */}
      {isExpanded && (
        <View style={styles.expandedPanel}>
          {/* Connection Status */}
          <View style={styles.detailRow}>
            <Ionicons name="wifi" size={13} color={state.isOnline ? '#27ae60' : '#e74c3c'} />
            <Text style={styles.detailLabel}>Connection</Text>
            <Text style={[styles.detailValue, { color: state.isOnline ? '#27ae60' : '#e74c3c' }]}>
              {state.isOnline ? 'Online' : 'Offline'}
            </Text>
          </View>

          {/* Cached Data */}
          <View style={styles.detailRow}>
            <Ionicons name="save-outline" size={13} color={COLORS.textMuted} />
            <Text style={styles.detailLabel}>Cached Appointments</Text>
            <Text style={styles.detailValue}>{state.cachedAppointmentCount}</Text>
          </View>

          {/* Pending Operations */}
          <View style={styles.detailRow}>
            <Ionicons name="layers-outline" size={13} color={COLORS.textMuted} />
            <Text style={styles.detailLabel}>Pending Changes</Text>
            <Text style={[styles.detailValue, hasPending ? { color: '#e67e22', fontWeight: '800' } : {}]}>
              {state.pendingCount}
            </Text>
          </View>

          {/* Last Synced */}
          <View style={styles.detailRow}>
            <Ionicons name="time-outline" size={13} color={COLORS.textMuted} />
            <Text style={styles.detailLabel}>Last Synced</Text>
            <Text style={styles.detailValue}>
              {state.lastSyncedAt
                ? new Date(state.lastSyncedAt).toLocaleTimeString('en-US', {
                    hour: 'numeric', minute: '2-digit', hour12: true,
                  })
                : 'Never'}
            </Text>
          </View>

          {/* Error */}
          {state.lastError && (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={13} color="#e74c3c" />
              <Text style={styles.errorText} numberOfLines={2}>{state.lastError}</Text>
            </View>
          )}

          {/* Queued Operations List */}
          {queueItems.length > 0 && (
            <View style={styles.queueSection}>
              <Text style={styles.queueTitle}>Queued Operations</Text>
              {queueItems.slice(0, 8).map((op, idx) => (
                <View key={op.id} style={styles.queueItem}>
                  <View style={[styles.queueDot, {
                    backgroundColor: op.retryCount > 0 ? '#e67e22' : COLORS.accent,
                  }]} />
                  <Text style={styles.queueItemText} numberOfLines={1}>
                    {getOperationLabel(op.type)}
                  </Text>
                  {op.retryCount > 0 && (
                    <Text style={styles.queueRetryBadge}>retry {op.retryCount}</Text>
                  )}
                  <Text style={styles.queueItemTime}>
                    {formatRelativeTime(op.queuedAt)}
                  </Text>
                </View>
              ))}
              {queueItems.length > 8 && (
                <Text style={styles.queueMore}>+{queueItems.length - 8} more</Text>
              )}
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actionRow}>
            {(canRetry || hasPending) && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={handleForceSync}
                disabled={isRetrying || state.isSyncing}
              >
                {isRetrying || state.isSyncing ? (
                  <ActivityIndicator size={12} color={COLORS.white} />
                ) : (
                  <Ionicons name="sync" size={13} color={COLORS.white} />
                )}
                <Text style={styles.actionBtnText}>
                  {isRetrying || state.isSyncing ? 'Syncing...' : 'Force Sync'}
                </Text>
              </TouchableOpacity>
            )}
            {hasPending && (
              <TouchableOpacity style={styles.clearBtn} onPress={handleClearQueue}>
                <Ionicons name="trash-outline" size={13} color="#e74c3c" />
                <Text style={styles.clearBtnText}>Clear Queue</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Offline Info Banner */}
          {!state.isOnline && (
            <View style={styles.offlineBanner}>
              <Ionicons name="information-circle" size={16} color="#e67e22" />
              <Text style={styles.offlineBannerText}>
                You're currently offline. Changes are saved locally and will sync automatically when your connection is restored.
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.xs,
    marginBottom: SPACING.xs,
  },

  // ── Compact ──
  compactBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 5,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  compactText: {
    fontSize: 10,
    fontWeight: '700',
  },
  compactTime: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginLeft: 2,
  },

  // ── Main Bar ──
  mainBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoSection: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  statusLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '800',
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },
  pendingBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: 3,
  },
  offlineChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  offlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e74c3c',
  },
  offlineChipText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#e74c3c',
  },
  onlineChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#27ae60',
  },
  onlineChipText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#27ae60',
  },
  syncTime: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
  },
  retryText: {
    fontSize: 10,
    fontWeight: '700',
  },

  // ── Expanded Panel ──
  expandedPanel: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    marginTop: 4,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...SHADOWS.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs + 2,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  detailLabel: {
    flex: 1,
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  detailValue: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.primary,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    backgroundColor: '#e74c3c06',
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    marginTop: SPACING.xs,
  },
  errorText: {
    flex: 1,
    fontSize: FONT_SIZES.xs,
    color: '#e74c3c',
    lineHeight: 16,
  },

  // ── Queue Section ──
  queueSection: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  queueTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.xs,
  },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  queueDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  queueItemText: {
    flex: 1,
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  queueRetryBadge: {
    fontSize: 8,
    fontWeight: '700',
    color: '#e67e22',
    backgroundColor: '#e67e2210',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: BORDER_RADIUS.full,
  },
  queueItemTime: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  queueMore: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
  },

  // ── Actions ──
  actionRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 1,
    borderRadius: BORDER_RADIUS.sm,
  },
  actionBtnText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.white,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 1,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderColor: '#e74c3c30',
  },
  clearBtnText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: '#e74c3c',
  },

  // ── Offline Banner ──
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    backgroundColor: '#e67e2208',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.md,
    borderWidth: 1,
    borderColor: '#e67e2215',
  },
  offlineBannerText: {
    flex: 1,
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
});
