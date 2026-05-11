import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Platform, Share, Animated, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import SectionHeader from '../SectionHeader';
import { BarChart } from '../MiniChart';
import SevenStrategiesEntryModal from './SevenStrategiesEntryModal';
import SevenStrategiesCSVUploadModal from './SevenStrategiesCSVUploadModal';
import TrendComparisonSection from './TrendComparisonSection';

import {
  SevenStrategiesEntry, SevenStrategiesInput, ComputedStrategies,
  computeStrategies, getEntries, getEntriesForMonths, upsertEntry, deleteEntry,
  getCurrentMonth, getMonthLabel, getPreviousMonths, getPreviousMonth, getMonthsFromEarliest, getEarliestMonth,
  formatCurrency, formatCurrencyFull, formatPercent, generateCSV, generateEntriesOnlyCSV, sanitizeEntry,
} from '../../lib/sevenStrategiesService';


import { supabase } from '@/app/lib/supabase';


interface FranchiseOption {
  id: string;
  name: string;
}

// ============ STRATEGY CARD ============

interface StrategyCardProps {
  number: number;
  title: string;
  value: string;
  icon: string;
  color: string;
  isPercent?: boolean;
  rawValue?: number;
  benchmark?: { good: number; warning: number }; // thresholds
  fullWidth?: boolean;
}

function StrategyCard({ number, title, value, icon, color, isPercent, rawValue, benchmark, fullWidth }: StrategyCardProps) {
  // Determine status color based on benchmark
  let statusColor = color;
  let statusIcon: string | null = null;
  if (benchmark && rawValue !== undefined && isFinite(rawValue)) {
    if (rawValue >= benchmark.good) {
      statusColor = COLORS.success;
      statusIcon = 'arrow-up';
    } else if (rawValue >= benchmark.warning) {
      statusColor = COLORS.warning;
      statusIcon = 'remove';
    } else {
      statusColor = COLORS.danger;
      statusIcon = 'arrow-down';
    }
  }

  // Split title on ">" for two-line rendering
  const hasArrow = title.includes('>');
  const titleParts = hasArrow ? title.split('>').map(s => s.trim()) : [title];

  return (
    <View style={[strategyStyles.card, { borderLeftColor: statusColor }, fullWidth && strategyStyles.cardFullWidth]}>
      <View style={strategyStyles.cardHeader}>
        <View style={[strategyStyles.numberBadge, { backgroundColor: statusColor + '20' }]}>
          <Text style={[strategyStyles.numberText, { color: statusColor }]}>{number}</Text>
        </View>
        <View style={{ flex: 1 }}>
          {hasArrow ? (
            <>
              <Text style={strategyStyles.cardTitle}>{titleParts[0]}</Text>
              <Text style={strategyStyles.cardTitleSecondLine}>&gt; {titleParts[1]}</Text>
            </>
          ) : (
            <Text style={strategyStyles.cardTitle}>{title}</Text>
          )}
        </View>
      </View>
      <View style={strategyStyles.valueRow}>
        <Text style={[strategyStyles.cardValue, { color: statusColor }]}>{value}</Text>
        {statusIcon && (
          <Ionicons name={statusIcon as any} size={14} color={statusColor} style={{ marginLeft: 4 }} />
        )}
      </View>
    </View>
  );
}



// ============ VALUE BUBBLE (for actual numbers) ============

interface ValueBubbleProps {
  label: string;
  value: string;
  icon: string;
  color: string;
  fullWidth?: boolean;
}

function ValueBubble({ label, value, icon, color, fullWidth }: ValueBubbleProps) {
  return (
    <View style={[valueBubbleStyles.card, { borderLeftColor: color }, fullWidth && valueBubbleStyles.cardFullWidth]}>
      <View style={valueBubbleStyles.header}>
        <View style={[valueBubbleStyles.iconBg, { backgroundColor: color + '15' }]}>
          <Ionicons name={icon as any} size={14} color={color} />
        </View>
        <Text style={valueBubbleStyles.label}>{label}</Text>
      </View>
      <Text style={[valueBubbleStyles.value, { color }]}>{value}</Text>
    </View>
  );
}

const valueBubbleStyles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderLeftWidth: 4,
    ...SHADOWS.sm,
  },
  cardFullWidth: {
    flex: undefined as any,
    minWidth: undefined as any,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  iconBg: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
    flex: 1,
  },
  value: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '800',
  },
});


const strategyStyles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderLeftWidth: 4,
    ...SHADOWS.sm,
  },
  cardFullWidth: {
    flex: undefined as any,
    minWidth: undefined as any,
    width: '100%',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.xs,
    marginBottom: 2,
  },
  numberBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  numberText: {
    fontSize: 9,
    fontWeight: '800',
  },
  cardTitle: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  cardTitleSecondLine: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardValue: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '800',
  },
});




// ============ FUNNEL VISUALIZATION ============

interface FunnelStepProps {
  label: string;
  value: number;
  maxValue: number;
  color: string;
  conversionRate?: string;
  isLast?: boolean;
}

function FunnelStep({ label, value, maxValue, color, conversionRate, isLast }: FunnelStepProps) {
  const width = maxValue > 0 ? Math.max(20, (value / maxValue) * 100) : 20;

  return (
    <View style={funnelStyles.stepContainer}>
      <View style={funnelStyles.stepRow}>
        <View style={funnelStyles.labelCol}>
          <Text style={funnelStyles.stepLabel}>{label}</Text>
          <Text style={[funnelStyles.stepValue, { color }]}>{value}</Text>
        </View>
        <View style={funnelStyles.barCol}>
          <View
            style={[funnelStyles.bar, { width: `${width}%`, backgroundColor: color }]}
          />
        </View>
      </View>
      {!isLast && conversionRate && (
        <View style={funnelStyles.arrowRow}>
          <Ionicons name="arrow-down" size={14} color={COLORS.textMuted} />
          <Text style={funnelStyles.conversionText}>{conversionRate}</Text>
        </View>
      )}
    </View>
  );
}

const funnelStyles = StyleSheet.create({
  stepContainer: {
    marginBottom: 2,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  labelCol: {
    width: 100,
  },
  stepLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  stepValue: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
  },
  barCol: {
    flex: 1,
    height: 24,
    backgroundColor: COLORS.borderLight,
    borderRadius: BORDER_RADIUS.sm,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  bar: {
    height: '100%',
    borderRadius: BORDER_RADIUS.sm,
    opacity: 0.7,
  },
  arrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 30,
    marginVertical: 4,
  },
  conversionText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '700',
  },
});

// ============ LOADING SKELETON ============

function LoadingSkeleton() {
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);

  return (
    <Animated.View style={{ opacity: pulseAnim, gap: SPACING.md }}>
      <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
        {[1, 2, 3].map(i => (
          <View key={i} style={{ flex: 1, height: 30, backgroundColor: COLORS.border, borderRadius: BORDER_RADIUS.full }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm }}>
        {[1, 2, 3, 4, 5, 6, 7].map(i => (
          <View key={i} style={{ flex: 1, minWidth: '45%', height: 110, backgroundColor: COLORS.border, borderRadius: BORDER_RADIUS.lg }} />
        ))}
      </View>
      <View style={{ height: 200, backgroundColor: COLORS.border, borderRadius: BORDER_RADIUS.lg }} />
    </Animated.View>
  );
}

// ============ MAIN COMPONENT ============

export default function SevenStrategiesPanel() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isFranchiseManager = profile?.role === 'franchise_manager';

  // State
  const [entries, setEntries] = useState<SevenStrategiesEntry[]>([]);
  const [prevMonthEntries, setPrevMonthEntries] = useState<SevenStrategiesEntry[]>([]);
  const [franchises, setFranchises] = useState<FranchiseOption[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [selectedFranchise, setSelectedFranchise] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [editEntry, setEditEntry] = useState<SevenStrategiesEntry | null>(null);
  const [showCSVUploadModal, setShowCSVUploadModal] = useState(false);

  // Dynamic month options - fetched from earliest DB entry to current month
  const [monthOptions, setMonthOptions] = useState<string[]>(() => getPreviousMonths(12));

  // Fetch earliest month from DB and build dynamic month range
  const fetchMonthRange = useCallback(async () => {
    try {
      const earliest = await getEarliestMonth();
      if (earliest) {
        const dynamicMonths = getMonthsFromEarliest(earliest);
        if (dynamicMonths.length > 0) {
          setMonthOptions(dynamicMonths);
        }
      }
    } catch (err) {
      console.log('[7strategies] Error fetching earliest month:', err);
      // Keep the default 12-month fallback
    }
  }, []);

  useEffect(() => {
    fetchMonthRange();
  }, [fetchMonthRange]);




  // Fetch franchises
  const fetchFranchises = useCallback(async () => {
    try {
      const { data, error: err } = await supabase.functions.invoke('manage-franchises', {
        body: { action: 'list' },
      });
      if (!err && data?.data) {
        const opts: FranchiseOption[] = data.data
          .filter((f: any) => f.is_active !== false)
          .map((f: any) => ({ id: f.id, name: f.name }));
        setFranchises(opts);
      }
    } catch (err) {
      console.log('[7strategies] Error fetching franchises:', err);
    }
  }, []);

  // Fetch entries

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const franchiseFilter = selectedFranchise !== 'all' ? selectedFranchise : undefined;
      const prevMonth = getPreviousMonth(selectedMonth);

      const [currentEntries, prevEntries] = await Promise.all([
        getEntries(selectedMonth, franchiseFilter),
        getEntries(prevMonth, franchiseFilter),
      ]);

      // Sanitize all numeric fields from Postgres (numeric columns come back as strings)
      setEntries(currentEntries.map(e => sanitizeEntry(e)));
      setPrevMonthEntries(prevEntries.map(e => sanitizeEntry(e)));
    } catch (err: any) {
      setError(err?.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedFranchise]);


  useEffect(() => {
    fetchFranchises();
  }, [fetchFranchises]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filtered franchises for the user
  const availableFranchises = useMemo(() => {
    if (isAdmin) return franchises;
    if (profile?.franchise) {
      return franchises.filter(f => f.name === profile.franchise);
    }
    return franchises;
  }, [franchises, profile, isAdmin]);

  // Map prev month entries by franchise_id for quick lookup
  const prevMonthMap = useMemo(() => {
    const map = new Map<string, SevenStrategiesEntry>();
    for (const e of prevMonthEntries) {
      map.set(e.franchise_id, e);
    }
    return map;
  }, [prevMonthEntries]);

  // Computed strategies per entry
  const computedEntries = useMemo(() => {
    return entries.map(entry => ({
      entry,
      computed: computeStrategies(entry, prevMonthMap.get(entry.franchise_id)),
    }));
  }, [entries, prevMonthMap]);

  // Aggregated totals across all entries for the selected month
  const aggregated = useMemo(() => {
    if (entries.length === 0) return null;

    const totals = entries.reduce(
      (acc, e) => ({
        lead_count: acc.lead_count + e.lead_count,
        call_count: acc.call_count + e.call_count,
        jumpstart_count: acc.jumpstart_count + e.jumpstart_count,
        new_client_count: acc.new_client_count + e.new_client_count,
        total_client_count: acc.total_client_count + e.total_client_count,
        clients_lost: acc.clients_lost + e.clients_lost,
        total_revenue: acc.total_revenue + e.total_revenue,
        total_expenses: acc.total_expenses + e.total_expenses,
      }),
      {
        lead_count: 0, call_count: 0, jumpstart_count: 0,
        new_client_count: 0, total_client_count: 0, clients_lost: 0,
        total_revenue: 0, total_expenses: 0,
      }
    );

    const prevTotals = prevMonthEntries.reduce(
      (acc, e) => ({ total_client_count: acc.total_client_count + e.total_client_count }),
      { total_client_count: 0 }
    );

    const prevEntry = prevTotals.total_client_count > 0
      ? { total_client_count: prevTotals.total_client_count } as any
      : null;

    return computeStrategies(totals as any, prevEntry);
  }, [entries, prevMonthEntries]);

  // Handlers
  const handleSaveEntry = async (input: SevenStrategiesInput) => {
    await upsertEntry(input);
    await fetchData();
  };

  const handleEditEntry = (entry: SevenStrategiesEntry) => {
    setEditEntry(entry);
    setShowEntryModal(true);
  };

  const handleDeleteEntry = async (entry: SevenStrategiesEntry) => {
    const doDelete = async () => {
      try {
        await deleteEntry(entry.id);
        await fetchData();
      } catch (err: any) {
        setError(err?.message || 'Failed to delete');
      }
    };

    if (Platform.OS === 'web') {
      if (confirm(`Delete ${entry.franchise_name} entry for ${getMonthLabel(entry.month)}?`)) {
        doDelete();
      }
    } else {
      const { Alert } = require('react-native');
      Alert.alert('Delete Entry', `Delete ${entry.franchise_name} entry?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const handleExportCSV = async () => {
    const csv = generateCSV(entries, prevMonthMap);
    if (Platform.OS === 'web') {
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `7-strategies-${selectedMonth}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      try {
        await Share.share({ message: csv, title: `7 Strategies ${getMonthLabel(selectedMonth)}` });
      } catch {}
    }
  };

  // User's franchise info for the modal
  const userFranchiseId = useMemo(() => {
    if (!profile?.franchise) return null;
    return franchises.find(f => f.name === profile.franchise)?.id || null;
  }, [profile, franchises]);

  // Determine if the current month already has an entry for the user's context
  // If so, the main button becomes "Edit Entry" instead of "Add Entry"
  const existingEntryForUser = useMemo((): SevenStrategiesEntry | null => {
    // Franchise-scoped user: check if their franchise has an entry this month
    if (userFranchiseId) {
      return entries.find(e => e.franchise_id === userFranchiseId) || null;
    }
    // Admin with a specific franchise selected (not "all")
    if (isAdmin && selectedFranchise !== 'all') {
      return entries.find(e => e.franchise_id === selectedFranchise) || null;
    }
    // Admin with "all" selected but only one entry exists
    if (isAdmin && selectedFranchise === 'all' && entries.length === 1) {
      return entries[0];
    }
    return null;
  }, [entries, userFranchiseId, isAdmin, selectedFranchise]);

  const isEditMode = !!existingEntryForUser;


  // Show loading
  if (loading && entries.length === 0) {
    return <LoadingSkeleton />;
  }

  return (
    <View>
      {/* Error Banner */}
      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={18} color={COLORS.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)}>
            <Ionicons name="close" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {/* Action Bar */}
      <View style={styles.actionBar}>
        <TouchableOpacity
          style={styles.addEntryBtn}
          onPress={() => {
            if (isEditMode && existingEntryForUser) {
              setEditEntry(existingEntryForUser);
            } else {
              setEditEntry(null);
            }
            setShowEntryModal(true);
          }}
        >
          <Ionicons name={isEditMode ? 'create' : 'add-circle'} size={18} color={COLORS.white} />
          <Text style={styles.addEntryText}>{isEditMode ? 'Edit Entry' : 'Add Entry'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.exportBtn}
          onPress={() => setShowCSVUploadModal(true)}
        >
          <Ionicons name="cloud-upload-outline" size={16} color={COLORS.accent} />
          <Text style={styles.exportBtnText}>Upload CSV</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.exportBtn} onPress={handleExportCSV}>
          <Ionicons name="download-outline" size={16} color={COLORS.accent} />
          <Text style={styles.exportBtnText}>CSV</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.exportBtn} onPress={fetchData}>
          <Ionicons name="refresh-outline" size={16} color={COLORS.accent} />
          <Text style={styles.exportBtnText}>Refresh</Text>
        </TouchableOpacity>
      </View>


      {/* Month Selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.monthScroll}
        contentContainerStyle={styles.monthScrollContent}
      >
        {monthOptions.map(m => (
          <TouchableOpacity
            key={m}
            style={[styles.monthChip, m === selectedMonth && styles.monthChipActive]}
            onPress={() => setSelectedMonth(m)}
          >
            <Text style={[styles.monthChipText, m === selectedMonth && styles.monthChipTextActive]}>
              {getMonthLabel(m)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Franchise Filter (admin only) */}
      {isAdmin && franchises.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.franchiseScroll}
          contentContainerStyle={styles.franchiseScrollContent}
        >
          <TouchableOpacity
            style={[styles.franchiseChip, selectedFranchise === 'all' && styles.franchiseChipActive]}
            onPress={() => setSelectedFranchise('all')}
          >
            <Ionicons name="globe-outline" size={12} color={selectedFranchise === 'all' ? COLORS.white : COLORS.textSecondary} />
            <Text style={[styles.franchiseChipText, selectedFranchise === 'all' && styles.franchiseChipTextActive]}>
              All Franchises
            </Text>
          </TouchableOpacity>
          {franchises.map(f => (
            <TouchableOpacity
              key={f.id}
              style={[styles.franchiseChip, selectedFranchise === f.id && styles.franchiseChipActive]}
              onPress={() => setSelectedFranchise(f.id)}
            >
              <Text style={[styles.franchiseChipText, selectedFranchise === f.id && styles.franchiseChipTextActive]}>
                {f.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Empty State */}
      {entries.length === 0 && !loading && (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconBg}>
            <Ionicons name="analytics-outline" size={40} color={COLORS.accent} />
          </View>
          <Text style={styles.emptyTitle}>No Data for {getMonthLabel(selectedMonth)}</Text>
          <Text style={styles.emptySubtitle}>
            Add your first 7 Strategies entry to see computed metrics and insights.
          </Text>
          <TouchableOpacity
            style={styles.emptyAddBtn}
            onPress={() => { setEditEntry(null); setShowEntryModal(true); }}
          >
            <Ionicons name="add-circle" size={18} color={COLORS.white} />
            <Text style={styles.emptyAddBtnText}>Add Entry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* 7 STRATEGY CARDS                                           */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {aggregated && (
        <>
          <SectionHeader
            title="7 Strategies"
            subtitle={entries.length > 1 ? `${entries.length} franchises combined` : entries[0]?.franchise_name}
            icon="analytics"
          />

          {(() => {
            // Compute raw totals for value bubbles
            const totalConversations = entries.reduce((s, e) => s + e.call_count, 0);
            const totalJumpstarts = entries.reduce((s, e) => s + e.jumpstart_count, 0);
            const totalNewClients = entries.reduce((s, e) => s + e.new_client_count, 0);
            const totalClientsLost = entries.reduce((s, e) => s + e.clients_lost, 0);
            const totalClients = entries.reduce((s, e) => s + e.total_client_count, 0);
            const computedRevenue = totalClients * aggregated.avgMonthlyInvestment;
            const computedProfit = computedRevenue - (computedRevenue * aggregated.expenseRatio);

            return (
              <View style={styles.strategyGrid}>

                {/* Row 1: Leads Generated - FULL WIDTH */}
                <StrategyCard
                  number={1}
                  title="Leads Generated"
                  value={String(aggregated.leadsGenerated)}
                  icon="megaphone-outline"
                  color={COLORS.info}
                  fullWidth
                />

                {/* Row 2: Leads > Conversations % | # Conversations */}
                <View style={styles.strategyRow}>
                  <StrategyCard
                    number={2}
                    title="Leads > Conversations"
                    value={formatPercent(aggregated.leadsToConversations)}
                    icon="chatbubbles-outline"
                    color={COLORS.accent}
                    isPercent
                    rawValue={aggregated.leadsToConversations}
                    benchmark={{ good: 0.5, warning: 0.3 }}
                  />
                  <ValueBubble
                    label="Conversations"
                    value={String(totalConversations)}
                    icon="chatbubbles"
                    color={COLORS.accent}
                  />
                </View>

                {/* Row 3: Conversations > Jumpstarts % | # Jumpstarts */}
                <View style={styles.strategyRow}>
                  <StrategyCard
                    number={3}
                    title="Conversations > Jumpstarts"
                    value={formatPercent(aggregated.conversationsToJumpstarts)}
                    icon="flash-outline"
                    color={COLORS.warning}
                    isPercent
                    rawValue={aggregated.conversationsToJumpstarts}
                    benchmark={{ good: 0.4, warning: 0.2 }}
                  />
                  <ValueBubble
                    label="Jumpstarts"
                    value={String(totalJumpstarts)}
                    icon="flash"
                    color={COLORS.warning}
                  />
                </View>

                {/* Row 4: Jumpstarts > New Clients % | # New Clients */}
                <View style={styles.strategyRow}>
                  <StrategyCard
                    number={4}
                    title="Jumpstarts > New Clients"
                    value={formatPercent(aggregated.jumpstartsToNewClients)}
                    icon="person-add-outline"
                    color="#9b59b6"
                    isPercent
                    rawValue={aggregated.jumpstartsToNewClients}
                    benchmark={{ good: 0.6, warning: 0.35 }}
                  />
                  <ValueBubble
                    label="New Clients"
                    value={String(totalNewClients)}
                    icon="person-add"
                    color="#9b59b6"
                  />
                </View>

                {/* Row 5: Retention % | # Clients Lost */}
                <View style={styles.strategyRow}>
                  <StrategyCard
                    number={5}
                    title="Retention"
                    value={aggregated.hasPrevMonthData ? formatPercent(aggregated.retention) : 'N/A'}
                    icon="shield-checkmark-outline"
                    color={COLORS.success}
                    isPercent
                    rawValue={aggregated.retention}
                    benchmark={{ good: 0.9, warning: 0.8 }}
                  />
                  <ValueBubble
                    label="Clients Lost"
                    value={String(totalClientsLost)}
                    icon="person-remove"
                    color={COLORS.danger}
                  />
                </View>

                {/* Row 6: Avg Monthly Investment | Total # Clients */}
                <View style={styles.strategyRow}>
                  <StrategyCard
                    number={6}
                    title="Avg Monthly Investment"
                    value={formatCurrency(aggregated.avgMonthlyInvestment)}
                    icon="wallet-outline"
                    color={COLORS.primary}
                  />
                  <ValueBubble
                    label="Total Clients"
                    value={String(totalClients)}
                    icon="people"
                    color={COLORS.primary}
                  />
                </View>

                {/* Row 7: Expense Ratio % | Revenue */}
                <View style={styles.strategyRow}>
                  <StrategyCard
                    number={7}
                    title="Expense Ratio"
                    value={formatPercent(aggregated.expenseRatio)}
                    icon="pie-chart-outline"
                    color={COLORS.danger}
                    isPercent
                    rawValue={1 - aggregated.expenseRatio}
                    benchmark={{ good: 0.4, warning: 0.2 }}
                  />
                  <ValueBubble
                    label="Revenue"
                    value={formatCurrency(computedRevenue)}
                    icon="cash"
                    color={COLORS.success}
                  />
                </View>

                {/* Row 8: Profit - FULL WIDTH */}
                <ValueBubble
                  label="Profit"
                  value={formatCurrencyFull(computedProfit)}
                  icon={computedProfit >= 0 ? 'trending-up' : 'trending-down'}
                  color={computedProfit >= 0 ? COLORS.success : COLORS.danger}
                  fullWidth
                />
              </View>

            );
          })()}

          {/* ═══════════════════════════════════════════════════════════ */}
          {/* MONTH-OVER-MONTH TREND COMPARISON                          */}
          {/* ═══════════════════════════════════════════════════════════ */}
          <TrendComparisonSection
            selectedMonth={selectedMonth}
            selectedFranchise={selectedFranchise}
          />


          {/* ═══════════════════════════════════════════════════════════ */}
          {/* CONVERSION FUNNEL                                          */}
          {/* ═══════════════════════════════════════════════════════════ */}
          <SectionHeader title="Conversion Funnel" subtitle="Lead to client pipeline" icon="funnel-outline" />
          <View style={styles.funnelCard}>
            {(() => {
              const totalLeads = entries.reduce((s, e) => s + e.lead_count, 0);
              const totalCalls = entries.reduce((s, e) => s + e.call_count, 0);
              const totalJumpstarts = entries.reduce((s, e) => s + e.jumpstart_count, 0);
              const totalNewClients = entries.reduce((s, e) => s + e.new_client_count, 0);
              const maxVal = Math.max(totalLeads, totalCalls, totalJumpstarts, totalNewClients, 1);

              return (
                <>
                  <FunnelStep
                    label="Leads"
                    value={totalLeads}
                    maxValue={maxVal}
                    color={COLORS.info}
                    conversionRate={totalLeads > 0 ? formatPercent(totalCalls / totalLeads) : undefined}
                  />
                  <FunnelStep
                    label="Conversations"

                    value={totalCalls}
                    maxValue={maxVal}
                    color={COLORS.accent}
                    conversionRate={totalCalls > 0 ? formatPercent(totalJumpstarts / totalCalls) : undefined}
                  />
                  <FunnelStep
                    label="Jumpstarts"
                    value={totalJumpstarts}
                    maxValue={maxVal}
                    color={COLORS.warning}
                    conversionRate={totalJumpstarts > 0 ? formatPercent(totalNewClients / totalJumpstarts) : undefined}
                  />
                  <FunnelStep
                    label="New Clients"
                    value={totalNewClients}
                    maxValue={maxVal}
                    color="#9b59b6"
                    isLast
                  />
                </>
              );
            })()}
          </View>

          {/* ═══════════════════════════════════════════════════════════ */}
          {/* INPUT SUMMARY ROW                                          */}
          {/* ═══════════════════════════════════════════════════════════ */}
          <SectionHeader title="Financial Summary" icon="cash-outline" />
          <View style={styles.financialRow}>
            <View style={styles.financialItem}>
              <Text style={styles.financialLabel}>Total Revenue</Text>
              <Text style={[styles.financialValue, { color: COLORS.success }]}>
                {formatCurrencyFull(entries.reduce((s, e) => s + e.total_revenue, 0))}
              </Text>
            </View>
            <View style={styles.financialDivider} />
            <View style={styles.financialItem}>
              <Text style={styles.financialLabel}>Total Expenses</Text>
              <Text style={[styles.financialValue, { color: COLORS.danger }]}>
                {formatCurrencyFull(entries.reduce((s, e) => s + e.total_expenses, 0))}
              </Text>
            </View>
            <View style={styles.financialDivider} />
            <View style={styles.financialItem}>
              <Text style={styles.financialLabel}>Net Profit</Text>
              <Text style={[styles.financialValue, {
                color: entries.reduce((s, e) => s + e.total_revenue - e.total_expenses, 0) >= 0
                  ? COLORS.success : COLORS.danger,
              }]}>
                {formatCurrencyFull(entries.reduce((s, e) => s + e.total_revenue - e.total_expenses, 0))}
              </Text>
            </View>
            <View style={styles.financialDivider} />
            <View style={styles.financialItem}>
              <Text style={styles.financialLabel}>Total Clients</Text>
              <Text style={[styles.financialValue, { color: COLORS.primary }]}>
                {entries.reduce((s, e) => s + e.total_client_count, 0)}
              </Text>
            </View>
          </View>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* FRANCHISE COMPARISON TABLE                                  */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {entries.length > 0 && (
        <>
          <SectionHeader
            title="Franchise Breakdown"
            subtitle={`${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`}
            icon="list"
          />
          <View style={styles.tableCard}>
            {/* Table Header */}
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, { flex: 2 }]}>Franchise</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Leads</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>L&gt;C</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>C&gt;J</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>J&gt;NC</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Ret.</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>AMI</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Exp%</Text>
              <Text style={[styles.tableHeaderText, { width: 60, textAlign: 'center' }]}>Actions</Text>
            </View>

            {/* Table Rows */}
            {computedEntries.map(({ entry, computed }, i) => (
              <View key={entry.id || `${entry.franchise_id}-${i}`} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
                <Text style={[styles.tableCell, { flex: 2, fontWeight: '700' }]} numberOfLines={1}>
                  {entry.franchise_name}
                </Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', color: COLORS.info, fontWeight: '700' }]}>
                  {computed.leadsGenerated}
                </Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center' }]}>
                  {formatPercent(computed.leadsToConversations)}
                </Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center' }]}>
                  {formatPercent(computed.conversationsToJumpstarts)}
                </Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center' }]}>
                  {formatPercent(computed.jumpstartsToNewClients)}
                </Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', color: computed.hasPrevMonthData ? COLORS.success : COLORS.textMuted }]}>
                  {computed.hasPrevMonthData ? formatPercent(computed.retention) : 'N/A'}
                </Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center' }]}>
                  {formatCurrency(computed.avgMonthlyInvestment)}
                </Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center' }]}>
                  {formatPercent(computed.expenseRatio)}
                </Text>
                <View style={{ width: 60, flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
                  <TouchableOpacity
                    onPress={() => handleEditEntry(entry)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="pencil" size={14} color={COLORS.accent} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDeleteEntry(entry)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash" size={14} color={COLORS.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>

          {/* ═══════════════════════════════════════════════════════════ */}
          {/* RAW INPUT DATA TABLE                                       */}
          {/* ═══════════════════════════════════════════════════════════ */}
          <SectionHeader title="Input Data" subtitle="Raw numbers entered" icon="document-text-outline" />
          <View style={styles.tableCard}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, { flex: 2 }]}>Franchise</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Leads</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Conv.</Text>

              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>JS</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>New</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Total</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Lost</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Rev</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Exp</Text>
            </View>
            {entries.map((entry, i) => (
              <View key={entry.id || `raw-${i}`} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
                <Text style={[styles.tableCell, { flex: 2, fontWeight: '700' }]} numberOfLines={1}>
                  {entry.franchise_name}
                </Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center' }]}>{entry.lead_count}</Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center' }]}>{entry.call_count}</Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center' }]}>{entry.jumpstart_count}</Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center' }]}>{entry.new_client_count}</Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center' }]}>{entry.total_client_count}</Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', color: COLORS.danger }]}>{entry.clients_lost}</Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', color: COLORS.success }]}>
                  {formatCurrency(entry.total_revenue)}
                </Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', color: COLORS.danger }]}>
                  {formatCurrency(entry.total_expenses)}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* STRATEGY COMPARISON CHART                                   */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {entries.length > 1 && (
        <>
          <SectionHeader title="Leads by Franchise" icon="bar-chart" />
          <View style={styles.chartCard}>
            <BarChart
              data={entries.map(e => ({
                label: e.franchise_name.length > 8 ? e.franchise_name.slice(0, 7) + '.' : e.franchise_name,
                value: e.lead_count,
              }))}
              height={140}
              barColor={COLORS.info}
            />
          </View>

          <SectionHeader title="Revenue by Franchise" icon="bar-chart" />
          <View style={styles.chartCard}>
            <BarChart
              data={entries.map(e => ({
                label: e.franchise_name.length > 8 ? e.franchise_name.slice(0, 7) + '.' : e.franchise_name,
                value: e.total_revenue / 1000,
              }))}
              height={140}
              barColor={COLORS.success}
            />
          </View>
        </>
      )}

      {/* Entry Modal */}
      <SevenStrategiesEntryModal
        visible={showEntryModal}
        onClose={() => { setShowEntryModal(false); setEditEntry(null); }}
        onSave={handleSaveEntry}
        franchises={availableFranchises}
        selectedMonth={selectedMonth}
        editEntry={editEntry}
        userFranchiseId={userFranchiseId}
        userFranchiseName={profile?.franchise}
      />

      {/* CSV Upload Modal */}
      <SevenStrategiesCSVUploadModal
        visible={showCSVUploadModal}
        onClose={() => setShowCSVUploadModal(false)}
        onSuccess={fetchData}
        franchises={availableFranchises}
        selectedMonth={selectedMonth}
        userFranchiseId={userFranchiseId}
        userFranchiseName={profile?.franchise}
      />
    </View>
  );
}


const styles = StyleSheet.create({
  // Action bar
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
    flexWrap: 'wrap',
  },
  addEntryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
  },
  addEntryText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.white,
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
  // Month selector
  monthScroll: {
    marginBottom: SPACING.sm,
    flexGrow: 0,
  },
  monthScrollContent: {
    gap: SPACING.sm,
    paddingRight: SPACING.md,
  },
  monthChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  monthChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  monthChipText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  monthChipTextActive: {
    color: COLORS.white,
  },
  // Franchise filter
  franchiseScroll: {
    marginBottom: SPACING.md,
    flexGrow: 0,
  },
  franchiseScrollContent: {
    gap: SPACING.sm,
    paddingRight: SPACING.md,
  },
  franchiseChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: 5,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  franchiseChipActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  franchiseChipText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  franchiseChipTextActive: {
    color: COLORS.white,
  },
  // Strategy grid
  strategyGrid: {
    flexDirection: 'column',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  strategyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },


  // Funnel
  funnelCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.md,
  },
  // Financial summary
  financialRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    ...SHADOWS.sm,
  },
  financialItem: {
    flex: 1,
    alignItems: 'center',
  },
  financialLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  financialValue: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
  },
  financialDivider: {
    width: 1,
    backgroundColor: COLORS.borderLight,
    marginHorizontal: 4,
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
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  tableHeaderText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.white,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
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
  // Chart
  chartCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.md,
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: SPACING.xxxl,
    gap: SPACING.md,
  },
  emptyIconBg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.brandBlue50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  emptyTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: COLORS.primary,
  },
  emptySubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 20,
  },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.sm,
  },
  emptyAddBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.dangerLight,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.danger,
  },
  errorText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.danger,
    fontWeight: '600',
    flex: 1,
  },
});
