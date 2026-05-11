import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView,
  ActivityIndicator, TextInput, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import {
  ClientJourney, RevenueEvent,
  getClientJourneyDetail, addRevenueEvent, deleteRevenueEvent,
  formatCurrencyFull, formatDate, daysBetween,
} from '../../lib/marketingService';

interface Props {
  visible: boolean;
  onClose: () => void;
  clientId: string | null;
  onRefresh?: () => void;
}

const EVENT_TYPE_OPTIONS = [
  { label: 'Payment', value: 'payment', icon: 'card-outline', color: COLORS.success },
  { label: 'Package', value: 'package', icon: 'cube-outline', color: COLORS.accent },
  { label: 'Renewal', value: 'renewal', icon: 'refresh-outline', color: COLORS.info },
  { label: 'Refund', value: 'refund', icon: 'arrow-undo-outline', color: COLORS.danger },
  { label: 'Other', value: 'other', icon: 'ellipsis-horizontal-outline', color: COLORS.textMuted },
];

export default function ClientJourneyModal({ visible, onClose, clientId, onRefresh }: Props) {
  const [journey, setJourney] = useState<ClientJourney | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Add revenue event form
  const [showAddRevenue, setShowAddRevenue] = useState(false);
  const [revAmount, setRevAmount] = useState('');
  const [revDescription, setRevDescription] = useState('');
  const [revDate, setRevDate] = useState(new Date().toISOString().split('T')[0]);
  const [revType, setRevType] = useState('payment');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible && clientId) {
      loadJourney();
    }
  }, [visible, clientId]);

  const loadJourney = async () => {
    if (!clientId) return;
    setLoading(true);
    setError('');
    try {
      const data = await getClientJourneyDetail(clientId);
      setJourney(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load journey');
    } finally {
      setLoading(false);
    }
  };

  const handleAddRevenue = async () => {
    if (!clientId || !revAmount) return;
    setSaving(true);
    try {
      await addRevenueEvent({
        client_id: clientId,
        amount: parseFloat(revAmount),
        description: revDescription || undefined,
        event_date: revDate,
        event_type: revType,
      });
      setShowAddRevenue(false);
      setRevAmount('');
      setRevDescription('');
      setRevType('payment');
      await loadJourney();
      onRefresh?.();
    } catch (err: any) {
      const msg = err.message || 'Failed to add revenue event';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRevenue = (event: RevenueEvent) => {
    const doDelete = async () => {
      try {
        await deleteRevenueEvent(event.id);
        await loadJourney();
        onRefresh?.();
      } catch (err: any) {
        const msg = err.message || 'Failed to delete';
        if (Platform.OS === 'web') alert(msg);
        else Alert.alert('Error', msg);
      }
    };
    if (Platform.OS === 'web') {
      if (confirm(`Delete this ${event.event_type} of ${formatCurrencyFull(event.amount)}?`)) doDelete();
    } else {
      Alert.alert('Delete Event', `Delete this ${event.event_type}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const handleClose = () => {
    setJourney(null);
    setShowAddRevenue(false);
    setError('');
    onClose();
  };

  // Build timeline events
  const buildTimeline = () => {
    if (!journey) return [];
    const events: { date: string; type: string; title: string; subtitle: string; icon: string; color: string; amount?: number }[] = [];

    if (journey.lead_source_date) {
      events.push({
        date: journey.lead_source_date,
        type: 'first_touch',
        title: 'First Touch',
        subtitle: `Lead via ${journey.channel_name}`,
        icon: 'megaphone-outline',
        color: COLORS.info,
      });
    }

    events.push({
      date: journey.created_at,
      type: 'account_created',
      title: 'Account Created',
      subtitle: journey.franchise ? `Franchise: ${journey.franchise}` : 'Client registered',
      icon: 'person-add-outline',
      color: COLORS.accent,
    });

    if (journey.conversion_date) {
      events.push({
        date: journey.conversion_date,
        type: 'conversion',
        title: 'Converted to Client',
        subtitle: journey.program ? `Program: ${journey.program}` : 'Became a paying client',
        icon: 'checkmark-circle-outline',
        color: COLORS.success,
      });
    }

    journey.revenue_events.forEach(rev => {
      const typeInfo = EVENT_TYPE_OPTIONS.find(t => t.value === rev.event_type) || EVENT_TYPE_OPTIONS[4];
      events.push({
        date: rev.event_date,
        type: rev.event_type,
        title: `${typeInfo.label}: ${formatCurrencyFull(rev.amount)}`,
        subtitle: rev.description || rev.event_type,
        icon: typeInfo.icon,
        color: typeInfo.color,
        amount: rev.event_type === 'refund' ? -rev.amount : rev.amount,
      });
    });

    events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return events;
  };

  const timeline = journey ? buildTimeline() : [];
  const daysToConvert = journey ? daysBetween(journey.lead_source_date || journey.created_at, journey.conversion_date) : null;

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIcon}>
                <Ionicons name="git-branch-outline" size={20} color={COLORS.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerTitle} numberOfLines={1}>
                  {journey?.full_name || 'Client Journey'}
                </Text>
                <Text style={styles.headerSubtitle}>Attribution Timeline</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
              <Ionicons name="close" size={22} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.accent} />
              <Text style={styles.loadingText}>Loading journey...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={32} color={COLORS.danger} />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={loadJourney}>
                <Text style={styles.retryBtnText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : journey ? (
            <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
              {/* Summary Cards */}
              <View style={styles.summaryRow}>
                <View style={styles.summaryCard}>
                  <Ionicons name="megaphone" size={18} color={COLORS.info} />
                  <Text style={styles.summaryLabel}>Lead Source</Text>
                  <Text style={styles.summaryValue} numberOfLines={1}>{journey.channel_name}</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Ionicons name="wallet" size={18} color={COLORS.success} />
                  <Text style={styles.summaryLabel}>Lifetime Value</Text>
                  <Text style={[styles.summaryValue, { color: COLORS.success }]}>
                    {formatCurrencyFull(journey.ltv)}
                  </Text>
                </View>
              </View>

              <View style={styles.summaryRow}>
                <View style={styles.summaryCard}>
                  <Ionicons name="time" size={18} color={COLORS.warning} />
                  <Text style={styles.summaryLabel}>Days to Convert</Text>
                  <Text style={styles.summaryValue}>
                    {daysToConvert !== null ? `${daysToConvert} days` : 'N/A'}
                  </Text>
                </View>
                <View style={styles.summaryCard}>
                  <Ionicons name="receipt" size={18} color={COLORS.accent} />
                  <Text style={styles.summaryLabel}>Revenue Events</Text>
                  <Text style={styles.summaryValue}>{journey.revenue_events.length}</Text>
                </View>
              </View>

              {/* Client Info */}
              <View style={styles.infoCard}>
                <View style={styles.infoRow}>
                  <Ionicons name="mail-outline" size={14} color={COLORS.textMuted} />
                  <Text style={styles.infoText}>{journey.email}</Text>
                </View>
                {journey.franchise && (
                  <View style={styles.infoRow}>
                    <Ionicons name="business-outline" size={14} color={COLORS.textMuted} />
                    <Text style={styles.infoText}>{journey.franchise}</Text>
                  </View>
                )}
                {journey.program && (
                  <View style={styles.infoRow}>
                    <Ionicons name="clipboard-outline" size={14} color={COLORS.textMuted} />
                    <Text style={styles.infoText}>{journey.program}</Text>
                  </View>
                )}
                {journey.status && (
                  <View style={styles.infoRow}>
                    <Ionicons name="pulse-outline" size={14} color={COLORS.textMuted} />
                    <Text style={styles.infoText}>Status: {journey.status}</Text>
                  </View>
                )}
              </View>

              {/* Timeline */}
              <View style={styles.sectionHeader}>
                <Ionicons name="git-branch" size={16} color={COLORS.accent} />
                <Text style={styles.sectionTitle}>Journey Timeline</Text>
              </View>

              <View style={styles.timeline}>
                {timeline.map((event, i) => (
                  <View key={i} style={styles.timelineItem}>
                    <View style={styles.timelineLine}>
                      <View style={[styles.timelineDot, { backgroundColor: event.color }]}>
                        <Ionicons name={event.icon as any} size={12} color={COLORS.white} />
                      </View>
                      {i < timeline.length - 1 && <View style={styles.timelineConnector} />}
                    </View>
                    <View style={styles.timelineContent}>
                      <Text style={styles.timelineDate}>{formatDate(event.date)}</Text>
                      <Text style={styles.timelineTitle}>{event.title}</Text>
                      <Text style={styles.timelineSubtitle}>{event.subtitle}</Text>
                    </View>
                  </View>
                ))}
                {timeline.length === 0 && (
                  <View style={styles.emptyTimeline}>
                    <Ionicons name="time-outline" size={24} color={COLORS.textMuted} />
                    <Text style={styles.emptyTimelineText}>No timeline events yet</Text>
                  </View>
                )}
              </View>

              {/* Add Revenue Event */}
              <View style={styles.sectionHeader}>
                <Ionicons name="cash" size={16} color={COLORS.success} />
                <Text style={styles.sectionTitle}>Revenue Events</Text>
                <View style={{ flex: 1 }} />
                <TouchableOpacity
                  style={styles.addRevenueBtn}
                  onPress={() => setShowAddRevenue(!showAddRevenue)}
                >
                  <Ionicons name={showAddRevenue ? 'close-circle' : 'add-circle'} size={18} color={COLORS.accent} />
                  <Text style={styles.addRevenueBtnText}>{showAddRevenue ? 'Cancel' : 'Add'}</Text>
                </TouchableOpacity>
              </View>

              {showAddRevenue && (
                <View style={styles.addRevenueForm}>
                  <View style={styles.formRow}>
                    <View style={styles.formField}>
                      <Text style={styles.formLabel}>Amount ($)</Text>
                      <TextInput
                        style={styles.formInput}
                        value={revAmount}
                        onChangeText={setRevAmount}
                        placeholder="0.00"
                        placeholderTextColor={COLORS.textMuted}
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <View style={styles.formField}>
                      <Text style={styles.formLabel}>Date</Text>
                      <TextInput
                        style={styles.formInput}
                        value={revDate}
                        onChangeText={setRevDate}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={COLORS.textMuted}
                      />
                    </View>
                  </View>
                  <Text style={styles.formLabel}>Type</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroll}>
                    {EVENT_TYPE_OPTIONS.map(opt => (
                      <TouchableOpacity
                        key={opt.value}
                        style={[styles.typeChip, revType === opt.value && { backgroundColor: opt.color + '20', borderColor: opt.color }]}
                        onPress={() => setRevType(opt.value)}
                      >
                        <Ionicons name={opt.icon as any} size={14} color={revType === opt.value ? opt.color : COLORS.textMuted} />
                        <Text style={[styles.typeChipText, revType === opt.value && { color: opt.color }]}>{opt.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <Text style={styles.formLabel}>Description (optional)</Text>
                  <TextInput
                    style={styles.formInput}
                    value={revDescription}
                    onChangeText={setRevDescription}
                    placeholder="e.g., Monthly package payment"
                    placeholderTextColor={COLORS.textMuted}
                  />
                  <TouchableOpacity
                    style={[styles.saveRevenueBtn, (!revAmount || saving) && { opacity: 0.5 }]}
                    onPress={handleAddRevenue}
                    disabled={!revAmount || saving}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color={COLORS.white} />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={18} color={COLORS.white} />
                        <Text style={styles.saveRevenueBtnText}>Save Revenue Event</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {/* Revenue Events List */}
              {journey.revenue_events.length > 0 ? (
                <View style={styles.revenueList}>
                  {journey.revenue_events.map((event) => {
                    const typeInfo = EVENT_TYPE_OPTIONS.find(t => t.value === event.event_type) || EVENT_TYPE_OPTIONS[4];
                    return (
                      <View key={event.id} style={styles.revenueItem}>
                        <View style={[styles.revenueIcon, { backgroundColor: typeInfo.color + '15' }]}>
                          <Ionicons name={typeInfo.icon as any} size={16} color={typeInfo.color} />
                        </View>
                        <View style={styles.revenueInfo}>
                          <Text style={styles.revenueDesc}>{event.description || typeInfo.label}</Text>
                          <Text style={styles.revenueDate}>{formatDate(event.event_date)}</Text>
                        </View>
                        <Text style={[styles.revenueAmount, { color: event.event_type === 'refund' ? COLORS.danger : COLORS.success }]}>
                          {event.event_type === 'refund' ? '-' : '+'}{formatCurrencyFull(event.amount)}
                        </Text>
                        <TouchableOpacity style={styles.revenueDeleteBtn} onPress={() => handleDeleteRevenue(event)}>
                          <Ionicons name="trash-outline" size={14} color={COLORS.danger} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                  <View style={styles.revenueTotalRow}>
                    <Text style={styles.revenueTotalLabel}>Total Lifetime Value</Text>
                    <Text style={[styles.revenueTotalValue, { color: journey.ltv >= 0 ? COLORS.success : COLORS.danger }]}>
                      {formatCurrencyFull(journey.ltv)}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.emptyRevenue}>
                  <Ionicons name="receipt-outline" size={24} color={COLORS.textMuted} />
                  <Text style={styles.emptyRevenueText}>No revenue events recorded</Text>
                  <Text style={styles.emptyRevenueSubtext}>Add revenue events to track client lifetime value</Text>
                </View>
              )}

              <View style={{ height: 40 }} />
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end' },
  modal: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: BORDER_RADIUS.xxl,
    borderTopRightRadius: BORDER_RADIUS.xxl,
    maxHeight: '92%',
    minHeight: '50%',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl, paddingTop: SPACING.xl, paddingBottom: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, flex: 1 },
  headerIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.accent, justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: FONT_SIZES.xl, fontWeight: '800', color: COLORS.primary },
  headerSubtitle: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 1 },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.borderLight, justifyContent: 'center', alignItems: 'center',
  },
  loadingContainer: { padding: SPACING.xxxl, alignItems: 'center', gap: SPACING.md },
  loadingText: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted },
  errorContainer: { padding: SPACING.xxxl, alignItems: 'center', gap: SPACING.md },
  errorText: { fontSize: FONT_SIZES.sm, color: COLORS.danger, textAlign: 'center' },
  retryBtn: {
    backgroundColor: COLORS.accent, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
  },
  retryBtnText: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.white },
  scroll: { flex: 1, paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg },
  // Summary
  summaryRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm },
  summaryCard: {
    flex: 1, backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, alignItems: 'center', gap: 4,
  },
  summaryLabel: { fontSize: 9, color: COLORS.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  summaryValue: { fontSize: FONT_SIZES.md, fontWeight: '800', color: COLORS.primary },
  // Info card
  infoCard: {
    backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, gap: SPACING.sm, marginBottom: SPACING.lg,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  infoText: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary },
  // Section
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    marginBottom: SPACING.md, marginTop: SPACING.sm,
  },
  sectionTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.primary },
  // Timeline
  timeline: { marginBottom: SPACING.lg },
  timelineItem: { flexDirection: 'row', minHeight: 60 },
  timelineLine: { width: 32, alignItems: 'center' },
  timelineDot: {
    width: 24, height: 24, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', zIndex: 1,
  },
  timelineConnector: {
    width: 2, flex: 1, backgroundColor: COLORS.borderLight, marginTop: -2,
  },
  timelineContent: { flex: 1, paddingLeft: SPACING.sm, paddingBottom: SPACING.lg },
  timelineDate: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '500' },
  timelineTitle: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.text, marginTop: 2 },
  timelineSubtitle: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, marginTop: 1 },
  emptyTimeline: { alignItems: 'center', paddingVertical: SPACING.xl, gap: SPACING.sm },
  emptyTimelineText: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted },
  // Add revenue
  addRevenueBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addRevenueBtnText: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.accent },
  addRevenueForm: {
    backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, marginBottom: SPACING.md, gap: SPACING.sm,
  },
  formRow: { flexDirection: 'row', gap: SPACING.sm },
  formField: { flex: 1 },
  formLabel: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 4 },
  formInput: {
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm, fontSize: FONT_SIZES.sm, color: COLORS.text,
  },
  typeScroll: { flexGrow: 0, marginBottom: SPACING.sm },
  typeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: SPACING.md, paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full, borderWidth: 1,
    borderColor: COLORS.border, backgroundColor: COLORS.white, marginRight: SPACING.sm,
  },
  typeChipText: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: COLORS.textSecondary },
  saveRevenueBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, backgroundColor: COLORS.success,
    borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.sm, marginTop: SPACING.sm,
  },
  saveRevenueBtnText: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.white },
  // Revenue list
  revenueList: {
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1, borderColor: COLORS.borderLight, overflow: 'hidden',
  },
  revenueItem: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  revenueIcon: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  revenueInfo: { flex: 1 },
  revenueDesc: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.text },
  revenueDate: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 1 },
  revenueAmount: { fontSize: FONT_SIZES.sm, fontWeight: '800' },
  revenueDeleteBtn: { padding: 4 },
  revenueTotalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
    backgroundColor: COLORS.background,
  },
  revenueTotalLabel: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.primary },
  revenueTotalValue: { fontSize: FONT_SIZES.lg, fontWeight: '800' },
  // Empty
  emptyRevenue: {
    alignItems: 'center', paddingVertical: SPACING.xl, gap: SPACING.sm,
    backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md,
  },
  emptyRevenueText: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.textMuted },
  emptyRevenueSubtext: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted },
});
