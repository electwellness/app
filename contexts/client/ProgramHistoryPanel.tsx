import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import { getProgramDefinition, ProgramDefinition } from '../../data/scheduleData';
import { fetchProgramHistory, ProgramHistoryEntry } from '../../lib/programService';

interface ProgramHistoryPanelProps {
  userId: string;
  /** Current program name from profile */
  currentProgram: string | null;
  /** Program start date from profile (YYYY-MM-DD) */
  programStartDate: string | null;
  /** Program stop date from profile (YYYY-MM-DD) */
  programStopDate: string | null;
  /** Program status from profile */
  programStatus: 'active' | 'stopped' | null;
  /** Whether to show compact view (for client profile) vs full view (for staff detail) */
  compact?: boolean;
}

function formatDisplayDate(dateStr: string | null): string {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr + 'T12:00:00');
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function getDaysBetween(startDate: string, endDate?: string | null): number {
  try {
    if (!startDate) return 0;
    const start = new Date(startDate + 'T12:00:00');
    if (isNaN(start.getTime())) return 0;
    const end = endDate ? new Date(endDate + 'T12:00:00') : new Date();
    if (isNaN(end.getTime())) return 0;
    return Math.max(0, Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  } catch {
    return 0;
  }
}

function formatDuration(days: number): string {
  if (isNaN(days) || !isFinite(days) || days < 0) return 'N/A';
  if (days < 1) return 'Less than a day';
  if (days < 7) return `${days} day${days !== 1 ? 's' : ''}`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `${weeks} week${weeks !== 1 ? 's' : ''}`;
  }
  const months = Math.floor(days / 30);
  const remainingDays = days % 30;
  if (remainingDays === 0) return `${months} month${months !== 1 ? 's' : ''}`;
  return `${months} mo, ${remainingDays} day${remainingDays !== 1 ? 's' : ''}`;
}


export default function ProgramHistoryPanel({
  userId,
  currentProgram,
  programStartDate,
  programStopDate,
  programStatus,
  compact = false,
}: ProgramHistoryPanelProps) {
  const [history, setHistory] = useState<ProgramHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await fetchProgramHistory(userId);
      setHistory(data);
    } catch (err) {
      console.error('Error loading program history:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const prog: ProgramDefinition | undefined = currentProgram ? getProgramDefinition(currentProgram) : undefined;
  const isActive = programStatus === 'active';
  const isStopped = programStatus === 'stopped';
  const hasProgram = !!currentProgram;

  const displayedHistory = showAllHistory ? history : history.slice(0, 3);
  const hasMoreHistory = history.length > 3;

  return (
    <View style={styles.container}>
      {/* ── Current Program Card ── */}
      {hasProgram ? (
        <View style={[styles.currentCard, { borderLeftColor: prog?.color || COLORS.accent }]}>
          <View style={styles.currentCardHeader}>
            <View style={styles.currentCardLeft}>
              <View style={[styles.programDot, { backgroundColor: prog?.color || COLORS.accent }]} />
              <Text style={[styles.currentProgramName, { color: prog?.color || COLORS.accent }]}>
                {currentProgram}
              </Text>
            </View>
            <View style={[
              styles.statusBadge,
              { backgroundColor: isActive ? COLORS.success + '15' : COLORS.textMuted + '15' },
            ]}>
              <View style={[
                styles.statusDot,
                { backgroundColor: isActive ? COLORS.success : COLORS.textMuted },
              ]} />
              <Text style={[
                styles.statusText,
                { color: isActive ? COLORS.success : COLORS.textMuted },
              ]}>
                {isActive ? 'Active' : 'Stopped'}
              </Text>
            </View>
          </View>

          {/* Program Details */}
          {prog && !compact && (
            <View style={styles.programMeta}>
              <View style={styles.metaItem}>
                <Ionicons name="repeat" size={12} color={COLORS.textMuted} />
                <Text style={styles.metaText}>{prog.sessionsPerWeek}x/week</Text>
              </View>
              <View style={styles.metaDot} />
              <View style={styles.metaItem}>
                <Ionicons name="barbell-outline" size={12} color={COLORS.textMuted} />
                <Text style={styles.metaText}>{prog.sessionsPerCycle} sessions/cycle</Text>
              </View>
              <View style={styles.metaDot} />
              <View style={styles.metaItem}>
                <Ionicons name="card-outline" size={12} color={COLORS.textMuted} />
                <Text style={styles.metaText}>${prog.monthlyCost.toLocaleString()}/mo</Text>
              </View>
              <View style={styles.metaDot} />
              <View style={styles.metaItem}>
                <Ionicons name="layers-outline" size={12} color={COLORS.textMuted} />
                <Text style={styles.metaText}>{prog.tier} {prog.variant}</Text>
              </View>
            </View>
          )}


          {/* Dates Row */}
          <View style={styles.datesRow}>
            <View style={styles.dateBlock}>
              <View style={styles.dateIconRow}>
                <Ionicons name="play-circle" size={14} color={COLORS.success} />
                <Text style={styles.dateLabel}>Start Date</Text>
              </View>
              <Text style={styles.dateValue}>
                {programStartDate ? formatDisplayDate(programStartDate) : 'Not set'}
              </Text>
            </View>

            <View style={styles.dateSeparator}>
              <Ionicons name="arrow-forward" size={14} color={COLORS.borderLight} />
            </View>

            <View style={styles.dateBlock}>
              <View style={styles.dateIconRow}>
                <Ionicons
                  name={programStopDate ? 'stop-circle' : 'time-outline'}
                  size={14}
                  color={programStopDate ? COLORS.danger : COLORS.textMuted}
                />
                <Text style={[styles.dateLabel, programStopDate && { color: COLORS.danger }]}>
                  {programStopDate ? 'End Date' : 'End Date'}
                </Text>
              </View>
              <Text style={[styles.dateValue, programStopDate && { color: COLORS.danger }]}>
                {programStopDate ? formatDisplayDate(programStopDate) : 'Ongoing'}
              </Text>
            </View>
          </View>

          {/* Duration */}
          {programStartDate && (
            <View style={styles.durationRow}>
              <Ionicons name="hourglass-outline" size={12} color={COLORS.accent} />
              <Text style={styles.durationText}>
                {formatDuration(getDaysBetween(programStartDate, programStopDate))}
                {isActive ? ' (and counting)' : ' total'}
              </Text>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.noProgramCard}>
          <Ionicons name="barbell-outline" size={24} color={COLORS.textMuted} />
          <Text style={styles.noProgramTitle}>No Program Assigned</Text>
          <Text style={styles.noProgramSub}>
            A program has not been assigned yet.
          </Text>
        </View>
      )}

      {/* ── Program History Timeline ── */}
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={COLORS.accent} />
          <Text style={styles.loadingText}>Loading program history...</Text>
        </View>
      ) : history.length > 0 ? (
        <View style={styles.historySection}>
          <View style={styles.historySectionHeader}>
            <Ionicons name="time-outline" size={16} color={COLORS.textSecondary} />
            <Text style={styles.historyTitle}>Program History</Text>
            <View style={styles.historyCountBadge}>
              <Text style={styles.historyCountText}>{history.length}</Text>
            </View>
          </View>

          <View style={styles.timeline}>
            {displayedHistory.map((entry, idx) => {
              const entryProg = getProgramDefinition(entry.program);
              const entryColor = entryProg?.color || '#94A3B8';
              const isFirst = idx === 0;
              const isLast = idx === displayedHistory.length - 1;
              const duration = getDaysBetween(entry.start_date, entry.stop_date);

              return (
                <View key={entry.id || idx} style={styles.timelineItem}>
                  {/* Timeline line */}
                  <View style={styles.timelineLineContainer}>
                    {!isFirst && <View style={styles.timelineLineTop} />}
                    <View style={[
                      styles.timelineDot,
                      {
                        backgroundColor: entry.status === 'active' ? COLORS.success : entryColor,
                        borderColor: entry.status === 'active' ? COLORS.success + '30' : entryColor + '30',
                      },
                    ]} />
                    {!isLast && <View style={styles.timelineLineBottom} />}
                  </View>

                  {/* Content */}
                  <View style={[
                    styles.timelineContent,
                    entry.status === 'active' && styles.timelineContentActive,
                  ]}>
                    <View style={styles.timelineHeader}>
                      <Text style={[styles.timelineProgram, { color: entryColor }]}>
                        {entry.program}
                      </Text>
                      <View style={[
                        styles.timelineStatusBadge,
                        {
                          backgroundColor: entry.status === 'active'
                            ? COLORS.success + '15'
                            : COLORS.textMuted + '12',
                        },
                      ]}>
                        <Text style={[
                          styles.timelineStatusText,
                          {
                            color: entry.status === 'active'
                              ? COLORS.success
                              : COLORS.textMuted,
                          },
                        ]}>
                          {entry.status === 'active' ? 'Active' : 'Ended'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.timelineDatesRow}>
                      <Text style={styles.timelineDateText}>
                        {formatDisplayDate(entry.start_date)}
                      </Text>
                      <Ionicons name="arrow-forward" size={10} color={COLORS.textMuted} />
                      <Text style={[
                        styles.timelineDateText,
                        !entry.stop_date && { color: COLORS.success, fontWeight: '700' },
                      ]}>
                        {entry.stop_date ? formatDisplayDate(entry.stop_date) : 'Present'}
                      </Text>
                      <Text style={styles.timelineDuration}>
                        ({formatDuration(duration)})
                      </Text>
                    </View>

                    {entry.notes && (
                      <Text style={styles.timelineNotes} numberOfLines={2}>
                        {entry.notes}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>

          {/* Show More / Show Less */}
          {hasMoreHistory && (
            <TouchableOpacity
              style={styles.showMoreBtn}
              onPress={() => setShowAllHistory(!showAllHistory)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={showAllHistory ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={COLORS.accent}
              />
              <Text style={styles.showMoreText}>
                {showAllHistory
                  ? 'Show Less'
                  : `Show ${history.length - 3} More`}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: SPACING.md,
  },

  // ── Current Program Card ──
  currentCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    borderLeftWidth: 4,
    ...SHADOWS.sm,
  },
  currentCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  currentCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
  },
  programDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  currentProgramName: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    flex: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
  },

  // Program meta
  programMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
    flexWrap: 'wrap',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: COLORS.textMuted,
  },

  // Dates row
  datesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  dateBlock: {
    flex: 1,
  },
  dateIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  dateLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  dateValue: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.text,
    marginLeft: 18,
  },
  dateSeparator: {
    paddingHorizontal: SPACING.sm,
  },

  // Duration
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  durationText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.accent,
  },

  // No program
  noProgramCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    alignItems: 'center',
    gap: SPACING.sm,
    ...SHADOWS.sm,
  },
  noProgramTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  noProgramSub: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
  },

  // Loading
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  loadingText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '500',
  },

  // ── History Section ──
  historySection: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  historySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  historyTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.textSecondary,
    flex: 1,
  },
  historyCountBadge: {
    backgroundColor: COLORS.accent + '15',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },
  historyCountText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.accent,
  },

  // Timeline
  timeline: {
    gap: 0,
  },
  timelineItem: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  timelineLineContainer: {
    width: 20,
    alignItems: 'center',
  },
  timelineLineTop: {
    width: 2,
    height: 8,
    backgroundColor: COLORS.borderLight,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  timelineLineBottom: {
    width: 2,
    flex: 1,
    backgroundColor: COLORS.borderLight,
  },
  timelineContent: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  timelineContentActive: {
    borderColor: COLORS.success + '30',
    backgroundColor: COLORS.success + '06',
  },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  timelineProgram: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    flex: 1,
  },
  timelineStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: BORDER_RADIUS.full,
  },
  timelineStatusText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  timelineDatesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  timelineDateText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  timelineDuration: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '500',
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  timelineNotes: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    marginTop: 4,
    lineHeight: 16,
  },

  // Show More
  showMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: SPACING.sm,
    marginTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  showMoreText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.accent,
  },
});
