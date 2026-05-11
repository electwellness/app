import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutChangeEvent } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES } from '../../constants/theme';

interface DataPoint {
  month: string;
  keyword: string;
  position: number;
}

interface SEOPositionChartProps {
  data: DataPoint[];
  height?: number;
  keywords: string[];
}

// Distinct colors for each keyword line
const LINE_COLORS = [
  '#0E8AC8', // blue
  '#e74c3c', // red
  '#2ecc71', // green
  '#f39c12', // orange
  '#9b59b6', // purple
  '#1abc9c', // teal
  '#e67e22', // dark orange
  '#3498db', // light blue
];

export default function SEOPositionChart({ data, height = 220, keywords }: SEOPositionChartProps) {
  const [chartWidth, setChartWidth] = useState(0);

  // Merge keywords from prop with any additional keywords found in data
  // This ensures we always show all data even if the keywords prop is incomplete
  const allKeywords = useMemo(() => {
    const dataKeywords = [...new Set(data.map(d => d.keyword))];
    const merged = [...keywords];
    for (const kw of dataKeywords) {
      if (!merged.includes(kw)) {
        merged.push(kw);
      }
    }
    return merged;
  }, [data, keywords]);

  // Get unique months sorted chronologically
  const months = useMemo(() => {
    const unique = [...new Set(data.map(d => d.month))].sort();
    return unique;
  }, [data]);

  // Build data map: keyword -> month -> position
  const dataMap = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const d of data) {
      if (!map[d.keyword]) map[d.keyword] = {};
      // Only store positions > 0 (0 means no data)
      if (d.position > 0) {
        map[d.keyword][d.month] = d.position;
      }
    }
    return map;
  }, [data]);

  // Calculate y-axis range (position: lower = better, so 1 at top)
  const { yMin, yMax, yTicks } = useMemo(() => {
    const positions = data.map(d => d.position).filter(p => p > 0);
    if (positions.length === 0) return { yMin: 0, yMax: 100, yTicks: [0, 20, 40, 60, 80, 100] };

    const maxPos = Math.max(...positions);

    // Add padding
    const yMin = 0;
    const rawMax = Math.ceil(maxPos * 1.15);
    // Round up to a nice number
    const yMax = rawMax <= 10 ? 10 : rawMax <= 20 ? 20 : rawMax <= 50 ? 50 : rawMax <= 100 ? 100 : Math.ceil(rawMax / 50) * 50;

    // Generate 5-6 ticks
    const step = yMax <= 10 ? 2 : yMax <= 20 ? 5 : yMax <= 50 ? 10 : yMax <= 100 ? 20 : 50;
    const ticks: number[] = [];
    for (let v = yMin; v <= yMax; v += step) {
      ticks.push(v);
    }
    if (ticks[ticks.length - 1] !== yMax) ticks.push(yMax);

    return { yMin, yMax, yTicks: ticks };
  }, [data]);

  // Chart dimensions
  const leftPadding = 50;
  const rightPadding = 16;
  const topPadding = 16;
  const bottomPadding = 40;
  const plotWidth = Math.max(chartWidth - leftPadding - rightPadding, 1);
  const plotHeight = Math.max(height - topPadding - bottomPadding, 1);

  // Convert position value to Y coordinate (lower position number = higher on chart)
  const getY = (position: number) => {
    const ratio = (position - yMin) / (yMax - yMin || 1);
    return topPadding + ratio * plotHeight;
  };

  // Convert month index to X coordinate
  const getX = (index: number) => {
    if (months.length <= 1) return leftPadding + plotWidth / 2;
    return leftPadding + (index / (months.length - 1)) * plotWidth;
  };

  // Month labels
  const monthLabels = useMemo(() => {
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months.map(m => {
      const parts = m.split('-');
      const monthNum = parts.length >= 2 ? parts[1] : '01';
      return names[parseInt(monthNum) - 1] || monthNum;
    });
  }, [months]);

  // Toggled keywords
  const [hiddenKeywords, setHiddenKeywords] = useState<Set<string>>(new Set());

  const toggleKeyword = (kw: string) => {
    setHiddenKeywords(prev => {
      const next = new Set(prev);
      if (next.has(kw)) next.delete(kw);
      else next.add(kw);
      return next;
    });
  };

  const visibleKeywords = allKeywords.filter(kw => !hiddenKeywords.has(kw));

  const handleLayout = (e: LayoutChangeEvent) => {
    setChartWidth(e.nativeEvent.layout.width);
  };

  // Check if we have any plottable data (at least one keyword with position > 0)
  const hasPlottableData = useMemo(() => {
    return data.some(d => d.position > 0);
  }, [data]);

  if (months.length === 0 || !hasPlottableData) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No position data available. Add SEO data across multiple months to see trends.</Text>
      </View>
    );
  }

  return (
    <View>
      {/* Chart Area */}
      <View style={styles.chartContainer} onLayout={handleLayout}>
        {chartWidth > 0 && (
          <View style={{ width: chartWidth, height }}>
            {/* Y-axis label */}
            <View style={styles.yAxisLabelContainer}>
              <Text style={styles.yAxisLabel}>Keyword Position (1 = Best)</Text>
            </View>

            {/* Grid lines and Y-axis ticks */}
            {yTicks.map((tick, i) => {
              const y = getY(tick);
              return (
                <View key={`tick-${i}`}>
                  {/* Grid line */}
                  <View
                    style={{
                      position: 'absolute',
                      left: leftPadding,
                      top: y,
                      width: plotWidth,
                      height: 1,
                      backgroundColor: COLORS.borderLight,
                    }}
                  />
                  {/* Tick label */}
                  <Text
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: y - 7,
                      width: leftPadding - 6,
                      textAlign: 'right',
                      fontSize: 9,
                      color: COLORS.textMuted,
                      fontWeight: '600',
                    }}
                  >
                    {tick}
                  </Text>
                </View>
              );
            })}

            {/* X-axis month labels */}
            {months.map((m, i) => {
              const x = getX(i);
              // Show every label if <= 12 months, otherwise every other
              const showLabel = months.length <= 12 || i % 2 === 0 || i === months.length - 1;
              if (!showLabel) return null;
              return (
                <Text
                  key={`xlabel-${i}`}
                  style={{
                    position: 'absolute',
                    left: x - 16,
                    top: height - bottomPadding + 8,
                    width: 32,
                    textAlign: 'center',
                    fontSize: 9,
                    color: COLORS.textMuted,
                    fontWeight: '500',
                  }}
                >
                  {monthLabels[i]}
                </Text>
              );
            })}

            {/* Lines and dots for each keyword */}
            {visibleKeywords.map((kw) => {
              const colorIndex = allKeywords.indexOf(kw);
              const color = LINE_COLORS[colorIndex % LINE_COLORS.length];
              const kwData = dataMap[kw] || {};

              // Get points for this keyword (positions already filtered > 0 in dataMap)
              const points: { x: number; y: number; month: string; position: number }[] = [];
              months.forEach((m, i) => {
                if (kwData[m] !== undefined) {
                  points.push({
                    x: getX(i),
                    y: getY(kwData[m]),
                    month: m,
                    position: kwData[m],
                  });
                }
              });

              if (points.length === 0) return null;

              return (
                <View key={kw}>
                  {/* Connecting lines */}
                  {points.map((point, i) => {
                    if (i === points.length - 1) return null;
                    const next = points[i + 1];
                    const dx = next.x - point.x;
                    const dy = next.y - point.y;
                    const length = Math.sqrt(dx * dx + dy * dy);
                    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                    return (
                      <View
                        key={`line-${kw}-${i}`}
                        style={{
                          position: 'absolute',
                          left: point.x,
                          top: point.y,
                          width: length,
                          height: 2.5,
                          backgroundColor: color,
                          borderRadius: 1.25,
                          transform: [{ rotate: `${angle}deg` }],
                          transformOrigin: '0 0',
                          zIndex: 10,
                        }}
                      />
                    );
                  })}

                  {/* Dots */}
                  {points.map((point, i) => (
                    <View
                      key={`dot-${kw}-${i}`}
                      style={{
                        position: 'absolute',
                        left: point.x - 5,
                        top: point.y - 5,
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: color,
                        borderWidth: 2,
                        borderColor: COLORS.white,
                        zIndex: 11,
                      }}
                    />
                  ))}

                  {/* Position labels on dots (show for single-point or last point) */}
                  {points.length === 1 && (
                    <Text
                      style={{
                        position: 'absolute',
                        left: points[0].x - 14,
                        top: points[0].y - 20,
                        fontSize: 9,
                        fontWeight: '700',
                        color: color,
                        textAlign: 'center',
                        width: 28,
                        zIndex: 12,
                      }}
                    >
                      {points[0].position.toFixed(1)}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* Data summary when only 1 month */}
      {months.length === 1 && (
        <View style={styles.singleMonthNote}>
          <Text style={styles.singleMonthNoteText}>
            Showing data for 1 month. Add more months to see trend lines.
          </Text>
        </View>
      )}

      {/* Legend */}
      <View style={styles.legendContainer}>
        {allKeywords.map((kw, i) => {
          const color = LINE_COLORS[i % LINE_COLORS.length];
          const isHidden = hiddenKeywords.has(kw);
          const hasData = !!(dataMap[kw] && Object.keys(dataMap[kw]).length > 0);
          return (
            <TouchableOpacity
              key={kw}
              style={[styles.legendItem, isHidden && styles.legendItemHidden, !hasData && styles.legendItemNoData]}
              onPress={() => toggleKeyword(kw)}
              activeOpacity={0.7}
            >
              <View style={[styles.legendDot, { backgroundColor: isHidden ? COLORS.border : color }]} />
              <Text style={[styles.legendText, isHidden && styles.legendTextHidden]}>{kw}</Text>
              {!hasData && <Text style={styles.legendNoDataBadge}>no data</Text>}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chartContainer: {
    width: '100%',
    overflow: 'hidden',
  },
  yAxisLabelContainer: {
    position: 'absolute',
    left: -2,
    top: -4,
    zIndex: 20,
  },
  yAxisLabel: {
    fontSize: 8,
    color: COLORS.textMuted,
    fontWeight: '700',
    fontStyle: 'italic',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxl,
  },
  emptyText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  singleMonthNote: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  singleMonthNoteText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.md,
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  legendItemHidden: {
    opacity: 0.4,
  },
  legendItemNoData: {
    opacity: 0.5,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.text,
  },
  legendTextHidden: {
    color: COLORS.textMuted,
    textDecorationLine: 'line-through',
  },
  legendNoDataBadge: {
    fontSize: 8,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
});
