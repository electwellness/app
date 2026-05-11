import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import { fetchPosturalAssessments } from '../../lib/clientDataService';
import type { StoredPosturalAssessment } from '../../lib/clientDataService';
import PosturalAssessmentDetailModal from './PosturalAssessmentDetailModal';
import SimpleChart from './SimpleChart';
import { onBiometricsUpdated } from '../../lib/biometricEvents';

interface Props {
  userId: string;
  // When provided, limits the list to this many most-recent assessments and
  // shows a "View all" affordance. Used for the compact panel on the
  // biometrics Metrics tab; pass `undefined` to show the full list.
  maxItems?: number;
  // Optional: parent can provide a handler for the "View all" CTA (e.g. to
  // navigate to a dedicated PosturalAssessmentHistory screen). If not
  // provided, the CTA is hidden.
  onViewAll?: () => void;
  // Show the trend chart overlay (score over time). Defaults true.
  showChart?: boolean;
  // Hide header text; useful when this panel is embedded inside a tab where
  // the screen already titles the section.
  hideTitle?: boolean;
}

const scoreColor = (s: number) =>
  s >= 80 ? '#2ecc71' : s >= 60 ? '#f39c12' : '#e74c3c';

// Build a small chart series from assessments. Orders oldest → newest so the
// chart reads left-to-right chronologically, which matches the biometric
// trend charts on the same screen.
function buildChartData(assessments: StoredPosturalAssessment[]) {
  const chrono = [...assessments].reverse();
  return chrono.map(a => {
    const d = new Date((a.measuredAt || a.createdAt.split('T')[0]) + 'T12:00:00');
    return {
      label: d.toLocaleDateString('en-US', { month: 'short' }),
      value: a.overallScore,
    };
  });
}

// Returns findings present in `prev` but absent in `current`, used by the
// list row to badge "X resolved" in the summary.
function countResolved(
  current: StoredPosturalAssessment,
  prev?: StoredPosturalAssessment
): number {
  if (!prev) return 0;
  const currentKeys = new Set(current.findings.map(f => (f.area || f.observation || '').trim().toLowerCase()));
  return prev.findings.filter(f =>
    !currentKeys.has((f.area || f.observation || '').trim().toLowerCase())
  ).length;
}

export default function PosturalAssessmentHistoryPanel({
  userId, maxItems, onViewAll, showChart = true, hideTitle,
}: Props) {
  const [assessments, setAssessments] = useState<StoredPosturalAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<StoredPosturalAssessment | null>(null);
  // The assessment chronologically BEFORE `selected`, used to compute score
  // delta + resolved findings inside the detail modal.
  const [previous, setPrevious] = useState<StoredPosturalAssessment | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const rows = await fetchPosturalAssessments(userId);
      setAssessments(rows);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // Refresh when a new assessment is saved anywhere else
  useEffect(() => {
    const unsub = onBiometricsUpdated((uid) => {
      if (uid === userId) load();
    });
    return unsub;
  }, [userId, load]);

  const openDetail = (a: StoredPosturalAssessment, index: number) => {
    // Assessments are sorted newest-first, so the "previous" (older)
    // assessment for comparison lives at index + 1.
    setPrevious(assessments[index + 1] || null);
    setSelected(a);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#9b59b6" />
      </View>
    );
  }

  if (assessments.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIcon}>
          <Ionicons name="body-outline" size={28} color="#9b59b6" />
        </View>
        <Text style={styles.emptyTitle}>No Postural Assessments Yet</Text>
        <Text style={styles.emptyText}>
          After your trainer records progress photos during a biometric assessment, the AI postural
          analysis will appear here — one entry per session.
        </Text>
      </View>
    );
  }

  const visible = typeof maxItems === 'number' ? assessments.slice(0, maxItems) : assessments;
  const chartData = buildChartData(assessments);
  const latest = assessments[0];
  const earliest = assessments[assessments.length - 1];
  const overallDelta = assessments.length > 1 ? latest.overallScore - earliest.overallScore : 0;

  return (
    <View style={styles.wrapper}>
      {!hideTitle && (
        <View style={styles.headerRow}>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>Postural Assessments</Text>
            <Text style={styles.subtitle}>
              {assessments.length} assessment{assessments.length === 1 ? '' : 's'} on file
            </Text>
          </View>
          {assessments.length > 1 && (
            <View
              style={[
                styles.trendBadge,
                { backgroundColor: overallDelta >= 0 ? '#2ecc7115' : '#e74c3c15' },
              ]}
            >
              <Ionicons
                name={overallDelta >= 0 ? 'trending-up' : 'trending-down'}
                size={12}
                color={overallDelta >= 0 ? '#2ecc71' : '#e74c3c'}
              />
              <Text style={[styles.trendText, { color: overallDelta >= 0 ? '#2ecc71' : '#e74c3c' }]}>
                {overallDelta > 0 ? '+' : ''}{overallDelta} pts
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Overall score trend line — overlays well next to biometric charts */}
      {showChart && chartData.length > 1 && (
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>Overall Score Trend</Text>
            <Text style={styles.chartSub}>
              {earliest.overallScore} → {latest.overallScore} / 100
            </Text>
          </View>
          <SimpleChart
            data={chartData}
            color="#9b59b6"
            height={140}
            type="line"
            unit=""
          />
        </View>
      )}

      {/* List of assessments */}
      {visible.map((a, i) => {
        // Use the full assessments array to resolve the "previous" entry,
        // even when we've sliced `visible` for compactness.
        const globalIndex = assessments.indexOf(a);
        const prev = assessments[globalIndex + 1];
        const resolvedCount = countResolved(a, prev);
        const prevScore = prev?.overallScore;
        const delta = typeof prevScore === 'number' ? a.overallScore - prevScore : null;
        const d = new Date((a.measuredAt || a.createdAt.split('T')[0]) + 'T12:00:00');
        const dateLabel = d.toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric',
        });
        const photos = a.photoUrls;
        const firstPhoto = photos?.front || photos?.side || photos?.back || null;

        return (
          <TouchableOpacity
            key={a.id}
            activeOpacity={0.7}
            style={styles.card}
            onPress={() => openDetail(a, globalIndex)}
          >
            {/* Thumbnail or score chip */}
            <View style={styles.thumbContainer}>
              {firstPhoto ? (
                <Image source={{ uri: firstPhoto }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumbFallback, { backgroundColor: scoreColor(a.overallScore) + '15' }]}>
                  <Text style={[styles.thumbScore, { color: scoreColor(a.overallScore) }]}>
                    {a.overallScore}
                  </Text>
                </View>
              )}
              <View style={[styles.thumbScoreBadge, { backgroundColor: scoreColor(a.overallScore) }]}>
                <Text style={styles.thumbScoreBadgeText}>{a.overallScore}</Text>
              </View>
            </View>

            {/* Meta column */}
            <View style={{ flex: 1 }}>
              <Text style={styles.cardDate}>{dateLabel}</Text>
              <Text style={styles.cardSummary} numberOfLines={2}>
                {a.summary || `${a.findings.length} findings analyzed`}
              </Text>
              <View style={styles.cardChips}>
                <View style={styles.chipNeutral}>
                  <Ionicons name="alert-circle-outline" size={10} color={COLORS.textMuted} />
                  <Text style={styles.chipNeutralText}>{a.findings.length} findings</Text>
                </View>
                {resolvedCount > 0 && (
                  <View style={styles.chipResolved}>
                    <Ionicons name="checkmark-circle" size={10} color="#fff" />
                    <Text style={styles.chipResolvedText}>{resolvedCount} resolved</Text>
                  </View>
                )}
                {delta !== null && (
                  <View
                    style={[
                      styles.chipDelta,
                      { backgroundColor: delta >= 0 ? '#2ecc7115' : '#e74c3c15' },
                    ]}
                  >
                    <Ionicons
                      name={delta >= 0 ? 'trending-up' : 'trending-down'}
                      size={10}
                      color={delta >= 0 ? '#2ecc71' : '#e74c3c'}
                    />
                    <Text style={[styles.chipDeltaText, { color: delta >= 0 ? '#2ecc71' : '#e74c3c' }]}>
                      {delta > 0 ? '+' : ''}{delta} pts
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        );
      })}

      {/* View All — only when caller provides a handler and we're truncated */}
      {typeof maxItems === 'number' && onViewAll && assessments.length > maxItems && (
        <TouchableOpacity style={styles.viewAllBtn} onPress={onViewAll} activeOpacity={0.8}>
          <Text style={styles.viewAllText}>
            View all {assessments.length} assessments
          </Text>
          <Ionicons name="chevron-forward" size={14} color="#9b59b6" />
        </TouchableOpacity>
      )}

      <PosturalAssessmentDetailModal
        visible={!!selected}
        assessment={selected}
        previousAssessment={previous}
        onClose={() => setSelected(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg },
  loadingContainer: {
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.xl, alignItems: 'center',
  },
  emptyContainer: {
    marginHorizontal: SPACING.lg, marginBottom: SPACING.lg,
    padding: SPACING.xl, borderRadius: BORDER_RADIUS.lg,
    backgroundColor: '#9b59b608', borderWidth: 1, borderColor: '#9b59b620',
    alignItems: 'center',
  },
  emptyIcon: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#9b59b615', alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  emptyTitle: { fontSize: FONT_SIZES.md, fontWeight: '800', color: COLORS.primary },
  emptyText: {
    fontSize: FONT_SIZES.xs, color: COLORS.textSecondary,
    textAlign: 'center', marginTop: 4, lineHeight: 16,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  titleBlock: { flex: 1 },
  title: { fontSize: FONT_SIZES.lg, fontWeight: '800', color: COLORS.primary },
  subtitle: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 2 },
  trendBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: BORDER_RADIUS.full,
  },
  trendText: { fontSize: FONT_SIZES.xs, fontWeight: '700' },

  chartCard: {
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, marginBottom: SPACING.sm, ...SHADOWS.sm,
  },
  chartHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  chartTitle: { fontSize: FONT_SIZES.sm, fontWeight: '800', color: COLORS.primary },
  chartSub: { fontSize: FONT_SIZES.xs, color: '#9b59b6', fontWeight: '700' },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.white, padding: SPACING.md, borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm, ...SHADOWS.sm,
  },
  thumbContainer: { position: 'relative' },
  thumb: { width: 56, height: 72, borderRadius: BORDER_RADIUS.sm, backgroundColor: COLORS.borderLight },
  thumbFallback: {
    width: 56, height: 72, borderRadius: BORDER_RADIUS.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  thumbScore: { fontSize: FONT_SIZES.xl, fontWeight: '900' },
  thumbScoreBadge: {
    position: 'absolute', bottom: -4, right: -4,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: BORDER_RADIUS.full,
    minWidth: 24, alignItems: 'center',
  },
  thumbScoreBadgeText: { fontSize: 10, color: '#fff', fontWeight: '800' },

  cardDate: { fontSize: FONT_SIZES.sm, fontWeight: '800', color: COLORS.primary },
  cardSummary: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, marginTop: 2, lineHeight: 16 },
  cardChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  chipNeutral: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2,
    backgroundColor: COLORS.borderLight, borderRadius: BORDER_RADIUS.full,
  },
  chipNeutralText: { fontSize: 9, fontWeight: '700', color: COLORS.textMuted },
  chipResolved: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2,
    backgroundColor: '#2ecc71', borderRadius: BORDER_RADIUS.full,
  },
  chipResolvedText: { fontSize: 9, fontWeight: '800', color: '#fff' },
  chipDelta: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: BORDER_RADIUS.full,
  },
  chipDeltaText: { fontSize: 9, fontWeight: '700' },

  viewAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: SPACING.sm,
  },
  viewAllText: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: '#9b59b6' },
});
