import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, Alert, ScrollView, Animated, Easing,
  Platform, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import {
  Appointment, appointmentTypes, formatTimeDisplay, formatDateKey,
  getProgramDefinition, getProgramColor, getFutureRecurringInstances,
  DAY_NAMES,
} from '../../data/scheduleData';
import {
  generateSingleEventICS, generateRecurringSeriesICS,
  downloadICSFile, generateGoogleCalendarURL,
} from '../../lib/icsGenerator';

import { openAddressInMaps } from '../../lib/openMaps';
import RescheduleModal from './RescheduleModal';
import RecurringEditChoiceModal, { RecurringEditChoice } from './RecurringEditChoiceModal';

interface AppointmentDetailModalProps {
  visible: boolean;
  appointment: Appointment | null;
  onClose: () => void;
  onUpdateStatus: (id: string, status: Appointment['status']) => void;
  onDelete: (id: string) => void;
  sessionBalance?: { used: number; allowed: number } | null;
  existingAppointments?: Appointment[];
  onReschedule?: (id: string, newDate: string, newStartTime: string, newEndTime: string) => void;
  onBulkReschedule?: (recurrenceId: string, fromDate: string, dayTimeShifts: { oldDay: number; newDay: number; newTime: string }[]) => void;
  onBulkCancel?: (recurrenceId: string, fromDate: string) => void;
  onBulkDelete?: (recurrenceId: string, fromDate: string) => void;
  onUpdateSingleStatus?: (id: string, status: Appointment['status']) => void;
  userRole?: string;
  userCoachName?: string;
  userCoachId?: string;
  /** An overlapping biometric assessment for this training session (if any). */
  inSessionBiometric?: Appointment | null;
  /** Called when the trainer taps the "Biometric assessment due" reminder chip. */
  onLogBiometric?: (biometricAppt: Appointment) => void;
}

export default function AppointmentDetailModal({
  visible, appointment, onClose, onUpdateStatus, onDelete, sessionBalance,
  existingAppointments = [], onReschedule, onBulkReschedule, onBulkCancel, onBulkDelete,
  userRole, userCoachName, userCoachId,
  inSessionBiometric, onLogBiometric,
}: AppointmentDetailModalProps) {



  const [showReschedule, setShowReschedule] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [bannerMessage, setBannerMessage] = useState('');
  const [bannerTitle, setBannerTitle] = useState('Appointment Rescheduled');
  const bannerAnim = useRef(new Animated.Value(-100)).current;
  const bannerTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showEditChoice, setShowEditChoice] = useState(false);
  const [editChoiceAction, setEditChoiceAction] = useState<'reschedule' | 'cancel' | 'delete'>('reschedule');
  const [rescheduleMode, setRescheduleMode] = useState<'single' | 'future'>('single');

  useEffect(() => {
    return () => {
      if (bannerTimeout.current) clearTimeout(bannerTimeout.current);
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      setShowBanner(false);
      bannerAnim.setValue(-100);
      setShowReschedule(false);
      setShowEditChoice(false);
    }
  }, [visible]);

  // ── Derived values (safe with null appointment) ──
  const isRecurring = !!appointment?.recurrenceId;

  // All useMemo hooks MUST be called unconditionally (before any early return)
  const futureInstances = useMemo(() => {
    if (!isRecurring || !appointment?.recurrenceId) return [];
    return getFutureRecurringInstances(existingAppointments, appointment.recurrenceId, appointment.date);
  }, [isRecurring, appointment?.recurrenceId, appointment?.date, existingAppointments]);

  const clientData = useMemo(() => {
    if (!appointment) return null;
    const apptT = appointmentTypes.find(t => t.id === appointment.appointmentTypeId);
    const isTraining = apptT?.category === 'training';
    if (!isTraining) return null;
    return null;
  }, [appointment]);

  const recurrenceDesc = useMemo(() => {
    if (!isRecurring || !appointment?.recurrencePattern) return '';
    const p = appointment.recurrencePattern;
    if (p.type === 'daily') return 'Repeats daily';
    if (p.type === 'weekly' && p.weeklyDays) {
      const days = p.weeklyDays.map(wd => DAY_NAMES[wd.day]).join(', ');
      return `Repeats weekly on ${days}`;
    }
    if (p.type === 'monthly') return 'Repeats monthly';
    return 'Recurring';
  }, [isRecurring, appointment?.recurrencePattern]);

  // ── Early return AFTER all hooks ──
  const showNotificationBanner = (title: string, message: string) => {
    setBannerTitle(title);
    setBannerMessage(message);
    setShowBanner(true);
    bannerAnim.setValue(-100);

    Animated.sequence([
      Animated.timing(bannerAnim, {
        toValue: 0,
        duration: 350,
        easing: Easing.out(Easing.back(1.2)),
        useNativeDriver: true,
      }),
      Animated.delay(3500),
      Animated.timing(bannerAnim, {
        toValue: -100,
        duration: 300,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowBanner(false);
    });
  };

  const handleRescheduleConfirm = (apptId: string, newDate: string, newStartTime: string, newEndTime: string) => {
    setShowReschedule(false);
    if (onReschedule) {
      onReschedule(apptId, newDate, newStartTime, newEndTime);
    }
    const formatDateStr = (dateStr: string) => {
      const d = new Date(dateStr + 'T12:00:00');
      return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    };
    showNotificationBanner(
      'Appointment Rescheduled',
      `Rescheduled to ${formatDateStr(newDate)} at ${formatTimeDisplay(newStartTime)}`
    );
  };

  const handleBulkRescheduleConfirm = (recurrenceId: string, fromDate: string, shifts: { oldDay: number; newDay: number; newTime: string }[], count: number) => {
    setShowReschedule(false);
    if (onBulkReschedule) {
      onBulkReschedule(recurrenceId, fromDate, shifts);
    }
    showNotificationBanner(
      'Series Rescheduled',
      `${count} future appointments have been updated`
    );
  };

  if (!appointment) return null;

  // ── Permission: coaches can only manage their own appointments ──
  const isCoachRole = userRole === 'trainer' || userRole === 'dietitian';
  // Match by coachId first (most reliable), then fall back to name matching
  const isOwnAppointment = !!(
    (userCoachId && appointment.coachId === userCoachId) ||
    (userCoachName && appointment.coachName === userCoachName)
  );
  // Admins and franchise managers can manage any appointment; coaches only their own
  const canManageAppointment = !isCoachRole || isOwnAppointment;


  const apptType = appointmentTypes.find(t => t.id === appointment.appointmentTypeId);
  const color = apptType?.color || '#999';
  const program = getProgramDefinition(appointment.clientProgram);
  const programColor = getProgramColor(appointment.clientProgram);
  const isTrainingSession = apptType?.category === 'training';
  const canReschedule = appointment.status !== 'cancelled' && appointment.status !== 'completed';

  const clientAddress = clientData?.address || null;

  const statusConfig: Record<string, { label: string; color: string; icon: string }> = {
    scheduled: { label: 'Scheduled', color: '#f39c12', icon: 'time' },
    confirmed: { label: 'Confirmed', color: '#2ecc71', icon: 'checkmark-circle' },
    completed: { label: 'Completed', color: '#3498db', icon: 'checkmark-done-circle' },
    'no-show': { label: 'No Show', color: '#e74c3c', icon: 'close-circle' },
    cancelled: { label: 'Cancelled', color: '#95a5a6', icon: 'ban' },
  };

  const currentStatus = statusConfig[appointment.status] || statusConfig.scheduled;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  };

  const handleReschedulePress = () => {
    if (isRecurring) {
      setEditChoiceAction('reschedule');
      setShowEditChoice(true);
    } else {
      setRescheduleMode('single');
      setShowReschedule(true);
    }
  };

  const handleEditChoice = (choice: RecurringEditChoice) => {
    setShowEditChoice(false);
    if (choice === 'cancel') return;

    if (editChoiceAction === 'reschedule') {
      setRescheduleMode(choice === 'this' ? 'single' : 'future');
      setShowReschedule(true);
    } else if (editChoiceAction === 'cancel') {
      if (choice === 'this') {
        onUpdateStatus(appointment.id, 'cancelled');
        onClose();
      } else if (choice === 'future' && onBulkCancel && appointment.recurrenceId) {
        onBulkCancel(appointment.recurrenceId, appointment.date);
        showNotificationBanner('Series Cancelled', `${futureInstances.length} future appointments cancelled`);
      }
    } else if (editChoiceAction === 'delete') {
      if (choice === 'this') {
        Alert.alert(
          'Delete This Appointment',
          'This will permanently remove this single appointment from the series. Continue?',
          [
            { text: 'Keep', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => {
                onDelete(appointment.id);
                onClose();
              },
            },
          ]
        );
      } else if (choice === 'future' && onBulkDelete && appointment.recurrenceId) {
        const count = futureInstances.length;
        Alert.alert(
          'Delete Entire Series',
          `This will permanently remove ${count > 0 ? count : 'all'} upcoming appointment${count !== 1 ? 's' : ''} in this recurring series. This action cannot be undone.\n\nAre you sure you want to continue?`,
          [
            { text: 'Keep Series', style: 'cancel' },
            {
              text: `Delete ${count > 0 ? count : 'All'} Appointment${count !== 1 ? 's' : ''}`,
              style: 'destructive',
              onPress: () => {
                onBulkDelete(appointment.recurrenceId!, appointment.date);
                onClose();
              },
            },
          ]
        );
      }
    }

  };

  const handleStatusChange = (newStatus: Appointment['status']) => {
    if (newStatus === 'cancelled') {
      if (isRecurring) {
        setEditChoiceAction('cancel');
        setShowEditChoice(true);
        return;
      }
      Alert.alert(
        'Cancel Appointment',
        `Are you sure you want to cancel this appointment with ${appointment.clientName}?`,
        [
          { text: 'Keep', style: 'cancel' },
          { text: 'Cancel Appointment', style: 'destructive', onPress: () => { onUpdateStatus(appointment.id, newStatus); onClose(); } },
        ]
      );
    } else {
      onUpdateStatus(appointment.id, newStatus);
      onClose();
    }

  };

  const handleDelete = () => {
    if (isRecurring) {
      setEditChoiceAction('delete');
      setShowEditChoice(true);
      return;
    }
    Alert.alert(
      'Delete Appointment',
      'This will permanently remove this appointment. Continue?',
      [
        { text: 'Keep', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => { onDelete(appointment.id); onClose(); } },
      ]
    );
  };

  const handleOpenMaps = () => {
    if (clientAddress) openAddressInMaps(clientAddress);
  };

  const handleCopyAddress = () => {
    if (clientAddress) {
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          navigator.clipboard.writeText(clientAddress);
          Alert.alert('Copied', 'Address copied to clipboard');
        } else {
          Alert.alert('Client Address', clientAddress);
        }
      } catch {
        Alert.alert('Client Address', clientAddress);
      }
    }
  };


  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Notification Banner */}
        {showBanner && (
          <Animated.View style={[styles.notificationBanner, { transform: [{ translateY: bannerAnim }] }]}>
            <View style={styles.bannerContent}>
              <View style={styles.bannerIconWrap}>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.white} />
              </View>
              <View style={styles.bannerTextWrap}>
                <Text style={styles.bannerTitleText}>{bannerTitle}</Text>
                <Text style={styles.bannerMessage}>{bannerMessage}</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  Animated.timing(bannerAnim, {
                    toValue: -100,
                    duration: 200,
                    useNativeDriver: true,
                  }).start(() => setShowBanner(false));
                }}
                style={styles.bannerClose}
              >
                <Ionicons name="close" size={16} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Appointment Details</Text>
          {canManageAppointment ? (
            <TouchableOpacity onPress={handleDelete}>
              <Ionicons name="trash-outline" size={22} color={COLORS.danger} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 22 }} />
          )}
        </View>

        {/* Read-only notice for coaches viewing another coach's appointment */}
        {!canManageAppointment && (
          <View style={styles.readOnlyBanner}>
            <Ionicons name="lock-closed" size={14} color={COLORS.textMuted} />
            <Text style={styles.readOnlyBannerText}>
              View only — this appointment belongs to {appointment.coachName}
            </Text>
          </View>
        )}


        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Type Banner */}
          <View style={[styles.typeBanner, { backgroundColor: color + '14' }]}>
            <View style={[styles.typeIconLg, { backgroundColor: color + '22' }]}>
              <Ionicons name={(apptType?.icon || 'calendar') as any} size={28} color={color} />
            </View>
            <Text style={[styles.typeName, { color }]}>{apptType?.name || 'Appointment'}</Text>
            <Text style={styles.typeDesc}>{apptType?.description}</Text>
            <View style={styles.badgeRow}>
              <View style={[styles.statusBadge, { backgroundColor: currentStatus.color + '18' }]}>
                <Ionicons name={currentStatus.icon as any} size={14} color={currentStatus.color} />
                <Text style={[styles.statusText, { color: currentStatus.color }]}>{currentStatus.label}</Text>
              </View>
              <View style={[styles.durationBadge, { backgroundColor: color + '18' }]}>
                <Ionicons name="time-outline" size={12} color={color} />
                <Text style={[styles.durationBadgeText, { color }]}>{appointment.duration} min</Text>
              </View>
              {apptType?.countsAsSession && (
                <View style={[styles.sessionRedeemBadge, { backgroundColor: programColor + '18' }]}>
                  <Ionicons name="ticket" size={12} color={programColor} />
                  <Text style={[styles.sessionRedeemText, { color: programColor }]}>Redeems Session</Text>
                </View>
              )}
            </View>
          </View>

          {/* Recurring Series Badge */}
          {isRecurring && (
            <View style={styles.recurringBadgeSection}>
              <View style={styles.recurringBadge}>
                <View style={styles.recurringBadgeIcon}>
                  <Ionicons name="repeat" size={16} color={COLORS.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.recurringBadgeTitle}>Recurring Series</Text>
                  <Text style={styles.recurringBadgeDesc}>{recurrenceDesc}</Text>
                  {futureInstances.length > 0 && (
                    <Text style={styles.recurringBadgeCount}>
                      {futureInstances.length} upcoming instance{futureInstances.length !== 1 ? 's' : ''}
                    </Text>
                  )}
                </View>
                {appointment.isRecurrenceException && (
                  <View style={styles.exceptionBadge}>
                    <Ionicons name="alert-circle" size={10} color={COLORS.warning} />
                    <Text style={styles.exceptionText}>Modified</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Inline biometric-due reminder chip — shown when this training session
              has an overlapping biometric-assessment that hasn't been completed yet.
              Tapping opens the BiometricEntryForm pre-filled for the client. */}
          {isTrainingSession &&
           inSessionBiometric &&
           inSessionBiometric.status !== 'completed' &&
           inSessionBiometric.status !== 'cancelled' &&
           onLogBiometric && (
            <View style={styles.biometricChipSection}>
              <TouchableOpacity
                style={styles.biometricChip}
                onPress={() => {
                  onLogBiometric(inSessionBiometric);
                  onClose();
                }}
                activeOpacity={0.75}
              >
                <View style={styles.biometricChipIcon}>
                  <Ionicons name="body" size={18} color={COLORS.white} />
                </View>
                <View style={styles.biometricChipContent}>
                  <Text style={styles.biometricChipTitle}>
                    Biometric assessment due this session
                  </Text>
                  <Text style={styles.biometricChipSub}>
                    Tap to log weight, body fat & measurements for {appointment.clientName}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.white + 'CC'} />
              </TouchableOpacity>
            </View>
          )}


          {/* Video Call Card */}
          {!!appointment.videoCallLink && (
            <View style={styles.videoCallCard}>
              <View style={styles.videoCallCardHeader}>
                <View style={styles.videoCallIconWrap}>
                  <Ionicons name="videocam" size={18} color="#9b59b6" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.videoCallCardTitle}>Video Call</Text>
                  <Text style={styles.videoCallCardSubtitle}>Jitsi Meet</Text>
                </View>
                <View style={styles.videoCallLiveBadge}>
                  <View style={styles.videoCallLiveDot} />
                  <Text style={styles.videoCallLiveText}>Ready</Text>
                </View>
              </View>

              <Text style={styles.videoCallLinkText} numberOfLines={1}>
                {appointment.videoCallLink}
              </Text>

              <View style={styles.videoCallActions}>
                <TouchableOpacity
                  style={styles.videoCallJoinBtn}
                  onPress={() => {
                    Linking.openURL(appointment.videoCallLink!).catch(() => {
                      Alert.alert('Error', 'Could not open the video call link.');
                    });
                  }}
                >
                  <Ionicons name="videocam" size={16} color={COLORS.white} />
                  <Text style={styles.videoCallJoinBtnText}>Join Video Call</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.videoCallCopyBtn}
                  onPress={() => {
                    try {
                      if (typeof navigator !== 'undefined' && navigator.clipboard) {
                        navigator.clipboard.writeText(appointment.videoCallLink!);
                        Alert.alert('Copied', 'Video call link copied to clipboard');
                      } else {
                        Alert.alert('Video Call Link', appointment.videoCallLink!);
                      }
                    } catch {
                      Alert.alert('Video Call Link', appointment.videoCallLink!);
                    }
                  }}
                >
                  <Ionicons name="copy-outline" size={14} color="#9b59b6" />
                  <Text style={styles.videoCallCopyBtnText}>Copy Link</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}


          {canManageAppointment && canReschedule && onReschedule && (
            <View style={styles.rescheduleSection}>
              <TouchableOpacity
                style={styles.rescheduleBtn}
                onPress={handleReschedulePress}
              >
                <View style={styles.rescheduleBtnIcon}>
                  <Ionicons name="calendar-outline" size={18} color={COLORS.white} />
                </View>
                <View style={styles.rescheduleBtnContent}>
                  <Text style={styles.rescheduleBtnTitle}>
                    {isRecurring ? 'Reschedule Series' : 'Reschedule Appointment'}
                  </Text>
                  <Text style={styles.rescheduleBtnSub}>
                    {isRecurring ? 'Move this or all future sessions' : 'Change date or time for this session'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.white + '80'} />
              </TouchableOpacity>
            </View>
          )}


          {/* Session Balance Card */}
          {apptType?.countsAsSession && program && sessionBalance && (
            <View style={[styles.sessionCard, { borderColor: programColor + '30' }]}>
              <View style={styles.sessionCardHeader}>
                <Ionicons name="ticket-outline" size={16} color={programColor} />
                <Text style={[styles.sessionCardTitle, { color: programColor }]}>
                  Weekly Session Balance
                </Text>
              </View>
              <View style={styles.sessionBarRow}>
                <View style={styles.sessionBarBg}>
                  <View style={[styles.sessionBarFill, {
                    backgroundColor: programColor,
                    width: `${Math.min(100, (sessionBalance.used / sessionBalance.allowed) * 100)}%`,
                  }]} />
                </View>
                <Text style={styles.sessionBarText}>
                  {sessionBalance.used}/{sessionBalance.allowed}
                </Text>
              </View>
              <Text style={styles.sessionCardSub}>
                {appointment.clientProgram} — {program.sessionsPerWeek} training sessions/week · ${program.monthlyCost.toLocaleString()}/mo
              </Text>
            </View>
          )}

          {/* Client Address Card (Training Sessions Only) */}
          {isTrainingSession && (
            <View style={styles.addressCard}>
              <View style={styles.addressCardHeader}>
                <View style={styles.addressIconWrap}>
                  <Ionicons name="location" size={18} color={COLORS.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.addressCardTitle}>Training Location</Text>
                  <Text style={styles.addressCardSubtitle}>Client Address</Text>
                </View>
                {isTrainingSession && (
                  <View style={[styles.trainingBadge, { backgroundColor: color + '14' }]}>
                    <Ionicons name="fitness" size={10} color={color} />
                    <Text style={[styles.trainingBadgeText, { color }]}>
                      {apptType?.shortName}
                    </Text>
                  </View>
                )}
              </View>

              {clientAddress ? (
                <>
                  <Text style={styles.addressText}>{clientAddress}</Text>
                  <View style={styles.addressActions}>
                    <TouchableOpacity style={styles.addressActionBtn} onPress={handleOpenMaps}>
                      <Ionicons name="navigate" size={14} color={COLORS.white} />
                      <Text style={styles.addressActionBtnText}>Open in Maps</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.addressActionBtnOutline} onPress={handleCopyAddress}>
                      <Ionicons name="copy-outline" size={14} color={COLORS.accent} />
                      <Text style={styles.addressActionBtnOutlineText}>Copy</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <View style={styles.noAddressWrap}>
                  <Ionicons name="alert-circle-outline" size={16} color={COLORS.textMuted} />
                  <Text style={styles.noAddressText}>
                    No address on file for {appointment.clientName}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Details */}
          <View style={styles.detailsCard}>
            <DetailRow icon="calendar-outline" label="Date" value={formatDate(appointment.date)} />
            <View style={styles.divider} />
            <DetailRow
              icon="time-outline"
              label="Time"
              value={`${formatTimeDisplay(appointment.startTime)} - ${formatTimeDisplay(appointment.endTime)}`}
            />
            <View style={styles.divider} />
            <DetailRow icon="hourglass-outline" label="Duration" value={`${appointment.duration} minutes`} />
            <View style={styles.divider} />
            <DetailRow
              icon={appointment.coachType === 'trainer' ? 'fitness-outline' : 'nutrition-outline'}
              label={appointment.coachType === 'trainer' ? 'Trainer' : 'Dietitian'}
              value={appointment.coachName}
            />
            <View style={styles.divider} />
            <DetailRow icon="person-outline" label="Client" value={appointment.clientName} />
            <View style={styles.divider} />
            <DetailRow icon="ribbon-outline" label="Program" value={appointment.clientProgram} />
            <View style={styles.divider} />
            <DetailRow icon="business-outline" label="Franchise" value={appointment.franchise} />
            {isRecurring && (
              <>
                <View style={styles.divider} />
                <DetailRow icon="repeat-outline" label="Recurrence" value={recurrenceDesc} />
              </>
            )}
            {appointment.notes ? (
              <>
                <View style={styles.divider} />
                <DetailRow icon="document-text-outline" label="Notes" value={appointment.notes} />
              </>
            ) : null}
          </View>

          {/* Status Actions - hide cancel button for coaches viewing other coaches' appointments */}
          {appointment.status !== 'cancelled' && appointment.status !== 'completed' && (
            <View style={styles.statusSection}>
              <Text style={styles.sectionTitle}>Update Status</Text>
              <View style={styles.statusGrid}>
                {canManageAppointment && (
                  <TouchableOpacity
                    style={[styles.statusBtn, { borderColor: '#e74c3c' }]}
                    onPress={() => handleStatusChange('no-show')}
                  >
                    <Ionicons name="close-circle" size={18} color="#e74c3c" />
                    <Text style={[styles.statusBtnText, { color: '#e74c3c' }]}>No Show</Text>
                  </TouchableOpacity>
                )}
                {canManageAppointment && (
                  <TouchableOpacity
                    style={[styles.statusBtn, { borderColor: '#3498db' }]}
                    onPress={() => handleStatusChange('completed')}
                  >
                    <Ionicons name="checkmark-done-circle" size={18} color="#3498db" />
                    <Text style={[styles.statusBtnText, { color: '#3498db' }]}>Complete</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}



          {/* Add to Calendar Section */}
          <View style={styles.calendarSection}>
            <Text style={styles.sectionTitle}>Add to Calendar</Text>
            <View style={styles.calendarGrid}>
              <TouchableOpacity
                style={styles.calendarBtn}
                onPress={() => {
                  const url = generateGoogleCalendarURL(appointment);
                  if (Platform.OS === 'web') {
                    window.open(url, '_blank');
                  } else {
                    Linking.openURL(url);
                  }
                }}
              >
                <View style={[styles.calendarBtnIcon, { backgroundColor: '#4285F410' }]}>
                  <Ionicons name="logo-google" size={18} color="#4285F4" />
                </View>
                <Text style={styles.calendarBtnText}>Google Calendar</Text>
                <Ionicons name="open-outline" size={14} color={COLORS.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.calendarBtn}
                onPress={() => {
                  const icsContent = isRecurring
                    ? generateRecurringSeriesICS(appointment)
                    : generateSingleEventICS(appointment);
                  const filename = `${appointment.clientName.replace(/\s+/g, '_')}_${appointment.date}.ics`;
                  downloadICSFile(icsContent, filename);
                  showNotificationBanner('Exported', `Calendar file downloaded: ${filename}`);
                }}
              >
                <View style={[styles.calendarBtnIcon, { backgroundColor: '#33333310' }]}>
                  <Ionicons name="logo-apple" size={18} color="#333333" />
                </View>
                <Text style={styles.calendarBtnText}>Apple Calendar (.ics)</Text>
                <Ionicons name="download-outline" size={14} color={COLORS.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.calendarBtn}
                onPress={() => {
                  const icsContent = isRecurring
                    ? generateRecurringSeriesICS(appointment)
                    : generateSingleEventICS(appointment);
                  const filename = `${appointment.clientName.replace(/\s+/g, '_')}_${appointment.date}.ics`;
                  downloadICSFile(icsContent, filename);
                  showNotificationBanner('Exported', `Calendar file downloaded: ${filename}`);
                }}
              >
                <View style={[styles.calendarBtnIcon, { backgroundColor: '#0078D410' }]}>
                  <Ionicons name="mail" size={18} color="#0078D4" />
                </View>
                <Text style={styles.calendarBtnText}>Outlook (.ics)</Text>
                <Ionicons name="download-outline" size={14} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ height: 40 }} />

        </ScrollView>

        {/* Reschedule Modal */}
        <RescheduleModal
          visible={showReschedule}
          appointment={appointment}
          existingAppointments={existingAppointments}
          onClose={() => setShowReschedule(false)}
          onConfirm={handleRescheduleConfirm}
          mode={rescheduleMode}
          onBulkConfirm={handleBulkRescheduleConfirm}
        />

        {/* Recurring Edit Choice Modal */}
        <RecurringEditChoiceModal
          visible={showEditChoice}
          onClose={() => setShowEditChoice(false)}
          onChoice={handleEditChoice}
          action={editChoiceAction}
          instanceCount={futureInstances.length}
        />
      </View>
    </Modal>
  );
}

function DetailRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <Ionicons name={icon as any} size={16} color={COLORS.accent} />
      </View>
      <View style={styles.detailContent}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  notificationBanner: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100,
    backgroundColor: COLORS.success, paddingTop: 8, paddingBottom: SPACING.md, paddingHorizontal: SPACING.lg,
    ...SHADOWS.lg,
  },
  bannerContent: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  bannerIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  bannerTextWrap: { flex: 1 },
  bannerTitleText: { fontSize: FONT_SIZES.sm, fontWeight: '800', color: COLORS.white },
  bannerMessage: { fontSize: FONT_SIZES.xs, color: 'rgba(255,255,255,0.9)', marginTop: 1 },
  bannerClose: { padding: 4 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTitle: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.primary },
  scroll: { flex: 1 },
  typeBanner: { alignItems: 'center', paddingVertical: SPACING.xl, paddingHorizontal: SPACING.lg, gap: SPACING.sm },
  typeIconLg: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  typeName: { fontSize: FONT_SIZES.xl, fontWeight: '800' },
  typeDesc: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, textAlign: 'center' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: 4, justifyContent: 'center' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: SPACING.md, paddingVertical: 4, borderRadius: BORDER_RADIUS.full },
  statusText: { fontSize: FONT_SIZES.sm, fontWeight: '700' },
  durationBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: BORDER_RADIUS.full },
  durationBadgeText: { fontSize: FONT_SIZES.xs, fontWeight: '700' },
  sessionRedeemBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: BORDER_RADIUS.full },
  sessionRedeemText: { fontSize: FONT_SIZES.xs, fontWeight: '700' },
  // Recurring badge
  recurringBadgeSection: { paddingHorizontal: SPACING.lg, marginBottom: SPACING.md },
  recurringBadge: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.accent + '08', borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.accent + '20',
  },
  recurringBadgeIcon: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.accent + '14',
    alignItems: 'center', justifyContent: 'center',
  },
  recurringBadgeTitle: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.accent },
  recurringBadgeDesc: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, marginTop: 1 },
  recurringBadgeCount: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
  exceptionBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: COLORS.warningLight, paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },
  exceptionText: { fontSize: 9, fontWeight: '700', color: COLORS.warning },
  // Reschedule button
  rescheduleSection: { paddingHorizontal: SPACING.lg, marginBottom: SPACING.md },
  rescheduleBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.accent,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, gap: SPACING.md, ...SHADOWS.md,
  },
  rescheduleBtnIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  rescheduleBtnContent: { flex: 1 },
  rescheduleBtnTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.white },
  rescheduleBtnSub: { fontSize: FONT_SIZES.xs, color: 'rgba(255,255,255,0.75)', marginTop: 1 },
  // Session balance card
  sessionCard: { marginHorizontal: SPACING.lg, marginBottom: SPACING.md, backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, borderWidth: 1, ...SHADOWS.sm },
  sessionCardHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  sessionCardTitle: { fontSize: FONT_SIZES.sm, fontWeight: '700' },
  sessionBarRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: 6 },
  sessionBarBg: { flex: 1, height: 8, backgroundColor: COLORS.borderLight, borderRadius: 4, overflow: 'hidden' },
  sessionBarFill: { height: '100%', borderRadius: 4 },
  sessionBarText: { fontSize: FONT_SIZES.sm, fontWeight: '800', color: COLORS.primary, minWidth: 30, textAlign: 'right' },
  sessionCardSub: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted },
  // Address card
  addressCard: { marginHorizontal: SPACING.lg, marginBottom: SPACING.md, backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.accent + '25', ...SHADOWS.sm },
  addressCardHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  addressIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.accent + '14', alignItems: 'center', justifyContent: 'center' },
  addressCardTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.primary },
  addressCardSubtitle: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 1 },
  trainingBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: BORDER_RADIUS.full },
  trainingBadgeText: { fontSize: 10, fontWeight: '700' },
  addressText: { fontSize: FONT_SIZES.md, fontWeight: '600', color: COLORS.primary, lineHeight: 22, marginBottom: SPACING.md, paddingLeft: 2 },
  addressActions: { flexDirection: 'row', gap: SPACING.sm },
  addressActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.accent, paddingVertical: SPACING.sm + 2, borderRadius: BORDER_RADIUS.md },
  addressActionBtnText: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.white },
  addressActionBtnOutline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm + 2, borderRadius: BORDER_RADIUS.md, borderWidth: 1.5, borderColor: COLORS.accent },
  addressActionBtnOutlineText: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.accent },
  noAddressWrap: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.borderLight, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm + 2, borderRadius: BORDER_RADIUS.md },
  noAddressText: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted, fontWeight: '500', flex: 1 },
  // Details
  detailsCard: { backgroundColor: COLORS.white, marginHorizontal: SPACING.lg, borderRadius: BORDER_RADIUS.lg, ...SHADOWS.sm },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', padding: SPACING.md, gap: SPACING.md },
  detailIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.accent + '12', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  detailContent: { flex: 1 },
  detailLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '500' },
  detailValue: { fontSize: FONT_SIZES.md, color: COLORS.primary, fontWeight: '600', marginTop: 1 },
  divider: { height: 1, backgroundColor: COLORS.borderLight, marginLeft: 56 },
  statusSection: { marginTop: SPACING.xl, paddingHorizontal: SPACING.lg },
  sectionTitle: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.primary, marginBottom: SPACING.md },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  statusBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm + 2, borderRadius: BORDER_RADIUS.md, borderWidth: 1.5, backgroundColor: COLORS.white },
  statusBtnText: { fontSize: FONT_SIZES.sm, fontWeight: '700' },
  // Read-only banner for coaches viewing other coaches' appointments
  readOnlyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.borderLight,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  readOnlyBannerText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
    flex: 1,
  },
  // Calendar section
  calendarSection: {
    marginTop: SPACING.xl,
    paddingHorizontal: SPACING.lg,
  },
  calendarGrid: {
    gap: SPACING.sm,
  },
  calendarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...SHADOWS.sm,
  },
  calendarBtnIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarBtnText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.primary,
  },

  // Video Call card
  videoCallCard: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: '#9b59b6' + '25',
    ...SHADOWS.sm,
  },
  videoCallCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  videoCallIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#9b59b6' + '14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoCallCardTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.primary,
  },
  videoCallCardSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  videoCallLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2ecc71' + '14',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },
  videoCallLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2ecc71',
  },
  videoCallLiveText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2ecc71',
  },
  videoCallLinkText: {
    fontSize: FONT_SIZES.xs,
    color: '#9b59b6',
    fontWeight: '500',
    backgroundColor: '#9b59b6' + '08',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.sm,
    marginBottom: SPACING.md,
    overflow: 'hidden',
  },
  videoCallActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  videoCallJoinBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#9b59b6',
    paddingVertical: SPACING.sm + 2,
    borderRadius: BORDER_RADIUS.md,
  },
  videoCallJoinBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.white,
  },
  videoCallCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm + 2,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5,
    borderColor: '#9b59b6',
  },
  videoCallCopyBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: '#9b59b6',
  },


  // ── Inline biometric reminder chip (shown on training sessions that have an
  //    overlapping biometric assessment on the same date for the same client). ──
  biometricChipSection: {
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  biometricChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: '#2563eb',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    ...SHADOWS.md,
  },
  biometricChipIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  biometricChipContent: { flex: 1 },
  biometricChipTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '800',
    color: COLORS.white,
  },
  biometricChipSub: {
    fontSize: FONT_SIZES.xs,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
});







