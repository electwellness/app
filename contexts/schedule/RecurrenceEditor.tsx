import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import {
  RecurrencePattern, WeeklyDayTime, DAY_NAMES, DAY_NAMES_FULL,
  formatDateKey, formatTimeDisplay, TIME_SLOTS_15,
  generateRecurringDates, detectRecurringConflicts, Appointment,
} from '../../data/scheduleData';

interface RecurrenceEditorProps {
  pattern: RecurrencePattern;
  onPatternChange: (pattern: RecurrencePattern) => void;
  baseDate: string;
  baseTime: string;
  duration: number;
  coachId: string;
  existingAppointments: Appointment[];
  coachName?: string;
  /** Type of appointment being scheduled — used to allow training+biometric overlap */
  appointmentTypeId?: string;
}

const RECURRENCE_TYPES: { type: RecurrencePattern['type']; label: string; icon: string; desc: string }[] = [
  { type: 'none', label: 'One-time', icon: 'calendar-outline', desc: 'Single appointment' },
  { type: 'daily', label: 'Daily', icon: 'today-outline', desc: 'Every day' },
  { type: 'weekly', label: 'Weekly', icon: 'calendar', desc: 'Selected days each week' },
  { type: 'monthly', label: 'Monthly', icon: 'albums-outline', desc: 'Same day each month' },
];

const CALENDAR_DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function RecurrenceEditor({
  pattern, onPatternChange, baseDate, baseTime, duration,
  coachId, existingAppointments, coachName, appointmentTypeId,
}: RecurrenceEditorProps) {

  const [showTimePickerForDay, setShowTimePickerForDay] = useState<number | null>(null);

  // Default end date: 13 weeks from base date
  const defaultEndDate = useMemo(() => {
    const d = new Date(baseDate + 'T12:00:00');
    d.setDate(d.getDate() + 91);
    return formatDateKey(d);
  }, [baseDate]);


  // Calendar state: which month is being viewed
  const selectedEndDate = pattern.endDate || defaultEndDate;
  const [calendarMonth, setCalendarMonth] = useState<number>(() => {
    const d = selectedEndDate ? new Date(selectedEndDate + 'T12:00:00') : new Date(baseDate + 'T12:00:00');
    return d.getMonth();
  });
  const [calendarYear, setCalendarYear] = useState<number>(() => {
    const d = selectedEndDate ? new Date(selectedEndDate + 'T12:00:00') : new Date(baseDate + 'T12:00:00');
    return d.getFullYear();
  });

  // Min end date: day after base date
  const minEndDate = useMemo(() => {
    const d = new Date(baseDate + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    return formatDateKey(d);
  }, [baseDate]);

  // Max end date: 1 year from base date
  const maxEndDate = useMemo(() => {
    const d = new Date(baseDate + 'T12:00:00');
    d.setFullYear(d.getFullYear() + 1);
    return formatDateKey(d);
  }, [baseDate]);

  // Calendar grid for the current month
  const calendarDays = useMemo(() => {
    const firstDay = new Date(calendarYear, calendarMonth, 1);
    const lastDay = new Date(calendarYear, calendarMonth + 1, 0);
    const startDayOfWeek = firstDay.getDay(); // 0=Sun
    const daysInMonth = lastDay.getDate();

    const days: { date: string; day: number; isCurrentMonth: boolean; isDisabled: boolean; isSelected: boolean; isBaseDate: boolean; isToday: boolean }[] = [];

    // Previous month padding
    const prevMonthLast = new Date(calendarYear, calendarMonth, 0);
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = new Date(prevMonthLast);
      d.setDate(prevMonthLast.getDate() - i);
      const dateKey = formatDateKey(d);
      days.push({
        date: dateKey,
        day: d.getDate(),
        isCurrentMonth: false,
        isDisabled: true,
        isSelected: false,
        isBaseDate: false,
        isToday: false,
      });
    }

    // Current month days
    const todayKey = formatDateKey(new Date());
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(calendarYear, calendarMonth, d);
      const dateKey = formatDateKey(dateObj);
      const isDisabled = dateKey < minEndDate || dateKey > maxEndDate;
      days.push({
        date: dateKey,
        day: d,
        isCurrentMonth: true,
        isDisabled,
        isSelected: dateKey === selectedEndDate,
        isBaseDate: dateKey === baseDate,
        isToday: dateKey === todayKey,
      });
    }

    // Next month padding to fill 6 rows
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(calendarYear, calendarMonth + 1, i);
      const dateKey = formatDateKey(d);
      days.push({
        date: dateKey,
        day: i,
        isCurrentMonth: false,
        isDisabled: true,
        isSelected: false,
        isBaseDate: false,
        isToday: false,
      });
    }

    return days;
  }, [calendarYear, calendarMonth, selectedEndDate, baseDate, minEndDate, maxEndDate]);

  const calendarMonthLabel = useMemo(() => {
    const d = new Date(calendarYear, calendarMonth, 1);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [calendarYear, calendarMonth]);

  const navigateMonth = useCallback((direction: -1 | 1) => {
    let newMonth = calendarMonth + direction;
    let newYear = calendarYear;
    if (newMonth < 0) { newMonth = 11; newYear--; }
    if (newMonth > 11) { newMonth = 0; newYear++; }
    setCalendarMonth(newMonth);
    setCalendarYear(newYear);
  }, [calendarMonth, calendarYear]);

  const canGoBack = useMemo(() => {
    const minDate = new Date(minEndDate + 'T12:00:00');
    const firstOfMonth = new Date(calendarYear, calendarMonth, 1);
    return firstOfMonth > new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  }, [calendarYear, calendarMonth, minEndDate]);

  const canGoForward = useMemo(() => {
    const maxDate = new Date(maxEndDate + 'T12:00:00');
    const firstOfMonth = new Date(calendarYear, calendarMonth, 1);
    return firstOfMonth < new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
  }, [calendarYear, calendarMonth, maxEndDate]);

  const selectEndDate = useCallback((dateKey: string) => {
    onPatternChange({ ...pattern, endDate: dateKey });
  }, [pattern, onPatternChange]);




  const handleTypeChange = (type: RecurrencePattern['type']) => {
    if (type === 'none') {
      onPatternChange({ type: 'none', endDate: '' });
    } else if (type === 'weekly') {
      const baseDateObj = new Date(baseDate + 'T12:00:00');
      const dayOfWeek = baseDateObj.getDay();
      const mondayBased = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const endDateToUse = pattern.endDate || defaultEndDate;
      onPatternChange({
        type: 'weekly',
        endDate: endDateToUse,
        weeklyDays: [{ day: mondayBased, time: baseTime }],
      });
      // Navigate calendar to the end date month
      const endD = new Date(endDateToUse + 'T12:00:00');
      setCalendarMonth(endD.getMonth());
      setCalendarYear(endD.getFullYear());
    } else {
      const endDateToUse = pattern.endDate || defaultEndDate;
      onPatternChange({
        type,
        endDate: endDateToUse,
      });
      const endD = new Date(endDateToUse + 'T12:00:00');
      setCalendarMonth(endD.getMonth());
      setCalendarYear(endD.getFullYear());
    }
  };

  const toggleWeeklyDay = (dayIdx: number) => {
    const current = pattern.weeklyDays || [];
    const exists = current.find(d => d.day === dayIdx);
    if (exists) {
      if (current.length <= 1) return;
      onPatternChange({
        ...pattern,
        weeklyDays: current.filter(d => d.day !== dayIdx),
      });
    } else {
      onPatternChange({
        ...pattern,
        weeklyDays: [...current, { day: dayIdx, time: baseTime }].sort((a, b) => a.day - b.day),
      });
    }
  };

  const updateDayTime = (dayIdx: number, time: string) => {
    const current = pattern.weeklyDays || [];
    onPatternChange({
      ...pattern,
      weeklyDays: current.map(d => d.day === dayIdx ? { ...d, time } : d),
    });
    setShowTimePickerForDay(null);
  };

  // Generate preview instances
  const previewInstances = useMemo(() => {
    if (pattern.type === 'none') return [];
    return generateRecurringDates(pattern, baseDate, baseTime, duration);
  }, [pattern, baseDate, baseTime, duration]);

  // Detect conflicts (respects training+biometric overlap allowance)
  const conflicts = useMemo(() => {
    if (previewInstances.length === 0) return [];
    return detectRecurringConflicts(previewInstances, existingAppointments, coachId, undefined, appointmentTypeId);
  }, [previewInstances, existingAppointments, coachId, appointmentTypeId]);


  const formatDisplayDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatEndDateDisplay = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  };

  // Calculate how many weeks/days between base and end
  const durationLabel = useMemo(() => {
    if (!selectedEndDate || !baseDate) return '';
    const start = new Date(baseDate + 'T12:00:00');
    const end = new Date(selectedEndDate + 'T12:00:00');
    const diffMs = end.getTime() - start.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''}`;
    const weeks = Math.floor(diffDays / 7);
    const remainingDays = diffDays % 7;
    if (remainingDays === 0) return `${weeks} week${weeks !== 1 ? 's' : ''}`;
    return `${weeks} week${weeks !== 1 ? 's' : ''}, ${remainingDays} day${remainingDays !== 1 ? 's' : ''}`;
  }, [baseDate, selectedEndDate]);

  return (
    <View style={styles.container}>
      {/* Recurrence Type Selector */}
      <Text style={styles.sectionLabel}>Recurrence Pattern</Text>
      <View style={styles.typeGrid}>
        {RECURRENCE_TYPES.map(rt => {
          const isActive = pattern.type === rt.type;
          return (
            <TouchableOpacity
              key={rt.type}
              style={[styles.typeCard, isActive && styles.typeCardActive]}
              onPress={() => handleTypeChange(rt.type)}
            >
              <Ionicons
                name={rt.icon as any}
                size={20}
                color={isActive ? COLORS.white : COLORS.textSecondary}
              />
              <Text style={[styles.typeLabel, isActive && styles.typeLabelActive]}>
                {rt.label}
              </Text>
              <Text style={[styles.typeDesc, isActive && styles.typeDescActive]}>
                {rt.desc}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {pattern.type !== 'none' && (
        <>
          {/* End Date Selector */}
          <Text style={[styles.sectionLabel, { marginTop: SPACING.lg }]}>End Date</Text>
          <Text style={styles.helperText}>
            Choose the last date for this recurring series
          </Text>



          {/* Calendar picker */}
          <View style={styles.calendarContainer}>
            {/* Calendar header */}
            <View style={styles.calendarHeader}>
              <TouchableOpacity
                onPress={() => canGoBack && navigateMonth(-1)}
                style={[styles.calendarNavBtn, !canGoBack && styles.calendarNavBtnDisabled]}
                disabled={!canGoBack}
              >
                <Ionicons name="chevron-back" size={18} color={canGoBack ? COLORS.primary : COLORS.borderLight} />
              </TouchableOpacity>
              <Text style={styles.calendarMonthLabel}>{calendarMonthLabel}</Text>
              <TouchableOpacity
                onPress={() => canGoForward && navigateMonth(1)}
                style={[styles.calendarNavBtn, !canGoForward && styles.calendarNavBtnDisabled]}
                disabled={!canGoForward}
              >
                <Ionicons name="chevron-forward" size={18} color={canGoForward ? COLORS.primary : COLORS.borderLight} />
              </TouchableOpacity>
            </View>

            {/* Day headers */}
            <View style={styles.calendarDayHeaders}>
              {CALENDAR_DAY_HEADERS.map(day => (
                <Text key={day} style={styles.calendarDayHeader}>{day}</Text>
              ))}
            </View>

            {/* Day grid */}
            <View style={styles.calendarGrid}>
              {calendarDays.map((day, idx) => (
                <TouchableOpacity
                  key={`${day.date}-${idx}`}
                  style={[
                    styles.calendarDay,
                    !day.isCurrentMonth && styles.calendarDayOtherMonth,
                    day.isDisabled && styles.calendarDayDisabled,
                    day.isSelected && styles.calendarDaySelected,
                    day.isBaseDate && styles.calendarDayBase,
                    day.isToday && !day.isSelected && !day.isBaseDate && styles.calendarDayToday,
                  ]}
                  onPress={() => !day.isDisabled && day.isCurrentMonth && selectEndDate(day.date)}
                  disabled={day.isDisabled || !day.isCurrentMonth}
                  activeOpacity={0.6}
                >
                  <Text style={[
                    styles.calendarDayText,
                    !day.isCurrentMonth && styles.calendarDayTextOther,
                    day.isDisabled && styles.calendarDayTextDisabled,
                    day.isSelected && styles.calendarDayTextSelected,
                    day.isBaseDate && styles.calendarDayTextBase,
                    day.isToday && !day.isSelected && !day.isBaseDate && styles.calendarDayTextToday,
                  ]}>
                    {day.day}
                  </Text>
                  {day.isBaseDate && (
                    <View style={styles.baseDateDot} />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {/* Legend */}
            <View style={styles.calendarLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: COLORS.accent }]} />
                <Text style={styles.legendText}>End date</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: COLORS.success }]} />
                <Text style={styles.legendText}>Start date</Text>
              </View>
            </View>
          </View>

          {/* Selected end date summary */}
          <View style={styles.endDateSummary}>
            <Ionicons name="flag" size={14} color={COLORS.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.endDateSummaryText}>
                Ends: {formatEndDateDisplay(selectedEndDate)}
              </Text>
              {durationLabel ? (
                <Text style={styles.endDateDuration}>
                  {durationLabel} from start
                </Text>
              ) : null}
            </View>
          </View>

          {/* Weekly Day Selector with Per-Day Times */}
          {pattern.type === 'weekly' && (
            <>
              <Text style={[styles.sectionLabel, { marginTop: SPACING.lg }]}>
                Select Days & Times
              </Text>
              <Text style={styles.helperText}>
                Tap a day to toggle it. Tap the time to change it for that day.
              </Text>
              <View style={styles.weeklyDaysContainer}>
                {DAY_NAMES.map((dayName, idx) => {
                  const dayConfig = pattern.weeklyDays?.find(d => d.day === idx);
                  const isSelected = !!dayConfig;
                  return (
                    <View key={idx} style={styles.weeklyDayRow}>
                      <TouchableOpacity
                        style={[styles.dayToggle, isSelected && styles.dayToggleActive]}
                        onPress={() => toggleWeeklyDay(idx)}
                      >
                        <View style={[styles.dayCheckbox, isSelected && styles.dayCheckboxActive]}>
                          {isSelected && <Ionicons name="checkmark" size={12} color={COLORS.white} />}
                        </View>
                        <Text style={[styles.dayToggleText, isSelected && styles.dayToggleTextActive]}>
                          {DAY_NAMES_FULL[idx]}
                        </Text>
                      </TouchableOpacity>
                      {isSelected && (
                        <TouchableOpacity
                          style={styles.dayTimeBtn}
                          onPress={() => setShowTimePickerForDay(
                            showTimePickerForDay === idx ? null : idx
                          )}
                        >
                          <Ionicons name="time-outline" size={14} color={COLORS.accent} />
                          <Text style={styles.dayTimeBtnText}>
                            {formatTimeDisplay(dayConfig!.time)}
                          </Text>
                          <Ionicons
                            name={showTimePickerForDay === idx ? 'chevron-up' : 'chevron-down'}
                            size={14}
                            color={COLORS.textMuted}
                          />
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </View>

              {/* Inline Time Picker for Selected Day */}
              {showTimePickerForDay !== null && (
                <View style={styles.inlineTimePicker}>
                  <View style={styles.timePickerHeader}>
                    <Ionicons name="time" size={14} color={COLORS.accent} />
                    <Text style={styles.timePickerTitle}>
                      Set time for {DAY_NAMES_FULL[showTimePickerForDay]}
                    </Text>
                    <TouchableOpacity onPress={() => setShowTimePickerForDay(null)}>
                      <Ionicons name="close" size={18} color={COLORS.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <ScrollView style={styles.timePickerScroll} nestedScrollEnabled>
                    <View style={styles.timePickerGrid}>
                      {TIME_SLOTS_15.map(slot => {
                        const currentDay = pattern.weeklyDays?.find(d => d.day === showTimePickerForDay);
                        const isActive = currentDay?.time === slot;
                        return (
                          <TouchableOpacity
                            key={slot}
                            style={[styles.timePickerSlot, isActive && styles.timePickerSlotActive]}
                            onPress={() => updateDayTime(showTimePickerForDay, slot)}
                          >
                            <Text style={[styles.timePickerSlotText, isActive && styles.timePickerSlotTextActive]}>
                              {formatTimeDisplay(slot)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
              )}
            </>
          )}

          {/* Preview & Conflicts */}
          <View style={styles.previewSection}>
            <View style={styles.previewHeader}>
              <Ionicons name="list" size={14} color={COLORS.primary} />
              <Text style={styles.previewTitle}>
                {previewInstances.length} appointment{previewInstances.length !== 1 ? 's' : ''} will be created
              </Text>
            </View>

            {conflicts.length > 0 && (
              <View style={styles.conflictWarning}>
                <Ionicons name="warning" size={16} color={COLORS.danger} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.conflictTitle}>
                    {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''} detected
                  </Text>
                  <Text style={styles.conflictSubtext}>
                    {coachName || 'Coach'} has existing appointments at these times
                  </Text>
                </View>
              </View>
            )}

            {/* Show first few instances */}
            <View style={styles.previewList}>
              {previewInstances.slice(0, 8).map((inst, idx) => {
                const hasConflict = conflicts.some(c => c.date === inst.date && c.startTime === inst.startTime);
                return (
                  <View key={idx} style={[styles.previewItem, hasConflict && styles.previewItemConflict]}>
                    <View style={[styles.previewDot, hasConflict && styles.previewDotConflict]} />
                    <Text style={[styles.previewDate, hasConflict && styles.previewDateConflict]}>
                      {formatDisplayDate(inst.date)}
                    </Text>
                    <Text style={[styles.previewTime, hasConflict && styles.previewTimeConflict]}>
                      {formatTimeDisplay(inst.startTime)} - {formatTimeDisplay(inst.endTime)}
                    </Text>
                    {hasConflict && (
                      <Ionicons name="warning" size={12} color={COLORS.danger} />
                    )}
                  </View>
                );
              })}
              {previewInstances.length > 8 && (
                <Text style={styles.previewMore}>
                  +{previewInstances.length - 8} more appointments...
                </Text>
              )}
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  sectionLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: SPACING.sm,
  },
  helperText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginBottom: SPACING.sm,
    marginTop: -4,
  },
  // Type selector
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  typeCard: {
    width: '48%' as any,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1.5,
    borderColor: COLORS.borderLight,
    alignItems: 'center',
    gap: 4,
    ...SHADOWS.sm,
  },
  typeCardActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  typeLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.primary,
  },
  typeLabelActive: {
    color: COLORS.white,
  },
  typeDesc: {
    fontSize: 9,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  typeDescActive: {
    color: 'rgba(255,255,255,0.8)',
  },



  // Calendar
  calendarContainer: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm + 2,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  calendarNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  calendarNavBtnDisabled: {
    opacity: 0.4,
  },
  calendarMonthLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.primary,
  },
  calendarDayHeaders: {
    flexDirection: 'row',
    paddingHorizontal: 4,
    paddingTop: SPACING.sm,
    paddingBottom: 4,
  },
  calendarDayHeader: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 4,
    paddingBottom: SPACING.sm,
  },
  calendarDay: {
    width: '14.28%' as any,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  calendarDayOtherMonth: {
    opacity: 0.25,
  },
  calendarDayDisabled: {
    opacity: 0.3,
  },
  calendarDaySelected: {
    backgroundColor: COLORS.accent,
    borderRadius: 20,
  },
  calendarDayBase: {
    backgroundColor: COLORS.success + '20',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: COLORS.success,
  },
  calendarDayToday: {
    borderWidth: 1.5,
    borderColor: COLORS.accent + '40',
    borderRadius: 20,
  },
  calendarDayText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.primary,
  },
  calendarDayTextOther: {
    color: COLORS.textMuted,
  },
  calendarDayTextDisabled: {
    color: COLORS.textMuted,
  },
  calendarDayTextSelected: {
    color: COLORS.white,
    fontWeight: '800',
  },
  calendarDayTextBase: {
    color: COLORS.success,
    fontWeight: '800',
  },
  calendarDayTextToday: {
    color: COLORS.accent,
  },
  baseDateDot: {
    position: 'absolute',
    bottom: 2,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.success,
  },
  calendarLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    backgroundColor: COLORS.background,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: '500',
  },

  // End date summary
  endDateSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accent + '08',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.accent + '20',
  },
  endDateSummaryText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.primary,
  },
  endDateDuration: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 1,
  },

  // Weekly days
  weeklyDaysContainer: {
    gap: 6,
  },
  weeklyDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  dayToggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm + 2,
    borderWidth: 1.5,
    borderColor: COLORS.borderLight,
  },
  dayToggleActive: {
    borderColor: COLORS.accent + '40',
    backgroundColor: COLORS.accent + '06',
  },
  dayCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCheckboxActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  dayToggleText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  dayToggleTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  dayTimeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.accent + '10',
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 7,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.accent + '25',
  },
  dayTimeBtnText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.accent,
  },
  // Inline time picker
  inlineTimePicker: {
    marginTop: SPACING.sm,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.accent + '30',
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  timePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.sm + 2,
    backgroundColor: COLORS.accent + '08',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  timePickerTitle: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.accent,
    flex: 1,
  },
  timePickerScroll: {
    maxHeight: 180,
  },
  timePickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    padding: SPACING.sm,
  },
  timePickerSlot: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    minWidth: 72,
    alignItems: 'center',
  },
  timePickerSlotActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  timePickerSlotText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  timePickerSlotTextActive: {
    color: COLORS.white,
  },
  // Preview
  previewSection: {
    marginTop: SPACING.lg,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...SHADOWS.sm,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  previewTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.primary,
  },
  conflictWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    backgroundColor: COLORS.dangerLight,
    padding: SPACING.sm + 2,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
  },
  conflictTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.danger,
  },
  conflictSubtext: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.danger,
    opacity: 0.8,
    marginTop: 1,
  },
  previewList: {
    gap: 4,
  },
  previewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: BORDER_RADIUS.sm,
  },
  previewItemConflict: {
    backgroundColor: COLORS.dangerLight,
  },
  previewDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.accent,
  },
  previewDotConflict: {
    backgroundColor: COLORS.danger,
  },
  previewDate: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.primary,
    flex: 1,
  },
  previewDateConflict: {
    color: COLORS.danger,
  },
  previewTime: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  previewTimeConflict: {
    color: COLORS.danger,
    textDecorationLine: 'line-through',
  },
  previewMore: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 4,
  },
});
