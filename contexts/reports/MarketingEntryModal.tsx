import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
  Pressable, FlatList, SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import { MarketingChannel, MarketingEntry, getCurrentMonth, getMonthLabel } from '../../lib/marketingService';

interface MarketingEntryModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (entry: {
    channel_id: string;
    month: string;
    investment: number;
    leads: number;
    clients: number;
    revenue: number;
    notes?: string;
  }) => Promise<void>;
  channels: MarketingChannel[];
  editEntry?: MarketingEntry | null;
  selectedMonth?: string;
}

export default function MarketingEntryModal({
  visible, onClose, onSave, channels, editEntry, selectedMonth,
}: MarketingEntryModalProps) {
  const [channelId, setChannelId] = useState('');
  const [month, setMonth] = useState(selectedMonth || getCurrentMonth());
  const [investment, setInvestment] = useState('');
  const [leads, setLeads] = useState('');
  const [clients, setClients] = useState('');
  const [revenue, setRevenue] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Separate modal states for pickers
  const [showChannelPicker, setShowChannelPicker] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [channelSearch, setChannelSearch] = useState('');

  const activeChannels = useMemo(() => channels.filter(c => c.is_active), [channels]);

  const filteredChannels = useMemo(() => {
    if (!channelSearch.trim()) return activeChannels;
    const q = channelSearch.toLowerCase().trim();
    return activeChannels.filter(c => c.name.toLowerCase().includes(q));
  }, [activeChannels, channelSearch]);

  useEffect(() => {
    if (visible) {
      if (editEntry) {
        setChannelId(editEntry.channel_id);
        setMonth(editEntry.month);
        setInvestment(String(editEntry.investment));
        setLeads(String(editEntry.leads));
        setClients(String(editEntry.clients));
        setRevenue(String(editEntry.revenue));
        setNotes(editEntry.notes || '');
      } else {
        setChannelId('');
        setMonth(selectedMonth || getCurrentMonth());
        setInvestment('');
        setLeads('');
        setClients('');
        setRevenue('');
        setNotes('');
      }
      setError('');
      setChannelSearch('');
    }
  }, [visible, editEntry, selectedMonth]);

  // Calculated preview metrics
  const investmentNum = parseFloat(investment) || 0;
  const leadsNum = parseInt(leads) || 0;
  const clientsNum = parseInt(clients) || 0;
  const revenueNum = parseFloat(revenue) || 0;

  const leadCost = leadsNum > 0 ? investmentNum / leadsNum : 0;
  const conversionRate = leadsNum > 0 ? (clientsNum / leadsNum) * 100 : 0;
  const costPerClient = clientsNum > 0 ? investmentNum / clientsNum : 0;
  const revenuePerClient = clientsNum > 0 ? revenueNum / clientsNum : 0;
  const profit = revenueNum - investmentNum;
  const roi = investmentNum > 0 ? ((revenueNum - investmentNum) / investmentNum) * 100 : 0;

  const selectedChannel = activeChannels.find(c => c.id === channelId);

  // Generate month options (last 24 months + next 3)
  const monthOptions = useMemo(() => {
    const options: string[] = [];
    const now = new Date();
    for (let i = -3; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      options.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return options;
  }, []);

  const handleSave = async () => {
    if (!channelId) { setError('Please select a channel'); return; }
    if (!month) { setError('Please select a month'); return; }

    setSaving(true);
    setError('');
    try {
      await onSave({
        channel_id: channelId,
        month,
        investment: investmentNum,
        leads: leadsNum,
        clients: clientsNum,
        revenue: revenueNum,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleSelectChannel = (id: string) => {
    setChannelId(id);
    setShowChannelPicker(false);
    setChannelSearch('');
  };

  const handleSelectMonth = (m: string) => {
    setMonth(m);
    setShowMonthPicker(false);
  };

  // ============ Channel Picker Modal ============
  const renderChannelPickerModal = () => (
    <Modal
      visible={showChannelPicker}
      animationType="slide"
      transparent
      onRequestClose={() => setShowChannelPicker(false)}
    >
      <SafeAreaView style={pickerStyles.overlay}>
        <View style={pickerStyles.container}>
          {/* Header */}
          <View style={pickerStyles.header}>
            <Text style={pickerStyles.headerTitle}>Select Channel</Text>
            <TouchableOpacity
              onPress={() => { setShowChannelPicker(false); setChannelSearch(''); }}
              style={pickerStyles.closeBtn}
            >
              <Ionicons name="close" size={22} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={pickerStyles.searchRow}>
            <Ionicons name="search" size={18} color={COLORS.textMuted} />
            <TextInput
              style={pickerStyles.searchInput}
              placeholder="Search channels..."
              placeholderTextColor={COLORS.textMuted}
              value={channelSearch}
              onChangeText={setChannelSearch}
              autoFocus={Platform.OS !== 'web'}
            />
            {channelSearch.length > 0 && (
              <TouchableOpacity onPress={() => setChannelSearch('')}>
                <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Channel List */}
          <FlatList
            data={filteredChannels}
            keyExtractor={(item) => item.id}
            style={pickerStyles.list}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const isSelected = item.id === channelId;
              return (
                <TouchableOpacity
                  style={[pickerStyles.option, isSelected && pickerStyles.optionActive]}
                  onPress={() => handleSelectChannel(item.id)}
                  activeOpacity={0.6}
                >
                  <View style={[pickerStyles.optionIcon, isSelected && pickerStyles.optionIconActive]}>
                    <Ionicons
                      name="megaphone-outline"
                      size={16}
                      color={isSelected ? COLORS.white : COLORS.textMuted}
                    />
                  </View>
                  <Text style={[pickerStyles.optionText, isSelected && pickerStyles.optionTextActive]}>
                    {item.name}
                  </Text>
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={20} color={COLORS.accent} />
                  )}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={pickerStyles.emptyState}>
                <Ionicons name="search-outline" size={32} color={COLORS.textMuted} />
                <Text style={pickerStyles.emptyText}>No channels found</Text>
              </View>
            }
          />
        </View>
      </SafeAreaView>
    </Modal>
  );

  // ============ Month Picker Modal ============
  const renderMonthPickerModal = () => (
    <Modal
      visible={showMonthPicker}
      animationType="slide"
      transparent
      onRequestClose={() => setShowMonthPicker(false)}
    >
      <SafeAreaView style={pickerStyles.overlay}>
        <View style={pickerStyles.container}>
          {/* Header */}
          <View style={pickerStyles.header}>
            <Text style={pickerStyles.headerTitle}>Select Month</Text>
            <TouchableOpacity
              onPress={() => setShowMonthPicker(false)}
              style={pickerStyles.closeBtn}
            >
              <Ionicons name="close" size={22} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Month List */}
          <FlatList
            data={monthOptions}
            keyExtractor={(item) => item}
            style={pickerStyles.list}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const isSelected = item === month;
              const isCurrent = item === getCurrentMonth();
              return (
                <TouchableOpacity
                  style={[pickerStyles.option, isSelected && pickerStyles.optionActive]}
                  onPress={() => handleSelectMonth(item)}
                  activeOpacity={0.6}
                >
                  <View style={[pickerStyles.optionIcon, isSelected && pickerStyles.optionIconActive]}>
                    <Ionicons
                      name="calendar-outline"
                      size={16}
                      color={isSelected ? COLORS.white : COLORS.textMuted}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[pickerStyles.optionText, isSelected && pickerStyles.optionTextActive]}>
                      {getMonthLabel(item)}
                    </Text>
                    {isCurrent && (
                      <Text style={pickerStyles.currentBadge}>Current Month</Text>
                    )}
                  </View>
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={20} color={COLORS.accent} />
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.overlayBg} onPress={onClose} />
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIcon}>
                <Ionicons name="megaphone" size={20} color={COLORS.white} />
              </View>
              <Text style={styles.headerTitle}>
                {editEntry ? 'Edit Entry' : 'Add Marketing Data'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {error ? (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color={COLORS.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Channel Selector - opens separate modal */}
            <Text style={styles.label}>Marketing Channel</Text>
            <TouchableOpacity
              style={[styles.pickerBtn, !selectedChannel && styles.pickerBtnEmpty]}
              onPress={() => setShowChannelPicker(true)}
              activeOpacity={0.7}
            >
              <View style={styles.pickerBtnIcon}>
                <Ionicons
                  name="megaphone-outline"
                  size={16}
                  color={selectedChannel ? COLORS.accent : COLORS.textMuted}
                />
              </View>
              <Text style={[styles.pickerText, !selectedChannel && styles.pickerPlaceholder]}>
                {selectedChannel?.name || 'Tap to select a channel...'}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>

            {/* Month Selector - opens separate modal */}
            <Text style={styles.label}>Month</Text>
            <TouchableOpacity
              style={styles.pickerBtn}
              onPress={() => setShowMonthPicker(true)}
              activeOpacity={0.7}
            >
              <View style={styles.pickerBtnIcon}>
                <Ionicons name="calendar-outline" size={16} color={COLORS.accent} />
              </View>
              <Text style={styles.pickerText}>{getMonthLabel(month)}</Text>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>

            {/* Input Fields */}
            <Text style={styles.sectionTitle}>Input Data</Text>

            <View style={styles.inputRow}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Investment ($)</Text>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputPrefix}>$</Text>
                  <TextInput
                    style={styles.input}
                    value={investment}
                    onChangeText={setInvestment}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={COLORS.textMuted}
                  />
                </View>
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Leads</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="people-outline" size={16} color={COLORS.textMuted} style={{ marginLeft: 10 }} />
                  <TextInput
                    style={styles.input}
                    value={leads}
                    onChangeText={setLeads}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={COLORS.textMuted}
                  />
                </View>
              </View>
            </View>

            <View style={styles.inputRow}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Clients (Converted)</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="person-add-outline" size={16} color={COLORS.textMuted} style={{ marginLeft: 10 }} />
                  <TextInput
                    style={styles.input}
                    value={clients}
                    onChangeText={setClients}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={COLORS.textMuted}
                  />
                </View>
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Revenue ($)</Text>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputPrefix}>$</Text>
                  <TextInput
                    style={styles.input}
                    value={revenue}
                    onChangeText={setRevenue}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={COLORS.textMuted}
                  />
                </View>
              </View>
            </View>

            <Text style={styles.label}>Notes (Optional)</Text>
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Add notes about this campaign..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              numberOfLines={3}
            />

            {/* Calculated Metrics Preview */}
            {(investmentNum > 0 || leadsNum > 0 || clientsNum > 0 || revenueNum > 0) && (
              <>
                <Text style={styles.sectionTitle}>Calculated Metrics Preview</Text>
                <View style={styles.metricsPreview}>
                  <View style={styles.metricRow}>
                    <View style={styles.metricItem}>
                      <Text style={styles.metricLabel}>Lead Cost</Text>
                      <Text style={styles.metricValue}>${leadCost.toFixed(2)}</Text>
                    </View>
                    <View style={styles.metricItem}>
                      <Text style={styles.metricLabel}>Conversion Rate</Text>
                      <Text style={styles.metricValue}>{conversionRate.toFixed(1)}%</Text>
                    </View>
                  </View>
                  <View style={styles.metricRow}>
                    <View style={styles.metricItem}>
                      <Text style={styles.metricLabel}>Cost / Client</Text>
                      <Text style={styles.metricValue}>${costPerClient.toFixed(2)}</Text>
                    </View>
                    <View style={styles.metricItem}>
                      <Text style={styles.metricLabel}>Revenue / Client</Text>
                      <Text style={styles.metricValue}>${revenuePerClient.toFixed(2)}</Text>
                    </View>
                  </View>
                  <View style={styles.metricRow}>
                    <View style={styles.metricItem}>
                      <Text style={styles.metricLabel}>Profit</Text>
                      <Text style={[styles.metricValue, { color: profit >= 0 ? COLORS.success : COLORS.danger }]}>
                        ${profit.toFixed(2)}
                      </Text>
                    </View>
                    <View style={styles.metricItem}>
                      <Text style={styles.metricLabel}>ROI</Text>
                      <Text style={[styles.metricValue, { color: roi >= 0 ? COLORS.success : COLORS.danger }]}>
                        {roi.toFixed(1)}%
                      </Text>
                    </View>
                  </View>
                </View>
              </>
            )}

            <View style={{ height: 20 }} />
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
                  <Ionicons name="checkmark" size={18} color={COLORS.white} />
                  <Text style={styles.saveBtnText}>{editEntry ? 'Update' : 'Save Entry'}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Separate picker modals rendered outside the main modal content */}
      {renderChannelPickerModal()}
      {renderMonthPickerModal()}
    </Modal>
  );
}

// ============ Picker Modal Styles ============
const pickerStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    maxHeight: '70%',
    minHeight: 300,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.primary,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.lg,
    marginVertical: SPACING.sm,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: Platform.OS === 'ios' ? SPACING.sm : 0,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    paddingVertical: SPACING.sm,
  },
  list: {
    flex: 1,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  optionActive: {
    backgroundColor: COLORS.accent + '10',
  },
  optionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIconActive: {
    backgroundColor: COLORS.accent,
  },
  optionText: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    fontWeight: '500',
  },
  optionTextActive: {
    color: COLORS.accent,
    fontWeight: '700',
  },
  currentBadge: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.accent,
    fontWeight: '600',
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxxl,
    gap: SPACING.sm,
  },
  emptyText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
});

// ============ Main Modal Styles ============
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  overlayBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.overlay,
  },
  container: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    maxHeight: '92%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.primary,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.dangerLight,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.md,
  },
  errorText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.danger,
    fontWeight: '600',
    flex: 1,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  label: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 4,
    marginTop: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  pickerBtnEmpty: {
    borderColor: COLORS.accent + '60',
    borderStyle: 'dashed' as any,
  },
  pickerBtnIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerText: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    fontWeight: '600',
  },
  pickerPlaceholder: {
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  inputRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  inputGroup: {
    flex: 1,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  inputPrefix: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textMuted,
    fontWeight: '600',
    paddingLeft: SPACING.md,
  },
  input: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    fontWeight: '600',
  },
  notesInput: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  metricsPreview: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    gap: SPACING.sm,
    ...SHADOWS.sm,
  },
  metricRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  metricItem: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '500',
    marginBottom: 2,
  },
  metricValue: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.primary,
  },
  footer: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    backgroundColor: COLORS.borderLight,
  },
  cancelBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  saveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
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
