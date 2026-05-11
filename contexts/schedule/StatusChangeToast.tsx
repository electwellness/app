import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Easing, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';

const TOAST_DURATION = 5000; // 5 seconds

const STATUS_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  scheduled: { label: 'Scheduled', icon: 'time', color: '#f39c12' },
  confirmed: { label: 'Confirmed', icon: 'checkmark-circle', color: '#2ecc71' },
  completed: { label: 'Completed', icon: 'checkmark-done-circle', color: '#3498db' },
  'no-show': { label: 'No Show', icon: 'close-circle', color: '#e74c3c' },
  cancelled: { label: 'Cancelled', icon: 'ban', color: '#95a5a6' },
};

export interface StatusChangeInfo {
  appointmentId: string;
  clientName: string;
  oldStatus: string;
  newStatus: string;
}

export interface BatchStatusChangeInfo {
  changes: { appointmentId: string; clientName: string; oldStatus: string }[];
  newStatus: string;
}

interface StatusChangeToastProps {
  info: StatusChangeInfo | null;
  batchInfo?: BatchStatusChangeInfo | null;
  sessionSynced?: boolean;
  sessionSyncCount?: number;
  onUndo: (appointmentId: string, oldStatus: string) => void;
  onBatchUndo?: (changes: { appointmentId: string; oldStatus: string }[]) => void;
  onDismiss: () => void;
}

export default function StatusChangeToast({ info, batchInfo, sessionSynced, sessionSyncCount, onUndo, onBatchUndo, onDismiss }: StatusChangeToastProps) {
  const slideAnim = useRef(new Animated.Value(120)).current;
  const progressAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visible, setVisible] = useState(false);

  const isBatch = !!batchInfo && batchInfo.changes.length > 0;
  const activeInfo = isBatch ? batchInfo : info;

  useEffect(() => {
    if (activeInfo) {
      setVisible(true);
      slideAnim.setValue(120);
      progressAnim.setValue(1);

      Animated.spring(slideAnim, {
        toValue: 0,
        damping: 18,
        stiffness: 200,
        useNativeDriver: true,
      }).start();

      Animated.timing(progressAnim, {
        toValue: 0,
        duration: TOAST_DURATION,
        easing: Easing.linear,
        useNativeDriver: false,
      }).start();

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        dismissToast();
      }, TOAST_DURATION);
    } else {
      setVisible(false);
      slideAnim.setValue(120);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [info, batchInfo]);

  const dismissToast = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    Animated.timing(slideAnim, {
      toValue: 120,
      duration: 250,
      easing: Easing.in(Easing.ease),
      useNativeDriver: true,
    }).start(() => {
      setVisible(false);
      onDismiss();
    });
  };

  const handleUndo = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    Animated.timing(slideAnim, {
      toValue: 120,
      duration: 200,
      easing: Easing.in(Easing.ease),
      useNativeDriver: true,
    }).start(() => {
      setVisible(false);
      if (isBatch && batchInfo && onBatchUndo) {
        onBatchUndo(batchInfo.changes.map(c => ({
          appointmentId: c.appointmentId,
          oldStatus: c.oldStatus,
        })));
      } else if (info) {
        onUndo(info.appointmentId, info.oldStatus);
      }
    });
  };

  if (!visible || !activeInfo) return null;

  const newStatus = isBatch ? batchInfo!.newStatus : info!.newStatus;
  const newStatusConfig = STATUS_LABELS[newStatus] || STATUS_LABELS.scheduled;
  const batchCount = isBatch ? batchInfo!.changes.length : 0;

  let titleText = '';
  let subtitleText = '';

  if (isBatch && batchInfo) {
    const count = batchInfo.changes.length;
    if (count <= 2) {
      titleText = batchInfo.changes.map(c => c.clientName).join(' & ');
    } else {
      titleText = `${count} appointments`;
    }
    subtitleText = `Batch updated to`;
  } else if (info) {
    titleText = info.clientName;
    subtitleText = 'Marked as';
  }

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ translateY: slideAnim }] },
      ]}
    >
      <View style={styles.toast}>
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressBar,
              {
                backgroundColor: newStatusConfig.color,
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>

        <View style={styles.content}>
          <View style={[styles.iconWrap, { backgroundColor: newStatusConfig.color + '18' }]}>
            {isBatch ? (
              <View style={styles.batchIconStack}>
                <Ionicons name={newStatusConfig.icon as any} size={16} color={newStatusConfig.color} />
                <View style={[styles.batchCountBadge, { backgroundColor: newStatusConfig.color }]}>
                  <Text style={styles.batchCountText}>{batchCount}</Text>
                </View>
              </View>
            ) : (
              <Ionicons name={newStatusConfig.icon as any} size={20} color={newStatusConfig.color} />
            )}
          </View>

          <View style={styles.textWrap}>
            <Text style={styles.title} numberOfLines={1}>
              {titleText}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitleText} <Text style={[styles.statusLabel, { color: newStatusConfig.color }]}>{newStatusConfig.label}</Text>
            </Text>
            {sessionSynced && (newStatus === 'completed' || newStatus === 'no-show') && (
              <View style={styles.syncRow}>
                <Ionicons name="sync-circle" size={11} color="#27ae60" />
                <Text style={styles.syncText}>
                  Session record{(sessionSyncCount || 0) > 1 ? 's' : ''} synced to client portal
                </Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={styles.undoBtn}
            onPress={handleUndo}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-undo" size={14} color={COLORS.accent} />
            <Text style={styles.undoBtnText}>Undo{isBatch ? ' All' : ''}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.dismissBtn}
            onPress={dismissToast}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const IS_SMALL = SCREEN_WIDTH < 500;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: IS_SMALL ? 16 : 24,
    left: IS_SMALL ? 12 : 24,
    right: IS_SMALL ? 12 : 24,
    zIndex: 1000,
    alignItems: 'center',
  },
  toast: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.lg,
  },
  progressTrack: {
    height: 3,
    backgroundColor: COLORS.borderLight,
    width: '100%',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  batchIconStack: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  batchCountBadge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  batchCountText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.white,
  },
  textWrap: {
    flex: 1,
    marginRight: SPACING.xs,
  },
  title: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.primary,
  },
  subtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  statusLabel: {
    fontWeight: '700',
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  syncText: {
    fontSize: 10,
    color: '#27ae60',
    fontWeight: '600',
  },
  undoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.accent + '12',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.accent + '30',
  },
  undoBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.accent,
  },
  dismissBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
