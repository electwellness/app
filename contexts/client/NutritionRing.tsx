import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, FONT_SIZES, SPACING } from '../../constants/theme';

interface NutritionRingProps {
  label: string;
  current: number;
  goal: number;
  unit: string;
  color: string;
  size?: number;
}

export default function NutritionRing({ label, current, goal, unit, color, size = 80 }: NutritionRingProps) {
  const percentage = Math.min((current / goal) * 100, 100);
  const isOver = current > goal;
  const ringSize = size;
  const strokeWidth = 6;
  const innerSize = ringSize - strokeWidth * 2;

  // Create a visual ring using border trick
  const segments = 20;
  const filledSegments = Math.round((percentage / 100) * segments);

  return (
    <View style={styles.container}>
      <View style={[styles.ring, { width: ringSize, height: ringSize, borderRadius: ringSize / 2 }]}>
        {/* Background ring */}
        <View
          style={[
            styles.ringBg,
            {
              width: ringSize,
              height: ringSize,
              borderRadius: ringSize / 2,
              borderWidth: strokeWidth,
              borderColor: color + '20',
            },
          ]}
        />
        {/* Progress - using a simulated approach with a colored border */}
        <View
          style={[
            styles.ringProgress,
            {
              width: ringSize,
              height: ringSize,
              borderRadius: ringSize / 2,
              borderWidth: strokeWidth,
              borderColor: 'transparent',
              borderTopColor: color,
              borderRightColor: percentage > 25 ? color : 'transparent',
              borderBottomColor: percentage > 50 ? color : 'transparent',
              borderLeftColor: percentage > 75 ? color : 'transparent',
              transform: [{ rotate: '-45deg' }],
            },
          ]}
        />
        {/* Inner content */}
        <View style={[styles.innerCircle, { width: innerSize, height: innerSize, borderRadius: innerSize / 2 }]}>
          <Text style={[styles.value, { color: isOver ? COLORS.danger : color }]} numberOfLines={1}>
            {current}
          </Text>
          <Text style={styles.unit}>{unit}</Text>
        </View>
      </View>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.goalText, isOver && { color: COLORS.danger }]}>
        {isOver ? `+${current - goal}` : `${goal - current} left`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 4,
  },
  ring: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringBg: {
    position: 'absolute',
  },
  ringProgress: {
    position: 'absolute',
  },
  innerCircle: {
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  value: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
  },
  unit: {
    fontSize: 8,
    color: COLORS.textMuted,
    fontWeight: '600',
    marginTop: -2,
  },
  label: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 2,
  },
  goalText: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
});
