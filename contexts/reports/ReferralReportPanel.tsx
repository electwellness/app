import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  ScrollView, Platform, Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import SectionHeader from '../SectionHeader';
import { BarChart, DonutChart } from '../MiniChart';

// ── Types ──

interface ReferralProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  referred_by: string | null;
  referred_by_name: string | null;
  contact_status: string | null;
  franchise: string | null;
  created_at: string | null;
}

interface TopReferrer {
  id: string;
  name: string;
  franchise: string;
  totalReferrals: number;
  activeClients: number;
  conversionRate: number;
  contactStatus: string;
}

interface FranchiseReferralData {
  franchise: string;
  totalReferred: number;
  converted: number;
  conversionRate: number;
  uniqueReferrers: number;
}

interface MonthlyTrend {
  month: string;
  label: string;
  totalReferred: number;
  converted: number;
}

// Active statuses that count as "converted"
const ACTIVE_STATUSES = ['active-client', 'active-jumpstart'];

const STATUS_COLORS: Record<string, string> = {
  'active-client': '#2ecc71',
  'active-jumpstart': '#f39c12',
  'former-client': '#8B5CF6',
  'referring-partner': '#9b59b6',
  'active-staff': '#0E8AC8',
  'former-staff': '#8fa4b5',
  'failed-jumpstart': '#e74c3c',
};

const STATUS_LABELS: Record<string, string> = {
  'active-client': 'Active Client',
  'active-jumpstart': 'Active Jumpstart',
  'former-client': 'Former Client',
  'referring-partner': 'Referring Partner',
  'active-staff': 'Active Staff',
  'former-staff': 'Former Staff',
  'failed-jumpstart': 'Failed Jumpstart',
};

const MONTH_ABBREVS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── Helper: generate CSV ──

function generateReferralCSV(
  topReferrers: TopReferrer[],
  franchiseData: FranchiseReferralData[],
  trends: MonthlyTrend[],
  totals: { totalReferred: number; uniqueReferrers: number; converted: number; conversionRate: number },
): string {
  const lines: string[] = [];

  lines.push('REFERRAL ANALYTICS REPORT');
  lines.push(`Generated: ${new Date().toLocaleDateString()}`);
  lines.push('');

  // Summary
  lines.push('SUMMARY');
  lines.push(`Total Referred Contacts,${totals.totalReferred}`);
  lines.push(`Unique Referrers,${totals.uniqueReferrers}`);
  lines.push(`Converted to Active,${totals.converted}`);
  lines.push(`Overall Conversion Rate,${totals.conversionRate.toFixed(1)}%`);
  lines.push('');

  // Top referrers
  lines.push('TOP REFERRERS');
  lines.push('Rank,Name,Franchise,Total Referrals,Active Clients,Conversion Rate');
  topReferrers.forEach((r, i) => {
    lines.push(`${i + 1},"${r.name}","${r.franchise}",${r.totalReferrals},${r.activeClients},${r.conversionRate.toFixed(1)}%`);
  });
  lines.push('');

  // Franchise breakdown
  lines.push('FRANCHISE BREAKDOWN');
  lines.push('Franchise,Total Referred,Converted,Conversion Rate,Unique Referrers');
  franchiseData.forEach(f => {
    lines.push(`"${f.franchise}",${f.totalReferred},${f.converted},${f.conversionRate.toFixed(1)}%,${f.uniqueReferrers}`);
  });
  lines.push('');

  // Monthly trends
  lines.push('MONTHLY TRENDS');
  lines.push('Month,Total Referred,Converted');
  trends.forEach(t => {
    lines.push(`${t.label},${t.totalReferred},${t.converted}`);
  });

  return lines.join('\n');
}

// ── Main Component ──

export default function ReferralReportPanel() {
  const { profile } = useAuth();

  const [profiles, setProfiles] = useState<ReferralProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all profiles with referral data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from('user_profiles')
        .select('id, full_name, email, referred_by, referred_by_name, contact_status, franchise, created_at');

      if (queryError) throw new Error(queryError.message);
      setProfiles((data || []) as ReferralProfile[]);
    } catch (err: any) {
      console.error('Error fetching referral data:', err);
      setError(err.message || 'Failed to load referral data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Role-based filtering ──
  const filteredProfiles = useMemo(() => {
    if (!profile) return profiles;
    if (profile.role === 'admin') return profiles;
    if ((profile.role === 'franchise_manager' || profile.role === 'trainer' || profile.role === 'dietitian') && profile.franchise) {
      return profiles.filter(p => p.franchise === profile.franchise);
    }
    return profiles;
  }, [profiles, profile]);

  // ── Referred contacts (those with a referred_by set) ──
  const referredContacts = useMemo(() => {
    return filteredProfiles.filter(p => p.referred_by);
  }, [filteredProfiles]);

  // ── Build a name lookup map for all profiles ──
  const profileNameMap = useMemo(() => {
    const map: Record<string, { name: string; franchise: string; contactStatus: string }> = {};
    for (const p of filteredProfiles) {
      map[p.id] = {
        name: p.full_name || p.email || 'Unknown',
        franchise: p.franchise || 'Unassigned',
        contactStatus: p.contact_status || '',
      };
    }
    return map;
  }, [filteredProfiles]);

  // ── Top Referrers ──
  const topReferrers = useMemo((): TopReferrer[] => {
    const referrerMap: Record<string, {
      id: string;
      name: string;
      franchise: string;
      contactStatus: string;
      totalReferrals: number;
      activeClients: number;
    }> = {};

    for (const rc of referredContacts) {
      const refId = rc.referred_by!;
      if (!referrerMap[refId]) {
        const info = profileNameMap[refId];
        referrerMap[refId] = {
          id: refId,
          name: info?.name || rc.referred_by_name || 'Unknown Referrer',
          franchise: info?.franchise || 'Unknown',
          contactStatus: info?.contactStatus || '',
          totalReferrals: 0,
          activeClients: 0,
        };
      }
      referrerMap[refId].totalReferrals++;
      if (ACTIVE_STATUSES.includes(rc.contact_status || '')) {
        referrerMap[refId].activeClients++;
      }
    }

    return Object.values(referrerMap)
      .map(r => ({
        ...r,
        conversionRate: r.totalReferrals > 0 ? (r.activeClients / r.totalReferrals) * 100 : 0,
      }))
      .sort((a, b) => b.totalReferrals - a.totalReferrals);
  }, [referredContacts, profileNameMap]);

  // ── Global Totals ──
  const totals = useMemo(() => {
    const totalReferred = referredContacts.length;
    const converted = referredContacts.filter(rc => ACTIVE_STATUSES.includes(rc.contact_status || '')).length;
    const uniqueReferrers = new Set(referredContacts.map(rc => rc.referred_by)).size;
    const conversionRate = totalReferred > 0 ? (converted / totalReferred) * 100 : 0;
    const avgPerReferrer = uniqueReferrers > 0 ? totalReferred / uniqueReferrers : 0;

    // External referrals (referred_by_name set but no referred_by UUID match in our profiles)
    const externalReferrals = filteredProfiles.filter(
      p => !p.referred_by && p.referred_by_name && p.referred_by_name.trim().length > 0
    ).length;

    return { totalReferred, converted, uniqueReferrers, conversionRate, avgPerReferrer, externalReferrals };
  }, [referredContacts, filteredProfiles]);

  // ── Status Distribution of Referred Contacts (for donut) ──
  const statusDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const rc of referredContacts) {
      const status = rc.contact_status || 'unknown';
      counts[status] = (counts[status] || 0) + 1;
    }

    const total = referredContacts.length || 1;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([status, count]) => ({
        name: STATUS_LABELS[status] || status,
        value: Math.max(1, Math.round((count / total) * 100)),
        color: STATUS_COLORS[status] || COLORS.textMuted,
        count,
      }));
  }, [referredContacts]);

  // ── Monthly Trends (last 12 months) ──
  const monthlyTrends = useMemo((): MonthlyTrend[] => {
    const monthCounts: Record<string, { total: number; converted: number }> = {};

    for (const rc of referredContacts) {
      if (!rc.created_at) continue;
      const d = new Date(rc.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthCounts[key]) monthCounts[key] = { total: 0, converted: 0 };
      monthCounts[key].total++;
      if (ACTIVE_STATUSES.includes(rc.contact_status || '')) {
        monthCounts[key].converted++;
      }
    }

    const now = new Date();
    const months: MonthlyTrend[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push({
        month: key,
        label: `${MONTH_ABBREVS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
        totalReferred: monthCounts[key]?.total || 0,
        converted: monthCounts[key]?.converted || 0,
      });
    }
    return months;
  }, [referredContacts]);

  // ── Franchise Breakdown ──
  const franchiseData = useMemo((): FranchiseReferralData[] => {
    const map: Record<string, {
      totalReferred: number;
      converted: number;
      referrerIds: Set<string>;
    }> = {};

    for (const rc of referredContacts) {
      const fname = rc.franchise || 'Unassigned';
      if (!map[fname]) map[fname] = { totalReferred: 0, converted: 0, referrerIds: new Set() };
      map[fname].totalReferred++;
      if (ACTIVE_STATUSES.includes(rc.contact_status || '')) {
        map[fname].converted++;
      }
      if (rc.referred_by) {
        map[fname].referrerIds.add(rc.referred_by);
      }
    }

    return Object.entries(map)
      .map(([franchise, data]) => ({
        franchise,
        totalReferred: data.totalReferred,
        converted: data.converted,
        conversionRate: data.totalReferred > 0 ? (data.converted / data.totalReferred) * 100 : 0,
        uniqueReferrers: data.referrerIds.size,
      }))
      .sort((a, b) => b.totalReferred - a.totalReferred);
  }, [referredContacts]);

  // ── Chart Data ──
  const [trendChartMode, setTrendChartMode] = useState<'referrals' | 'conversions'>('referrals');

  const trendChartData = useMemo(() => {
    return monthlyTrends.map(m => ({
      label: m.label.split(' ')[0], // Just month abbreviation
      value: trendChartMode === 'referrals' ? m.totalReferred : m.converted,
    }));
  }, [monthlyTrends, trendChartMode]);

  const franchiseChartData = useMemo(() => {
    return franchiseData
      .filter(f => f.franchise !== 'Unassigned')
      .slice(0, 10)
      .map(f => ({
        label: f.franchise.length > 10 ? f.franchise.slice(0, 9) + '\u2026' : f.franchise,
        value: f.totalReferred,
      }));
  }, [franchiseData]);

  const topReferrersChartData = useMemo(() => {
    return topReferrers.slice(0, 8).map(r => ({
      label: r.name.split(' ')[0].length > 8
        ? r.name.split(' ')[0].slice(0, 7) + '.'
        : r.name.split(' ')[0],
      value: r.totalReferrals,
    }));
  }, [topReferrers]);

  // ── Export ──
  const handleExportCSV = async () => {
    const csv = generateReferralCSV(topReferrers, franchiseData, monthlyTrends, totals);
    if (Platform.OS === 'web') {
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `referral-report-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      try {
        await Share.share({ message: csv, title: 'Referral Analytics Report' });
      } catch { /* user cancelled */ }
    }
  };

  // ── Loading ──
  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={styles.loadingText}>Loading referral analytics...</Text>
      </View>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.errorIcon}>
          <Ionicons name="cloud-offline-outline" size={32} color={COLORS.danger} />
        </View>
        <Text style={styles.errorTitle}>Could not load referral data</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={fetchData} activeOpacity={0.7}>
          <Ionicons name="refresh-outline" size={16} color={COLORS.white} />
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Empty state ──
  if (referredContacts.length === 0 && totals.externalReferrals === 0) {
    return (
      <View style={styles.centerContainer}>
        <View style={[styles.errorIcon, { backgroundColor: COLORS.accent + '10' }]}>
          <Ionicons name="git-network-outline" size={36} color={COLORS.accent} />
        </View>
        <Text style={styles.errorTitle}>No Referral Data Yet</Text>
        <Text style={styles.errorText}>
          When contacts are added with a referral source, analytics will appear here showing top referrers, conversion rates, trends, and franchise breakdowns.
        </Text>
        <TouchableOpacity style={styles.retryBtn} onPress={fetchData} activeOpacity={0.7}>
          <Ionicons name="refresh-outline" size={16} color={COLORS.white} />
          <Text style={styles.retryBtnText}>Refresh</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View>
      {/* Action Bar */}
      <View style={styles.actionBar}>
        <View style={styles.actionBarTitle}>
          <Ionicons name="git-network" size={20} color={COLORS.accent} />
          <Text style={styles.actionBarTitleText}>Referral Analytics</Text>
        </View>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.exportBtn} onPress={handleExportCSV}>
          <Ionicons name="download-outline" size={16} color={COLORS.accent} />
          <Text style={styles.exportBtnText}>CSV</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.refreshBtn} onPress={fetchData}>
          <Ionicons name="refresh-outline" size={16} color={COLORS.accent} />
        </TouchableOpacity>
      </View>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* KPI SUMMARY CARDS                                         */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <View style={styles.kpiGrid}>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBg, { backgroundColor: COLORS.accent + '20' }]}>
            <Ionicons name="people-outline" size={20} color={COLORS.accent} />
          </View>
          <Text style={styles.kpiValue}>{totals.totalReferred}</Text>
          <Text style={styles.kpiLabel}>Referred Contacts</Text>
        </View>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBg, { backgroundColor: '#9b59b6' + '20' }]}>
            <Ionicons name="person-outline" size={20} color="#9b59b6" />
          </View>
          <Text style={styles.kpiValue}>{totals.uniqueReferrers}</Text>
          <Text style={styles.kpiLabel}>Unique Referrers</Text>
        </View>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBg, { backgroundColor: COLORS.success + '20' }]}>
            <Ionicons name="checkmark-circle-outline" size={20} color={COLORS.success} />
          </View>
          <Text style={[styles.kpiValue, { color: COLORS.success }]}>{totals.converted}</Text>
          <Text style={styles.kpiLabel}>Converted</Text>
        </View>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBg, { backgroundColor: COLORS.info + '20' }]}>
            <Ionicons name="trending-up" size={20} color={COLORS.info} />
          </View>
          <Text style={[styles.kpiValue, { color: COLORS.info }]}>{totals.conversionRate.toFixed(1)}%</Text>
          <Text style={styles.kpiLabel}>Conversion Rate</Text>
        </View>
      </View>

      {/* Secondary KPI Row */}
      <View style={styles.secondaryKpiRow}>
        <View style={styles.secondaryKpi}>
          <Text style={styles.secondaryKpiLabel}>Avg / Referrer</Text>
          <Text style={styles.secondaryKpiValue}>{totals.avgPerReferrer.toFixed(1)}</Text>
        </View>
        <View style={styles.secondaryKpiDivider} />
        <View style={styles.secondaryKpi}>
          <Text style={styles.secondaryKpiLabel}>External Refs</Text>
          <Text style={styles.secondaryKpiValue}>{totals.externalReferrals}</Text>
        </View>
        <View style={styles.secondaryKpiDivider} />
        <View style={styles.secondaryKpi}>
          <Text style={styles.secondaryKpiLabel}>Top Referrer</Text>
          <Text style={styles.secondaryKpiValue} numberOfLines={1}>
            {topReferrers.length > 0 ? topReferrers[0].totalReferrals : 0}
          </Text>
        </View>
        <View style={styles.secondaryKpiDivider} />
        <View style={styles.secondaryKpi}>
          <Text style={styles.secondaryKpiLabel}>Franchises</Text>
          <Text style={styles.secondaryKpiValue}>{franchiseData.length}</Text>
        </View>
      </View>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* REFERRAL CONVERSION FUNNEL (Donut)                        */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {statusDistribution.length > 0 && (
        <>
          <SectionHeader
            title="Referral Outcomes"
            subtitle="Status of referred contacts"
            icon="pie-chart"
          />
          <View style={styles.chartCard}>
            <DonutChart
              data={statusDistribution}
              size={130}
              centerValue={`${totals.conversionRate.toFixed(0)}%`}
              centerLabel="Converted"
            />
          </View>

          {/* Conversion funnel summary */}
          <View style={styles.funnelCard}>
            <View style={styles.funnelRow}>
              <View style={styles.funnelStep}>
                <View style={[styles.funnelDot, { backgroundColor: COLORS.accent }]} />
                <Text style={styles.funnelStepLabel}>Referred</Text>
                <Text style={styles.funnelStepValue}>{totals.totalReferred}</Text>
              </View>
              <View style={styles.funnelArrow}>
                <Ionicons name="arrow-forward" size={16} color={COLORS.textMuted} />
              </View>
              <View style={styles.funnelStep}>
                <View style={[styles.funnelDot, { backgroundColor: COLORS.success }]} />
                <Text style={styles.funnelStepLabel}>Active</Text>
                <Text style={[styles.funnelStepValue, { color: COLORS.success }]}>{totals.converted}</Text>
              </View>
              <View style={styles.funnelArrow}>
                <Ionicons name="arrow-forward" size={16} color={COLORS.textMuted} />
              </View>
              <View style={styles.funnelStep}>
                <View style={[styles.funnelDot, { backgroundColor: COLORS.warning }]} />
                <Text style={styles.funnelStepLabel}>Pending</Text>
                <Text style={[styles.funnelStepValue, { color: COLORS.warning }]}>
                  {totals.totalReferred - totals.converted}
                </Text>
              </View>
            </View>
            {/* Conversion bar */}
            <View style={styles.conversionBarBg}>
              <View
                style={[
                  styles.conversionBarFill,
                  { width: `${Math.min(100, totals.conversionRate)}%` },
                ]}
              />
            </View>
            <Text style={styles.conversionBarLabel}>
              {totals.conversionRate.toFixed(1)}% of referred contacts became active clients
            </Text>
          </View>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TOP REFERRERS                                             */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {topReferrers.length > 0 && (
        <>
          <SectionHeader
            title="Top Referrers"
            subtitle={`${topReferrers.length} referrer${topReferrers.length !== 1 ? 's' : ''}`}
            icon="trophy"
          />

          {/* Top referrers bar chart */}
          {topReferrersChartData.length > 1 && (
            <View style={[styles.chartCard, { marginBottom: SPACING.md }]}>
              <BarChart data={topReferrersChartData} height={140} barColor="#9b59b6" />
            </View>
          )}

          {/* Top referrers table */}
          <View style={styles.tableCard}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, { width: 32, textAlign: 'center' }]}>#</Text>
              <Text style={[styles.tableHeaderText, { flex: 2 }]}>Referrer</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Referred</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Active</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Conv %</Text>
            </View>
            {topReferrers.slice(0, 20).map((referrer, i) => {
              const statusColor = STATUS_COLORS[referrer.contactStatus] || COLORS.textMuted;
              return (
                <View
                  key={referrer.id}
                  style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}
                >
                  <View style={{ width: 32, alignItems: 'center', justifyContent: 'center' }}>
                    {i < 3 ? (
                      <View style={[styles.rankBadge, {
                        backgroundColor: i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : '#CD7F32',
                      }]}>
                        <Text style={styles.rankBadgeText}>{i + 1}</Text>
                      </View>
                    ) : (
                      <Text style={styles.rankText}>{i + 1}</Text>
                    )}
                  </View>
                  <View style={{ flex: 2 }}>
                    <Text style={styles.referrerName} numberOfLines={1}>{referrer.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 }}>
                      <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                      <Text style={styles.referrerFranchise} numberOfLines={1}>
                        {referrer.franchise}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', fontWeight: '800', color: COLORS.primary }]}>
                    {referrer.totalReferrals}
                  </Text>
                  <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', fontWeight: '700', color: COLORS.success }]}>
                    {referrer.activeClients}
                  </Text>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <View style={[
                      styles.convBadge,
                      {
                        backgroundColor: referrer.conversionRate >= 50
                          ? COLORS.success + '15'
                          : referrer.conversionRate >= 25
                            ? COLORS.warning + '15'
                            : COLORS.danger + '15',
                      },
                    ]}>
                      <Text style={[
                        styles.convBadgeText,
                        {
                          color: referrer.conversionRate >= 50
                            ? COLORS.success
                            : referrer.conversionRate >= 25
                              ? COLORS.warning
                              : COLORS.danger,
                        },
                      ]}>
                        {referrer.conversionRate.toFixed(0)}%
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* REFERRAL TRENDS OVER TIME                                 */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {monthlyTrends.some(m => m.totalReferred > 0) && (
        <>
          <SectionHeader
            title="Referral Trends"
            subtitle="Last 12 months"
            icon="trending-up"
          />
          <View style={styles.chartToggleRow}>
            <TouchableOpacity
              style={[styles.chartToggle, trendChartMode === 'referrals' && styles.chartToggleActive]}
              onPress={() => setTrendChartMode('referrals')}
            >
              <Text style={[styles.chartToggleText, trendChartMode === 'referrals' && styles.chartToggleTextActive]}>
                Referrals
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.chartToggle, trendChartMode === 'conversions' && styles.chartToggleActive]}
              onPress={() => setTrendChartMode('conversions')}
            >
              <Text style={[styles.chartToggleText, trendChartMode === 'conversions' && styles.chartToggleTextActive]}>
                Conversions
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.chartCard}>
            <BarChart
              data={trendChartData}
              height={160}
              barColor={trendChartMode === 'referrals' ? COLORS.accent : COLORS.success}
            />
          </View>

          {/* Monthly details table */}
          <View style={[styles.tableCard, { marginTop: SPACING.md }]}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, { flex: 2 }]}>Month</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Referred</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Converted</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Rate</Text>
            </View>
            {[...monthlyTrends].reverse().filter(m => m.totalReferred > 0).slice(0, 12).map((m, i) => (
              <View key={m.month} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
                <Text style={[styles.tableCell, { flex: 2, fontWeight: '600' }]}>{m.label}</Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', fontWeight: '700', color: COLORS.accent }]}>
                  {m.totalReferred}
                </Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', fontWeight: '700', color: COLORS.success }]}>
                  {m.converted}
                </Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center' }]}>
                  {m.totalReferred > 0 ? ((m.converted / m.totalReferred) * 100).toFixed(0) : 0}%
                </Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* FRANCHISE BREAKDOWN                                       */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {franchiseData.length > 0 && (
        <>
          <SectionHeader
            title="Referrals by Franchise"
            subtitle={`${franchiseData.length} location${franchiseData.length !== 1 ? 's' : ''}`}
            icon="business"
          />

          {/* Franchise bar chart */}
          {franchiseChartData.length > 1 && (
            <View style={[styles.chartCard, { marginBottom: SPACING.md }]}>
              <BarChart data={franchiseChartData} height={140} barColor={COLORS.info} />
            </View>
          )}

          {/* Franchise table */}
          <View style={styles.tableCard}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, { flex: 2 }]}>Franchise</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Referred</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Active</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Conv %</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Referrers</Text>
            </View>
            {franchiseData.map((fd, i) => (
              <View key={fd.franchise} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
                <Text style={[styles.tableCell, { flex: 2, fontWeight: '600' }]} numberOfLines={1}>
                  {fd.franchise}
                </Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', fontWeight: '700', color: COLORS.accent }]}>
                  {fd.totalReferred}
                </Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', fontWeight: '700', color: COLORS.success }]}>
                  {fd.converted}
                </Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center' }]}>
                  {fd.conversionRate.toFixed(0)}%
                </Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', color: '#9b59b6', fontWeight: '700' }]}>
                  {fd.uniqueReferrers}
                </Text>
              </View>
            ))}
          </View>

          {/* Franchise conversion comparison */}
          {franchiseData.filter(f => f.franchise !== 'Unassigned').length > 1 && (
            <>
              <SectionHeader
                title="Conversion Rate by Franchise"
                subtitle="Percentage of referred contacts that became active"
                icon="bar-chart"
              />
              <View style={styles.chartCard}>
                <BarChart
                  data={franchiseData
                    .filter(f => f.franchise !== 'Unassigned' && f.totalReferred > 0)
                    .slice(0, 10)
                    .map(f => ({
                      label: f.franchise.length > 10 ? f.franchise.slice(0, 9) + '\u2026' : f.franchise,
                      value: Math.round(f.conversionRate),
                    }))}
                  height={140}
                  barColor={COLORS.success}
                />
              </View>
            </>
          )}
        </>
      )}

      {/* Bottom spacer */}
      <View style={{ height: SPACING.xxl }} />
    </View>
  );
}

// ── Styles ──

const styles = StyleSheet.create({
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxxl * 2,
    gap: SPACING.md,
  },
  loadingText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
  },
  errorIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.danger + '10',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.primary,
  },
  errorText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingHorizontal: SPACING.xl,
    lineHeight: 20,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.sm,
  },
  retryBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.white,
  },

  // Action Bar
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
    flexWrap: 'wrap',
  },
  actionBarTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  actionBarTitleText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.primary,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.accent + '40',
    backgroundColor: COLORS.coral50,
  },
  exportBtnText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.accent,
  },
  refreshBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.accent + '40',
    backgroundColor: COLORS.coral50,
  },

  // KPI Cards
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  kpiCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    alignItems: 'center',
    gap: 4,
    ...SHADOWS.sm,
  },
  kpiIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiValue: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '800',
    color: COLORS.primary,
  },
  kpiLabel: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  // Secondary KPI Row
  secondaryKpiRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
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

  // Chart
  chartCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.md,
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

  // Funnel
  funnelCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginTop: SPACING.md,
    ...SHADOWS.sm,
  },
  funnelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  funnelStep: {
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  funnelDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  funnelStepLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  funnelStepValue: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: COLORS.primary,
  },
  funnelArrow: {
    paddingTop: 16,
  },
  conversionBarBg: {
    height: 8,
    backgroundColor: COLORS.borderLight,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: SPACING.sm,
  },
  conversionBarFill: {
    height: 8,
    backgroundColor: COLORS.success,
    borderRadius: 4,
  },
  conversionBarLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
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
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    alignItems: 'center',
  },
  tableRowAlt: {
    backgroundColor: COLORS.navy50 + '40',
  },
  tableCell: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.text,
  },

  // Referrer row
  referrerName: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.primary,
  },
  referrerFranchise: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  // Rank badge
  rankBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.white,
  },
  rankText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textMuted,
  },

  // Conversion badge
  convBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },
  convBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
});
