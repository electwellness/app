import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../constants/theme';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

import Header from '../components/Header';
import type { NotificationItem } from '../components/Header';
import SectionHeader from '../components/SectionHeader';

import AppointmentDetailModal from '../components/schedule/AppointmentDetailModal';
import WorkoutGeneratorModal from '../components/trainer/WorkoutGeneratorModal';

import {
  GreetingBanner,
  TodaySchedule,
  UpcomingSessionsList,
  ClientSpotlight,
} from '../components/trainer/TrainerHomeWidgets';

import {
  Appointment, formatDateKey, getWeekDates,
  getAllSessionBalances,
} from '../data/scheduleData';

import {
  fetchAppointments as fetchAppointmentsFromDB,
  rescheduleAppointment as rescheduleAppointmentInDB,
  updateAppointmentStatus as updateAppointmentStatusInDB,
  deleteAppointment as deleteAppointmentInDB,
} from '../lib/appointmentService';

export default function TrainerHomeScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();

  // ── State ──
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loadingAppts, setLoadingAppts] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [showWorkoutGenerator, setShowWorkoutGenerator] = useState(false);

  // Alerts
  const [alertItems, setAlertItems] = useState<NotificationItem[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [dismissedAlertIds, setDismissedAlertIds] = useState<Set<string>>(new Set());

  // Trainer KPI summary
  const [kpiSummary, setKpiSummary] = useState<{ redemption: number | null; retention: number | null } | null>(null);

  // ── Data Fetching ──

  const fetchAppointments = useCallback(async () => {
    try {
      setLoadingAppts(true);
      const params: any = {};
      if (profile?.id) params.coachId = profile.id;

      const { appointments: dbAppts, error } = await fetchAppointmentsFromDB(params);
      if (!error) {
        setAppointments(dbAppts);
      }
    } catch (err) {
      console.log('TrainerHome: error loading appointments:', err);
    } finally {
      setLoadingAppts(false);
    }
  }, [profile?.id]);

  const fetchAlerts = useCallback(async () => {
    setAlertsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-alerts', {
        body: {
          action: 'get_alerts',
          user_id: user?.id,
          franchise: profile?.franchise || undefined,
          role: profile?.role || undefined,
          trainer_name: profile?.trainer_name || undefined,
        },
      });
      if (!error && data?.data) {
        setAlertItems(data.data.map((a: any) => ({
          id: a.id,
          severity: a.severity || 'low',
          title: a.title,
          message: a.message,
          franchise: a.franchise,
          time: a.time,
          category: a.category,
          actionRoute: a.actionRoute,
        })));
        setDismissedAlertIds(new Set());
      }
    } catch {
      // silent
    } finally {
      setAlertsLoading(false);
    }
  }, [user?.id, profile?.franchise, profile?.role, profile?.trainer_name]);

  const fetchKPISummary = useCallback(async () => {
    try {
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const { data, error } = await supabase.functions.invoke('compute-trainer-kpis', {
        body: { month },
      });
      if (!error && data?.data) {
        setKpiSummary({
          redemption: data.data.redemption?.percentage ?? null,
          retention: data.data.retention?.percentage ?? null,
        });
      }
    } catch {
      // silent
    }
  }, []);

  // ── Initial Load ──
  useEffect(() => {
    if (profile) {
      fetchAppointments();
      fetchAlerts();
      fetchKPISummary();
    }
  }, [profile, fetchAppointments, fetchAlerts, fetchKPISummary]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([
      fetchAppointments(),
      fetchAlerts(),
      fetchKPISummary(),
    ]).finally(() => setRefreshing(false));
  }, [fetchAppointments, fetchAlerts, fetchKPISummary]);

  // ── Computed Data ──

  const today = new Date();
  const todayKey = formatDateKey(today);
  const weekDates = useMemo(() => getWeekDates(today), []);

  // Filter appointments to this trainer
  const myAppointments = useMemo(() => {
    if (!profile) return appointments;
    const coachNames = [profile.trainer_name, profile.full_name].filter(Boolean) as string[];
    return appointments.filter(a =>
      a.coachId === profile.id || coachNames.some(name => a.coachName === name)
    );
  }, [appointments, profile]);

  // Today's appointments
  const todayAppointments = useMemo(() => {
    return myAppointments
      .filter(a => a.date === todayKey && a.status !== 'cancelled')
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [myAppointments, todayKey]);

  // This week's appointments (excluding today, only future)
  const upcomingWeekAppointments = useMemo(() => {
    const weekKeys = weekDates.map(d => formatDateKey(d));
    return myAppointments
      .filter(a => {
        if (a.status === 'cancelled') return false;
        if (!weekKeys.includes(a.date)) return false;
        if (a.date === todayKey) return false;
        return a.date > todayKey;
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
      .slice(0, 15);
  }, [myAppointments, weekDates, todayKey]);

  // Week count for greeting banner
  const weekApptCount = useMemo(() => {
    const weekKeys = weekDates.map(d => formatDateKey(d));
    return myAppointments.filter(a => weekKeys.includes(a.date) && a.status !== 'cancelled').length;
  }, [myAppointments, weekDates]);

  // Session balances (clients near limit)
  const sessionBalances = useMemo(() => {
    const clientMap = new Map<string, { id: string; name: string; program: string; status: string }>();
    myAppointments.forEach(a => {
      if (!clientMap.has(a.clientId)) {
        clientMap.set(a.clientId, {
          id: a.clientId,
          name: a.clientName,
          program: a.clientProgram,
          status: 'active',
        });
      }
    });
    const clientList = Array.from(clientMap.values());
    return getAllSessionBalances(myAppointments, weekDates, clientList);
  }, [myAppointments, weekDates]);

  const lowSessionClients = useMemo(() => {
    return sessionBalances
      .filter(b => b.sessionsRemaining <= 1 && b.sessionsAllowed > 0)
      .sort((a, b) => a.sessionsRemaining - b.sessionsRemaining);
  }, [sessionBalances]);

  // ── Alert Handlers ──
  const headerNotifications = useMemo(() => {
    return alertItems.filter(a => !dismissedAlertIds.has(a.id));
  }, [alertItems, dismissedAlertIds]);

  const handleDismissAlert = useCallback((alertId: string) => {
    setDismissedAlertIds(prev => new Set(prev).add(alertId));
    if (user?.id) {
      supabase.functions.invoke('manage-alerts', {
        body: { action: 'dismiss', user_id: user.id, alert_key: alertId },
      }).catch(() => {});
    }
  }, [user?.id]);

  const handleDismissAllAlerts = useCallback(() => {
    const visibleIds = alertItems.filter(a => !dismissedAlertIds.has(a.id)).map(a => a.id);
    setDismissedAlertIds(prev => {
      const next = new Set(prev);
      visibleIds.forEach(id => next.add(id));
      return next;
    });
    if (user?.id && visibleIds.length > 0) {
      supabase.functions.invoke('manage-alerts', {
        body: { action: 'dismiss_all', user_id: user.id, alert_keys: visibleIds },
      }).catch(() => {});
    }
  }, [user?.id, alertItems, dismissedAlertIds]);

  const handleAlertAction = useCallback((alertId: string, route?: string) => {
    if (route) router.push(route as any);
    else router.push('/(tabs)/clients' as any);
  }, [router]);

  // ── Appointment CRUD (for detail modal) ──
  const handleUpdateStatus = useCallback(async (id: string, status: Appointment['status']) => {
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status } : a));
    await updateAppointmentStatusInDB(id, status);
  }, []);

  const handleDeleteAppointment = useCallback(async (id: string) => {
    setAppointments(prev => prev.filter(a => a.id !== id));
    await deleteAppointmentInDB(id);
  }, []);

  const handleRescheduleAppointment = useCallback(async (id: string, newDate: string, newStartTime: string, newEndTime: string) => {
    const isRecException = !!appointments.find(a => a.id === id)?.recurrenceId;
    setAppointments(prev => prev.map(a =>
      a.id === id ? { ...a, date: newDate, startTime: newStartTime, endTime: newEndTime, isRecurrenceException: isRecException } : a
    ));
    setSelectedAppt(prev => {
      if (prev && prev.id === id) {
        return { ...prev, date: newDate, startTime: newStartTime, endTime: newEndTime, isRecurrenceException: isRecException };
      }
      return prev;
    });
    await rescheduleAppointmentInDB(id, newDate, newStartTime, newEndTime, isRecException);
  }, [appointments]);

  const getApptSessionBalance = useCallback((appt: Appointment | null) => {
    if (!appt) return null;
    const balance = sessionBalances.find(b => b.clientId === appt.clientId);
    if (!balance) return null;
    return { used: balance.sessionsUsed, allowed: balance.sessionsAllowed };
  }, [sessionBalances]);

  // ── Trainer display name ──
  const trainerName = profile?.trainer_name || profile?.full_name || 'Trainer';

  return (
    <View style={styles.container}>
      <Header
        title="Elect Wellness"
        subtitle="Trainer Home"
        notifications={headerNotifications}
        notificationsLoading={alertsLoading}
        onDismissNotification={handleDismissAlert}
        onDismissAllNotifications={handleDismissAllAlerts}
        onNotificationAction={handleAlertAction}
      />

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />
        }
      >
        {/* Greeting Banner */}
        <GreetingBanner
          trainerName={trainerName}
          todayCount={todayAppointments.length}
          weekCount={weekApptCount}
        />

        <View style={styles.content}>
          {/* ── AI Workout Generator Banner ── */}
          <TouchableOpacity
            style={styles.workoutGenBanner}
            onPress={() => setShowWorkoutGenerator(true)}
            activeOpacity={0.8}
          >
            <View style={styles.workoutGenLeft}>
              <View style={styles.workoutGenIconBg}>
                <Ionicons name="flash" size={22} color={COLORS.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.workoutGenTitle}>AI Workout Generator</Text>
                <Text style={styles.workoutGenSubtitle}>
                  Generate custom exercise lists by muscle group & equipment
                </Text>
              </View>
            </View>
            <View style={styles.workoutGenArrow}>
              <Ionicons name="chevron-forward" size={18} color={COLORS.accent} />
            </View>
          </TouchableOpacity>

          {/* Today's Schedule */}

          <SectionHeader
            title="Today's Schedule"
            icon="time"
            subtitle={todayAppointments.length > 0 ? `${todayAppointments.length} session${todayAppointments.length !== 1 ? 's' : ''}` : undefined}
          />
          {loadingAppts ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator size="small" color={COLORS.accent} />
              <Text style={styles.loadingText}>Loading schedule...</Text>
            </View>
          ) : (
            <TodaySchedule
              appointments={todayAppointments}
              onPressAppointment={setSelectedAppt}
              onViewFullSchedule={() => router.push('/(tabs)/schedule' as any)}
            />
          )}

          {/* Upcoming This Week */}
          {upcomingWeekAppointments.length > 0 && (
            <>
              <SectionHeader
                title="Upcoming This Week"
                icon="arrow-forward-circle"
                actionLabel="Full Schedule"
                onAction={() => router.push('/(tabs)/schedule' as any)}
              />
              <UpcomingSessionsList
                appointments={upcomingWeekAppointments}
                onPressAppointment={setSelectedAppt}
              />
            </>
          )}

          {/* Client Spotlight */}
          <SectionHeader
            title="Client Spotlight"
            icon="alert-circle"
            subtitle="Session limits"
          />
          <ClientSpotlight
            clients={lowSessionClients}
            onViewClients={() => router.push('/(tabs)/clients' as any)}
          />

          {/* KPI Snapshot */}
          {kpiSummary && (kpiSummary.redemption !== null || kpiSummary.retention !== null) && (
            <>
              <SectionHeader
                title="KPI Snapshot"
                icon="ribbon"
                actionLabel="View Details"
                onAction={() => router.push('/(tabs)/reports' as any)}
              />
              <View style={styles.kpiSnapshotRow}>
                {kpiSummary.redemption !== null && (
                  <View style={styles.kpiSnapshotCard}>
                    <View style={[styles.kpiSnapshotIconWrap, { backgroundColor: '#2ecc71' + '15' }]}>
                      <Ionicons name="checkmark-done-circle" size={22} color="#2ecc71" />
                    </View>
                    <Text style={styles.kpiSnapshotValue}>{kpiSummary.redemption}%</Text>
                    <Text style={styles.kpiSnapshotLabel}>Redemption</Text>
                    <View style={styles.kpiSnapshotBar}>
                      <View style={[styles.kpiSnapshotBarFill, {
                        width: `${Math.min(kpiSummary.redemption, 100)}%`,
                        backgroundColor: kpiSummary.redemption >= 80 ? '#2ecc71' : kpiSummary.redemption >= 60 ? '#f39c12' : '#e74c3c',
                      }]} />
                    </View>
                  </View>
                )}
                {kpiSummary.retention !== null && (
                  <View style={styles.kpiSnapshotCard}>
                    <View style={[styles.kpiSnapshotIconWrap, { backgroundColor: '#9b59b6' + '15' }]}>
                      <Ionicons name="heart-circle" size={22} color="#9b59b6" />
                    </View>
                    <Text style={styles.kpiSnapshotValue}>{kpiSummary.retention}%</Text>
                    <Text style={styles.kpiSnapshotLabel}>Retention</Text>
                    <View style={styles.kpiSnapshotBar}>
                      <View style={[styles.kpiSnapshotBarFill, {
                        width: `${Math.min(kpiSummary.retention, 100)}%`,
                        backgroundColor: kpiSummary.retention >= 80 ? '#2ecc71' : kpiSummary.retention >= 60 ? '#f39c12' : '#e74c3c',
                      }]} />
                    </View>
                  </View>
                )}
              </View>
            </>
          )}

          <View style={{ height: 30 }} />
        </View>
      </ScrollView>

      {/* Appointment Detail Modal */}
      <AppointmentDetailModal
        visible={!!selectedAppt}
        appointment={selectedAppt}
        onClose={() => setSelectedAppt(null)}
        onUpdateStatus={handleUpdateStatus}
        onDelete={handleDeleteAppointment}
        sessionBalance={getApptSessionBalance(selectedAppt)}
        existingAppointments={appointments}
        onReschedule={handleRescheduleAppointment}
        userRole={profile?.role}
        userCoachName={profile?.trainer_name || profile?.full_name || undefined}
        userCoachId={profile?.id}
      />

      {/* Workout Generator Modal */}
      <WorkoutGeneratorModal
        visible={showWorkoutGenerator}
        onClose={() => setShowWorkoutGenerator(false)}
      />
    </View>
  );

}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: SPACING.lg,
  },
  loadingCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xxl,
    alignItems: 'center',
    gap: SPACING.sm,
    ...SHADOWS.md,
  },
  loadingText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  kpiSnapshotRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  kpiSnapshotCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    alignItems: 'center',
    ...SHADOWS.md,
  },
  kpiSnapshotIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  kpiSnapshotValue: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '800',
    color: COLORS.primary,
  },
  kpiSnapshotLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: 2,
    marginBottom: SPACING.sm,
  },
  kpiSnapshotBar: {
    width: '100%',
    height: 6,
    backgroundColor: COLORS.borderLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  kpiSnapshotBarFill: {
    height: '100%',
    borderRadius: 3,
  },

  // Workout Generator Banner
  workoutGenBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
    borderWidth: 1.5,
    borderColor: COLORS.accent + '30',
    ...SHADOWS.md,
  },
  workoutGenLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    flex: 1,
  },
  workoutGenIconBg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.sm,
  },
  workoutGenTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: COLORS.primary,
  },
  workoutGenSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
    lineHeight: 15,
  },
  workoutGenArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.accent + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
