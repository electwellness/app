import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import { fetchClientReviews } from '../../lib/clientReviewService';


import SectionHeader from '../SectionHeader';
import { BarChart } from '../MiniChart';
import ReviewsTable, { ReviewRow } from './ReviewsTable';

const PLATFORM_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  google: { label: 'Google', color: '#4285F4', icon: 'logo-google' },
  facebook: { label: 'Facebook', color: '#1877F2', icon: 'logo-facebook' },
  yelp: { label: 'Yelp', color: '#D32323', icon: 'star' },
  thumbtack: { label: 'Thumbtack', color: '#009FD9', icon: 'thumbs-up' },
  nextdoor: { label: 'Nextdoor', color: '#8ED500', icon: 'home' },
};

const ALL_PLATFORMS = ['google', 'facebook', 'yelp', 'thumbtack', 'nextdoor'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Client name lookup removed — clients array no longer exists. Names come from DB reviews.
const clientNameMap: Record<string, string> = {};



interface ReviewsReportsPanelProps {
  franchiseFilter?: string;
}

export default function ReviewsReportsPanel({ franchiseFilter }: ReviewsReportsPanelProps) {
  const [allReviews, setAllReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);

  // Load reviews from DB, fallback to mock data
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchClientReviews({ limit: 1000 });
        if (!cancelled) {
          if (result.success && result.reviews.length > 0) {
            const mapped: ReviewRow[] = result.reviews.map(r => ({
              id: r.id,
              clientId: r.clientId,
              clientName: clientNameMap[r.clientId] || r.clientId,
              platform: r.platform,
              reviewLink: r.reviewLink,
              starRating: r.starRating,
              reviewDate: r.reviewDate,
              reviewText: r.reviewText,
              creditedTrainer: r.creditedTrainer,
              creditedDietitian: r.creditedDietitian,
              franchise: (r as any).franchise || getFranchiseForClient(r.clientId),
              addedDate: r.addedDate,
            }));
            setAllReviews(mapped);
            setUsedFallback(false);
          } else {
            // Fallback to mock data
            loadMockData();
          }
        }
      } catch {
        if (!cancelled) {
          loadMockData();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    function loadMockData() {
      setAllReviews([]);
      setUsedFallback(false);
    }


    load();
    return () => { cancelled = true; };
  }, []);

  // Apply franchise filter if provided
  const reviews = useMemo(() => {
    if (!franchiseFilter || franchiseFilter === 'all') return allReviews;
    return allReviews.filter(r => r.franchise === franchiseFilter);
  }, [allReviews, franchiseFilter]);

  // ── Computed aggregations ──

  const totalReviews = reviews.length;

  const platformCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    ALL_PLATFORMS.forEach(p => { counts[p] = 0; });
    reviews.forEach(r => { counts[r.platform] = (counts[r.platform] || 0) + 1; });
    return counts;
  }, [reviews]);

  const platformAvgRatings = useMemo(() => {
    const sums: Record<string, { total: number; count: number }> = {};
    ALL_PLATFORMS.forEach(p => { sums[p] = { total: 0, count: 0 }; });
    reviews.forEach(r => {
      if (r.starRating) {
        sums[r.platform] = sums[r.platform] || { total: 0, count: 0 };
        sums[r.platform].total += r.starRating;
        sums[r.platform].count += 1;
      }
    });
    const result: Record<string, number> = {};
    ALL_PLATFORMS.forEach(p => {
      result[p] = sums[p].count > 0 ? sums[p].total / sums[p].count : 0;
    });
    return result;
  }, [reviews]);

  const overallAvgRating = useMemo(() => {
    const rated = reviews.filter(r => r.starRating);
    if (rated.length === 0) return 0;
    return rated.reduce((s, r) => s + (r.starRating || 0), 0) / rated.length;
  }, [reviews]);

  const reviewsThisMonth = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    return reviews.filter(r => {
      const d = new Date(r.reviewDate);
      return d.getFullYear() === y && d.getMonth() === m;
    }).length;
  }, [reviews]);

  const topPlatform = useMemo(() => {
    let max = 0;
    let top = 'google';
    Object.entries(platformCounts).forEach(([p, c]) => {
      if (c > max) { max = c; top = p; }
    });
    return top;
  }, [platformCounts]);

  // Monthly trend (last 12 months)
  const monthlyTrend = useMemo(() => {
    const now = new Date();
    const months: { label: string; value: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      const count = reviews.filter(r => {
        const rd = new Date(r.reviewDate);
        return rd.getFullYear() === y && rd.getMonth() === m;
      }).length;
      months.push({ label: MONTH_NAMES[m], value: count });
    }
    return months;
  }, [reviews]);

  // Top trainers by review count
  const topTrainers = useMemo(() => {
    const counts: Record<string, number> = {};
    reviews.forEach(r => {
      if (r.creditedTrainer) {
        counts[r.creditedTrainer] = (counts[r.creditedTrainer] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));
  }, [reviews]);

  // Top dietitians by review count
  const topDietitians = useMemo(() => {
    const counts: Record<string, number> = {};
    reviews.forEach(r => {
      if (r.creditedDietitian) {
        counts[r.creditedDietitian] = (counts[r.creditedDietitian] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));
  }, [reviews]);

  // Franchise list
  const franchiseList = useMemo(() => {
    const set = new Set<string>();
    allReviews.forEach(r => { if (r.franchise) set.add(r.franchise); });
    return Array.from(set).sort();
  }, [allReviews]);

  // Platform list
  const platformList = useMemo(() => {
    const set = new Set<string>();
    reviews.forEach(r => set.add(r.platform));
    return ALL_PLATFORMS.filter(p => set.has(p));
  }, [reviews]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={styles.loadingText}>Loading reviews data...</Text>
      </View>
    );
  }

  return (
    <View>
      {/* Data Source Indicator */}
      {usedFallback && (
        <View style={styles.fallbackBanner}>
          <Ionicons name="information-circle" size={14} color={COLORS.warning} />
          <Text style={styles.fallbackText}>Showing local data. Database reviews will appear once synced.</Text>
        </View>
      )}

      {/* ── KPI Summary Cards ── */}
      <View style={styles.kpiGrid}>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBg, { backgroundColor: COLORS.accent + '20' }]}>
            <Ionicons name="chatbubbles" size={20} color={COLORS.accent} />
          </View>
          <Text style={styles.kpiValue}>{totalReviews}</Text>
          <Text style={styles.kpiLabel}>Total Reviews</Text>
        </View>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBg, { backgroundColor: '#F59E0B20' }]}>
            <Ionicons name="star" size={20} color="#F59E0B" />
          </View>
          <Text style={styles.kpiValue}>{overallAvgRating.toFixed(1)}</Text>
          <Text style={styles.kpiLabel}>Avg Rating</Text>
        </View>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBg, { backgroundColor: COLORS.success + '20' }]}>
            <Ionicons name="calendar" size={20} color={COLORS.success} />
          </View>
          <Text style={styles.kpiValue}>{reviewsThisMonth}</Text>
          <Text style={styles.kpiLabel}>This Month</Text>
        </View>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBg, { backgroundColor: getPlatformColor(topPlatform) + '20' }]}>
            <Ionicons name={PLATFORM_CONFIG[topPlatform]?.icon as any || 'globe'} size={20} color={getPlatformColor(topPlatform)} />
          </View>
          <Text style={[styles.kpiValue, { fontSize: FONT_SIZES.lg }]}>{PLATFORM_CONFIG[topPlatform]?.label}</Text>
          <Text style={styles.kpiLabel}>Top Platform</Text>
        </View>
      </View>

      {/* ── Platform Breakdown ── */}
      <SectionHeader title="Reviews by Platform" icon="apps" />
      <View style={styles.platformGrid}>
        {ALL_PLATFORMS.map(platform => {
          const config = PLATFORM_CONFIG[platform];
          const count = platformCounts[platform] || 0;
          const avg = platformAvgRatings[platform] || 0;
          const pct = totalReviews > 0 ? (count / totalReviews) * 100 : 0;
          return (
            <View key={platform} style={styles.platformCard}>
              <View style={styles.platformCardHeader}>
                <View style={[styles.platformIconBg, { backgroundColor: config.color + '15' }]}>
                  <Ionicons name={config.icon as any} size={18} color={config.color} />
                </View>
                <Text style={styles.platformName}>{config.label}</Text>
              </View>
              <View style={styles.platformStats}>
                <View style={styles.platformStat}>
                  <Text style={[styles.platformStatValue, { color: config.color }]}>{count}</Text>
                  <Text style={styles.platformStatLabel}>Reviews</Text>
                </View>
                <View style={styles.platformStatDivider} />
                <View style={styles.platformStat}>
                  <Text style={[styles.platformStatValue, { color: '#F59E0B' }]}>
                    {avg > 0 ? avg.toFixed(1) : '—'}
                  </Text>
                  <Text style={styles.platformStatLabel}>Avg {'\u2605'}</Text>
                </View>
                <View style={styles.platformStatDivider} />
                <View style={styles.platformStat}>
                  <Text style={styles.platformStatValue}>{pct.toFixed(0)}%</Text>
                  <Text style={styles.platformStatLabel}>Share</Text>
                </View>
              </View>
              <View style={styles.platformBar}>
                <View style={[styles.platformBarFill, { width: `${pct}%`, backgroundColor: config.color }]} />
              </View>
            </View>
          );
        })}
      </View>

      {/* ── Monthly Trend ── */}
      <SectionHeader title="Reviews Per Month" subtitle="Last 12 months" icon="bar-chart" />
      <View style={styles.chartCard}>
        {monthlyTrend.some(m => m.value > 0) ? (
          <BarChart data={monthlyTrend} height={140} barColor={COLORS.accent} />
        ) : (
          <View style={styles.emptyChart}>
            <Ionicons name="bar-chart-outline" size={32} color={COLORS.textMuted} />
            <Text style={styles.emptyChartText}>No review data for trend chart</Text>
          </View>
        )}
      </View>

      {/* ── Top Credited Staff ── */}
      <View style={styles.staffRow}>
        <View style={styles.staffColumn}>
          <SectionHeader title="Top Trainers" subtitle="By review credits" icon="fitness" />
          <View style={styles.staffCard}>
            {topTrainers.length === 0 ? (
              <Text style={styles.noStaffText}>No credited trainers yet</Text>
            ) : (
              topTrainers.map((t, i) => (
                <View key={t.name} style={[styles.staffRow2, i % 2 === 0 && styles.staffRowAlt]}>
                  <View style={styles.staffRank}>
                    <Text style={[styles.staffRankText, i < 3 && styles.staffRankTop]}>{i + 1}</Text>
                  </View>
                  <Text style={styles.staffName} numberOfLines={1}>{t.name}</Text>
                  <View style={styles.staffCountBadge}>
                    <Text style={styles.staffCountText}>{t.count}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>
        <View style={styles.staffColumn}>
          <SectionHeader title="Top Dietitians" subtitle="By review credits" icon="nutrition" />
          <View style={styles.staffCard}>
            {topDietitians.length === 0 ? (
              <Text style={styles.noStaffText}>No credited dietitians yet</Text>
            ) : (
              topDietitians.map((d, i) => (
                <View key={d.name} style={[styles.staffRow2, i % 2 === 0 && styles.staffRowAlt]}>
                  <View style={styles.staffRank}>
                    <Text style={[styles.staffRankText, i < 3 && styles.staffRankTop]}>{i + 1}</Text>
                  </View>
                  <Text style={styles.staffName} numberOfLines={1}>{d.name}</Text>
                  <View style={[styles.staffCountBadge, { backgroundColor: '#9b59b620' }]}>
                    <Text style={[styles.staffCountText, { color: '#9b59b6' }]}>{d.count}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>
      </View>

      {/* ── All Reviews Table ── */}
      <SectionHeader title="All Reviews" subtitle={`${totalReviews} total`} icon="list" />
      <ReviewsTable
        reviews={reviews}
        franchises={franchiseList}
        platforms={platformList}
      />
    </View>
  );
}

function getFranchiseForClient(_clientId: string): string {
  return '';
}


function getPlatformColor(platform: string): string {
  return PLATFORM_CONFIG[platform]?.color || COLORS.textMuted;
}

const styles = StyleSheet.create({
  loadingContainer: {
    padding: SPACING.xxxl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
  },
  loadingText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  fallbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.warningLight,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.md,
  },
  fallbackText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.warning,
    fontWeight: '600',
    flex: 1,
  },
  // KPI Cards
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  kpiCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    alignItems: 'center',
    gap: 6,
    ...SHADOWS.sm,
  },
  kpiIconBg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiValue: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '800',
    color: COLORS.primary,
  },
  kpiLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  // Platform Cards
  platformGrid: {
    gap: SPACING.sm,
  },
  platformCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  platformCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  platformIconBg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  platformName: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.primary,
  },
  platformStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  platformStat: {
    flex: 1,
    alignItems: 'center',
  },
  platformStatValue: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.primary,
  },
  platformStatLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '500',
    marginTop: 1,
  },
  platformStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: COLORS.borderLight,
  },
  platformBar: {
    height: 4,
    backgroundColor: COLORS.borderLight,
    borderRadius: 2,
    overflow: 'hidden',
  },
  platformBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  // Chart
  chartCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.md,
  },
  emptyChart: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxl,
    gap: SPACING.sm,
  },
  emptyChartText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
  },
  // Staff Leaderboard
  staffRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    flexWrap: 'wrap',
  },
  staffColumn: {
    flex: 1,
    minWidth: 250,
  },
  staffCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  staffRow2: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  staffRowAlt: {
    backgroundColor: COLORS.navy50 + '30',
  },
  staffRank: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffRankText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  staffRankTop: {
    color: COLORS.accent,
  },
  staffName: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.text,
  },
  staffCountBadge: {
    backgroundColor: COLORS.accent + '20',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },
  staffCountText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.accent,
  },
  noStaffText: {
    padding: SPACING.lg,
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
});
