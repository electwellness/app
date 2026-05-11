import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import SectionHeader from '../SectionHeader';
import SEOPositionChart from './SEOPositionChart';
import SEOEntryModal from './SEOEntryModal';
import SEOMassImportModal from './SEOMassImportModal';
import {
  SEOKeywordEntry, SEOTrendPoint, DEFAULT_KEYWORDS,
  getCurrentMonth, getMonthLabel, getMonthsForYear, getAvailableYears,
  getMonthlyData, getTrendData, buildTrendDataFromMonthly,
} from '../../lib/seoService';


export default function SEOReportPanel() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'master_admin';

  // State
  const [entries, setEntries] = useState<SEOKeywordEntry[]>([]);
  const [trendData, setTrendData] = useState<SEOTrendPoint[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Entry modal state
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<SEOKeywordEntry | null>(null);

  // Mass import modal state
  const [showMassImport, setShowMassImport] = useState(false);


  // Year navigation
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const availableYears = useMemo(() => getAvailableYears(), []);
  const monthOptions = useMemo(() => getMonthsForYear(selectedYear), [selectedYear]);

  // Expanded keyword detail
  const [expandedKeyword, setExpandedKeyword] = useState<string | null>(null);

  // Sync year when month changes
  useEffect(() => {
    const yearFromMonth = parseInt(selectedMonth.split('-')[0]);
    if (yearFromMonth !== selectedYear) {
      setSelectedYear(yearFromMonth);
    }
  }, [selectedMonth]);

  // Year nav handlers
  const handlePreviousYear = useCallback(() => {
    const minYear = availableYears[availableYears.length - 1];
    if (selectedYear > minYear) {
      const newYear = selectedYear - 1;
      setSelectedYear(newYear);
      const months = getMonthsForYear(newYear);
      if (months.length > 0) setSelectedMonth(months[0]);
    }
  }, [selectedYear, availableYears]);

  const handleNextYear = useCallback(() => {
    if (selectedYear < currentYear) {
      const newYear = selectedYear + 1;
      setSelectedYear(newYear);
      const months = getMonthsForYear(newYear);
      if (months.length > 0) setSelectedMonth(months[0]);
    }
  }, [selectedYear, currentYear]);

  const handleJumpToYear = useCallback((year: number) => {
    setSelectedYear(year);
    const months = getMonthsForYear(year);
    if (months.length > 0) setSelectedMonth(months[0]);
    setShowYearPicker(false);
  }, []);

  const handleJumpToToday = useCallback(() => {
    setSelectedMonth(getCurrentMonth());
    setSelectedYear(currentYear);
  }, [currentYear]);

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const startMonth = `${selectedYear}-01`;
    const endMonth = selectedYear === currentYear ? getCurrentMonth() : `${selectedYear}-12`;
    try {
      // Fetch current month entries
      const monthlyData = await getMonthlyData(selectedMonth);
      setEntries(monthlyData);

      // Fetch trend data via the dedicated endpoint (now fixed with proper PostgREST range filtering)
      let trends: SEOTrendPoint[] = [];
      try {
        trends = await getTrendData(startMonth, endMonth);
      } catch (trendErr) {
        console.log('getTrendData failed, will try fallback:', trendErr);
      }

      // If the dedicated trend endpoint returned nothing, build trend data locally as fallback
      if (trends.length === 0) {
        try {
          trends = await buildTrendDataFromMonthly(startMonth, endMonth);
        } catch (fallbackErr) {
          console.log('buildTrendDataFromMonthly fallback failed:', fallbackErr);
        }
      }

      setTrendData(trends);
    } catch (err: any) {
      console.log('SEO fetch error:', err);
      setError(err.message || 'Failed to load SEO data');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedYear, currentYear]);


  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Open add entry modal
  const handleAddEntry = useCallback(() => {
    setEditingEntry(null);
    setShowEntryModal(true);
  }, []);

  // Open edit entry modal
  const handleEditEntry = useCallback((entry: SEOKeywordEntry) => {
    setEditingEntry(entry);
    setShowEntryModal(true);
  }, []);

  // After save/delete, refresh data
  const handleEntrySaved = useCallback(() => {
    fetchData();
  }, [fetchData]);

  // KPI calculations for current month
  const kpis = useMemo(() => {
    if (entries.length === 0) return { avgPosition: 0, totalImpressions: 0, totalClicks: 0, avgCTR: 0, totalQueries: 0, keywordsTracked: 0 };

    const totalImpressions = entries.reduce((s, e) => s + (Number(e.impressions) || 0), 0);
    const totalClicks = entries.reduce((s, e) => s + (Number(e.clicks) || 0), 0);
    const totalQueries = entries.reduce((s, e) => s + (Number(e.queries) || 0), 0);
    const positionEntries = entries.filter(e => (Number(e.position) || 0) > 0);
    const avgPosition = positionEntries.length > 0
      ? positionEntries.reduce((s, e) => s + (Number(e.position) || 0), 0) / positionEntries.length
      : 0;
    const avgCTR = entries.length > 0
      ? entries.reduce((s, e) => s + (Number(e.ctr) || 0), 0) / entries.length
      : 0;

    return { avgPosition, totalImpressions, totalClicks, avgCTR, totalQueries, keywordsTracked: entries.length };
  }, [entries]);


  // Chart data — filter out entries with position 0 so they don't get dropped silently
  const chartData = useMemo(() => {
    return trendData
      .filter(t => (Number(t.position) || 0) > 0)
      .map(t => ({
        month: t.month,
        keyword: t.keyword,
        position: Number(t.position) || 0,
      }));
  }, [trendData]);

  // Derive keywords dynamically from the actual trend data instead of only DEFAULT_KEYWORDS
  const chartKeywords = useMemo(() => {
    const fromData = [...new Set(chartData.map(d => d.keyword))];
    if (fromData.length > 0) return fromData;
    // Fallback to DEFAULT_KEYWORDS if no data
    return DEFAULT_KEYWORDS;
  }, [chartData]);

  // Trend subtitle
  const trendSubtitle = useMemo(() => {
    const endLabel = selectedYear === currentYear
      ? getMonthLabel(getCurrentMonth()).split(' ')[0]
      : 'Dec';
    return `Jan – ${endLabel} ${selectedYear}`;
  }, [selectedYear, currentYear]);


  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={styles.loadingText}>Loading SEO data...</Text>
      </View>
    );
  }
  return (
    <View>

      {/* Error Banner */}
      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={20} color={COLORS.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={fetchData}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.headerRow}>
        <View style={styles.headerInfo}>
          <View style={styles.headerIconContainer}>
            <Ionicons name="analytics" size={22} color={COLORS.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>SEO Performance</Text>
            <Text style={styles.headerSubtitle}>US Traffic  |  New Users Only</Text>
          </View>
        </View>

        {/* Action buttons on their own row */}
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={fetchData}
            activeOpacity={0.7}
          >
            <Ionicons name="refresh" size={18} color={COLORS.textSecondary} />
          </TouchableOpacity>
          {isAdmin && (
            <TouchableOpacity
              style={styles.massImportBtn}
              onPress={() => setShowMassImport(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="cloud-upload-outline" size={16} color={COLORS.accent} />
              <Text style={styles.massImportBtnText}>Import</Text>
            </TouchableOpacity>
          )}
          {isAdmin && (
            <TouchableOpacity
              style={styles.addEntryBtn}
              onPress={handleAddEntry}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={18} color={COLORS.white} />
              <Text style={styles.addEntryBtnText}>Add Entry</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>




      {/* Filter Badges */}
      <View style={styles.filterBadgesRow}>
        <View style={styles.filterBadge}>
          <Ionicons name="flag-outline" size={12} color={COLORS.accent} />
          <Text style={styles.filterBadgeText}>United States</Text>
        </View>
        <View style={styles.filterBadge}>
          <Ionicons name="person-add-outline" size={12} color={COLORS.accent} />
          <Text style={styles.filterBadgeText}>New Users</Text>
        </View>
        <View style={styles.filterBadge}>
          <Ionicons name="calendar-outline" size={12} color={COLORS.accent} />
          <Text style={styles.filterBadgeText}>{getMonthLabel(selectedMonth)}</Text>
        </View>
      </View>

      {/* ── Year Navigation ── */}
      <View style={styles.yearNavContainer}>
        <View style={styles.yearNavRow}>
          <TouchableOpacity
            style={[styles.yearNavArrow, selectedYear <= availableYears[availableYears.length - 1] && styles.yearNavArrowDisabled]}
            onPress={handlePreviousYear}
            disabled={selectedYear <= availableYears[availableYears.length - 1]}
          >
            <Ionicons name="chevron-back" size={20} color={selectedYear <= availableYears[availableYears.length - 1] ? COLORS.border : COLORS.primary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.yearNavLabel} onPress={() => setShowYearPicker(!showYearPicker)}>
            <Ionicons name="calendar-outline" size={16} color={COLORS.accent} />
            <Text style={styles.yearNavLabelText}>{selectedYear}</Text>
            <Ionicons name={showYearPicker ? 'chevron-up' : 'chevron-down'} size={14} color={COLORS.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.yearNavArrow, selectedYear >= currentYear && styles.yearNavArrowDisabled]}
            onPress={handleNextYear}
            disabled={selectedYear >= currentYear}
          >
            <Ionicons name="chevron-forward" size={20} color={selectedYear >= currentYear ? COLORS.border : COLORS.primary} />
          </TouchableOpacity>

          {selectedMonth !== getCurrentMonth() && (
            <TouchableOpacity style={styles.todayBtn} onPress={handleJumpToToday}>
              <Ionicons name="today-outline" size={14} color={COLORS.accent} />
              <Text style={styles.todayBtnText}>Today</Text>
            </TouchableOpacity>
          )}
        </View>

        {showYearPicker && (
          <View style={styles.yearPickerDropdown}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.yearPickerContent}>
              {availableYears.map(year => (
                <TouchableOpacity
                  key={year}
                  style={[styles.yearPickerChip, year === selectedYear && styles.yearPickerChipActive]}
                  onPress={() => handleJumpToYear(year)}
                >
                  <Text style={[styles.yearPickerChipText, year === selectedYear && styles.yearPickerChipTextActive]}>{year}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      {/* ── Month Selector ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.monthScroll} contentContainerStyle={styles.monthScrollContent}>
        {monthOptions.map(m => {
          const [, monthNum] = m.split('-');
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          const shortLabel = monthNames[parseInt(monthNum) - 1] || monthNum;
          return (
            <TouchableOpacity
              key={m}
              style={[styles.monthChip, m === selectedMonth && styles.monthChipActive]}
              onPress={() => setSelectedMonth(m)}
            >
              <Text style={[styles.monthChipText, m === selectedMonth && styles.monthChipTextActive]}>{shortLabel}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── KPI Summary Cards ── */}
      <View style={styles.kpiGrid}>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBg, { backgroundColor: COLORS.accent + '20' }]}>
            <Ionicons name="trending-up" size={20} color={COLORS.accent} />
          </View>
          <Text style={styles.kpiValue}>{kpis.avgPosition > 0 ? kpis.avgPosition.toFixed(1) : '--'}</Text>
          <Text style={styles.kpiLabel}>Avg Position</Text>
        </View>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBg, { backgroundColor: COLORS.info + '20' }]}>
            <Ionicons name="eye-outline" size={20} color={COLORS.info} />
          </View>
          <Text style={styles.kpiValue}>{kpis.totalImpressions > 0 ? kpis.totalImpressions.toLocaleString() : '--'}</Text>
          <Text style={styles.kpiLabel}>Impressions</Text>
        </View>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBg, { backgroundColor: COLORS.success + '20' }]}>
            <Ionicons name="hand-left-outline" size={20} color={COLORS.success} />
          </View>
          <Text style={styles.kpiValue}>{kpis.totalClicks > 0 ? kpis.totalClicks.toLocaleString() : '--'}</Text>
          <Text style={styles.kpiLabel}>Total Clicks</Text>
        </View>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBg, { backgroundColor: '#9b59b6' + '20' }]}>
            <Ionicons name="analytics" size={20} color="#9b59b6" />
          </View>
          <Text style={styles.kpiValue}>{kpis.avgCTR > 0 ? kpis.avgCTR.toFixed(2) + '%' : '--'}</Text>
          <Text style={styles.kpiLabel}>Avg CTR</Text>
        </View>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBg, { backgroundColor: COLORS.warning + '20' }]}>
            <Ionicons name="search-outline" size={20} color={COLORS.warning} />
          </View>
          <Text style={styles.kpiValue}>{kpis.totalQueries > 0 ? kpis.totalQueries.toLocaleString() : '--'}</Text>
          <Text style={styles.kpiLabel}>Total Queries</Text>
        </View>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBg, { backgroundColor: COLORS.primary + '20' }]}>
            <Ionicons name="key-outline" size={20} color={COLORS.primary} />
          </View>
          <Text style={styles.kpiValue}>{kpis.keywordsTracked || '--'}</Text>
          <Text style={styles.kpiLabel}>Keywords</Text>
        </View>
      </View>

      {/* ── Position Trend Chart ── */}
      <SectionHeader title="Keyword Position Trend" subtitle={trendSubtitle} icon="trending-up" />
      <View style={styles.chartCard}>
        <SEOPositionChart
          data={chartData}
          keywords={chartKeywords}
          height={240}
        />
      </View>


      {/* ── Keyword Rankings ── */}
      {entries.length > 0 && (
        <>
          <SectionHeader title="Keyword Rankings" subtitle={`${getMonthLabel(selectedMonth)} — US / New Users`} icon="podium-outline" />
           <View style={styles.rankingsGrid}>
            {[...entries]
              .filter(e => (Number(e.position) || 0) > 0)
              .sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0))
              .map((entry, i) => {
                const isExpanded = expandedKeyword === entry.keyword;
                const pos = Number(entry.position) || 0;
                const imp = Number(entry.impressions) || 0;
                const clk = Number(entry.clicks) || 0;
                const qry = Number(entry.queries) || 0;
                const ctrVal = Number(entry.ctr) || 0;
                return (
                  <TouchableOpacity
                    key={entry.id}
                    style={[styles.rankingCard, isExpanded && styles.rankingCardExpanded]}
                    onPress={() => setExpandedKeyword(isExpanded ? null : entry.keyword)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.rankingCardMain}>
                      <View style={[styles.rankBadge, i === 0 && styles.rankBadgeGold, i === 1 && styles.rankBadgeSilver, i === 2 && styles.rankBadgeBronze]}>
                        <Text style={styles.rankBadgeText}>#{i + 1}</Text>
                      </View>
                      <View style={styles.rankingInfo}>
                        <Text style={styles.rankingKeyword} numberOfLines={1}>{entry.keyword}</Text>
                        <Text style={styles.rankingDetail}>
                          {imp.toLocaleString()} impressions | {clk} clicks
                        </Text>
                      </View>
                      <View style={styles.rankingPosition}>
                        <Text style={[styles.rankingPositionValue, { color: pos <= 10 ? COLORS.success : pos <= 30 ? COLORS.warning : COLORS.danger }]}>
                          {pos.toFixed(1)}
                        </Text>
                        <Text style={styles.rankingPositionLabel}>position</Text>
                      </View>
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color={COLORS.textMuted}
                        style={{ marginLeft: 4 }}
                      />
                    </View>

                    {isExpanded && (
                      <View style={styles.rankingExpandedDetail}>
                        <View style={styles.rankingDetailGrid}>
                          <View style={styles.rankingDetailItem}>
                            <Text style={styles.rankingDetailLabel}>Queries</Text>
                            <Text style={styles.rankingDetailValue}>{qry.toLocaleString()}</Text>
                          </View>
                          <View style={styles.rankingDetailItem}>
                            <Text style={styles.rankingDetailLabel}>Impressions</Text>
                            <Text style={styles.rankingDetailValue}>{imp.toLocaleString()}</Text>
                          </View>
                          <View style={styles.rankingDetailItem}>
                            <Text style={styles.rankingDetailLabel}>Clicks</Text>
                            <Text style={styles.rankingDetailValue}>{clk.toLocaleString()}</Text>
                          </View>
                          <View style={styles.rankingDetailItem}>
                            <Text style={styles.rankingDetailLabel}>CTR</Text>
                            <Text style={styles.rankingDetailValue}>{ctrVal.toFixed(2)}%</Text>
                          </View>
                        </View>
                        {/* Edit button */}
                        {isAdmin && (
                          <TouchableOpacity
                            style={styles.editEntryBtn}
                            onPress={() => handleEditEntry(entry)}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="create-outline" size={14} color={COLORS.accent} />
                            <Text style={styles.editEntryBtnText}>Edit Entry</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}

                  </TouchableOpacity>
                );
              })}
          </View>
        </>
      )}

      {/* Empty state when no data */}
      {entries.length === 0 && !loading && (
        <View style={styles.emptyPrompt}>
          <View style={styles.emptyPromptIcon}>
            <Ionicons name="analytics-outline" size={40} color={COLORS.accent} />
          </View>
          <Text style={styles.emptyPromptTitle}>No SEO Data for {getMonthLabel(selectedMonth)}</Text>
          <Text style={styles.emptyPromptText}>
            Add keyword data manually to start tracking your SEO performance for US new-user traffic.
          </Text>
          {isAdmin && (
            <TouchableOpacity
              style={styles.emptyPromptAddBtn}
              onPress={handleAddEntry}
            >
              <Ionicons name="add-circle" size={18} color={COLORS.white} />
              <Text style={styles.emptyPromptAddBtnText}>Add First Entry</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={{ height: 20 }} />

      {/* ── Entry Modal ── */}
      <SEOEntryModal
        visible={showEntryModal}
        onClose={() => {
          setShowEntryModal(false);
          setEditingEntry(null);
        }}
        onSaved={handleEntrySaved}
        month={selectedMonth}
        existingEntry={editingEntry}
      />

      {/* ── Mass Import Modal ── */}
      <SEOMassImportModal
        visible={showMassImport}
        onClose={() => setShowMassImport(false)}
        onComplete={fetchData}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxxl,
    gap: SPACING.md,
  },
  loadingText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.dangerLight,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  errorText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.danger,
    fontWeight: '600',
  },
  retryText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.accent,
  },
  headerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
    ...SHADOWS.md,
  },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    flex: 1,
    minWidth: 200,
  },
  headerIconContainer: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center', ...SHADOWS.sm,
  },
  headerTitle: { fontSize: FONT_SIZES.lg, fontWeight: '800', color: COLORS.primary },
  headerSubtitle: {
    fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '600',
    marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flexWrap: 'wrap' },

  refreshBtn: {
    width: 36, height: 36, borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  massImportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md, borderWidth: 1,
    borderColor: COLORS.accent + '40', backgroundColor: COLORS.white,
  },
  massImportBtnText: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.accent },
  addEntryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.accent, paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.md, ...SHADOWS.sm,
  },
  addEntryBtnText: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.white },
  filterBadgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.md },
  filterBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.accent + '10', paddingHorizontal: SPACING.md, paddingVertical: 5,
    borderRadius: BORDER_RADIUS.full, borderWidth: 1, borderColor: COLORS.accent + '20',
  },
  filterBadgeText: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: COLORS.accent },
  yearNavContainer: { marginBottom: SPACING.sm },
  yearNavRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  yearNavArrow: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.white,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.sm,
  },
  yearNavArrowDisabled: { opacity: 0.4 },
  yearNavLabel: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.accent + '30', ...SHADOWS.sm,
  },
  yearNavLabelText: { fontSize: FONT_SIZES.lg, fontWeight: '800', color: COLORS.primary },
  todayBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: SPACING.sm,
    paddingHorizontal: SPACING.md, paddingVertical: 6, borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.accent + '15', borderWidth: 1, borderColor: COLORS.accent + '30',
  },
  todayBtnText: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.accent },
  yearPickerDropdown: {
    marginTop: SPACING.sm, backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.md,
  },
  yearPickerContent: { gap: SPACING.sm, paddingHorizontal: SPACING.xs },
  yearPickerChip: {
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border,
  },
  yearPickerChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  yearPickerChipText: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.textSecondary },
  yearPickerChipTextActive: { color: COLORS.white },
  monthScroll: { marginBottom: SPACING.md, flexGrow: 0 },
  monthScrollContent: { gap: SPACING.sm, paddingRight: SPACING.md },
  monthChip: {
    paddingHorizontal: SPACING.md, paddingVertical: 6, borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border,
  },
  monthChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  monthChipText: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: COLORS.textSecondary },
  monthChipTextActive: { color: COLORS.white },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.md },
  kpiCard: {
    flex: 1, minWidth: '30%', backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, alignItems: 'center', gap: 4, ...SHADOWS.sm,
  },
  kpiIconBg: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  kpiValue: { fontSize: FONT_SIZES.xl, fontWeight: '800', color: COLORS.primary },
  kpiLabel: { fontSize: 9, color: COLORS.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  chartCard: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg, ...SHADOWS.md },
  rankingsGrid: { gap: SPACING.sm },
  rankingCard: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, ...SHADOWS.sm },
  rankingCardExpanded: { borderWidth: 1, borderColor: COLORS.accent + '30' },
  rankingCardMain: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  rankBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  rankBadgeGold: { backgroundColor: '#ffd700' + '30' },
  rankBadgeSilver: { backgroundColor: '#c0c0c0' + '30' },
  rankBadgeBronze: { backgroundColor: '#cd7f32' + '30' },
  rankBadgeText: { fontSize: FONT_SIZES.sm, fontWeight: '800', color: COLORS.primary },
  rankingInfo: { flex: 1 },
  rankingKeyword: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.text },
  rankingDetail: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 2 },
  rankingPosition: { alignItems: 'flex-end' },
  rankingPositionValue: { fontSize: FONT_SIZES.xl, fontWeight: '800' },
  rankingPositionLabel: { fontSize: 9, color: COLORS.textMuted, fontWeight: '600', textTransform: 'uppercase' },
  rankingExpandedDetail: { marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  rankingDetailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  rankingDetailItem: { flex: 1, minWidth: '22%', backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.sm, padding: SPACING.sm, alignItems: 'center' },
  rankingDetailLabel: { fontSize: 9, color: COLORS.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 2 },
  rankingDetailValue: { fontSize: FONT_SIZES.md, fontWeight: '800', color: COLORS.primary },
  editEntryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs,
    marginTop: SPACING.md, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.accent + '10', borderWidth: 1, borderColor: COLORS.accent + '20',
  },
  editEntryBtnText: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.accent },
  emptyPrompt: {
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg, padding: SPACING.xl,
    alignItems: 'center', marginTop: SPACING.md, borderWidth: 1,
    borderColor: COLORS.accent + '20', borderStyle: 'dashed' as any,
  },
  emptyPromptIcon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.accent + '12',
    alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md,
  },
  emptyPromptTitle: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.primary, marginBottom: SPACING.sm, textAlign: 'center' },
  emptyPromptText: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: SPACING.lg },
  emptyPromptAddBtn: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.accent, paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.md, ...SHADOWS.sm,
  },
  emptyPromptAddBtnText: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.white },
});

