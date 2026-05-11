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

interface StaffInfo {
  id: string;
  full_name: string | null;
  role: string | null;
  franchise: string | null;
}

interface StaffCreditRow {
  staffId: string;
  staffName: string;
  staffRole: 'trainer' | 'dietitian';
  franchise: string;
  totalCredits: number;
  activeClients: number;
  formerClients: number;
}

interface FranchiseCreditData {
  franchise: string;
  trainerCredits: number;
  dietitianCredits: number;
  totalCredits: number;
  uniqueTrainers: number;
  uniqueDietitians: number;
}

// Active statuses
const ACTIVE_STATUSES = ['active-client', 'active-jumpstart'];
const FORMER_STATUSES = ['former-client'];

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

function generateCreditCSV(
  trainerRows: StaffCreditRow[],
  dietitianRows: StaffCreditRow[],
  franchiseData: FranchiseCreditData[],
  totals: { trainerCredits: number; dietitianCredits: number; totalCredits: number; uniqueTrainers: number; uniqueDietitians: number },
): string {
  const lines: string[] = [];

  lines.push('REFERRAL CREDIT ATTRIBUTION REPORT');
  lines.push(`Generated: ${new Date().toLocaleDateString()}`);
  lines.push('');

  lines.push('SUMMARY');
  lines.push(`Total Referral Credits,${totals.totalCredits}`);
  lines.push(`Trainer Credits,${totals.trainerCredits}`);
  lines.push(`Dietitian Credits,${totals.dietitianCredits}`);
  lines.push(`Unique Trainers with Credits,${totals.uniqueTrainers}`);
  lines.push(`Unique Dietitians with Credits,${totals.uniqueDietitians}`);
  lines.push('');

  lines.push('TRAINER CREDITS');
  lines.push('Rank,Trainer,Franchise,Total Credits,Active Clients,Former Clients');
  trainerRows.forEach((r, i) => {
    lines.push(`${i + 1},"${r.staffName}","${r.franchise}",${r.totalCredits},${r.activeClients},${r.formerClients}`);
  });
  lines.push('');

  lines.push('DIETITIAN CREDITS');
  lines.push('Rank,Dietitian,Franchise,Total Credits,Active Clients,Former Clients');
  dietitianRows.forEach((r, i) => {
    lines.push(`${i + 1},"${r.staffName}","${r.franchise}",${r.totalCredits},${r.activeClients},${r.formerClients}`);
  });
  lines.push('');

  lines.push('FRANCHISE BREAKDOWN');
  lines.push('Franchise,Trainer Credits,Dietitian Credits,Total Credits,Unique Trainers,Unique Dietitians');
  franchiseData.forEach(f => {
    lines.push(`"${f.franchise}",${f.trainerCredits},${f.dietitianCredits},${f.totalCredits},${f.uniqueTrainers},${f.uniqueDietitians}`);
  });

  return lines.join('\n');
}

// ── Main Component ──

export default function ReferralCreditReportPanel() {
  const { profile } = useAuth();

  const [profiles, setProfiles] = useState<CreditProfile[]>([]);
  const [staffProfiles, setStaffProfiles] = useState<StaffInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [selectedFranchise, setSelectedFranchise] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'combined' | 'trainers' | 'dietitians'>('combined');

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch client profiles with credit fields
      const { data: clientData, error: clientError } = await supabase
        .from('user_profiles')
        .select('id, full_name, referral_credit_trainer, referral_credit_dietitian, franchise, created_at, contact_status');

      if (clientError) throw new Error(clientError.message);

      // Fetch staff profiles (trainers + dietitians) for name lookups
      const { data: staffData, error: staffError } = await supabase
        .from('user_profiles')
        .select('id, full_name, role, franchise')
        .in('role', ['trainer', 'dietitian']);

      if (staffError) throw new Error(staffError.message);

      setProfiles((clientData || []) as CreditProfile[]);
      setStaffProfiles((staffData || []) as StaffInfo[]);
    } catch (err: any) {
      console.error('Error fetching referral credit data:', err);
      setError(err.message || 'Failed to load referral credit data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Role-based filtering ──
  const roleFilteredProfiles = useMemo(() => {
    if (!profile) return profiles;
    if (profile.role === 'admin') return profiles;
    if ((profile.role === 'franchise_manager' || profile.role === 'trainer' || profile.role === 'dietitian') && profile.franchise) {
      return profiles.filter(p => p.franchise === profile.franchise);
    }
    return profiles;
  }, [profiles, profile]);

  // ── Staff name lookup map ──
  const staffNameMap = useMemo(() => {
    const map: Record<string, { name: string; role: string; franchise: string }> = {};
    for (const s of staffProfiles) {
      map[s.id] = {
        name: s.full_name || 'Unknown',
        role: s.role || 'unknown',
        franchise: s.franchise || 'Unassigned',
      };
    }
    return map;
  }, [staffProfiles]);

  // ── Available franchises for filter ──
  const availableFranchises = useMemo(() => {
    const set = new Set<string>();
    for (const p of roleFilteredProfiles) {
      if (p.franchise) set.add(p.franchise);
    }
    return Array.from(set).sort();
  }, [roleFilteredProfiles]);

  // ── Apply date + franchise filters ──
  const filteredProfiles = useMemo(() => {
    let result = roleFilteredProfiles;

    // Date filter
    const cutoff = getDateCutoff(datePreset);
    if (cutoff) {
      result = result.filter(p => {
        if (!p.created_at) return false;
        return new Date(p.created_at) >= cutoff;
      });
    }

    // Franchise filter
    if (selectedFranchise !== 'all') {
      result = result.filter(p => p.franchise === selectedFranchise);
    }

    return result;
  }, [roleFilteredProfiles, datePreset, selectedFranchise]);

  // ── Profiles with at least one credit ──
  const creditProfiles = useMemo(() => {
    return filteredProfiles.filter(
      p => p.referral_credit_trainer || p.referral_credit_dietitian
    );
  }, [filteredProfiles]);

  // ── Aggregate trainer credits ──
  const trainerCredits = useMemo((): StaffCreditRow[] => {
    const map: Record<string, { totalCredits: number; activeClients: number; formerClients: number }> = {};

    for (const p of creditProfiles) {
      if (!p.referral_credit_trainer) continue;
      const tid = p.referral_credit_trainer;
      if (!map[tid]) map[tid] = { totalCredits: 0, activeClients: 0, formerClients: 0 };
      map[tid].totalCredits++;
      if (ACTIVE_STATUSES.includes(p.contact_status || '')) map[tid].activeClients++;
      if (FORMER_STATUSES.includes(p.contact_status || '')) map[tid].formerClients++;
    }

    return Object.entries(map)
      .map(([staffId, data]) => {
        const info = staffNameMap[staffId];
        return {
          staffId,
          staffName: info?.name || staffId.slice(0, 8) + '...',
          staffRole: 'trainer' as const,
          franchise: info?.franchise || 'Unknown',
          ...data,
        };
      })
      .sort((a, b) => b.totalCredits - a.totalCredits);
  }, [creditProfiles, staffNameMap]);

  // ── Aggregate dietitian credits ──
  const dietitianCredits = useMemo((): StaffCreditRow[] => {
    const map: Record<string, { totalCredits: number; activeClients: number; formerClients: number }> = {};

    for (const p of creditProfiles) {
      if (!p.referral_credit_dietitian) continue;
      const did = p.referral_credit_dietitian;
      if (!map[did]) map[did] = { totalCredits: 0, activeClients: 0, formerClients: 0 };
      map[did].totalCredits++;
      if (ACTIVE_STATUSES.includes(p.contact_status || '')) map[did].activeClients++;
      if (FORMER_STATUSES.includes(p.contact_status || '')) map[did].formerClients++;
    }

    return Object.entries(map)
      .map(([staffId, data]) => {
        const info = staffNameMap[staffId];
        return {
          staffId,
          staffName: info?.name || staffId.slice(0, 8) + '...',
          staffRole: 'dietitian' as const,
          franchise: info?.franchise || 'Unknown',
          ...data,
        };
      })
      .sort((a, b) => b.totalCredits - a.totalCredits);
  }, [creditProfiles, staffNameMap]);

  // ── Combined leaderboard ──
  const combinedLeaderboard = useMemo((): StaffCreditRow[] => {
    const map: Record<string, StaffCreditRow> = {};

    for (const row of trainerCredits) {
      if (!map[row.staffId]) {
        map[row.staffId] = { ...row };
      } else {
        map[row.staffId].totalCredits += row.totalCredits;
        map[row.staffId].activeClients += row.activeClients;
        map[row.staffId].formerClients += row.formerClients;
      }
    }

    for (const row of dietitianCredits) {
      if (!map[row.staffId]) {
        map[row.staffId] = { ...row };
      } else {
        map[row.staffId].totalCredits += row.totalCredits;
        map[row.staffId].activeClients += row.activeClients;
        map[row.staffId].formerClients += row.formerClients;
      }
    }

    return Object.values(map).sort((a, b) => b.totalCredits - a.totalCredits);
  }, [trainerCredits, dietitianCredits]);

  // ── Global totals ──
  const totals = useMemo(() => {
    const trainerCreditCount = creditProfiles.filter(p => p.referral_credit_trainer).length;
    const dietitianCreditCount = creditProfiles.filter(p => p.referral_credit_dietitian).length;
    const totalCredits = trainerCreditCount + dietitianCreditCount;
    const uniqueTrainers = new Set(creditProfiles.map(p => p.referral_credit_trainer).filter(Boolean)).size;
    const uniqueDietitians = new Set(creditProfiles.map(p => p.referral_credit_dietitian).filter(Boolean)).size;
    const clientsWithCredits = creditProfiles.length;
    const totalFiltered = filteredProfiles.length;
    const creditRate = totalFiltered > 0 ? (clientsWithCredits / totalFiltered) * 100 : 0;

    return {
      trainerCredits: trainerCreditCount,
      dietitianCredits: dietitianCreditCount,
      totalCredits,
      uniqueTrainers,
      uniqueDietitians,
      clientsWithCredits,
      totalFiltered,
      creditRate,
    };
  }, [creditProfiles, filteredProfiles]);

  // ── Franchise breakdown ──
  const franchiseData = useMemo((): FranchiseCreditData[] => {
    const map: Record<string, {
      trainerCredits: number;
      dietitianCredits: number;
      trainerIds: Set<string>;
      dietitianIds: Set<string>;
    }> = {};

    for (const p of creditProfiles) {
      const fname = p.franchise || 'Unassigned';
      if (!map[fname]) {
        map[fname] = { trainerCredits: 0, dietitianCredits: 0, trainerIds: new Set(), dietitianIds: new Set() };
      }
      if (p.referral_credit_trainer) {
        map[fname].trainerCredits++;
        map[fname].trainerIds.add(p.referral_credit_trainer);
      }
      if (p.referral_credit_dietitian) {
        map[fname].dietitianCredits++;
        map[fname].dietitianIds.add(p.referral_credit_dietitian);
      }
    }

    return Object.entries(map)
      .map(([franchise, data]) => ({
        franchise,
        trainerCredits: data.trainerCredits,
        dietitianCredits: data.dietitianCredits,
        totalCredits: data.trainerCredits + data.dietitianCredits,
        uniqueTrainers: data.trainerIds.size,
        uniqueDietitians: data.dietitianIds.size,
      }))
      .sort((a, b) => b.totalCredits - a.totalCredits);
  }, [creditProfiles]);

  // ── Donut: Trainer vs Dietitian split ──
  const creditSplitDonut = useMemo(() => {
    if (totals.totalCredits === 0) return [];
    const total = totals.totalCredits || 1;
    return [
      {
        name: 'Trainer Credits',
        value: Math.max(1, Math.round((totals.trainerCredits / total) * 100)),
        color: COLORS.success,
      },
      {
        name: 'Dietitian Credits',
        value: Math.max(1, Math.round((totals.dietitianCredits / total) * 100)),
        color: '#9b59b6',
      },
    ];
  }, [totals]);

  // ── Chart data for current view ──
  const chartData = useMemo(() => {
    const rows = viewMode === 'trainers' ? trainerCredits
      : viewMode === 'dietitians' ? dietitianCredits
      : combinedLeaderboard;

    return rows.slice(0, 10).map(r => ({
      label: r.staffName.split(' ')[0].length > 8
        ? r.staffName.split(' ')[0].slice(0, 7) + '.'
        : r.staffName.split(' ')[0],
      value: r.totalCredits,
    }));
  }, [viewMode, trainerCredits, dietitianCredits, combinedLeaderboard]);

  // ── Franchise chart data ──
  const franchiseChartData = useMemo(() => {
    return franchiseData
      .filter(f => f.franchise !== 'Unassigned')
      .slice(0, 10)
      .map(f => ({
        label: f.franchise.length > 10 ? f.franchise.slice(0, 9) + '\u2026' : f.franchise,
        value: f.totalCredits,
      }));
  }, [franchiseData]);

  // ── Export ──
  const handleExportCSV = async () => {
    const csv = generateCreditCSV(trainerCredits, dietitianCredits, franchiseData, totals);
    if (Platform.OS === 'web') {
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `referral-credit-report-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      try {
        await Share.share({ message: csv, title: 'Referral Credit Attribution Report' });
      } catch { /* user cancelled */ }
    }
  };

  // ── Get display rows for current view ──
  const displayRows = useMemo(() => {
    if (viewMode === 'trainers') return trainerCredits;
    if (viewMode === 'dietitians') return dietitianCredits;
    return combinedLeaderboard;
  }, [viewMode, trainerCredits, dietitianCredits, combinedLeaderboard]);

  // ── Loading ──
  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={styles.loadingText}>Loading referral credit data...</Text>
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
        <Text style={styles.errorTitle}>Could not load referral credit data</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={fetchData} activeOpacity={0.7}>
          <Ionicons name="refresh-outline" size={16} color={COLORS.white} />
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Empty state ──
  if (creditProfiles.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <View style={[styles.errorIcon, { backgroundColor: COLORS.accent + '10' }]}>
          <Ionicons name="ribbon-outline" size={36} color={COLORS.accent} />
        </View>
        <Text style={styles.errorTitle}>No Referral Credits Yet</Text>
        <Text style={styles.errorText}>
          When clients are assigned referral credit trainers or dietitians, attribution data will appear here showing who is generating the most referral credits.
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
          <Ionicons name="ribbon" size={20} color={COLORS.accent} />
          <Text style={styles.actionBarTitleText}>Referral Credit Attribution</Text>
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

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* KPI SUMMARY CARDS                                          */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <View style={styles.kpiGrid}>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBg, { backgroundColor: COLORS.accent + '20' }]}>
            <Ionicons name="ribbon-outline" size={20} color={COLORS.accent} />
          </View>
          <Text style={styles.kpiValue}>{totals.totalCredits}</Text>
          <Text style={styles.kpiLabel}>Total Credits</Text>
        </View>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBg, { backgroundColor: COLORS.success + '20' }]}>
            <Ionicons name="fitness-outline" size={20} color={COLORS.success} />
          </View>
          <Text style={[styles.kpiValue, { color: COLORS.success }]}>{totals.trainerCredits}</Text>
          <Text style={styles.kpiLabel}>Trainer Credits</Text>
        </View>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBg, { backgroundColor: '#9b59b6' + '20' }]}>
            <Ionicons name="nutrition-outline" size={20} color="#9b59b6" />
          </View>
          <Text style={[styles.kpiValue, { color: '#9b59b6' }]}>{totals.dietitianCredits}</Text>
          <Text style={styles.kpiLabel}>Dietitian Credits</Text>
        </View>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBg, { backgroundColor: COLORS.info + '20' }]}>
            <Ionicons name="people-outline" size={20} color={COLORS.info} />
          </View>
          <Text style={[styles.kpiValue, { color: COLORS.info }]}>{totals.clientsWithCredits}</Text>
          <Text style={styles.kpiLabel}>Clients w/ Credits</Text>
        </View>
      </View>

      {/* Secondary KPI Row */}
      <View style={styles.secondaryKpiRow}>
        <View style={styles.secondaryKpi}>
          <Text style={styles.secondaryKpiLabel}>Unique Trainers</Text>
          <Text style={styles.secondaryKpiValue}>{totals.uniqueTrainers}</Text>
        </View>
        <View style={styles.secondaryKpiDivider} />
        <View style={styles.secondaryKpi}>
          <Text style={styles.secondaryKpiLabel}>Unique Dietitians</Text>
          <Text style={styles.secondaryKpiValue}>{totals.uniqueDietitians}</Text>
        </View>
        <View style={styles.secondaryKpiDivider} />
        <View style={styles.secondaryKpi}>
          <Text style={styles.secondaryKpiLabel}>Credit Rate</Text>
          <Text style={styles.secondaryKpiValue}>{totals.creditRate.toFixed(1)}%</Text>
        </View>
        <View style={styles.secondaryKpiDivider} />
        <View style={styles.secondaryKpi}>
          <Text style={styles.secondaryKpiLabel}>Franchises</Text>
          <Text style={styles.secondaryKpiValue}>{franchiseData.length}</Text>
        </View>
      </View>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* CREDIT SPLIT DONUT                                         */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {creditSplitDonut.length > 0 && (
        <>
          <SectionHeader
            title="Credit Distribution"
            subtitle="Trainer vs. Dietitian"
            icon="pie-chart"
          />
          <View style={styles.chartCard}>
            <DonutChart
              data={creditSplitDonut}
              size={130}
              centerValue={`${totals.totalCredits}`}
              centerLabel="Credits"
            />
          </View>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* STAFF LEADERBOARD                                          */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <SectionHeader
        title="Credit Leaderboard"
        subtitle={`${displayRows.length} staff member${displayRows.length !== 1 ? 's' : ''}`}
        icon="trophy"
      />

      {/* View Mode Toggle */}
      <View style={styles.viewToggleRow}>
        {([
          { label: 'Combined', value: 'combined' as const, icon: 'people' },
          { label: 'Trainers', value: 'trainers' as const, icon: 'fitness' },
          { label: 'Dietitians', value: 'dietitians' as const, icon: 'nutrition' },
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

      {/* Leaderboard Bar Chart */}
      {chartData.length > 1 && (
        <View style={[styles.chartCard, { marginBottom: SPACING.md }]}>
          <BarChart
            data={chartData}
            height={140}
            barColor={viewMode === 'dietitians' ? '#9b59b6' : viewMode === 'trainers' ? COLORS.success : COLORS.accent}
          />
        </View>
      )}

      {/* Leaderboard Table */}
      {displayRows.length > 0 && (
        <View style={styles.tableCard}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, { width: 32, textAlign: 'center' }]}>#</Text>
            <Text style={[styles.tableHeaderText, { flex: 2 }]}>Staff Member</Text>
            <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Credits</Text>
            <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Active</Text>
            <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Former</Text>
          </View>
          {displayRows.slice(0, 25).map((row, i) => {
            const roleColor = row.staffRole === 'trainer' ? COLORS.success : '#9b59b6';
            return (
              <View
                key={row.staffId}
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
                      {row.staffRole === 'trainer' ? 'Trainer' : 'Dietitian'} · {row.franchise}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', fontWeight: '800', color: COLORS.primary }]}>
                  {row.totalCredits}
                </Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', fontWeight: '700', color: COLORS.success }]}>
                  {row.activeClients}
                </Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', fontWeight: '700', color: COLORS.textMuted }]}>
                  {row.formerClients}
                </Text>
              </View>
            );
          })}
        </View>
      )}

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
          {franchiseChartData.length > 1 && (
            <View style={[styles.chartCard, { marginBottom: SPACING.md }]}>
              <BarChart data={franchiseChartData} height={140} barColor={COLORS.info} />
            </View>
          )}

          {/* Franchise table */}
          <View style={styles.tableCard}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, { flex: 2 }]}>Franchise</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Trainer</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Dietitian</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Total</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Staff</Text>
            </View>
            {franchiseData.map((fd, i) => (
              <View key={fd.franchise} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
                <Text style={[styles.tableCell, { flex: 2, fontWeight: '600' }]} numberOfLines={1}>
                  {fd.franchise}
                </Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', fontWeight: '700', color: COLORS.success }]}>
                  {fd.trainerCredits}
                </Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', fontWeight: '700', color: '#9b59b6' }]}>
                  {fd.dietitianCredits}
                </Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', fontWeight: '800', color: COLORS.primary }]}>
                  {fd.totalCredits}
                </Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', color: COLORS.info, fontWeight: '700' }]}>
                  {fd.uniqueTrainers + fd.uniqueDietitians}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TRAINER DETAIL TABLE (when in combined view)               */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {viewMode === 'combined' && trainerCredits.length > 0 && (
        <>
          <SectionHeader
            title="Trainer Credits Detail"
            subtitle={`${trainerCredits.length} trainer${trainerCredits.length !== 1 ? 's' : ''}`}
            icon="fitness"
          />
          <View style={styles.tableCard}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, { width: 32, textAlign: 'center' }]}>#</Text>
              <Text style={[styles.tableHeaderText, { flex: 2 }]}>Trainer</Text>
              <Text style={[styles.tableHeaderText, { flex: 1.5 }]}>Franchise</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Credits</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Active</Text>
            </View>
            {trainerCredits.map((row, i) => (
              <View key={row.staffId} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
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
                <Text style={[styles.tableCell, { flex: 2, fontWeight: '700', color: COLORS.primary }]} numberOfLines={1}>
                  {row.staffName}
                </Text>
                <Text style={[styles.tableCell, { flex: 1.5 }]} numberOfLines={1}>
                  {row.franchise}
                </Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', fontWeight: '800', color: COLORS.success }]}>
                  {row.totalCredits}
                </Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', fontWeight: '700', color: COLORS.success }]}>
                  {row.activeClients}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* DIETITIAN DETAIL TABLE (when in combined view)             */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {viewMode === 'combined' && dietitianCredits.length > 0 && (
        <>
          <SectionHeader
            title="Dietitian Credits Detail"
            subtitle={`${dietitianCredits.length} dietitian${dietitianCredits.length !== 1 ? 's' : ''}`}
            icon="nutrition"
          />
          <View style={styles.tableCard}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, { width: 32, textAlign: 'center' }]}>#</Text>
              <Text style={[styles.tableHeaderText, { flex: 2 }]}>Dietitian</Text>
              <Text style={[styles.tableHeaderText, { flex: 1.5 }]}>Franchise</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Credits</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Active</Text>
            </View>
            {dietitianCredits.map((row, i) => (
              <View key={row.staffId} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
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
                <Text style={[styles.tableCell, { flex: 2, fontWeight: '700', color: COLORS.primary }]} numberOfLines={1}>
                  {row.staffName}
                </Text>
                <Text style={[styles.tableCell, { flex: 1.5 }]} numberOfLines={1}>
                  {row.franchise}
                </Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', fontWeight: '800', color: '#9b59b6' }]}>
                  {row.totalCredits}
                </Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', fontWeight: '700', color: COLORS.success }]}>
                  {row.activeClients}
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
