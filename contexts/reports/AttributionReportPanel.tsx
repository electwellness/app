import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Platform, Alert, Share, TextInput, Modal,
  Animated, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import SectionHeader from '../SectionHeader';
import { BarChart } from '../MiniChart';
import ClientJourneyModal from './ClientJourneyModal';
import {
  MarketingChannel, ChannelAttribution, AttributionTotals,
  ClientJourney, UnattributedClient,
  MarketingServiceError,
  getChannels, getAttributionReport, getClientJourneys, getUnattributedClients,
  setClientAttribution,
  formatCurrency, formatCurrencyFull, formatPercent, formatDate,
  generateAttributionCSV,
} from '../../lib/marketingService';

type TabView = 'funnel' | 'journeys' | 'assign';

// ============ ERROR INFO TYPE ============

interface ErrorInfo {
  userMessage: string;
  technicalMessage: string;
  status: number;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
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
        {/* Tab selector skeleton */}
        <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
          <SkeletonBlock width={90} height={36} borderRadius={BORDER_RADIUS.md} />
          <SkeletonBlock width={100} height={36} borderRadius={BORDER_RADIUS.md} />
          <SkeletonBlock width={85} height={36} borderRadius={BORDER_RADIUS.md} />
          <View style={{ flex: 1 }} />
          <SkeletonBlock width={60} height={36} borderRadius={BORDER_RADIUS.md} />
        </View>

        {/* KPI cards skeleton */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm }}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <View key={i} style={skeletonStyles.kpiCard}>
              <SkeletonBlock width={36} height={36} borderRadius={18} />
              <SkeletonBlock width={60} height={20} />
              <SkeletonBlock width={80} height={10} />
            </View>
          ))}
        </View>

        {/* Funnel visualization skeleton */}
        <View style={{ gap: SPACING.sm }}>
          <View style={{ flexDirection: 'row', gap: SPACING.sm, alignItems: 'center' }}>
            <SkeletonBlock width={20} height={20} borderRadius={4} />
            <SkeletonBlock width={140} height={16} />
          </View>
          <View style={skeletonStyles.funnelCard}>
            {[100, 80, 55, 90].map((widthPct, i) => (
              <View key={i} style={{ alignItems: 'center' }}>
                <SkeletonBlock
                  width={`${widthPct}%`}
                  height={38}
                  borderRadius={BORDER_RADIUS.md}
                />
              </View>
            ))}
          </View>
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
          <View style={skeletonStyles.tableCard}>
            {/* Table header */}
            <View style={skeletonStyles.tableHeaderSkel}>
              <SkeletonBlock width={80} height={10} style={{ backgroundColor: COLORS.primaryLight }} />
              <View style={{ flex: 1 }} />
              <SkeletonBlock width={40} height={10} style={{ backgroundColor: COLORS.primaryLight }} />
              <SkeletonBlock width={40} height={10} style={{ backgroundColor: COLORS.primaryLight }} />
              <SkeletonBlock width={40} height={10} style={{ backgroundColor: COLORS.primaryLight }} />
              <SkeletonBlock width={40} height={10} style={{ backgroundColor: COLORS.primaryLight }} />
            </View>
            {/* Table rows */}
            {[1, 2, 3, 4, 5, 6].map(i => (
              <View key={i} style={skeletonStyles.tableRow}>
                <SkeletonBlock width={100} height={12} />
                <View style={{ flex: 1 }} />
                <SkeletonBlock width={50} height={12} />
                <SkeletonBlock width={35} height={12} />
                <SkeletonBlock width={50} height={12} />
                <SkeletonBlock width={40} height={12} />
              </View>
            ))}
          </View>
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
  funnelCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
    ...SHADOWS.md,
  },
  chartCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.md,
  },
  tableCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    ...SHADOWS.md,
  },
  tableHeaderSkel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
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
    userMessage: 'An unexpected error occurred while loading attribution data.',
    technicalMessage: err?.message || 'Unknown error',
    status: 0,
    icon: 'alert-circle',
    color: COLORS.danger,
  };
}

// ============ MAIN COMPONENT ============

export default function AttributionReportPanel() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  // Data
  const [channels, setChannels] = useState<MarketingChannel[]>([]);
  const [channelReport, setChannelReport] = useState<ChannelAttribution[]>([]);
  const [totals, setTotals] = useState<AttributionTotals>({
    total_spend: 0, attributed_clients: 0, attributed_ltv: 0,
    reported_leads: 0, overall_roi: 0, avg_ltv: 0, cost_per_client: 0,
  });
  const [journeys, setJourneys] = useState<ClientJourney[]>([]);
  const [unattributed, setUnattributed] = useState<UnattributedClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null);

  // UI state
  const [activeTab, setActiveTab] = useState<TabView>('funnel');
  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);
  const [showJourneyModal, setShowJourneyModal] = useState(false);
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [chartMetric, setChartMetric] = useState<'ltv' | 'clients' | 'roi' | 'cost'>('ltv');

  // Assign modal state
  const [assigningClient, setAssigningClient] = useState<UnattributedClient | null>(null);
  const [assignChannelId, setAssignChannelId] = useState('');
  const [assignDate, setAssignDate] = useState('');
  const [assignConvDate, setAssignConvDate] = useState('');
  const [showChannelPicker, setShowChannelPicker] = useState(false);
  const [assignSaving, setAssignSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorInfo(null);
    try {
      const [channelsData, reportData, journeysData, unattributedData] = await Promise.all([
        getChannels(),
        getAttributionReport(),
        getClientJourneys({ limit: 100 }),
        getUnattributedClients(),
      ]);
      setChannels(channelsData);
      setChannelReport(reportData.channels);
      setTotals(reportData.totals);
      setJourneys(journeysData);
      setUnattributed(unattributedData);
    } catch (err: any) {
      setErrorInfo(parseError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleExportCSV = async () => {
    const csv = generateAttributionCSV(channelReport, totals);
    if (Platform.OS === 'web') {
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attribution-report-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      try {
        await Share.share({ message: csv, title: 'Attribution Report' });
      } catch {}
    }
  };

  const handleAssignClient = async () => {
    if (!assigningClient || !assignChannelId) return;
    setAssignSaving(true);
    try {
      await setClientAttribution({
        client_id: assigningClient.id,
        channel_id: assignChannelId,
        lead_source_date: assignDate || null,
        conversion_date: assignConvDate || null,
      });
      setAssigningClient(null);
      setAssignChannelId('');
      setAssignDate('');
      setAssignConvDate('');
      await loadData();
    } catch (err: any) {
      const parsed = parseError(err);
      if (Platform.OS === 'web') alert(parsed.userMessage);
      else Alert.alert('Error', parsed.userMessage);
    } finally {
      setAssignSaving(false);
    }
  };

  // Chart data
  const chartData = useMemo(() => {
    const sorted = [...channelReport]
      .filter(ch => ch.attributed_clients > 0)
      .sort((a, b) => {
        switch (chartMetric) {
          case 'ltv': return b.attributed_ltv - a.attributed_ltv;
          case 'clients': return b.attributed_clients - a.attributed_clients;
          case 'roi': return b.attribution_roi - a.attribution_roi;
          case 'cost': return b.cost_per_attributed_client - a.cost_per_attributed_client;
          default: return 0;
        }
      })
      .slice(0, 10);

    return sorted.map(ch => ({
      label: ch.channel_name.length > 8 ? ch.channel_name.substring(0, 7) + '.' : ch.channel_name,
      value: chartMetric === 'ltv' ? ch.attributed_ltv / 1000 :
             chartMetric === 'clients' ? ch.attributed_clients :
             chartMetric === 'roi' ? ch.attribution_roi :
             ch.cost_per_attributed_client,
    }));
  }, [channelReport, chartMetric]);

  // Filtered journeys
  const filteredJourneys = useMemo(() => {
    let result = journeys;
    if (channelFilter !== 'all') {
      result = result.filter(j => j.lead_source_channel_id === channelFilter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(j =>
        j.full_name.toLowerCase().includes(q) ||
        j.email.toLowerCase().includes(q) ||
        j.channel_name.toLowerCase().includes(q)
      );
    }
    return result;
  }, [journeys, channelFilter, searchQuery]);

  // Filtered unattributed
  const filteredUnattributed = useMemo(() => {
    if (!searchQuery) return unattributed;
    const q = searchQuery.toLowerCase();
    return unattributed.filter(c =>
      c.full_name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
    );
  }, [unattributed, searchQuery]);

  const chartMetricOptions: { label: string; value: typeof chartMetric }[] = [
    { label: 'LTV ($K)', value: 'ltv' },
    { label: 'Clients', value: 'clients' },
    { label: 'ROI %', value: 'roi' },
    { label: 'Cost/Client', value: 'cost' },
  ];

  const tabs: { label: string; value: TabView; icon: string; count?: number }[] = [
    { label: 'Funnel', value: 'funnel', icon: 'funnel-outline' },
    { label: 'Journeys', value: 'journeys', icon: 'git-branch-outline', count: journeys.length },
    { label: 'Assign', value: 'assign', icon: 'link-outline', count: unattributed.length },
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
      {/* Error Banner */}
      {errorInfo && (
        <ErrorBanner
          errorInfo={errorInfo}
          onRetry={loadData}
          onDismiss={() => setErrorInfo(null)}
          showDetails={isAdmin}
        />
      )}

      {/* Tab Selector */}
      <View style={styles.tabRow}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab.value}
            style={[styles.tab, activeTab === tab.value && styles.tabActive]}
            onPress={() => setActiveTab(tab.value)}
          >
            <Ionicons
              name={tab.icon as any}
              size={16}
              color={activeTab === tab.value ? COLORS.white : COLORS.textMuted}
            />
            <Text style={[styles.tabText, activeTab === tab.value && styles.tabTextActive]}>
              {tab.label}
            </Text>
            {tab.count !== undefined && tab.count > 0 && (
              <View style={[styles.tabBadge, activeTab === tab.value && styles.tabBadgeActive]}>
                <Text style={[styles.tabBadgeText, activeTab === tab.value && styles.tabBadgeTextActive]}>
                  {tab.count}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.exportBtn} onPress={handleExportCSV}>
          <Ionicons name="download-outline" size={16} color={COLORS.accent} />
          <Text style={styles.exportBtnText}>CSV</Text>
        </TouchableOpacity>
      </View>

      {/* ===== FUNNEL TAB ===== */}
      {activeTab === 'funnel' && (
        <>
          {/* KPI Cards */}
          <View style={styles.kpiGrid}>
            <View style={styles.kpiCard}>
              <View style={[styles.kpiIconBg, { backgroundColor: COLORS.danger + '20' }]}>
                <Ionicons name="cash-outline" size={20} color={COLORS.danger} />
              </View>
              <Text style={styles.kpiValue}>{formatCurrency(totals.total_spend)}</Text>
              <Text style={styles.kpiLabel}>Total Spend</Text>
            </View>
            <View style={styles.kpiCard}>
              <View style={[styles.kpiIconBg, { backgroundColor: COLORS.info + '20' }]}>
                <Ionicons name="people-outline" size={20} color={COLORS.info} />
              </View>
              <Text style={styles.kpiValue}>{totals.reported_leads}</Text>
              <Text style={styles.kpiLabel}>Total Leads</Text>
            </View>
            <View style={styles.kpiCard}>
              <View style={[styles.kpiIconBg, { backgroundColor: COLORS.accent + '20' }]}>
                <Ionicons name="person-add-outline" size={20} color={COLORS.accent} />
              </View>
              <Text style={styles.kpiValue}>{totals.attributed_clients}</Text>
              <Text style={styles.kpiLabel}>Attributed Clients</Text>
            </View>
            <View style={styles.kpiCard}>
              <View style={[styles.kpiIconBg, { backgroundColor: COLORS.success + '20' }]}>
                <Ionicons name="wallet-outline" size={20} color={COLORS.success} />
              </View>
              <Text style={[styles.kpiValue, { color: COLORS.success }]}>
                {formatCurrency(totals.attributed_ltv)}
              </Text>
              <Text style={styles.kpiLabel}>Total LTV</Text>
            </View>
            <View style={styles.kpiCard}>
              <View style={[styles.kpiIconBg, { backgroundColor: COLORS.warning + '20' }]}>
                <Ionicons name="person-outline" size={20} color={COLORS.warning} />
              </View>
              <Text style={styles.kpiValue}>{formatCurrency(totals.avg_ltv)}</Text>
              <Text style={styles.kpiLabel}>Avg LTV</Text>
            </View>
            <View style={styles.kpiCard}>
              <View style={[styles.kpiIconBg, { backgroundColor: '#9b59b6' + '20' }]}>
                <Ionicons name="analytics" size={20} color="#9b59b6" />
              </View>
              <Text style={[styles.kpiValue, { color: totals.overall_roi >= 0 ? COLORS.success : COLORS.danger }]}>
                {formatPercent(totals.overall_roi)}
              </Text>
              <Text style={styles.kpiLabel}>Attribution ROI</Text>
            </View>
          </View>

          {/* Funnel Visualization */}
          <SectionHeader title="Attribution Funnel" subtitle="Spend to LTV" icon="funnel" />
          <View style={styles.funnelCard}>
            {[
              { label: 'Marketing Spend', value: formatCurrency(totals.total_spend), color: COLORS.danger, width: '100%' },
              { label: 'Leads Generated', value: `${totals.reported_leads}`, color: COLORS.info, width: '80%' },
              { label: 'Attributed Clients', value: `${totals.attributed_clients}`, color: COLORS.accent, width: '55%' },
              { label: 'Client Lifetime Value', value: formatCurrency(totals.attributed_ltv), color: COLORS.success, width: '90%' },
            ].map((step, i) => (
              <View key={i} style={styles.funnelStep}>
                <View style={[styles.funnelBar, { width: step.width as any, backgroundColor: step.color + '20' }]}>
                  <View style={[styles.funnelBarFill, { backgroundColor: step.color }]} />
                  <Text style={styles.funnelStepLabel}>{step.label}</Text>
                  <Text style={[styles.funnelStepValue, { color: step.color }]}>{step.value}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Channel Performance Chart */}
          <SectionHeader title="Channel Attribution" subtitle="Performance by channel" icon="bar-chart" />
          <View style={styles.chartToggleRow}>
            {chartMetricOptions.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.chartToggle, chartMetric === opt.value && styles.chartToggleActive]}
                onPress={() => setChartMetric(opt.value)}
              >
                <Text style={[styles.chartToggleText, chartMetric === opt.value && styles.chartToggleTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.chartCard}>
            {chartData.length > 0 ? (
              <BarChart
                data={chartData}
                height={160}
                barColor={
                  chartMetric === 'ltv' ? COLORS.success :
                  chartMetric === 'clients' ? COLORS.accent :
                  chartMetric === 'roi' ? '#9b59b6' :
                  COLORS.warning
                }
              />
            ) : (
              <View style={styles.emptyChart}>
                <Ionicons name="bar-chart-outline" size={32} color={COLORS.textMuted} />
                <Text style={styles.emptyChartText}>No attributed clients yet</Text>
              </View>
            )}
          </View>

          {/* Channel Breakdown Table */}
          <SectionHeader title="Channel Breakdown" subtitle={`${channelReport.length} channels`} icon="list" />
          <View style={styles.tableCard}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, { flex: 2 }]}>Channel</Text>
              <Text style={[styles.tableHeaderText, { flex: 1 }]}>Spend</Text>
              <Text style={[styles.tableHeaderText, { flex: 1 }]}>Clients</Text>
              <Text style={[styles.tableHeaderText, { flex: 1 }]}>LTV</Text>
              <Text style={[styles.tableHeaderText, { flex: 1 }]}>ROI</Text>
            </View>
            {channelReport
              .sort((a, b) => b.attributed_ltv - a.attributed_ltv)
              .map((ch, i) => (
                <TouchableOpacity
                  key={ch.channel_id}
                  style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}
                  onPress={() => {
                    setChannelFilter(ch.channel_id);
                    setActiveTab('journeys');
                  }}
                >
                  <Text style={[styles.tableCell, { flex: 2, fontWeight: '600' }]} numberOfLines={1}>
                    {ch.channel_name}
                  </Text>
                  <Text style={[styles.tableCell, { flex: 1 }]}>{formatCurrency(ch.total_spend)}</Text>
                  <Text style={[styles.tableCell, { flex: 1, fontWeight: '700', color: COLORS.accent }]}>
                    {ch.attributed_clients}
                  </Text>
                  <Text style={[styles.tableCell, { flex: 1, color: COLORS.success, fontWeight: '700' }]}>
                    {formatCurrency(ch.attributed_ltv)}
                  </Text>
                  <Text style={[styles.tableCell, { flex: 1, color: ch.attribution_roi >= 0 ? COLORS.success : COLORS.danger, fontWeight: '700' }]}>
                    {ch.attribution_roi.toFixed(0)}%
                  </Text>
                </TouchableOpacity>
              ))}
          </View>
        </>
      )}

      {/* ===== JOURNEYS TAB ===== */}
      {activeTab === 'journeys' && (
        <>
          {/* Search & Filter */}
          <View style={styles.filterRow}>
            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={16} color={COLORS.textMuted} />
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search clients..."
                placeholderTextColor={COLORS.textMuted}
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.channelFilterScroll}>
            <TouchableOpacity
              style={[styles.channelChip, channelFilter === 'all' && styles.channelChipActive]}
              onPress={() => setChannelFilter('all')}
            >
              <Text style={[styles.channelChipText, channelFilter === 'all' && styles.channelChipTextActive]}>
                All Channels
              </Text>
            </TouchableOpacity>
            {channels.filter(c => c.is_active).map(ch => (
              <TouchableOpacity
                key={ch.id}
                style={[styles.channelChip, channelFilter === ch.id && styles.channelChipActive]}
                onPress={() => setChannelFilter(ch.id === channelFilter ? 'all' : ch.id)}
              >
                <Text style={[styles.channelChipText, channelFilter === ch.id && styles.channelChipTextActive]}>
                  {ch.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.resultCount}>
            {filteredJourneys.length} attributed client{filteredJourneys.length !== 1 ? 's' : ''}
          </Text>

          {filteredJourneys.length > 0 ? (
            <View style={styles.journeyList}>
              {filteredJourneys.map(j => (
                <TouchableOpacity
                  key={j.id}
                  style={styles.journeyCard}
                  onPress={() => {
                    setSelectedJourneyId(j.id);
                    setShowJourneyModal(true);
                  }}
                >
                  <View style={styles.journeyCardHeader}>
                    <View style={styles.journeyAvatar}>
                      <Text style={styles.journeyAvatarText}>
                        {j.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.journeyInfo}>
                      <Text style={styles.journeyName} numberOfLines={1}>{j.full_name}</Text>
                      <Text style={styles.journeyEmail} numberOfLines={1}>{j.email}</Text>
                    </View>
                    <View style={styles.journeyLTV}>
                      <Text style={[styles.journeyLTVValue, { color: j.ltv > 0 ? COLORS.success : COLORS.textMuted }]}>
                        {formatCurrencyFull(j.ltv)}
                      </Text>
                      <Text style={styles.journeyLTVLabel}>LTV</Text>
                    </View>
                  </View>
                  <View style={styles.journeyMeta}>
                    <View style={styles.journeyMetaItem}>
                      <Ionicons name="megaphone-outline" size={12} color={COLORS.info} />
                      <Text style={styles.journeyMetaText}>{j.channel_name}</Text>
                    </View>
                    {j.lead_source_date && (
                      <View style={styles.journeyMetaItem}>
                        <Ionicons name="flag-outline" size={12} color={COLORS.warning} />
                        <Text style={styles.journeyMetaText}>Touch: {formatDate(j.lead_source_date)}</Text>
                      </View>
                    )}
                    {j.conversion_date && (
                      <View style={styles.journeyMetaItem}>
                        <Ionicons name="checkmark-circle-outline" size={12} color={COLORS.success} />
                        <Text style={styles.journeyMetaText}>Conv: {formatDate(j.conversion_date)}</Text>
                      </View>
                    )}
                    <View style={styles.journeyMetaItem}>
                      <Ionicons name="receipt-outline" size={12} color={COLORS.accent} />
                      <Text style={styles.journeyMetaText}>{j.revenue_events.length} events</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="git-branch-outline" size={40} color={COLORS.textMuted} />
              <Text style={styles.emptyStateTitle}>No attributed clients found</Text>
              <Text style={styles.emptyStateText}>
                Assign lead sources to clients to see their journeys here
              </Text>
            </View>
          )}
        </>
      )}

      {/* ===== ASSIGN TAB ===== */}
      {activeTab === 'assign' && (
        <>
          <View style={styles.assignHeader}>
            <Ionicons name="information-circle" size={18} color={COLORS.info} />
            <Text style={styles.assignHeaderText}>
              {unattributed.length} client{unattributed.length !== 1 ? 's' : ''} without lead source attribution.
              Assign a marketing channel to track their journey.
            </Text>
          </View>

          <View style={styles.filterRow}>
            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={16} color={COLORS.textMuted} />
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search unattributed clients..."
                placeholderTextColor={COLORS.textMuted}
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {filteredUnattributed.length > 0 ? (
            <View style={styles.unattributedList}>
              {filteredUnattributed.map(client => (
                <View key={client.id} style={styles.unattributedCard}>
                  <View style={styles.unattributedInfo}>
                    <View style={styles.unattributedAvatar}>
                      <Text style={styles.unattributedAvatarText}>
                        {client.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.unattributedName} numberOfLines={1}>{client.full_name}</Text>
                      <Text style={styles.unattributedEmail} numberOfLines={1}>{client.email}</Text>
                      {client.franchise && (
                        <Text style={styles.unattributedFranchise}>{client.franchise}</Text>
                      )}
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.assignBtn}
                    onPress={() => {
                      setAssigningClient(client);
                      setAssignDate(client.created_at ? client.created_at.split('T')[0] : '');
                      setAssignConvDate(client.created_at ? client.created_at.split('T')[0] : '');
                    }}
                  >
                    <Ionicons name="link-outline" size={16} color={COLORS.white} />
                    <Text style={styles.assignBtnText}>Assign Source</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-circle-outline" size={40} color={COLORS.success} />
              <Text style={styles.emptyStateTitle}>All clients attributed!</Text>
              <Text style={styles.emptyStateText}>
                Every client has a lead source assigned
              </Text>
            </View>
          )}
        </>
      )}

      {/* Assign Modal */}
      <Modal visible={!!assigningClient} animationType="fade" transparent statusBarTranslucent>
        <View style={styles.assignOverlay}>
          <View style={styles.assignModal}>
            <View style={styles.assignModalHeader}>
              <Text style={styles.assignModalTitle}>Assign Lead Source</Text>
              <TouchableOpacity onPress={() => { setAssigningClient(null); setShowChannelPicker(false); }}>
                <Ionicons name="close" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            {assigningClient && (
              <ScrollView style={{ maxHeight: 400 }}>
                <View style={styles.assignClientInfo}>
                  <Text style={styles.assignClientName}>{assigningClient.full_name}</Text>
                  <Text style={styles.assignClientEmail}>{assigningClient.email}</Text>
                </View>

                <Text style={styles.assignLabel}>Marketing Channel *</Text>
                <TouchableOpacity
                  style={styles.assignPickerBtn}
                  onPress={() => setShowChannelPicker(!showChannelPicker)}
                >
                  <Ionicons name="megaphone-outline" size={16} color={COLORS.textMuted} />
                  <Text style={[styles.assignPickerText, !assignChannelId && { color: COLORS.textMuted }]}>
                    {assignChannelId
                      ? channels.find(c => c.id === assignChannelId)?.name || 'Select...'
                      : 'Select marketing channel'}
                  </Text>
                  <Ionicons name={showChannelPicker ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
                {showChannelPicker && (
                  <View style={styles.assignDropdown}>
                    <ScrollView style={{ maxHeight: 150 }}>
                      {channels.filter(c => c.is_active).map(ch => (
                        <TouchableOpacity
                          key={ch.id}
                          style={[styles.assignDropdownItem, assignChannelId === ch.id && styles.assignDropdownItemActive]}
                          onPress={() => { setAssignChannelId(ch.id); setShowChannelPicker(false); }}
                        >
                          <Text style={[styles.assignDropdownText, assignChannelId === ch.id && styles.assignDropdownTextActive]}>
                            {ch.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                <Text style={styles.assignLabel}>First Touch Date</Text>
                <TextInput
                  style={styles.assignInput}
                  value={assignDate}
                  onChangeText={setAssignDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={COLORS.textMuted}
                />

                <Text style={styles.assignLabel}>Conversion Date</Text>
                <TextInput
                  style={styles.assignInput}
                  value={assignConvDate}
                  onChangeText={setAssignConvDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={COLORS.textMuted}
                />

                <TouchableOpacity
                  style={[styles.assignSaveBtn, (!assignChannelId || assignSaving) && { opacity: 0.5 }]}
                  onPress={handleAssignClient}
                  disabled={!assignChannelId || assignSaving}
                >
                  {assignSaving ? (
                    <ActivityIndicator size="small" color={COLORS.white} />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={18} color={COLORS.white} />
                      <Text style={styles.assignSaveBtnText}>Assign Lead Source</Text>
                    </>
                  )}
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Journey Detail Modal */}
      <ClientJourneyModal
        visible={showJourneyModal}
        onClose={() => { setShowJourneyModal(false); setSelectedJourneyId(null); }}
        clientId={selectedJourneyId}
        onRefresh={loadData}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Tabs
  tabRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    marginBottom: SPACING.md, flexWrap: 'wrap',
  },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: COLORS.border,
  },
  tabActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  tabText: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.textSecondary },
  tabTextActive: { color: COLORS.white },
  tabBadge: {
    backgroundColor: COLORS.borderLight, borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 6, paddingVertical: 1, marginLeft: 2,
  },
  tabBadgeActive: { backgroundColor: 'rgba(255,255,255,0.3)' },
  tabBadgeText: { fontSize: 9, fontWeight: '700', color: COLORS.textMuted },
  tabBadgeTextActive: { color: COLORS.white },
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md, borderWidth: 1,
    borderColor: COLORS.accent + '40', backgroundColor: COLORS.coral50,
  },
  exportBtnText: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.accent },
  // KPI
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.md },
  kpiCard: {
    flex: 1, minWidth: '30%', backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.md,
    alignItems: 'center', gap: 4, ...SHADOWS.sm,
  },
  kpiIconBg: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  kpiValue: { fontSize: FONT_SIZES.xl, fontWeight: '800', color: COLORS.primary },
  kpiLabel: { fontSize: 9, color: COLORS.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  // Funnel
  funnelCard: {
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, gap: SPACING.md, ...SHADOWS.md,
  },
  funnelStep: { alignItems: 'center' },
  funnelBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: BORDER_RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    overflow: 'hidden',
  },
  funnelBarFill: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, borderRadius: 2,
  },
  funnelStepLabel: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.text },
  funnelStepValue: { fontSize: FONT_SIZES.md, fontWeight: '800' },
  // Chart
  chartToggleRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm, flexWrap: 'wrap' },
  chartToggle: {
    paddingHorizontal: SPACING.md, paddingVertical: 5,
    borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: COLORS.border,
  },
  chartToggleActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  chartToggleText: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: COLORS.textSecondary },
  chartToggleTextActive: { color: COLORS.white },
  chartCard: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg, ...SHADOWS.md },
  emptyChart: { alignItems: 'center', paddingVertical: SPACING.xxl, gap: SPACING.sm },
  emptyChartText: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted },
  // Table
  tableCard: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg, overflow: 'hidden', ...SHADOWS.md },
  tableHeader: { flexDirection: 'row', backgroundColor: COLORS.primary, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  tableHeaderText: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.white, textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow: { flexDirection: 'row', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  tableRowAlt: { backgroundColor: COLORS.navy50 + '40' },
  tableCell: { fontSize: FONT_SIZES.xs, color: COLORS.text },
  // Journeys
  filterRow: { marginBottom: SPACING.md },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md, height: 40,
  },
  searchInput: { flex: 1, fontSize: FONT_SIZES.sm, color: COLORS.text },
  channelFilterScroll: { flexGrow: 0, marginBottom: SPACING.md },
  channelChip: {
    paddingHorizontal: SPACING.md, paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: COLORS.border, marginRight: SPACING.sm,
  },
  channelChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  channelChipText: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: COLORS.textSecondary },
  channelChipTextActive: { color: COLORS.white },
  resultCount: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '500', marginBottom: SPACING.sm },
  journeyList: { gap: SPACING.sm },
  journeyCard: {
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, ...SHADOWS.sm,
  },
  journeyCardHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  journeyAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.accent + '20', justifyContent: 'center', alignItems: 'center',
  },
  journeyAvatarText: { fontSize: FONT_SIZES.sm, fontWeight: '800', color: COLORS.accent },
  journeyInfo: { flex: 1 },
  journeyName: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.text },
  journeyEmail: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted },
  journeyLTV: { alignItems: 'flex-end' },
  journeyLTVValue: { fontSize: FONT_SIZES.md, fontWeight: '800' },
  journeyLTVLabel: { fontSize: 9, color: COLORS.textMuted, fontWeight: '600' },
  journeyMeta: {
    flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm,
    marginTop: SPACING.sm, paddingTop: SPACING.sm,
    borderTopWidth: 1, borderTopColor: COLORS.borderLight,
  },
  journeyMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  journeyMetaText: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary },
  // Assign
  assignHeader: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm,
    backgroundColor: COLORS.infoLight, padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md, marginBottom: SPACING.md,
  },
  assignHeaderText: { flex: 1, fontSize: FONT_SIZES.sm, color: COLORS.info, fontWeight: '500', lineHeight: 18 },
  unattributedList: { gap: SPACING.sm },
  unattributedCard: {
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, ...SHADOWS.sm, gap: SPACING.sm,
  },
  unattributedInfo: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  unattributedAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.borderLight, justifyContent: 'center', alignItems: 'center',
  },
  unattributedAvatarText: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.textMuted },
  unattributedName: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.text },
  unattributedEmail: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted },
  unattributedFranchise: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, marginTop: 1 },
  assignBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, backgroundColor: COLORS.accent,
    borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.sm,
  },
  assignBtnText: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.white },
  // Empty
  emptyState: { alignItems: 'center', paddingVertical: SPACING.xxxl, gap: SPACING.sm },
  emptyStateTitle: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.primary },
  emptyStateText: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted, textAlign: 'center', maxWidth: 280 },
  // Assign Modal
  assignOverlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },
  assignModal: {
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl, width: '100%', maxWidth: 420,
    ...SHADOWS.lg,
  },
  assignModalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  assignModalTitle: { fontSize: FONT_SIZES.xl, fontWeight: '800', color: COLORS.primary },
  assignClientInfo: {
    backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, marginBottom: SPACING.lg,
  },
  assignClientName: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.text },
  assignClientEmail: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted, marginTop: 2 },
  assignLabel: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 4, marginTop: SPACING.sm },
  assignPickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md, height: 42,
  },
  assignPickerText: { flex: 1, fontSize: FONT_SIZES.sm, color: COLORS.text },
  assignDropdown: {
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, marginTop: 4, ...SHADOWS.sm,
  },
  assignDropdownItem: {
    paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  assignDropdownItemActive: { backgroundColor: COLORS.brandBlueLight },
  assignDropdownText: { fontSize: FONT_SIZES.sm, color: COLORS.text },
  assignDropdownTextActive: { color: COLORS.accent, fontWeight: '700' },
  assignInput: {
    backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm, fontSize: FONT_SIZES.sm, color: COLORS.text,
  },
  assignSaveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, backgroundColor: COLORS.accent,
    borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.md, marginTop: SPACING.lg,
  },
  assignSaveBtnText: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.white },
});
