import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';

interface LeaderboardRowProps {
  rank: number;
  name: string;
  franchise: string;
  avatar: string;
  trainer: string;
  change: number; // negative = loss, positive = gain
  previousWeight?: number;
  currentWeight?: number;
  startWeight?: number;
  percentChange?: number;
  type: 'loss' | 'gain' | 'yearly';
}

export default function LeaderboardRow({
  rank,
  name,
  franchise,
  avatar,
  trainer,
  change,
  previousWeight,
  currentWeight,
  startWeight,
  percentChange,
  type,
}: LeaderboardRowProps) {
  const isTopThree = rank <= 3;
  const absChange = Math.abs(change);

  const getRankStyle = () => {
    switch (rank) {
      case 1: return { backgroundColor: '#FFD700', borderColor: '#DAA520' };
      case 2: return { backgroundColor: '#C0C0C0', borderColor: '#A0A0A0' };
      case 3: return { backgroundColor: '#CD7F32', borderColor: '#A0522D' };
      default: return { backgroundColor: COLORS.navy50, borderColor: COLORS.border };
    }
  };

  const getRankIcon = () => {
    if (rank === 1) return 'trophy';
    if (rank === 2) return 'medal';
    if (rank === 3) return 'ribbon';
    return null;
  };

  const changeColor = type === 'gain' ? COLORS.success : COLORS.accent;
  const changeIcon = type === 'gain' ? 'arrow-up' : 'arrow-down';

  return (
    <View style={[styles.container, isTopThree && styles.containerHighlight]}>
      {/* Rank Badge */}
      <View style={[styles.rankBadge, getRankStyle()]}>
        {isTopThree && getRankIcon() ? (
          <Ionicons name={getRankIcon() as any} size={14} color={rank === 1 ? '#8B6914' : rank === 2 ? '#666' : '#5C3317'} />
        ) : (
          <Text style={styles.rankText}>{rank}</Text>
        )}
      </View>

      {/* Avatar */}
      <Image source={{ uri: avatar }} style={styles.avatar} />

      {/* Client Info */}
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        <View style={styles.metaRow}>
          <Ionicons name="business-outline" size={10} color={COLORS.textMuted} />
          <Text style={styles.metaText} numberOfLines={1}>{franchise}</Text>
        </View>
        <View style={styles.metaRow}>
          <Ionicons name="fitness-outline" size={10} color={COLORS.textMuted} />
          <Text style={styles.metaText} numberOfLines={1}>{trainer}</Text>
        </View>
      </View>

      {/* Weight Details */}
      <View style={styles.weightCol}>
        <View style={styles.changeRow}>
          <Ionicons name={changeIcon} size={14} color={changeColor} />
          <Text style={[styles.changeValue, { color: changeColor }]}>
            {absChange.toFixed(1)} lbs
          </Text>
        </View>
        {previousWeight != null && currentWeight != null && (
          <Text style={styles.weightRange}>
            {previousWeight.toFixed(0)} → {currentWeight.toFixed(0)}
          </Text>
        )}
        {startWeight != null && currentWeight != null && type === 'yearly' && (
          <Text style={styles.weightRange}>
            {startWeight.toFixed(0)} → {currentWeight.toFixed(0)}
          </Text>
        )}
        {percentChange != null && (
          <Text style={[styles.percentText, { color: changeColor }]}>
            {percentChange > 0 ? '+' : ''}{percentChange.toFixed(1)}%
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    gap: SPACING.sm,
  },
  containerHighlight: {
    backgroundColor: '#FFFEF5',
  },
  rankBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
  },
  rankText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '800',
    color: COLORS.textSecondary,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.borderLight,
  },
  info: {
    flex: 1,
    gap: 1,
  },
  name: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.primary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaText: {
    fontSize: 9,
    color: COLORS.textMuted,
    flex: 1,
  },
  weightCol: {
    alignItems: 'flex-end',
    minWidth: 90,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  changeValue: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
  },
  weightRange: {
    fontSize: 9,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  percentText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    marginTop: 1,
  },
});
