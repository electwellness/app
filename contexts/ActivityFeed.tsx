import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES } from '../constants/theme';

interface ActivityItem {
  id: string;
  type: string;
  message: string;
  time: string;
  icon: string;
}

interface ActivityFeedProps {
  activities: ActivityItem[];
  loading?: boolean;
  error?: string | null;
}

const TYPE_COLORS: Record<string, string> = {
  client_joined: COLORS.info,
  milestone: '#f39c12',
  revenue: COLORS.success,
  alert: COLORS.danger,
  trainer: COLORS.accent,
  review: '#f39c12',
};

export default function ActivityFeed({ activities, loading, error }: ActivityFeedProps) {
  // Loading state
  if (loading) {
    return (
      <View style={styles.stateContainer}>
        <ActivityIndicator size="small" color={COLORS.accent} />
        <Text style={styles.stateText}>Loading recent activity...</Text>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View style={styles.stateContainer}>
        <View style={styles.stateIconCircle}>
          <Ionicons name="warning-outline" size={24} color={COLORS.danger} />
        </View>
        <Text style={styles.stateTitle}>Unable to load activity</Text>
        <Text style={styles.stateText}>{error}</Text>
      </View>
    );
  }

  // Empty state
  if (!activities || activities.length === 0) {
    return (
      <View style={styles.stateContainer}>
        <View style={[styles.stateIconCircle, { backgroundColor: COLORS.info + '15' }]}>
          <Ionicons name="time-outline" size={24} color={COLORS.info} />
        </View>
        <Text style={styles.stateTitle}>No recent activity</Text>
        <Text style={styles.stateText}>
          Activity will appear here as contacts are added, statuses change, reviews come in, and more.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {activities.map((item, index) => (
        <View key={item.id} style={styles.item}>
          <View style={styles.timeline}>
            <View style={[styles.iconCircle, { backgroundColor: (TYPE_COLORS[item.type] || COLORS.info) + '18' }]}>
              <Ionicons name={item.icon as any} size={14} color={TYPE_COLORS[item.type] || COLORS.info} />
            </View>
            {index < activities.length - 1 && <View style={styles.line} />}
          </View>
          <View style={styles.content}>
            <Text style={styles.message}>{item.message}</Text>
            <Text style={styles.time}>{item.time}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingLeft: SPACING.xs,
  },
  item: {
    flexDirection: 'row',
    gap: SPACING.md,
    minHeight: 50,
  },
  timeline: {
    alignItems: 'center',
    width: 32,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  line: {
    width: 2,
    flex: 1,
    backgroundColor: COLORS.borderLight,
    marginVertical: 4,
  },
  content: {
    flex: 1,
    paddingBottom: SPACING.lg,
  },
  message: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: '500',
    lineHeight: 18,
  },
  time: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  // Loading / Empty / Error states
  stateContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.lg,
  },
  stateIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.danger + '12',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  stateTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 4,
    textAlign: 'center',
  },
  stateText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
    textAlign: 'center',
    lineHeight: 16,
  },
});
