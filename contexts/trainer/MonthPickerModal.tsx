import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];




interface MonthPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (month: string) => void; // "YYYY-MM"
  selectedMonth: string; // "YYYY-MM"
  maxMonth: string; // "YYYY-MM" - can't go beyond this
}

export default function MonthPickerModal({
  visible, onClose, onSelect, selectedMonth, maxMonth,
}: MonthPickerModalProps) {
  const [selYear, selMo] = selectedMonth.split('-').map(Number);
  const [viewYear, setViewYear] = useState(selYear);
  const [maxYear, maxMo] = maxMonth.split('-').map(Number);

  // Sync viewYear when the modal opens or selectedMonth changes externally
  useEffect(() => {
    if (visible) {
      const [y] = selectedMonth.split('-').map(Number);
      setViewYear(y);
    }
  }, [visible, selectedMonth]);


  const handleSelect = (monthIndex: number) => {
    const key = `${viewYear}-${String(monthIndex + 1).padStart(2, '0')}`;
    onSelect(key);
    onClose();
  };

  const isDisabled = (monthIndex: number) => {
    if (viewYear > maxYear) return true;
    if (viewYear === maxYear && monthIndex + 1 > maxMo) return true;
    return false;
  };

  const isSelected = (monthIndex: number) => {
    return viewYear === selYear && monthIndex + 1 === selMo;
  };

  const canGoForward = viewYear < maxYear;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Select Month</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Year navigation */}
          <View style={styles.yearNav}>
            <TouchableOpacity
              style={styles.yearArrow}
              onPress={() => setViewYear(y => y - 1)}
            >
              <Ionicons name="chevron-back" size={20} color={COLORS.primary} />
            </TouchableOpacity>
            <Text style={styles.yearText}>{viewYear}</Text>
            <TouchableOpacity
              style={[styles.yearArrow, !canGoForward && styles.yearArrowDisabled]}
              onPress={() => canGoForward && setViewYear(y => y + 1)}
              disabled={!canGoForward}
            >
              <Ionicons name="chevron-forward" size={20} color={canGoForward ? COLORS.primary : COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Month grid */}
          <View style={styles.monthGrid}>
            {MONTH_NAMES.map((name, idx) => {
              const disabled = isDisabled(idx);
              const selected = isSelected(idx);
              return (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.monthCell,
                    selected && styles.monthCellSelected,
                    disabled && styles.monthCellDisabled,
                  ]}
                  onPress={() => !disabled && handleSelect(idx)}
                  disabled={disabled}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.monthCellText,
                    selected && styles.monthCellTextSelected,
                    disabled && styles.monthCellTextDisabled,
                  ]}>
                    {name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Quick jumps */}
          <View style={styles.quickJumps}>
            <Text style={styles.quickLabel}>Quick Jump:</Text>
            {[
              { label: 'Last Month', offset: 0 },
              { label: '3 Mo Ago', offset: 2 },
              { label: '6 Mo Ago', offset: 5 },
            ].map(({ label, offset }) => {
              const target = new Date(maxYear, maxMo - 1 - offset, 1);
              const targetKey = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`;
              return (
                <TouchableOpacity
                  key={label}
                  style={[
                    styles.quickChip,
                    targetKey === selectedMonth && styles.quickChipActive,
                  ]}
                  onPress={() => {
                    onSelect(targetKey);
                    setViewYear(target.getFullYear());
                    onClose();
                  }}
                >
                  <Text style={[
                    styles.quickChipText,
                    targetKey === selectedMonth && styles.quickChipTextActive,
                  ]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  modal: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    width: '100%',
    maxWidth: 380,
    ...SHADOWS.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: COLORS.primary,
  },
  yearNav: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.xl,
    marginBottom: SPACING.lg,
  },
  yearArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  yearArrowDisabled: {
    opacity: 0.4,
  },
  yearText: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '800',
    color: COLORS.primary,
    minWidth: 70,
    textAlign: 'center',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  monthCell: {
    width: '30%',
    flexGrow: 1,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.background,
    alignItems: 'center',
  },
  monthCellSelected: {
    backgroundColor: COLORS.accent,
  },
  monthCellDisabled: {
    backgroundColor: COLORS.borderLight,
    opacity: 0.5,
  },
  monthCellText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.primary,
  },
  monthCellTextSelected: {
    color: COLORS.white,
  },
  monthCellTextDisabled: {
    color: COLORS.textMuted,
  },
  quickJumps: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },
  quickLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  quickChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  quickChipActive: {
    backgroundColor: COLORS.accent + '15',
    borderColor: COLORS.accent,
  },
  quickChipText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  quickChipTextActive: {
    color: COLORS.accent,
  },
});
