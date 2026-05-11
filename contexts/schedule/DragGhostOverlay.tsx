import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../../constants/theme';
import { Appointment, appointmentTypes, formatTimeDisplay } from '../../data/scheduleData';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;

export interface DragGhostProps {
  appointment: Appointment;
  pageX: number;
  pageY: number;
  targetDayLabel: string | null;
  targetTimeLabel: string | null;
  hasConflict: boolean;
  conflictName: string | null;
  isOutOfBounds: boolean;
}

export default function DragGhostOverlay({
  appointment,
  pageX,
  pageY,
  targetDayLabel,
  targetTimeLabel,
  hasConflict,
  conflictName,
  isOutOfBounds,
}: DragGhostProps) {
  const apptType = appointmentTypes.find(t => t.id === appointment.appointmentTypeId);
  const color = apptType?.color || '#999';

  // Position the ghost card centered on the touch point, offset slightly up-left
  const ghostWidth = 160;
  const ghostHeight = 70;
  const left = Math.max(4, Math.min(pageX - ghostWidth / 2, SCREEN_WIDTH - ghostWidth - 4));
  const top = Math.max(4, pageY - ghostHeight - 16);

  return (
    <View style={styles.overlay} pointerEvents="none">
      {/* Ghost Card */}
      <View
        style={[
          styles.ghostCard,
          {
            left,
            top,
            width: ghostWidth,
            borderLeftColor: color,
          },
        ]}
      >
        <View style={styles.ghostHeader}>
          <Ionicons name={apptType?.icon as any || 'calendar'} size={12} color={color} />
          <Text style={[styles.ghostType, { color }]} numberOfLines={1}>
            {apptType?.shortName || 'Appointment'}
          </Text>
        </View>
        <Text style={styles.ghostClient} numberOfLines={1}>
          {appointment.clientName}
        </Text>
        <Text style={styles.ghostCoach} numberOfLines={1}>
          {appointment.coachName}
        </Text>
        <Text style={[styles.ghostDuration, { color: color + 'CC' }]}>
          {appointment.duration} min
        </Text>
      </View>

      {/* Drop Target Info Badge */}
      {targetDayLabel && targetTimeLabel && !isOutOfBounds && (
        <View
          style={[
            styles.dropBadge,
            {
              left: Math.max(4, Math.min(pageX - 70, SCREEN_WIDTH - 144)),
              top: pageY + 12,
              backgroundColor: hasConflict ? COLORS.danger : COLORS.success,
            },
          ]}
        >
          <Ionicons
            name={hasConflict ? 'warning' : 'checkmark-circle'}
            size={14}
            color={COLORS.white}
          />
          <View style={styles.dropBadgeTextWrap}>
            <Text style={styles.dropBadgeText}>
              {targetDayLabel} {targetTimeLabel}
            </Text>
            {hasConflict && conflictName && (
              <Text style={styles.conflictText} numberOfLines={1}>
                Conflicts with {conflictName}
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Out of bounds indicator */}
      {isOutOfBounds && (
        <View
          style={[
            styles.dropBadge,
            {
              left: Math.max(4, Math.min(pageX - 50, SCREEN_WIDTH - 104)),
              top: pageY + 12,
              backgroundColor: COLORS.textMuted,
            },
          ]}
        >
          <Ionicons name="close-circle" size={14} color={COLORS.white} />
          <Text style={styles.dropBadgeText}>Invalid drop zone</Text>
        </View>
      )}

      {/* Touch point indicator */}
      <View
        style={[
          styles.touchPoint,
          {
            left: pageX - 6,
            top: pageY - 6,
            backgroundColor: hasConflict ? COLORS.danger + '60' : COLORS.accent + '60',
            borderColor: hasConflict ? COLORS.danger : COLORS.accent,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
  },
  ghostCard: {
    position: 'absolute',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    borderLeftWidth: 4,
    padding: SPACING.sm,
    ...SHADOWS.lg,
    opacity: 0.92,
  },
  ghostHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  ghostType: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    flex: 1,
  },
  ghostClient: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.primary,
  },
  ghostCoach: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontWeight: '500',
    marginTop: 1,
  },
  ghostDuration: {
    fontSize: 9,
    fontWeight: '600',
    marginTop: 2,
  },
  dropBadge: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.md,
    ...SHADOWS.md,
    maxWidth: 200,
  },
  dropBadgeTextWrap: {
    flex: 1,
  },
  dropBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.white,
  },
  conflictText: {
    fontSize: 9,
    color: COLORS.white + 'CC',
    fontWeight: '500',
    marginTop: 1,
  },
  touchPoint: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
});
