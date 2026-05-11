import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../constants/theme';
import ClientHeader from '../components/client/ClientHeader';
import SimpleChart from '../components/client/SimpleChart';
import ProgressPhotosTimeline from '../components/client/ProgressPhotosTimeline';
import InteractiveChart from '../components/client/InteractiveChart';
import DateRangeSelector from '../components/client/DateRangeSelector';
import type { DateRange } from '../components/client/DateRangeSelector';
import BiometricComparisonCards from '../components/client/BiometricComparisonCards';
import ExportPanel from '../components/client/ExportPanel';
import ShareResultsModal from '../components/client/ShareResultsModal';
import PosturalAssessmentHistoryPanel from '../components/client/PosturalAssessmentHistoryPanel';
import { biometricMeta, hasMetricValue, isZeroAllowedMetric, formatFlexibility, formatFlexibilityShort } from '../data/clientPortalData';
import type { BiometricEntry } from '../data/clientPortalData';

import { useAuth } from '../contexts/AuthContext';
import { fetchBiometrics, fetchBiometricPhotosGrouped, fetchPosturalAssessments } from '../lib/clientDataService';
import type { PhotoDateGroup, StoredPosturalAssessment } from '../lib/clientDataService';
import { onBiometricsUpdated } from '../lib/biometricEvents';



type BiometricKey = keyof typeof biometricMeta;
type MainTab = 'metrics' | 'results' | 'photos';

const CATEGORIES = [
  { label: 'Cardiovascular', keys: ['bloodPressureSys', 'bloodPressureDia', 'heartRate', 'bodyAge'] },

  { label: 'Body Comp', keys: ['height', 'weight', 'bmi', 'bodyFat', 'muscleMassPct', 'leanMusclePct', 'fatMass', 'leanMuscleMass', 'muscleMass', 'massPerMuscleLb', 'visceralFat'] },

  { label: 'Waist', keys: ['navelWaist', 'widestWaist', 'narrowestWaist'] },
  { label: 'Upper Body', keys: ['shoulders', 'bicep'] },
  { label: 'Lower Body', keys: ['sideHip', 'rearHip', 'calf'] },
  { label: 'Performance', keys: ['flexibility'] },
];

const DEFAULT_RESULTS_METRICS = ['weight', 'bodyFat', 'leanMusclePct', 'muscleMass'];


// Get height from the first (initial) assessment
function getInitialHeight(history: BiometricEntry[]): number {
  if (history.length === 0) return 0;
  // Sort by date ascending, take the first entry's height
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  return sorted[0]?.height || 0;
}




export default function BiometricsScreen() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const [mainTab, setMainTab] = useState<MainTab>('metrics');
  const [selectedMetric, setSelectedMetric] = useState<BiometricKey>('weight');
  const [selectedCategory, setSelectedCategory] = useState(0);
  const [biometricHistory, setBiometricHistory] = useState<BiometricEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [photoGroups, setPhotoGroups] = useState<PhotoDateGroup[]>([]);
  // Postural assessments fuel both the inline panel and the score-overlay
  // on the biometric chart. Keyed below by measurement date for fast lookup.
  const [posturalAssessments, setPosturalAssessments] = useState<StoredPosturalAssessment[]>([]);

  // Results tab state
  const [resultsDateRange, setResultsDateRange] = useState<DateRange | null>(null);
  const [resultsMetrics, setResultsMetrics] = useState<string[]>(DEFAULT_RESULTS_METRICS);


  const loadData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [data, photos, assessments] = await Promise.all([
        fetchBiometrics(user.id),
        fetchBiometricPhotosGrouped(user.id).catch(() => [] as PhotoDateGroup[]),
        fetchPosturalAssessments(user.id).catch(() => [] as StoredPosturalAssessment[]),
      ]);
      setBiometricHistory(data);
      setPhotoGroups(photos);
      setPosturalAssessments(assessments);
    } catch (err) {
      console.error('Error loading biometrics:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh biometrics when a new assessment is saved (from any screen)
  useEffect(() => {
    const unsubscribe = onBiometricsUpdated((updatedUserId) => {
      if (updatedUserId === user?.id) {
        console.log('[BiometricsScreen] Biometrics updated, refreshing...');
        loadData();
      }
    });
    return unsubscribe;
  }, [user?.id, loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);





  // Filtered data for Results tab
  const filteredResultsData = resultsDateRange
    ? biometricHistory.filter(e => e.date >= resultsDateRange.start && e.date <= resultsDateRange.end)
    : biometricHistory;

  const clientName = profile?.full_name || 'Client';

  if (loading) {
    return (
      <View style={styles.container}>
        <ClientHeader title="Biometrics" subtitle="Track Your Progress" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#9b59b6" />
          <Text style={styles.loadingText}>Loading biometric data...</Text>
        </View>
      </View>
    );
  }

  if (biometricHistory.length === 0) {
    return (
      <View style={styles.container}>
        <ClientHeader title="Biometrics" subtitle="View Your Progress" />
        <View style={styles.loadingContainer}>
          <Ionicons name="body-outline" size={48} color={COLORS.textMuted} />
          <Text style={styles.loadingText}>No biometric data yet</Text>
          <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.textMuted, textAlign: 'center', paddingHorizontal: 40 }}>
            Your trainer will record your biometric measurements during your sessions. Check back after your next appointment!
          </Text>
        </View>
      </View>
    );
  }

  const latest = biometricHistory[biometricHistory.length - 1];

  const first = biometricHistory[0];
  const meta = biometricMeta[selectedMetric];

  // Map measurement date → postural score, so we can overlay the score as a
  // secondary line on the selected-metric chart. Dates without a saved
  // assessment simply lack `secondaryValue` and render normally.
  const scoreByDate = new Map<string, number>();
  for (const a of posturalAssessments) {
    const key = a.measuredAt || (a.createdAt ? a.createdAt.split('T')[0] : null);
    if (key) scoreByDate.set(key, a.overallScore);
  }

  // Use `??` (not `|| 0`) so a legitimate 0 or negative reading (e.g.
  // flexibility / sit-and-reach at-toes = 0, short-of-toes = -2) is preserved.
  // `|| 0` would map `-0` → 0 (benign) but more importantly documents intent.
  const chartData = biometricHistory.map(entry => {
    const d = new Date(entry.date + 'T12:00:00');
    const raw = entry[selectedMetric as keyof typeof entry];
    const score = scoreByDate.get(entry.date);
    return {
      label: d.toLocaleDateString('en-US', { month: 'short' }),
      value: typeof raw === 'number' && Number.isFinite(raw) ? raw : 0,
      // Only set secondaryValue when a score exists for that date.
      // SimpleChart skips undefined secondaries, so missing assessments
      // produce a broken (non-continuous) overlay line rather than zeros.
      ...(typeof score === 'number' ? { secondaryValue: score } : {}),
    };
  });

  const currentRaw = latest[selectedMetric as keyof typeof latest];
  const startRaw = first[selectedMetric as keyof typeof first];
  const currentVal = typeof currentRaw === 'number' && Number.isFinite(currentRaw) ? currentRaw : 0;
  const startVal = typeof startRaw === 'number' && Number.isFinite(startRaw) ? startRaw : 0;
  const totalChange = currentVal - startVal;
  // `goodDirection` drives sign → improvement semantics. For flexibility
  // (`goodDirection: 'up'`) a change from -3 → -1 is +2 (progress); from 0 → 2
  // is +2 (progress); from -2 → -3 is -1 (regression). This single rule works
  // across the sign range because we compare the *change*, not the raw value.
  const isImproved = meta?.goodDirection === 'down' ? totalChange < 0 : totalChange > 0;

  const hasPostural = posturalAssessments.length > 0;




  return (
    <View style={styles.container}>
      <ClientHeader title="Biometrics" subtitle="Track Your Progress" />

      {/* Main Tab Toggle: Metrics | Results | Photos */}
      <View style={styles.mainTabBar}>
        {(['metrics', 'results', 'photos'] as MainTab[]).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.mainTab, mainTab === tab && styles.mainTabActive]}
            onPress={() => setMainTab(tab)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={
                tab === 'metrics'
                  ? 'analytics-outline'
                  : tab === 'results'
                  ? 'bar-chart-outline'
                  : 'images-outline'
              }
              size={16}
              color={mainTab === tab ? '#fff' : COLORS.textSecondary}
            />
            <Text style={[styles.mainTabText, mainTab === tab && styles.mainTabTextActive]}>
              {tab === 'metrics' ? 'Metrics' : tab === 'results' ? 'Trends' : 'Photos'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* PHOTOS TAB — view only, no recording CTA */}
      {mainTab === 'photos' && user?.id && (
        <ProgressPhotosTimeline
          userId={user.id}
        />
      )}


      {/* RESULTS TAB */}
      {mainTab === 'results' && (
        <ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#9b59b6" />
          }
        >
          {/* Results Header */}
          <View style={styles.resultsHeader}>
            <View style={styles.resultsHeaderIcon}>
              <Ionicons name="bar-chart" size={20} color={COLORS.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.resultsTitle}>Trends Dashboard</Text>
              <Text style={styles.resultsSubtitle}>
                Visualize your progress with interactive charts & export reports
              </Text>
            </View>
          </View>

          {/* Date Range Selector */}
          <DateRangeSelector
            selectedRange={resultsDateRange}
            onRangeChange={setResultsDateRange}
            earliestDate={first.date}
            latestDate={latest.date}
          />

          {/* Export Panel */}
          <ExportPanel
            data={biometricHistory}
            clientName={clientName}
            dateRange={resultsDateRange}
            selectedMetrics={resultsMetrics}
            onMetricsChange={setResultsMetrics}
          />

          {/* Comparison Cards */}
          <BiometricComparisonCards
            data={filteredResultsData}
            selectedMetrics={resultsMetrics}
          />

          {/* Interactive Charts for each selected metric */}
          {resultsMetrics.map(metricKey => {
            const m = biometricMeta[metricKey];
            if (!m) return null;

            const metricChartData = filteredResultsData.map(entry => {
              const d = new Date(entry.date + 'T12:00:00');
              const raw = entry[metricKey as keyof typeof entry];
              return {
                label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
                // Preserve 0 and negative values for zero-allowed metrics
                // (flexibility: -2 = 2 in short of toes). For other metrics
                // the downstream chart treats 0 as "no data" visually.
                value: typeof raw === 'number' && Number.isFinite(raw) ? raw : 0,
                date: entry.date,
              };
            });

            // Skip the chart only when the entire series has NO recorded data.
            // For most metrics "0" means "not recorded", but for zero-allowed
            // metrics (flexibility) a 0 is a real at-toes reading, so we must
            // keep the chart visible in that case.
            const allMissing = metricChartData.every(d =>
              isZeroAllowedMetric(metricKey)
                ? !Number.isFinite(d.value) // only truly missing
                : d.value === 0
            );
            if (allMissing) return null;

            const firstVal = metricChartData[0]?.value ?? 0;
            const lastVal = metricChartData[metricChartData.length - 1]?.value ?? 0;
            const change = lastVal - firstVal;
            const isMetricImproved = m.goodDirection === 'down' ? change < 0 : change > 0;


            return (
              <View key={metricKey} style={styles.chartCard}>
                <View style={styles.chartCardHeader}>
                  <View style={styles.chartCardHeaderLeft}>
                    <View style={[styles.chartMetricDot, { backgroundColor: m.color }]} />
                    <View>
                      <Text style={styles.chartCardTitle}>{m.label} Trend</Text>
                      <Text style={styles.chartCardSubtitle}>
                        {metricChartData.length} data points
                      </Text>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.chartChangeBadge,
                      { backgroundColor: isMetricImproved ? '#2ecc7115' : '#e74c3c15' },
                    ]}
                  >
                    <Ionicons
                      name={isMetricImproved ? 'trending-down' : 'trending-up'}
                      size={12}
                      color={isMetricImproved ? '#2ecc71' : '#e74c3c'}
                    />
                    <Text
                      style={[
                        styles.chartChangeText,
                        { color: isMetricImproved ? '#2ecc71' : '#e74c3c' },
                      ]}
                    >
                      {change > 0 ? '+' : ''}
                      {change.toFixed(1)}
                      {m.unit ? ` ${m.unit}` : ''}
                    </Text>
                  </View>
                </View>

                <InteractiveChart
                  data={metricChartData}
                  color={m.color}
                  unit={m.unit ? ` ${m.unit}` : ''}
                  height={220}
                  metricLabel={m.label}
                />
              </View>
            );
          })}

          {/* Data Table */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Detailed History</Text>
              <View style={styles.entryCountBadge}>
                <Text style={styles.entryCountText}>{filteredResultsData.length} entries</Text>
              </View>
            </View>

            <View style={styles.historyTable}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, { flex: 1.2 }]}>Date</Text>
                {resultsMetrics.slice(0, 4).map(key => {
                  const m = biometricMeta[key];
                  return (
                    <Text key={key} style={[styles.tableHeaderText, { flex: 1 }]} numberOfLines={1}>
                      {m?.label || key}
                    </Text>
                  );
                })}
              </View>
              {[...filteredResultsData].reverse().map((entry, i) => (
                <View key={i} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
                  <Text style={[styles.tableCell, { flex: 1.2 }]}>
                    {new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: '2-digit',
                    })}
                  </Text>
                  {resultsMetrics.slice(0, 4).map(key => {
                    const raw = entry[key as keyof typeof entry];
                    const val = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
                    const m = biometricMeta[key];
                    // For zero-allowed metrics (flexibility), 0 and negatives
                    // are legitimate readings and must be rendered — including
                    // the minus sign — instead of displayed as "-" (missing).
                    const show = hasMetricValue(key, raw as any);
                    const text = show
                      ? (key === 'flexibility'
                          ? formatFlexibilityShort(val)
                          : `${val}${m?.unit ? ' ' + m.unit : ''}`)
                      : '-';
                    return (
                      <Text key={key} style={[styles.tableCell, { flex: 1, fontWeight: '600' }]}>
                        {text}
                      </Text>
                    );
                  })}

                </View>
              ))}
            </View>
          </View>

          <View style={{ height: 30 }} />
        </ScrollView>
      )}

      {/* METRICS TAB */}
      {mainTab === 'metrics' && (
        <ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#9b59b6" />
          }
        >



          {/* Data Source Badge */}
          <View style={styles.dataBadge}>
            <Ionicons name="cloud-done-outline" size={12} color="#2ecc71" />
            <Text style={styles.dataBadgeText}>
              {biometricHistory.length} measurements from database
            </Text>
          </View>

          {/* Progress Summary Cards */}
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, { borderLeftColor: '#2ecc71' }]}>
              <Ionicons name="trending-down" size={18} color="#2ecc71" />
              <Text style={styles.summaryValue}>-{(first.weight - latest.weight).toFixed(1)} lbs</Text>

              <Text style={styles.summaryLabel}>Total Weight Lost</Text>
            </View>
            <View style={[styles.summaryCard, { borderLeftColor: '#f39c12' }]}>
              <Ionicons name="body-outline" size={18} color="#f39c12" />
              <Text style={styles.summaryValue}>-{(first.bodyFat - latest.bodyFat).toFixed(1)}%</Text>
              <Text style={styles.summaryLabel}>Body Fat Reduced</Text>
            </View>
            <View style={[styles.summaryCard, { borderLeftColor: '#3498db' }]}>
              <Ionicons name="fitness-outline" size={18} color="#3498db" />
              <Text style={styles.summaryValue}>+{(latest.muscleMass - first.muscleMass).toFixed(1)} lbs</Text>

              <Text style={styles.summaryLabel}>Muscle Gained</Text>
            </View>
          </View>

          {/* Category Tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll} contentContainerStyle={styles.categoryContent}>
            {CATEGORIES.map((cat, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.categoryTab, selectedCategory === i && styles.categoryTabActive]}
                onPress={() => {
                  setSelectedCategory(i);
                  setSelectedMetric(cat.keys[0] as BiometricKey);
                }}
              >
                <Text style={[styles.categoryText, selectedCategory === i && styles.categoryTextActive]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Metric Selector */}
          <View style={styles.metricGrid}>
            {CATEGORIES[selectedCategory].keys.map(key => {
              const m = biometricMeta[key];
              if (!m) return null;
              const raw = latest[key as keyof typeof latest];
              const val = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
              const isSelected = selectedMetric === key;
              const hasVal = hasMetricValue(key, raw as any);
              // Flexibility gets a descriptive secondary line so negatives read
              // naturally ("3 in short of toes") instead of as a bare "-3 in".
              const displayPrimary = hasVal
                ? `${val}${m.unit ? ` ${m.unit}` : ''}`
                : '—';
              const flexContext = (key === 'flexibility' && hasVal)
                ? formatFlexibility(val)
                : null;
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.metricCard, isSelected && { borderColor: m.color, backgroundColor: m.color + '08' }]}
                  onPress={() => setSelectedMetric(key as BiometricKey)}
                >
                  <View style={[styles.metricIcon, { backgroundColor: m.color + '15' }]}>
                    <Ionicons name={m.icon as any} size={16} color={m.color} />
                  </View>
                  <Text style={styles.metricLabel}>{m.label}</Text>
                  <Text style={[styles.metricValue, { color: m.color }]}>
                    {displayPrimary}
                  </Text>
                  {flexContext && (
                    <Text style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: '600', marginTop: 2 }}>
                      {flexContext}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Chart Section */}
          {meta && (
            <View style={styles.chartSection}>
              <View style={styles.chartHeader}>
                <View style={{ flex: 1, paddingRight: SPACING.sm }}>
                  <Text style={styles.chartTitle}>{meta.label} Trend</Text>
                  <Text style={styles.chartSubtitle}>
                    {biometricHistory.length} measurements over {Math.max(1, Math.round((new Date(latest.date).getTime() - new Date(first.date).getTime()) / (1000 * 60 * 60 * 24 * 30)))} months
                  </Text>
                  {selectedMetric === 'flexibility' && (
                    <Text style={[styles.chartSubtitle, { marginTop: 4, color: meta.color, fontWeight: '700' }]}>
                      Now: {formatFlexibility(currentVal)} &middot; Started: {formatFlexibility(startVal)}
                    </Text>
                  )}
                </View>
                <View style={[styles.changeBadge, { backgroundColor: isImproved ? '#2ecc7115' : '#e74c3c15' }]}>
                  <Ionicons
                    name={isImproved ? 'trending-down' : 'trending-up'}
                    size={14}
                    color={isImproved ? '#2ecc71' : '#e74c3c'}
                  />
                  <Text style={[styles.changeText, { color: isImproved ? '#2ecc71' : '#e74c3c' }]}>
                    {totalChange > 0 ? '+' : ''}{totalChange.toFixed(1)}{meta.unit}
                  </Text>
                </View>
              </View>
              <SimpleChart
                data={chartData}
                color={meta.color}
                secondaryColor="#9b59b6"
                height={160}
                type="line"
                unit={meta.unit ? ` ${meta.unit}` : ''}
              />
              {hasPostural && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: SPACING.sm, paddingLeft: 40 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 10, height: 2, backgroundColor: meta.color, borderRadius: 1 }} />
                    <Text style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: '700' }}>{meta.label}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 10, height: 2, backgroundColor: '#9b59b6', opacity: 0.5, borderRadius: 1 }} />
                    <Text style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: '700' }}>Posture Score</Text>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Postural Assessment History Panel */}
          {user?.id && (
            <View style={{ marginTop: SPACING.md }}>
              <PosturalAssessmentHistoryPanel
                userId={user.id}
                maxItems={3}
                showChart={false}
                onViewAll={() => router.push('/(client)/postural-history')}
              />
            </View>
          )}



          {/* Detailed History */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Measurement History</Text>
            <View style={styles.historyTable}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, { flex: 1.5 }]}>Date</Text>
                <Text style={[styles.tableHeaderText, { flex: 1 }]}>Value</Text>
                <Text style={[styles.tableHeaderText, { flex: 1 }]}>Change</Text>
              </View>
              {[...biometricHistory].reverse().map((entry, i) => {
                const val = (entry[selectedMetric as keyof typeof entry] as number) || 0;
                const prevEntry = [...biometricHistory].reverse()[i + 1];
                const prevV = prevEntry ? ((prevEntry[selectedMetric as keyof typeof prevEntry] as number) || 0) : val;
                const change = val - prevV;
                const changeIsGood = meta?.goodDirection === 'down' ? change < 0 : change > 0;
                return (
                  <View key={i} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
                    <Text style={[styles.tableCell, { flex: 1.5 }]}>
                      {new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                    </Text>
                    <Text style={[styles.tableCell, { flex: 1, fontWeight: '700' }]}>
                      {val} {meta?.unit || ''}
                    </Text>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      {change !== 0 && (
                        <>
                          <Ionicons
                            name={change > 0 ? 'arrow-up' : 'arrow-down'}
                            size={10}
                            color={changeIsGood ? '#2ecc71' : '#e74c3c'}
                          />
                          <Text style={[styles.tableCell, { color: changeIsGood ? '#2ecc71' : '#e74c3c', fontWeight: '600' }]}>
                            {Math.abs(change).toFixed(1)}
                          </Text>
                        </>
                      )}
                      {change === 0 && <Text style={styles.tableCell}>--</Text>}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Health Insights */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Health Insights</Text>
            <View style={styles.insightCard}>
              <View style={[styles.insightIcon, { backgroundColor: '#2ecc7115' }]}>
                <Ionicons name="heart-outline" size={20} color="#2ecc71" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.insightTitle}>Blood Pressure Improving</Text>
                <Text style={styles.insightText}>
                  Your BP has dropped from {first.bloodPressureSys}/{first.bloodPressureDia} to {latest.bloodPressureSys}/{latest.bloodPressureDia}. Now in the normal range!
                </Text>
              </View>
            </View>

            <View style={styles.insightCard}>
              <View style={[styles.insightIcon, { backgroundColor: '#f39c1215' }]}>
                <Ionicons name="pulse-outline" size={20} color="#f39c12" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.insightTitle}>Heart Rate Improving</Text>
                <Text style={styles.insightText}>
                  Your heart rate of {latest.heartRate} bpm is down from {first.heartRate} bpm, indicating excellent cardiovascular adaptation.
                </Text>
              </View>
            </View>

          </View>

          {/* View Results CTA */}
          <TouchableOpacity
            style={styles.viewPhotosCta}
            onPress={() => setMainTab('results')}
            activeOpacity={0.8}
          >
            <View style={styles.viewPhotosIcon}>
              <Ionicons name="bar-chart" size={24} color={COLORS.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.viewPhotosTitle, { color: COLORS.accent }]}>View Trends Dashboard</Text>
              <Text style={styles.viewPhotosSubtitle}>
                Interactive charts, comparisons & export reports
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.accent} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.viewPhotosCta, { marginTop: SPACING.sm }]}
            onPress={() => setMainTab('photos')}
            activeOpacity={0.8}
          >
            <View style={styles.viewPhotosIcon}>
              <Ionicons name="images" size={24} color="#9b59b6" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.viewPhotosTitle}>View Progress Photos</Text>
              <Text style={styles.viewPhotosSubtitle}>
                See your visual transformation with side-by-side comparisons
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9b59b6" />
          </TouchableOpacity>

          {/* Share Results CTA */}
          <TouchableOpacity
            style={[styles.viewPhotosCta, { marginTop: SPACING.sm, borderColor: '#e67e2220' }]}
            onPress={() => setShowShareModal(true)}
            activeOpacity={0.8}
          >
            <View style={[styles.viewPhotosIcon, { backgroundColor: '#e67e2210' }]}>
              <Ionicons name="share-social" size={24} color="#e67e22" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.viewPhotosTitle, { color: '#e67e22' }]}>Share Your Results</Text>
              <Text style={styles.viewPhotosSubtitle}>
                Generate a branded progress summary to share via email or download
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#e67e22" />
          </TouchableOpacity>

          <View style={{ height: 30 }} />
        </ScrollView>

      )}




      {/* Share Results Modal */}
      <ShareResultsModal
        visible={showShareModal}
        onClose={() => setShowShareModal(false)}
        clientName={clientName}
        firstEntry={first}
        latestEntry={latest}
        photoGroups={photoGroups}
      />
    </View>
  );
}

const styles = StyleSheet.create({

  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.md,
  },
  loadingText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  // Main Tab Bar
  mainTabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    padding: 4,
    ...SHADOWS.sm,
  },
  mainTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm + 2,
    borderRadius: BORDER_RADIUS.md,
    gap: 5,
  },
  mainTabActive: {
    backgroundColor: '#9b59b6',
  },
  mainTabText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  mainTabTextActive: {
    color: '#fff',
  },
  // Results Header
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    marginBottom: SPACING.lg,
    backgroundColor: COLORS.white,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.accent,
    ...SHADOWS.sm,
  },
  resultsHeaderIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.accent + '12',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultsTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.text,
  },
  resultsSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  // Chart Cards
  chartCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  chartCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  chartCardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  chartMetricDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  chartCardTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: COLORS.text,
  },
  chartCardSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  chartChangeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
  },
  chartChangeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
  },
  // Section
  section: {
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  entryCountBadge: {
    backgroundColor: COLORS.accent + '15',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },
  entryCountText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.accent,
  },
  // Add Measurement Button
  addMeasurementBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.md,
    borderWidth: 2,
    borderColor: '#9b59b630',
    borderStyle: 'dashed',
    ...SHADOWS.sm,
  },
  addMeasurementIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#9b59b6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addMeasurementTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.primary,
  },
  addMeasurementSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  addBtnLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#9b59b6',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.sm,
    marginTop: SPACING.lg,
    ...SHADOWS.md,
  },
  addBtnLargeText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: '#fff',
  },
  // Data Badge
  dataBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    paddingVertical: 6,
    backgroundColor: '#2ecc7108',
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderColor: '#2ecc7120',
  },
  dataBadgeText: {
    fontSize: FONT_SIZES.xs,
    color: '#2ecc71',
    fontWeight: '600',
  },
  // Summary
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    gap: SPACING.sm,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    borderLeftWidth: 3,
    ...SHADOWS.sm,
  },
  summaryValue: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: 4,
  },
  summaryLabel: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
  },
  // Categories
  categoryScroll: {
    marginBottom: SPACING.md,
  },
  categoryContent: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
  },
  categoryTab: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  categoryTabActive: {
    backgroundColor: '#9b59b6',
    borderColor: '#9b59b6',
  },
  categoryText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  categoryTextActive: {
    color: COLORS.white,
  },
  // Metric Grid
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  metricCard: {
    width: '47%',
    flexGrow: 1,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    ...SHADOWS.sm,
  },
  metricIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  metricLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
    marginBottom: 2,
  },
  metricValue: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
  },
  // Chart
  chartSection: {
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.lg,
  },
  chartTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.text,
  },
  chartSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  changeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
  },
  changeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
  },
  // History Table
  historyTable: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.primary,
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
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  tableRowAlt: {
    backgroundColor: COLORS.background,
  },
  tableCell: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
  },
  // Insights
  insightCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    gap: SPACING.md,
    ...SHADOWS.sm,
  },
  insightIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  insightTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  insightText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  // View Photos CTA
  viewPhotosCta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.lg,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.md,
    borderWidth: 1,
    borderColor: '#9b59b620',
    ...SHADOWS.sm,
  },
  viewPhotosIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#9b59b610',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewPhotosTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.primary,
  },
  viewPhotosSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
});
