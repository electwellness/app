import React, { useState, useEffect, useCallback, useMemo } from 'react';
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

interface CreditProfile {
  id: string;
  full_name: string | null;
  referral_credit_trainer: string | null;
  referral_credit_dietitian: string | null;
  franchise: string | null;
  created_at: string | null;
  contact_status: string | null;
}

interface ReturnRecord {
  id: string;
  client_id: string;
  return_date: string | null;
  credited_trainer: string | null;
  credited_dietitian: string | null;
  franchise: string | null;
  created_at: string | null;
}

interface StaffInfo {
  full_name: string | null;
  role: string | null;
  franchise: string | null;
}

/** Aggregated row for a single staff member */
interface LeaderboardRow {
  staffName: string;
  staffRole: 'trainer' | 'dietitian' | 'both';
  franchise: string;
  referralCredits: number;
  returnCredits: number;
  totalCredits: number;
  trainerReferrals: number;
  dietitianReferrals: number;
  trainerReturns: number;
  dietitianReturns: number;
}

interface FranchiseRow {
  franchise: string;
  referralCredits: number;
  returnCredits: number;
  totalCredits: number;
  staffCount: number;
}

// Date range presets
type DatePreset = 'all' | '30d' | '90d' | '6m' | '12m' | 'ytd';
const DATE_PRESETS: { label: string; value: DatePreset }[] = [
  { label: 'All Time', value: 'all' },
  { label: '30 Days', value: '30d' },
  { label: '90 Days', value: '90d' },
  { label: '6 Months', value: '6m' },
  { label: '12 Months', value: '12m' },
  { label: 'YTD', value: 'ytd' },
];

type CreditTypeFilter = 'all' | 'trainer' | 'dietitian';
type ViewMode = 'combined' | 'referrals' | 'returns';

function getDateCutoff(preset: DatePreset): Date | null {
  if (preset === 'all') return null;
  const now = new Date();
  switch (preset) {
    case '30d': return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
    case '90d': return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90);
    case '6m': return new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
    case '12m': return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    case 'ytd': return new Date(now.getFullYear(), 0, 1);
    default: return null;
  }
}

// ── CSV Generator ──

function generateCSV(rows: LeaderboardRow[], franchiseRows: FranchiseRow[], totals: any): string {
  const lines: string[] = [];
  lines.push('STAFF CREDIT LEADERBOARD REPORT');
  lines.push(`Generated: ${new Date().toLocaleDateString()}`);
  lines.push('');
  lines.push('SUMMARY');
  lines.push(`Total Credits,${totals.totalCredits}`);
  lines.push(`Referral Credits,${totals.referralCredits}`);
  lines.push(`Return Credits,${totals.returnCredits}`);
  lines.push(`Staff Members,${rows.length}`);
  lines.push('');
  lines.push('STAFF LEADERBOARD');
  lines.push('Rank,Staff Member,Role,Franchise,Referral Credits,Return Credits,Total Credits');
  rows.forEach((r, i) => {
    lines.push(`${i + 1},"${r.staffName}","${r.staffRole}","${r.franchise}",${r.referralCredits},${r.returnCredits},${r.totalCredits}`);
  });
  lines.push('');
  lines.push('FRANCHISE BREAKDOWN');
  lines.push('Franchise,Referral Credits,Return Credits,Total Credits,Staff Count');
  franchiseRows.forEach(f => {
    lines.push(`"${f.franchise}",${f.referralCredits},${f.returnCredits},${f.totalCredits},${f.staffCount}`);
  });
  return lines.join('\n');
}

// ── Main Component ──

export default function StaffCreditLeaderboardPanel() {
  const { profile } = useAuth();

  const [profiles, setProfiles] = useState<CreditProfile[]>([]);
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [staffProfiles, setStaffProfiles] = useState<StaffInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [selectedFranchise, setSelectedFranchise] = useState<string>('all');
  const [creditTypeFilter, setCreditTypeFilter] = useState<CreditTypeFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('combined');

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch client profiles with credit fields
      const [profilesRes, returnsRes, staffRes] = await Promise.all([
        supabase
          .from('user_profiles')
          .select('id, full_name, referral_credit_trainer, referral_credit_dietitian, franchise, created_at, contact_status'),
        supabase.functions.invoke('manage-client-data', {
          body: { action: 'list_all_returns' },
        }),
        supabase
          .from('user_profiles')
          .select('full_name, role, franchise')
          .in('role', ['trainer', 'dietitian']),
      ]);

      if (profilesRes.error) throw new Error(profilesRes.error.message);
      setProfiles((profilesRes.data || []) as CreditProfile[]);

      if (!returnsRes.error && returnsRes.data?.data) {
        setReturns(returnsRes.data.data as ReturnRecord[]);
      } else {
        setReturns([]);
      }

      if (!staffRes.error && staffRes.data) {
        setStaffProfiles(staffRes.data as StaffInfo[]);
      }
    } catch (err: any) {
      console.error('Error fetching leaderboard data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Staff name → info lookup ──
  const staffNameMap = useMemo(() => {
    const map: Record<string, { role: string; franchise: string }> = {};
    for (const s of staffProfiles) {
      if (s.full_name) {
        map[s.full_name.trim()] = {
          role: s.role || 'unknown',
          franchise: s.franchise || 'Unassigned',
        };
      }
    }
    return map;
  }, [staffProfiles]);

  // ── Role-based profile filtering ──
  const roleFilteredProfiles = useMemo(() => {
    if (!profile) return profiles;
    if (profile.role === 'admin') return profiles;
    if ((profile.role === 'franchise_manager' || profile.role === 'trainer' || profile.role === 'dietitian') && profile.franchise) {
      return profiles.filter(p => p.franchise === profile.franchise);
    }
    return profiles;
  }, [profiles, profile]);

  // ── Available franchises ──
  const availableFranchises = useMemo(() => {
    const set = new Set<string>();
    for (const p of roleFilteredProfiles) {
      if (p.franchise) set.add(p.franchise);
    }
    for (const r of returns) {
      if (r.franchise) set.add(r.franchise);
    }
    return Array.from(set).sort();
  }, [roleFilteredProfiles, returns]);

  // ── Apply date + franchise filters to profiles ──
  const filteredProfiles = useMemo(() => {
    let result = roleFilteredProfiles;
    const cutoff = getDateCutoff(datePreset);
    if (cutoff) {
      result = result.filter(p => {
        if (!p.created_at) return false;
        return new Date(p.created_at) >= cutoff;
      });
    }
    if (selectedFranchise !== 'all') {
      result = result.filter(p => p.franchise === selectedFranchise);
    }
    return result;
  }, [roleFilteredProfiles, datePreset, selectedFranchise]);

  // ── Apply date + franchise filters to returns ──
  const filteredReturns = useMemo(() => {
    let result = returns;
    const cutoff = getDateCutoff(datePreset);
    if (cutoff) {
      result = result.filter(r => {
        const dateStr = r.return_date || r.created_at;
        if (!dateStr) return false;
        return new Date(dateStr) >= cutoff;
      });
    }
    if (selectedFranchise !== 'all') {
      result = result.filter(r => r.franchise === selectedFranchise);
    }
    return result;
  }, [returns, datePreset, selectedFranchise]);

  // ── Build leaderboard ──
  const leaderboard = useMemo((): LeaderboardRow[] => {
    const map: Record<string, {
      referralCredits: number; returnCredits: number;
      trainerReferrals: number; dietitianReferrals: number;
      trainerReturns: number; dietitianReturns: number;
      roles: Set<string>;
    }> = {};

    const ensureEntry = (name: string) => {
      if (!name) return;
      const key = name.trim();
      if (!key) return;
      if (!map[key]) {
        map[key] = {
          referralCredits: 0, returnCredits: 0,
          trainerReferrals: 0, dietitianReferrals: 0,
          trainerReturns: 0, dietitianReturns: 0,
          roles: new Set(),
        };
      }
      return map[key];
    };

    // Count referral credits from profiles
    for (const p of filteredProfiles) {
      if (p.referral_credit_trainer) {
        const name = p.referral_credit_trainer.trim();
        if (creditTypeFilter === 'all' || creditTypeFilter === 'trainer') {
          const entry = ensureEntry(name);
          if (entry) {
            entry.referralCredits++;
            entry.trainerReferrals++;
            entry.roles.add('trainer');
          }
        }
      }
      if (p.referral_credit_dietitian) {
        const name = p.referral_credit_dietitian.trim();
        if (creditTypeFilter === 'all' || creditTypeFilter === 'dietitian') {
          const entry = ensureEntry(name);
          if (entry) {
            entry.referralCredits++;
            entry.dietitianReferrals++;
            entry.roles.add('dietitian');
          }
        }
      }
    }

    // Count return credits
    for (const r of filteredReturns) {
      if (r.credited_trainer) {
        const name = r.credited_trainer.trim();
        if (creditTypeFilter === 'all' || creditTypeFilter === 'trainer') {
          const entry = ensureEntry(name);
          if (entry) {
            entry.returnCredits++;
            entry.trainerReturns++;
            entry.roles.add('trainer');
          }
        }
      }
      if (r.credited_dietitian) {
        const name = r.credited_dietitian.trim();
        if (creditTypeFilter === 'all' || creditTypeFilter === 'dietitian') {
          const entry = ensureEntry(name);
          if (entry) {
            entry.returnCredits++;
            entry.dietitianReturns++;
            entry.roles.add('dietitian');
          }
        }
      }
    }

    return Object.entries(map)
      .map(([staffName, data]) => {
        const info = staffNameMap[staffName];
        const roles = data.roles;
        let staffRole: 'trainer' | 'dietitian' | 'both' = 'trainer';
        if (roles.has('trainer') && roles.has('dietitian')) staffRole = 'both';
        else if (roles.has('dietitian')) staffRole = 'dietitian';
        else if (info?.role === 'dietitian') staffRole = 'dietitian';

        return {
          staffName,
          staffRole,
          franchise: info?.franchise || 'Unknown',
          referralCredits: data.referralCredits,
          returnCredits: data.returnCredits,
          totalCredits: data.referralCredits + data.returnCredits,
          trainerReferrals: data.trainerReferrals,
          dietitianReferrals: data.dietitianReferrals,
          trainerReturns: data.trainerReturns,
          dietitianReturns: data.dietitianReturns,
        };
      })
      .filter(r => r.totalCredits > 0)
      .sort((a, b) => b.totalCredits - a.totalCredits);
  }, [filteredProfiles, filteredReturns, creditTypeFilter, staffNameMap]);

  // ── Franchise breakdown ──
  const franchiseData = useMemo((): FranchiseRow[] => {
    const map: Record<string, { referralCredits: number; returnCredits: number; staffNames: Set<string> }> = {};

    for (const row of leaderboard) {
      const fname = row.franchise || 'Unknown';
      if (!map[fname]) map[fname] = { referralCredits: 0, returnCredits: 0, staffNames: new Set() };
      map[fname].referralCredits += row.referralCredits;
      map[fname].returnCredits += row.returnCredits;
      map[fname].staffNames.add(row.staffName);
    }

    return Object.entries(map)
      .map(([franchise, data]) => ({
        franchise,
        referralCredits: data.referralCredits,
        returnCredits: data.returnCredits,
        totalCredits: data.referralCredits + data.returnCredits,
        staffCount: data.staffNames.size,
      }))
      .sort((a, b) => b.totalCredits - a.totalCredits);
  }, [leaderboard]);

  // ── Totals ──
  const totals = useMemo(() => {
    let referralCredits = 0, returnCredits = 0;
    for (const row of leaderboard) {
      referralCredits += row.referralCredits;
      returnCredits += row.returnCredits;
    }
    return {
      referralCredits,
      returnCredits,
      totalCredits: referralCredits + returnCredits,
      staffCount: leaderboard.length,
      franchiseCount: franchiseData.length,
    };
  }, [leaderboard, franchiseData]);

  // ── Donut: Referral vs Return split ──
  const creditTypeDonut = useMemo(() => {
    if (totals.totalCredits === 0) return [];
    const total = totals.totalCredits || 1;
    return [
      { name: 'Referral Credits', value: Math.max(1, Math.round((totals.referralCredits / total) * 100)), color: COLORS.accent },
      { name: 'Return Credits', value: Math.max(1, Math.round((totals.returnCredits / total) * 100)), color: '#16a085' },
    ];
  }, [totals]);

  // ── Bar chart data ──
  const barChartData = useMemo(() => {
    const rows = leaderboard.slice(0, 12);
    return rows.map(r => {
      const firstName = r.staffName.split(' ')[0];
      return {
        label: firstName.length > 8 ? firstName.slice(0, 7) + '.' : firstName,
        value: viewMode === 'referrals' ? r.referralCredits
          : viewMode === 'returns' ? r.returnCredits
          : r.totalCredits,
      };
    });
  }, [leaderboard, viewMode]);

  // ── Franchise bar chart ──
  const franchiseBarData = useMemo(() => {
    return franchiseData
      .filter(f => f.franchise !== 'Unknown')
      .slice(0, 10)
      .map(f => ({
        label: f.franchise.length > 10 ? f.franchise.slice(0, 9) + '\u2026' : f.franchise,
        value: f.totalCredits,
      }));
  }, [franchiseData]);

  // ── Export ──
  const handleExportCSV = async () => {
    const csv = generateCSV(leaderboard, franchiseData, totals);
    if (Platform.OS === 'web') {
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `staff-credit-leaderboard-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      try {
        await Share.share({ message: csv, title: 'Staff Credit Leaderboard Report' });
      } catch { /* user cancelled */ }
    }
  };

  // ── Loading ──
  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={styles.loadingText}>Loading staff credit data...</Text>
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
        <Text style={styles.errorTitle}>Could not load leaderboard data</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={fetchData} activeOpacity={0.7}>
          <Ionicons name="refresh-outline" size={16} color={COLORS.white} />
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Empty state ──
  if (leaderboard.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <View style={[styles.errorIcon, { backgroundColor: COLORS.accent + '10' }]}>
          <Ionicons name="podium-outline" size={36} color={COLORS.accent} />
        </View>
        <Text style={styles.errorTitle}>No Staff Credits Found</Text>
        <Text style={styles.errorText}>
          When clients are assigned referral credits or returns are recorded with credited staff, the leaderboard will appear here.
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
          <Ionicons name="podium" size={20} color={COLORS.accent} />
          <Text style={styles.actionBarTitleText}>Staff Credit Leaderboard</Text>
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
      {/* FILTERS                                                    */}
      {/* ═══════════════════════════════════════════════════════════ */}

      {/* Date Range Filter */}
      <View style={styles.filterSection}>
        <View style={styles.filterLabelRow}>
          <Ionicons name="calendar-outline" size={14} color={COLORS.textMuted} />
          <Text style={styles.filterLabel}>Date Range</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChipScroll}>
          {DATE_PRESETS.map(preset => (
            <TouchableOpacity
              key={preset.value}
              style={[styles.filterChip, datePreset === preset.value && styles.filterChipActive]}
              onPress={() => setDatePreset(preset.value)}
            >
              <Text style={[styles.filterChipText, datePreset === preset.value && styles.filterChipTextActive]}>
                {preset.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Franchise Filter */}
      {availableFranchises.length > 1 && (
        <View style={styles.filterSection}>
          <View style={styles.filterLabelRow}>
            <Ionicons name="business-outline" size={14} color={COLORS.textMuted} />
            <Text style={styles.filterLabel}>Franchise</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChipScroll}>
            <TouchableOpacity
              style={[styles.filterChip, selectedFranchise === 'all' && styles.filterChipActive]}
              onPress={() => setSelectedFranchise('all')}
            >
              <Text style={[styles.filterChipText, selectedFranchise === 'all' && styles.filterChipTextActive]}>
                All Franchises
              </Text>
            </TouchableOpacity>
            {availableFranchises.map(f => (
              <TouchableOpacity
                key={f}
                style={[styles.filterChip, selectedFranchise === f && styles.filterChipActive]}
                onPress={() => setSelectedFranchise(f === selectedFranchise ? 'all' : f)}
              >
                <Text style={[styles.filterChipText, selectedFranchise === f && styles.filterChipTextActive]}>
                  {f}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Credit Type Filter */}
      <View style={styles.filterSection}>
        <View style={styles.filterLabelRow}>
          <Ionicons name="funnel-outline" size={14} color={COLORS.textMuted} />
          <Text style={styles.filterLabel}>Credit Type</Text>
        </View>
        <View style={styles.creditTypeRow}>
          {([
            { label: 'All Credits', value: 'all' as CreditTypeFilter, icon: 'ribbon' },
            { label: 'Trainer', value: 'trainer' as CreditTypeFilter, icon: 'fitness' },
            { label: 'Dietitian', value: 'dietitian' as CreditTypeFilter, icon: 'nutrition' },
          ]).map(opt => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.creditTypeChip, creditTypeFilter === opt.value && styles.creditTypeChipActive]}
              onPress={() => setCreditTypeFilter(opt.value)}
            >
              <Ionicons
                name={opt.icon as any}
                size={14}
                color={creditTypeFilter === opt.value ? COLORS.white : COLORS.textMuted}
              />
              <Text style={[styles.creditTypeChipText, creditTypeFilter === opt.value && styles.creditTypeChipTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* KPI SUMMARY CARDS                                          */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <View style={styles.kpiGrid}>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBg, { backgroundColor: COLORS.accent + '20' }]}>
            <Ionicons name="podium-outline" size={20} color={COLORS.accent} />
          </View>
          <Text style={styles.kpiValue}>{totals.totalCredits}</Text>
          <Text style={styles.kpiLabel}>Total Credits</Text>
        </View>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBg, { backgroundColor: COLORS.info + '20' }]}>
            <Ionicons name="git-branch-outline" size={20} color={COLORS.info} />
          </View>
          <Text style={[styles.kpiValue, { color: COLORS.info }]}>{totals.referralCredits}</Text>
          <Text style={styles.kpiLabel}>Referral Credits</Text>
        </View>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBg, { backgroundColor: '#16a085' + '20' }]}>
            <Ionicons name="refresh-outline" size={20} color="#16a085" />
          </View>
          <Text style={[styles.kpiValue, { color: '#16a085' }]}>{totals.returnCredits}</Text>
          <Text style={styles.kpiLabel}>Return Credits</Text>
        </View>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBg, { backgroundColor: '#9b59b6' + '20' }]}>
            <Ionicons name="people-outline" size={20} color="#9b59b6" />
          </View>
          <Text style={[styles.kpiValue, { color: '#9b59b6' }]}>{totals.staffCount}</Text>
          <Text style={styles.kpiLabel}>Staff Members</Text>
        </View>
      </View>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* CREDIT TYPE DONUT                                          */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {creditTypeDonut.length > 0 && (
        <>
          <SectionHeader
            title="Credit Breakdown"
            subtitle="Referrals vs. Returns"
            icon="pie-chart"
          />
          <View style={styles.chartCard}>
            <DonutChart
              data={creditTypeDonut}
              size={130}
              centerValue={`${totals.totalCredits}`}
              centerLabel="Credits"
            />
          </View>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* LEADERBOARD BAR CHART                                      */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <SectionHeader
        title="Staff Leaderboard"
        subtitle={`${leaderboard.length} staff member${leaderboard.length !== 1 ? 's' : ''} ranked by total credits`}
        icon="trophy"
      />

      {/* View Mode Toggle */}
      <View style={styles.viewToggleRow}>
        {([
          { label: 'Combined', value: 'combined' as ViewMode, icon: 'stats-chart' },
          { label: 'Referrals', value: 'referrals' as ViewMode, icon: 'git-branch' },
          { label: 'Returns', value: 'returns' as ViewMode, icon: 'refresh' },
        ]).map(opt => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.viewToggle, viewMode === opt.value && styles.viewToggleActive]}
            onPress={() => setViewMode(opt.value)}
          >
            <Ionicons
              name={opt.icon as any}
              size={14}
              color={viewMode === opt.value ? COLORS.white : COLORS.textMuted}
            />
            <Text style={[styles.viewToggleText, viewMode === opt.value && styles.viewToggleTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Bar Chart */}
      {barChartData.length > 1 && (
        <View style={[styles.chartCard, { marginBottom: SPACING.md }]}>
          <BarChart
            data={barChartData}
            height={150}
            barColor={
              viewMode === 'returns' ? '#16a085'
              : viewMode === 'referrals' ? COLORS.info
              : COLORS.accent
            }
          />
        </View>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* LEADERBOARD TABLE                                          */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <View style={styles.tableCard}>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderText, { width: 32, textAlign: 'center' }]}>#</Text>
          <Text style={[styles.tableHeaderText, { flex: 2 }]}>Staff Member</Text>
          <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Referrals</Text>
          <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Returns</Text>
          <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Total</Text>
        </View>
        {leaderboard.slice(0, 30).map((row, i) => {
          const roleColor = row.staffRole === 'dietitian' ? '#9b59b6'
            : row.staffRole === 'both' ? COLORS.accent
            : COLORS.success;
          const roleLabel = row.staffRole === 'both' ? 'Trainer & Dietitian'
            : row.staffRole === 'dietitian' ? 'Dietitian'
            : 'Trainer';

          return (
            <View
              key={row.staffName}
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
                <Text style={styles.staffName} numberOfLines={1}>{row.staffName}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 }}>
                  <View style={[styles.roleDot, { backgroundColor: roleColor }]} />
                  <Text style={styles.staffMeta} numberOfLines={1}>
                    {roleLabel} · {row.franchise}
                  </Text>
                </View>
              </View>
              <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', fontWeight: '700', color: COLORS.info }]}>
                {row.referralCredits}
              </Text>
              <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', fontWeight: '700', color: '#16a085' }]}>
                {row.returnCredits}
              </Text>
              <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', fontWeight: '800', color: COLORS.primary }]}>
                {row.totalCredits}
              </Text>
            </View>
          );
        })}
      </View>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* FRANCHISE BREAKDOWN                                        */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {franchiseData.length > 0 && (
        <>
          <SectionHeader
            title="Credits by Franchise"
            subtitle={`${franchiseData.length} location${franchiseData.length !== 1 ? 's' : ''}`}
            icon="business"
          />

          {/* Franchise bar chart */}
          {franchiseBarData.length > 1 && (
            <View style={[styles.chartCard, { marginBottom: SPACING.md }]}>
              <BarChart data={franchiseBarData} height={140} barColor={COLORS.info} />
            </View>
          )}

          {/* Franchise table */}
          <View style={styles.tableCard}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, { flex: 2 }]}>Franchise</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Referrals</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Returns</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Total</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Staff</Text>
            </View>
            {franchiseData.map((fd, i) => (
              <View key={fd.franchise} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
                <Text style={[styles.tableCell, { flex: 2, fontWeight: '600' }]} numberOfLines={1}>
                  {fd.franchise}
                </Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', fontWeight: '700', color: COLORS.info }]}>
                  {fd.referralCredits}
                </Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', fontWeight: '700', color: '#16a085' }]}>
                  {fd.returnCredits}
                </Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', fontWeight: '800', color: COLORS.primary }]}>
                  {fd.totalCredits}
                </Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', color: '#9b59b6', fontWeight: '700' }]}>
                  {fd.staffCount}
                </Text>
              </View>
            ))}
          </View>
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

  // Filters
  filterSection: {
    marginBottom: SPACING.md,
  },
  filterLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: SPACING.xs,
  },
  filterLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterChipScroll: {
    flexGrow: 0,
  },
  filterChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: SPACING.sm,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterChipText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  filterChipTextActive: {
    color: COLORS.white,
  },
  creditTypeRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },
  creditTypeChip: {
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
  creditTypeChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  creditTypeChipText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  creditTypeChipTextActive: {
    color: COLORS.white,
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

  // Chart
  chartCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.md,
  },

  // View Toggle
  viewToggleRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
    flexWrap: 'wrap',
  },
  viewToggle: {
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
  viewToggleActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  viewToggleText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  viewToggleTextActive: {
    color: COLORS.white,
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

  // Staff row
  staffName: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.primary,
  },
  staffMeta: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  roleDot: {
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
});
