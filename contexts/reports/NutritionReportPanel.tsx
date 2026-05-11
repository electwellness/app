import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import SectionHeader from '../SectionHeader';
import { BarChart, DonutChart } from '../MiniChart';
import { supabase } from '@/app/lib/supabase';
import VideoChatModal from '../VideoChatModal';


// ── Types ──

interface ProgramHistoryRow {
  id: string;
  user_id: string;
  program: string;
  start_date: string;
  stop_date: string | null;
  status: 'active' | 'stopped';
  has_nutrition: boolean;
  created_at: string;
}

interface UserProfileRow {
  id: string;
  full_name: string | null;
  franchise: string | null;
  contact_status: string | null;
  program: string | null;
  has_nutrition: boolean | null;
}

interface ClientNutritionRow {
  userId: string;
  fullName: string;
  franchise: string;
  currentProgram: string;
  contactStatus: string;
  hasNutrition: boolean;
  programStatus: 'active' | 'stopped';
  startDate: string;
}

interface ProgramTierStat {
  program: string;
  total: number;
  withNutrition: number;
  rate: number;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── Main Component ──

export default function NutritionReportPanel() {
  const { profile } = useAuth();

  // Data state
  const [programHistory, setProgramHistory] = useState<ProgramHistoryRow[]>([]);
  const [userProfiles, setUserProfiles] = useState<UserProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'stopped'>('all');
  const [filterNutrition, setFilterNutrition] = useState<'all' | 'yes' | 'no'>('all');
  const [filterFranchise, setFilterFranchise] = useState<string>('all');
  const [filterProgram, setFilterProgram] = useState<string>('all');

  // Sort state for table
  const [sortField, setSortField] = useState<'name' | 'program' | 'franchise' | 'nutrition'>('name');
  const [sortAsc, setSortAsc] = useState(true);

  // Video chat state
  const [showVideoChat, setShowVideoChat] = useState(false);


  // ── Data Fetching ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch program history
      const { data: historyData, error: historyError } = await supabase
        .from('client_program_history')
        .select('id, user_id, program, start_date, stop_date, status, has_nutrition, created_at')
        .order('start_date', { ascending: false });

      if (historyError) throw historyError;

      // Fetch user profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from('user_profiles')
        .select('id, full_name, franchise, contact_status, program, has_nutrition');

      if (profilesError) throw profilesError;

      setProgramHistory((historyData || []) as ProgramHistoryRow[]);
      setUserProfiles((profilesData || []) as UserProfileRow[]);
    } catch (err: any) {
      console.error('Error fetching nutrition report data:', err);
      setError(err.message || 'Failed to load nutrition data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Role-filtered history ──
  const filteredHistory = useMemo(() => {
    if (!profile) return programHistory;
    if (profile.role === 'admin') return programHistory;

    // Build a set of user IDs that belong to this user's franchise
    const franchiseUserIds = new Set(
      userProfiles
        .filter(p => p.franchise === profile.franchise)
        .map(p => p.id)
    );

    if (profile.role === 'franchise_manager' || profile.role === 'trainer' || profile.role === 'dietitian') {
      if (!profile.franchise) return programHistory;
      return programHistory.filter(h => franchiseUserIds.has(h.user_id));
    }

    return programHistory;
  }, [programHistory, userProfiles, profile]);

  // ── Build profile lookup ──
  const profileMap = useMemo(() => {
    const map: Record<string, UserProfileRow> = {};
    for (const p of userProfiles) {
      map[p.id] = p;
    }
    return map;
  }, [userProfiles]);

  // ── KPI Metrics ──
  const kpis = useMemo(() => {
    const allEntries = filteredHistory;
    const activeEntries = allEntries.filter(e => e.status === 'active');

    const totalEntries = allEntries.length;
    const totalWithNutrition = allEntries.filter(e => e.has_nutrition).length;
    const overallRate = totalEntries > 0 ? (totalWithNutrition / totalEntries) * 100 : 0;

    const activeTotal = activeEntries.length;
    const activeWithNutrition = activeEntries.filter(e => e.has_nutrition).length;
    const activeRate = activeTotal > 0 ? (activeWithNutrition / activeTotal) * 100 : 0;

    // Unique clients with any nutrition history
    const uniqueClientsWithNutrition = new Set(
      allEntries.filter(e => e.has_nutrition).map(e => e.user_id)
    ).size;

    // Unique clients total
    const uniqueClientsTotal = new Set(allEntries.map(e => e.user_id)).size;

    return {
      totalEntries,
      totalWithNutrition,
      overallRate,
      activeTotal,
      activeWithNutrition,
      activeRate,
      uniqueClientsWithNutrition,
      uniqueClientsTotal,
    };
  }, [filteredHistory]);

  // ── Program Tier Stats ──
  const programTierStats = useMemo((): ProgramTierStat[] => {
    const map: Record<string, { total: number; withNutrition: number }> = {};

    for (const entry of filteredHistory) {
      const prog = entry.program || 'Unknown';
      if (!map[prog]) map[prog] = { total: 0, withNutrition: 0 };
      map[prog].total++;
      if (entry.has_nutrition) map[prog].withNutrition++;
    }

    return Object.entries(map)
      .map(([program, stats]) => ({
        program,
        total: stats.total,
        withNutrition: stats.withNutrition,
        rate: stats.total > 0 ? (stats.withNutrition / stats.total) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredHistory]);

  // ── Monthly Trend Data ──
  const monthlyTrend = useMemo(() => {
    const now = new Date();
    const months: { label: string; value: number; total: number }[] = [];

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth();

      // Count entries that started in this month
      const monthEntries = filteredHistory.filter(e => {
        const sd = new Date(e.start_date);
        return sd.getFullYear() === y && sd.getMonth() === m;
      });

      const withNutrition = monthEntries.filter(e => e.has_nutrition).length;

      months.push({
        label: MONTH_NAMES[m],
        value: withNutrition,
        total: monthEntries.length,
      });
    }

    return months;
  }, [filteredHistory]);

  // ── Monthly Rate Trend ──
  const monthlyRateTrend = useMemo(() => {
    return monthlyTrend.map(m => ({
      label: m.label,
      value: m.total > 0 ? Math.round((m.value / m.total) * 100) : 0,
    }));
  }, [monthlyTrend]);

  // ── Nutrition Enrollments Trend (absolute count) ──
  const monthlyCountTrend = useMemo(() => {
    return monthlyTrend.map(m => ({
      label: m.label,
      value: m.value,
    }));
  }, [monthlyTrend]);

  // ── Donut Data: Nutrition vs No Nutrition ──
  const nutritionDonutData = useMemo(() => {
    const withNutrition = kpis.totalWithNutrition;
    const withoutNutrition = kpis.totalEntries - kpis.totalWithNutrition;
    const total = kpis.totalEntries || 1;

    return [
      {
        name: 'With Nutrition',
        value: Math.max(1, Math.round((withNutrition / total) * 100)),
        color: '#9b59b6',
      },
      {
        name: 'Without Nutrition',
        value: Math.max(1, Math.round((withoutNutrition / total) * 100)),
        color: COLORS.borderLight,
      },
    ].filter(d => d.value > 0 || kpis.totalEntries === 0);
  }, [kpis]);

  // ── Donut Data: Active Nutrition ──
  const activeNutritionDonutData = useMemo(() => {
    const withNutrition = kpis.activeWithNutrition;
    const withoutNutrition = kpis.activeTotal - kpis.activeWithNutrition;
    const total = kpis.activeTotal || 1;

    return [
      {
        name: 'With Nutrition',
        value: Math.max(1, Math.round((withNutrition / total) * 100)),
        color: COLORS.success,
      },
      {
        name: 'Without Nutrition',
        value: Math.max(1, Math.round((withoutNutrition / total) * 100)),
        color: COLORS.borderLight,
      },
    ].filter(d => d.value > 0 || kpis.activeTotal === 0);
  }, [kpis]);

  // ── Program Tier Bar Chart ──
  const programTierBarData = useMemo(() => {
    return programTierStats.slice(0, 10).map(s => ({
      label: s.program.length > 10 ? s.program.slice(0, 9) + '...' : s.program,
      value: Math.round(s.rate),
    }));
  }, [programTierStats]);

  // ── Build Client Table Data ──
  const clientTableData = useMemo((): ClientNutritionRow[] => {
    // Get the most recent entry per user
    const latestByUser: Record<string, ProgramHistoryRow> = {};
    for (const entry of filteredHistory) {
      if (!latestByUser[entry.user_id] ||
          new Date(entry.start_date) > new Date(latestByUser[entry.user_id].start_date)) {
        latestByUser[entry.user_id] = entry;
      }
    }

    return Object.values(latestByUser).map(entry => {
      const prof = profileMap[entry.user_id];
      return {
        userId: entry.user_id,
        fullName: prof?.full_name || 'Unknown',
        franchise: prof?.franchise || 'Unassigned',
        currentProgram: entry.program || 'None',
        contactStatus: prof?.contact_status || 'unknown',
        hasNutrition: entry.has_nutrition,
        programStatus: entry.status,
        startDate: entry.start_date,
      };
    });
  }, [filteredHistory, profileMap]);

  // ── Franchise List ──
  const franchiseList = useMemo(() => {
    const set = new Set<string>();
    clientTableData.forEach(c => set.add(c.franchise));
    return Array.from(set).sort();
  }, [clientTableData]);

  // ── Program List ──
  const programList = useMemo(() => {
    const set = new Set<string>();
    clientTableData.forEach(c => set.add(c.currentProgram));
    return Array.from(set).sort();
  }, [clientTableData]);

  // ── Filtered & Sorted Table ──
  const filteredTableData = useMemo(() => {
    let data = [...clientTableData];

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      data = data.filter(c =>
        c.fullName.toLowerCase().includes(q) ||
        c.currentProgram.toLowerCase().includes(q) ||
        c.franchise.toLowerCase().includes(q)
      );
    }

    // Status filter
    if (filterStatus !== 'all') {
      data = data.filter(c => c.programStatus === filterStatus);
    }

    // Nutrition filter
    if (filterNutrition === 'yes') {
      data = data.filter(c => c.hasNutrition);
    } else if (filterNutrition === 'no') {
      data = data.filter(c => !c.hasNutrition);
    }

    // Franchise filter
    if (filterFranchise !== 'all') {
      data = data.filter(c => c.franchise === filterFranchise);
    }

    // Program filter
    if (filterProgram !== 'all') {
      data = data.filter(c => c.currentProgram === filterProgram);
    }

    // Sort
    data.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.fullName.localeCompare(b.fullName);
          break;
        case 'program':
          cmp = a.currentProgram.localeCompare(b.currentProgram);
          break;
        case 'franchise':
          cmp = a.franchise.localeCompare(b.franchise);
          break;
        case 'nutrition':
          cmp = (a.hasNutrition ? 1 : 0) - (b.hasNutrition ? 1 : 0);
          break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return data;
  }, [clientTableData, searchQuery, filterStatus, filterNutrition, filterFranchise, filterProgram, sortField, sortAsc]);

  // ── Sort handler ──
  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // ── Trend view toggle ──
  const [trendView, setTrendView] = useState<'count' | 'rate'>('count');

  // ── Loading State ──
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={styles.loadingText}>Loading nutrition data...</Text>
      </View>
    );
  }

  // ── Error State ──
  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={32} color={COLORS.danger} />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={fetchData}>
          <Ionicons name="refresh" size={16} color={COLORS.white} />
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Empty State ──
  if (filteredHistory.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="nutrition-outline" size={48} color={COLORS.textMuted} />
        <Text style={styles.emptyTitle}>No Program History Data</Text>
        <Text style={styles.emptyText}>
          Assign programs to clients with nutrition coaching to see data here.
        </Text>
      </View>
    );
  }

  return (
    <View>
      {/* ── Video Chat Banner ── */}
      <TouchableOpacity
        style={styles.videoChatBanner}
        onPress={() => setShowVideoChat(true)}
        activeOpacity={0.8}
      >
        <View style={styles.videoChatBannerLeft}>
          <View style={styles.videoChatIconBg}>
            <Ionicons name="videocam" size={20} color={COLORS.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.videoChatBannerTitle}>Nutrition Video Chat</Text>
            <Text style={styles.videoChatBannerSubtitle}>
              FaceTime, Google Meet, WhatsApp, Zoom, Jitsi
            </Text>
          </View>
        </View>
        <View style={styles.videoChatArrow}>
          <Ionicons name="chevron-forward" size={18} color={COLORS.accent} />
        </View>
      </TouchableOpacity>

      {/* ── KPI Summary Cards ── */}

      <View style={styles.kpiGrid}>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBg, { backgroundColor: '#9b59b6' + '20' }]}>
            <Ionicons name="nutrition" size={20} color="#9b59b6" />
          </View>
          <Text style={styles.kpiValue}>{kpis.uniqueClientsWithNutrition}</Text>
          <Text style={styles.kpiLabel}>Clients w/ Nutrition</Text>
        </View>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBg, { backgroundColor: COLORS.accent + '20' }]}>
            <Ionicons name="people" size={20} color={COLORS.accent} />
          </View>
          <Text style={styles.kpiValue}>{kpis.uniqueClientsTotal}</Text>
          <Text style={styles.kpiLabel}>Total Clients</Text>
        </View>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBg, { backgroundColor: COLORS.success + '20' }]}>
            <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
          </View>
          <Text style={[styles.kpiValue, { color: COLORS.success }]}>
            {kpis.activeWithNutrition}
          </Text>
          <Text style={styles.kpiLabel}>Active w/ Nutrition</Text>
        </View>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBg, { backgroundColor: COLORS.warning + '20' }]}>
            <Ionicons name="trending-up" size={20} color={COLORS.warning} />
          </View>
          <Text style={[styles.kpiValue, { color: COLORS.warning }]}>
            {kpis.overallRate.toFixed(1)}%
          </Text>
          <Text style={styles.kpiLabel}>Overall Add-on Rate</Text>
        </View>
      </View>

      {/* ── Secondary KPI Row ── */}
      <View style={styles.secondaryKpiRow}>
        <View style={styles.secondaryKpi}>
          <Text style={styles.secondaryKpiLabel}>Total Programs</Text>
          <Text style={styles.secondaryKpiValue}>{kpis.totalEntries}</Text>
        </View>
        <View style={styles.secondaryKpiDivider} />
        <View style={styles.secondaryKpi}>
          <Text style={styles.secondaryKpiLabel}>w/ Nutrition</Text>
          <Text style={[styles.secondaryKpiValue, { color: '#9b59b6' }]}>{kpis.totalWithNutrition}</Text>
        </View>
        <View style={styles.secondaryKpiDivider} />
        <View style={styles.secondaryKpi}>
          <Text style={styles.secondaryKpiLabel}>Active Programs</Text>
          <Text style={[styles.secondaryKpiValue, { color: COLORS.success }]}>{kpis.activeTotal}</Text>
        </View>
        <View style={styles.secondaryKpiDivider} />
        <View style={styles.secondaryKpi}>
          <Text style={styles.secondaryKpiLabel}>Active Rate</Text>
          <Text style={[styles.secondaryKpiValue, { color: COLORS.accent }]}>{kpis.activeRate.toFixed(1)}%</Text>
        </View>
      </View>

      {/* ── Nutrition Distribution Donuts ── */}
      <View style={styles.donutRow}>
        <View style={styles.donutCard}>
          <Text style={styles.donutCardTitle}>All Programs</Text>
          {kpis.totalEntries > 0 ? (
            <DonutChart
              data={nutritionDonutData}
              size={110}
              centerValue={`${kpis.overallRate.toFixed(0)}%`}
              centerLabel="Rate"
            />
          ) : (
            <Text style={styles.noDataText}>No data</Text>
          )}
        </View>
        <View style={styles.donutCard}>
          <Text style={styles.donutCardTitle}>Active Programs</Text>
          {kpis.activeTotal > 0 ? (
            <DonutChart
              data={activeNutritionDonutData}
              size={110}
              centerValue={`${kpis.activeRate.toFixed(0)}%`}
              centerLabel="Rate"
            />
          ) : (
            <Text style={styles.noDataText}>No data</Text>
          )}
        </View>
      </View>

      {/* ── Nutrition Add-on Rate by Program ── */}
      <SectionHeader title="Nutrition Rate by Program" subtitle="Add-on percentage per tier" icon="barbell" />
      {programTierBarData.length > 0 ? (
        <View style={styles.chartCard}>
          <BarChart data={programTierBarData} height={160} barColor="#9b59b6" />
          <Text style={styles.chartNote}>Values shown as % nutrition add-on rate</Text>
        </View>
      ) : (
        <View style={styles.chartCard}>
          <View style={styles.emptyChart}>
            <Ionicons name="bar-chart-outline" size={32} color={COLORS.textMuted} />
            <Text style={styles.emptyChartText}>No program data available</Text>
          </View>
        </View>
      )}

      {/* ── Program Tier Table ── */}
      {programTierStats.length > 0 && (
        <>
          <SectionHeader title="Program Tier Breakdown" subtitle={`${programTierStats.length} programs`} icon="list" />
          <View style={styles.tableCard}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, { flex: 3 }]}>Program</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Total</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Nutrition</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Rate</Text>
            </View>
            {programTierStats.map((stat, i) => (
              <View key={stat.program} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
                <Text style={[styles.tableCell, { flex: 3, fontWeight: '600' }]} numberOfLines={1}>
                  {stat.program}
                </Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center' }]}>
                  {stat.total}
                </Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', color: '#9b59b6', fontWeight: '700' }]}>
                  {stat.withNutrition}
                </Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center' }]}>
                  <Text style={{ fontWeight: '700', color: stat.rate >= 50 ? COLORS.success : COLORS.warning }}>
                    {stat.rate.toFixed(0)}%
                  </Text>
                </Text>
              </View>
            ))}
            {/* Totals row */}
            <View style={[styles.tableRow, { backgroundColor: COLORS.primary + '08' }]}>
              <Text style={[styles.tableCell, { flex: 3, fontWeight: '800', color: COLORS.primary }]}>
                Total
              </Text>
              <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', fontWeight: '800' }]}>
                {kpis.totalEntries}
              </Text>
              <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', fontWeight: '800', color: '#9b59b6' }]}>
                {kpis.totalWithNutrition}
              </Text>
              <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', fontWeight: '800', color: COLORS.accent }]}>
                {kpis.overallRate.toFixed(0)}%
              </Text>
            </View>
          </View>
        </>
      )}

      {/* ── Nutrition Enrollment Trends ── */}
      <SectionHeader title="Nutrition Enrollment Trends" subtitle="Last 12 months" icon="trending-up" />
      <View style={styles.chartToggleRow}>
        <TouchableOpacity
          style={[styles.chartToggle, trendView === 'count' && styles.chartToggleActive]}
          onPress={() => setTrendView('count')}
        >
          <Text style={[styles.chartToggleText, trendView === 'count' && styles.chartToggleTextActive]}>
            Enrollments
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chartToggle, trendView === 'rate' && styles.chartToggleActive]}
          onPress={() => setTrendView('rate')}
        >
          <Text style={[styles.chartToggleText, trendView === 'rate' && styles.chartToggleTextActive]}>
            Add-on Rate %
          </Text>
        </TouchableOpacity>
      </View>
      <View style={styles.chartCard}>
        {(trendView === 'count' ? monthlyCountTrend : monthlyRateTrend).some(m => m.value > 0) ? (
          <>
            <BarChart
              data={trendView === 'count' ? monthlyCountTrend : monthlyRateTrend}
              height={150}
              barColor={trendView === 'count' ? '#9b59b6' : COLORS.success}
            />
            <Text style={styles.chartNote}>
              {trendView === 'count' ? 'New nutrition enrollments per month' : 'Nutrition add-on rate per month (%)'}
            </Text>
          </>
        ) : (
          <View style={styles.emptyChart}>
            <Ionicons name="trending-up-outline" size={32} color={COLORS.textMuted} />
            <Text style={styles.emptyChartText}>
              No trend data available yet. Assign programs with nutrition to see trends.
            </Text>
          </View>
        )}
      </View>

      {/* ── Client Nutrition Table ── */}
      <SectionHeader
        title="Client Nutrition Status"
        subtitle={`${filteredTableData.length} of ${clientTableData.length} clients`}
        icon="people"
      />

      {/* Filters */}
      <View style={styles.filtersContainer}>
        {/* Search */}
        <View style={styles.searchRow}>
          <View style={styles.searchInputContainer}>
            <Ionicons name="search" size={16} color={COLORS.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name, program, franchise..."
              placeholderTextColor={COLORS.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterChipsRow}
        >
          {/* Status filter */}
          {(['all', 'active', 'stopped'] as const).map(status => (
            <TouchableOpacity
              key={`status-${status}`}
              style={[styles.filterChip, filterStatus === status && styles.filterChipActive]}
              onPress={() => setFilterStatus(status)}
            >
              <Text style={[styles.filterChipText, filterStatus === status && styles.filterChipTextActive]}>
                {status === 'all' ? 'All Status' : status === 'active' ? 'Active' : 'Stopped'}
              </Text>
            </TouchableOpacity>
          ))}

          <View style={styles.filterDivider} />

          {/* Nutrition filter */}
          {(['all', 'yes', 'no'] as const).map(nutr => (
            <TouchableOpacity
              key={`nutr-${nutr}`}
              style={[
                styles.filterChip,
                filterNutrition === nutr && styles.filterChipActive,
                filterNutrition === nutr && nutr === 'yes' && { backgroundColor: '#9b59b6' },
              ]}
              onPress={() => setFilterNutrition(nutr)}
            >
              {nutr !== 'all' && (
                <Ionicons
                  name={nutr === 'yes' ? 'nutrition' : 'nutrition-outline'}
                  size={12}
                  color={filterNutrition === nutr ? COLORS.white : COLORS.textSecondary}
                />
              )}
              <Text style={[styles.filterChipText, filterNutrition === nutr && styles.filterChipTextActive]}>
                {nutr === 'all' ? 'All Nutrition' : nutr === 'yes' ? 'Has Nutrition' : 'No Nutrition'}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Franchise & Program dropdowns as chip selectors */}
        {franchiseList.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterChipsRow}
          >
            <TouchableOpacity
              style={[styles.filterChip, filterFranchise === 'all' && styles.filterChipActive]}
              onPress={() => setFilterFranchise('all')}
            >
              <Ionicons name="business-outline" size={12} color={filterFranchise === 'all' ? COLORS.white : COLORS.textSecondary} />
              <Text style={[styles.filterChipText, filterFranchise === 'all' && styles.filterChipTextActive]}>
                All Franchises
              </Text>
            </TouchableOpacity>
            {franchiseList.map(f => (
              <TouchableOpacity
                key={f}
                style={[styles.filterChip, filterFranchise === f && styles.filterChipActive]}
                onPress={() => setFilterFranchise(f)}
              >
                <Text style={[styles.filterChipText, filterFranchise === f && styles.filterChipTextActive]}>
                  {f}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {programList.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterChipsRow}
          >
            <TouchableOpacity
              style={[styles.filterChip, filterProgram === 'all' && styles.filterChipActive]}
              onPress={() => setFilterProgram('all')}
            >
              <Ionicons name="barbell-outline" size={12} color={filterProgram === 'all' ? COLORS.white : COLORS.textSecondary} />
              <Text style={[styles.filterChipText, filterProgram === 'all' && styles.filterChipTextActive]}>
                All Programs
              </Text>
            </TouchableOpacity>
            {programList.map(p => (
              <TouchableOpacity
                key={p}
                style={[styles.filterChip, filterProgram === p && styles.filterChipActive]}
                onPress={() => setFilterProgram(p)}
              >
                <Text style={[styles.filterChipText, filterProgram === p && styles.filterChipTextActive]}>
                  {p}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Table */}
      <View style={styles.tableCard}>
        {/* Sortable Header */}
        <View style={styles.tableHeader}>
          <TouchableOpacity
            style={{ flex: 3, flexDirection: 'row', alignItems: 'center', gap: 2 }}
            onPress={() => handleSort('name')}
          >
            <Text style={styles.tableHeaderText}>Client</Text>
            {sortField === 'name' && (
              <Ionicons name={sortAsc ? 'caret-up' : 'caret-down'} size={10} color={COLORS.white} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 }}
            onPress={() => handleSort('program')}
          >
            <Text style={[styles.tableHeaderText, { textAlign: 'center' }]}>Program</Text>
            {sortField === 'program' && (
              <Ionicons name={sortAsc ? 'caret-up' : 'caret-down'} size={10} color={COLORS.white} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 }}
            onPress={() => handleSort('franchise')}
          >
            <Text style={[styles.tableHeaderText, { textAlign: 'center' }]}>Franchise</Text>
            {sortField === 'franchise' && (
              <Ionicons name={sortAsc ? 'caret-up' : 'caret-down'} size={10} color={COLORS.white} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 }}
            onPress={() => handleSort('nutrition')}
          >
            <Text style={[styles.tableHeaderText, { textAlign: 'center' }]}>Nutr.</Text>
            {sortField === 'nutrition' && (
              <Ionicons name={sortAsc ? 'caret-up' : 'caret-down'} size={10} color={COLORS.white} />
            )}
          </TouchableOpacity>
        </View>

        {filteredTableData.length === 0 ? (
          <View style={{ padding: SPACING.xl, alignItems: 'center' }}>
            <Ionicons name="search-outline" size={24} color={COLORS.textMuted} />
            <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.textMuted, marginTop: SPACING.sm }}>
              No clients match your filters
            </Text>
          </View>
        ) : (
          filteredTableData.slice(0, 100).map((client, i) => (
            <View key={client.userId} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
              <View style={{ flex: 3 }}>
                <Text style={[styles.tableCell, { fontWeight: '600' }]} numberOfLines={1}>
                  {client.fullName}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <View style={[
                    styles.statusDot,
                    { backgroundColor: client.programStatus === 'active' ? COLORS.success : COLORS.textMuted },
                  ]} />
                  <Text style={{ fontSize: 9, color: COLORS.textMuted, textTransform: 'capitalize' }}>
                    {client.programStatus}
                  </Text>
                </View>
              </View>
              <Text style={[styles.tableCell, { flex: 2, textAlign: 'center' }]} numberOfLines={1}>
                {client.currentProgram}
              </Text>
              <Text style={[styles.tableCell, { flex: 2, textAlign: 'center' }]} numberOfLines={1}>
                {client.franchise}
              </Text>
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                {client.hasNutrition ? (
                  <View style={styles.nutritionBadgeYes}>
                    <Ionicons name="leaf" size={12} color="#9b59b6" />
                  </View>
                ) : (
                  <View style={styles.nutritionBadgeNo}>
                    <Ionicons name="close" size={12} color={COLORS.textMuted} />
                  </View>
                )}
              </View>
            </View>
          ))
        )}

        {filteredTableData.length > 100 && (
          <View style={{ padding: SPACING.md, alignItems: 'center' }}>
            <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted }}>
              Showing first 100 of {filteredTableData.length} results
            </Text>
          </View>
        )}
      </View>

      {/* ── Summary Footer ── */}
      <View style={styles.summaryFooter}>
        <Ionicons name="information-circle-outline" size={14} color={COLORS.textMuted} />
        <Text style={styles.summaryFooterText}>
          Data sourced from program history records. Nutrition status reflects the most recent program assignment per client.
        </Text>
      </View>

      {/* ── Video Chat Modal ── */}
      <VideoChatModal
        visible={showVideoChat}
        onClose={() => setShowVideoChat(false)}
      />
    </View>

  );
}

// ── Styles ──

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
  errorContainer: {
    padding: SPACING.xxxl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
  },
  errorText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.danger,
    textAlign: 'center',
    fontWeight: '500',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
  },
  retryBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.white,
  },
  emptyContainer: {
    padding: SPACING.xxxl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
  },
  emptyTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.primary,
  },
  emptyText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
    maxWidth: 300,
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
    textAlign: 'center',
  },

  // Secondary KPI Row
  secondaryKpiRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginTop: SPACING.sm,
    ...SHADOWS.sm,
  },
  secondaryKpi: {
    flex: 1,
    alignItems: 'center',
  },
  secondaryKpiLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  secondaryKpiValue: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: COLORS.primary,
  },
  secondaryKpiDivider: {
    width: 1,
    backgroundColor: COLORS.borderLight,
    marginHorizontal: 4,
  },

  // Donut Row
  donutRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
    flexWrap: 'wrap',
  },
  donutCard: {
    flex: 1,
    minWidth: 200,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    alignItems: 'center',
    gap: SPACING.sm,
    ...SHADOWS.sm,
  },
  donutCardTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  noDataText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    paddingVertical: SPACING.xl,
  },

  // Charts
  chartCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.md,
  },
  chartNote: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.sm,
    fontStyle: 'italic',
  },
  chartToggleRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
    flexWrap: 'wrap',
  },
  chartToggle: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 5,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chartToggleActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  chartToggleText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  chartToggleTextActive: {
    color: COLORS.white,
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
    textAlign: 'center',
  },

  // Table
  tableCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    ...SHADOWS.md,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  tableHeaderText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.white,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  tableRowAlt: {
    backgroundColor: COLORS.navy50 + '40',
  },
  tableCell: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.text,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  // Nutrition badges
  nutritionBadgeYes: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#9b59b6' + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nutritionBadgeNo: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Filters
  filtersContainer: {
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  searchRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    padding: 0,
  },
  filterChipsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingVertical: 2,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterChipActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  filterChipText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  filterChipTextActive: {
    color: COLORS.white,
  },
  filterDivider: {
    width: 1,
    height: 20,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
  },

  // Summary Footer
  summaryFooter: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  summaryFooterText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    flex: 1,
    lineHeight: 16,
  },

  // Video Chat Banner
  videoChatBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1.5,
    borderColor: COLORS.accent + '30',
    ...SHADOWS.md,
  },
  videoChatBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    flex: 1,
  },
  videoChatIconBg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.sm,
  },
  videoChatBannerTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: COLORS.primary,
  },
  videoChatBannerSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  videoChatArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.accent + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
