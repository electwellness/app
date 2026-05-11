import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView,
  ActivityIndicator, Animated, Platform, Alert,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import { supabase } from '@/app/lib/supabase';
import WorkoutExerciseList, { Exercise, Segment } from './WorkoutExerciseList';
import SaveWorkoutModal from './SaveWorkoutModal';


// ── Constants ──

interface WorkoutType {
  id: string;
  label: string;
  subtitle: string;
  icon: string;
  color: string;
}

const WORKOUT_TYPES: WorkoutType[] = [
  { id: 'full_body', label: 'Full Body', subtitle: 'All major muscle groups', icon: 'body', color: '#3498db' },
  { id: 'upper_body', label: 'Upper Body', subtitle: 'Chest, back, shoulders, arms, core', icon: 'fitness', color: '#e67e22' },
  { id: 'lower_body', label: 'Lower Body', subtitle: 'Glutes, quads, hamstrings, calves', icon: 'walk', color: '#2ecc71' },
  { id: 'upper_push', label: 'Upper Push', subtitle: 'Chest / Shoulders / Triceps / Low Back', icon: 'arrow-up-circle', color: '#e74c3c' },
  { id: 'upper_pull', label: 'Upper Pull', subtitle: 'Mid-Back / Lats / Biceps / Abs', icon: 'arrow-down-circle', color: '#9b59b6' },
  { id: 'lower_push', label: 'Lower Push', subtitle: 'Glutes / Quads / Hip Abductors / Calves', icon: 'trending-up', color: '#1abc9c' },
  { id: 'lower_pull', label: 'Lower Pull', subtitle: 'Hip Flexors / Hamstrings / Hip Adductors / Shins', icon: 'trending-down', color: '#f39c12' },
  { id: 'push', label: 'Push', subtitle: 'All pushing muscles', icon: 'hand-right', color: '#d35400' },
  { id: 'pull', label: 'Pull', subtitle: 'All pulling muscles', icon: 'hand-left', color: '#8e44ad' },

];

interface EquipmentItem {
  id: string;
  label: string;
  icon: string;
  iconLib?: 'ionicons' | 'material';
}

const EQUIPMENT_LIST: EquipmentItem[] = [
  { id: 'dumbbells', label: 'Dumbbells', icon: 'dumbbell', iconLib: 'material' },
  { id: 'resistance_bands', label: 'Resistance Bands', icon: 'link', iconLib: 'ionicons' },
  { id: 'trx_straps', label: 'TRX Straps', icon: 'git-merge', iconLib: 'ionicons' },
  { id: 'exercise_ball', label: 'Exercise Ball', icon: 'ellipse', iconLib: 'ionicons' },
  { id: 'medicine_ball', label: 'Medicine Ball', icon: 'basketball', iconLib: 'material' },
  { id: 'aerobic_step', label: 'Aerobic Step', icon: 'layers', iconLib: 'ionicons' },
  { id: 'foam_roller', label: 'Foam Roller', icon: 'remove', iconLib: 'ionicons' },
  { id: 'sliders', label: 'Sliders', icon: 'swap-horizontal', iconLib: 'ionicons' },
  { id: 'sandbag', label: 'Sandbag', icon: 'bag-handle', iconLib: 'ionicons' },
  { id: 'bosu', label: 'Bosu', icon: 'radio-button-on', iconLib: 'ionicons' },
  { id: 'jump_rope', label: 'Jump Rope', icon: 'pulse', iconLib: 'ionicons' },
  { id: 'agility_ladder', label: 'Agility Ladder', icon: 'grid', iconLib: 'ionicons' },
  { id: 'barbell', label: 'Barbell', icon: 'barbell', iconLib: 'ionicons' },
  { id: 'squat_rack', label: 'Squat Rack', icon: 'construct', iconLib: 'ionicons' },
  { id: 'cable_machine', label: 'Cable Machine', icon: 'git-pull-request', iconLib: 'ionicons' },
  { id: 'leg_extension', label: 'Leg Extension Machine', icon: 'extension-puzzle', iconLib: 'ionicons' },
  { id: 'ham_curl', label: 'Ham Curl Machine', icon: 'return-down-back', iconLib: 'ionicons' },
  { id: 'bench', label: 'Bench', icon: 'bed', iconLib: 'ionicons' },
  { id: 'plyo_box', label: 'Plyometric Box', icon: 'cube', iconLib: 'ionicons' },
  { id: 'yoga_mat', label: 'Yoga Mat', icon: 'albums', iconLib: 'ionicons' },
];

// ── Component ──

interface Props {
  visible: boolean;
  onClose: () => void;
}

type Step = 'type' | 'equipment' | 'results';

export default function WorkoutGeneratorModal({ visible, onClose }: Props) {
  const [step, setStep] = useState<Step>('type');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedEquipment, setSelectedEquipment] = useState<Set<string>>(new Set());
  const [includeAerobic, setIncludeAerobic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Results
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);

  // Save modal
  const [showSaveModal, setShowSaveModal] = useState(false);

  // ── Reset ──
  const resetAll = useCallback(() => {
    setStep('type');
    setSelectedType(null);
    setSelectedEquipment(new Set());
    setIncludeAerobic(false);
    setLoading(false);
    setError(null);
    setExercises([]);
    setSegments([]);
    setShowSaveModal(false);
  }, []);


  const handleClose = useCallback(() => {
    onClose();
    // Delay reset so modal animation completes
    setTimeout(resetAll, 300);
  }, [onClose, resetAll]);

  // ── Equipment toggle ──
  const toggleEquipment = useCallback((id: string) => {
    setSelectedEquipment(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllEquipment = useCallback(() => {
    setSelectedEquipment(new Set(EQUIPMENT_LIST.map(e => e.id)));
  }, []);

  const clearAllEquipment = useCallback(() => {
    setSelectedEquipment(new Set());
  }, []);

  // ── Generate ──
  const handleGenerate = useCallback(async () => {
    if (!selectedType || selectedEquipment.size === 0) return;

    setLoading(true);
    setError(null);

    try {
      const equipmentLabels = Array.from(selectedEquipment).map(id => {
        const item = EQUIPMENT_LIST.find(e => e.id === id);
        return item?.label || id;
      });

      const { data, error: fnError } = await supabase.functions.invoke('generate-workout', {
        body: {
          workoutType: selectedType,
          equipment: equipmentLabels,
          includeAerobicDrills: includeAerobic,
        },
      });

      if (fnError) throw new Error(fnError.message || 'Failed to generate workout');
      if (data?.error) throw new Error(data.error);

      if (data?.exercises && Array.isArray(data.exercises)) {
        setExercises(data.exercises);
        setSegments([]);
        setStep('results');
      } else {
        throw new Error('No exercises returned');
      }
    } catch (err: any) {
      console.error('Workout generation error:', err);
      setError(err.message || 'Failed to generate workout. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [selectedType, selectedEquipment, includeAerobic]);

  // ── Render helpers ──

  const selectedTypeObj = WORKOUT_TYPES.find(t => t.id === selectedType);

  const renderTypeStep = () => (
    <ScrollView style={styles.stepScroll} showsVerticalScrollIndicator={false}>
      <Text style={styles.stepTitle}>Choose Workout Type</Text>
      <Text style={styles.stepSubtitle}>Select the muscle group split for this workout</Text>

      <View style={styles.typeGrid}>
        {WORKOUT_TYPES.map(type => {
          const isSelected = selectedType === type.id;
          return (
            <TouchableOpacity
              key={type.id}
              style={[
                styles.typeCard,
                isSelected && { borderColor: type.color, borderWidth: 2, backgroundColor: type.color + '08' },
              ]}
              onPress={() => setSelectedType(type.id)}
              activeOpacity={0.7}
            >
              <View style={[styles.typeIconWrap, { backgroundColor: type.color + '15' }]}>
                <Ionicons name={type.icon as any} size={22} color={type.color} />
              </View>
              <View style={styles.typeTextWrap}>
                <Text style={[styles.typeLabel, isSelected && { color: type.color }]}>{type.label}</Text>
                <Text style={styles.typeSubtitle} numberOfLines={2}>{type.subtitle}</Text>
              </View>
              {isSelected && (
                <View style={[styles.typeCheck, { backgroundColor: type.color }]}>
                  <Ionicons name="checkmark" size={12} color={COLORS.white} />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ height: 100 }} />
    </ScrollView>
  );

  const renderEquipmentStep = () => (
    <ScrollView style={styles.stepScroll} showsVerticalScrollIndicator={false}>
      {/* Selected type summary */}
      {selectedTypeObj && (
        <View style={[styles.selectedTypeBanner, { backgroundColor: selectedTypeObj.color + '10', borderColor: selectedTypeObj.color + '30' }]}>
          <View style={[styles.selectedTypeIcon, { backgroundColor: selectedTypeObj.color + '20' }]}>
            <Ionicons name={selectedTypeObj.icon as any} size={18} color={selectedTypeObj.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.selectedTypeLabel, { color: selectedTypeObj.color }]}>{selectedTypeObj.label}</Text>
            <Text style={styles.selectedTypeSub}>{selectedTypeObj.subtitle}</Text>
          </View>
          <TouchableOpacity onPress={() => setStep('type')}>
            <Text style={styles.changeBtn}>Change</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.stepTitle}>Available Equipment</Text>
      <Text style={styles.stepSubtitle}>Check all equipment you have access to</Text>

      {/* Select all / Clear all */}
      <View style={styles.selectAllRow}>
        <TouchableOpacity style={styles.selectAllBtn} onPress={selectAllEquipment}>
          <Ionicons name="checkmark-done" size={14} color={COLORS.accent} />
          <Text style={styles.selectAllText}>Select All</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.selectAllBtn} onPress={clearAllEquipment}>
          <Ionicons name="close-circle-outline" size={14} color={COLORS.textMuted} />
          <Text style={[styles.selectAllText, { color: COLORS.textMuted }]}>Clear All</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.equipmentGrid}>
        {EQUIPMENT_LIST.map(item => {
          const isChecked = selectedEquipment.has(item.id);
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.equipmentCard, isChecked && styles.equipmentCardChecked]}
              onPress={() => toggleEquipment(item.id)}
              activeOpacity={0.7}
            >
              <View style={[styles.equipmentCheckbox, isChecked && styles.equipmentCheckboxChecked]}>
                {isChecked && <Ionicons name="checkmark" size={12} color={COLORS.white} />}
              </View>
              <View style={[styles.equipmentIconWrap, isChecked && { backgroundColor: COLORS.accent + '15' }]}>
                {item.iconLib === 'material' ? (
                  <MaterialCommunityIcons name={item.icon as any} size={18} color={isChecked ? COLORS.accent : COLORS.textMuted} />
                ) : (
                  <Ionicons name={item.icon as any} size={18} color={isChecked ? COLORS.accent : COLORS.textMuted} />
                )}
              </View>
              <Text style={[styles.equipmentLabel, isChecked && styles.equipmentLabelChecked]} numberOfLines={2}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Aerobic Drills Toggle */}
      <View style={styles.aerobicSection}>
        <TouchableOpacity
          style={[styles.aerobicToggle, includeAerobic && styles.aerobicToggleActive]}
          onPress={() => setIncludeAerobic(!includeAerobic)}
          activeOpacity={0.7}
        >
          <View style={[styles.aerobicCheckbox, includeAerobic && styles.aerobicCheckboxChecked]}>
            {includeAerobic && <Ionicons name="checkmark" size={14} color={COLORS.white} />}
          </View>
          <View style={[styles.aerobicIconWrap, includeAerobic && { backgroundColor: COLORS.warning + '20' }]}>
            <Ionicons name="flash" size={20} color={includeAerobic ? COLORS.warning : COLORS.textMuted} />
          </View>
          <View style={styles.aerobicTextWrap}>
            <Text style={[styles.aerobicLabel, includeAerobic && { color: COLORS.warning }]}>
              Include Aerobic Drills
            </Text>
            <Text style={styles.aerobicSubtitle}>
              Add cardio intervals between strength exercises
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Error */}
      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={16} color={COLORS.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={{ height: 120 }} />
    </ScrollView>
  );

  const renderResultsStep = () => (
    <View style={styles.resultsContainer}>
      {/* Results header */}
      <View style={styles.resultsHeader}>
        {selectedTypeObj && (
          <View style={styles.resultsHeaderInfo}>
            <View style={[styles.resultsTypeIcon, { backgroundColor: selectedTypeObj.color + '15' }]}>
              <Ionicons name={selectedTypeObj.icon as any} size={16} color={selectedTypeObj.color} />
            </View>
            <View>
              <Text style={styles.resultsTypeLabel}>{selectedTypeObj.label} Workout</Text>
              <Text style={styles.resultsEquipCount}>
                {selectedEquipment.size} equipment items
                {includeAerobic ? ' + Aerobic Drills' : ''}
              </Text>
            </View>
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: SPACING.md,
              paddingVertical: 6,
              borderRadius: BORDER_RADIUS.full,
              backgroundColor: COLORS.success + '12',
              borderWidth: 1,
              borderColor: COLORS.success + '30',
            }}
            onPress={() => setShowSaveModal(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="save-outline" size={14} color={COLORS.success} />
            <Text style={{ fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.success }}>Save for Client</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.regenerateBtn} onPress={handleGenerate} disabled={loading}>
            {loading ? (
              <ActivityIndicator size="small" color={COLORS.accent} />
            ) : (
              <>
                <Ionicons name="refresh" size={14} color={COLORS.accent} />
                <Text style={styles.regenerateText}>Regenerate</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>


      {/* Segments summary */}
      {segments.length > 0 && (
        <View style={styles.segmentsSummary}>
          <Ionicons name="layers" size={14} color={COLORS.accent} />
          <Text style={styles.segmentsSummaryText}>
            {segments.length} segment{segments.length !== 1 ? 's' : ''} created
          </Text>
          {segments.map(s => (
            <View key={s.id} style={[styles.segmentPill, { backgroundColor: s.color + '15', borderColor: s.color + '30' }]}>
              <View style={[styles.segmentPillDot, { backgroundColor: s.color }]} />
              <Text style={[styles.segmentPillText, { color: s.color }]}>{s.name} ({s.rounds}x)</Text>
            </View>
          ))}
        </View>
      )}

      {/* Exercise List */}
      <WorkoutExerciseList
        exercises={exercises}
        onExercisesChange={setExercises}
        segments={segments}
        onSegmentsChange={setSegments}
      />
    </View>
  );

  // ── Footer buttons ──
  const canProceedToEquipment = !!selectedType;
  const canGenerate = !!selectedType && selectedEquipment.size > 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.modal}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerCloseBtn} onPress={handleClose}>
            <Ionicons name="close" size={22} color={COLORS.textSecondary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <View style={styles.headerIconWrap}>
              <Ionicons name="flash" size={18} color={COLORS.white} />
            </View>
            <Text style={styles.headerTitle}>Workout Generator</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* ── Step Indicator ── */}
        <View style={styles.stepIndicator}>
          {(['type', 'equipment', 'results'] as Step[]).map((s, idx) => {
            const stepLabels = ['Type', 'Equipment', 'Workout'];
            const stepIcons = ['list', 'barbell', 'flash'];
            const isCurrent = step === s;
            const isPast = (step === 'equipment' && idx === 0) || (step === 'results' && idx < 2);
            return (
              <React.Fragment key={s}>
                {idx > 0 && (
                  <View style={[styles.stepLine, (isPast || isCurrent) && styles.stepLineActive]} />
                )}
                <TouchableOpacity
                  style={[styles.stepDot, isCurrent && styles.stepDotActive, isPast && styles.stepDotPast]}
                  onPress={() => {
                    if (isPast) setStep(s);
                  }}
                  disabled={!isPast}
                >
                  {isPast ? (
                    <Ionicons name="checkmark" size={12} color={COLORS.white} />
                  ) : (
                    <Ionicons name={stepIcons[idx] as any} size={12} color={isCurrent ? COLORS.white : COLORS.textMuted} />
                  )}
                </TouchableOpacity>
                <Text style={[styles.stepLabel, isCurrent && styles.stepLabelActive, isPast && styles.stepLabelPast]}>
                  {stepLabels[idx]}
                </Text>
              </React.Fragment>
            );
          })}
        </View>

        {/* ── Content ── */}
        <View style={styles.content}>
          {step === 'type' && renderTypeStep()}
          {step === 'equipment' && renderEquipmentStep()}
          {step === 'results' && renderResultsStep()}
        </View>

        {/* ── Footer ── */}
        {step !== 'results' && (
          <View style={styles.footer}>
            {step === 'equipment' && (
              <TouchableOpacity style={styles.footerBackBtn} onPress={() => setStep('type')}>
                <Ionicons name="arrow-back" size={16} color={COLORS.textSecondary} />
                <Text style={styles.footerBackText}>Back</Text>
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }} />
            {step === 'type' && (
              <TouchableOpacity
                style={[styles.footerNextBtn, !canProceedToEquipment && styles.footerBtnDisabled]}
                onPress={() => setStep('equipment')}
                disabled={!canProceedToEquipment}
              >
                <Text style={styles.footerNextText}>Next: Equipment</Text>
                <Ionicons name="arrow-forward" size={16} color={COLORS.white} />
              </TouchableOpacity>
            )}
            {step === 'equipment' && (
              <TouchableOpacity
                style={[styles.footerGenerateBtn, !canGenerate && styles.footerBtnDisabled]}
                onPress={handleGenerate}
                disabled={!canGenerate || loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <>
                    <Ionicons name="flash" size={16} color={COLORS.white} />
                    <Text style={styles.footerGenerateText}>Generate Workout</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── Loading Overlay ── */}
        {loading && step === 'equipment' && (
          <View style={styles.loadingOverlay}>
            <View style={styles.loadingCard}>
              <ActivityIndicator size="large" color={COLORS.accent} />
              <Text style={styles.loadingTitle}>Generating Workout...</Text>
              <Text style={styles.loadingSubtitle}>
                Our AI is crafting the perfect {selectedTypeObj?.label.toLowerCase()} workout for you
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* ── Save Workout Modal ── */}
      <SaveWorkoutModal
        visible={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        onSaved={() => {
          console.log('Workout saved successfully');
        }}
        workoutType={selectedType || ''}
        equipmentUsed={Array.from(selectedEquipment).map(id => {
          const item = EQUIPMENT_LIST.find(e => e.id === id);
          return item?.label || id;
        })}
        exercises={exercises}
        segments={segments}
      />
    </Modal>
  );
}


// ── Styles ──

const styles = StyleSheet.create({
  modal: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: Platform.OS === 'ios' ? 16 : SPACING.lg,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  headerCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  headerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.primary,
  },

  // Step Indicator
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xxl,
    backgroundColor: COLORS.white,
    gap: 6,
  },
  stepDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: {
    backgroundColor: COLORS.accent,
  },
  stepDotPast: {
    backgroundColor: COLORS.success,
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: COLORS.borderLight,
    maxWidth: 40,
  },
  stepLineActive: {
    backgroundColor: COLORS.success,
  },
  stepLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginRight: SPACING.sm,
  },
  stepLabelActive: {
    color: COLORS.accent,
    fontWeight: '700',
  },
  stepLabelPast: {
    color: COLORS.success,
  },

  // Content
  content: {
    flex: 1,
  },
  stepScroll: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  stepTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: 4,
  },
  stepSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    marginBottom: SPACING.lg,
  },

  // Type Grid
  typeGrid: {
    gap: SPACING.sm,
  },
  typeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
    borderWidth: 1.5,
    borderColor: COLORS.borderLight,
    ...SHADOWS.sm,
  },
  typeIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeTextWrap: {
    flex: 1,
  },
  typeLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.primary,
  },
  typeSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
    lineHeight: 15,
  },
  typeCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Selected type banner
  selectedTypeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    marginBottom: SPACING.lg,
  },
  selectedTypeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedTypeLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
  },
  selectedTypeSub: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  changeBtn: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.accent,
  },

  // Select all row
  selectAllRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  selectAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  selectAllText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.accent,
  },

  // Equipment Grid
  equipmentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  equipmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 1.5,
    borderColor: COLORS.borderLight,
    minWidth: '47%' as any,
    flex: 1,
    maxWidth: '50%' as any,
  },
  equipmentCardChecked: {
    borderColor: COLORS.accent + '50',
    backgroundColor: COLORS.accent + '06',
  },
  equipmentCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  equipmentCheckboxChecked: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  equipmentIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  equipmentLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
    flex: 1,
  },
  equipmentLabelChecked: {
    color: COLORS.primary,
    fontWeight: '700',
  },

  // Aerobic section
  aerobicSection: {
    marginTop: SPACING.xl,
  },
  aerobicToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1.5,
    borderColor: COLORS.borderLight,
    ...SHADOWS.sm,
  },
  aerobicToggleActive: {
    borderColor: COLORS.warning + '50',
    backgroundColor: COLORS.warning + '06',
  },
  aerobicCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aerobicCheckboxChecked: {
    backgroundColor: COLORS.warning,
    borderColor: COLORS.warning,
  },
  aerobicIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aerobicTextWrap: {
    flex: 1,
  },
  aerobicLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.primary,
  },
  aerobicSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.dangerLight,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.lg,
  },
  errorText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.danger,
    fontWeight: '500',
    flex: 1,
  },

  // Results
  resultsContainer: {
    flex: 1,
  },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  resultsHeaderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
  },
  resultsTypeIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultsTypeLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.primary,
  },
  resultsEquipCount: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  regenerateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.accent + '12',
    borderWidth: 1,
    borderColor: COLORS.accent + '30',
  },
  regenerateText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.accent,
  },

  // Segments summary
  segmentsSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.accent + '06',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.accent + '15',
  },
  segmentsSummaryText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.accent,
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
  segmentPillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  segmentPillText: {
    fontSize: 9,
    fontWeight: '700',
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    ...SHADOWS.md,
  },
  footerBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  footerBackText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  footerNextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.full,
    ...SHADOWS.md,
  },
  footerNextText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.white,
  },
  footerGenerateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.full,
    ...SHADOWS.md,
  },
  footerGenerateText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.white,
  },
  footerBtnDisabled: {
    opacity: 0.4,
  },

  // Loading overlay
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  loadingCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xxxl,
    alignItems: 'center',
    gap: SPACING.md,
    marginHorizontal: SPACING.xxxl,
    ...SHADOWS.lg,
  },
  loadingTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.primary,
  },
  loadingSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
});
