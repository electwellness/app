import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import { Appointment, appointmentTypes, formatTimeDisplay, getProgramColor } from '../../data/scheduleData';

// ── Greeting Banner ──────────────────────────────────────────────────────────

function getGreeting(): { greeting: string; icon: string; emoji: string } {
  const hour = new Date().getHours();
  if (hour < 12) return { greeting: 'Good Morning', icon: 'sunny', emoji: '' };
  if (hour < 17) return { greeting: 'Good Afternoon', icon: 'partly-sunny', emoji: '' };
  return { greeting: 'Good Evening', icon: 'moon', emoji: '' };
}

const MOTIVATIONAL_MESSAGES = [
  'Ready to make an impact today!',
  'Your clients are counting on you.',
  'Every session makes a difference.',
  'Let\'s help someone reach their goals.',
  'Another great day to inspire change.',
  'Consistency builds champions.',
  'Small steps lead to big transformations.',
];

function getMotivationalMessage(): string {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  return MOTIVATIONAL_MESSAGES[dayOfYear % MOTIVATIONAL_MESSAGES.length];
}

interface GreetingBannerProps {
  trainerName: string;
  todayCount: number;
  weekCount: number;
}

export function GreetingBanner({ trainerName, todayCount, weekCount }: GreetingBannerProps) {
  const { greeting, icon } = getGreeting();
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <View style={greetStyles.container}>
      <View style={greetStyles.topRow}>
        <View style={greetStyles.iconWrap}>
          <Ionicons name={icon as any} size={28} color="#f5c542" />
        </View>
        <View style={greetStyles.textWrap}>
          <Text style={greetStyles.greeting}>{greeting},</Text>
          <Text style={greetStyles.name} numberOfLines={1}>{trainerName}</Text>
        </View>
      </View>
      <Text style={greetStyles.date}>{dateStr}</Text>
      <Text style={greetStyles.motivation}>{getMotivationalMessage()}</Text>
      <View style={greetStyles.quickInfo}>
        <View style={greetStyles.quickInfoItem}>
          <Ionicons name="today" size={14} color={COLORS.white} />
          <Text style={greetStyles.quickInfoText}>
            {todayCount} session{todayCount !== 1 ? 's' : ''} today
          </Text>
        </View>
        <View style={greetStyles.quickInfoDivider} />
        <View style={greetStyles.quickInfoItem}>
          <Ionicons name="calendar" size={14} color={COLORS.white} />
          <Text style={greetStyles.quickInfoText}>
            {weekCount} this week
          </Text>
        </View>
      </View>
    </View>
  );
}

const greetStyles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    ...SHADOWS.lg,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textWrap: {
    flex: 1,
  },
  greeting: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.accentLight,
  },
  name: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '800',
    color: COLORS.white,
    marginTop: 2,
  },
  date: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginBottom: SPACING.sm,
  },
  motivation: {
    fontSize: FONT_SIZES.sm,
    color: 'rgba(255,255,255,0.75)',
    fontStyle: 'italic',
    marginBottom: SPACING.md,
    lineHeight: 18,
  },
  quickInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  quickInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    flex: 1,
    justifyContent: 'center',
  },
  quickInfoText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.white,
  },
  quickInfoDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
});

// ── Quick Stat Card ──────────────────────────────────────────────────────────

interface QuickStatCardProps {
  icon: string;
  label: string;
  value: string;
  color: string;
  subtitle?: string;
}

export function QuickStatCard({ icon, label, value, color, subtitle }: QuickStatCardProps) {
  return (
    <View style={statStyles.card}>
      <View style={[statStyles.iconCircle, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <Text style={statStyles.value}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
      {subtitle && <Text style={statStyles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

const statStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    alignItems: 'center',
    ...SHADOWS.md,
    minWidth: 80,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  value: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '800',
    color: COLORS.primary,
  },
  label: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 2,
  },
  subtitle: {
    fontSize: 9,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 1,
  },
});

// ── Today's Schedule ─────────────────────────────────────────────────────────

interface TodayScheduleProps {
  appointments: Appointment[];
  onPressAppointment: (appt: Appointment) => void;
  onViewFullSchedule: () => void;
}

export function TodaySchedule({ appointments, onPressAppointment, onViewFullSchedule }: TodayScheduleProps) {
  const now = new Date();
  const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  if (appointments.length === 0) {
    return (
      <View style={todayStyles.emptyCard}>
        <View style={todayStyles.emptyIconWrap}>
          <Ionicons name="checkmark-circle" size={36} color={COLORS.success} />
        </View>
        <Text style={todayStyles.emptyTitle}>No Sessions Today</Text>
        <Text style={todayStyles.emptySubtitle}>
          Enjoy your day off, or use this time to plan ahead!
        </Text>
        <TouchableOpacity style={todayStyles.viewScheduleBtn} onPress={onViewFullSchedule}>
          <Ionicons name="calendar-outline" size={14} color={COLORS.accent} />
          <Text style={todayStyles.viewScheduleText}>View Full Schedule</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Split into past, current, upcoming
  const past = appointments.filter(a => a.endTime <= currentTimeStr);
  const current = appointments.filter(a => a.startTime <= currentTimeStr && a.endTime > currentTimeStr);
  const upcoming = appointments.filter(a => a.startTime > currentTimeStr);

  const completedCount = past.length;
  const totalCount = appointments.length;

  return (
    <View style={todayStyles.container}>
      {/* Progress bar */}
      <View style={todayStyles.progressRow}>
        <View style={todayStyles.progressBarBg}>
          <View
            style={[
              todayStyles.progressBarFill,
              { width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` },
            ]}
          />
        </View>
        <Text style={todayStyles.progressText}>
          {completedCount}/{totalCount} completed
        </Text>
      </View>

      {/* Current session highlight */}
      {current.map(appt => {
        const apptType = appointmentTypes.find(t => t.id === appt.appointmentTypeId);
        return (
          <TouchableOpacity
            key={appt.id}
            style={[todayStyles.currentCard, { borderLeftColor: apptType?.color || COLORS.accent }]}
            onPress={() => onPressAppointment(appt)}
            activeOpacity={0.7}
          >
            <View style={todayStyles.currentBadge}>
              <View style={todayStyles.currentDot} />
              <Text style={todayStyles.currentBadgeText}>IN PROGRESS</Text>
            </View>
            <View style={todayStyles.apptRow}>
              <View style={[todayStyles.apptIconWrap, { backgroundColor: (apptType?.color || COLORS.accent) + '18' }]}>
                <Ionicons name={(apptType?.icon || 'fitness') as any} size={18} color={apptType?.color || COLORS.accent} />
              </View>
              <View style={todayStyles.apptInfo}>
                <Text style={todayStyles.apptClient} numberOfLines={1}>{appt.clientName}</Text>
                <Text style={todayStyles.apptType}>{apptType?.name || 'Session'}</Text>
              </View>
              <View style={todayStyles.apptTimeCol}>
                <Text style={todayStyles.apptTime}>{formatTimeDisplay(appt.startTime)}</Text>
                <Text style={todayStyles.apptDuration}>{appt.duration}m</Text>
              </View>
            </View>
          </TouchableOpacity>
        );
      })}

      {/* Upcoming sessions */}
      {upcoming.map((appt, idx) => {
        const apptType = appointmentTypes.find(t => t.id === appt.appointmentTypeId);
        const isNext = idx === 0 && current.length === 0;
        return (
          <TouchableOpacity
            key={appt.id}
            style={[todayStyles.apptCard, isNext && todayStyles.apptCardNext]}
            onPress={() => onPressAppointment(appt)}
            activeOpacity={0.7}
          >
            {isNext && (
              <View style={todayStyles.nextBadge}>
                <Ionicons name="arrow-forward-circle" size={10} color={COLORS.accent} />
                <Text style={todayStyles.nextBadgeText}>UP NEXT</Text>
              </View>
            )}
            <View style={todayStyles.apptRow}>
              <View style={[todayStyles.apptIconWrap, { backgroundColor: (apptType?.color || '#999') + '18' }]}>
                <Ionicons name={(apptType?.icon || 'fitness') as any} size={16} color={apptType?.color || '#999'} />
              </View>
              <View style={todayStyles.apptInfo}>
                <Text style={todayStyles.apptClient} numberOfLines={1}>{appt.clientName}</Text>
                <Text style={todayStyles.apptType}>{apptType?.shortName || 'Session'}</Text>
              </View>
              <View style={todayStyles.apptTimeCol}>
                <Text style={todayStyles.apptTime}>{formatTimeDisplay(appt.startTime)}</Text>
                <Text style={todayStyles.apptDuration}>{appt.duration}m</Text>
              </View>
            </View>
          </TouchableOpacity>
        );
      })}

      {/* Past sessions (collapsed) */}
      {past.length > 0 && (
        <View style={todayStyles.pastSection}>
          <Text style={todayStyles.pastLabel}>
            {past.length} session{past.length !== 1 ? 's' : ''} completed earlier
          </Text>
          {past.slice(-2).map(appt => {
            const apptType = appointmentTypes.find(t => t.id === appt.appointmentTypeId);
            return (
              <TouchableOpacity
                key={appt.id}
                style={todayStyles.pastCard}
                onPress={() => onPressAppointment(appt)}
                activeOpacity={0.7}
              >
                <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
                <Text style={todayStyles.pastClient} numberOfLines={1}>{appt.clientName}</Text>
                <Text style={todayStyles.pastTime}>{formatTimeDisplay(appt.startTime)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <TouchableOpacity style={todayStyles.viewAllBtn} onPress={onViewFullSchedule}>
        <Ionicons name="calendar-outline" size={14} color={COLORS.accent} />
        <Text style={todayStyles.viewAllText}>View Full Schedule</Text>
        <Ionicons name="arrow-forward" size={14} color={COLORS.accent} />
      </TouchableOpacity>
    </View>
  );
}

const todayStyles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.md,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  progressBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: COLORS.borderLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.success,
    borderRadius: 3,
  },
  progressText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.textMuted,
    minWidth: 80,
    textAlign: 'right',
  },
  currentCard: {
    backgroundColor: COLORS.accent + '08',
    borderRadius: BORDER_RADIUS.md,
    borderLeftWidth: 4,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  currentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  currentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.success,
  },
  currentBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.success,
    letterSpacing: 0.5,
  },
  apptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  apptIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  apptInfo: {
    flex: 1,
  },
  apptClient: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.primary,
  },
  apptType: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  apptTimeCol: {
    alignItems: 'flex-end',
  },
  apptTime: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.primary,
  },
  apptDuration: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  apptCard: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  apptCardNext: {
    backgroundColor: COLORS.accent + '08',
    borderWidth: 1,
    borderColor: COLORS.accent + '25',
  },
  nextBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: SPACING.xs,
  },
  nextBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.accent,
    letterSpacing: 0.5,
  },
  pastSection: {
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingTop: SPACING.sm,
    marginTop: SPACING.xs,
  },
  pastLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginBottom: SPACING.xs,
  },
  pastCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 4,
  },
  pastClient: {
    flex: 1,
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  pastTime: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    marginTop: SPACING.sm,
  },
  viewAllText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.accent,
  },
  emptyCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xxl,
    alignItems: 'center',
    ...SHADOWS.md,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.successLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  emptyTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: SPACING.xs,
  },
  emptySubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: SPACING.md,
  },
  viewScheduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.accent + '12',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
  },
  viewScheduleText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.accent,
  },
});

// ── Upcoming Sessions List ───────────────────────────────────────────────────

interface UpcomingSessionsProps {
  appointments: Appointment[];
  onPressAppointment: (appt: Appointment) => void;
}

export function UpcomingSessionsList({ appointments, onPressAppointment }: UpcomingSessionsProps) {
  if (appointments.length === 0) {
    return (
      <View style={upcomingStyles.emptyWrap}>
        <Ionicons name="calendar-outline" size={24} color={COLORS.textMuted} />
        <Text style={upcomingStyles.emptyText}>No upcoming sessions this week</Text>
      </View>
    );
  }

  // Group by date
  const grouped: Record<string, Appointment[]> = {};
  appointments.forEach(a => {
    if (!grouped[a.date]) grouped[a.date] = [];
    grouped[a.date].push(a);
  });

  const dateKeys = Object.keys(grouped).sort();

  return (
    <View style={upcomingStyles.container}>
      {dateKeys.map(dateKey => {
        const d = new Date(dateKey + 'T12:00:00');
        const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const dayAppts = grouped[dateKey];
        return (
          <View key={dateKey} style={upcomingStyles.dayGroup}>
            <View style={upcomingStyles.dayHeader}>
              <Ionicons name="calendar" size={12} color={COLORS.accent} />
              <Text style={upcomingStyles.dayLabel}>{dayLabel}</Text>
              <View style={upcomingStyles.dayCountBadge}>
                <Text style={upcomingStyles.dayCountText}>{dayAppts.length}</Text>
              </View>
            </View>
            {dayAppts.map(appt => {
              const apptType = appointmentTypes.find(t => t.id === appt.appointmentTypeId);
              return (
                <TouchableOpacity
                  key={appt.id}
                  style={upcomingStyles.apptRow}
                  onPress={() => onPressAppointment(appt)}
                  activeOpacity={0.7}
                >
                  <View style={[upcomingStyles.timePill, { backgroundColor: (apptType?.color || '#999') + '15' }]}>
                    <Text style={[upcomingStyles.timeText, { color: apptType?.color || '#999' }]}>
                      {formatTimeDisplay(appt.startTime)}
                    </Text>
                  </View>
                  <View style={upcomingStyles.apptDetails}>
                    <Text style={upcomingStyles.clientName} numberOfLines={1}>{appt.clientName}</Text>
                    <Text style={upcomingStyles.apptTypeName}>{apptType?.shortName || 'Session'} · {appt.duration}m</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
                </TouchableOpacity>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

const upcomingStyles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.md,
  },
  dayGroup: {
    marginBottom: SPACING.md,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  dayLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.primary,
    flex: 1,
  },
  dayCountBadge: {
    backgroundColor: COLORS.accent + '15',
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  dayCountText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '800',
    color: COLORS.accent,
  },
  apptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  timePill: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
    minWidth: 72,
    alignItems: 'center',
  },
  timeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
  },
  apptDetails: {
    flex: 1,
  },
  clientName: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.primary,
  },
  apptTypeName: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  emptyWrap: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xxl,
    alignItems: 'center',
    gap: SPACING.sm,
    ...SHADOWS.md,
  },
  emptyText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
});

// ── Quick Actions Grid ───────────────────────────────────────────────────────

interface QuickAction {
  icon: string;
  label: string;
  color: string;
  onPress: () => void;
  badge?: string;
}

interface QuickActionsGridProps {
  actions: QuickAction[];
}

export function QuickActionsGrid({ actions }: QuickActionsGridProps) {
  return (
    <View style={qaStyles.grid}>
      {actions.map((action, idx) => (
        <TouchableOpacity
          key={idx}
          style={qaStyles.card}
          onPress={action.onPress}
          activeOpacity={0.7}
        >
          <View style={[qaStyles.iconCircle, { backgroundColor: action.color + '15' }]}>
            <Ionicons name={action.icon as any} size={24} color={action.color} />
          </View>
          <Text style={qaStyles.label}>{action.label}</Text>
          {action.badge && (
            <View style={[qaStyles.badge, { backgroundColor: action.color }]}>
              <Text style={qaStyles.badgeText}>{action.badge}</Text>
            </View>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const qaStyles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  card: {
    flex: 1,
    minWidth: '45%' as any,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    alignItems: 'center',
    gap: SPACING.sm,
    ...SHADOWS.md,
    position: 'relative',
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.primary,
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.white,
  },
});

// ── Client Spotlight (Session Alerts) ────────────────────────────────────────

interface ClientSpotlightItem {
  clientId: string;
  clientName: string;
  program: string;
  sessionsUsed: number;
  sessionsAllowed: number;
  sessionsRemaining: number;
}

interface ClientSpotlightProps {
  clients: ClientSpotlightItem[];
  onViewClients: () => void;
}

export function ClientSpotlight({ clients, onViewClients }: ClientSpotlightProps) {
  if (clients.length === 0) {
    return (
      <View style={spotStyles.emptyWrap}>
        <View style={spotStyles.emptyIconWrap}>
          <Ionicons name="checkmark-done-circle" size={28} color={COLORS.success} />
        </View>
        <Text style={spotStyles.emptyTitle}>All Clients On Track</Text>
        <Text style={spotStyles.emptySubtitle}>
          No clients are near their session limits this week.
        </Text>
      </View>
    );
  }

  return (
    <View style={spotStyles.container}>
      <View style={spotStyles.headerRow}>
        <View style={spotStyles.headerIconWrap}>
          <Ionicons name="alert-circle" size={16} color={COLORS.warning} />
        </View>
        <Text style={spotStyles.headerText}>
          {clients.length} client{clients.length !== 1 ? 's' : ''} near session limit
        </Text>
      </View>
      {clients.slice(0, 5).map(client => {
        const progColor = getProgramColor(client.program);
        const pct = client.sessionsAllowed > 0 ? (client.sessionsUsed / client.sessionsAllowed) * 100 : 0;
        const isOver = client.sessionsRemaining === 0;
        return (
          <View key={client.clientId} style={spotStyles.clientRow}>
            <View style={spotStyles.clientInfo}>
              <Text style={spotStyles.clientName} numberOfLines={1}>{client.clientName}</Text>
              <View style={spotStyles.programRow}>
                <View style={[spotStyles.programDot, { backgroundColor: progColor }]} />
                <Text style={[spotStyles.programName, { color: progColor }]}>{client.program}</Text>
              </View>
            </View>
            <View style={spotStyles.sessionCol}>
              <View style={spotStyles.sessionBarBg}>
                <View
                  style={[
                    spotStyles.sessionBarFill,
                    {
                      width: `${Math.min(pct, 100)}%`,
                      backgroundColor: isOver ? COLORS.danger : COLORS.warning,
                    },
                  ]}
                />
              </View>
              <Text style={[spotStyles.sessionText, { color: isOver ? COLORS.danger : COLORS.warning }]}>
                {client.sessionsUsed}/{client.sessionsAllowed}
              </Text>
            </View>
          </View>
        );
      })}
      <TouchableOpacity style={spotStyles.viewAllBtn} onPress={onViewClients}>
        <Text style={spotStyles.viewAllText}>View All Clients</Text>
        <Ionicons name="arrow-forward" size={14} color={COLORS.accent} />
      </TouchableOpacity>
    </View>
  );
}

const spotStyles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  headerIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.warningLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.primary,
  },
  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  clientInfo: {
    flex: 1,
  },
  clientName: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.primary,
  },
  programRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  programDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  programName: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
  },
  sessionCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    width: 110,
  },
  sessionBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: COLORS.borderLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  sessionBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  sessionText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '800',
    minWidth: 28,
    textAlign: 'right',
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingTop: SPACING.md,
    marginTop: SPACING.sm,
  },
  viewAllText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.accent,
  },
  emptyWrap: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    alignItems: 'center',
    ...SHADOWS.md,
  },
  emptyIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.successLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  emptyTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.primary,
  },
  emptySubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
});

// ── Week At A Glance ─────────────────────────────────────────────────────────

interface WeekGlanceDay {
  dateKey: string;
  dayName: string;
  dayNum: number;
  count: number;
  isToday: boolean;
}

interface WeekAtGlanceProps {
  days: WeekGlanceDay[];
  onSelectDay: (dateKey: string) => void;
}

export function WeekAtGlance({ days, onSelectDay }: WeekAtGlanceProps) {
  return (
    <View style={weekStyles.container}>
      {days.map(day => (
        <TouchableOpacity
          key={day.dateKey}
          style={[weekStyles.dayCard, day.isToday && weekStyles.dayCardToday]}
          onPress={() => onSelectDay(day.dateKey)}
          activeOpacity={0.7}
        >
          <Text style={[weekStyles.dayName, day.isToday && weekStyles.dayNameToday]}>
            {day.dayName}
          </Text>
          <Text style={[weekStyles.dayNum, day.isToday && weekStyles.dayNumToday]}>
            {day.dayNum}
          </Text>
          <View style={[weekStyles.countBadge, day.isToday && weekStyles.countBadgeToday, day.count === 0 && weekStyles.countBadgeEmpty]}>
            <Text style={[weekStyles.countText, day.isToday && weekStyles.countTextToday, day.count === 0 && weekStyles.countTextEmpty]}>
              {day.count > 0 ? day.count : '-'}
            </Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const weekStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  dayCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    ...SHADOWS.sm,
  },
  dayCardToday: {
    backgroundColor: COLORS.accent,
  },
  dayName: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  dayNameToday: {
    color: 'rgba(255,255,255,0.7)',
  },
  dayNum: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.primary,
    marginTop: 2,
  },
  dayNumToday: {
    color: COLORS.white,
  },
  countBadge: {
    backgroundColor: COLORS.accent + '15',
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: SPACING.xs,
    minWidth: 24,
    alignItems: 'center',
  },
  countBadgeToday: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  countBadgeEmpty: {
    backgroundColor: COLORS.borderLight,
  },
  countText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '800',
    color: COLORS.accent,
  },
  countTextToday: {
    color: COLORS.white,
  },
  countTextEmpty: {
    color: COLORS.textMuted,
  },
});
