import React from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';

export type RecurringEditChoice = 'this' | 'future' | 'cancel';

interface RecurringEditChoiceModalProps {
  visible: boolean;
  onClose: () => void;
  onChoice: (choice: RecurringEditChoice) => void;
  action: 'edit' | 'reschedule' | 'cancel' | 'delete';
  instanceCount?: number;
}

export default function RecurringEditChoiceModal({
  visible, onClose, onChoice, action, instanceCount,
}: RecurringEditChoiceModalProps) {
  const actionLabels: Record<string, { title: string; thisLabel: string; futureLabel: string; thisDesc: string; futureDesc: string }> = {
    edit: {
      title: 'Edit Recurring Appointment',
      thisLabel: 'This Appointment Only',
      futureLabel: 'All Future Appointments',
      thisDesc: 'Only this specific instance will be changed',
      futureDesc: `All ${instanceCount || ''} future instances will be updated`,
    },
    reschedule: {
      title: 'Reschedule Recurring Appointment',
      thisLabel: 'This Appointment Only',
      futureLabel: 'All Future Appointments',
      thisDesc: 'Move only this specific session',
      futureDesc: `Reschedule all ${instanceCount || ''} future sessions`,
    },
    cancel: {
      title: 'Cancel Recurring Appointment',
      thisLabel: 'This Appointment Only',
      futureLabel: 'All Future Appointments',
      thisDesc: 'Only cancel this specific session',
      futureDesc: `Cancel all ${instanceCount || ''} future sessions`,
    },
    delete: {
      title: 'Delete Recurring Appointment',
      thisLabel: 'This Appointment Only',
      futureLabel: 'All Future Appointments',
      thisDesc: 'Only remove this specific session',
      futureDesc: `Remove all ${instanceCount || ''} future sessions`,
    },
  };

  const labels = actionLabels[action] || actionLabels.edit;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIconWrap}>
              <Ionicons name="repeat" size={22} color={COLORS.accent} />
            </View>
            <Text style={styles.headerTitle}>{labels.title}</Text>
            <Text style={styles.headerSubtitle}>
              This appointment is part of a recurring series
            </Text>
          </View>

          {/* Options */}
          <View style={styles.options}>
            <TouchableOpacity
              style={styles.optionCard}
              onPress={() => onChoice('this')}
            >
              <View style={[styles.optionIcon, { backgroundColor: COLORS.accent + '12' }]}>
                <Ionicons name="calendar-outline" size={22} color={COLORS.accent} />
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>{labels.thisLabel}</Text>
                <Text style={styles.optionDesc}>{labels.thisDesc}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.optionCard}
              onPress={() => onChoice('future')}
            >
              <View style={[styles.optionIcon, { backgroundColor: COLORS.warning + '12' }]}>
                <Ionicons name="repeat" size={22} color={COLORS.warning} />
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>{labels.futureLabel}</Text>
                <Text style={styles.optionDesc}>{labels.futureDesc}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Cancel */}
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  container: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    width: '100%',
    maxWidth: 400,
    overflow: 'hidden',
    ...SHADOWS.lg,
  },
  header: {
    alignItems: 'center',
    padding: SPACING.xl,
    paddingBottom: SPACING.lg,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  headerIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.accent + '14',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.primary,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
  options: {
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1.5,
    borderColor: COLORS.borderLight,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.primary,
  },
  optionDesc: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  cancelBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
});
