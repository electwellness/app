import React, { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Platform, LayoutChangeEvent } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../../constants/theme';

interface ChartDataPoint {
  label: string;
  value: number;
  date: string;
}

interface InteractiveChartProps {
  data: ChartDataPoint[];
  color: string;
  unit?: string;
  height?: number;
  showArea?: boolean;
  metricLabel?: string;
}

export default function InteractiveChart({
  data,
  color,
  unit = '',
  height = 220,
  showArea = true,
  metricLabel = '',
}: InteractiveChartProps) {
  const [tooltipIndex, setTooltipIndex] = useState<number | null>(null);
  const [chartWidth, setChartWidth] = useState(300);
  const containerRef = useRef<View>(null);

  const padding = { top: 16, right: 16, bottom: 32, left: 50 };
  const chartH = height - padding.top - padding.bottom;

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setChartWidth(e.nativeEvent.layout.width);
  }, []);

  if (!data.length) return null;

  // IMPORTANT: we accept 0 and negative values here (e.g. flexibility / sit-and-reach
  // where -2 means "2 in short of toes"). Previously this filtered out 0s which
  // hid legitimate at-toes readings and broke the y-axis scale for any series
  // that included negatives. Only non-finite (NaN/Infinity) values are excluded.
  const values = data.map(d => d.value).filter(v => Number.isFinite(v));
  if (values.length === 0) return null;

  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);

  // Symmetric padding that works for any sign combination, including all-negative
  // series and data that straddles zero. Always reserve a small headroom so a
  // single-point series still renders and so grid lines aren't clipped.
  const span = Math.max(rawMax - rawMin, Math.max(Math.abs(rawMax), Math.abs(rawMin)) * 0.1, 1);
  const pad = span * 0.1;
  const minVal = rawMin - pad;
  const maxVal = rawMax + pad;
  const range = maxVal - minVal || 1;


  const chartW = chartWidth - padding.left - padding.right;

  // Calculate point positions
  const points = data.map((d, i) => ({
    x: padding.left + (i / Math.max(data.length - 1, 1)) * chartW,
    y: padding.top + chartH - ((d.value - minVal) / range) * chartH,
    value: d.value,
    label: d.label,
    date: d.date,
  }));

  // Grid lines (5 horizontal)
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(pct => ({
    y: padding.top + chartH - pct * chartH,
    value: (minVal + pct * range).toFixed(1),
  }));

  // Determine which date labels to show
  const maxLabels = Math.floor(chartW / 60);
  const labelStep = Math.max(1, Math.ceil(data.length / maxLabels));

  const handleMouseMove = (e: any) => {
    if (Platform.OS !== 'web') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    // Find closest point
    let closest = 0;
    let closestDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - mouseX);
      if (dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    });
    setTooltipIndex(closest);
  };

  const handleMouseLeave = () => {
    setTooltipIndex(null);
  };

  const tooltipPoint = tooltipIndex !== null ? points[tooltipIndex] : null;
  const tooltipData = tooltipIndex !== null ? data[tooltipIndex] : null;

  // Format date for tooltip
  const formatTooltipDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  // Web-specific: render using div/svg approach via style
  const webProps = Platform.OS === 'web' ? {
    onMouseMove: handleMouseMove,
    onMouseLeave: handleMouseLeave,
  } : {};

  return (
    <View
      ref={containerRef}
      style={[styles.container, { height }]}
      onLayout={onLayout}
      {...webProps}
    >
      {/* Grid lines */}
      {gridLines.map((line, i) => (
        <View key={i} style={[styles.gridLine, { top: line.y }]}>
          <Text style={styles.gridLabel}>{Number(line.value).toFixed(0)}{unit}</Text>
        </View>
      ))}

      {/* Area fill (gradient effect using multiple semi-transparent layers) */}
      {showArea && points.length > 1 && (
        <View style={[styles.areaContainer, { top: padding.top, height: chartH }]}>
          {points.map((point, i) => {
            if (i === points.length - 1) return null;
            const nextPoint = points[i + 1];
            const minY = Math.min(point.y, nextPoint.y) - padding.top;
            const maxY = chartH;
            return (
              <View
                key={i}
                style={{
                  position: 'absolute',
                  left: point.x,
                  width: nextPoint.x - point.x,
                  top: minY,
                  height: maxY - minY,
                  backgroundColor: color + '08',
                }}
              />
            );
          })}
        </View>
      )}

      {/* Connecting lines */}
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
            }}
          />
        );
      })}

      {/* Data points */}
      {points.map((point, i) => (
        <View
          key={`dot-${i}`}
          style={[
            styles.dot,
            {
              left: point.x - 5,
              top: point.y - 5,
              backgroundColor: tooltipIndex === i ? color : COLORS.white,
              borderColor: color,
              borderWidth: 2.5,
              width: tooltipIndex === i ? 12 : 10,
              height: tooltipIndex === i ? 12 : 10,
              borderRadius: tooltipIndex === i ? 6 : 5,
              marginLeft: tooltipIndex === i ? -1 : 0,
              marginTop: tooltipIndex === i ? -1 : 0,
            },
          ]}
        />
      ))}

      {/* Date labels */}
      {points.map((point, i) => {
        if (i % labelStep !== 0 && i !== points.length - 1) return null;
        return (
          <Text
            key={`label-${i}`}
            style={[
              styles.dateLabel,
              {
                left: point.x - 25,
                top: padding.top + chartH + 8,
                width: 50,
              },
            ]}
            numberOfLines={1}
          >
            {point.label}
          </Text>
        );
      })}

      {/* Vertical hover line */}
      {tooltipPoint && (
        <View
          style={[
            styles.hoverLine,
            {
              left: tooltipPoint.x,
              top: padding.top,
              height: chartH,
            },
          ]}
        />
      )}

      {/* Tooltip */}
      {tooltipPoint && tooltipData && (
        <View
          style={[
            styles.tooltip,
            {
              left: Math.min(
                Math.max(tooltipPoint.x - 70, 8),
                chartWidth - 148
              ),
              top: Math.max(tooltipPoint.y - 70, 0),
            },
          ]}
        >
          <Text style={styles.tooltipValue}>
            {tooltipData.value}{unit}
          </Text>
          {metricLabel ? (
            <Text style={styles.tooltipLabel}>{metricLabel}</Text>
          ) : null}
          <Text style={styles.tooltipDate}>
            {formatTooltipDate(tooltipData.date)}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    width: '100%',
    ...(Platform.OS === 'web' ? { cursor: 'crosshair' } as any : {}),
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: COLORS.borderLight,
  },
  gridLabel: {
    position: 'absolute',
    left: 2,
    top: -7,
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: '600',
    width: 44,
    textAlign: 'right',
  },
  areaContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  dot: {
    position: 'absolute',
    zIndex: 5,
  },
  dateLabel: {
    position: 'absolute',
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: '600',
    textAlign: 'center',
  },
  hoverLine: {
    position: 'absolute',
    width: 1,
    backgroundColor: COLORS.textMuted + '40',
    zIndex: 3,
  },
  tooltip: {
    position: 'absolute',
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm + 2,
    zIndex: 10,
    minWidth: 140,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  tooltipValue: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: '#fff',
  },
  tooltipLabel: {
    fontSize: FONT_SIZES.xs,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
    marginTop: 1,
  },
  tooltipDate: {
    fontSize: FONT_SIZES.xs,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 4,
  },
});
