import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  ScrollView, Alert, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import {
  fetchCycleAttendance,
  groupSessionsByWeek,
  type CycleAttendanceData,
  type WeekGroup,
  type CycleSession,
} from '../../lib/attendanceService';
import { updateAppointmentStatus } from '../../lib/appointmentService';

// ── Status Colors ────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  completed: '#2ecc71',
  missed: '#e74c3c',
  'no-show': '#e74c3c',
  cancelled: '#f39c12',
  scheduled: '#3498db',
  confirmed: '#3498db',
  empty: COLORS.borderLight,
  future: '#dfe6ed',
};

const TIER_COLORS: Record<string, string> = {
  Platinum: '#8B5CF6',
  Gold: '#F59E0B',
  Silver: '#94A3B8',
  Bronze: '#B45309',
  Unknown: COLORS.textMuted,
};

// Status options for quick-change
const STATUS_OPTIONS: { key: string; label: string; icon: string; color: string }[] = [
  { key: 'completed', label: 'Complete', icon: 'checkmark-circle', color: '#2ecc71' },
  { key: 'no-show', label: 'No-Show', icon: 'close-circle', color: '#e74c3c' },
  { key: 'cancelled', label: 'Cancel', icon: 'ban', color: '#f39c12' },
  { key: 'scheduled', label: 'Scheduled', icon: 'time', color: '#3498db' },
];

// ── Props ────────────────────────────────────────────────────────────────────

interface SessionAttendancePanelProps {
  clientId: string;
  /** Compact mode for embedding in dashboards */
  compact?: boolean;
  /** Called when data loads successfully */
  onDataLoaded?: (data: CycleAttendanceData) => void;
  /** Called when a session status is changed from this panel */
  onStatusChanged?: (appointmentId: string, newStatus: string) => void;
}

export default function SessionAttendancePanel({
  clientId,
  compact = false,
  onDataLoaded,
  onStatusChanged,
}: SessionAttendancePanelProps) {
  const router = useRouter();
  const [data, setData] = useState<CycleAttendanceData | null>(null);
  const [weeks, setWeeks] = useState<WeekGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedWeek, setExpandedWeek] = useState<number | null>(null);
  // Track which session is being status-changed
  const [changingStatusId, setChangingStatusId] = useState<string | null>(null);
  // Track which session has its status picker open
  const [statusPickerSessionId, setStatusPickerSessionId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchCycleAttendance(clientId);
      if (result.error) {
        setError(result.error);
      } else if (result.data) {
        setData(result.data);
        setWeeks(groupSessionsByWeek(result.data));
        if (onDataLoaded) onDataLoaded(result.data);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load attendance data');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Status change handler ──
  const handleStatusChange = useCallback(async (session: CycleSession, newStatus: string) => {
    if (!session.id || changingStatusId) return;

    // Confirm destructive changes
    const confirmNeeded = newStatus === 'cancelled' || newStatus === 'no-show';
    if (confirmNeeded) {
      const statusLabel = newStatus === 'cancelled' ? 'cancel' : 'mark as no-show';
      const doChange = await new Promise<boolean>((resolve) => {
        if (Platform.OS === 'web') {
          const confirmed = typeof window !== 'undefined' && window.confirm(
            `Are you sure you want to ${statusLabel} this session on ${formatShortDate(session.date)} at ${formatTime(session.startTime)}?`
          );
          resolve(!!confirmed);
        } else {
          Alert.alert(
            'Confirm Status Change',
            `Are you sure you want to ${statusLabel} this session on ${formatShortDate(session.date)} at ${formatTime(session.startTime)}?`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Confirm', style: 'destructive', onPress: () => resolve(true) },
            ]
          );
        }
      });
      if (!doChange) return;
    }

    setChangingStatusId(session.id);
    setStatusPickerSessionId(null);

    try {
      const { error: updateError } = await updateAppointmentStatus(session.id, newStatus as any);
      if (updateError) {
        console.error('Status change error:', updateError);
        if (Platform.OS === 'web') {
          typeof window !== 'undefined' && window.alert(`Failed to update status: ${updateError}`);
        } else {
          Alert.alert('Error', `Failed to update status: ${updateError}`);
        }
      } else {
        // Notify parent
        if (onStatusChanged) onStatusChanged(session.id, newStatus);
        // Reload attendance data to reflect the change
        await loadData();
      }
    } catch (err: any) {
      console.error('Status change exception:', err);
    } finally {
      setChangingStatusId(null);
    }
  }, [changingStatusId, loadData, onStatusChanged]);

  // ── Navigate to schedule for a specific date ──
  const navigateToSchedule = useCallback((dateStr: string) => {
    try {
      // Navigate to the schedule tab — the schedule page will show this date
      router.push('/(tabs)/schedule');
    } catch (err) {
      console.log('Navigation error:', err);
    }
  }, [router]);

  if (loading) {
    return (
      <View style={[styles.container, compact && styles.containerCompact]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={COLORS.accent} />
          <Text style={styles.loadingText}>Loading attendance...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, compact && styles.containerCompact]}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={24} color={COLORS.textMuted} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadData} activeOpacity={0.7}>
            <Ionicons name="refresh-outline" size={14} color={COLORS.accent} />
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!data || !data.cycleStartDate) {
    return (
      <View style={[styles.container, compact && styles.containerCompact]}>
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIcon}>
            <Ionicons name="calendar-outline" size={28} color={COLORS.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No Active Program Cycle</Text>
          <Text style={styles.emptyText}>
            {data?.error || 'A program start date is needed to track attendance.'}
          </Text>
        </View>
      </View>
    );
  }

  const tierColor = TIER_COLORS[data.tier] || COLORS.textMuted;
  const { stats } = data;

  // Format date for display
  const formatShortDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatFullDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const renderSessionDot = (session: CycleSession, index: number) => {
    const color = STATUS_COLORS[session.status] || STATUS_COLORS.empty;
    const iconName = session.status === 'completed' ? 'checkmark' :
      session.status === 'missed' || session.status === 'no-show' ? 'close' :
      session.status === 'cancelled' ? 'remove' :
      'time-outline';

    return (
      <View key={session.id || `s-${index}`} style={[styles.sessionDot, { backgroundColor: color + '20', borderColor: color }]}>
        <Ionicons name={iconName as any} size={10} color={color} />
      </View>
    );
  };

  const renderEmptySlot = (index: number, weekStatus: string) => {
    const color = weekStatus === 'future' ? STATUS_COLORS.future : STATUS_COLORS.empty;
    return (
      <View key={`empty-${index}`} style={[styles.sessionDot, styles.sessionDotEmpty, { backgroundColor: color, borderColor: color }]} />
    );
  };

  const renderExpandedSession = (session: CycleSession, idx: number) => {
    const statusColor = STATUS_COLORS[session.status] || COLORS.textMuted;
    const isChanging = changingStatusId === session.id;
    const isPickerOpen = statusPickerSessionId === session.id;
    const isPast = session.date <= new Date().toISOString().split('T')[0];
    const canChangeStatus = !!session.id && !isChanging;

    return (
      <View key={session.id || idx} style={styles.expandedSessionCard}>
        {/* Main session row */}
        <View style={styles.expandedSessionRow}>
          <View style={[styles.expandedDotLarge, { backgroundColor: statusColor }]}>
            <Ionicons
              name={
                session.status === 'completed' ? 'checkmark' :
                session.status === 'missed' || session.status === 'no-show' ? 'close' :
                session.status === 'cancelled' ? 'remove' :
                'time-outline'
              }
              size={10}
              color="#fff"
            />
          </View>

          <View style={styles.expandedSessionInfo}>
            <View style={styles.expandedSessionTopRow}>
              <Text style={styles.expandedDateFull}>{formatFullDate(session.date)}</Text>
              <View style={[styles.expandedStatusBadge, { backgroundColor: statusColor + '15' }]}>
                <Text style={[styles.expandedStatusText, { color: statusColor }]}>
                  {session.status === 'no-show' ? 'No-Show' : session.status}
                </Text>
              </View>
            </View>

            <View style={styles.expandedSessionMeta}>
              <View style={styles.metaItem}>
                <Ionicons name="time-outline" size={11} color={COLORS.textMuted} />
                <Text style={styles.metaText}>{formatTime(session.startTime)}</Text>
              </View>
              {session.coachName ? (
                <View style={styles.metaItem}>
                  <Ionicons name="person-outline" size={11} color={COLORS.textMuted} />
                  <Text style={styles.metaText}>{session.coachName}</Text>
                </View>
              ) : null}
              <View style={styles.metaItem}>
                <Ionicons name="hourglass-outline" size={11} color={COLORS.textMuted} />
                <Text style={styles.metaText}>{session.duration}m</Text>
              </View>
            </View>
          </View>

          {/* Actions: status change toggle + schedule link */}
          <View style={styles.expandedActions}>
            {isChanging ? (
              <ActivityIndicator size="small" color={COLORS.accent} />
            ) : (
              <>
                {canChangeStatus && (
                  <TouchableOpacity
                    style={[styles.actionBtn, isPickerOpen && styles.actionBtnActive]}
                    onPress={() => setStatusPickerSessionId(isPickerOpen ? null : session.id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="swap-horizontal"
                      size={14}
                      color={isPickerOpen ? COLORS.white : COLORS.accent}
                    />
                  </TouchableOpacity>
                )}

              </>
            )}
          </View>
        </View>

        {/* Status picker row — shown when toggle is open */}
        {isPickerOpen && (
          <View style={styles.statusPickerRow}>
            <Text style={styles.statusPickerLabel}>Change status:</Text>
            <View style={styles.statusPickerOptions}>
              {STATUS_OPTIONS.map(opt => {
                const isCurrentStatus = session.status === opt.key || (session.status === 'missed' && opt.key === 'no-show');
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[
                      styles.statusPickerBtn,
                      { borderColor: opt.color + '40' },
                      isCurrentStatus && { backgroundColor: opt.color + '15', borderColor: opt.color },
                    ]}
                    onPress={() => {
                      if (!isCurrentStatus) {
                        handleStatusChange(session, opt.key);
                      }
                    }}
                    disabled={isCurrentStatus}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={opt.icon as any} size={12} color={opt.color} />
                    <Text style={[styles.statusPickerBtnText, { color: opt.color }]}>
                      {opt.label}
                    </Text>
                    {isCurrentStatus && (
                      <Ionicons name="checkmark" size={10} color={opt.color} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Notes */}
        {session.notes ? (
          <View style={styles.sessionNotes}>
            <Ionicons name="document-text-outline" size={10} color={COLORS.textMuted} />
            <Text style={styles.sessionNotesText} numberOfLines={2}>{session.notes}</Text>
          </View>
        ) : null}
      </View>
    );
  };

  const renderWeekRow = (week: WeekGroup) => {
    const isCurrentWeek = week.status === 'current';
    const isExpanded = expandedWeek === week.weekNumber;
    const completedInWeek = week.sessions.filter(s => s.status === 'completed').length;
    const totalSlots = week.expectedSessions;

    // Build slots: fill with sessions, then empty slots for remaining
    const slots: React.ReactNode[] = [];
    for (let i = 0; i < totalSlots; i++) {
      if (i < week.sessions.length) {
        slots.push(renderSessionDot(week.sessions[i], i));
      } else {
        slots.push(renderEmptySlot(i, week.status));
      }
    }

    return (
      <View key={week.weekNumber}>
        <TouchableOpacity
          style={[
            styles.weekRow,
            isCurrentWeek && styles.weekRowCurrent,
          ]}
          onPress={() => setExpandedWeek(isExpanded ? null : week.weekNumber)}
          activeOpacity={0.7}
        >
          <View style={styles.weekLabel}>
            <Text style={[
              styles.weekNumber,
              isCurrentWeek && styles.weekNumberCurrent,
              week.status === 'future' && styles.weekNumberFuture,
            ]}>
              W{week.weekNumber}
            </Text>
            {isCurrentWeek && (
              <View style={styles.currentBadge}>
                <View style={styles.currentDot} />
              </View>
            )}
          </View>

          <View style={styles.weekSlots}>
            {slots}
          </View>

          <View style={styles.weekMeta}>
            <Text style={[
              styles.weekCount,
              completedInWeek === totalSlots && completedInWeek > 0 && { color: '#2ecc71' },
            ]}>
              {completedInWeek}/{totalSlots}
            </Text>
            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={12}
              color={COLORS.textMuted}
            />
          </View>
        </TouchableOpacity>

        {/* Expanded detail — enhanced with schedule linking */}
        {isExpanded && (
          <View style={styles.weekExpandedContainer}>
            {week.sessions.length > 0 ? (
              <>
                {/* Week header with View in Schedule link */}
                <View style={styles.weekExpandedHeader}>
                  <Text style={styles.weekExpandedTitle}>
                    Week {week.weekNumber} Sessions
                  </Text>
                  <TouchableOpacity
                    style={styles.viewScheduleBtn}
                    onPress={() => navigateToSchedule(week.weekStartDate)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="calendar" size={12} color={COLORS.accent} />
                    <Text style={styles.viewScheduleText}>View Schedule</Text>
                  </TouchableOpacity>
                </View>

                {/* Session cards */}
                {week.sessions.map((s, idx) => renderExpandedSession(s, idx))}
              </>
            ) : (
              <View style={styles.weekExpandedEmpty}>
                <Ionicons name="calendar-outline" size={18} color={COLORS.textMuted} />
                <Text style={styles.weekExpandedEmptyText}>
                  {week.status === 'future'
                    ? 'No sessions scheduled yet for this week'
                    : 'No sessions recorded for this week'}
                </Text>
                <TouchableOpacity
                  style={styles.viewScheduleBtnSmall}
                  onPress={() => navigateToSchedule(week.weekStartDate)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add-circle-outline" size={12} color={COLORS.accent} />
                  <Text style={styles.viewScheduleTextSmall}>Schedule Sessions</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.tierBadge, { backgroundColor: tierColor + '15', borderColor: tierColor + '30' }]}>
            <Ionicons name="trophy-outline" size={12} color={tierColor} />
            <Text style={[styles.tierText, { color: tierColor }]}>{data.tier}</Text>
          </View>
          <Text style={styles.headerTitle}>Cycle Attendance</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.cycleLabel}>Cycle {data.cycleNumber}</Text>
          <Text style={styles.weekLabel2}>Week {data.weekInCycle} of 13</Text>
        </View>
      </View>

      {/* Cycle Date Range + Schedule Link */}
      <View style={styles.dateRange}>
        <Ionicons name="calendar-outline" size={12} color={COLORS.textMuted} />
        <Text style={styles.dateRangeText}>
          {formatShortDate(data.cycleStartDate!)} — {formatShortDate(data.cycleEndDate!)}
        </Text>
        <Text style={styles.programLabel}>{data.program}</Text>
      </View>

      {/* Schedule Link Banner */}
      <TouchableOpacity
        style={styles.scheduleLinkBanner}
        onPress={() => navigateToSchedule(new Date().toISOString().split('T')[0])}
        activeOpacity={0.7}
      >
        <View style={styles.scheduleLinkBannerIcon}>
          <Ionicons name="link-outline" size={14} color={COLORS.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.scheduleLinkBannerTitle}>Linked to Schedule</Text>
          <Text style={styles.scheduleLinkBannerSubtitle}>
            Sessions are tracked from scheduled appointments. Tap to open schedule.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={COLORS.accent} />
      </TouchableOpacity>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        {/* Attendance Rate */}
        <View style={styles.statCard}>
          <View style={styles.statIconWrap}>
            <View style={[styles.miniRing, {
              borderColor: stats.attendanceRate >= 90 ? '#2ecc71' :
                stats.attendanceRate >= 75 ? '#f39c12' : '#e74c3c',
            }]}>
              <Text style={[styles.miniRingText, {
                color: stats.attendanceRate >= 90 ? '#2ecc71' :
                  stats.attendanceRate >= 75 ? '#f39c12' : '#e74c3c',
              }]}>{stats.attendanceRate}</Text>
            </View>
          </View>
          <Text style={styles.statLabel}>Attendance %</Text>
        </View>

        {/* Current Streak */}
        <View style={styles.statCard}>
          <View style={[styles.statIconBg, { backgroundColor: '#f39c1215' }]}>
            <Ionicons name="flame-outline" size={18} color="#f39c12" />
          </View>
          <Text style={styles.statValue}>{stats.currentStreak}</Text>
          <Text style={styles.statLabel}>Streak</Text>
        </View>

        {/* Completed */}
        <View style={styles.statCard}>
          <View style={[styles.statIconBg, { backgroundColor: '#2ecc7115' }]}>
            <Ionicons name="checkmark-circle-outline" size={18} color="#2ecc71" />
          </View>
          <Text style={styles.statValue}>{stats.completed}</Text>
          <Text style={styles.statLabel}>Done</Text>
        </View>

        {/* Remaining */}
        <View style={styles.statCard}>
          <View style={[styles.statIconBg, { backgroundColor: COLORS.accent + '15' }]}>
            <Ionicons name="hourglass-outline" size={18} color={COLORS.accent} />
          </View>
          <Text style={styles.statValue}>{stats.sessionsRemaining}</Text>
          <Text style={styles.statLabel}>Left</Text>
        </View>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressSection}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>
            {stats.completed} of {stats.total} sessions
          </Text>
          <Text style={styles.progressPercent}>
            {stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%
          </Text>
        </View>
        <View style={styles.progressBar}>
          {/* Completed portion */}
          <View style={[styles.progressFillCompleted, {
            width: `${stats.total > 0 ? (stats.completed / stats.total) * 100 : 0}%`,
          }]} />
          {/* Missed portion */}
          <View style={[styles.progressFillMissed, {
            width: `${stats.total > 0 ? (stats.missed / stats.total) * 100 : 0}%`,
          }]} />
        </View>
      </View>

      {/* Week Grid */}
      <View style={styles.gridContainer}>
        <View style={styles.gridHeader}>
          <Text style={styles.gridHeaderLabel}>Week</Text>
          <Text style={[styles.gridHeaderLabel, { flex: 1, textAlign: 'center' }]}>Sessions</Text>
          <Text style={styles.gridHeaderLabel}></Text>
        </View>

        {weeks.map(renderWeekRow)}
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        {[
          { label: 'Completed', color: STATUS_COLORS.completed },
          { label: 'Missed', color: STATUS_COLORS.missed },
          { label: 'Cancelled', color: STATUS_COLORS.cancelled },
          { label: 'Upcoming', color: STATUS_COLORS.scheduled },
          { label: 'Empty', color: STATUS_COLORS.empty },
        ].map(item => (
          <View key={item.label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
            <Text style={styles.legendText}>{item.label}</Text>
          </View>
        ))}
      </View>

      {/* Refresh */}
      <TouchableOpacity style={styles.refreshBtn} onPress={loadData} activeOpacity={0.7}>
        <Ionicons name="refresh-outline" size={14} color={COLORS.accent} />
        <Text style={styles.refreshText}>Refresh</Text>
      </TouchableOpacity>
    </View>
  );
}

function formatTime(time: string): string {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  containerCompact: {
    padding: SPACING.md,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xl,
  },
  loadingText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  errorContainer: {
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.lg,
  },
  errorText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.accent + '10',
  },
  retryText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.accent,
  },
  emptyContainer: {
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xl,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  emptyText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingHorizontal: SPACING.lg,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
  },
  headerLeft: {
    gap: SPACING.xs,
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.text,
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
  },
  tierText: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  cycleLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.text,
  },
  weekLabel2: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
  },

  // Date Range
  dateRange: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  dateRangeText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  programLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.accent,
    marginLeft: 'auto',
  },

  // Schedule Link Banner
  scheduleLinkBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accent + '08',
    borderWidth: 1,
    borderColor: COLORS.accent + '20',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  scheduleLinkBannerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.accent + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scheduleLinkBannerTitle: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '800',
    color: COLORS.accent,
  },
  scheduleLinkBannerSubtitle: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: '500',
    marginTop: 1,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },
  statIconBg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statIconWrap: {
    marginBottom: 2,
  },
  statValue: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.text,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    textAlign: 'center',
  },

  // Mini ring for attendance %
  miniRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  miniRingText: {
    fontSize: 10,
    fontWeight: '800',
  },

  // Progress bar
  progressSection: {
    marginBottom: SPACING.md,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  progressLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  progressPercent: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '800',
    color: COLORS.text,
  },
  progressBar: {
    height: 8,
    backgroundColor: COLORS.borderLight,
    borderRadius: 4,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  progressFillCompleted: {
    height: '100%',
    backgroundColor: '#2ecc71',
    borderRadius: 4,
  },
  progressFillMissed: {
    height: '100%',
    backgroundColor: '#e74c3c',
  },

  // Grid
  gridContainer: {
    marginBottom: SPACING.md,
  },
  gridHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  gridHeaderLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Week row
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
    marginBottom: 2,
  },
  weekRowCurrent: {
    backgroundColor: COLORS.accent + '08',
    borderWidth: 1,
    borderColor: COLORS.accent + '20',
  },
  weekLabel: {
    width: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  weekNumber: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  weekNumberCurrent: {
    color: COLORS.accent,
    fontWeight: '800',
  },
  weekNumberFuture: {
    color: COLORS.textMuted,
  },
  currentBadge: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.accent,
  },
  currentDot: {},
  weekSlots: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: SPACING.xs,
  },
  weekMeta: {
    width: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
  },
  weekCount: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.textMuted,
  },

  // Session dots
  sessionDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sessionDotEmpty: {
    borderWidth: 1,
    borderStyle: 'dashed' as any,
  },

  // Expanded week container
  weekExpandedContainer: {
    marginHorizontal: SPACING.xs,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  weekExpandedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  weekExpandedTitle: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '800',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  viewScheduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.accent + '12',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.accent + '25',
  },
  viewScheduleText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.accent,
  },
  weekExpandedEmpty: {
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  weekExpandedEmptyText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
    textAlign: 'center',
  },
  viewScheduleBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.accent + '10',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
  },
  viewScheduleTextSmall: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.accent,
  },

  // Expanded session card
  expandedSessionCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  expandedSessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  expandedDotLarge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  expandedSessionInfo: {
    flex: 1,
    gap: 2,
  },
  expandedSessionTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  expandedDateFull: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.text,
  },
  expandedStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },
  expandedStatusText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  expandedSessionMeta: {
    flexDirection: 'row',
    gap: SPACING.md,
    flexWrap: 'wrap',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  expandedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.accent + '12',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.accent + '25',
  },
  actionBtnActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  scheduleLink: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },

  // Status picker row
  statusPickerRow: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  statusPickerLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: SPACING.xs,
  },
  statusPickerOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  statusPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    backgroundColor: COLORS.white,
  },
  statusPickerBtnText: {
    fontSize: 9,
    fontWeight: '700',
  },

  // Session notes
  sessionNotes: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    marginTop: SPACING.xs,
    paddingTop: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  sessionNotesText: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: '500',
    flex: 1,
    fontStyle: 'italic',
  },

  // Legend
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    marginBottom: SPACING.sm,
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
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textMuted,
  },

  // Refresh
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: SPACING.sm,
  },
  refreshText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.accent,
  },
});
