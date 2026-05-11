import React, { useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../../constants/theme';

interface DayNavigatorProps {
  selectedDate: string; // YYYY-MM-DD
  onDateChange: (date: string) => void;
  entryCounts?: Record<string, number>; // kept for API compat
  todayString: string; // YYYY-MM-DD for today
}

function formatDateHeader(dateStr: string, todayStr: string): string {
  if (dateStr === todayStr) return 'Today';

  const d = new Date(dateStr + 'T12:00:00');
  const today = new Date(todayStr + 'T12:00:00');
  const diffMs = today.getTime() - d.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 1) return 'Yesterday';
  if (diffDays === -1) return 'Tomorrow';

  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateSubheader(dateStr: string, todayStr: string): string {
  if (dateStr === todayStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export default function DayNavigator({
  selectedDate,
  onDateChange,
  todayString,
}: DayNavigatorProps) {
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const isToday = selectedDate === todayString;
  const isFuture = selectedDate > todayString;

  const animateTransition = (direction: 'left' | 'right', callback: () => void) => {
    const toValue = direction === 'left' ? -30 : 30;
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue,
        duration: 120,
        useNativeDriver: true,
      }),
    ]).start(() => {
      callback();
      slideAnim.setValue(direction === 'left' ? 30 : -30);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 120,
          friction: 12,
          useNativeDriver: true,
        }),
      ]).start();
    });
  };

  const goToPreviousDay = () => {
    animateTransition('right', () => {
      onDateChange(addDays(selectedDate, -1));
    });
  };

  const goToNextDay = () => {
    if (isFuture) return;
    animateTransition('left', () => {
      onDateChange(addDays(selectedDate, 1));
    });
  };

  const goToToday = () => {
    if (!isToday) {
      onDateChange(todayString);
    }
  };

  return (
    <View style={styles.container}>
      {/* Main Date Row with Arrows */}
      <View style={styles.dateRow}>
        <TouchableOpacity
          style={styles.arrowBtn}
          onPress={goToPreviousDay}
          activeOpacity={0.6}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={22} color={COLORS.accent} />
        </TouchableOpacity>

        <Animated.View
          style={[
            styles.dateCenter,
            {
              opacity: fadeAnim,
              transform: [{ translateX: slideAnim }],
            },
          ]}
        >
          <Text style={styles.dateTitle}>
            {formatDateHeader(selectedDate, todayString)}
          </Text>
          <Text style={styles.dateSubtitle}>
            {formatDateSubheader(selectedDate, todayString)}
          </Text>
        </Animated.View>

        <TouchableOpacity
          style={[styles.arrowBtn, isFuture && styles.arrowBtnDisabled]}
          onPress={goToNextDay}
          activeOpacity={0.6}
          disabled={isFuture}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons
            name="chevron-forward"
            size={22}
            color={isFuture ? COLORS.borderLight : COLORS.accent}
          />
        </TouchableOpacity>
      </View>

      {/* "Go to Today" pill (only shown when not viewing today) */}
      {!isToday && (
        <TouchableOpacity style={styles.todayPill} onPress={goToToday} activeOpacity={0.7}>
          <Ionicons name="today-outline" size={12} color={COLORS.accent} />
          <Text style={styles.todayPillText}>Go to Today</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    ...SHADOWS.sm,
  },

  // Date Row
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xs,
  },
  arrowBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.accent + '10',
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrowBtnDisabled: {
    backgroundColor: COLORS.borderLight,
  },
  dateCenter: {
    flex: 1,
    alignItems: 'center',
  },
  dateTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  dateSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
    marginTop: 2,
  },

  // Today Pill
  todayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    alignSelf: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 5,
    backgroundColor: COLORS.accent + '10',
    borderRadius: BORDER_RADIUS.full,
    marginTop: 2,
    marginBottom: SPACING.xs,
  },
  todayPillText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.accent,
  },
});
