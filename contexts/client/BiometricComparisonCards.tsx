import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import {
  biometricMeta,
  hasMetricValue,
  isZeroAllowedMetric,
  formatFlexibility,
  formatFlexibilityShort,
} from '../../data/clientPortalData';
import type { BiometricEntry } from '../../data/clientPortalData';

interface BiometricComparisonCardsProps {
  data: BiometricEntry[];
  selectedMetrics: string[];
}

export default function BiometricComparisonCards({
  data,
  selectedMetrics,
}: BiometricComparisonCardsProps) {
  if (data.length < 2) return null;

  const first = data[0];
  const last = data[data.length - 1];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="swap-horizontal-outline" size={16} color={COLORS.accent} />
        <Text style={styles.headerText}>Progress Comparison</Text>
        <Text style={styles.headerSubtext}>
          {formatDate(first.date)} vs {formatDate(last.date)}
        </Text>
      </View>

      <View style={styles.grid}>
        {selectedMetrics.map(key => {
          const meta = biometricMeta[key];
          if (!meta) return null;

          const rawStart = first[key as keyof BiometricEntry];
          const rawCurrent = last[key as keyof BiometricEntry];
          const startVal = typeof rawStart === 'number' && Number.isFinite(rawStart) ? rawStart : 0;
          const currentVal = typeof rawCurrent === 'number' && Number.isFinite(rawCurrent) ? rawCurrent : 0;

          // For ordinary metrics, a 0/0 pair means nothing was recorded so we
          // hide the card. For zero-allowed metrics (flexibility) 0 is a real
          // at-toes reading and the card must remain visible — we only hide
          // when BOTH readings are truly missing.
          const hasStart = hasMetricValue(key, rawStart as any);
          const hasCurrent = hasMetricValue(key, rawCurrent as any);
          if (!hasStart && !hasCurrent) return null;

          const change = currentVal - startVal;
          // Percent change is meaningless when the starting value is 0 or
          // crosses zero (e.g. flexibility −2 → +2 gives a division-by-zero or
          // a nonsensical −200% result). Suppress the pct badge in those cases.
          const pctMeaningful = startVal !== 0 && Math.sign(startVal) === Math.sign(currentVal || startVal);
          const pctChange = pctMeaningful ? (change / Math.abs(startVal)) * 100 : 0;
          const isGood = meta.goodDirection === 'down' ? change < 0 : change > 0;
          const isNeutral = change === 0;

          // Flexibility-aware display strings
          const isFlex = key === 'flexibility';
          const startText = isFlex ? formatFlexibilityShort(startVal) : `${startVal}`;
          const currentText = isFlex ? formatFlexibilityShort(currentVal) : `${currentVal}`;
          const unitSuffix = isFlex ? '' : meta.unit; // "in" is already inside formatFlexibilityShort
          const changeText = isFlex
            ? `${change > 0 ? '+' : ''}${change.toFixed(1)} in`
            : `${change > 0 ? '+' : ''}${change.toFixed(1)} ${meta.unit}`;

          return (
            <View key={key} style={styles.card}>
              {/* Metric Header */}
              <View style={styles.cardHeader}>
                <View style={[styles.metricIcon, { backgroundColor: meta.color + '15' }]}>
                  <Ionicons name={meta.icon as any} size={14} color={meta.color} />
                </View>
                <Text style={styles.metricName} numberOfLines={1}>{meta.label}</Text>
              </View>

              {/* Values Row */}
              <View style={styles.valuesRow}>
                <View style={styles.valueBlock}>
                  <Text style={styles.valueLabel}>Start</Text>
                  <Text style={styles.valueNum}>{startText}</Text>
                  {unitSuffix ? <Text style={styles.valueUnit}>{unitSuffix}</Text> : null}
                </View>

                <View style={styles.arrowContainer}>
                  <Ionicons name="arrow-forward" size={14} color={COLORS.textMuted} />
                </View>

                <View style={styles.valueBlock}>
                  <Text style={styles.valueLabel}>Current</Text>
                  <Text style={[styles.valueNum, { color: meta.color }]}>{currentText}</Text>
                  {unitSuffix ? <Text style={styles.valueUnit}>{unitSuffix}</Text> : null}
                </View>
              </View>

              {/* Flexibility context line so users see "short of / past toes" */}
              {isFlex && (
                <Text style={{
                  fontSize: 10,
                  color: COLORS.textMuted,
                  fontWeight: '600',
                  textAlign: 'center',
                  marginBottom: SPACING.sm,
                }}>
                  {formatFlexibility(startVal)} → {formatFlexibility(currentVal)}
                </Text>
              )}

              {/* Change Badge */}
              <View style={styles.changeRow}>
                <View
                  style={[
                    styles.changeBadge,
                    {
                      backgroundColor: isNeutral
                        ? COLORS.borderLight
                        : isGood
                        ? '#2ecc7115'
                        : '#e74c3c15',
                    },
                  ]}
                >
                  {!isNeutral && (
                    <Ionicons
                      name={change > 0 ? 'trending-up' : 'trending-down'}
                      size={12}
                      color={isGood ? '#2ecc71' : '#e74c3c'}
                    />
                  )}
                  <Text
                    style={[
                      styles.changeText,
                      {
                        color: isNeutral
                          ? COLORS.textMuted
                          : isGood
                          ? '#2ecc71'
                          : '#e74c3c',
                      },
                    ]}
                  >
                    {changeText}
                  </Text>
                </View>

                {pctMeaningful && (
                  <View
                    style={[
                      styles.pctBadge,
                      {
                        backgroundColor: isNeutral
                          ? COLORS.borderLight
                          : isGood
                          ? '#2ecc7115'
                          : '#e74c3c15',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.pctText,
                        {
                          color: isNeutral
                            ? COLORS.textMuted
                            : isGood
                            ? '#2ecc71'
                            : '#e74c3c',
                        },
                      ]}
                    >
                      {pctChange > 0 ? '+' : ''}
                      {pctChange.toFixed(1)}%
                    </Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}


function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    flexWrap: 'wrap',
  },
  headerText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: COLORS.text,
  },
  headerSubtext: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    minWidth: 160,
    flexGrow: 1,
    flexBasis: '45%',
    ...SHADOWS.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: SPACING.sm,
  },
  metricIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  metricName: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
  },
  valuesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  valueBlock: {
    alignItems: 'center',
    flex: 1,
  },
  valueLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  valueNum: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: COLORS.text,
  },
  valueUnit: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  arrowContainer: {
    paddingHorizontal: 4,
    paddingTop: 10,
  },
  changeRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  changeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
    flex: 1,
    justifyContent: 'center',
  },
  changeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
  },
  pctBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
  },
  pctText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
  },
});
