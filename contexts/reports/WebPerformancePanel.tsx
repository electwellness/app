import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import SectionHeader from '../SectionHeader';
import WebPerformanceEntryModal from './WebPerformanceEntryModal';
import {
  WebPerformanceEntry,
  getCurrentMonth, getMonthLabel, getMonthsForYear, getAvailableYears,
  getMonthlyData, getTrendData,
  getCWVRating, getCWVColor, CWVRating,
  formatDuration, formatNumber,
} from '../../lib/webPerformanceService';

// ── Inline Trend Chart ──
function TrendMiniChart({ data, height = 120, color = COLORS.accent, label = '' }: {
  data: { month: string; value: number }[];
  height?: number;
  color?: string;
  label?: string;
}) {
  const [chartWidth, setChartWidth] = useState(0);
  const handleLayout = (e: LayoutChangeEvent) => setChartWidth(e.nativeEvent.layout.width);

  const maxVal = Math.max(...data.map(d => d.value), 1);
  const leftPad = 8;
  const rightPad = 8;
  const topPad = 8;
  const bottomPad = 24;
  const plotW = Math.max(chartWidth - leftPad - rightPad, 1);
  const plotH = Math.max(height - topPad - bottomPad, 1);

  const getX = (i: number) => leftPad + (data.length <= 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const getY = (v: number) => topPad + plotH - (v / maxVal) * plotH;

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const getShortMonth = (m: string) => {
    const [, mn] = m.split('-');
    return monthNames[parseInt(mn) - 1] || mn;
  };

  if (data.length === 0) return (
    <View style={{ height, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted }}>No data</Text>
    </View>
  );

  return (
    <View onLayout={handleLayout} style={{ width: '100%', height }}>
      {chartWidth > 0 && (
        <View style={{ width: chartWidth, height }}>
          {/* Area fill */}
          {data.length > 1 && data.map((d, i) => {
            if (i === data.length - 1) return null;
            const x1 = getX(i);
            const x2 = getX(i + 1);
            const y1 = getY(d.value);
            const y2 = getY(data[i + 1].value);
            const barW = x2 - x1;
            return (
              <View key={`fill-${i}`} style={{
                position: 'absolute', left: x1, top: Math.min(y1, y2),
                width: barW, height: plotH - Math.min(y1, y2) + topPad,
                backgroundColor: color + '10',
              }} />
            );
          })}

          {/* Lines */}
          {data.map((d, i) => {
            if (i === data.length - 1) return null;
            const next = data[i + 1];
            const x1 = getX(i), y1 = getY(d.value);
            const x2 = getX(i + 1), y2 = getY(next.value);
            const dx = x2 - x1, dy = y2 - y1;
            const len = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            return (
              <View key={`line-${i}`} style={{
                position: 'absolute', left: x1, top: y1,
                width: len, height: 2.5, backgroundColor: color,
                borderRadius: 1.25, transform: [{ rotate: `${angle}deg` }],
                transformOrigin: '0 0', zIndex: 10,
              }} />
            );
          })}

          {/* Dots */}
          {data.map((d, i) => (
            <View key={`dot-${i}`} style={{
              position: 'absolute', left: getX(i) - 4, top: getY(d.value) - 4,
              width: 8, height: 8, borderRadius: 4,
              backgroundColor: color, borderWidth: 2, borderColor: COLORS.white, zIndex: 11,
            }} />
          ))}

          {/* Value labels on dots */}
          {data.map((d, i) => (
            <Text key={`val-${i}`} style={{
              position: 'absolute', left: getX(i) - 20, top: getY(d.value) - 18,
              width: 40, textAlign: 'center', fontSize: 8, fontWeight: '700', color,
            }}>
              {d.value % 1 === 0 ? d.value.toLocaleString() : d.value.toFixed(2)}
            </Text>
          ))}

          {/* X labels */}
          {data.map((d, i) => {
            const show = data.length <= 12 || i % 2 === 0 || i === data.length - 1;
            if (!show) return null;
            return (
              <Text key={`x-${i}`} style={{
                position: 'absolute', left: getX(i) - 16, top: height - bottomPad + 6,
                width: 32, textAlign: 'center', fontSize: 8, color: COLORS.textMuted, fontWeight: '500',
              }}>
                {getShortMonth(d.month)}
              </Text>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ── CWV Gauge Component ──
function CWVGauge({ label, value, unit, rating, thresholdGood, thresholdNI }: {
  label: string; value: number; unit: string; rating: CWVRating;
  thresholdGood: number; thresholdNI: number;
}) {
  const color = getCWVColor(rating);
  const ratingLabel = rating === 'good' ? 'Good' : rating === 'needs-improvement' ? 'Needs Work' : 'Poor';

  return (
    <View style={styles.cwvGauge}>
      <View style={[styles.cwvGaugeRing, { borderColor: color }]}>
        <Text style={[styles.cwvGaugeValue, { color }]}>
          {value > 0 ? (value % 1 === 0 ? value.toString() : value.toFixed(value < 1 ? 3 : 1)) : '--'}
        </Text>
        <Text style={styles.cwvGaugeUnit}>{unit}</Text>
      </View>
      <Text style={styles.cwvGaugeLabel}>{label}</Text>
      <View style={[styles.cwvRatingBadge, { backgroundColor: color + '18' }]}>
        <View style={[styles.cwvRatingDot, { backgroundColor: color }]} />
        <Text style={[styles.cwvRatingText, { color }]}>{ratingLabel}</Text>
      </View>
      <Text style={styles.cwvThresholdText}>
        Good: {'<'}{thresholdGood}{unit} | Poor: {'>'}{thresholdNI}{unit}
      </Text>
    </View>
  );
}

// ── Device Split Bar ──
function DeviceSplitBar({ mobile, desktop, tablet }: { mobile: number; desktop: number; tablet: number }) {
  const total = mobile + desktop + tablet || 1;
  const mPct = (mobile / total) * 100;
  const dPct = (desktop / total) * 100;
  const tPct = (tablet / total) * 100;

  return (
    <View style={styles.deviceSplitContainer}>
      <View style={styles.deviceSplitBar}>
        {mPct > 0 && <View style={[styles.deviceSplitSegment, { flex: mPct, backgroundColor: COLORS.accent }]} />}
        {dPct > 0 && <View style={[styles.deviceSplitSegment, { flex: dPct, backgroundColor: COLORS.info }]} />}
        {tPct > 0 && <View style={[styles.deviceSplitSegment, { flex: tPct, backgroundColor: '#9b59b6' }]} />}
      </View>
      <View style={styles.deviceSplitLegend}>
        <View style={styles.deviceSplitLegendItem}>
          <View style={[styles.deviceSplitDot, { backgroundColor: COLORS.accent }]} />
          <Ionicons name="phone-portrait-outline" size={12} color={COLORS.textSecondary} />
          <Text style={styles.deviceSplitLegendText}>Mobile {mobile.toFixed(1)}%</Text>
        </View>
        <View style={styles.deviceSplitLegendItem}>
          <View style={[styles.deviceSplitDot, { backgroundColor: COLORS.info }]} />
          <Ionicons name="desktop-outline" size={12} color={COLORS.textSecondary} />
          <Text style={styles.deviceSplitLegendText}>Desktop {desktop.toFixed(1)}%</Text>
        </View>
        <View style={styles.deviceSplitLegendItem}>
          <View style={[styles.deviceSplitDot, { backgroundColor: '#9b59b6' }]} />
          <Ionicons name="tablet-portrait-outline" size={12} color={COLORS.textSecondary} />
          <Text style={styles.deviceSplitLegendText}>Tablet {tablet.toFixed(1)}%</Text>
        </View>
      </View>
    </View>
  );
}


// ══════════════════════════════════════════════════════════════
// MAIN PANEL
// ══════════════════════════════════════════════════════════════

export default function WebPerformancePanel() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'master_admin';

  const [entries, setEntries] = useState<WebPerformanceEntry[]>([]);
  const [trendEntries, setTrendEntries] = useState<WebPerformanceEntry[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showEntryModal, setShowEntryModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<WebPerformanceEntry | null>(null);

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const availableYears = useMemo(() => getAvailableYears(), []);
  const monthOptions = useMemo(() => getMonthsForYear(selectedYear), [selectedYear]);

  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [activeTrendMetric, setActiveTrendMetric] = useState<'lcp' | 'fcp' | 'cls' | 'bounce_rate' | 'page_views'>('lcp');

  // Sync year
  useEffect(() => {
    const yearFromMonth = parseInt(selectedMonth.split('-')[0]);
    if (yearFromMonth !== selectedYear) setSelectedYear(yearFromMonth);
  }, [selectedMonth]);

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
    try {
      const endMonth = selectedYear === currentYear ? getCurrentMonth() : `${selectedYear}-12`;
      const [monthlyData, trends] = await Promise.all([
        getMonthlyData(selectedMonth),
        getTrendData(`${selectedYear}-01`, endMonth),
      ]);
      setEntries(monthlyData);
      setTrendEntries(trends);
    } catch (err: any) {
      console.log('Web performance fetch error:', err);
      setError(err.message || 'Failed to load performance data');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedYear, currentYear]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAddEntry = useCallback(() => {
    setEditingEntry(null);
    setShowEntryModal(true);
  }, []);

  const handleEditEntry = useCallback((entry: WebPerformanceEntry) => {
    setEditingEntry(entry);
    setShowEntryModal(true);
  }, []);

  const handleEntrySaved = useCallback(() => { fetchData(); }, [fetchData]);

  // Primary entry (Site-Wide or first entry)
  const primaryEntry = useMemo(() => {
    const siteWide = entries.find(e => e.page_url === 'Site-Wide');
    return siteWide || entries[0] || null;
  }, [entries]);

  // Trend data for charts
  const trendChartData = useMemo(() => {
    // Group by month, use Site-Wide or first entry per month
    const byMonth: Record<string, WebPerformanceEntry> = {};
    for (const e of trendEntries) {
      if (!byMonth[e.month] || e.page_url === 'Site-Wide') {
        byMonth[e.month] = e;
      }
    }
    const sorted = Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));

    const metricMap: Record<string, (e: WebPerformanceEntry) => number> = {
      lcp: e => e.lcp,
      fcp: e => e.fcp,
      cls: e => e.cls,
      bounce_rate: e => e.bounce_rate,
      page_views: e => e.total_page_views,
    };

    const getter = metricMap[activeTrendMetric] || metricMap.lcp;
    return sorted.map(e => ({ month: e.month, value: getter(e) })).filter(d => d.value > 0);
  }, [trendEntries, activeTrendMetric]);

  const trendMetricOptions = [
    { key: 'lcp' as const, label: 'LCP', color: COLORS.success },
    { key: 'fcp' as const, label: 'FCP', color: COLORS.info },
    { key: 'cls' as const, label: 'CLS', color: '#9b59b6' },
    { key: 'bounce_rate' as const, label: 'Bounce Rate', color: COLORS.danger },
    { key: 'page_views' as const, label: 'Page Views', color: COLORS.accent },
  ];

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
        <Text style={styles.loadingText}>Loading performance data...</Text>
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

      {/* ── Header ── */}
      <View style={styles.headerRow}>
        <View style={styles.headerInfo}>
          <View style={styles.headerIconContainer}>
            <Ionicons name="speedometer" size={22} color={COLORS.white} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Website Performance</Text>
            <Text style={styles.headerSubtitle}>Speed, Vitals & Traffic</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.refreshBtn} onPress={fetchData} activeOpacity={0.7}>
            <Ionicons name="refresh" size={18} color={COLORS.textSecondary} />
          </TouchableOpacity>
          {isAdmin && (
            <TouchableOpacity style={styles.addEntryBtn} onPress={handleAddEntry} activeOpacity={0.7}>
              <Ionicons name="add" size={18} color={COLORS.white} />
              <Text style={styles.addEntryBtnText}>Add Entry</Text>
            </TouchableOpacity>
          )}
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

      {/* ══════════════════════════════════════════ */}
      {/* DATA PRESENT */}
      {/* ══════════════════════════════════════════ */}
      {primaryEntry ? (
        <>
          {/* ── KPI Summary Cards ── */}

          <View style={styles.kpiGrid}>
            <View style={styles.kpiCard}>
              <View style={[styles.kpiIconBg, { backgroundColor: COLORS.accent + '20' }]}>
                <Ionicons name="time-outline" size={20} color={COLORS.accent} />
              </View>
              <Text style={styles.kpiValue}>
                {primaryEntry.page_load_time > 0 ? `${primaryEntry.page_load_time.toFixed(2)}s` : '--'}
              </Text>
              <Text style={styles.kpiLabel}>Load Time</Text>
            </View>
            <View style={styles.kpiCard}>
              <View style={[styles.kpiIconBg, { backgroundColor: COLORS.info + '20' }]}>
                <Ionicons name="eye-outline" size={20} color={COLORS.info} />
              </View>
              <Text style={styles.kpiValue}>
                {primaryEntry.total_page_views > 0 ? formatNumber(primaryEntry.total_page_views) : '--'}
              </Text>
              <Text style={styles.kpiLabel}>Page Views</Text>
            </View>
            <View style={styles.kpiCard}>
              <View style={[styles.kpiIconBg, { backgroundColor: '#1abc9c' + '20' }]}>
                <Ionicons name="person-add-outline" size={20} color="#1abc9c" />
              </View>
              <Text style={styles.kpiValue}>
                {primaryEntry.new_users > 0 ? formatNumber(primaryEntry.new_users) : '--'}
              </Text>
              <Text style={styles.kpiLabel}>New Users</Text>
            </View>

            <View style={styles.kpiCard}>
              <View style={[styles.kpiIconBg, { backgroundColor: '#3498db' + '20' }]}>
                <Ionicons name="people-circle-outline" size={20} color="#3498db" />
              </View>
              <Text style={styles.kpiValue}>
                {primaryEntry.all_users > 0 ? formatNumber(primaryEntry.all_users) : '--'}
              </Text>
              <Text style={styles.kpiLabel}>All Users</Text>
            </View>
            <View style={styles.kpiCard}>
              <View style={[styles.kpiIconBg, { backgroundColor: COLORS.danger + '20' }]}>
                <Ionicons name="exit-outline" size={20} color={COLORS.danger} />
              </View>
              <Text style={styles.kpiValue}>
                {primaryEntry.bounce_rate > 0 ? `${primaryEntry.bounce_rate.toFixed(1)}%` : '--'}
              </Text>
              <Text style={styles.kpiLabel}>Bounce Rate</Text>
            </View>
            <View style={styles.kpiCard}>
              <View style={[styles.kpiIconBg, { backgroundColor: COLORS.warning + '20' }]}>
                <Ionicons name="timer-outline" size={20} color={COLORS.warning} />
              </View>
              <Text style={styles.kpiValue}>
                {primaryEntry.avg_session_duration > 0 ? formatDuration(primaryEntry.avg_session_duration) : '--'}
              </Text>
              <Text style={styles.kpiLabel}>Avg Session</Text>
            </View>
            <View style={styles.kpiCard}>
              <View style={[styles.kpiIconBg, { backgroundColor: '#9b59b6' + '20' }]}>
                <Ionicons name="documents-outline" size={20} color="#9b59b6" />
              </View>
              <Text style={styles.kpiValue}>
                {primaryEntry.pages_per_session > 0 ? primaryEntry.pages_per_session.toFixed(1) : '--'}
              </Text>
              <Text style={styles.kpiLabel}>Pages/Session</Text>
            </View>
          </View>


          {/* ── Core Web Vitals ── */}
          <SectionHeader title="Core Web Vitals" subtitle={getMonthLabel(selectedMonth)} icon="speedometer-outline" />
          <View style={styles.cwvGrid}>
            <CWVGauge
              label="LCP" value={primaryEntry.lcp} unit="s"
              rating={getCWVRating('lcp', primaryEntry.lcp)}
              thresholdGood={2.5} thresholdNI={4.0}
            />
            <CWVGauge
              label="FID" value={primaryEntry.fid} unit="ms"
              rating={getCWVRating('fid', primaryEntry.fid)}
              thresholdGood={100} thresholdNI={300}
            />
            <CWVGauge
              label="CLS" value={primaryEntry.cls} unit=""
              rating={getCWVRating('cls', primaryEntry.cls)}
              thresholdGood={0.1} thresholdNI={0.25}
            />
            <CWVGauge
              label="FCP" value={primaryEntry.fcp} unit="s"
              rating={getCWVRating('fcp', primaryEntry.fcp)}
              thresholdGood={1.8} thresholdNI={3.0}
            />
            <CWVGauge
              label="TTFB" value={primaryEntry.ttfb} unit="ms"
              rating={getCWVRating('ttfb', primaryEntry.ttfb)}
              thresholdGood={800} thresholdNI={1800}
            />
            <CWVGauge
              label="INP" value={primaryEntry.inp} unit="ms"
              rating={getCWVRating('inp', primaryEntry.inp)}
              thresholdGood={200} thresholdNI={500}
            />
          </View>

          {/* ── Device Split ── */}
          {(primaryEntry.mobile_traffic_pct > 0 || primaryEntry.desktop_traffic_pct > 0) && (
            <>
              <SectionHeader title="Device Split" icon="phone-portrait-outline" />
              <View style={styles.chartCard}>
                <DeviceSplitBar
                  mobile={primaryEntry.mobile_traffic_pct}
                  desktop={primaryEntry.desktop_traffic_pct}
                  tablet={primaryEntry.tablet_traffic_pct}
                />
              </View>
            </>
          )}

          {/* ── Uptime ── */}
          {primaryEntry.uptime_pct > 0 && (
            <View style={styles.uptimeCard}>
              <View style={styles.uptimeLeft}>
                <Ionicons name="shield-checkmark" size={24} color={primaryEntry.uptime_pct >= 99.9 ? COLORS.success : primaryEntry.uptime_pct >= 99 ? COLORS.warning : COLORS.danger} />
                <View>
                  <Text style={styles.uptimeLabel}>Uptime</Text>
                  <Text style={styles.uptimeSubtext}>{getMonthLabel(selectedMonth)}</Text>
                </View>
              </View>
              <Text style={[styles.uptimeValue, {
                color: primaryEntry.uptime_pct >= 99.9 ? COLORS.success : primaryEntry.uptime_pct >= 99 ? COLORS.warning : COLORS.danger
              }]}>
                {primaryEntry.uptime_pct.toFixed(3)}%
              </Text>
            </View>
          )}

          {/* ── Trend Chart ── */}
          {trendChartData.length > 1 && (
            <>
              <SectionHeader title="Performance Trends" subtitle={trendSubtitle} icon="trending-up" />
              <View style={styles.chartCard}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.trendMetricTabs} contentContainerStyle={styles.trendMetricTabsContent}>
                  {trendMetricOptions.map(opt => (
                    <TouchableOpacity
                      key={opt.key}
                      style={[styles.trendMetricTab, activeTrendMetric === opt.key && { backgroundColor: opt.color, borderColor: opt.color }]}
                      onPress={() => setActiveTrendMetric(opt.key)}
                    >
                      <Text style={[styles.trendMetricTabText, activeTrendMetric === opt.key && { color: COLORS.white }]}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TrendMiniChart
                  data={trendChartData}
                  height={140}
                  color={trendMetricOptions.find(o => o.key === activeTrendMetric)?.color || COLORS.accent}
                />
              </View>
            </>
          )}

          {/* ── All Entries for Month ── */}
          {entries.length > 0 && (
            <>
              <SectionHeader title="Page Entries" subtitle={`${entries.length} entries for ${getMonthLabel(selectedMonth)}`} icon="list-outline" />
              <View style={styles.entriesGrid}>
                {entries.map(entry => {
                  const isExpanded = expandedEntry === entry.id;
                  const lcpRating = getCWVRating('lcp', entry.lcp);
                  const lcpColor = getCWVColor(lcpRating);
                  return (
                    <TouchableOpacity
                      key={entry.id}
                      style={[styles.entryCard, isExpanded && styles.entryCardExpanded]}
                      onPress={() => setExpandedEntry(isExpanded ? null : entry.id)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.entryCardMain}>
                        <View style={styles.entryCardIcon}>
                          <Ionicons name="globe-outline" size={18} color={COLORS.accent} />
                        </View>
                        <View style={styles.entryCardInfo}>
                          <Text style={styles.entryCardTitle} numberOfLines={1}>{entry.page_url}</Text>
                          <Text style={styles.entryCardDetail}>
                            {entry.total_page_views > 0 ? `${formatNumber(entry.total_page_views)} views` : 'No view data'}
                            {entry.lcp > 0 ? ` | LCP ${entry.lcp.toFixed(1)}s` : ''}
                          </Text>
                        </View>
                        {entry.lcp > 0 && (
                          <View style={[styles.entryRatingDot, { backgroundColor: lcpColor }]} />
                        )}
                        <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.textMuted} />
                      </View>

                      {isExpanded && (
                        <View style={styles.entryExpandedDetail}>
                          <View style={styles.entryDetailGrid}>
                            {entry.page_load_time > 0 && (
                              <View style={styles.entryDetailItem}>
                                <Text style={styles.entryDetailLabel}>Load Time</Text>
                                <Text style={styles.entryDetailValue}>{entry.page_load_time.toFixed(2)}s</Text>
                              </View>
                            )}
                            {entry.lcp > 0 && (
                              <View style={styles.entryDetailItem}>
                                <Text style={styles.entryDetailLabel}>LCP</Text>
                                <Text style={[styles.entryDetailValue, { color: lcpColor }]}>{entry.lcp.toFixed(2)}s</Text>
                              </View>
                            )}
                            {entry.fcp > 0 && (
                              <View style={styles.entryDetailItem}>
                                <Text style={styles.entryDetailLabel}>FCP</Text>
                                <Text style={styles.entryDetailValue}>{entry.fcp.toFixed(2)}s</Text>
                              </View>
                            )}
                            {entry.cls > 0 && (
                              <View style={styles.entryDetailItem}>
                                <Text style={styles.entryDetailLabel}>CLS</Text>
                                <Text style={styles.entryDetailValue}>{entry.cls.toFixed(3)}</Text>
                              </View>
                            )}
                            {entry.ttfb > 0 && (
                              <View style={styles.entryDetailItem}>
                                <Text style={styles.entryDetailLabel}>TTFB</Text>
                                <Text style={styles.entryDetailValue}>{entry.ttfb.toFixed(0)}ms</Text>
                              </View>
                            )}
                            {entry.fid > 0 && (
                              <View style={styles.entryDetailItem}>
                                <Text style={styles.entryDetailLabel}>FID</Text>
                                <Text style={styles.entryDetailValue}>{entry.fid.toFixed(0)}ms</Text>
                              </View>
                            )}
                            {entry.bounce_rate > 0 && (
                              <View style={styles.entryDetailItem}>
                                <Text style={styles.entryDetailLabel}>Bounce Rate</Text>
                                <Text style={styles.entryDetailValue}>{entry.bounce_rate.toFixed(1)}%</Text>
                              </View>
                            )}

                            {entry.new_users > 0 && (
                              <View style={styles.entryDetailItem}>
                                <Text style={styles.entryDetailLabel}>New Users</Text>
                                <Text style={styles.entryDetailValue}>{formatNumber(entry.new_users)}</Text>
                              </View>
                            )}
                            {entry.all_users > 0 && (
                              <View style={styles.entryDetailItem}>
                                <Text style={styles.entryDetailLabel}>All Users</Text>
                                <Text style={styles.entryDetailValue}>{formatNumber(entry.all_users)}</Text>
                              </View>
                            )}

                          </View>
                          {entry.notes ? (
                            <View style={styles.entryNotesRow}>
                              <Ionicons name="document-text-outline" size={12} color={COLORS.textMuted} />
                              <Text style={styles.entryNotesText}>{entry.notes}</Text>
                            </View>
                          ) : null}
                          {isAdmin && (
                            <TouchableOpacity style={styles.editEntryBtn} onPress={() => handleEditEntry(entry)} activeOpacity={0.7}>
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
        </>
      ) : (
        /* ── Empty State ── */
        <View style={styles.emptyPrompt}>
          <View style={styles.emptyPromptIcon}>
            <Ionicons name="speedometer-outline" size={40} color={COLORS.accent} />
          </View>
          <Text style={styles.emptyPromptTitle}>No Performance Data for {getMonthLabel(selectedMonth)}</Text>
          <Text style={styles.emptyPromptText}>
            Add website performance data manually to track page speed, Core Web Vitals, traffic, and engagement metrics.
          </Text>
          {isAdmin && (
            <TouchableOpacity style={styles.emptyPromptAddBtn} onPress={handleAddEntry}>
              <Ionicons name="add-circle" size={18} color={COLORS.white} />
              <Text style={styles.emptyPromptAddBtnText}>Add First Entry</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={{ height: 20 }} />

      {/* ── Entry Modal ── */}
      <WebPerformanceEntryModal
        visible={showEntryModal}
        onClose={() => { setShowEntryModal(false); setEditingEntry(null); }}
        onSaved={handleEntrySaved}
        month={selectedMonth}
        existingEntry={editingEntry}
      />
    </View>
  );
}

// ══════════════════════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  loadingContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.xxxl, gap: SPACING.md },
  loadingText: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.dangerLight, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, marginBottom: SPACING.md,
  },
  errorText: { flex: 1, fontSize: FONT_SIZES.sm, color: COLORS.danger, fontWeight: '600' },
  retryText: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.accent },

  // Header
  headerRow: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, marginBottom: SPACING.sm, gap: SPACING.sm, ...SHADOWS.md,
  },
  headerInfo: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, flex: 1, minWidth: 200 },
  headerIconContainer: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center', ...SHADOWS.sm,
  },
  headerTitle: { fontSize: FONT_SIZES.lg, fontWeight: '800', color: COLORS.primary },
  headerSubtitle: {
    fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '600',
    marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flexWrap: 'wrap' },

  refreshBtn: {
    width: 36, height: 36, borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.background,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border,
  },
  addEntryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.md, ...SHADOWS.sm,
  },
  addEntryBtnText: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.white },

  // Year Nav
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

  // Month Selector
  monthScroll: { marginBottom: SPACING.md, flexGrow: 0 },
  monthScrollContent: { gap: SPACING.sm, paddingRight: SPACING.md },
  monthChip: {
    paddingHorizontal: SPACING.md, paddingVertical: 6, borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border,
  },
  monthChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  monthChipText: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: COLORS.textSecondary },
  monthChipTextActive: { color: COLORS.white },

  // KPI Cards
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.md },
  kpiCard: {
    flex: 1, minWidth: '30%', backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, alignItems: 'center', gap: 4, ...SHADOWS.sm,
  },
  kpiIconBg: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  kpiValue: { fontSize: FONT_SIZES.xl, fontWeight: '800', color: COLORS.primary },
  kpiLabel: { fontSize: 9, color: COLORS.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },

  // CWV Grid
  cwvGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.md },
  cwvGauge: {
    flex: 1, minWidth: '30%', backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, alignItems: 'center', gap: 4, ...SHADOWS.sm,
  },
  cwvGaugeRing: {
    width: 56, height: 56, borderRadius: 28, borderWidth: 3,
    alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white,
  },
  cwvGaugeValue: { fontSize: FONT_SIZES.md, fontWeight: '800' },
  cwvGaugeUnit: { fontSize: 8, color: COLORS.textMuted, fontWeight: '600', marginTop: -2 },
  cwvGaugeLabel: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.primary, marginTop: 2 },
  cwvRatingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: BORDER_RADIUS.full,
  },
  cwvRatingDot: { width: 6, height: 6, borderRadius: 3 },
  cwvRatingText: { fontSize: 9, fontWeight: '700' },
  cwvThresholdText: { fontSize: 7, color: COLORS.textMuted, textAlign: 'center', marginTop: 2 },

  // Device Split
  deviceSplitContainer: { gap: SPACING.md },
  deviceSplitBar: {
    flexDirection: 'row', height: 24, borderRadius: 12, overflow: 'hidden',
    backgroundColor: COLORS.background,
  },
  deviceSplitSegment: { height: '100%' },
  deviceSplitLegend: { flexDirection: 'row', justifyContent: 'space-around' },
  deviceSplitLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  deviceSplitDot: { width: 8, height: 8, borderRadius: 4 },
  deviceSplitLegendText: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: COLORS.textSecondary },

  // Uptime
  uptimeCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, marginBottom: SPACING.md, ...SHADOWS.sm,
  },
  uptimeLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  uptimeLabel: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.primary },
  uptimeSubtext: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted },
  uptimeValue: { fontSize: FONT_SIZES.xxl, fontWeight: '800' },

  // Chart Card
  chartCard: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.md, ...SHADOWS.md },

  // Trend Metric Tabs
  trendMetricTabs: { marginBottom: SPACING.md, flexGrow: 0 },
  trendMetricTabsContent: { gap: SPACING.sm },
  trendMetricTab: {
    paddingHorizontal: SPACING.md, paddingVertical: 5, borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border,
  },
  trendMetricTabText: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: COLORS.textMuted },

  // Entries Grid
  entriesGrid: { gap: SPACING.sm },
  entryCard: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, ...SHADOWS.sm },
  entryCardExpanded: { borderWidth: 1, borderColor: COLORS.accent + '30' },
  entryCardMain: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  entryCardIcon: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.accent + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  entryCardInfo: { flex: 1 },
  entryCardTitle: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.text },
  entryCardDetail: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 2 },
  entryRatingDot: { width: 10, height: 10, borderRadius: 5 },
  entryExpandedDetail: { marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  entryDetailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  entryDetailItem: {
    flex: 1, minWidth: '22%', backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.sm, padding: SPACING.sm, alignItems: 'center',
  },
  entryDetailLabel: { fontSize: 9, color: COLORS.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 2 },
  entryDetailValue: { fontSize: FONT_SIZES.md, fontWeight: '800', color: COLORS.primary },
  entryNotesRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm,
    marginTop: SPACING.md, backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.sm, padding: SPACING.md,
  },
  entryNotesText: { flex: 1, fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, lineHeight: 16 },
  editEntryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs,
    marginTop: SPACING.md, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.accent + '10', borderWidth: 1, borderColor: COLORS.accent + '20',
  },
  editEntryBtnText: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.accent },

  // Empty State
  emptyPrompt: {
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl, alignItems: 'center', marginTop: SPACING.md,
    borderWidth: 1, borderColor: COLORS.accent + '20', borderStyle: 'dashed' as any,
  },
  emptyPromptIcon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.accent + '12',
    alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md,
  },
  emptyPromptTitle: {
    fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.primary,
    marginBottom: SPACING.sm, textAlign: 'center',
  },
  emptyPromptText: {
    fontSize: FONT_SIZES.sm, color: COLORS.textMuted, textAlign: 'center',
    lineHeight: 20, marginBottom: SPACING.lg,
  },
  emptyPromptAddBtn: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.accent, paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.md, ...SHADOWS.sm,
  },
  emptyPromptAddBtnText: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.white },
});
