import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, Platform, Share, Animated, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import SectionHeader from '../SectionHeader';
import { BarChart } from '../MiniChart';
import MarketingEntryModal from './MarketingEntryModal';
import MarketingChannelManager from './MarketingChannelManager';
import MarketingDataTable from './MarketingDataTable';
import MarketingMassImportModal from './MarketingMassImportModal';

import {
  MarketingChannel, MarketingEntry, MonthlyTotals, TrendDataPoint,
  MarketingServiceError,
  getChannels, addChannel, updateChannel, deleteChannel,
  addChannelAlias, deleteChannelAlias,
  getMonthlySummary, getTrendData, upsertEntry, deleteEntry,
  formatCurrency, formatPercent, getCurrentMonth, getMonthLabel,
  getMonthsForYear, getAvailableYears, generateCSV,

} from '../../lib/marketingService';



type ChartView = 'leads' | 'clients' | 'revenue' | 'roi';
type TrendView = 'spend' | 'revenue' | 'cost_per_client' | 'roi';

interface ErrorInfo {
  userMessage: string;
  technicalMessage: string;
  status: number;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

// Retry configuration constants
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1000; // 1s, 2s, 4s with exponential backoff

interface RetryState {
  /** Current retry attempt (1-based), 0 means not retrying */
  attempt: number;
  /** Countdown seconds until next retry fires */
  countdownSec: number;
  /** Whether we are currently in an auto-retry cycle */
  active: boolean;
}

/** Returns true if the error is a server-side 5xx that warrants automatic retry */
function isRetryableError(err: any): boolean {
  if (err instanceof MarketingServiceError) {
    return err.status >= 500 && err.status < 600;
  }
  return false;
}

/** Compute delay in ms for a given attempt (0-based): 1000, 2000, 4000 */
function getRetryDelay(attempt: number): number {
  return RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
}


// ============ SKELETON COMPONENTS ============

function SkeletonPulse({ children }: { children: React.ReactNode }) {
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);

  return (
    <Animated.View style={{ opacity: pulseAnim }}>
      {children}
    </Animated.View>
  );
}

function SkeletonBlock({ width, height, borderRadius, style }: {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: any;
}) {
  return (
    <View
      style={[
        {
          width: width as any,
          height,
          borderRadius: borderRadius ?? BORDER_RADIUS.md,
          backgroundColor: COLORS.border,
        },
        style,
      ]}
    />
  );
}

function LoadingSkeleton() {
  return (
    <SkeletonPulse>
      <View style={{ gap: SPACING.md }}>
        {/* Action bar skeleton */}
        <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
          <SkeletonBlock width={110} height={36} borderRadius={BORDER_RADIUS.md} />
          <SkeletonBlock width={90} height={36} borderRadius={BORDER_RADIUS.md} />
          <View style={{ flex: 1 }} />
          <SkeletonBlock width={60} height={36} borderRadius={BORDER_RADIUS.md} />
          <SkeletonBlock width={60} height={36} borderRadius={BORDER_RADIUS.md} />
        </View>

        {/* Month selector skeleton */}
        <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <SkeletonBlock key={i} width={72} height={30} borderRadius={BORDER_RADIUS.full} />
          ))}
        </View>

        {/* KPI cards skeleton */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm }}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <View
              key={i}
              style={[skeletonStyles.kpiCard]}
            >
              <SkeletonBlock width={36} height={36} borderRadius={18} />
              <SkeletonBlock width={60} height={20} />
              <SkeletonBlock width={80} height={10} />
            </View>
          ))}
        </View>

        {/* Secondary KPI row skeleton */}
        <View style={skeletonStyles.secondaryRow}>
          {[1, 2, 3, 4].map(i => (
            <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
              <SkeletonBlock width={50} height={10} />
              <SkeletonBlock width={60} height={16} />
            </View>
          ))}
        </View>

        {/* Chart section skeleton */}
        <View style={{ gap: SPACING.sm }}>
          <View style={{ flexDirection: 'row', gap: SPACING.sm, alignItems: 'center' }}>
            <SkeletonBlock width={20} height={20} borderRadius={4} />
            <SkeletonBlock width={160} height={16} />
          </View>
          <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
            {[1, 2, 3, 4].map(i => (
              <SkeletonBlock key={i} width={70} height={28} borderRadius={BORDER_RADIUS.full} />
            ))}
          </View>
          <View style={skeletonStyles.chartCard}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 120 }}>
              {[60, 90, 45, 110, 75, 55, 95, 40].map((h, i) => (
                <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                  <SkeletonBlock width={'80%' as any} height={h} borderRadius={4} />
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACING.sm }}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                <SkeletonBlock key={i} width={24} height={8} borderRadius={2} />
              ))}
            </View>
          </View>
        </View>

        {/* Table section skeleton */}
        <View style={{ gap: SPACING.sm }}>
          <View style={{ flexDirection: 'row', gap: SPACING.sm, alignItems: 'center' }}>
            <SkeletonBlock width={20} height={20} borderRadius={4} />
            <SkeletonBlock width={140} height={16} />
          </View>
          {[1, 2, 3, 4, 5].map(i => (
            <View key={i} style={skeletonStyles.tableRow}>
              <SkeletonBlock width={100} height={12} />
              <View style={{ flex: 1 }} />
              <SkeletonBlock width={50} height={12} />
              <SkeletonBlock width={40} height={12} />
              <SkeletonBlock width={60} height={12} />
            </View>
          ))}
        </View>
      </View>
    </SkeletonPulse>
  );
}

const skeletonStyles = StyleSheet.create({
  kpiCard: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    alignItems: 'center',
    gap: 6,
    ...SHADOWS.sm,
  },
  secondaryRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    ...SHADOWS.sm,
  },
  chartCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.md,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    ...SHADOWS.sm,
  },
});

// ============ ERROR BANNER COMPONENT ============

function ErrorBanner({ errorInfo, onRetry, onDismiss, showDetails }: {
  errorInfo: ErrorInfo;
  onRetry: () => void;
  onDismiss: () => void;
  showDetails: boolean;
}) {
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  const bgColor = errorInfo.status === 401 ? COLORS.warningLight
    : errorInfo.status === 403 ? COLORS.dangerLight
    : COLORS.dangerLight;

  const borderColor = errorInfo.status === 401 ? COLORS.warning
    : errorInfo.status === 403 ? COLORS.danger
    : COLORS.danger;

  return (
    <View style={[errorBannerStyles.container, { backgroundColor: bgColor, borderLeftColor: borderColor }]}>
      <View style={errorBannerStyles.topRow}>
        <View style={[errorBannerStyles.iconCircle, { backgroundColor: errorInfo.color + '20' }]}>
          <Ionicons name={errorInfo.icon} size={20} color={errorInfo.color} />
        </View>
        <View style={errorBannerStyles.messageContainer}>
          <Text style={[errorBannerStyles.userMessage, { color: errorInfo.color }]}>
            {errorInfo.userMessage}
          </Text>
        </View>
        <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={18} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Technical details toggle */}
      {showDetails && errorInfo.technicalMessage && errorInfo.technicalMessage !== errorInfo.userMessage && (
        <TouchableOpacity
          style={errorBannerStyles.detailsToggle}
          onPress={() => setDetailsExpanded(!detailsExpanded)}
        >
          <Ionicons
            name={detailsExpanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={COLORS.textMuted}
          />
          <Text style={errorBannerStyles.detailsToggleText}>
            {detailsExpanded ? 'Hide details' : 'Show details'}
          </Text>
        </TouchableOpacity>
      )}

      {detailsExpanded && (
        <View style={errorBannerStyles.detailsBox}>
          <Text style={errorBannerStyles.detailsText}>
            {errorInfo.status > 0 ? `Status ${errorInfo.status}: ` : ''}{errorInfo.technicalMessage}
          </Text>
        </View>
      )}

      {/* Action buttons */}
      <View style={errorBannerStyles.actionsRow}>
        <TouchableOpacity style={errorBannerStyles.retryButton} onPress={onRetry}>
          <Ionicons name="refresh" size={16} color={COLORS.white} />
          <Text style={errorBannerStyles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
        {errorInfo.status === 401 && (
          <Text style={errorBannerStyles.hintText}>
            Try signing out and back in if the problem persists.
          </Text>
        )}
      </View>
    </View>
  );
}

const errorBannerStyles = StyleSheet.create({
  container: {
    borderRadius: BORDER_RADIUS.lg,
    borderLeftWidth: 4,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageContainer: {
    flex: 1,
    paddingTop: 2,
  },
  userMessage: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    lineHeight: 20,
  },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 48,
  },
  detailsToggleText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  detailsBox: {
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    marginLeft: 48,
  },
  detailsText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingLeft: 48,
    marginTop: 2,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
  },
  retryButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.white,
  },
  hintText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    flex: 1,
  },
});

// ============ HELPER: Parse error into ErrorInfo ============

function parseError(err: any): ErrorInfo {
  if (err instanceof MarketingServiceError) {
    let icon: keyof typeof Ionicons.glyphMap = 'alert-circle';
    let color = COLORS.danger;

    switch (err.status) {
      case 401:
        icon = 'log-in-outline';
        color = COLORS.warning;
        break;
      case 403:
        icon = 'lock-closed';
        color = COLORS.danger;
        break;
      case 429:
        icon = 'time-outline';
        color = COLORS.warning;
        break;
      case 500:
      case 502:
      case 503:
        icon = 'cloud-offline-outline';
        color = COLORS.danger;
        break;
      default:
        icon = 'alert-circle';
        color = COLORS.danger;
    }

    return {
      userMessage: err.userMessage,
      technicalMessage: err.message,
      status: err.status,
      icon,
      color,
    };
  }

  // Generic error fallback
  return {
    userMessage: 'An unexpected error occurred while loading marketing data.',
    technicalMessage: err?.message || 'Unknown error',
    status: 0,
    icon: 'alert-circle',
    color: COLORS.danger,
  };
}

// ============ RETRYING BANNER COMPONENT ============

function RetryingBanner({ retryState }: { retryState: RetryState }) {
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const spin = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    spin.start();
    return () => spin.stop();
  }, [spinAnim]);

  const spinInterpolation = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={retryBannerStyles.container}>
      <Animated.View style={{ transform: [{ rotate: spinInterpolation }] }}>
        <Ionicons name="refresh" size={16} color={COLORS.accent} />
      </Animated.View>
      <View style={retryBannerStyles.textContainer}>
        <Text style={retryBannerStyles.title}>
          Retrying{retryState.countdownSec > 0 ? ` in ${retryState.countdownSec}s` : '...'}
        </Text>
        <Text style={retryBannerStyles.subtitle}>
          Attempt {retryState.attempt} of {MAX_RETRY_ATTEMPTS}
        </Text>
      </View>
      {/* Progress dots */}
      <View style={retryBannerStyles.dotsRow}>
        {Array.from({ length: MAX_RETRY_ATTEMPTS }).map((_, i) => (
          <View
            key={i}
            style={[
              retryBannerStyles.dot,
              i < retryState.attempt
                ? retryBannerStyles.dotFilled
                : retryBannerStyles.dotEmpty,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const retryBannerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.infoLight,
    borderRadius: BORDER_RADIUS.lg,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.accent,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.primary,
  },
  subtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotFilled: {
    backgroundColor: COLORS.accent,
  },
  dotEmpty: {
    backgroundColor: COLORS.border,
  },
});

// ============ MAIN COMPONENT ============


export default function MarketingReportPanel() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  // State
  const [channels, setChannels] = useState<MarketingChannel[]>([]);
  const [entries, setEntries] = useState<MarketingEntry[]>([]);
  const [totals, setTotals] = useState<MonthlyTotals>({
    investment: 0, leads: 0, clients: 0, revenue: 0,
    profit: 0, roi: 0, lead_cost: 0, conversion_rate: 0,
    cost_per_client: 0, revenue_per_client: 0,
  });
  const [trendData, setTrendData] = useState<TrendDataPoint[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [loading, setLoading] = useState(true);
  const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null);

  // Year-based navigation state
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const availableYears = useMemo(() => getAvailableYears(), []);

  // Retry state
  const [retryState, setRetryState] = useState<RetryState>({
    attempt: 0,
    countdownSec: 0,
    active: false,
  });

  // Refs for managing retry timers and component lifecycle
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  // Track retry attempt in a ref so closures always see the latest value
  const retryAttemptRef = useRef(0);

  // Modal states
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [showChannelManager, setShowChannelManager] = useState(false);
  const [showMassImport, setShowMassImport] = useState(false);
  const [editEntry, setEditEntry] = useState<MarketingEntry | null>(null);


  // Chart view states
  const [chartView, setChartView] = useState<ChartView>('revenue');
  const [trendView, setTrendView] = useState<TrendView>('revenue');

  // Month navigation — shows all months for the selected year
  const monthOptions = useMemo(() => getMonthsForYear(selectedYear), [selectedYear]);

  // Sync selectedYear when selectedMonth changes (e.g., from entry modal)
  useEffect(() => {
    const yearFromMonth = parseInt(selectedMonth.split('-')[0]);
    if (yearFromMonth !== selectedYear) {
      setSelectedYear(yearFromMonth);
    }
  }, [selectedMonth]);

  // Year navigation handlers
  const handlePreviousYear = useCallback(() => {
    const minYear = availableYears[availableYears.length - 1];
    if (selectedYear > minYear) {
      const newYear = selectedYear - 1;
      setSelectedYear(newYear);
      // Auto-select December of the previous year (or latest available month)
      const months = getMonthsForYear(newYear);
      if (months.length > 0) {
        setSelectedMonth(months[0]); // First in descending = latest month
      }
    }
  }, [selectedYear, availableYears]);

  const handleNextYear = useCallback(() => {
    if (selectedYear < currentYear) {
      const newYear = selectedYear + 1;
      setSelectedYear(newYear);
      // Auto-select the latest month of the new year
      const months = getMonthsForYear(newYear);
      if (months.length > 0) {
        setSelectedMonth(months[0]);
      }
    }
  }, [selectedYear, currentYear]);

  const handleJumpToYear = useCallback((year: number) => {
    setSelectedYear(year);
    const months = getMonthsForYear(year);
    if (months.length > 0) {
      setSelectedMonth(months[0]);
    }
    setShowYearPicker(false);
  }, []);

  const handleJumpToToday = useCallback(() => {
    const now = getCurrentMonth();
    setSelectedMonth(now);
    setSelectedYear(currentYear);
  }, [currentYear]);


  /** Cancel any pending retry timers */
  const cancelRetry = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    retryAttemptRef.current = 0;
    setRetryState({ attempt: 0, countdownSec: 0, active: false });
  }, []);

  /**
   * Core data-fetching function. Makes a single attempt to load all marketing data.
   * Returns the caught error (if any) so the caller can decide whether to retry.
   */
  const fetchData = useCallback(async (): Promise<{ success: boolean; error?: any }> => {
    try {
      const [channelsData, summaryData] = await Promise.all([
        getChannels(),
        getMonthlySummary(selectedMonth),
      ]);

      if (!mountedRef.current) return { success: false };

      setChannels(channelsData);
      setEntries(summaryData.entries);
      setTotals(summaryData.totals);
      // Load trend data — use the selected year's full range (Jan–Dec)
      const trendStartMonth = `${selectedYear}-01`;
      const trendEndMonth = selectedYear === currentYear
        ? getCurrentMonth()
        : `${selectedYear}-12`;
      const trends = await getTrendData(trendStartMonth, trendEndMonth);


      if (!mountedRef.current) return { success: false };

      setTrendData(trends);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err };
    }
  }, [selectedMonth, selectedYear, currentYear]);


  /**
   * Schedule an automatic retry after a delay.
   * Shows a countdown in the RetryingBanner, then fires the next attempt.
   */
  const scheduleRetry = useCallback((attemptNumber: number, onRetryFire: () => void) => {
    const delayMs = getRetryDelay(attemptNumber - 1); // 0-based for delay calc
    const delaySec = Math.ceil(delayMs / 1000);

    // Update ref and state
    retryAttemptRef.current = attemptNumber;
    setRetryState({ attempt: attemptNumber, countdownSec: delaySec, active: true });

    // Tick the countdown every second
    let remaining = delaySec;
    countdownIntervalRef.current = setInterval(() => {
      remaining -= 1;
      if (mountedRef.current) {
        setRetryState(prev => ({ ...prev, countdownSec: Math.max(0, remaining) }));
      }
      if (remaining <= 0 && countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    }, 1000);

    // Fire the actual retry after the full delay
    retryTimeoutRef.current = setTimeout(() => {
      retryTimeoutRef.current = null;
      if (mountedRef.current) {
        // Update banner to show "Retrying..." (countdown = 0)
        setRetryState(prev => ({ ...prev, countdownSec: 0 }));
        onRetryFire();
      }
    }, delayMs);
  }, []);

  /**
   * Main load function with automatic retry for 5xx errors.
   * - On first call (or manual retry), shows loading skeleton.
   * - On auto-retry, shows the RetryingBanner instead of skeleton
   *   (so stale data remains visible if available).
   */
  const loadData = useCallback(async (isAutoRetry = false) => {
    // Cancel any pending retry timers (but preserve attempt count for auto-retry)
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    if (!isAutoRetry) {
      // Fresh load: show skeleton, clear errors, reset attempt counter
      retryAttemptRef.current = 0;
      setLoading(true);
      setErrorInfo(null);
      setRetryState({ attempt: 0, countdownSec: 0, active: false });
    }

    const result = await fetchData();

    if (!mountedRef.current) return;

    if (result.success) {
      // Success — clear everything
      setLoading(false);
      setErrorInfo(null);
      retryAttemptRef.current = 0;
      setRetryState({ attempt: 0, countdownSec: 0, active: false });
      return;
    }

    // Failure path — read attempt from ref (always current)
    const err = result.error;
    const currentAttempt = retryAttemptRef.current;
    const nextAttempt = currentAttempt + 1;

    // Check if this is a retryable 5xx error and we haven't exhausted attempts
    if (isRetryableError(err) && nextAttempt <= MAX_RETRY_ATTEMPTS) {
      // Don't show error banner yet — schedule a retry
      setLoading(false);
      setErrorInfo(null);

      scheduleRetry(nextAttempt, () => {
        // This fires after the countdown delay
        loadData(true);
      });
      return;
    }

    // Non-retryable error, or all retries exhausted — show error banner
    setLoading(false);
    retryAttemptRef.current = 0;
    setRetryState({ attempt: 0, countdownSec: 0, active: false });

    // Enhance the error message if retries were exhausted
    const parsed = parseError(err);
    if (isRetryableError(err) && nextAttempt > MAX_RETRY_ATTEMPTS) {
      parsed.userMessage = `${parsed.userMessage} (failed after ${MAX_RETRY_ATTEMPTS} automatic retries)`;
    }
    setErrorInfo(parsed);
  }, [fetchData, scheduleRetry]);


  // Trigger load when selectedMonth changes
  useEffect(() => {
    loadData(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, fetchData]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []);

  /** Manual retry handler — resets retry counter and does a fresh load */
  const handleManualRetry = useCallback(() => {
    cancelRetry();
    loadData(false);
  }, [cancelRetry, loadData]);


  // Handlers
  const handleSaveEntry = async (entryData: any) => {
    await upsertEntry(entryData);
    await loadData();
  };

  const handleEditEntry = (entry: MarketingEntry) => {
    setEditEntry(entry);
    setShowEntryModal(true);
  };

  const handleDeleteEntry = (entry: MarketingEntry) => {
    const doDelete = async () => {
      try {
        await deleteEntry(entry.id);
        await loadData();
      } catch (err: any) {
        setErrorInfo(parseError(err));
      }
    };

    if (Platform.OS === 'web') {
      if (confirm(`Delete ${entry.channel_name} entry for ${getMonthLabel(entry.month)}?`)) {
        doDelete();
      }
    } else {
      Alert.alert('Delete Entry', `Delete ${entry.channel_name} entry?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const handleAddChannel = async (name: string) => {
    await addChannel(name);
    const updated = await getChannels();
    setChannels(updated);
  };

  const handleUpdateChannel = async (id: string, updates: Partial<MarketingChannel>) => {
    await updateChannel(id, updates);
    const updated = await getChannels();
    setChannels(updated);
  };

  const handleDeleteChannel = async (id: string) => {
    await deleteChannel(id);
    const updated = await getChannels();
    setChannels(updated);
    await loadData();
  };
  // Alias handlers
  const handleAddAlias = async (channelId: string, alias: string) => {
    await addChannelAlias(channelId, alias);
    const updated = await getChannels();
    setChannels(updated);
  };

  const handleDeleteAlias = async (aliasId: string) => {
    await deleteChannelAlias(aliasId);
    const updated = await getChannels();
    setChannels(updated);
  };


  const handleExportCSV = async () => {
    const csv = generateCSV(entries, totals, selectedMonth);
    if (Platform.OS === 'web') {
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `marketing-report-${selectedMonth}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      try {
        await Share.share({ message: csv, title: `Marketing Report ${getMonthLabel(selectedMonth)}` });
      } catch {}
    }
  };

  const handleExportPDF = () => {
    const msg = Platform.OS === 'web'
      ? 'PDF export would generate a formatted report. For now, use CSV export.'
      : 'PDF export would generate a formatted report. For now, use CSV export.';
    if (Platform.OS === 'web') {
      alert(msg);
    } else {
      Alert.alert('PDF Export', msg);
    }
  };

  // Chart data
  const channelChartData = useMemo(() => {
    const sorted = [...entries].sort((a, b) => {
      switch (chartView) {
        case 'leads': return b.leads - a.leads;
        case 'clients': return b.clients - a.clients;
        case 'revenue': return Number(b.revenue) - Number(a.revenue);
        case 'roi': return b.roi - a.roi;
        default: return 0;
      }
    }).slice(0, 10);

    return sorted.map(e => ({
      label: e.channel_name.length > 8 ? e.channel_name.substring(0, 7) + '.' : e.channel_name,
      value: chartView === 'leads' ? e.leads :
             chartView === 'clients' ? e.clients :
             chartView === 'revenue' ? Number(e.revenue) / 1000 :
             e.roi,
    }));
  }, [entries, chartView]);

  // Investment overlay data for the revenue chart view (shared scale, overlay in front)
  const channelInvestmentOverlay = useMemo(() => {
    if (chartView !== 'revenue') return undefined;

    const sorted = [...entries].sort((a, b) => Number(b.revenue) - Number(a.revenue)).slice(0, 10);

    return sorted.map(e => ({
      label: e.channel_name.length > 8 ? e.channel_name.substring(0, 7) + '.' : e.channel_name,
      value: Number(e.investment) / 1000,
    }));
  }, [entries, chartView]);

  // Investment overlay data for the leads chart view (independent scale, overlay behind)
  const leadsInvestmentOverlay = useMemo(() => {
    if (chartView !== 'leads') return undefined;

    const sorted = [...entries].sort((a, b) => b.leads - a.leads).slice(0, 10);

    return sorted.map(e => ({
      label: e.channel_name.length > 8 ? e.channel_name.substring(0, 7) + '.' : e.channel_name,
      value: Number(e.investment),
    }));
  }, [entries, chartView]);



  const trendChartData = useMemo(() => {
    const sorted = [...trendData].sort((a, b) => a.month.localeCompare(b.month));
    return sorted.map(t => {
      const [, m] = t.month.split('-');
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const label = monthNames[parseInt(m) - 1] || m;
      return {
        label,
        value: trendView === 'spend' ? t.investment / 1000 :
               trendView === 'revenue' ? t.revenue / 1000 :
               trendView === 'cost_per_client' ? t.cost_per_client :
               t.roi,
      };
    });
  }, [trendData, trendView]);

  const chartViewOptions: { label: string; value: ChartView }[] = [
    { label: 'Revenue', value: 'revenue' },
    { label: 'Leads', value: 'leads' },
    { label: 'Clients', value: 'clients' },
    { label: 'ROI', value: 'roi' },
  ];

  const trendViewOptions: { label: string; value: TrendView }[] = [
    { label: 'Revenue', value: 'revenue' },
    { label: 'Spend', value: 'spend' },
    { label: 'Cost/Client', value: 'cost_per_client' },
    { label: 'ROI', value: 'roi' },
  ];

  // Show skeleton while loading
  if (loading) {
    return (
      <View>
        <LoadingSkeleton />
      </View>
    );
  }

  return (
    <View>
      {/* Retrying Banner — shown during automatic retry countdown */}
      {retryState.active && (
        <RetryingBanner retryState={retryState} />
      )}

      {/* Error Banner — shown only after all retries exhausted or non-retryable error */}
      {errorInfo && !retryState.active && (
        <ErrorBanner
          errorInfo={errorInfo}
          onRetry={handleManualRetry}
          onDismiss={() => setErrorInfo(null)}
          showDetails={isAdmin}
        />
      )}


      {/* Action Bar */}
      {/* Action Bar */}
      <View style={styles.actionBar}>
        <TouchableOpacity
          style={styles.addEntryBtn}
          onPress={() => { setEditEntry(null); setShowEntryModal(true); }}
        >
          <Ionicons name="add-circle" size={18} color={COLORS.white} />
          <Text style={styles.addEntryText}>Add Entry</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.massImportBtn}
          onPress={() => setShowMassImport(true)}
        >
          <Ionicons name="cloud-upload-outline" size={16} color={COLORS.white} />
          <Text style={styles.massImportText}>Mass Import</Text>
        </TouchableOpacity>
        {isAdmin && (
          <TouchableOpacity style={styles.manageBtn} onPress={() => setShowChannelManager(true)}>
            <Ionicons name="settings-outline" size={16} color={COLORS.accent} />
            <Text style={styles.manageBtnText}>Channels</Text>
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.exportBtn} onPress={handleExportCSV}>
          <Ionicons name="download-outline" size={16} color={COLORS.accent} />
          <Text style={styles.exportBtnText}>CSV</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.exportBtn} onPress={handleExportPDF}>
          <Ionicons name="document-outline" size={16} color={COLORS.accent} />
          <Text style={styles.exportBtnText}>PDF</Text>
        </TouchableOpacity>
      </View>


      {/* ============ Year Navigation Bar ============ */}
      <View style={styles.yearNavContainer}>
        <View style={styles.yearNavRow}>
          <TouchableOpacity
            style={[styles.yearNavArrow, selectedYear <= availableYears[availableYears.length - 1] && styles.yearNavArrowDisabled]}
            onPress={handlePreviousYear}
            disabled={selectedYear <= availableYears[availableYears.length - 1]}
          >
            <Ionicons
              name="chevron-back"
              size={20}
              color={selectedYear <= availableYears[availableYears.length - 1] ? COLORS.border : COLORS.primary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.yearNavLabel}
            onPress={() => setShowYearPicker(!showYearPicker)}
          >
            <Ionicons name="calendar-outline" size={16} color={COLORS.accent} />
            <Text style={styles.yearNavLabelText}>{selectedYear}</Text>
            <Ionicons
              name={showYearPicker ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={COLORS.textMuted}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.yearNavArrow, selectedYear >= currentYear && styles.yearNavArrowDisabled]}
            onPress={handleNextYear}
            disabled={selectedYear >= currentYear}
          >
            <Ionicons
              name="chevron-forward"
              size={20}
              color={selectedYear >= currentYear ? COLORS.border : COLORS.primary}
            />
          </TouchableOpacity>

          {/* Jump to Today button — only show when not on current month */}
          {selectedMonth !== getCurrentMonth() && (
            <TouchableOpacity style={styles.todayBtn} onPress={handleJumpToToday}>
              <Ionicons name="today-outline" size={14} color={COLORS.accent} />
              <Text style={styles.todayBtnText}>Today</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Year Picker Dropdown */}
        {showYearPicker && (
          <View style={styles.yearPickerDropdown}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.yearPickerContent}
            >
              {availableYears.map(year => (
                <TouchableOpacity
                  key={year}
                  style={[
                    styles.yearPickerChip,
                    year === selectedYear && styles.yearPickerChipActive,
                  ]}
                  onPress={() => handleJumpToYear(year)}
                >
                  <Text
                    style={[
                      styles.yearPickerChipText,
                      year === selectedYear && styles.yearPickerChipTextActive,
                    ]}
                  >
                    {year}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      {/* Month Selector — shows all months for the selected year */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.monthScroll}
        contentContainerStyle={styles.monthScrollContent}
      >
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
              <Text style={[styles.monthChipText, m === selectedMonth && styles.monthChipTextActive]}>
                {shortLabel}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>


      {/* KPI Summary Cards */}
      <View style={styles.kpiGrid}>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBg, { backgroundColor: COLORS.danger + '20' }]}>
            <Ionicons name="cash-outline" size={20} color={COLORS.danger} />
          </View>
          <Text style={styles.kpiValue}>{formatCurrency(totals.investment)}</Text>
          <Text style={styles.kpiLabel}>Total Investment</Text>
        </View>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBg, { backgroundColor: COLORS.info + '20' }]}>
            <Ionicons name="people-outline" size={20} color={COLORS.info} />
          </View>
          <Text style={styles.kpiValue}>{totals.leads}</Text>
          <Text style={styles.kpiLabel}>Total Leads</Text>
        </View>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBg, { backgroundColor: COLORS.accent + '20' }]}>
            <Ionicons name="person-add-outline" size={20} color={COLORS.accent} />
          </View>
          <Text style={styles.kpiValue}>{totals.clients}</Text>
          <Text style={styles.kpiLabel}>Total Clients</Text>
        </View>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBg, { backgroundColor: COLORS.success + '20' }]}>
            <Ionicons name="trending-up" size={20} color={COLORS.success} />
          </View>
          <Text style={styles.kpiValue}>{formatCurrency(totals.revenue)}</Text>
          <Text style={styles.kpiLabel}>Total Revenue</Text>
        </View>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBg, { backgroundColor: (totals.profit >= 0 ? COLORS.success : COLORS.danger) + '20' }]}>
            <Ionicons name="wallet-outline" size={20} color={totals.profit >= 0 ? COLORS.success : COLORS.danger} />
          </View>
          <Text style={[styles.kpiValue, { color: totals.profit >= 0 ? COLORS.success : COLORS.danger }]}>
            {formatCurrency(totals.profit)}
          </Text>
          <Text style={styles.kpiLabel}>Total Profit</Text>
        </View>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBg, { backgroundColor: '#9b59b6' + '20' }]}>
            <Ionicons name="analytics" size={20} color="#9b59b6" />
          </View>
          <Text style={[styles.kpiValue, { color: totals.roi >= 0 ? COLORS.success : COLORS.danger }]}>
            {formatPercent(totals.roi)}
          </Text>
          <Text style={styles.kpiLabel}>Overall ROI</Text>
        </View>
      </View>

      {/* Additional KPI Row */}
      <View style={styles.secondaryKpiRow}>
        <View style={styles.secondaryKpi}>
          <Text style={styles.secondaryKpiLabel}>Lead Cost</Text>
          <Text style={styles.secondaryKpiValue}>${totals.lead_cost.toFixed(2)}</Text>
        </View>
        <View style={styles.secondaryKpiDivider} />
        <View style={styles.secondaryKpi}>
          <Text style={styles.secondaryKpiLabel}>Conv. Rate</Text>
          <Text style={styles.secondaryKpiValue}>{totals.conversion_rate.toFixed(1)}%</Text>
        </View>
        <View style={styles.secondaryKpiDivider} />
        <View style={styles.secondaryKpi}>
          <Text style={styles.secondaryKpiLabel}>Cost/Client</Text>
          <Text style={styles.secondaryKpiValue}>${totals.cost_per_client.toFixed(2)}</Text>
        </View>
        <View style={styles.secondaryKpiDivider} />
        <View style={styles.secondaryKpi}>
          <Text style={styles.secondaryKpiLabel}>Rev/Client</Text>
          <Text style={styles.secondaryKpiValue}>${totals.revenue_per_client.toFixed(2)}</Text>
        </View>
      </View>

      {/* Channel Performance Chart */}
      <SectionHeader title="Channel Performance" subtitle={getMonthLabel(selectedMonth)} icon="bar-chart" />
      <View style={styles.chartToggleRow}>
        {chartViewOptions.map(opt => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.chartToggle, chartView === opt.value && styles.chartToggleActive]}
            onPress={() => setChartView(opt.value)}
          >
            <Text style={[styles.chartToggleText, chartView === opt.value && styles.chartToggleTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.chartCard}>
        {channelChartData.length > 0 ? (
          <>
            <BarChart
              data={channelChartData}
              height={160}
              barColor={
                chartView === 'revenue' ? COLORS.success :
                chartView === 'leads' ? COLORS.info :
                chartView === 'clients' ? COLORS.accent :
                '#9b59b6'
              }
              overlayData={chartView === 'revenue' ? channelInvestmentOverlay : leadsInvestmentOverlay}
              overlayColor={COLORS.danger}
              overlayOpacity={chartView === 'leads' ? 0.38 : 0.45}
              overlayBehind={chartView === 'leads'}
              independentScale={chartView === 'leads'}
              overlayLegendLabels={
                chartView === 'leads' ? ['Leads', 'Cost'] :
                chartView === 'revenue' ? ['Revenue', 'Invested'] :
                undefined
              }
            />
            {chartView === 'leads' && leadsInvestmentOverlay && (
              <Text style={{
                fontSize: 10,
                color: COLORS.textMuted,
                textAlign: 'center',
                marginTop: 6,
                fontStyle: 'italic',
              }}>
                Blue = lead volume · Red = relative spend — less red per blue = better value
              </Text>
            )}
          </>
        ) : (
          <View style={styles.emptyChart}>
            <Ionicons name="bar-chart-outline" size={32} color={COLORS.textMuted} />
            <Text style={styles.emptyChartText}>No data for this month</Text>
          </View>
        )}
      </View>




      {/* Monthly Trends Chart */}
      <SectionHeader title="Monthly Trends" subtitle={`Jan – ${selectedYear === currentYear ? getMonthLabel(getCurrentMonth()).split(' ')[0] : 'Dec'} ${selectedYear}`} icon="trending-up" />

      <View style={styles.chartToggleRow}>
        {trendViewOptions.map(opt => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.chartToggle, trendView === opt.value && styles.chartToggleActive]}
            onPress={() => setTrendView(opt.value)}
          >
            <Text style={[styles.chartToggleText, trendView === opt.value && styles.chartToggleTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.chartCard}>
        {trendChartData.length > 0 && trendChartData.some(d => d.value > 0) ? (
          <BarChart
            data={trendChartData}
            height={160}
            barColor={
              trendView === 'revenue' ? COLORS.success :
              trendView === 'spend' ? COLORS.danger :
              trendView === 'cost_per_client' ? COLORS.warning :
              '#9b59b6'
            }
          />
        ) : (
          <View style={styles.emptyChart}>
            <Ionicons name="trending-up-outline" size={32} color={COLORS.textMuted} />
            <Text style={styles.emptyChartText}>Add data across multiple months to see trends</Text>
          </View>
        )}
      </View>

      {/* Data Table */}
      <SectionHeader
        title="Detailed Breakdown"
        subtitle={`${entries.length} channels · ${getMonthLabel(selectedMonth)}`}
        icon="list"
      />
      <MarketingDataTable
        entries={entries}
        totals={totals}
        onEdit={handleEditEntry}
        onDelete={handleDeleteEntry}
      />

      {/* Top Performers */}
      {entries.length > 0 && (
        <>
          <SectionHeader title="Top Performers" subtitle="Best ROI channels" icon="trophy" />
          <View style={styles.topPerformersGrid}>
            {[...entries]
              .filter(e => Number(e.investment) > 0)
              .sort((a, b) => b.roi - a.roi)
              .slice(0, 5)
              .map((entry, i) => (
                <View key={entry.id} style={styles.topPerformerCard}>
                  <View style={styles.topPerformerRank}>
                    <Text style={[styles.topPerformerRankText, i < 3 && { color: COLORS.accent }]}>
                      #{i + 1}
                    </Text>
                  </View>
                  <View style={styles.topPerformerInfo}>
                    <Text style={styles.topPerformerName} numberOfLines={1}>{entry.channel_name}</Text>
                    <Text style={styles.topPerformerDetail}>
                      {formatCurrency(Number(entry.investment))} invested
                    </Text>
                  </View>
                  <View style={styles.topPerformerMetrics}>
                    <Text style={[styles.topPerformerROI, { color: entry.roi >= 0 ? COLORS.success : COLORS.danger }]}>
                      {entry.roi.toFixed(0)}% ROI
                    </Text>
                    <Text style={styles.topPerformerProfit}>
                      {formatCurrency(entry.profit)} profit
                    </Text>
                  </View>
                </View>
              ))}
          </View>
        </>
      )}

      {/* Modals */}
      <MarketingEntryModal
        visible={showEntryModal}
        onClose={() => { setShowEntryModal(false); setEditEntry(null); }}
        onSave={handleSaveEntry}
        channels={channels}
        editEntry={editEntry}
        selectedMonth={selectedMonth}
      />

      <MarketingChannelManager
        visible={showChannelManager}
        onClose={() => setShowChannelManager(false)}
        channels={channels}
        onAddChannel={handleAddChannel}
        onUpdateChannel={handleUpdateChannel}
        onDeleteChannel={handleDeleteChannel}
        onAddAlias={handleAddAlias}
        onDeleteAlias={handleDeleteAlias}
      />


      <MarketingMassImportModal
        visible={showMassImport}
        onClose={() => setShowMassImport(false)}
        onComplete={() => loadData(false)}
        channels={channels}
        isAdmin={isAdmin}
      />
    </View>
  );
}


const styles = StyleSheet.create({
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
  massImportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.success,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
  },
  massImportText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.white,
  },

  manageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.accent + '40',
    backgroundColor: COLORS.white,
  },
  manageBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.accent,
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
  monthScroll: {
    marginBottom: SPACING.md,
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
  // KPI Cards
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  kpiCard: {
    flex: 1,
    minWidth: '30%',
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
    fontSize: FONT_SIZES.xl,
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
  // Chart toggles
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
    textAlign: 'center',
  },
  // Top Performers
  topPerformersGrid: {
    gap: SPACING.sm,
  },
  topPerformerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.sm,
    ...SHADOWS.sm,
  },
  topPerformerRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topPerformerRankText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '800',
    color: COLORS.textMuted,
  },
  topPerformerInfo: {
    flex: 1,
  },
  topPerformerName: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.text,
  },
  topPerformerDetail: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  topPerformerMetrics: {
    alignItems: 'flex-end',
  },
  topPerformerROI: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
  },
  topPerformerProfit: {
    marginTop: 1,
  },
  // Year Navigation
  yearNavContainer: {
    marginBottom: SPACING.sm,
  },
  yearNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  yearNavArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.sm,
  },
  yearNavArrowDisabled: {
    opacity: 0.4,
  },
  yearNavLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.accent + '30',
    ...SHADOWS.sm,
  },
  yearNavLabelText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.primary,
  },
  todayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.accent + '15',
    borderWidth: 1,
    borderColor: COLORS.accent + '30',
  },
  todayBtnText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.accent,
  },
  yearPickerDropdown: {
    marginTop: SPACING.sm,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.md,
  },
  yearPickerContent: {
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },
  yearPickerChip: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  yearPickerChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  yearPickerChipText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  yearPickerChipTextActive: {
    color: COLORS.white,
  },
});
