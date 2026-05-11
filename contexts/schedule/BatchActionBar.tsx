import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Easing, Dimensions, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';

interface BatchActionBarProps {
  visible: boolean;
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onBatchStatus: (status: 'confirmed' | 'completed' | 'no-show' | 'cancelled') => void;
  onExit: () => void;
}

const STATUS_ACTIONS: {
  status: 'confirmed' | 'completed' | 'no-show' | 'cancelled';
  label: string;
  icon: string;
  color: string;
}[] = [
  { status: 'confirmed', label: 'Confirm', icon: 'checkmark-circle', color: '#2ecc71' },
  { status: 'completed', label: 'Complete', icon: 'checkmark-done-circle', color: '#3498db' },
  { status: 'no-show', label: 'No Show', icon: 'close-circle', color: '#e74c3c' },
  { status: 'cancelled', label: 'Cancel', icon: 'ban', color: '#95a5a6' },
];

export default function BatchActionBar({
  visible, selectedCount, totalCount,
  onSelectAll, onDeselectAll, onBatchStatus, onExit,
}: BatchActionBarProps) {
  const slideAnim = useRef(new Animated.Value(200)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 20,
          stiffness: 180,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          damping: 20,
          stiffness: 180,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 200,
          duration: 200,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.9,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  const allSelected = selectedCount === totalCount && totalCount > 0;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [
            { translateY: slideAnim },
            { scale: scaleAnim },
          ],
        },
      ]}
    >
      <View style={styles.bar}>
        {/* Header row: count + select/deselect + exit */}
        <View style={styles.headerRow}>
          <View style={styles.countSection}>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{selectedCount}</Text>
            </View>
            <Text style={styles.countLabel}>
              selected
            </Text>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.selectToggleBtn}
              onPress={allSelected ? onDeselectAll : onSelectAll}
              activeOpacity={0.7}
            >
              <Ionicons
                name={allSelected ? 'remove-circle-outline' : 'checkmark-done-circle-outline'}
                size={14}
                color={COLORS.accent}
              />
              <Text style={styles.selectToggleText}>
                {allSelected ? 'Deselect All' : 'Select All'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.exitBtn}
              onPress={onExit}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Status action buttons */}
        <View style={styles.actionsRow}>
          <Text style={styles.actionsLabel}>Batch Update Status:</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.actionsScroll}
          >
            {STATUS_ACTIONS.map(action => (
              <TouchableOpacity
                key={action.status}
                style={[
                  styles.actionBtn,
                  { borderColor: action.color + '40' },
                  selectedCount === 0 && styles.actionBtnDisabled,
                ]}
                onPress={() => selectedCount > 0 && onBatchStatus(action.status)}
                activeOpacity={selectedCount > 0 ? 0.7 : 1}
              >
                <Ionicons
                  name={action.icon as any}
                  size={16}
                  color={selectedCount > 0 ? action.color : COLORS.textMuted}
                />
                <Text
                  style={[
                    styles.actionBtnText,
                    { color: selectedCount > 0 ? action.color : COLORS.textMuted },
                  ]}
                >
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
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
    bottom: IS_SMALL ? 12 : 20,
    left: IS_SMALL ? 8 : 16,
    right: IS_SMALL ? 8 : 16,
    zIndex: 999,
    alignItems: 'center',
  },
  bar: {
    width: '100%',
    maxWidth: 560,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.accent + '25',
    ...SHADOWS.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  countSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  countBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.sm,
  },
  countText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '800',
    color: COLORS.white,
  },
  countLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  selectToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.accent + '10',
    borderWidth: 1,
    borderColor: COLORS.accent + '20',
  },
  selectToggleText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.accent,
  },
  exitBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginHorizontal: SPACING.lg,
  },
  actionsRow: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  actionsLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  actionsScroll: {
    gap: SPACING.sm,
    flexDirection: 'row',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5,
    backgroundColor: COLORS.white,
  },
  actionBtnDisabled: {
    opacity: 0.5,
    borderColor: COLORS.border,
  },
  actionBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
  },
});
