import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import { SevenStrategiesEntry, SevenStrategiesInput, getMonthLabel } from '../../lib/sevenStrategiesService';

interface Franchise {
  id: string;
  name: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSave: (entry: SevenStrategiesInput) => Promise<void>;
  franchises: Franchise[];
  selectedMonth: string;
  editEntry?: SevenStrategiesEntry | null;
  userFranchiseId?: string | null;
  userFranchiseName?: string | null;
}

export default function SevenStrategiesEntryModal({
  visible, onClose, onSave, franchises, selectedMonth,
  editEntry, userFranchiseId, userFranchiseName,
}: Props) {
  const [selectedFranchise, setSelectedFranchise] = useState<string>('');
  const [leadCount, setLeadCount] = useState('');
  const [callCount, setCallCount] = useState('');
  const [jumpstartCount, setJumpstartCount] = useState('');
  const [newClientCount, setNewClientCount] = useState('');
  const [totalClientCount, setTotalClientCount] = useState('');
  const [clientsLost, setClientsLost] = useState('');
  const [totalRevenue, setTotalRevenue] = useState('');
  const [totalExpenses, setTotalExpenses] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showFranchisePicker, setShowFranchisePicker] = useState(false);

  useEffect(() => {
    if (visible) {
      if (editEntry) {
        setSelectedFranchise(editEntry.franchise_id);
        setLeadCount(String(editEntry.lead_count));
        setCallCount(String(editEntry.call_count));
        setJumpstartCount(String(editEntry.jumpstart_count));
        setNewClientCount(String(editEntry.new_client_count));
        setTotalClientCount(String(editEntry.total_client_count));
        setClientsLost(String(editEntry.clients_lost));
        setTotalRevenue(String(editEntry.total_revenue));
        setTotalExpenses(String(editEntry.total_expenses));
      } else {
        setSelectedFranchise(userFranchiseId || (franchises.length === 1 ? franchises[0].id : ''));
        setLeadCount('');
        setCallCount('');
        setJumpstartCount('');
        setNewClientCount('');
        setTotalClientCount('');
        setClientsLost('');
        setTotalRevenue('');
        setTotalExpenses('');
      }
      setError('');
    }
  }, [visible, editEntry, userFranchiseId, franchises]);

  const getFranchiseName = (id: string): string => {
    if (userFranchiseId === id && userFranchiseName) return userFranchiseName;
    return franchises.find(f => f.id === id)?.name || '';
  };

  const handleSave = async () => {
    if (!selectedFranchise) {
      setError('Please select a franchise.');
      return;
    }

    const nums = {
      lead_count: parseInt(leadCount) || 0,
      call_count: parseInt(callCount) || 0,
      jumpstart_count: parseInt(jumpstartCount) || 0,
      new_client_count: parseInt(newClientCount) || 0,
      total_client_count: parseInt(totalClientCount) || 0,
      clients_lost: parseInt(clientsLost) || 0,
      total_revenue: parseFloat(totalRevenue) || 0,
      total_expenses: parseFloat(totalExpenses) || 0,
    };

    setSaving(true);
    setError('');
    try {
      await onSave({
        franchise_id: selectedFranchise,
        franchise_name: getFranchiseName(selectedFranchise),
        month: selectedMonth,
        ...nums,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save entry.');
    } finally {
      setSaving(false);
    }
  };

  const renderField = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    icon: string,
    placeholder: string,
    isCurrency = false,
  ) => (
    <View style={styles.fieldRow}>
      <View style={styles.fieldLabelRow}>
        <Ionicons name={icon as any} size={16} color={COLORS.accent} />
        <Text style={styles.fieldLabel}>{label}</Text>
      </View>
      <View style={styles.inputWrapper}>
        {isCurrency && <Text style={styles.currencyPrefix}>$</Text>}
        <TextInput
          style={[styles.input, isCurrency && styles.inputWithPrefix]}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textMuted}
          keyboardType="numeric"
        />
      </View>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>
                {editEntry ? 'Edit Entry' : 'New Entry'}
              </Text>
              <Text style={styles.headerSubtitle}>
                {getMonthLabel(selectedMonth)}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Franchise Selector — hidden when user is scoped to a single franchise */}
            {!userFranchiseId && franchises.length > 1 && (
              <View style={styles.fieldRow}>
                <View style={styles.fieldLabelRow}>
                  <Ionicons name="business" size={16} color={COLORS.accent} />
                  <Text style={styles.fieldLabel}>Franchise</Text>
                </View>
                <TouchableOpacity
                  style={styles.franchiseSelector}
                  onPress={() => setShowFranchisePicker(!showFranchisePicker)}
                >
                  <Text style={[
                    styles.franchiseSelectorText,
                    !selectedFranchise && { color: COLORS.textMuted },
                  ]}>
                    {selectedFranchise ? getFranchiseName(selectedFranchise) : 'Select franchise...'}
                  </Text>
                  <Ionicons
                    name={showFranchisePicker ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={COLORS.textMuted}
                  />
                </TouchableOpacity>
                {showFranchisePicker && (
                  <View style={styles.franchiseList}>
                    {franchises.map(f => (
                      <TouchableOpacity
                        key={f.id}
                        style={[
                          styles.franchiseOption,
                          selectedFranchise === f.id && styles.franchiseOptionActive,
                        ]}
                        onPress={() => {
                          setSelectedFranchise(f.id);
                          setShowFranchisePicker(false);
                        }}
                      >
                        <Text style={[
                          styles.franchiseOptionText,
                          selectedFranchise === f.id && styles.franchiseOptionTextActive,
                        ]}>
                          {f.name}
                        </Text>
                        {selectedFranchise === f.id && (
                          <Ionicons name="checkmark" size={16} color={COLORS.accent} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}


            {/* Section: Lead Generation */}
            <View style={styles.sectionDivider}>
              <View style={styles.sectionDividerLine} />
              <Text style={styles.sectionDividerText}>Lead Generation</Text>
              <View style={styles.sectionDividerLine} />
            </View>

            {renderField('Leads', leadCount, setLeadCount, 'megaphone-outline', '0')}

            {renderField('Conversations', callCount, setCallCount, 'chatbubbles-outline', '0')}
            {renderField('Jumpstarts', jumpstartCount, setJumpstartCount, 'flash-outline', '0')}

            {/* Section: Client Metrics */}
            <View style={styles.sectionDivider}>
              <View style={styles.sectionDividerLine} />
              <Text style={styles.sectionDividerText}>Client Metrics</Text>
              <View style={styles.sectionDividerLine} />
            </View>

            {renderField('New Clients', newClientCount, setNewClientCount, 'person-add-outline', '0')}
            {renderField('Total Clients', totalClientCount, setTotalClientCount, 'people-outline', '0')}
            {renderField('Clients Lost', clientsLost, setClientsLost, 'person-remove-outline', '0')}


            {/* Section: Financials */}
            <View style={styles.sectionDivider}>
              <View style={styles.sectionDividerLine} />
              <Text style={styles.sectionDividerText}>Financials</Text>
              <View style={styles.sectionDividerLine} />
            </View>

            {renderField('Total Revenue', totalRevenue, setTotalRevenue, 'cash-outline', '0.00', true)}
            {renderField('Total Expenses', totalExpenses, setTotalExpenses, 'receipt-outline', '0.00', true)}

            {/* Error */}
            {error ? (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color={COLORS.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={{ height: SPACING.lg }} />
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={18} color={COLORS.white} />
                  <Text style={styles.saveBtnText}>
                    {editEntry ? 'Update' : 'Save Entry'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    maxHeight: '90%',
    ...SHADOWS.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: COLORS.primary,
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  body: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
  },
  fieldRow: {
    marginBottom: SPACING.md,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  fieldLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.text,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  currencyPrefix: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textSecondary,
    paddingLeft: SPACING.md,
  },
  input: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    fontWeight: '600',
  },
  inputWithPrefix: {
    paddingLeft: SPACING.xs,
  },
  // Franchise selector
  franchiseFixed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  franchiseFixedText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.primary,
  },
  franchiseSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  franchiseSelectorText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.text,
  },
  franchiseList: {
    marginTop: SPACING.xs,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  franchiseOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  franchiseOptionActive: {
    backgroundColor: COLORS.brandBlue50,
  },
  franchiseOptionText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: '500',
  },
  franchiseOptionTextActive: {
    color: COLORS.accent,
    fontWeight: '700',
  },
  // Section dividers
  sectionDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginVertical: SPACING.md,
  },
  sectionDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.borderLight,
  },
  sectionDividerText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.dangerLight,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.sm,
  },
  errorText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.danger,
    fontWeight: '600',
    flex: 1,
  },
  // Footer
  footer: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  cancelBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  saveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.accent,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.white,
  },
});
