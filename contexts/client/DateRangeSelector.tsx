import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Modal, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';

export interface DateRange {
  start: string;
  end: string;
  label: string;
}

interface DateRangeSelectorProps {
  selectedRange: DateRange | null;
  onRangeChange: (range: DateRange | null) => void;
  earliestDate: string;
  latestDate: string;
}

const PRESET_RANGES = [
  { label: 'All Time', value: 'all' },
  { label: 'Last 30 Days', value: '30d' },
  { label: 'Last 90 Days', value: '90d' },
  { label: 'Last 6 Months', value: '6m' },
  { label: 'Last Year', value: '1y' },
  { label: 'Custom', value: 'custom' },
];

function getPresetRange(value: string, earliest: string, latest: string): DateRange | null {
  const now = new Date();
  const end = latest || now.toISOString().split('T')[0];

  switch (value) {
    case 'all':
      return null;
    case '30d': {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return { start: d.toISOString().split('T')[0], end, label: 'Last 30 Days' };
    }
    case '90d': {
      const d = new Date(now);
      d.setDate(d.getDate() - 90);
      return { start: d.toISOString().split('T')[0], end, label: 'Last 90 Days' };
    }
    case '6m': {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 6);
      return { start: d.toISOString().split('T')[0], end, label: 'Last 6 Months' };
    }
    case '1y': {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      return { start: d.toISOString().split('T')[0], end, label: 'Last Year' };
    }
    default:
      return null;
  }
}

export default function DateRangeSelector({
  selectedRange,
  onRangeChange,
  earliestDate,
  latestDate,
}: DateRangeSelectorProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [customStart, setCustomStart] = useState(earliestDate);
  const [customEnd, setCustomEnd] = useState(latestDate);
  const [activePreset, setActivePreset] = useState('all');

  const handlePresetPress = (value: string) => {
    if (value === 'custom') {
      setShowCustom(true);
      return;
    }
    setActivePreset(value);
    const range = getPresetRange(value, earliestDate, latestDate);
    onRangeChange(range);
  };

  const handleCustomApply = () => {
    if (customStart && customEnd) {
      setActivePreset('custom');
      onRangeChange({
        start: customStart,
        end: customEnd,
        label: `${formatShortDate(customStart)} - ${formatShortDate(customEnd)}`,
      });
      setShowCustom(false);
    }
  };

  const formatShortDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="calendar-outline" size={16} color={COLORS.accent} />
        <Text style={styles.headerText}>Date Range</Text>
        {selectedRange && (
          <View style={styles.activeBadge}>
            <Text style={styles.activeBadgeText}>{selectedRange.label}</Text>
          </View>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.presetRow}
      >
        {PRESET_RANGES.map(preset => (
          <TouchableOpacity
            key={preset.value}
            style={[
              styles.presetChip,
              activePreset === preset.value && styles.presetChipActive,
            ]}
            onPress={() => handlePresetPress(preset.value)}
            activeOpacity={0.7}
          >
            {preset.value === 'custom' && (
              <Ionicons
                name="options-outline"
                size={12}
                color={activePreset === 'custom' ? '#fff' : COLORS.textSecondary}
              />
            )}
            <Text
              style={[
                styles.presetText,
                activePreset === preset.value && styles.presetTextActive,
              ]}
            >
              {preset.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Custom Date Modal */}
      <Modal visible={showCustom} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Custom Date Range</Text>
              <TouchableOpacity onPress={() => setShowCustom(false)}>
                <Ionicons name="close" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.dateInputRow}>
              <View style={styles.dateInputGroup}>
                <Text style={styles.dateLabel}>Start Date</Text>
                {Platform.OS === 'web' ? (
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e: any) => setCustomStart(e.target.value)}
                    min={earliestDate}
                    max={customEnd || latestDate}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1.5px solid #d4dfe8',
                      fontSize: 14,
                      color: '#0A3D5C',
                      fontFamily: 'system-ui',
                      width: '100%',
                      outline: 'none',
                    }}
                  />
                ) : (
                  <TextInput
                    style={styles.dateInput}
                    value={customStart}
                    onChangeText={setCustomStart}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={COLORS.textMuted}
                  />
                )}
              </View>
              <View style={styles.dateInputSeparator}>
                <Ionicons name="arrow-forward" size={16} color={COLORS.textMuted} />
              </View>
              <View style={styles.dateInputGroup}>
                <Text style={styles.dateLabel}>End Date</Text>
                {Platform.OS === 'web' ? (
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e: any) => setCustomEnd(e.target.value)}
                    min={customStart || earliestDate}
                    max={latestDate}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1.5px solid #d4dfe8',
                      fontSize: 14,
                      color: '#0A3D5C',
                      fontFamily: 'system-ui',
                      width: '100%',
                      outline: 'none',
                    }}
                  />
                ) : (
                  <TextInput
                    style={styles.dateInput}
                    value={customEnd}
                    onChangeText={setCustomEnd}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={COLORS.textMuted}
                  />
                )}
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowCustom(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.applyBtn}
                onPress={handleCustomApply}
                activeOpacity={0.8}
              >
                <Ionicons name="checkmark" size={16} color="#fff" />
                <Text style={styles.applyBtnText}>Apply Range</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  headerText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.text,
  },
  activeBadge: {
    backgroundColor: COLORS.accent + '15',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },
  activeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.accent,
  },
  presetRow: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.white,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  presetChipActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  presetText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  presetTextActive: {
    color: '#fff',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 61, 92, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    width: '100%',
    maxWidth: 420,
    ...SHADOWS.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  modalTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.text,
  },
  dateInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  dateInputGroup: {
    flex: 1,
  },
  dateLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  dateInput: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },
  dateInputSeparator: {
    paddingBottom: SPACING.md,
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  cancelBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  applyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.accent,
  },
  applyBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: '#fff',
  },
});
