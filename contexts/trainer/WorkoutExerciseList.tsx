import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';

// ── Types ──

export interface Exercise {
  id: string;
  order: number;
  name: string;
  muscles: string;
  equipment: string;
  isAerobic: boolean;
  segmentId: string | null;
}

export interface Segment {
  id: string;
  name: string;
  rounds: number;
  color: string;
}

interface Props {
  exercises: Exercise[];
  onExercisesChange: (exercises: Exercise[]) => void;
  segments: Segment[];
  onSegmentsChange: (segments: Segment[]) => void;
}

const SEGMENT_COLORS = [
  '#9b59b6', '#e67e22', '#2ecc71', '#e74c3c', '#3498db',
  '#1abc9c', '#f39c12', '#8e44ad', '#2c3e50', '#d35400',
];

export default function WorkoutExerciseList({ exercises, onExercisesChange, segments, onSegmentsChange }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isGroupMode, setIsGroupMode] = useState(false);

  // ── Reorder ──
  const moveExercise = useCallback((index: number, direction: 'up' | 'down') => {
    const newExercises = [...exercises];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newExercises.length) return;
    [newExercises[index], newExercises[targetIndex]] = [newExercises[targetIndex], newExercises[index]];
    // Update order numbers
    newExercises.forEach((ex, i) => { ex.order = i; });
    onExercisesChange(newExercises);
  }, [exercises, onExercisesChange]);

  // ── Remove exercise ──
  const removeExercise = useCallback((id: string) => {
    const newExercises = exercises.filter(ex => ex.id !== id);
    newExercises.forEach((ex, i) => { ex.order = i; });
    onExercisesChange(newExercises);
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, [exercises, onExercisesChange]);

  // ── Toggle selection ──
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Create segment from selected ──
  const createSegment = useCallback(() => {
    if (selectedIds.size < 2) {
      const msg = 'Select at least 2 exercises to group into a segment.';
      if (Platform.OS === 'web') { alert(msg); } else { Alert.alert('Group Exercises', msg); }
      return;
    }

    const segmentId = `seg-${Date.now()}`;
    const colorIndex = segments.length % SEGMENT_COLORS.length;
    const segmentName = `Segment ${String.fromCharCode(65 + segments.length)}`;

    const newSegment: Segment = {
      id: segmentId,
      name: segmentName,
      rounds: 2,
      color: SEGMENT_COLORS[colorIndex],
    };

    // Assign segment to selected exercises
    const newExercises = exercises.map(ex => {
      if (selectedIds.has(ex.id)) {
        return { ...ex, segmentId };
      }
      return ex;
    });

    // Regroup: move segmented exercises together
    const segExercises = newExercises.filter(ex => ex.segmentId === segmentId);
    const otherExercises = newExercises.filter(ex => ex.segmentId !== segmentId);

    // Find the position of the first selected exercise in the original order
    const firstSelectedIndex = exercises.findIndex(ex => selectedIds.has(ex.id));

    // Insert segment exercises at that position
    const reordered: Exercise[] = [];
    let inserted = false;
    let otherIdx = 0;
    for (let i = 0; i < newExercises.length; i++) {
      if (i === firstSelectedIndex && !inserted) {
        reordered.push(...segExercises);
        inserted = true;
      }
      const ex = newExercises[i];
      if (!selectedIds.has(ex.id)) {
        reordered.push(ex);
      }
    }
    if (!inserted) reordered.push(...segExercises);

    reordered.forEach((ex, i) => { ex.order = i; });

    onSegmentsChange([...segments, newSegment]);
    onExercisesChange(reordered);
    setSelectedIds(new Set());
    setIsGroupMode(false);
  }, [selectedIds, exercises, segments, onExercisesChange, onSegmentsChange]);

  // ── Remove segment (ungroup) ──
  const removeSegment = useCallback((segmentId: string) => {
    const newExercises = exercises.map(ex => {
      if (ex.segmentId === segmentId) return { ...ex, segmentId: null };
      return ex;
    });
    onExercisesChange(newExercises);
    onSegmentsChange(segments.filter(s => s.id !== segmentId));
  }, [exercises, segments, onExercisesChange, onSegmentsChange]);

  // ── Update segment rounds ──
  const updateSegmentRounds = useCallback((segmentId: string, delta: number) => {
    onSegmentsChange(segments.map(s => {
      if (s.id === segmentId) {
        const newRounds = Math.max(1, Math.min(10, s.rounds + delta));
        return { ...s, rounds: newRounds };
      }
      return s;
    }));
  }, [segments, onSegmentsChange]);

  // ── Group exercises by segment for rendering ──
  const renderGroups = useCallback(() => {
    const groups: { type: 'exercise' | 'segment'; segmentId?: string; exercises: Exercise[] }[] = [];
    let currentSegmentId: string | null = null;
    let currentGroup: Exercise[] = [];

    exercises.forEach((ex) => {
      if (ex.segmentId !== currentSegmentId) {
        if (currentGroup.length > 0) {
          groups.push({
            type: currentSegmentId ? 'segment' : 'exercise',
            segmentId: currentSegmentId || undefined,
            exercises: currentGroup,
          });
        }
        currentSegmentId = ex.segmentId;
        currentGroup = [ex];
      } else {
        currentGroup.push(ex);
      }
    });

    if (currentGroup.length > 0) {
      groups.push({
        type: currentSegmentId ? 'segment' : 'exercise',
        segmentId: currentSegmentId || undefined,
        exercises: currentGroup,
      });
    }

    return groups;
  }, [exercises]);

  const groups = renderGroups();

  // ── Get global index of exercise ──
  const getGlobalIndex = (exId: string) => exercises.findIndex(e => e.id === exId);

  return (
    <View style={styles.container}>
      {/* ── Toolbar ── */}
      <View style={styles.toolbar}>
        <View style={styles.toolbarLeft}>
          <View style={styles.exerciseCountBadge}>
            <Text style={styles.exerciseCountText}>{exercises.length}</Text>
          </View>
          <Text style={styles.toolbarTitle}>Exercises</Text>
        </View>
        <View style={styles.toolbarActions}>
          {isGroupMode ? (
            <>
              <TouchableOpacity
                style={[styles.toolbarBtn, styles.toolbarBtnCancel]}
                onPress={() => { setIsGroupMode(false); setSelectedIds(new Set()); }}
              >
                <Ionicons name="close" size={14} color={COLORS.textSecondary} />
                <Text style={styles.toolbarBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toolbarBtn, styles.toolbarBtnCreate, selectedIds.size < 2 && { opacity: 0.4 }]}
                onPress={createSegment}
                disabled={selectedIds.size < 2}
              >
                <Ionicons name="layers" size={14} color={COLORS.white} />
                <Text style={styles.toolbarBtnCreateText}>
                  Group ({selectedIds.size})
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={[styles.toolbarBtn, styles.toolbarBtnGroup]}
              onPress={() => setIsGroupMode(true)}
            >
              <Ionicons name="layers-outline" size={14} color={COLORS.accent} />
              <Text style={styles.toolbarBtnGroupText}>Group into Segment</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Instruction ── */}
      {isGroupMode && (
        <View style={styles.instructionBanner}>
          <Ionicons name="information-circle" size={16} color={COLORS.accent} />
          <Text style={styles.instructionText}>
            Tap exercises to select them, then press "Group" to create a repeatable segment.
          </Text>
        </View>
      )}

      {/* ── Exercise List ── */}
      <ScrollView style={styles.list} showsVerticalScrollIndicator={false} nestedScrollEnabled>
        {groups.map((group, groupIdx) => {
          if (group.type === 'segment' && group.segmentId) {
            const segment = segments.find(s => s.id === group.segmentId);
            if (!segment) return null;

            return (
              <View key={group.segmentId} style={[styles.segmentContainer, { borderColor: segment.color + '60' }]}>
                {/* Segment Header */}
                <View style={[styles.segmentHeader, { backgroundColor: segment.color + '12' }]}>
                  <View style={styles.segmentHeaderLeft}>
                    <View style={[styles.segmentDot, { backgroundColor: segment.color }]} />
                    <Text style={[styles.segmentName, { color: segment.color }]}>{segment.name}</Text>
                  </View>
                  <View style={styles.segmentRoundsControl}>
                    <TouchableOpacity
                      style={styles.roundsBtn}
                      onPress={() => updateSegmentRounds(segment.id, -1)}
                    >
                      <Ionicons name="remove" size={14} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                    <View style={[styles.roundsBadge, { backgroundColor: segment.color }]}>
                      <Text style={styles.roundsBadgeText}>{segment.rounds}x</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.roundsBtn}
                      onPress={() => updateSegmentRounds(segment.id, 1)}
                    >
                      <Ionicons name="add" size={14} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.ungroupBtn}
                      onPress={() => removeSegment(segment.id)}
                    >
                      <Ionicons name="close-circle-outline" size={14} color={COLORS.danger} />

                    </TouchableOpacity>
                  </View>
                </View>

                {/* Segment Exercises */}
                {group.exercises.map((ex) => {
                  const globalIdx = getGlobalIndex(ex.id);
                  return renderExerciseRow(ex, globalIdx, segment.color);
                })}
              </View>
            );
          }

          // Ungrouped exercises
          return group.exercises.map((ex) => {
            const globalIdx = getGlobalIndex(ex.id);
            return renderExerciseRow(ex, globalIdx, null);
          });
        })}
        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );

  function renderExerciseRow(ex: Exercise, globalIdx: number, segmentColor: string | null) {
    const isSelected = selectedIds.has(ex.id);
    const isFirst = globalIdx === 0;
    const isLast = globalIdx === exercises.length - 1;

    return (
      <View
        key={ex.id}
        style={[
          styles.exerciseRow,
          isSelected && styles.exerciseRowSelected,
          segmentColor && { borderLeftColor: segmentColor, borderLeftWidth: 3 },
        ]}
      >
        {/* Selection checkbox (group mode) */}
        {isGroupMode && !ex.segmentId && (
          <TouchableOpacity
            style={[styles.checkbox, isSelected && styles.checkboxChecked]}
            onPress={() => toggleSelect(ex.id)}
          >
            {isSelected && <Ionicons name="checkmark" size={12} color={COLORS.white} />}
          </TouchableOpacity>
        )}

        {/* Exercise number */}
        <View style={[styles.exerciseNum, ex.isAerobic && styles.exerciseNumAerobic]}>
          <Text style={[styles.exerciseNumText, ex.isAerobic && styles.exerciseNumTextAerobic]}>
            {ex.isAerobic ? (
              <Ionicons name="flash" size={12} color={COLORS.warning} />
            ) : (
              String(globalIdx + 1)
            )}
          </Text>
        </View>

        {/* Exercise Info */}
        <TouchableOpacity
          style={styles.exerciseInfo}
          onPress={isGroupMode && !ex.segmentId ? () => toggleSelect(ex.id) : undefined}
          activeOpacity={isGroupMode ? 0.7 : 1}
        >
          <Text style={styles.exerciseName} numberOfLines={1}>{ex.name}</Text>
          <View style={styles.exerciseMeta}>
            <View style={styles.metaChip}>
              <Ionicons name="body-outline" size={9} color={COLORS.textMuted} />
              <Text style={styles.metaText} numberOfLines={1}>{ex.muscles}</Text>
            </View>
            <View style={styles.metaChip}>
              <Ionicons name="barbell-outline" size={9} color={COLORS.textMuted} />
              <Text style={styles.metaText} numberOfLines={1}>{ex.equipment}</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Reorder + Remove buttons */}
        {!isGroupMode && (
          <View style={styles.exerciseActions}>
            <TouchableOpacity
              style={[styles.arrowBtn, isFirst && styles.arrowBtnDisabled]}
              onPress={() => moveExercise(globalIdx, 'up')}
              disabled={isFirst}
            >
              <Ionicons name="chevron-up" size={16} color={isFirst ? COLORS.borderLight : COLORS.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.arrowBtn, isLast && styles.arrowBtnDisabled]}
              onPress={() => moveExercise(globalIdx, 'down')}
              disabled={isLast}
            >
              <Ionicons name="chevron-down" size={16} color={isLast ? COLORS.borderLight : COLORS.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.removeBtn}
              onPress={() => removeExercise(ex.id)}
            >
              <Ionicons name="close" size={14} color={COLORS.danger} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }
}

// ── Styles ──

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  toolbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  exerciseCountBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseCountText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '800',
    color: COLORS.white,
  },
  toolbarTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.primary,
  },
  toolbarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  toolbarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
  },
  toolbarBtnGroup: {
    backgroundColor: COLORS.accent + '12',
    borderWidth: 1,
    borderColor: COLORS.accent + '30',
  },
  toolbarBtnGroupText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.accent,
  },
  toolbarBtnCancel: {
    backgroundColor: COLORS.borderLight,
  },
  toolbarBtnCancelText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  toolbarBtnCreate: {
    backgroundColor: COLORS.accent,
  },
  toolbarBtnCreateText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.white,
  },
  instructionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accent + '08',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.accent + '20',
  },
  instructionText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.accent,
    fontWeight: '500',
    flex: 1,
    lineHeight: 16,
  },
  list: {
    flex: 1,
  },

  // ── Segment ──
  segmentContainer: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1.5,
    overflow: 'hidden',
    backgroundColor: COLORS.white,
    ...SHADOWS.sm,
  },
  segmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  segmentHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  segmentDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  segmentName: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  segmentRoundsControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  roundsBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  roundsBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
    minWidth: 36,
    alignItems: 'center',
  },
  roundsBadgeText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '800',
    color: COLORS.white,
  },
  ungroupBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.dangerLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },

  // ── Exercise Row ──
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    backgroundColor: COLORS.white,
    gap: SPACING.sm,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
    ...SHADOWS.sm,
  },
  exerciseRowSelected: {
    backgroundColor: COLORS.accent + '08',
    borderColor: COLORS.accent + '30',
    borderWidth: 1,
  },

  // Checkbox
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },

  // Exercise number
  exerciseNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primary + '10',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseNumAerobic: {
    backgroundColor: COLORS.warning + '15',
  },
  exerciseNumText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '800',
    color: COLORS.primary,
  },
  exerciseNumTextAerobic: {
    color: COLORS.warning,
  },

  // Exercise info
  exerciseInfo: {
    flex: 1,
  },
  exerciseName: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 3,
  },
  exerciseMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: COLORS.background,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  metaText: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: '500',
    maxWidth: 120,
  },

  // Actions
  exerciseActions: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  arrowBtn: {
    width: 24,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowBtnDisabled: {
    opacity: 0.3,
  },
  removeBtn: {
    width: 24,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
});
