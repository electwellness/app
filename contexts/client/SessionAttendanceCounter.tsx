import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES } from '../../constants/theme';

interface SessionAttendanceCounterProps {
  attended: number;
  allowed: number;
  loading: boolean;
  error: string | null;
  /** Sessions per week for the program tier */
  sessionsPerWeek: number | null;
  /** Current week in cycle (1-13) */
  weekInCycle: number;
}

/**
 * Circular progress ring built with pure View transforms (no SVG dependency).
 * Uses the "two-half" rotation technique.
 */
function ProgressRing({
  percentage,
  size,
  strokeWidth,
  color,
  bgColor,
  children,
}: {
  percentage: number;
  size: number;
  strokeWidth: number;
  color: string;
  bgColor: string;
  children?: React.ReactNode;
}) {
  const radius = size / 2;
  const clampedPct = Math.min(100, Math.max(0, percentage));
  const rotation = (clampedPct / 100) * 360;

  return (
    <View style={{ width: size, height: size, position: 'relative' }}>
      {/* Background circle */}
      <View
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          borderWidth: strokeWidth,
          borderColor: bgColor,
          position: 'absolute',
        }}
      />

      {/* First half (0-180 degrees) */}
      <View
        style={{
          width: size,
          height: size,
          position: 'absolute',
          overflow: 'hidden',
        }}
      >
        {/* Left half mask */}
        <View
          style={{
            width: radius,
            height: size,
            position: 'absolute',
            left: 0,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: size,
              height: size,
              borderRadius: radius,
              borderWidth: strokeWidth,
              borderColor: color,
              borderRightColor: 'transparent',
              borderBottomColor: 'transparent',
              transform: [
                { rotate: `${Math.min(rotation, 180) - 45}deg` },
              ],
            }}
          />
        </View>

        {/* Right half mask (only visible after 180 degrees) */}
        {rotation > 180 && (
          <View
            style={{
              width: radius,
              height: size,
              position: 'absolute',
              right: 0,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: size,
                height: size,
                borderRadius: radius,
                borderWidth: strokeWidth,
                borderColor: color,
                borderLeftColor: 'transparent',
                borderTopColor: 'transparent',
                left: -radius,
                transform: [
                  { rotate: `${rotation - 180 - 45}deg` },
                ],
              }}
            />
          </View>
        )}
      </View>

      {/* Center content */}
      <View
        style={{
          position: 'absolute',
          top: strokeWidth,
          left: strokeWidth,
          width: size - strokeWidth * 2,
          height: size - strokeWidth * 2,
          borderRadius: (size - strokeWidth * 2) / 2,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {children}
      </View>
    </View>
  );
}

export default function SessionAttendanceCounter({
  attended,
  allowed,
  loading,
  error,
  sessionsPerWeek,
  weekInCycle,
}: SessionAttendanceCounterProps) {
  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={COLORS.accent} />
          <Text style={styles.loadingText}>Loading attendance...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorRow}>
          <Ionicons name="warning-outline" size={13} color={COLORS.warning} />
          <Text style={styles.errorText}>Attendance unavailable</Text>
        </View>
      </View>
    );
  }

  const percentage = allowed > 0 ? Math.round((attended / allowed) * 100) : 0;

  // Expected sessions at this point in the cycle
  const expectedAtThisPoint = sessionsPerWeek
    ? Math.min(allowed, sessionsPerWeek * weekInCycle)
    : null;

  // Determine color based on pace
  let ringColor = COLORS.accent;
  let paceLabel = '';
  let paceColor = COLORS.textMuted;

  if (expectedAtThisPoint !== null && expectedAtThisPoint > 0) {
    const paceRatio = attended / expectedAtThisPoint;
    if (paceRatio >= 0.9) {
      ringColor = COLORS.success;
      paceLabel = 'On track';
      paceColor = COLORS.success;
    } else if (paceRatio >= 0.7) {
      ringColor = COLORS.accent;
      paceLabel = 'Slightly behind';
      paceColor = COLORS.accent;
    } else if (paceRatio >= 0.5) {
      ringColor = COLORS.warning;
      paceLabel = 'Behind pace';
      paceColor = COLORS.warning;
    } else {
      ringColor = COLORS.danger;
      paceLabel = 'Well behind';
      paceColor = COLORS.danger;
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Ionicons name="barbell-outline" size={13} color={COLORS.accent} />
        <Text style={styles.headerText}>Session Attendance</Text>
      </View>

      <View style={styles.contentRow}>
        {/* Progress Ring */}
        <ProgressRing
          percentage={percentage}
          size={72}
          strokeWidth={5}
          color={ringColor}
          bgColor={ringColor + '20'}
        >
          <Text style={[styles.ringPercentage, { color: ringColor }]}>
            {percentage}%
          </Text>
        </ProgressRing>

        {/* Stats */}
        <View style={styles.statsColumn}>
          {/* Main count */}
          <View style={styles.mainCountRow}>
            <Text style={styles.attendedCount}>{attended}</Text>
            <Text style={styles.separator}>/</Text>
            <Text style={styles.allowedCount}>{allowed}</Text>
            <Text style={styles.sessionsLabel}>sessions</Text>
          </View>

          {/* Pace indicator */}
          {paceLabel ? (
            <View style={[styles.paceBadge, { backgroundColor: paceColor + '14' }]}>
              <Ionicons
                name={
                  paceLabel === 'On track'
                    ? 'checkmark-circle'
                    : paceLabel === 'Slightly behind'
                    ? 'time-outline'
                    : 'alert-circle'
                }
                size={11}
                color={paceColor}
              />
              <Text style={[styles.paceText, { color: paceColor }]}>{paceLabel}</Text>
            </View>
          ) : null}

          {/* Expected vs actual */}
          {expectedAtThisPoint !== null && (
            <Text style={styles.expectedText}>
              Expected by week {weekInCycle}: {expectedAtThisPoint}
            </Text>
          )}

          {/* Sessions per week */}
          {sessionsPerWeek !== null && (
            <Text style={styles.perWeekText}>
              {sessionsPerWeek}x / week
            </Text>
          )}
        </View>
      </View>

      {/* Progress bar (horizontal, as secondary visual) */}
      <View style={styles.progressBarContainer}>
        <View style={styles.progressBarBg}>
          <View
            style={[
              styles.progressBarFill,
              {
                width: `${Math.min(100, percentage)}%`,
                backgroundColor: ringColor,
              },
            ]}
          />
          {/* Expected marker */}
          {expectedAtThisPoint !== null && allowed > 0 && (
            <View
              style={[
                styles.expectedMarker,
                {
                  left: `${Math.min(100, (expectedAtThisPoint / allowed) * 100)}%`,
                },
              ]}
            />
          )}
        </View>
        <View style={styles.progressBarLabels}>
          <Text style={styles.progressBarLabelLeft}>{attended} attended</Text>
          <Text style={styles.progressBarLabelRight}>{Math.max(0, allowed - attended)} remaining</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.accent + '06',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.accent + '14',
    marginTop: SPACING.sm,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
  },
  loadingText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    justifyContent: 'center',
    paddingVertical: SPACING.xs,
  },
  errorText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.warning,
    fontWeight: '600',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: SPACING.md,
  },
  headerText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '800',
    color: COLORS.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
  },
  ringPercentage: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '900',
  },
  statsColumn: {
    flex: 1,
    gap: 4,
  },
  mainCountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  attendedCount: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '900',
    color: COLORS.text,
  },
  separator: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  allowedCount: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  sessionsLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginLeft: 3,
  },
  paceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },
  paceText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
  },
  expectedText: {
    fontSize: FONT_SIZES.xs - 1,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  perWeekText: {
    fontSize: FONT_SIZES.xs - 1,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  progressBarContainer: {
    marginTop: SPACING.md,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: COLORS.accent + '15',
    borderRadius: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
    minWidth: 3,
  },
  expectedMarker: {
    position: 'absolute',
    top: -1,
    width: 2,
    height: 8,
    backgroundColor: COLORS.text,
    borderRadius: 1,
    opacity: 0.35,
    marginLeft: -1,
  },
  progressBarLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 3,
  },
  progressBarLabelLeft: {
    fontSize: FONT_SIZES.xs - 1,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  progressBarLabelRight: {
    fontSize: FONT_SIZES.xs - 1,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
});
