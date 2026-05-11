import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Animated, Easing, LayoutAnimation, Platform, UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import { Sparkline } from '../MiniChart';
import {
  SevenStrategiesEntry, ComputedStrategies,
  computeStrategies, getEntriesForMonths, getEntries,
  getMonthLabel, getPreviousMonths, getPreviousMonth,
  formatCurrency, formatPercent, sanitizeEntry,
} from '../../lib/sevenStrategiesService';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ============ TYPES ============

interface TrendComparisonSectionProps {
  selectedMonth: string;
  selectedFranchise: string; // 'all' or franchise_id
  /** Number of months to look back (default 6) */
  monthCount?: number;
}

interface MonthlyStrategyData {
  month: string;
  label: string;
  computed: ComputedStrategies | null;
  rawTotals: {
    leads: number;
    conversations: number;
    jumpstarts: number;
    newClients: number;
    clientsLost: number;
    totalClients: number;
    revenue: number;
    expenses: number;
  } | null;
}

interface StrategyTrendItem {
  key: string;
  number: number;
  title: string;
  color: string;
  icon: string;
  getValue: (d: MonthlyStrategyData) => number | null;
  format: (v: number) => string;
  isPercent?: boolean;
  isCurrency?: boolean;
  higherIsBetter?: boolean; // default true
}

// ============ STRATEGY DEFINITIONS ============

const STRATEGY_TRENDS: StrategyTrendItem[] = [
  {
    key: 'leads',
    number: 1,
    title: 'Leads Generated',
    color: COLORS.info,
    icon: 'megaphone-outline',
    getValue: (d) => d.rawTotals?.leads ?? null,
    format: (v) => String(Math.round(v)),
    higherIsBetter: true,
  },
  {
    key: 'leadsToConv',
    number: 2,
    title: 'Leads > Conversations',
    color: COLORS.accent,
    icon: 'chatbubbles-outline',
    getValue: (d) => d.computed?.leadsToConversations ?? null,
    format: (v) => formatPercent(v),
    isPercent: true,
    higherIsBetter: true,
  },
  {
    key: 'convToJS',
    number: 3,
    title: 'Conversations > Jumpstarts',
    color: COLORS.warning,
    icon: 'flash-outline',
    getValue: (d) => d.computed?.conversationsToJumpstarts ?? null,
    format: (v) => formatPercent(v),
    isPercent: true,
    higherIsBetter: true,
  },
  {
    key: 'jsToNC',
    number: 4,
    title: 'Jumpstarts > New Clients',
    color: '#9b59b6',
    icon: 'person-add-outline',
    getValue: (d) => d.computed?.jumpstartsToNewClients ?? null,
    format: (v) => formatPercent(v),
    isPercent: true,
    higherIsBetter: true,
  },
  {
    key: 'retention',
    number: 5,
    title: 'Retention',
    color: COLORS.success,
    icon: 'shield-checkmark-outline',
    getValue: (d) => d.computed?.retention ?? null,
    format: (v) => formatPercent(v),
    isPercent: true,
    higherIsBetter: true,
  },
  {
    key: 'ami',
    number: 6,
    title: 'Avg Monthly Investment',
    color: COLORS.primary,
    icon: 'wallet-outline',
    getValue: (d) => d.computed?.avgMonthlyInvestment ?? null,
    format: (v) => formatCurrency(v),
    isCurrency: true,
    higherIsBetter: true,
  },
  {
    key: 'expenseRatio',
    number: 7,
    title: 'Expense Ratio',
    color: COLORS.danger,
    icon: 'pie-chart-outline',
    getValue: (d) => d.computed?.expenseRatio ?? null,
    format: (v) => formatPercent(v),
    isPercent: true,
    higherIsBetter: false, // lower expense ratio is better
  },
];

// ============ DELTA BADGE ============

interface DeltaBadgeProps {
  currentValue: number | null;
  previousValue: number | null;
  isPercent?: boolean;
  isCurrency?: boolean;
  higherIsBetter?: boolean;
  format?: (v: number) => string;
}

function DeltaBadge({ currentValue, previousValue, isPercent, isCurrency, higherIsBetter = true, format }: DeltaBadgeProps) {
  if (currentValue === null || previousValue === null || previousValue === 0) {
    return (
      <View style={[deltaBadgeStyles.badge, { backgroundColor: COLORS.borderLight }]}>
        <Text style={[deltaBadgeStyles.text, { color: COLORS.textMuted }]}>--</Text>
      </View>
    );
  }

  let delta: number;
  let displayText: string;

  if (isPercent) {
    // For percentages, show the point change (e.g., 50% -> 55% = +5.0pp)
    delta = (currentValue - previousValue) * 100;
    const sign = delta >= 0 ? '+' : '';
    displayText = `${sign}${delta.toFixed(1)}pp`;
  } else if (isCurrency) {
    // For currency, show percentage change
    delta = ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
    const sign = delta >= 0 ? '+' : '';
    displayText = `${sign}${delta.toFixed(0)}%`;
  } else {
    // For raw numbers, show percentage change
    delta = ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
    const sign = delta >= 0 ? '+' : '';
    displayText = `${sign}${delta.toFixed(0)}%`;
  }

  const isPositive = delta > 0;
  const isNegative = delta < 0;
  const isNeutral = delta === 0;

  // Determine if this change is good or bad
  let isGood = isNeutral;
  if (isPositive) isGood = higherIsBetter;
  if (isNegative) isGood = !higherIsBetter;

  const bgColor = isNeutral
    ? COLORS.borderLight
    : isGood
      ? COLORS.successLight
      : COLORS.dangerLight;

  const textColor = isNeutral
    ? COLORS.textMuted
    : isGood
      ? COLORS.success
      : COLORS.danger;

  const iconName = isNeutral
    ? 'remove'
    : isPositive
      ? 'trending-up'
      : 'trending-down';

  return (
    <View style={[deltaBadgeStyles.badge, { backgroundColor: bgColor }]}>
      <Ionicons name={iconName as any} size={10} color={textColor} />
      <Text style={[deltaBadgeStyles.text, { color: textColor }]}>{displayText}</Text>
    </View>
  );
}

const deltaBadgeStyles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },
  text: {
    fontSize: 9,
    fontWeight: '700',
  },
});

// ============ TREND ROW ============

interface TrendRowProps {
  strategy: StrategyTrendItem;
  monthlyData: MonthlyStrategyData[];
  expanded: boolean;
  onToggle: () => void;
}

function TrendRow({ strategy, monthlyData, expanded, onToggle }: TrendRowProps) {
  // Extract values for sparkline (oldest to newest)
  const reversedData = [...monthlyData].reverse();
  const sparklineValues = reversedData
    .map(d => strategy.getValue(d))
    .map(v => (v !== null && isFinite(v) ? v : 0));

  // Current and previous month values
  const currentVal = monthlyData.length > 0 ? strategy.getValue(monthlyData[0]) : null;
  const prevVal = monthlyData.length > 1 ? strategy.getValue(monthlyData[1]) : null;

  // Current formatted value
  const currentFormatted = currentVal !== null && isFinite(currentVal)
    ? strategy.format(currentVal)
    : '--';

  // Has enough data for sparkline?
  const hasData = sparklineValues.some(v => v !== 0) && sparklineValues.length >= 2;

  // Split title on ">"
  const hasArrow = strategy.title.includes('>');
  const titleParts = hasArrow ? strategy.title.split('>').map(s => s.trim()) : [strategy.title];

  return (
    <View style={trendRowStyles.container}>
      <TouchableOpacity
        style={trendRowStyles.row}
        onPress={onToggle}
        activeOpacity={0.7}
      >
        {/* Left: Number badge + title */}
        <View style={trendRowStyles.left}>
          <View style={[trendRowStyles.numberBadge, { backgroundColor: strategy.color + '20' }]}>
            <Text style={[trendRowStyles.numberText, { color: strategy.color }]}>{strategy.number}</Text>
          </View>
          <View style={trendRowStyles.titleWrap}>
            {hasArrow ? (
              <>
                <Text style={trendRowStyles.title} numberOfLines={1}>{titleParts[0]}</Text>
                <Text style={trendRowStyles.titleSecondLine} numberOfLines={1}>&gt; {titleParts[1]}</Text>
              </>
            ) : (
              <Text style={trendRowStyles.title} numberOfLines={1}>{strategy.title}</Text>
            )}
          </View>
        </View>

        {/* Center: Sparkline */}
        <View style={trendRowStyles.sparklineWrap}>
          {hasData ? (
            <Sparkline
              data={sparklineValues}
              color={strategy.color}
              height={28}
              width={80}
            />
          ) : (
            <Text style={trendRowStyles.noData}>No trend data</Text>
          )}
        </View>

        {/* Right: Current value + delta badge */}
        <View style={trendRowStyles.right}>
          <Text style={[trendRowStyles.currentValue, { color: strategy.color }]}>{currentFormatted}</Text>
          <DeltaBadge
            currentValue={currentVal}
            previousValue={prevVal}
            isPercent={strategy.isPercent}
            isCurrency={strategy.isCurrency}
            higherIsBetter={strategy.higherIsBetter}
            format={strategy.format}
          />
        </View>
      </TouchableOpacity>

      {/* Expanded detail: month-by-month breakdown */}
      {expanded && (
        <View style={trendRowStyles.expandedContainer}>
          {reversedData.map((md, i) => {
            const val = strategy.getValue(md);
            const formatted = val !== null && isFinite(val) ? strategy.format(val) : '--';
            const prevMd = i > 0 ? reversedData[i - 1] : null;
            const prevMdVal = prevMd ? strategy.getValue(prevMd) : null;

            return (
              <View key={md.month} style={trendRowStyles.expandedRow}>
                <Text style={trendRowStyles.expandedMonth}>{md.label}</Text>
                <View style={trendRowStyles.expandedBarWrap}>
                  <View
                    style={[
                      trendRowStyles.expandedBar,
                      {
                        backgroundColor: strategy.color + '30',
                        width: getBarWidth(val, monthlyData, strategy),
                      },
                    ]}
                  />
                </View>
                <Text style={[trendRowStyles.expandedValue, { color: strategy.color }]}>{formatted}</Text>
                {i > 0 && (
                  <DeltaBadge
                    currentValue={val}
                    previousValue={prevMdVal}
                    isPercent={strategy.isPercent}
                    isCurrency={strategy.isCurrency}
                    higherIsBetter={strategy.higherIsBetter}
                  />
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function getBarWidth(
  val: number | null,
  monthlyData: MonthlyStrategyData[],
  strategy: StrategyTrendItem
): string {
  if (val === null || !isFinite(val)) return '0%';
  const allVals = monthlyData
    .map(d => strategy.getValue(d))
    .filter((v): v is number => v !== null && isFinite(v));
  const maxVal = Math.max(...allVals, 0.001);
  const pct = Math.max(5, (Math.abs(val) / Math.abs(maxVal)) * 100);
  return `${Math.min(pct, 100)}%`;
}

const trendRowStyles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    width: 90,
  },
  numberBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  numberText: {
    fontSize: 8,
    fontWeight: '800',
  },
  titleWrap: {
    flex: 1,
  },
  title: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.text,
  },
  titleSecondLine: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  sparklineWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 28,
  },
  noData: {
    fontSize: 8,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  right: {
    alignItems: 'flex-end',
    gap: 2,
    minWidth: 70,
  },
  currentValue: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '800',
  },
  // Expanded
  expandedContainer: {
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    gap: 6,
    backgroundColor: COLORS.navy50 + '60',
  },
  expandedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  expandedMonth: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textSecondary,
    width: 55,
  },
  expandedBarWrap: {
    flex: 1,
    height: 10,
    backgroundColor: COLORS.borderLight,
    borderRadius: 5,
    overflow: 'hidden',
  },
  expandedBar: {
    height: '100%',
    borderRadius: 5,
  },
  expandedValue: {
    fontSize: 9,
    fontWeight: '700',
    width: 45,
    textAlign: 'right',
  },
});

// ============ MAIN COMPONENT ============

export default function TrendComparisonSection({
  selectedMonth,
  selectedFranchise,
  monthCount = 6,
}: TrendComparisonSectionProps) {
  const [loading, setLoading] = useState(true);
  const [monthlyData, setMonthlyData] = useState<MonthlyStrategyData[]>([]);
  const [expandedStrategy, setExpandedStrategy] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Build the list of months to fetch (including one extra for retention calc)
  const monthsToFetch = useMemo(() => {
    const months: string[] = [];
    const [year, month] = selectedMonth.split('-').map(Number);
    for (let i = 0; i < monthCount; i++) {
      const d = new Date(year, month - 1 - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return months;
  }, [selectedMonth, monthCount]);

  // We also need the month before the oldest month for retention calculations
  const extraPrevMonth = useMemo(() => {
    const oldest = monthsToFetch[monthsToFetch.length - 1];
    if (!oldest) return null;
    const [y, m] = oldest.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, [monthsToFetch]);

  const fetchTrendData = useCallback(async () => {
    setLoading(true);
    try {
      const allMonths = extraPrevMonth
        ? [...monthsToFetch, extraPrevMonth]
        : monthsToFetch;

      const franchiseFilter = selectedFranchise !== 'all' ? selectedFranchise : undefined;
      const allEntries = await getEntriesForMonths(allMonths, franchiseFilter);

      // Sanitize
      const sanitized = allEntries.map(e => sanitizeEntry(e));

      // Group entries by month
      const byMonth = new Map<string, SevenStrategiesEntry[]>();
      for (const entry of sanitized) {
        const existing = byMonth.get(entry.month) || [];
        existing.push(entry);
        byMonth.set(entry.month, existing);
      }

      // Compute aggregated strategies for each month
      const result: MonthlyStrategyData[] = [];

      for (const month of monthsToFetch) {
        const entries = byMonth.get(month) || [];
        const prevMonth = getPreviousMonth(month);
        const prevEntries = byMonth.get(prevMonth) || [];

        if (entries.length === 0) {
          result.push({
            month,
            label: getMonthLabel(month),
            computed: null,
            rawTotals: null,
          });
          continue;
        }

        // Aggregate totals
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

        const prevTotals = prevEntries.reduce(
          (acc, e) => ({ total_client_count: acc.total_client_count + e.total_client_count }),
          { total_client_count: 0 }
        );

        const prevEntry = prevTotals.total_client_count > 0
          ? { total_client_count: prevTotals.total_client_count } as any
          : null;

        const computed = computeStrategies(totals as any, prevEntry);

        result.push({
          month,
          label: getMonthLabel(month),
          computed,
          rawTotals: {
            leads: totals.lead_count,
            conversations: totals.call_count,
            jumpstarts: totals.jumpstart_count,
            newClients: totals.new_client_count,
            clientsLost: totals.clients_lost,
            totalClients: totals.total_client_count,
            revenue: totals.total_revenue,
            expenses: totals.total_expenses,
          },
        });
      }

      setMonthlyData(result);
    } catch (err) {
      console.log('[TrendComparison] Error fetching trend data:', err);
      setMonthlyData([]);
    } finally {
      setLoading(false);
    }
  }, [monthsToFetch, extraPrevMonth, selectedFranchise]);

  useEffect(() => {
    fetchTrendData();
  }, [fetchTrendData]);

  const handleToggleExpand = useCallback((key: string) => {
    if (Platform.OS !== 'web') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setExpandedStrategy(prev => prev === key ? null : key);
  }, []);

  const handleToggleCollapse = useCallback(() => {
    if (Platform.OS !== 'web') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setIsCollapsed(prev => !prev);
  }, []);

  // Count months with data
  const monthsWithData = monthlyData.filter(d => d.computed !== null).length;

  if (loading) {
    return (
      <View style={sectionStyles.loadingContainer}>
        <ActivityIndicator size="small" color={COLORS.accent} />
        <Text style={sectionStyles.loadingText}>Loading trends...</Text>
      </View>
    );
  }

  if (monthsWithData < 2) {
    return (
      <View style={sectionStyles.emptyContainer}>
        <View style={sectionStyles.emptyIconWrap}>
          <Ionicons name="trending-up-outline" size={20} color={COLORS.textMuted} />
        </View>
        <Text style={sectionStyles.emptyText}>
          Need at least 2 months of data to show trends
        </Text>
      </View>
    );
  }

  return (
    <View style={sectionStyles.container}>
      {/* Section Header */}
      <TouchableOpacity
        style={sectionStyles.header}
        onPress={handleToggleCollapse}
        activeOpacity={0.7}
      >
        <View style={sectionStyles.headerLeft}>
          <View style={sectionStyles.headerIconBg}>
            <Ionicons name="trending-up" size={16} color={COLORS.white} />
          </View>
          <View>
            <Text style={sectionStyles.headerTitle}>Month-over-Month Trends</Text>
            <Text style={sectionStyles.headerSubtitle}>
              {monthsWithData} months of data {'\u00B7'} Tap a row for details
            </Text>
          </View>
        </View>
        <Ionicons
          name={isCollapsed ? 'chevron-down' : 'chevron-up'}
          size={18}
          color={COLORS.textMuted}
        />
      </TouchableOpacity>

      {!isCollapsed && (
        <>
          {/* Month labels header */}
          <View style={sectionStyles.monthLabelsRow}>
            <View style={{ width: 90 }} />
            <View style={sectionStyles.monthLabelsCenter}>
              {[...monthlyData].reverse().map((md, i) => (
                <Text
                  key={md.month}
                  style={[
                    sectionStyles.monthLabel,
                    i === monthlyData.length - 1 && { fontWeight: '800', color: COLORS.text },
                  ]}
                  numberOfLines={1}
                >
                  {md.label.replace(' 20', ' ').replace('20', "'")}
                </Text>
              ))}
            </View>
            <View style={{ minWidth: 70 }} />
          </View>

          {/* Strategy trend rows */}
          <View style={sectionStyles.rowsContainer}>
            {STRATEGY_TRENDS.map(strategy => (
              <TrendRow
                key={strategy.key}
                strategy={strategy}
                monthlyData={monthlyData}
                expanded={expandedStrategy === strategy.key}
                onToggle={() => handleToggleExpand(strategy.key)}
              />
            ))}
          </View>

          {/* Summary row */}
          <View style={sectionStyles.summaryRow}>
            <Ionicons name="information-circle-outline" size={14} color={COLORS.textMuted} />
            <Text style={sectionStyles.summaryText}>
              {(() => {
                // Count how many strategies improved vs declined
                let improved = 0;
                let declined = 0;
                for (const strategy of STRATEGY_TRENDS) {
                  const curr = monthlyData.length > 0 ? strategy.getValue(monthlyData[0]) : null;
                  const prev = monthlyData.length > 1 ? strategy.getValue(monthlyData[1]) : null;
                  if (curr !== null && prev !== null && prev !== 0) {
                    const delta = curr - prev;
                    const isGood = strategy.higherIsBetter ? delta > 0 : delta < 0;
                    if (isGood) improved++;
                    else if (delta !== 0) declined++;
                  }
                }
                if (improved > declined) {
                  return `${improved} of 7 strategies improving vs last month`;
                } else if (declined > improved) {
                  return `${declined} of 7 strategies declining vs last month`;
                } else {
                  return `${improved} improving, ${declined} declining vs last month`;
                }
              })()}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  container: {
    marginBottom: SPACING.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
  },
  headerIconBg: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '800',
    color: COLORS.primary,
  },
  headerSubtitle: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: '500',
    marginTop: 1,
  },
  monthLabelsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    marginBottom: 4,
    gap: SPACING.sm,
  },
  monthLabelsCenter: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  monthLabel: {
    fontSize: 7,
    fontWeight: '600',
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  rowsContainer: {
    gap: 6,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    marginTop: SPACING.sm,
    backgroundColor: COLORS.brandBlue50,
    borderRadius: BORDER_RADIUS.md,
  },
  summaryText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontWeight: '600',
    flex: 1,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.lg,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    ...SHADOWS.sm,
  },
  loadingText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  emptyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    ...SHADOWS.sm,
  },
  emptyIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
    flex: 1,
  },
});
