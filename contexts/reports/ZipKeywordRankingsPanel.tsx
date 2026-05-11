import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import SectionHeader from '../SectionHeader';
import ZipKeywordEntryModal from './ZipKeywordEntryModal';
import {
  FranchiseWithConfig, ZipKeywordConfigRow, ZipKeywordRankingRow,
  listFranchisesWithConfig, listConfig, listRankings, buildGrid,
  getCurrentMonth, getMonthLabel, positionColor, positionLabel,
  DEFAULT_ZIP_KEYWORDS, RankingGridRow,
} from '../../lib/zipKeywordRankingsService';

/**
 * Master-admin panel for tracking where our page ranks for specific
 * keywords in specific zipcodes, grouped by franchise.
 */
export default function ZipKeywordRankingsPanel() {
  const { profile, user } = useAuth();
  const isMasterAdmin = profile?.role === 'admin' || profile?.role === 'master_admin';

  const [franchises, setFranchises] = useState<FranchiseWithConfig[]>([]);
  const [selectedFranchiseId, setSelectedFranchiseId] = useState<string | null>(null);
  const [selectedKeyword, setSelectedKeyword] = useState<string>(DEFAULT_ZIP_KEYWORDS[0]);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [config, setConfig] = useState<ZipKeywordConfigRow[]>([]);
  const [rankings, setRankings] = useState<ZipKeywordRankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Entry modal
  const [editingRow, setEditingRow] = useState<{ zipcode: string; keyword: string; existing: ZipKeywordRankingRow | null } | null>(null);

  const selectedFranchise = useMemo(
    () => franchises.find(f => f.franchise_id === selectedFranchiseId) || null,
    [franchises, selectedFranchiseId]
  );

  // ── Fetch franchises with tracking config ──────────────────────────
  const fetchFranchises = useCallback(async () => {
    if (!isMasterAdmin || !user) return;
    try {
      const rows = await listFranchisesWithConfig();
      setFranchises(rows);
      if (!selectedFranchiseId && rows.length > 0) {
        setSelectedFranchiseId(rows[0].franchise_id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load franchises');
    }
  }, [selectedFranchiseId, isMasterAdmin, user]);

  // ── Fetch config + rankings for the selected franchise & month ─────
  const fetchData = useCallback(async () => {
    if (!isMasterAdmin || !user) { setLoading(false); return; }
    if (!selectedFranchiseId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const [cfg, rnk] = await Promise.all([
        listConfig(selectedFranchiseId),
        listRankings(selectedMonth, selectedFranchiseId),
      ]);
      setConfig(cfg);
      setRankings(rnk);
    } catch (err: any) {
      setError(err.message || 'Failed to load rankings');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedFranchiseId, selectedMonth, isMasterAdmin, user]);

  useEffect(() => { fetchFranchises(); }, [fetchFranchises]);
  useEffect(() => { fetchData(); }, [fetchData]);


  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  // ── Group by keyword for display ───────────────────────────────────
  const gridByKeyword = useMemo(() => {
    const grid = buildGrid(config, rankings);
    const map = new Map<string, RankingGridRow[]>();
    for (const row of grid) {
      if (!map.has(row.keyword)) map.set(row.keyword, []);
      map.get(row.keyword)!.push(row);
    }
    // sort each keyword's zipcodes numerically
    for (const list of map.values()) {
      list.sort((a, b) => a.zipcode.localeCompare(b.zipcode));
    }
    return map;
  }, [config, rankings]);

  const availableKeywords = useMemo(() => Array.from(gridByKeyword.keys()), [gridByKeyword]);

  // Ensure selected keyword is valid
  useEffect(() => {
    if (availableKeywords.length > 0 && !availableKeywords.includes(selectedKeyword)) {
      setSelectedKeyword(availableKeywords[0]);
    }
  }, [availableKeywords, selectedKeyword]);

  const currentGrid = gridByKeyword.get(selectedKeyword) || [];

  // ── KPIs for the selected franchise+keyword+month ──────────────────

  const kpis = useMemo(() => {
    const total = currentGrid.length;
    const submitted = currentGrid.filter(r => r.submitted);
    const tracked = submitted.length;
    const withPos = submitted.filter(r => r.position !== null && r.position !== undefined);
    // Treat "Not Ranked in Top 100" as 101 for averaging purposes
    const avgPos = tracked > 0
      ? submitted.reduce((s, r) => s + (r.position != null ? (r.position as number) : 101), 0) / tracked
      : 0;
    const top10 = withPos.filter(r => (r.position as number) <= 10).length;
    const top3 = withPos.filter(r => (r.position as number) <= 3).length;
    const notRanked = submitted.filter(r => r.position === null || r.position === undefined).length;
    return { total, tracked, avgPos, top10, top3, notRanked };
  }, [currentGrid]);



  // ── Month options: last 12 months + any with data ──────────────────
  const monthOptions = useMemo(() => {
    const out: string[] = [];
    const d = new Date();
    for (let i = 0; i < 12; i++) {
      const dt = new Date(d.getFullYear(), d.getMonth() - i, 1);
      out.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`);
    }
    return out;
  }, []);

  if (!isMasterAdmin) {
    return (
      <View style={styles.restricted}>
        <Ionicons name="lock-closed" size={32} color={COLORS.textMuted} />
        <Text style={styles.restrictedText}>Master admin access required</Text>
      </View>
    );
  }

  return (
    <View>
      {/* ── Header ── */}
      <View style={styles.headerRow}>
        <View style={styles.headerInfo}>
          <View style={styles.headerIconContainer}>
            <Ionicons name="location" size={22} color={COLORS.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Zipcode Keyword Rankings</Text>
            <Text style={styles.headerSubtitle}>Per-zipcode search positions by franchise</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.refreshBtn} onPress={handleRefresh} activeOpacity={0.7}>
            {refreshing ? <ActivityIndicator size="small" color={COLORS.accent} /> : <Ionicons name="refresh" size={18} color={COLORS.textSecondary} />}
          </TouchableOpacity>
        </View>
      </View>

      {/* Error banner */}
      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={16} color={COLORS.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={fetchData}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Franchise selector */}
      <Text style={styles.pickerLabel}>Franchise</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {franchises.length === 0 && !loading && (
          <Text style={styles.mutedText}>No franchises configured yet.</Text>
        )}
        {franchises.map(f => (
          <TouchableOpacity
            key={f.franchise_id}
            style={[styles.chip, selectedFranchiseId === f.franchise_id && styles.chipActive]}
            onPress={() => setSelectedFranchiseId(f.franchise_id)}
          >
            <Ionicons
              name="business"
              size={12}
              color={selectedFranchiseId === f.franchise_id ? COLORS.white : COLORS.textMuted}
            />
            <Text style={[styles.chipText, selectedFranchiseId === f.franchise_id && styles.chipTextActive]}>
              {f.franchise_name}
            </Text>
            <View style={[styles.chipCount, selectedFranchiseId === f.franchise_id && styles.chipCountActive]}>
              <Text style={[styles.chipCountText, selectedFranchiseId === f.franchise_id && styles.chipCountTextActive]}>{f.count}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Keyword selector */}
      {availableKeywords.length > 0 && (
        <>
          <Text style={styles.pickerLabel}>Keyword</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {availableKeywords.map(k => (
              <TouchableOpacity
                key={k}
                style={[styles.chip, selectedKeyword === k && styles.chipActivePrimary]}
                onPress={() => setSelectedKeyword(k)}
              >
                <Ionicons
                  name="key-outline"
                  size={12}
                  color={selectedKeyword === k ? COLORS.white : COLORS.textMuted}
                />
                <Text style={[styles.chipText, selectedKeyword === k && styles.chipTextActive]}>{k}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}

      {/* Month selector */}
      <Text style={styles.pickerLabel}>Month</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {monthOptions.map(m => {
          const [y, mn] = m.split('-');
          const label = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(mn,10)-1] + ' ' + y.slice(2);
          return (
            <TouchableOpacity
              key={m}
              style={[styles.chip, selectedMonth === m && styles.chipActivePrimary]}
              onPress={() => setSelectedMonth(m)}
            >
              <Text style={[styles.chipText, selectedMonth === m && styles.chipTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Loading */}
      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={COLORS.accent} />
          <Text style={styles.mutedText}>Loading rankings…</Text>
        </View>
      )}

      {/* KPI cards */}
      {!loading && config.length > 0 && (
        <View style={styles.kpiGrid}>
          <View style={styles.kpiCard}>
            <View style={[styles.kpiIconBg, { backgroundColor: COLORS.accent + '20' }]}>
              <Ionicons name="trending-up" size={18} color={COLORS.accent} />
            </View>
            <Text style={styles.kpiValue}>{kpis.tracked === 0 ? '--' : kpis.avgPos > 100 ? '+100' : kpis.avgPos.toFixed(1)}</Text>

            <Text style={styles.kpiLabel}>Avg Position</Text>
          </View>
          <View style={styles.kpiCard}>
            <View style={[styles.kpiIconBg, { backgroundColor: '#2ecc71' + '20' }]}>
              <Ionicons name="trophy-outline" size={18} color="#2ecc71" />
            </View>
            <Text style={styles.kpiValue}>{kpis.top3}</Text>
            <Text style={styles.kpiLabel}>Top 3</Text>
          </View>
          <View style={styles.kpiCard}>
            <View style={[styles.kpiIconBg, { backgroundColor: '#27ae60' + '20' }]}>
              <Ionicons name="medal-outline" size={18} color="#27ae60" />
            </View>
            <Text style={styles.kpiValue}>{kpis.top10}</Text>
            <Text style={styles.kpiLabel}>Page 1</Text>
          </View>
          <View style={styles.kpiCard}>
            <View style={[styles.kpiIconBg, { backgroundColor: COLORS.info + '20' }]}>
              <Ionicons name="checkmark-circle-outline" size={18} color={COLORS.info} />
            </View>
            <Text style={styles.kpiValue}>{kpis.tracked}/{kpis.total}</Text>
            <Text style={styles.kpiLabel}>Tracked</Text>
          </View>
          <View style={styles.kpiCard}>
            <View style={[styles.kpiIconBg, { backgroundColor: COLORS.danger + '20' }]}>
              <Ionicons name="close-circle-outline" size={18} color={COLORS.danger} />
            </View>
            <Text style={styles.kpiValue}>{kpis.notRanked}</Text>
            <Text style={styles.kpiLabel}>Not Ranked</Text>
          </View>
        </View>
      )}

      {/* Grid of zipcodes for the selected keyword */}
      {!loading && currentGrid.length > 0 && selectedFranchise && (
        <>
          <SectionHeader
            title={`${currentGrid.length} Zipcodes`}
            subtitle={`${selectedFranchise.franchise_name} · ${selectedKeyword} · ${getMonthLabel(selectedMonth)}`}
            icon="map-outline"
          />
          <View style={styles.zipGrid}>
            {currentGrid.map(row => {
              const color = positionColor(row.position);
              const hasPos = row.position !== null && row.position !== undefined;
              const existing = rankings.find(r => r.zipcode === row.zipcode && r.keyword === row.keyword) || null;
              return (
                <TouchableOpacity
                  key={`${row.zipcode}-${row.keyword}`}
                  style={styles.zipCard}
                  onPress={() => setEditingRow({ zipcode: row.zipcode, keyword: row.keyword, existing })}
                  activeOpacity={0.7}
                >
                  <View style={styles.zipCardTop}>
                    <View style={styles.zipCardZipBox}>
                      <Ionicons name="location" size={12} color={COLORS.primary} />
                      <Text style={styles.zipCardZip}>{row.zipcode}</Text>
                    </View>
                    {hasPos ? (
                      <View style={[styles.zipCardBadge, { backgroundColor: color }]}>
                        <Text style={styles.zipCardBadgeText}>#{row.position}</Text>
                      </View>
                    ) : (
                      <View style={[styles.zipCardBadge, { backgroundColor: COLORS.textMuted }]}>
                        <Text style={styles.zipCardBadgeText}>—</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.zipCardStatus, { color }]}>{positionLabel(row.position)}</Text>
                  <View style={styles.zipCardFooter}>
                    <Ionicons
                      name={existing ? 'create-outline' : 'add-circle-outline'}
                      size={12}
                      color={COLORS.textMuted}
                    />
                    <Text style={styles.zipCardFooterText}>{existing ? 'Tap to edit' : 'Tap to record'}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      {/* Empty state */}
      {!loading && config.length === 0 && (
        <View style={styles.emptyPrompt}>
          <Ionicons name="location-outline" size={40} color={COLORS.accent} />
          <Text style={styles.emptyPromptTitle}>No tracked zipcodes</Text>
          <Text style={styles.emptyPromptText}>
            This franchise has no tracked zipcodes yet. Configure them in the database.
          </Text>
        </View>
      )}

      <View style={{ height: 20 }} />

      {/* Entry modal */}
      {editingRow && selectedFranchise && (
        <ZipKeywordEntryModal
          visible={!!editingRow}
          onClose={() => setEditingRow(null)}
          onSaved={fetchData}
          franchiseId={selectedFranchise.franchise_id}
          franchiseName={selectedFranchise.franchise_name}
          zipcode={editingRow.zipcode}
          keyword={editingRow.keyword}
          month={selectedMonth}
          existingRanking={editingRow.existing}
          userId={user?.id}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  restricted: { alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.xxxl, gap: SPACING.md },
  restrictedText: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted },
  headerRow: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.sm,
    gap: SPACING.sm, ...SHADOWS.md,
  },
  headerInfo: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, flex: 1, minWidth: 200 },
  headerIconContainer: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center', ...SHADOWS.sm,
  },
  headerTitle: { fontSize: FONT_SIZES.lg, fontWeight: '800', color: COLORS.primary },
  headerSubtitle: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '600', marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  refreshBtn: {
    width: 36, height: 36, borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.background,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border,
  },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.dangerLight,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md,
  },
  errorText: { flex: 1, fontSize: FONT_SIZES.sm, color: COLORS.danger, fontWeight: '600' },
  retryText: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.accent },

  pickerLabel: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: SPACING.md, marginBottom: 6 },
  chipRow: { gap: SPACING.sm, paddingRight: SPACING.lg },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: SPACING.md, paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border,
  },
  chipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  chipActivePrimary: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.textSecondary },
  chipTextActive: { color: COLORS.white },
  chipCount: { marginLeft: 2, paddingHorizontal: 6, paddingVertical: 1, borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.background },
  chipCountActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  chipCountText: { fontSize: 10, fontWeight: '800', color: COLORS.primary },
  chipCountTextActive: { color: COLORS.white },

  mutedText: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontStyle: 'italic' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, padding: SPACING.lg, justifyContent: 'center' },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.md, marginBottom: SPACING.md },
  kpiCard: {
    flex: 1, minWidth: '30%', backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, alignItems: 'center', gap: 4, ...SHADOWS.sm,
  },
  kpiIconBg: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  kpiValue: { fontSize: FONT_SIZES.lg, fontWeight: '800', color: COLORS.primary },
  kpiLabel: { fontSize: 9, color: COLORS.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },

  zipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  zipCard: {
    flexBasis: '48%', flexGrow: 1, minWidth: 140,
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, padding: SPACING.md,
    ...SHADOWS.sm, gap: 6,
  },
  zipCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  zipCardZipBox: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  zipCardZip: { fontSize: FONT_SIZES.md, fontWeight: '800', color: COLORS.primary },
  zipCardBadge: { paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: BORDER_RADIUS.full, minWidth: 42, alignItems: 'center' },
  zipCardBadgeText: { fontSize: FONT_SIZES.xs, fontWeight: '800', color: COLORS.white },
  zipCardStatus: { fontSize: FONT_SIZES.xs, fontWeight: '700' },
  zipCardFooter: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  zipCardFooterText: { fontSize: 10, color: COLORS.textMuted, fontWeight: '600' },

  emptyPrompt: {
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg, padding: SPACING.xl,
    alignItems: 'center', marginTop: SPACING.md, borderWidth: 1, borderColor: COLORS.accent + '20',
    borderStyle: 'dashed' as any, gap: SPACING.sm,
  },
  emptyPromptTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.primary },
  emptyPromptText: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20 },
});
