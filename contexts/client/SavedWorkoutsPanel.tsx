import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import {
  fetchWorkoutsByClient,
  deleteWorkout,
  getWorkoutTypeLabel,
  getWorkoutTypeColor,
  type SavedWorkout,
} from '../../lib/savedWorkoutService';
import type { Exercise, Segment } from '../trainer/WorkoutExerciseList';

interface Props {
  clientId: string;
  clientName: string;
}

export default function SavedWorkoutsPanel({ clientId, clientName }: Props) {
  const { profile } = useAuth();
  const [workouts, setWorkouts] = useState<SavedWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const loadedRef = useRef<string | null>(null);

  const loadWorkouts = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchWorkoutsByClient(clientId);
      if (!result.success) {
        setError(result.error || 'Failed to load workouts');
      } else {
        setWorkouts(result.workouts);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load workouts');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    if (clientId && loadedRef.current !== clientId) {
      loadedRef.current = clientId;
      loadWorkouts();
    }
  }, [clientId, loadWorkouts]);

  const handleDelete = useCallback(async (workoutId: string) => {
    const doDelete = async () => {
      setDeletingId(workoutId);
      try {
        const result = await deleteWorkout(workoutId, profile?.id);
        if (result.success) {
          setWorkouts(prev => prev.filter(w => w.id !== workoutId));
          if (expandedId === workoutId) setExpandedId(null);
        } else {
          const msg = result.error || 'Failed to delete workout';
          if (Platform.OS === 'web') {
            alert(msg);
          } else {
            Alert.alert('Delete Failed', msg);
          }
        }
      } catch (err: any) {
        const msg = err.message || 'Failed to delete workout';
        if (Platform.OS === 'web') {
          alert(msg);
        } else {
          Alert.alert('Error', msg);
        }
      } finally {
        setDeletingId(null);
      }
    };

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Delete this workout? This action cannot be undone.')) {
        await doDelete();
      }
    } else {
      Alert.alert(
        'Delete Workout',
        'Are you sure you want to delete this saved workout? This action cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete },
        ]
      );
    }
  }, [profile?.id, expandedId]);

  const canDelete = profile?.role === 'admin' || profile?.role === 'franchise_manager' || profile?.role === 'trainer';

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={COLORS.accent} />
        <Text style={styles.loadingText}>Loading saved workouts...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="cloud-offline-outline" size={24} color={COLORS.danger} />
        <Text style={styles.errorTitle}>Failed to Load Workouts</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => { loadedRef.current = null; loadWorkouts(); }}>
          <Ionicons name="refresh" size={14} color={COLORS.accent} />
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (workouts.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIcon}>
          <Ionicons name="barbell-outline" size={32} color={COLORS.textMuted} />
        </View>
        <Text style={styles.emptyTitle}>No Saved Workouts</Text>
        <Text style={styles.emptyText}>
          Workouts generated from the AI Workout Generator can be saved here for {clientName.split(' ')[0]}.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{workouts.length}</Text>
          </View>
          <Text style={styles.headerTitle}>Saved Workouts</Text>
        </View>
        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={() => { loadedRef.current = null; loadWorkouts(); }}
          activeOpacity={0.7}
        >
          <Ionicons name="refresh" size={14} color={COLORS.accent} />
        </TouchableOpacity>
      </View>

      {/* Workout Cards */}
      {workouts.map((workout) => {
        const isExpanded = expandedId === workout.id;
        const typeLabel = getWorkoutTypeLabel(workout.workout_type);
        const typeColor = getWorkoutTypeColor(workout.workout_type);
        const exerciseList = (workout.exercises || []) as Exercise[];
        const segmentList = (workout.segments || []) as Segment[];
        const isDeleting = deletingId === workout.id;

        return (
          <View key={workout.id} style={styles.workoutCard}>
            {/* Card Header - Tappable */}
            <TouchableOpacity
              style={styles.workoutCardHeader}
              onPress={() => setExpandedId(isExpanded ? null : workout.id)}
              activeOpacity={0.7}
            >
              <View style={[styles.workoutTypeIcon, { backgroundColor: typeColor + '15' }]}>
                <Ionicons name="flash" size={16} color={typeColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.workoutTypeLabel, { color: typeColor }]}>{typeLabel}</Text>
                <Text style={styles.workoutDate}>
                  {formatDate(workout.created_at)} at {formatTime(workout.created_at)}
                </Text>
                <Text style={styles.workoutMeta}>
                  {exerciseList.length} exercises
                  {segmentList.length > 0 ? ` · ${segmentList.length} segments` : ''}
                  {workout.trainer_name ? ` · by ${workout.trainer_name}` : ''}
                </Text>
              </View>
              <Ionicons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={COLORS.textMuted}
              />
            </TouchableOpacity>

            {/* Notes */}
            {workout.notes ? (
              <View style={styles.notesRow}>
                <Ionicons name="document-text-outline" size={12} color={COLORS.textMuted} />
                <Text style={styles.notesText} numberOfLines={isExpanded ? undefined : 1}>
                  {workout.notes}
                </Text>
              </View>
            ) : null}

            {/* Expanded Content */}
            {isExpanded && (
              <View style={styles.expandedContent}>
                {/* Equipment */}
                {workout.equipment_used && workout.equipment_used.length > 0 && (
                  <View style={styles.equipmentSection}>
                    <Text style={styles.subSectionTitle}>Equipment</Text>
                    <View style={styles.equipmentRow}>
                      {workout.equipment_used.map((eq, i) => (
                        <View key={i} style={styles.equipmentPill}>
                          <Text style={styles.equipmentPillText}>{eq}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Segments */}
                {segmentList.length > 0 && (
                  <View style={styles.segmentsSection}>
                    <Text style={styles.subSectionTitle}>Segments</Text>
                    <View style={styles.segmentPills}>
                      {segmentList.map(seg => (
                        <View key={seg.id} style={[styles.segmentPill, { backgroundColor: seg.color + '15', borderColor: seg.color + '30' }]}>
                          <View style={[styles.segmentDot, { backgroundColor: seg.color }]} />
                          <Text style={[styles.segmentPillText, { color: seg.color }]}>
                            {seg.name} ({seg.rounds}x)
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Exercise List */}
                <View style={styles.exerciseSection}>
                  <Text style={styles.subSectionTitle}>Exercises</Text>
                  {exerciseList.map((ex, idx) => {
                    const segment = ex.segmentId ? segmentList.find(s => s.id === ex.segmentId) : null;
                    return (
                      <View
                        key={ex.id || idx}
                        style={[
                          styles.exerciseRow,
                          segment && { borderLeftWidth: 3, borderLeftColor: segment.color },
                        ]}
                      >
                        <View style={[styles.exerciseNum, ex.isAerobic && styles.exerciseNumAerobic]}>
                          {ex.isAerobic ? (
                            <Ionicons name="flash" size={10} color={COLORS.warning} />
                          ) : (
                            <Text style={styles.exerciseNumText}>{idx + 1}</Text>
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.exerciseName}>{ex.name}</Text>
                          <View style={styles.exerciseMetaRow}>
                            <View style={styles.metaChip}>
                              <Ionicons name="body-outline" size={8} color={COLORS.textMuted} />
                              <Text style={styles.metaChipText}>{ex.muscles}</Text>
                            </View>
                            <View style={styles.metaChip}>
                              <Ionicons name="barbell-outline" size={8} color={COLORS.textMuted} />
                              <Text style={styles.metaChipText}>{ex.equipment}</Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>

                {/* Delete button */}
                {canDelete && (
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleDelete(workout.id)}
                    disabled={isDeleting}
                    activeOpacity={0.7}
                  >
                    {isDeleting ? (
                      <ActivityIndicator size="small" color={COLORS.danger} />
                    ) : (
                      <>
                        <Ionicons name="trash-outline" size={14} color={COLORS.danger} />
                        <Text style={styles.deleteBtnText}>Delete Workout</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: SPACING.lg,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xxl,
  },
  loadingText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xxl,
    gap: SPACING.sm,
  },
  errorTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.danger,
  },
  errorText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.accent + '12',
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.accent + '30',
    marginTop: SPACING.sm,
  },
  retryText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.accent,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xxl,
    gap: SPACING.sm,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  emptyTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.primary,
  },
  emptyText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: SPACING.xl,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  countBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '800',
    color: COLORS.white,
  },
  headerTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.primary,
  },
  refreshBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.accent + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Workout Card
  workoutCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.md,
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  workoutCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.lg,
  },
  workoutTypeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workoutTypeLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '800',
  },
  workoutDate: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginTop: 1,
  },
  workoutMeta: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  // Notes
  notesRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  notesText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    flex: 1,
    lineHeight: 16,
  },

  // Expanded
  expandedContent: {
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  subSectionTitle: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '800',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },

  // Equipment
  equipmentSection: {
    marginBottom: SPACING.md,
  },
  equipmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  equipmentPill: {
    backgroundColor: COLORS.background,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  equipmentPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textMuted,
  },

  // Segments
  segmentsSection: {
    marginBottom: SPACING.md,
  },
  segmentPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  segmentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
  },
  segmentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  segmentPillText: {
    fontSize: 10,
    fontWeight: '700',
  },

  // Exercise list
  exerciseSection: {
    marginBottom: SPACING.md,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  exerciseNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.primary + '10',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseNumAerobic: {
    backgroundColor: COLORS.warning + '15',
  },
  exerciseNumText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.primary,
  },
  exerciseName: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 2,
  },
  exerciseMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: COLORS.background,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: BORDER_RADIUS.sm,
  },
  metaChipText: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: '500',
  },

  // Delete
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: '#e74c3c08',
    borderWidth: 1,
    borderColor: '#e74c3c25',
    marginTop: SPACING.sm,
  },
  deleteBtnText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.danger,
  },
});
