import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';

interface TimePickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (time: string) => void; // "HH:MM" 24h format
  currentTime: string; // "HH:MM" 24h format
  title?: string;
}

export default function TimePickerModal({
  visible,
  onClose,
  onSelect,
  currentTime,
  title = 'Select Time',
}: TimePickerModalProps) {
  const [hour, setHour] = useState(8);
  const [minute, setMinute] = useState(0);
  const [ampm, setAmpm] = useState<'AM' | 'PM'>('AM');

  useEffect(() => {
    if (visible && currentTime) {
      const [hStr, mStr] = currentTime.split(':');
      const h24 = parseInt(hStr, 10) || 0;
      const m = parseInt(mStr, 10) || 0;
      const isPM = h24 >= 12;
      const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
      setHour(h12);
      setMinute(m);
      setAmpm(isPM ? 'PM' : 'AM');
    }
  }, [visible, currentTime]);

  const handleConfirm = () => {
    let h24 = hour;
    if (ampm === 'PM' && hour !== 12) h24 = hour + 12;
    if (ampm === 'AM' && hour === 12) h24 = 0;
    const timeStr = `${h24.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    onSelect(timeStr);
    onClose();
  };

  const hours = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity activeOpacity={1} style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="time-outline" size={20} color={COLORS.accent} />
            </View>
            <Text style={styles.headerTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Current selection display */}
          <View style={styles.currentDisplay}>
            <Text style={styles.currentTime}>
              {hour}:{minute.toString().padStart(2, '0')} {ampm}
            </Text>
          </View>

          {/* Hour selector */}
          <Text style={styles.selectorLabel}>Hour</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.selectorRow}
          >
            {hours.map((h) => (
              <TouchableOpacity
                key={h}
                style={[styles.selectorItem, hour === h && styles.selectorItemActive]}
                onPress={() => setHour(h)}
              >
                <Text style={[styles.selectorText, hour === h && styles.selectorTextActive]}>
                  {h}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Minute selector */}
          <Text style={styles.selectorLabel}>Minute</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.selectorRow}
          >
            {minutes.map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.selectorItem, minute === m && styles.selectorItemActive]}
                onPress={() => setMinute(m)}
              >
                <Text style={[styles.selectorText, minute === m && styles.selectorTextActive]}>
                  {m.toString().padStart(2, '0')}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* AM/PM selector */}
          <Text style={styles.selectorLabel}>Period</Text>
          <View style={styles.ampmRow}>
            <TouchableOpacity
              style={[styles.ampmBtn, ampm === 'AM' && styles.ampmBtnActive]}
              onPress={() => setAmpm('AM')}
            >
              <Text style={[styles.ampmText, ampm === 'AM' && styles.ampmTextActive]}>AM</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.ampmBtn, ampm === 'PM' && styles.ampmBtnActive]}
              onPress={() => setAmpm('PM')}
            >
              <Text style={[styles.ampmText, ampm === 'PM' && styles.ampmTextActive]}>PM</Text>
            </TouchableOpacity>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm}>
              <Ionicons name="checkmark" size={18} color={COLORS.white} />
              <Text style={styles.confirmText}>Set Time</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
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
  container: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    width: '100%',
    maxWidth: 380,
    padding: SPACING.xl,
    ...SHADOWS.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.accent + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  headerTitle: {
    flex: 1,
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.text,
  },
  closeBtn: {
    padding: 4,
  },
  currentDisplay: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
  },
  currentTime: {
    fontSize: FONT_SIZES.xxxl,
    fontWeight: '800',
    color: COLORS.accent,
    letterSpacing: 1,
  },
  selectorLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACING.sm,
    marginTop: SPACING.sm,
  },
  selectorRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  selectorItem: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectorItemActive: {
    backgroundColor: COLORS.accent + '15',
    borderColor: COLORS.accent,
  },
  selectorText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  selectorTextActive: {
    color: COLORS.accent,
    fontWeight: '800',
  },
  ampmRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  ampmBtn: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  ampmBtnActive: {
    backgroundColor: COLORS.accent + '15',
    borderColor: COLORS.accent,
  },
  ampmText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  ampmTextActive: {
    color: COLORS.accent,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.background,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  confirmBtn: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  confirmText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.white,
  },
});
