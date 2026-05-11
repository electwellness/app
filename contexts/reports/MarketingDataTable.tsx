import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import { MarketingEntry, MonthlyTotals, formatCurrency } from '../../lib/marketingService';

interface MarketingDataTableProps {
  entries: MarketingEntry[];
  totals: MonthlyTotals;
  onEdit: (entry: MarketingEntry) => void;
  onDelete: (entry: MarketingEntry) => void;
}

type SortField = 'channel_name' | 'investment' | 'leads' | 'clients' | 'revenue' | 'roi' | 'profit';

export default function MarketingDataTable({ entries, totals, onEdit, onDelete }: MarketingDataTableProps) {
  const [sortField, setSortField] = useState<SortField>('investment');
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sortedEntries = [...entries].sort((a, b) => {
    const aVal = a[sortField] ?? 0;
    const bVal = b[sortField] ?? 0;
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return sortAsc ? (Number(aVal) - Number(bVal)) : (Number(bVal) - Number(aVal));
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => (
    <Ionicons
      name={sortField === field ? (sortAsc ? 'arrow-up' : 'arrow-down') : 'swap-vertical'}
      size={10}
      color={sortField === field ? COLORS.accent : COLORS.textMuted}
    />
  );

  if (entries.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="document-text-outline" size={40} color={COLORS.textMuted} />
        <Text style={styles.emptyTitle}>No Data Yet</Text>
        <Text style={styles.emptySubtitle}>Add marketing entries for this month to see performance data</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Table Header */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={styles.tableHeader}>
            <TouchableOpacity style={[styles.headerCell, { width: 140 }]} onPress={() => handleSort('channel_name')}>
              <Text style={styles.headerText}>Channel</Text>
              <SortIcon field="channel_name" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.headerCell, { width: 90 }]} onPress={() => handleSort('investment')}>
              <Text style={styles.headerText}>Invest.</Text>
              <SortIcon field="investment" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.headerCell, { width: 60 }]} onPress={() => handleSort('leads')}>
              <Text style={styles.headerText}>Leads</Text>
              <SortIcon field="leads" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.headerCell, { width: 65 }]} onPress={() => handleSort('clients')}>
              <Text style={styles.headerText}>Clients</Text>
              <SortIcon field="clients" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.headerCell, { width: 90 }]} onPress={() => handleSort('revenue')}>
              <Text style={styles.headerText}>Revenue</Text>
              <SortIcon field="revenue" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.headerCell, { width: 70 }]} onPress={() => handleSort('roi')}>
              <Text style={styles.headerText}>ROI</Text>
              <SortIcon field="roi" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.headerCell, { width: 90 }]} onPress={() => handleSort('profit')}>
              <Text style={styles.headerText}>Profit</Text>
              <SortIcon field="profit" />
            </TouchableOpacity>
            <View style={[styles.headerCell, { width: 60 }]}>
              <Text style={styles.headerText}>Actions</Text>
            </View>
          </View>

          {/* Data Rows */}
          {sortedEntries.map((entry, i) => (
            <View key={entry.id}>
              <TouchableOpacity
                style={[styles.dataRow, i % 2 === 0 && styles.dataRowAlt]}
                onPress={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                activeOpacity={0.7}
              >
                <View style={[styles.dataCell, { width: 140 }]}>
                  <Text style={styles.channelText} numberOfLines={1}>{entry.channel_name}</Text>
                </View>
                <View style={[styles.dataCell, { width: 90 }]}>
                  <Text style={styles.cellText}>{formatCurrency(Number(entry.investment))}</Text>
                </View>
                <View style={[styles.dataCell, { width: 60 }]}>
                  <Text style={styles.cellText}>{entry.leads}</Text>
                </View>
                <View style={[styles.dataCell, { width: 65 }]}>
                  <Text style={styles.cellText}>{entry.clients}</Text>
                </View>
                <View style={[styles.dataCell, { width: 90 }]}>
                  <Text style={[styles.cellText, { fontWeight: '700' }]}>{formatCurrency(Number(entry.revenue))}</Text>
                </View>
                <View style={[styles.dataCell, { width: 70 }]}>
                  <View style={[styles.roiBadge, { backgroundColor: entry.roi >= 0 ? COLORS.successLight : COLORS.dangerLight }]}>
                    <Text style={[styles.roiText, { color: entry.roi >= 0 ? COLORS.success : COLORS.danger }]}>
                      {entry.roi.toFixed(0)}%
                    </Text>
                  </View>
                </View>
                <View style={[styles.dataCell, { width: 90 }]}>
                  <Text style={[styles.cellText, { color: entry.profit >= 0 ? COLORS.success : COLORS.danger, fontWeight: '700' }]}>
                    {formatCurrency(entry.profit)}
                  </Text>
                </View>
                <View style={[styles.dataCell, { width: 60, flexDirection: 'row', gap: 4 }]}>
                  <TouchableOpacity style={styles.rowActionBtn} onPress={() => onEdit(entry)}>
                    <Ionicons name="pencil" size={13} color={COLORS.accent} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.rowActionBtn} onPress={() => onDelete(entry)}>
                    <Ionicons name="trash" size={13} color={COLORS.danger} />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>

              {/* Expanded Detail Row */}
              {expandedId === entry.id && (
                <View style={styles.expandedRow}>
                  <View style={styles.expandedMetrics}>
                    <View style={styles.expandedMetric}>
                      <Text style={styles.expandedLabel}>Lead Cost</Text>
                      <Text style={styles.expandedValue}>${entry.lead_cost.toFixed(2)}</Text>
                    </View>
                    <View style={styles.expandedMetric}>
                      <Text style={styles.expandedLabel}>Conv. Rate</Text>
                      <Text style={styles.expandedValue}>{entry.conversion_rate.toFixed(1)}%</Text>
                    </View>
                    <View style={styles.expandedMetric}>
                      <Text style={styles.expandedLabel}>Cost/Client</Text>
                      <Text style={styles.expandedValue}>${entry.cost_per_client.toFixed(2)}</Text>
                    </View>
                    <View style={styles.expandedMetric}>
                      <Text style={styles.expandedLabel}>Rev/Client</Text>
                      <Text style={styles.expandedValue}>${entry.revenue_per_client.toFixed(2)}</Text>
                    </View>
                  </View>
                  {entry.notes && (
                    <View style={styles.notesRow}>
                      <Ionicons name="document-text" size={12} color={COLORS.textMuted} />
                      <Text style={styles.notesText}>{entry.notes}</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          ))}

          {/* Totals Row */}
          <View style={styles.totalsRow}>
            <View style={[styles.dataCell, { width: 140 }]}>
              <Text style={styles.totalsLabel}>TOTALS</Text>
            </View>
            <View style={[styles.dataCell, { width: 90 }]}>
              <Text style={styles.totalsValue}>{formatCurrency(totals.investment)}</Text>
            </View>
            <View style={[styles.dataCell, { width: 60 }]}>
              <Text style={styles.totalsValue}>{totals.leads}</Text>
            </View>
            <View style={[styles.dataCell, { width: 65 }]}>
              <Text style={styles.totalsValue}>{totals.clients}</Text>
            </View>
            <View style={[styles.dataCell, { width: 90 }]}>
              <Text style={styles.totalsValue}>{formatCurrency(totals.revenue)}</Text>
            </View>
            <View style={[styles.dataCell, { width: 70 }]}>
              <View style={[styles.roiBadge, { backgroundColor: totals.roi >= 0 ? COLORS.success + '30' : COLORS.danger + '30' }]}>
                <Text style={[styles.roiText, { color: totals.roi >= 0 ? COLORS.success : COLORS.danger, fontWeight: '800' }]}>
                  {totals.roi.toFixed(0)}%
                </Text>
              </View>
            </View>
            <View style={[styles.dataCell, { width: 90 }]}>
              <Text style={[styles.totalsValue, { color: totals.profit >= 0 ? COLORS.success : COLORS.danger }]}>
                {formatCurrency(totals.profit)}
              </Text>
            </View>
            <View style={[styles.dataCell, { width: 60 }]} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    ...SHADOWS.md,
  },
  emptyContainer: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xxxl,
    alignItems: 'center',
    gap: SPACING.sm,
    ...SHADOWS.sm,
  },
  emptyTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.primary,
  },
  emptySubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm,
  },
  headerCell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 6,
  },
  headerText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.white,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  dataRow: {
    flexDirection: 'row',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  dataRowAlt: {
    backgroundColor: COLORS.navy50 + '30',
  },
  dataCell: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  channelText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.text,
  },
  cellText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.text,
    fontWeight: '500',
  },
  roiBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },
  roiText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
  },
  rowActionBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandedRow: {
    backgroundColor: COLORS.brandBlue50,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  expandedMetrics: {
    flexDirection: 'row',
    gap: SPACING.md,
    flexWrap: 'wrap',
  },
  expandedMetric: {
    alignItems: 'center',
    minWidth: 80,
  },
  expandedLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  expandedValue: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.primary,
  },
  notesRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  notesText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    flex: 1,
    fontStyle: 'italic',
  },
  totalsRow: {
    flexDirection: 'row',
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.primary + '10',
    borderTopWidth: 2,
    borderTopColor: COLORS.primary,
  },
  totalsLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 1,
  },
  totalsValue: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '800',
    color: COLORS.primary,
  },
});
