import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import LeaderboardRow from './LeaderboardRow';

interface LeaderboardSectionProps {
  title: string;
  subtitle: string;
  icon: string;
  iconColor: string;
  accentColor: string;
  total: number;
  totalLabel: string;
  count: number;
  items: Array<{
    clientId: string;
    clientName: string;
    franchise: string;
    avatar: string;
    trainer: string;
    change: number;
    previousWeight?: number;
    currentWeight?: number;
    startWeight?: number;
    percentChange?: number;
  }>;
  type: 'loss' | 'gain' | 'yearly';
  initialShowCount?: number;
}

export default function LeaderboardSection({
  title,
  subtitle,
  icon,
  iconColor,
  accentColor,
  total,
  totalLabel,
  count,
  items,
  type,
  initialShowCount = 10,
}: LeaderboardSectionProps) {
  const [showAll, setShowAll] = useState(false);
  const displayItems = showAll ? items : items.slice(0, initialShowCount);
  const hasMore = items.length > initialShowCount;

  if (items.length === 0) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { borderLeftColor: accentColor }]}>
          <View style={[styles.iconCircle, { backgroundColor: accentColor + '15' }]}>
            <Ionicons name={icon as any} size={20} color={iconColor} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
        </View>
        <View style={styles.emptyState}>
          <Ionicons name="analytics-outline" size={32} color={COLORS.textMuted} />
          <Text style={styles.emptyText}>No data available for this period</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Section Header */}
      <View style={[styles.header, { borderLeftColor: accentColor }]}>
        <View style={[styles.iconCircle, { backgroundColor: accentColor + '15' }]}>
          <Ionicons name={icon as any} size={20} color={iconColor} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
      </View>

      {/* Summary Card */}
      <View style={[styles.summaryCard, { borderColor: accentColor + '30' }]}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>{totalLabel}</Text>
            <Text style={[styles.summaryValue, { color: accentColor }]}>
              {total.toFixed(1)} lbs
            </Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Clients</Text>
            <Text style={[styles.summaryValue, { color: COLORS.primary }]}>
              {count}
            </Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Avg / Client</Text>
            <Text style={[styles.summaryValue, { color: accentColor }]}>
              {count > 0 ? (total / count).toFixed(1) : '0'} lbs
            </Text>
          </View>
        </View>
      </View>

      {/* Leaderboard List */}
      <View style={styles.listContainer}>
        {/* Column Headers */}
        <View style={styles.columnHeaders}>
          <Text style={[styles.colHeader, { width: 30 }]}>#</Text>
          <Text style={[styles.colHeader, { width: 38 }]}></Text>
          <Text style={[styles.colHeader, { flex: 1 }]}>Client</Text>
          <Text style={[styles.colHeader, { width: 90, textAlign: 'right' }]}>Change</Text>
        </View>

        {displayItems.map((item, index) => (
          <LeaderboardRow
            key={item.clientId}
            rank={index + 1}
            name={item.clientName}
            franchise={item.franchise}
            avatar={item.avatar}
            trainer={item.trainer}
            change={item.change}
            previousWeight={item.previousWeight}
            currentWeight={item.currentWeight}
            startWeight={item.startWeight}
            percentChange={item.percentChange}
            type={type}
          />
        ))}

        {hasMore && (
          <TouchableOpacity
            style={styles.showMoreBtn}
            onPress={() => setShowAll(!showAll)}
          >
            <Ionicons
              name={showAll ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={COLORS.accent}
            />
            <Text style={styles.showMoreText}>
              {showAll ? 'Show Less' : `Show All ${items.length} Clients`}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.md,
    paddingLeft: SPACING.md,
    borderLeftWidth: 3,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.primary,
  },
  subtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  summaryCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    ...SHADOWS.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '800',
  },
  summaryDivider: {
    width: 1,
    height: 36,
    backgroundColor: COLORS.borderLight,
  },
  listContainer: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    ...SHADOWS.md,
  },
  columnHeaders: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  colHeader: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.white,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  showMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    backgroundColor: COLORS.navy50 + '60',
  },
  showMoreText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.accent,
  },
  emptyState: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xxxl,
    alignItems: 'center',
    gap: SPACING.sm,
    ...SHADOWS.sm,
  },
  emptyText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
  },
});
