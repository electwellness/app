import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../constants/theme';
import ClientHeader from '../components/client/ClientHeader';
import { useAuth } from '../contexts/AuthContext';
import type { SessionRecord, BiometricEntry } from '../data/clientPortalData';
import { fetchSessions, fetchBiometrics, seedClientData } from '../lib/clientDataService';
import { getProgramDefinition } from '../data/scheduleData';
import { onBiometricsUpdated } from '../lib/biometricEvents';



// Helper: get the Sunday–Saturday week range containing a given date
function getCurrentWeekRange(): { start: string; end: string; label: string } {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - dayOfWeek);
  sunday.setHours(0, 0, 0, 0);
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  saturday.setHours(23, 59, 59, 999);

  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const label = `${sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${saturday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  return { start: fmt(sunday), end: fmt(saturday), label };
}

export default function ClientDashboard() {
  const { user, profile } = useAuth();
  const [sessionFilter, setSessionFilter] = useState<'all' | 'upcoming' | 'completed'>('all');
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [biometrics, setBiometrics] = useState<BiometricEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [seeded, setSeeded] = useState(false);

  // Derive membership info from profile + program definitions
  const programName = profile?.program || 'Unknown';
  const programDef = getProgramDefinition(programName);
  const sessionsPerWeek = programDef?.sessionsPerWeek ?? 0;
  const monthlyCost = programDef?.monthlyCost ?? 0;
  const trainerName = profile?.primary_trainer || 'Not assigned';
  const dietitianName = profile?.primary_dietitian || 'Not assigned';
  const franchiseName = profile?.franchise || 'Unknown';
  const hasNutrition = !!profile?.has_nutrition;


  // Current week (Sunday–Saturday)
  const weekRange = useMemo(() => getCurrentWeekRange(), []);

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [sessData, bioData] = await Promise.all([
        fetchSessions(user.id),
        fetchBiometrics(user.id),
      ]);

      // If no data exists, seed initial data for demo
      if (sessData.length === 0 && bioData.length === 0 && !seeded) {
        setSeeded(true);
        await seedClientData(user.id);
        // Re-fetch after seeding
        const [newSess, newBio] = await Promise.all([
          fetchSessions(user.id),
          fetchBiometrics(user.id),
        ]);
        setSessions(newSess);
        setBiometrics(newBio);
      } else {
        setSessions(sessData);
        setBiometrics(bioData);
      }
    } catch (err) {
      console.error('Error loading client data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, seeded]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh biometrics when a new assessment is saved (from any screen)
  useEffect(() => {
    const unsubscribe = onBiometricsUpdated((updatedUserId) => {
      if (updatedUserId === user?.id) {
        console.log('[ClientDashboard] Biometrics updated, refreshing...');
        loadData();
      }
    });
    return unsubscribe;
  }, [user?.id, loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);


  const completedSessions = sessions.filter(s => s.status === 'completed');
  const upcomingSessions = sessions.filter(s => s.status === 'upcoming');
  const cancelledSessions = sessions.filter(s => s.status === 'cancelled' || s.status === 'no-show');

  // Sessions completed THIS WEEK (Sunday–Saturday)
  const thisWeekCompleted = useMemo(() => {
    return completedSessions.filter(s => s.date >= weekRange.start && s.date <= weekRange.end).length;
  }, [completedSessions, weekRange]);

  // Sessions upcoming this week
  const thisWeekUpcoming = useMemo(() => {
    return upcomingSessions.filter(s => s.date >= weekRange.start && s.date <= weekRange.end).length;
  }, [upcomingSessions, weekRange]);

  // Sessions cancelled this week
  const thisWeekCancelled = useMemo(() => {
    return cancelledSessions.filter(s => s.date >= weekRange.start && s.date <= weekRange.end).length;
  }, [cancelledSessions, weekRange]);

  const filteredSessions = sessionFilter === 'upcoming'
    ? upcomingSessions
    : sessionFilter === 'completed'
      ? completedSessions
      : sessions;

  const latest = biometrics.length > 0 ? biometrics[biometrics.length - 1] : null;
  const first = biometrics.length > 0 ? biometrics[0] : null;
  const weightLost = first && latest ? first.weight - latest.weight : 0;
  const bodyFatLost = first && latest ? first.bodyFat - latest.bodyFat : 0;

  const getSessionTypeIcon = (type: string) => {
    switch (type) {
      case 'training': return 'barbell-outline';
      case 'nutrition': return 'nutrition-outline';
      case 'education': return 'school-outline';
      default: return 'fitness-outline';
    }
  };

  const getSessionTypeColor = (type: string) => {
    switch (type) {
      case 'training': return COLORS.accent;
      case 'nutrition': return '#2ecc71';
      case 'education': return '#3498db';
      default: return COLORS.textMuted;
    }
  };


  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#2ecc71';
      case 'upcoming': return '#3498db';
      case 'cancelled': return '#f39c12';
      case 'no-show': return '#e74c3c';
      default: return COLORS.textMuted;
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    const today = new Date();
    const diff = Math.floor((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ClientHeader title="Elect Wellness" subtitle="Your Fitness Journey" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={styles.loadingText}>Loading your dashboard...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ClientHeader title="Elect Wellness" subtitle="Your Fitness Journey" />
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />

        }
      >
        {/* Membership Card */}
        <View style={styles.membershipCard}>
          <View style={styles.membershipGradient}>
            <View style={styles.membershipHeader}>
              <View>
                <Text style={styles.membershipLabel}>MEMBERSHIP</Text>
                <Text style={styles.membershipPlan}>{programName}</Text>
              </View>
              <View style={styles.statusBadge}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>Active</Text>
              </View>
            </View>

            <View style={styles.membershipDetails}>
              <View style={styles.memberDetail}>
                <Ionicons name="location-outline" size={14} color="rgba(255,255,255,0.7)" />
                <Text style={styles.memberDetailText}>{franchiseName}</Text>
              </View>
              <View style={styles.memberDetail}>
                <Ionicons name="fitness-outline" size={14} color="rgba(255,255,255,0.7)" />
                <Text style={styles.memberDetailText}>Trainer: {trainerName}</Text>
              </View>
              <View style={styles.memberDetail}>
                <Ionicons name="nutrition-outline" size={14} color="rgba(255,255,255,0.7)" />
                <Text style={styles.memberDetailText}>Dietitian: {dietitianName}</Text>
              </View>
            </View>

            <View style={styles.membershipFeatures}>
              <View style={styles.featureTag}>
                <Ionicons name="barbell-outline" size={12} color={COLORS.accent} />
                <Text style={styles.featureText}>{sessionsPerWeek} Sessions/wk</Text>
              </View>
              {hasNutrition && (
                <View style={styles.featureTag}>
                  <Ionicons name="nutrition-outline" size={12} color="#2ecc71" />
                  <Text style={styles.featureText}>Nutrition</Text>
                </View>
              )}
            </View>

            <View style={styles.investmentRow}>
              <Text style={styles.investmentLabel}>Monthly Rate</Text>
              <Text style={styles.investmentValue}>
                ${monthlyCost > 0 ? monthlyCost.toLocaleString() : '--'}/mo
              </Text>
            </View>
          </View>
        </View>

        {/* Quick Stats */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#ff6b6b15' }]}>
              <Ionicons name="scale-outline" size={20} color="#ff6b6b" />
            </View>
            <Text style={styles.statValue}>-{weightLost.toFixed(1)} lbs</Text>
            <Text style={styles.statLabel}>Weight Lost</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#f39c1215' }]}>
              <Ionicons name="body-outline" size={20} color="#f39c12" />
            </View>
            <Text style={styles.statValue}>-{bodyFatLost.toFixed(1)}%</Text>
            <Text style={styles.statLabel}>Body Fat</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#2ecc7115' }]}>
              <Ionicons name="checkmark-circle-outline" size={20} color="#2ecc71" />
            </View>
            <Text style={styles.statValue}>{thisWeekCompleted}</Text>
            <Text style={styles.statLabel}>Sessions completed{'\n'}this week</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#3498db15' }]}>
              <Ionicons name="fitness-outline" size={20} color="#3498db" />
            </View>
            <Text style={styles.statValue}>{latest ? latest.muscleMass : '--'}</Text>
            <Text style={styles.statLabel}>Muscle Mass (lbs)</Text>
          </View>
        </View>

        {/* Weekly Session Redemption */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Weekly Session Redemption</Text>
            <Text style={styles.sectionSubtitle}>{weekRange.label}</Text>
          </View>

          <View style={styles.redemptionCard}>
            <View style={styles.redemptionProgress}>
              <View style={styles.redemptionBar}>
                <View
                  style={[
                    styles.redemptionFill,
                    { width: `${sessionsPerWeek > 0 ? Math.min(100, (thisWeekCompleted / sessionsPerWeek) * 100) : 0}%` },
                  ]}
                />
              </View>
              <Text style={styles.redemptionText}>
                {thisWeekCompleted} of {sessionsPerWeek} sessions used this week
              </Text>
            </View>
            <View style={styles.redemptionStats}>
              <View style={styles.redemptionStat}>
                <Text style={[styles.redemptionStatValue, { color: '#2ecc71' }]}>{thisWeekCompleted}</Text>
                <Text style={styles.redemptionStatLabel}>Completed</Text>
              </View>
              <View style={styles.redemptionDivider} />
              <View style={styles.redemptionStat}>
                <Text style={[styles.redemptionStatValue, { color: '#3498db' }]}>{thisWeekUpcoming}</Text>
                <Text style={styles.redemptionStatLabel}>Upcoming</Text>
              </View>
              <View style={styles.redemptionStat}>
                <Text style={[styles.redemptionStatValue, { color: '#f39c12' }]}>{thisWeekCancelled}</Text>
                <Text style={styles.redemptionStatLabel}>Cancelled</Text>
              </View>
              <View style={styles.redemptionDivider} />
              <View style={styles.redemptionStat}>
                <Text style={[styles.redemptionStatValue, { color: COLORS.accent }]}>
                  {Math.max(0, sessionsPerWeek - thisWeekCompleted)}
                </Text>
                <Text style={styles.redemptionStatLabel}>Remaining</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Session History */}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Sessions</Text>
          </View>

          <View style={styles.filterRow}>
            {(['all', 'upcoming', 'completed'] as const).map(f => (
              <TouchableOpacity
                key={f}
                style={[styles.filterBtn, sessionFilter === f && styles.filterBtnActive]}
                onPress={() => setSessionFilter(f)}
              >
                <Text style={[styles.filterText, sessionFilter === f && styles.filterTextActive]}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {filteredSessions.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={40} color={COLORS.textMuted} />
              <Text style={styles.emptyText}>No sessions found</Text>
              <Text style={styles.emptySubtext}>Pull down to refresh</Text>
            </View>
          )}

          {filteredSessions.slice(0, 8).map(session => (
            <View key={session.id} style={styles.sessionCard}>
              <View style={[styles.sessionTypeIcon, { backgroundColor: getSessionTypeColor(session.type) + '15' }]}>
                <Ionicons name={getSessionTypeIcon(session.type) as any} size={18} color={getSessionTypeColor(session.type)} />
              </View>
              <View style={styles.sessionInfo}>
                <View style={styles.sessionTopRow}>
                  <Text style={styles.sessionType}>
                    {session.type.charAt(0).toUpperCase() + session.type.slice(1)} Session
                  </Text>
                  <View style={[styles.sessionStatus, { backgroundColor: getStatusColor(session.status) + '15' }]}>
                    <Text style={[styles.sessionStatusText, { color: getStatusColor(session.status) }]}>
                      {session.status}
                    </Text>
                  </View>
                </View>
                <Text style={styles.sessionDate}>
                  {formatDate(session.date)} at {session.time} · {session.duration} min
                </Text>
                {session.notes && (
                  <Text style={styles.sessionNotes} numberOfLines={2}>{session.notes}</Text>
                )}
                {session.rating && (
                  <View style={styles.ratingRow}>
                    {[1, 2, 3, 4, 5].map(star => (
                      <Ionicons
                        key={star}
                        name={star <= session.rating! ? 'star' : 'star-outline'}
                        size={12}
                        color={star <= session.rating! ? '#f39c12' : COLORS.textMuted}
                      />
                    ))}
                  </View>
                )}
              </View>
            </View>
          ))}
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.md,
  },
  loadingText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  // Membership Card
  membershipCard: {
    margin: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    ...SHADOWS.lg,
  },
  membershipGradient: {
    backgroundColor: COLORS.primary,
    padding: SPACING.xl,
  },
  membershipHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.lg,
  },
  membershipLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  membershipPlan: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: COLORS.white,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(46,204,113,0.15)',
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2ecc71',
  },
  statusText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: '#2ecc71',
  },
  membershipDetails: {
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  memberDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  memberDetailText: {
    fontSize: FONT_SIZES.sm,
    color: 'rgba(255,255,255,0.8)',
  },
  membershipFeatures: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  featureTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
  },
  featureText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
  },
  investmentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingTop: SPACING.md,
  },
  investmentLabel: {
    fontSize: FONT_SIZES.sm,
    color: 'rgba(255,255,255,0.5)',
  },
  investmentValue: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: COLORS.white,
  },
  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    alignItems: 'center',
    ...SHADOWS.sm,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  statValue: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: COLORS.text,
  },
  statLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
  },
  // Sections

  section: {
    marginBottom: SPACING.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.text,
  },
  sectionSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  // Redemption
  redemptionCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  redemptionProgress: {
    marginBottom: SPACING.lg,
  },
  redemptionBar: {
    height: 10,
    backgroundColor: COLORS.borderLight,
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: SPACING.sm,
  },
  redemptionFill: {
    height: '100%',
    backgroundColor: '#9b59b6',
    borderRadius: 5,
  },
  redemptionText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  redemptionStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  redemptionStat: {
    alignItems: 'center',
  },
  redemptionStatValue: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '800',
  },
  redemptionStatLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
    marginTop: 2,
  },
  redemptionDivider: {
    width: 1,
    height: 30,
    backgroundColor: COLORS.border,
  },
  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: SPACING.xxxl,
    gap: SPACING.sm,
  },
  emptyText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  emptySubtext: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
  },
  // Filters
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  filterBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterBtnActive: {
    backgroundColor: '#9b59b6',
    borderColor: '#9b59b6',
  },
  filterText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  filterTextActive: {
    color: COLORS.white,
  },
  // Session Cards
  sessionCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.md,
  },
  sessionTypeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sessionInfo: {
    flex: 1,
  },
  sessionTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sessionType: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.text,
  },
  sessionStatus: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },
  sessionStatusText: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  sessionDate: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  sessionNotes: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  ratingRow: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 4,
  },
});
