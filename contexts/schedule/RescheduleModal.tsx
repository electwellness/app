import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import {
  Appointment, appointmentTypes, formatTimeDisplay, formatDateKey,
  addMinutesToTime, hasTimeConflict, TIME_SLOTS_15, DAY_NAMES, DAY_NAMES_FULL,
  getFutureRecurringInstances, detectRecurringConflicts,
} from '../../data/scheduleData';

interface RescheduleModalProps {
  visible: boolean;
  appointment: Appointment | null;
  existingAppointments: Appointment[];
  onClose: () => void;
  onConfirm: (appointmentId: string, newDate: string, newStartTime: string, newEndTime: string) => void;
  mode?: 'single' | 'future';
  onBulkConfirm?: (recurrenceId: string, fromDate: string, shifts: { oldDay: number; newDay: number; newTime: string }[], count: number) => void;
}

type Step = 'datetime' | 'bulkconfig' | 'confirm';

export default function RescheduleModal({
  visible, appointment, existingAppointments, onClose, onConfirm,
  mode = 'single', onBulkConfirm,
}: RescheduleModalProps) {
  const [step, setStep] = useState<Step>('datetime');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [saving, setSaving] = useState(false);

  // Bulk mode state: per-day time shifts
  const [dayTimeShifts, setDayTimeShifts] = useState<{ oldDay: number; newDay: number; newTime: string }[]>([]);
  const [editingShiftDay, setEditingShiftDay] = useState<number | null>(null);

  useEffect(() => {
    if (visible && appointment) {
      setStep(mode === 'future' ? 'bulkconfig' : 'datetime');
      setSelectedDate(appointment.date);
      setSelectedTime(appointment.startTime);
      setSaving(false);
      setEditingShiftDay(null);

      // Initialize bulk shifts from recurrence pattern
      if (mode === 'future' && appointment.recurrencePattern?.weeklyDays) {
        setDayTimeShifts(
          appointment.recurrencePattern.weeklyDays.map(wd => ({
            oldDay: wd.day,
            newDay: wd.day,
            newTime: wd.time,
          }))
        );
      } else if (mode === 'future') {
        // For daily/monthly, use the current day/time
        const d = new Date(appointment.date + 'T12:00:00');
        const dayOfWeek = d.getDay();
        const mondayBased = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        setDayTimeShifts([{
          oldDay: mondayBased,
          newDay: mondayBased,
          newTime: appointment.startTime,
        }]);
      }
    }
  }, [visible, appointment?.id, mode]);

  if (!appointment) return null;

  const apptType = appointmentTypes.find(t => t.id === appointment.appointmentTypeId);
  const color = apptType?.color || '#999';
  const duration = appointment.duration;
  const isBulkMode = mode === 'future';
  const isRecurring = !!appointment.recurrenceId;

  const newEndTime = useMemo(() => addMinutesToTime(selectedTime, duration), [selectedTime, duration]);

  const hasConflict = useMemo(() => {
    if (!selectedDate || !selectedTime || isBulkMode) return false;
    return hasTimeConflict(existingAppointments, appointment.coachId, selectedDate, selectedTime, newEndTime, appointment.id, appointment.appointmentTypeId);
  }, [existingAppointments, appointment.coachId, selectedDate, selectedTime, newEndTime, appointment.id, isBulkMode, appointment.appointmentTypeId]);


  const hasChanged = useMemo(() => {
    if (isBulkMode) {
      return dayTimeShifts.some(s => s.oldDay !== s.newDay || s.newTime !== (appointment.recurrencePattern?.weeklyDays?.find(wd => wd.day === s.oldDay)?.time || appointment.startTime));
    }
    return selectedDate !== appointment.date || selectedTime !== appointment.startTime;
  }, [selectedDate, selectedTime, appointment.date, appointment.startTime, isBulkMode, dayTimeShifts]);

  const coachDayAppts = useMemo(() => {
    if (isBulkMode) return [];
    return existingAppointments
      .filter(a => a.coachId === appointment.coachId && a.date === selectedDate && a.status !== 'cancelled' && a.id !== appointment.id)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [existingAppointments, appointment.coachId, selectedDate, appointment.id, isBulkMode]);

  // Future instances count for bulk mode
  const futureInstances = useMemo(() => {
    if (!isBulkMode || !appointment.recurrenceId) return [];
    return getFutureRecurringInstances(existingAppointments, appointment.recurrenceId, appointment.date);
  }, [isBulkMode, appointment.recurrenceId, appointment.date, existingAppointments]);

  // Bulk conflict detection
  const bulkConflicts = useMemo(() => {
    if (!isBulkMode || futureInstances.length === 0) return [];
    // Generate what the new instances would look like
    const newInstances = futureInstances.map(inst => {
      const d = new Date(inst.date + 'T12:00:00');
      const dayOfWeek = d.getDay();
      const mondayBased = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const shift = dayTimeShifts.find(s => s.oldDay === mondayBased);
      if (shift && (shift.newDay !== shift.oldDay || shift.newTime !== inst.startTime)) {
        const dayDiff = shift.newDay - shift.oldDay;
        const newDate = new Date(d);
        newDate.setDate(newDate.getDate() + dayDiff);
        return {
          date: formatDateKey(newDate),
          startTime: shift.newTime,
          endTime: addMinutesToTime(shift.newTime, duration),
        };
      }
      return { date: inst.date, startTime: inst.startTime, endTime: inst.endTime };
    });
    return detectRecurringConflicts(newInstances, existingAppointments, appointment.coachId, appointment.recurrenceId, appointment.appointmentTypeId);
  }, [isBulkMode, futureInstances, dayTimeShifts, existingAppointments, appointment.coachId, appointment.recurrenceId, duration, appointment.appointmentTypeId]);


  const adjustDate = (days: number) => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + days);
    setSelectedDate(formatDateKey(d));
  };

  const formatDisplayDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatFullDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  };

  const quickDates = useMemo(() => {
    const dates: { key: string; label: string }[] = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const key = formatDateKey(d);
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `${dayName} ${d.getDate()}`;
      dates.push({ key, label });
    }
    return dates;
  }, []);

  const updateShiftDay = (oldDay: number, newDay: number) => {
    setDayTimeShifts(prev => prev.map(s => s.oldDay === oldDay ? { ...s, newDay } : s));
  };

  const updateShiftTime = (oldDay: number, newTime: string) => {
    setDayTimeShifts(prev => prev.map(s => s.oldDay === oldDay ? { ...s, newTime } : s));
    setEditingShiftDay(null);
  };

  const handleConfirmReschedule = () => {
    if (saving) return;
    setSaving(true);

    if (isBulkMode && onBulkConfirm && appointment.recurrenceId) {
      setTimeout(() => {
        onBulkConfirm(appointment.recurrenceId!, appointment.date, dayTimeShifts, futureInstances.length);
        setSaving(false);
      }, 400);
    } else {
      if (!hasChanged || hasConflict) { setSaving(false); return; }
      setTimeout(() => {
        onConfirm(appointment.id, selectedDate, selectedTime, newEndTime);
        setSaving(false);
      }, 400);
    }
  };

  const canProceedToConfirm = isBulkMode ? hasChanged : (hasChanged && !hasConflict);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={[styles.headerIconWrap, { backgroundColor: color + '18' }]}>
              <Ionicons name={isBulkMode ? 'repeat' : 'calendar-outline'} size={20} color={color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>
                {isBulkMode ? 'Reschedule Series' : 'Reschedule Appointment'}
              </Text>
              <Text style={styles.headerSubtitle}>
                {appointment.clientName} · {apptType?.shortName || 'Appointment'}
                {isBulkMode ? ` · ${futureInstances.length} instances` : ''}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* ── Single Mode: Date & Time ── */}
            {!isBulkMode && step === 'datetime' && (
              <View style={styles.stepContent}>
                <View style={styles.currentInfoCard}>
                  <View style={styles.currentInfoHeader}>
                    <Ionicons name="information-circle" size={16} color={COLORS.accent} />
                    <Text style={styles.currentInfoTitle}>Current Schedule</Text>
                  </View>
                  <Text style={styles.currentInfoText}>{formatFullDate(appointment.date)}</Text>
                  <Text style={styles.currentInfoTime}>
                    {formatTimeDisplay(appointment.startTime)} - {formatTimeDisplay(appointment.endTime)} ({duration} min)
                  </Text>
                </View>

                <Text style={styles.sectionLabel}>Select New Date</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickDateRow}>
                  {quickDates.map(qd => {
                    const isSelected = selectedDate === qd.key;
                    const isOriginal = qd.key === appointment.date;
                    return (
                      <TouchableOpacity key={qd.key} style={[styles.quickDateChip, isSelected && styles.quickDateChipActive]} onPress={() => setSelectedDate(qd.key)}>
                        <Text style={[styles.quickDateText, isSelected && styles.quickDateTextActive]}>{qd.label}</Text>
                        {isOriginal && !isSelected && <View style={styles.originalDot} />}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <View style={styles.dateNav}>
                  <TouchableOpacity onPress={() => adjustDate(-1)} style={styles.dateNavArrow}>
                    <Ionicons name="chevron-back" size={18} color={COLORS.primary} />
                  </TouchableOpacity>
                  <Text style={styles.dateNavDisplay}>{formatDisplayDate(selectedDate)}</Text>
                  <TouchableOpacity onPress={() => adjustDate(1)} style={styles.dateNavArrow}>
                    <Ionicons name="chevron-forward" size={18} color={COLORS.primary} />
                  </TouchableOpacity>
                </View>

                {coachDayAppts.length > 0 && (
                  <View style={styles.existingAppts}>
                    <View style={styles.existingApptsHeader}>
                      <Ionicons name="calendar" size={13} color={COLORS.textMuted} />
                      <Text style={styles.existingApptsTitle}>{appointment.coachName}'s schedule ({coachDayAppts.length})</Text>
                    </View>
                    {coachDayAppts.map(a => {
                      const aType = appointmentTypes.find(t => t.id === a.appointmentTypeId);
                      return (
                        <View key={a.id} style={styles.existingApptRow}>
                          <View style={[styles.existingApptDot, { backgroundColor: aType?.color || '#999' }]} />
                          <Text style={styles.existingApptTime}>{formatTimeDisplay(a.startTime)} - {formatTimeDisplay(a.endTime)}</Text>
                          <Text style={styles.existingApptName} numberOfLines={1}>{a.clientName}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                <Text style={[styles.sectionLabel, { marginTop: SPACING.md }]}>Select New Time</Text>
                <View style={styles.timeGrid}>
                  {TIME_SLOTS_15.map(slot => {
                    const isSelected = selectedTime === slot;
                    const slotEnd = addMinutesToTime(slot, duration);
                    const wouldConflict = hasTimeConflict(existingAppointments, appointment.coachId, selectedDate, slot, slotEnd, appointment.id, appointment.appointmentTypeId);
                    const isOriginalSlot = slot === appointment.startTime && selectedDate === appointment.date;

                    return (
                      <TouchableOpacity
                        key={slot}
                        style={[styles.timeSlot, isSelected && styles.timeSlotActive, wouldConflict && styles.timeSlotConflict, isOriginalSlot && !isSelected && styles.timeSlotOriginal]}
                        onPress={() => !wouldConflict && setSelectedTime(slot)}
                        disabled={!!wouldConflict}
                      >
                        <Text style={[styles.timeSlotText, isSelected && styles.timeSlotTextActive, wouldConflict && styles.timeSlotTextConflict, isOriginalSlot && !isSelected && styles.timeSlotTextOriginal]}>
                          {formatTimeDisplay(slot)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {hasConflict && (
                  <View style={styles.conflictBanner}>
                    <Ionicons name="warning" size={16} color={COLORS.danger} />
                    <Text style={styles.conflictText}>Time conflict with {appointment.coachName}'s existing appointment</Text>
                  </View>
                )}

                {selectedTime && (
                  <View style={[styles.timeSummary, hasChanged && !hasConflict && styles.timeSummaryChanged]}>
                    <Ionicons name={hasChanged ? 'swap-horizontal' : 'time-outline'} size={16} color={hasChanged && !hasConflict ? COLORS.success : COLORS.accent} />
                    <Text style={[styles.timeSummaryText, hasChanged && !hasConflict && { color: COLORS.success }]}>
                      {formatTimeDisplay(selectedTime)} - {formatTimeDisplay(newEndTime)} ({duration} min)
                      {hasChanged ? ' (Changed)' : ' (No change)'}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* ── Bulk Mode: Per-Day Configuration ── */}
            {isBulkMode && step === 'bulkconfig' && (
              <View style={styles.stepContent}>
                <View style={styles.bulkInfoCard}>
                  <Ionicons name="repeat" size={18} color={COLORS.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bulkInfoTitle}>Bulk Reschedule</Text>
                    <Text style={styles.bulkInfoDesc}>
                      Change the day and/or time for all {futureInstances.length} future instances
                    </Text>
                  </View>
                </View>

                <Text style={styles.sectionLabel}>Adjust Schedule Per Day</Text>
                <Text style={styles.helperText}>
                  Change the day of week and time for each recurring slot
                </Text>

                {dayTimeShifts.map((shift, idx) => (
                  <View key={idx} style={styles.shiftCard}>
                    <View style={styles.shiftHeader}>
                      <View style={styles.shiftOldBadge}>
                        <Text style={styles.shiftOldText}>
                          {DAY_NAMES_FULL[shift.oldDay]}
                        </Text>
                      </View>
                      <Ionicons name="arrow-forward" size={16} color={COLORS.accent} />
                    </View>

                    {/* New Day Selector */}
                    <Text style={styles.shiftSubLabel}>Move to:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shiftDayRow}>
                      {DAY_NAMES.map((dn, dayIdx) => {
                        const isActive = shift.newDay === dayIdx;
                        return (
                          <TouchableOpacity
                            key={dayIdx}
                            style={[styles.shiftDayChip, isActive && styles.shiftDayChipActive]}
                            onPress={() => updateShiftDay(shift.oldDay, dayIdx)}
                          >
                            <Text style={[styles.shiftDayText, isActive && styles.shiftDayTextActive]}>{dn}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>

                    {/* Time Selector */}
                    <TouchableOpacity
                      style={styles.shiftTimeBtn}
                      onPress={() => setEditingShiftDay(editingShiftDay === shift.oldDay ? null : shift.oldDay)}
                    >
                      <Ionicons name="time-outline" size={14} color={COLORS.accent} />
                      <Text style={styles.shiftTimeBtnText}>{formatTimeDisplay(shift.newTime)}</Text>
                      <Ionicons name={editingShiftDay === shift.oldDay ? 'chevron-up' : 'chevron-down'} size={14} color={COLORS.textMuted} />
                    </TouchableOpacity>

                    {editingShiftDay === shift.oldDay && (
                      <ScrollView style={styles.shiftTimeGrid} nestedScrollEnabled horizontal={false}>
                        <View style={styles.shiftTimeGridInner}>
                          {TIME_SLOTS_15.map(slot => {
                            const isActive = shift.newTime === slot;
                            return (
                              <TouchableOpacity
                                key={slot}
                                style={[styles.shiftTimeSlot, isActive && styles.shiftTimeSlotActive]}
                                onPress={() => updateShiftTime(shift.oldDay, slot)}
                              >
                                <Text style={[styles.shiftTimeSlotText, isActive && styles.shiftTimeSlotTextActive]}>
                                  {formatTimeDisplay(slot)}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </ScrollView>
                    )}
                  </View>
                ))}

                {/* Bulk Conflict Warnings */}
                {bulkConflicts.length > 0 && (
                  <View style={styles.bulkConflictCard}>
                    <View style={styles.bulkConflictHeader}>
                      <Ionicons name="warning" size={16} color={COLORS.danger} />
                      <Text style={styles.bulkConflictTitle}>
                        {bulkConflicts.length} conflict{bulkConflicts.length !== 1 ? 's' : ''} detected
                      </Text>
                    </View>
                    {bulkConflicts.slice(0, 5).map((c, idx) => (
                      <View key={idx} style={styles.bulkConflictRow}>
                        <Text style={styles.bulkConflictDate}>{formatDisplayDate(c.date)}</Text>
                        <Text style={styles.bulkConflictTime}>
                          {formatTimeDisplay(c.startTime)} - conflicts with {c.conflictWith}
                        </Text>
                      </View>
                    ))}
                    {bulkConflicts.length > 5 && (
                      <Text style={styles.bulkConflictMore}>+{bulkConflicts.length - 5} more conflicts</Text>
                    )}
                  </View>
                )}

                {/* Summary */}
                <View style={styles.bulkSummary}>
                  <Ionicons name="list" size={14} color={COLORS.primary} />
                  <Text style={styles.bulkSummaryText}>
                    {futureInstances.length} appointment{futureInstances.length !== 1 ? 's' : ''} will be updated
                    {bulkConflicts.length > 0 ? ` (${bulkConflicts.length} with conflicts)` : ''}
                  </Text>
                </View>
              </View>
            )}

            {/* ── Confirmation Step ── */}
            {step === 'confirm' && (
              <View style={styles.stepContent}>
                <View style={styles.confirmCard}>
                  <View style={[styles.confirmHeader, { backgroundColor: color + '10' }]}>
                    <Ionicons name={isBulkMode ? 'repeat-outline' : 'swap-horizontal-outline'} size={24} color={color} />
                    <Text style={[styles.confirmTitle, { color }]}>
                      {isBulkMode ? 'Bulk Reschedule Confirmation' : 'Reschedule Confirmation'}
                    </Text>
                  </View>

                  <View style={styles.confirmBody}>
                    <View style={styles.confirmInfoRow}>
                      <Ionicons name="person" size={14} color={COLORS.textMuted} />
                      <Text style={styles.confirmInfoLabel}>Client</Text>
                      <Text style={styles.confirmInfoValue}>{appointment.clientName}</Text>
                    </View>
                    <View style={styles.confirmInfoRow}>
                      <Ionicons name={(apptType?.icon || 'calendar') as any} size={14} color={COLORS.textMuted} />
                      <Text style={styles.confirmInfoLabel}>Type</Text>
                      <Text style={styles.confirmInfoValue}>{apptType?.name || 'Appointment'}</Text>
                    </View>
                    <View style={styles.confirmInfoRow}>
                      <Ionicons name="person-circle" size={14} color={COLORS.textMuted} />
                      <Text style={styles.confirmInfoLabel}>Coach</Text>
                      <Text style={styles.confirmInfoValue}>{appointment.coachName}</Text>
                    </View>

                    <View style={styles.confirmDivider} />

                    {isBulkMode ? (
                      <>
                        <Text style={styles.comparisonTitle}>Schedule Changes</Text>
                        {dayTimeShifts.map((shift, idx) => {
                          const origTime = appointment.recurrencePattern?.weeklyDays?.find(wd => wd.day === shift.oldDay)?.time || appointment.startTime;
                          const dayChanged = shift.oldDay !== shift.newDay;
                          const timeChanged = shift.newTime !== origTime;
                          return (
                            <View key={idx} style={styles.shiftConfirmRow}>
                              <View style={styles.shiftConfirmOld}>
                                <Text style={styles.shiftConfirmDay}>{DAY_NAMES[shift.oldDay]}</Text>
                                <Text style={styles.shiftConfirmTime}>{formatTimeDisplay(origTime)}</Text>
                              </View>
                              <Ionicons name="arrow-forward" size={14} color={COLORS.accent} />
                              <View style={styles.shiftConfirmNew}>
                                <Text style={[styles.shiftConfirmDay, (dayChanged || timeChanged) && { color: COLORS.success, fontWeight: '800' }]}>
                                  {DAY_NAMES[shift.newDay]}
                                </Text>
                                <Text style={[styles.shiftConfirmTime, timeChanged && { color: COLORS.success, fontWeight: '700' }]}>
                                  {formatTimeDisplay(shift.newTime)}
                                </Text>
                              </View>
                            </View>
                          );
                        })}
                        <View style={styles.bulkCountBadge}>
                          <Ionicons name="repeat" size={14} color={COLORS.accent} />
                          <Text style={styles.bulkCountText}>
                            {futureInstances.length} appointments will be updated
                          </Text>
                        </View>
                      </>
                    ) : (
                      <>
                        <Text style={styles.comparisonTitle}>Schedule Change</Text>
                        <View style={styles.comparisonRow}>
                          <View style={[styles.comparisonCard, styles.comparisonCardOld]}>
                            <View style={styles.comparisonBadge}>
                              <Ionicons name="close-circle" size={12} color={COLORS.danger} />
                              <Text style={[styles.comparisonBadgeText, { color: COLORS.danger }]}>Previous</Text>
                            </View>
                            <Text style={styles.comparisonDate}>{formatDisplayDate(appointment.date)}</Text>
                            <Text style={styles.comparisonTime}>{formatTimeDisplay(appointment.startTime)}</Text>
                            <Text style={styles.comparisonEndTime}>to {formatTimeDisplay(appointment.endTime)}</Text>
                          </View>
                          <View style={styles.comparisonArrow}>
                            <Ionicons name="arrow-forward" size={20} color={COLORS.accent} />
                          </View>
                          <View style={[styles.comparisonCard, styles.comparisonCardNew]}>
                            <View style={styles.comparisonBadge}>
                              <Ionicons name="checkmark-circle" size={12} color={COLORS.success} />
                              <Text style={[styles.comparisonBadgeText, { color: COLORS.success }]}>New</Text>
                            </View>
                            <Text style={[styles.comparisonDate, { color: COLORS.success }]}>{formatDisplayDate(selectedDate)}</Text>
                            <Text style={[styles.comparisonTime, { color: COLORS.success }]}>{formatTimeDisplay(selectedTime)}</Text>
                            <Text style={[styles.comparisonEndTime, { color: COLORS.success }]}>to {formatTimeDisplay(newEndTime)}</Text>
                          </View>
                        </View>
                      </>
                    )}
                  </View>
                </View>
              </View>
            )}

            <View style={{ height: 20 }} />
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            {step === 'datetime' || (step === 'bulkconfig' && !isBulkMode) ? (
              <>
                <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.nextBtn, !canProceedToConfirm && styles.nextBtnDisabled]}
                  onPress={() => setStep('confirm')}
                  disabled={!canProceedToConfirm}
                >
                  <Text style={styles.nextBtnText}>Review Changes</Text>
                  <Ionicons name="arrow-forward" size={16} color={COLORS.white} />
                </TouchableOpacity>
              </>
            ) : step === 'bulkconfig' ? (
              <>
                <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.nextBtn, !hasChanged && styles.nextBtnDisabled]}
                  onPress={() => setStep('confirm')}
                  disabled={!hasChanged}
                >
                  <Text style={styles.nextBtnText}>Review Changes</Text>
                  <Ionicons name="arrow-forward" size={16} color={COLORS.white} />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setStep(isBulkMode ? 'bulkconfig' : 'datetime')}>
                  <Ionicons name="arrow-back" size={16} color={COLORS.primary} />
                  <Text style={styles.cancelBtnText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmBtn, saving && { opacity: 0.6 }]}
                  onPress={handleConfirmReschedule}
                  disabled={saving}
                >
                  {saving ? (
                    <Text style={styles.confirmBtnText}>Saving...</Text>
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={18} color={COLORS.white} />
                      <Text style={styles.confirmBtnText}>
                        {isBulkMode ? `Update ${futureInstances.length} Appointments` : 'Confirm Reschedule'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'center', alignItems: 'center', padding: SPACING.md },
  container: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.xl, width: '100%', maxWidth: 480, maxHeight: '92%', ...SHADOWS.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  headerIconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FONT_SIZES.lg, fontWeight: '800', color: COLORS.primary },
  headerSubtitle: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 1 },
  closeBtn: { padding: 4 },
  scroll: { flex: 1 },
  stepContent: { padding: SPACING.lg },
  // Current info
  currentInfoCard: { backgroundColor: COLORS.accent + '08', borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.accent + '15' },
  currentInfoHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: 6 },
  currentInfoTitle: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.accent, textTransform: 'uppercase', letterSpacing: 0.5 },
  currentInfoText: { fontSize: FONT_SIZES.md, fontWeight: '600', color: COLORS.primary },
  currentInfoTime: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, marginTop: 2 },
  sectionLabel: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.primary, marginBottom: SPACING.sm },
  helperText: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginBottom: SPACING.sm, marginTop: -4 },
  // Quick dates
  quickDateRow: { flexDirection: 'row', gap: SPACING.sm, paddingBottom: SPACING.md },
  quickDateChip: { paddingHorizontal: SPACING.md, paddingVertical: 7, borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.background, borderWidth: 1.5, borderColor: COLORS.borderLight, position: 'relative' },
  quickDateChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  quickDateText: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: COLORS.textSecondary },
  quickDateTextActive: { color: COLORS.white },
  originalDot: { position: 'absolute', top: 3, right: 3, width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.warning },
  dateNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.lg, backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.sm, marginBottom: SPACING.md },
  dateNavArrow: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', ...SHADOWS.sm },
  dateNavDisplay: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.primary },
  // Existing appointments
  existingAppts: { backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md, padding: SPACING.sm + 2, marginBottom: SPACING.md },
  existingApptsHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginBottom: SPACING.xs },
  existingApptsTitle: { fontSize: 10, fontWeight: '600', color: COLORS.textMuted },
  existingApptRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: 3 },
  existingApptDot: { width: 6, height: 6, borderRadius: 3 },
  existingApptTime: { fontSize: 10, fontWeight: '600', color: COLORS.textSecondary, width: 110 },
  existingApptName: { fontSize: 10, color: COLORS.textMuted, flex: 1 },
  // Time grid
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  timeSlot: { paddingHorizontal: SPACING.sm, paddingVertical: 6, borderRadius: BORDER_RADIUS.sm, backgroundColor: COLORS.background, borderWidth: 1.5, borderColor: COLORS.borderLight, minWidth: 76, alignItems: 'center' },
  timeSlotActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  timeSlotConflict: { backgroundColor: COLORS.dangerLight, borderColor: COLORS.danger + '40', opacity: 0.6 },
  timeSlotOriginal: { borderColor: COLORS.warning, borderStyle: 'dashed' as any },
  timeSlotText: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary },
  timeSlotTextActive: { color: COLORS.white },
  timeSlotTextConflict: { color: COLORS.danger, textDecorationLine: 'line-through' },
  timeSlotTextOriginal: { color: COLORS.warning },
  conflictBanner: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.dangerLight, padding: SPACING.md, borderRadius: BORDER_RADIUS.md, marginTop: SPACING.md },
  conflictText: { fontSize: FONT_SIZES.sm, color: COLORS.danger, fontWeight: '600', flex: 1 },
  timeSummary: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.accent + '10', padding: SPACING.md, borderRadius: BORDER_RADIUS.md, marginTop: SPACING.md },
  timeSummaryChanged: { backgroundColor: COLORS.successLight },
  timeSummaryText: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.accent, flex: 1 },
  // Bulk mode
  bulkInfoCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.accent + '08', borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.accent + '15',
  },
  bulkInfoTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.accent },
  bulkInfoDesc: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, marginTop: 2 },
  // Shift cards
  shiftCard: {
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, padding: SPACING.md,
    marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.borderLight, ...SHADOWS.sm,
  },
  shiftHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  shiftOldBadge: { backgroundColor: COLORS.background, paddingHorizontal: SPACING.md, paddingVertical: 4, borderRadius: BORDER_RADIUS.full },
  shiftOldText: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.primary },
  shiftSubLabel: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: COLORS.textMuted, marginBottom: 4 },
  shiftDayRow: { flexDirection: 'row', gap: 5, paddingBottom: SPACING.sm },
  shiftDayChip: { paddingHorizontal: SPACING.sm + 2, paddingVertical: 5, borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.background, borderWidth: 1.5, borderColor: COLORS.borderLight },
  shiftDayChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  shiftDayText: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary },
  shiftDayTextActive: { color: COLORS.white },
  shiftTimeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.accent + '10', paddingHorizontal: SPACING.sm + 2, paddingVertical: 7,
    borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.accent + '25', alignSelf: 'flex-start',
  },
  shiftTimeBtnText: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.accent },
  shiftTimeGrid: { maxHeight: 150, marginTop: SPACING.sm },
  shiftTimeGridInner: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  shiftTimeSlot: { paddingHorizontal: SPACING.sm, paddingVertical: 5, borderRadius: BORDER_RADIUS.sm, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.borderLight, minWidth: 72, alignItems: 'center' },
  shiftTimeSlotActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  shiftTimeSlotText: { fontSize: 10, fontWeight: '600', color: COLORS.textSecondary },
  shiftTimeSlotTextActive: { color: COLORS.white },
  // Bulk conflicts
  bulkConflictCard: {
    backgroundColor: COLORS.dangerLight, borderRadius: BORDER_RADIUS.md, padding: SPACING.md,
    marginTop: SPACING.md, borderWidth: 1, borderColor: COLORS.danger + '20',
  },
  bulkConflictHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  bulkConflictTitle: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.danger },
  bulkConflictRow: { paddingVertical: 3 },
  bulkConflictDate: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: COLORS.danger },
  bulkConflictTime: { fontSize: 10, color: COLORS.danger, opacity: 0.8 },
  bulkConflictMore: { fontSize: 10, color: COLORS.danger, fontStyle: 'italic', marginTop: 4 },
  bulkSummary: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.accent + '10', padding: SPACING.md, borderRadius: BORDER_RADIUS.md, marginTop: SPACING.md,
  },
  bulkSummaryText: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.accent, flex: 1 },
  // Confirmation
  confirmCard: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.borderLight, ...SHADOWS.md },
  confirmHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.lg },
  confirmTitle: { fontSize: FONT_SIZES.lg, fontWeight: '800' },
  confirmBody: { padding: SPACING.lg },
  confirmInfoRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  confirmInfoLabel: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted, fontWeight: '500', width: 55 },
  confirmInfoValue: { fontSize: FONT_SIZES.sm, color: COLORS.primary, fontWeight: '600', flex: 1 },
  confirmDivider: { height: 1, backgroundColor: COLORS.borderLight, marginVertical: SPACING.md },
  comparisonTitle: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.primary, marginBottom: SPACING.md, textTransform: 'uppercase', letterSpacing: 0.5 },
  comparisonRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  comparisonCard: { flex: 1, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, alignItems: 'center' },
  comparisonCardOld: { backgroundColor: COLORS.dangerLight, borderWidth: 1, borderColor: COLORS.danger + '20' },
  comparisonCardNew: { backgroundColor: COLORS.successLight, borderWidth: 1, borderColor: COLORS.success + '20' },
  comparisonBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: SPACING.sm },
  comparisonBadgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  comparisonDate: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.danger, textAlign: 'center' },
  comparisonTime: { fontSize: FONT_SIZES.xl, fontWeight: '800', color: COLORS.danger, marginTop: 4 },
  comparisonEndTime: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 2 },
  comparisonArrow: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.accent + '12', alignItems: 'center', justifyContent: 'center' },
  // Shift confirm rows
  shiftConfirmRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md, padding: SPACING.sm + 2, marginBottom: SPACING.sm,
  },
  shiftConfirmOld: { flex: 1, alignItems: 'center' },
  shiftConfirmNew: { flex: 1, alignItems: 'center' },
  shiftConfirmDay: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.primary },
  shiftConfirmTime: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, marginTop: 1 },
  bulkCountBadge: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.accent + '10', padding: SPACING.md, borderRadius: BORDER_RADIUS.md, marginTop: SPACING.md,
  },
  bulkCountText: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.accent },
  // Footer
  footer: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.lg, borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  cancelBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm + 2, borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  cancelBtnText: { fontSize: FONT_SIZES.md, fontWeight: '600', color: COLORS.primary },
  nextBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.accent, paddingVertical: SPACING.sm + 4, borderRadius: BORDER_RADIUS.md },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.white },
  confirmBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.success, paddingVertical: SPACING.sm + 4, borderRadius: BORDER_RADIUS.md },
  confirmBtnText: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.white },
});
