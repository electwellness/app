import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../../constants/theme';

interface DataPoint {
  label: string;
  value: number;
  secondaryValue?: number;
}

interface SimpleChartProps {
  data: DataPoint[];
  color?: string;
  secondaryColor?: string;
  height?: number;
  showValues?: boolean;
  type?: 'bar' | 'line';
  unit?: string;
}

export default function SimpleChart({
  data,
  color = COLORS.accent,
  secondaryColor = COLORS.border,
  height = 140,
  showValues = true,
  type = 'bar',
  unit = '',
}: SimpleChartProps) {
  const [chartWidth, setChartWidth] = useState(0);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setChartWidth(e.nativeEvent.layout.width);
  }, []);

  if (!data.length) return null;

  // Collect all plotted values. Previously `secondaryValue || 0` injected a
  // phantom 0 when secondaryValue was undefined, which could drag the axis
  // minimum down to 0 and clip series that never touch zero (or that contain
  // legitimate negatives like flexibility). Now we only include defined values.
  const primary = data.map(d => d.value).filter(v => Number.isFinite(v));
  const secondary = data
    .map(d => d.secondaryValue)
    .filter((v): v is number => v !== undefined && Number.isFinite(v));
  const allValues = [...primary, ...secondary];
  const rawMin = allValues.length ? Math.min(...allValues) : 0;
  const rawMax = allValues.length ? Math.max(...allValues) : 1;

  // Sign-safe padding: works for all-positive, all-negative, and straddle-zero
  // series. Using `* 1.1` / `* 0.9` inverted for negatives, so we add an
  // absolute `pad` on each side instead.
  const spanForPad = Math.max(rawMax - rawMin, Math.max(Math.abs(rawMax), Math.abs(rawMin)) * 0.1, 1);
  const axisPad = spanForPad * 0.1;
  const maxVal = rawMax + axisPad;
  const minVal = rawMin - axisPad;
  const range = maxVal - minVal || 1;

  if (type === 'line') {
    const paddingLeft = 40;
    const paddingRight = 8;
    const paddingTop = 16;
    const paddingBottom = 4;
    const drawableW = Math.max(chartWidth - paddingLeft - paddingRight, 0);
    const drawableH = height - paddingTop - paddingBottom;

    // Calculate point positions
    const points = data.map((d, i) => {
      const x = paddingLeft + (data.length > 1 ? (i / (data.length - 1)) * drawableW : drawableW / 2);
      const y = paddingTop + drawableH - ((d.value - minVal) / range) * drawableH;
      return { x, y, value: d.value, label: d.label };
    });

    // Secondary points (if any)
    const secondaryPoints = data.some(d => d.secondaryValue !== undefined)
      ? data.map((d, i) => {
          const val = d.secondaryValue || 0;
          const x = paddingLeft + (data.length > 1 ? (i / (data.length - 1)) * drawableW : drawableW / 2);
          const y = paddingTop + drawableH - ((val - minVal) / range) * drawableH;
          return { x, y, value: val };
        })
      : null;

    // Grid lines
    const gridLines = [0, 0.25, 0.5, 0.75, 1].map(pct => ({
      y: paddingTop + drawableH - pct * drawableH,
      value: Math.round(minVal + pct * range),
    }));

    // Determine which labels to show
    const maxLabels = Math.max(Math.floor(drawableW / 50), 2);
    const labelStep = Math.max(1, Math.ceil(data.length / maxLabels));

    return (
      <View style={[styles.container, { height: height + 28 }]} onLayout={onLayout}>
        {chartWidth > 0 && (
          <>
            {/* Grid lines */}
            {gridLines.map((line, i) => (
              <View key={`grid-${i}`} style={[styles.gridLine, { top: line.y }]}>
                <Text style={styles.gridLabel}>
                  {line.value}{unit}
                </Text>
              </View>
            ))}

            {/* Area fill under the line */}
            {points.length > 1 && points.map((point, i) => {
              if (i === points.length - 1) return null;
              const nextPoint = points[i + 1];
              const topY = Math.min(point.y, nextPoint.y);
              const bottomY = paddingTop + drawableH;
              return (
                <View
                  key={`area-${i}`}
                  style={{
                    position: 'absolute',
                    left: point.x,
                    width: nextPoint.x - point.x,
                    top: topY,
                    height: bottomY - topY,
                    backgroundColor: color + '0A',
                  }}
                />
              );
            })}

            {/* Secondary connecting lines */}
            {secondaryPoints && secondaryPoints.map((point, i) => {
              if (i === secondaryPoints.length - 1) return null;
              const nextPoint = secondaryPoints[i + 1];
              const dx = nextPoint.x - point.x;
              const dy = nextPoint.y - point.y;
              const length = Math.sqrt(dx * dx + dy * dy);
              const angle = Math.atan2(dy, dx) * (180 / Math.PI);
              return (
                <View
                  key={`sline-${i}`}
                  style={{
                    position: 'absolute',
                    left: point.x,
                    top: point.y,
                    width: length,
                    height: 1.5,
                    backgroundColor: secondaryColor,
                    opacity: 0.4,
                    borderRadius: 1,
                    transform: [{ rotate: `${angle}deg` }],
                    transformOrigin: '0 0',
                  }}
                />
              );
            })}

            {/* Secondary dots */}
            {secondaryPoints && secondaryPoints.map((point, i) => (
              <View
                key={`sdot-${i}`}
                style={{
                  position: 'absolute',
                  left: point.x - 3,
                  top: point.y - 3,
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: COLORS.white,
                  borderWidth: 1.5,
                  borderColor: secondaryColor,
                  opacity: 0.5,
                  zIndex: 4,
                }}
              />
            ))}

            {/* Primary connecting lines */}
            {points.map((point, i) => {
              if (i === points.length - 1) return null;
              const nextPoint = points[i + 1];
              const dx = nextPoint.x - point.x;
              const dy = nextPoint.y - point.y;
              const length = Math.sqrt(dx * dx + dy * dy);
              const angle = Math.atan2(dy, dx) * (180 / Math.PI);
              return (
                <View
                  key={`line-${i}`}
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
                    zIndex: 3,
                  }}
                />
              );
            })}

            {/* Primary dots */}
            {points.map((point, i) => (
              <View
                key={`dot-${i}`}
                style={{
                  position: 'absolute',
                  left: point.x - 5,
                  top: point.y - 5,
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: COLORS.white,
                  borderWidth: 2.5,
                  borderColor: color,
                  zIndex: 5,
                }}
              />
            ))}

            {/* Value labels on dots */}
            {showValues && points.map((point, i) => {
              // Only show values on first, last, and every few points to avoid crowding
              const showThis = i === 0 || i === points.length - 1 || (data.length <= 6) || (i % Math.max(1, Math.floor(data.length / 4)) === 0);
              if (!showThis) return null;
              return (
                <Text
                  key={`val-${i}`}
                  style={{
                    position: 'absolute',
                    left: point.x - 25,
                    top: point.y - 20,
                    width: 50,
                    textAlign: 'center',
                    fontSize: 9,
                    fontWeight: '700',
                    color: color,
                    zIndex: 6,
                  }}
                  numberOfLines={1}
                >
                  {point.value}{unit}
                </Text>
              );
            })}

            {/* Date labels */}
            {points.map((point, i) => {
              if (i % labelStep !== 0 && i !== points.length - 1) return null;
              return (
                <Text
                  key={`label-${i}`}
                  style={{
                    position: 'absolute',
                    left: point.x - 22,
                    top: paddingTop + drawableH + 8,
                    width: 44,
                    textAlign: 'center',
                    fontSize: 9,
                    color: COLORS.textMuted,
                    fontWeight: '600',
                  }}
                  numberOfLines={1}
                >
                  {point.label}
                </Text>
              );
            })}
          </>
        )}
      </View>
    );
  }

  // Bar chart
  return (
    <View style={[styles.container, { height: height + 40 }]}>
      <View style={[styles.chartArea, { height }]}>
        <View style={styles.barContainer}>
          {data.map((point, i) => {
            const barHeight = (point.value / maxVal) * height;
            const secondaryHeight = point.secondaryValue
              ? (point.secondaryValue / maxVal) * height
              : 0;
            return (
              <View key={i} style={styles.barGroup}>
                <View style={{ height, justifyContent: 'flex-end', alignItems: 'center' }}>
                  {showValues && (
                    <Text style={[styles.barValue, { color }]}>
                      {point.value}
                    </Text>
                  )}
                  <View style={styles.barPair}>
                    {point.secondaryValue !== undefined && (
                      <View
                        style={[
                          styles.bar,
                          {
                            height: secondaryHeight,
                            backgroundColor: secondaryColor,
                            opacity: 0.4,
                          },
                        ]}
                      />
                    )}
                    <View
                      style={[
                        styles.bar,
                        {
                          height: barHeight,
                          backgroundColor: color,
                        },
                      ]}
                    />
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </View>
      <View style={styles.labelRow}>
        {data.map((point, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.label} numberOfLines={1}>{point.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'relative',
  },
  chartArea: {
    position: 'relative',
    paddingLeft: 40,
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: COLORS.borderLight,
    flexDirection: 'row',
    alignItems: 'center',
  },
  gridLabel: {
    fontSize: 8,
    color: COLORS.textMuted,
    position: 'absolute',
    left: 0,
    width: 36,
    textAlign: 'right',
    top: -6,
  },
  barContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flex: 1,
    gap: 2,
  },
  barGroup: {
    flex: 1,
    alignItems: 'center',
  },
  barPair: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  bar: {
    width: 14,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    minHeight: 2,
  },
  barValue: {
    fontSize: 8,
    fontWeight: '700',
    marginBottom: 2,
  },
  labelRow: {
    flexDirection: 'row',
    paddingLeft: 40,
    marginTop: SPACING.xs,
  },
  label: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
});
