import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  ScrollView, TextInput, Alert, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface ClientReturn {
  id: string;
  client_id: string;
  return_date: string;
  credited_trainer: string | null;
  credited_dietitian: string | null;
  notes: string | null;
  franchise: string | null;
  created_by: string | null;
  created_at: string;
}

interface Props {
  clientId: string;
  clientName: string;
  franchise?: string;
}

export default function ClientReturnsPanel({ clientId, clientName, franchise }: Props) {
  const { profile: authProfile } = useAuth();
  const canManage = authProfile?.role === 'admin' || authProfile?.role === 'franchise_manager' || authProfile?.role === 'trainer';
  const canDelete = authProfile?.role === 'admin' || authProfile?.role === 'franchise_manager';

  const [returns, setReturns] = useState<ClientReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [returnDate, setReturnDate] = useState('');
  const [creditTrainer, setCreditTrainer] = useState('');
  const [creditDietitian, setCreditDietitian] = useState('');
  const [notes, setNotes] = useState('');

  // Available staff
  const [availableTrainers, setAvailableTrainers] = useState<string[]>([]);
  const [availableDietitians, setAvailableDietitians] = useState<string[]>([]);
  const [staffLoaded, setStaffLoaded] = useState(false);
  const [showTrainerPicker, setShowTrainerPicker] = useState(false);
  const [showDietitianPicker, setShowDietitianPicker] = useState(false);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchReturns = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('manage-client-data', {
        body: { action: 'list_returns', client_id: clientId },
      });
      if (fnError) throw new Error(fnError.message || 'Failed to fetch returns');
      if (data?.error) throw new Error(data.error);
      setReturns(data?.data || []);
    } catch (err: any) {
      console.error('Error fetching returns:', err);
      setError(err.message || 'Failed to load returns');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchReturns();
  }, [fetchReturns]);

  // Fetch available staff when add form opens
  useEffect(() => {
    if (showAddForm && !staffLoaded) {
      supabase
        .from('user_profiles')
        .select('full_name, role')
        .in('role', ['trainer', 'dietitian'])
        .order('full_name', { ascending: true })
        .then(({ data: staffRows }) => {
          const trainers: string[] = [];
          const dietitians: string[] = [];
          if (staffRows) {
            for (const row of staffRows) {
              if (row.full_name) {
                if (row.role === 'trainer') trainers.push(row.full_name);
                else if (row.role === 'dietitian') dietitians.push(row.full_name);
              }
            }
          }
          setAvailableTrainers(trainers);
          setAvailableDietitians(dietitians);
          setStaffLoaded(true);
        });
    }
  }, [showAddForm, staffLoaded]);

  const handleAdd = async () => {
    if (!returnDate.trim()) {
      const msg = 'Please enter a return date (YYYY-MM-DD).';
      if (Platform.OS === 'web') { window.alert(msg); } else { Alert.alert('Validation', msg); }
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(returnDate.trim())) {
      const msg = 'Return date must be in YYYY-MM-DD format.';
      if (Platform.OS === 'web') { window.alert(msg); } else { Alert.alert('Validation', msg); }
      return;
    }
    if (!creditTrainer && !creditDietitian) {
      const msg = 'Please credit at least one trainer or dietitian for this return.';
      if (Platform.OS === 'web') { window.alert(msg); } else { Alert.alert('Validation', msg); }
      return;
    }

    setSaving(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('manage-client-data', {
        body: {
          action: 'create_return',
          data: {
            client_id: clientId,
            return_date: returnDate.trim(),
            credited_trainer: creditTrainer || null,
            credited_dietitian: creditDietitian || null,
            notes: notes.trim() || null,
            franchise: franchise || null,
          },
        },
      });
      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);

      // Success — refresh list and reset form
      setShowAddForm(false);
      setReturnDate('');
      setCreditTrainer('');
      setCreditDietitian('');
      setNotes('');
      fetchReturns();
    } catch (err: any) {
      const msg = err.message || 'Failed to save return';
      if (Platform.OS === 'web') { window.alert(msg); } else { Alert.alert('Error', msg); }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (returnId: string) => {
    const doDelete = async () => {
      setDeletingId(returnId);
      try {
        const { data, error: fnError } = await supabase.functions.invoke('manage-client-data', {
          body: { action: 'delete_return', return_id: returnId },
        });
        if (fnError) throw new Error(fnError.message);
        if (data?.error) throw new Error(data.error);
        fetchReturns();
      } catch (err: any) {
        const msg = err.message || 'Failed to delete return';
        if (Platform.OS === 'web') { window.alert(msg); } else { Alert.alert('Error', msg); }
      } finally {
        setDeletingId(null);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Delete this return record? This action cannot be undone.')) {
        doDelete();
      }
    } else {
      Alert.alert('Delete Return', 'Delete this return record? This action cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return '';
    try {
      const normalized = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
      const d = new Date(normalized + 'T12:00:00');
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const firstName = clientName.split(' ')[0];

  if (loading) {
    return (
      <View style={s.centerContainer}>
        <ActivityIndicator size="large" color="#e67e22" />
        <Text style={s.loadingText}>Loading returns...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={s.centerContainer}>
        <View style={s.errorIcon}>
          <Ionicons name="cloud-offline-outline" size={32} color="#e74c3c" />
        </View>
        <Text style={s.errorTitle}>Could not load returns</Text>
        <Text style={s.errorText}>{error}</Text>
        <TouchableOpacity style={s.retryBtn} onPress={fetchReturns} activeOpacity={0.7}>
          <Ionicons name="refresh-outline" size={16} color={COLORS.white} />
          <Text style={s.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerIcon}>
          <Ionicons name="arrow-undo-outline" size={20} color="#e67e22" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Returns by {firstName}</Text>
          <Text style={s.headerSubtitle}>
            {returns.length === 0
              ? 'No returns recorded'
              : `${returns.length} ${returns.length === 1 ? 'return' : 'returns'} recorded`}
          </Text>
        </View>
        <View style={s.countBadge}>
          <Text style={s.countBadgeText}>{returns.length}</Text>
        </View>
      </View>

      {/* Add Return Button */}
      {canManage && !showAddForm && (
        <TouchableOpacity
          style={s.addBtn}
          onPress={() => {
            // Default to today's date
            const today = new Date();
            setReturnDate(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`);
            setShowAddForm(true);
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="add-circle" size={18} color="#e67e22" />
          <Text style={s.addBtnText}>Record Return</Text>
        </TouchableOpacity>
      )}

      {/* Add Form */}
      {showAddForm && (
        <View style={s.formCard}>
          <View style={s.formHeader}>
            <Ionicons name="arrow-undo" size={16} color="#e67e22" />
            <Text style={s.formTitle}>Record Client Return</Text>
          </View>

          {/* Return Date */}
          <View style={s.fieldGroup}>
            <Text style={s.fieldLabel}>Return Date</Text>
            <View style={s.inputWrapper}>
              <Ionicons name="calendar-outline" size={16} color={COLORS.textMuted} style={{ marginRight: SPACING.sm }} />
              <TextInput
                style={s.input}
                value={returnDate}
                onChangeText={setReturnDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>
          </View>

          {/* Credited Trainer */}
          <View style={s.fieldGroup}>
            <Text style={s.fieldLabel}>Trainer Credit</Text>
            <TouchableOpacity
              style={s.inputWrapper}
              onPress={() => { setShowTrainerPicker(!showTrainerPicker); setShowDietitianPicker(false); }}
              activeOpacity={0.7}
            >
              <Ionicons name="barbell-outline" size={16} color="#3498db" style={{ marginRight: SPACING.sm }} />
              <Text style={[s.input, { paddingVertical: 12 }, !creditTrainer && { color: COLORS.textMuted }]}>
                {creditTrainer || 'Select trainer (optional)'}
              </Text>
              <Ionicons name={showTrainerPicker ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.textMuted} />
            </TouchableOpacity>
            {showTrainerPicker && (
              <View style={s.pickerList}>
                <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 160 }}>
                  <TouchableOpacity
                    style={[s.pickerItem, !creditTrainer && s.pickerItemActive]}
                    onPress={() => { setCreditTrainer(''); setShowTrainerPicker(false); }}
                  >
                    <Text style={[s.pickerItemText, !creditTrainer && { color: '#3498db', fontWeight: '700' }]}>None</Text>
                  </TouchableOpacity>
                  {availableTrainers.map(name => (
                    <TouchableOpacity
                      key={name}
                      style={[s.pickerItem, creditTrainer === name && s.pickerItemActive]}
                      onPress={() => { setCreditTrainer(name); setShowTrainerPicker(false); }}
                    >
                      <Text style={[s.pickerItemText, creditTrainer === name && { color: '#3498db', fontWeight: '700' }]}>{name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Credited Dietitian */}
          <View style={s.fieldGroup}>
            <Text style={s.fieldLabel}>Dietitian Credit</Text>
            <TouchableOpacity
              style={s.inputWrapper}
              onPress={() => { setShowDietitianPicker(!showDietitianPicker); setShowTrainerPicker(false); }}
              activeOpacity={0.7}
            >
              <Ionicons name="nutrition-outline" size={16} color="#2ecc71" style={{ marginRight: SPACING.sm }} />
              <Text style={[s.input, { paddingVertical: 12 }, !creditDietitian && { color: COLORS.textMuted }]}>
                {creditDietitian || 'Select dietitian (optional)'}
              </Text>
              <Ionicons name={showDietitianPicker ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.textMuted} />
            </TouchableOpacity>
            {showDietitianPicker && (
              <View style={s.pickerList}>
                <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 160 }}>
                  <TouchableOpacity
                    style={[s.pickerItem, !creditDietitian && s.pickerItemActive]}
                    onPress={() => { setCreditDietitian(''); setShowDietitianPicker(false); }}
                  >
                    <Text style={[s.pickerItemText, !creditDietitian && { color: '#2ecc71', fontWeight: '700' }]}>None</Text>
                  </TouchableOpacity>
                  {availableDietitians.map(name => (
                    <TouchableOpacity
                      key={name}
                      style={[s.pickerItem, creditDietitian === name && s.pickerItemActive]}
                      onPress={() => { setCreditDietitian(name); setShowDietitianPicker(false); }}
                    >
                      <Text style={[s.pickerItemText, creditDietitian === name && { color: '#2ecc71', fontWeight: '700' }]}>{name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Notes */}
          <View style={s.fieldGroup}>
            <Text style={s.fieldLabel}>Notes (optional)</Text>
            <View style={[s.inputWrapper, { height: 'auto' as any, minHeight: 48, alignItems: 'flex-start', paddingVertical: SPACING.sm }]}>
              <Ionicons name="document-text-outline" size={16} color={COLORS.textMuted} style={{ marginRight: SPACING.sm, marginTop: 2 }} />
              <TextInput
                style={[s.input, { minHeight: 36, textAlignVertical: 'top' }]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Optional notes about this return"
                placeholderTextColor={COLORS.textMuted}
                multiline
                numberOfLines={2}
              />
            </View>
          </View>

          {/* Form Actions */}
          <View style={s.formActions}>
            <TouchableOpacity
              style={s.cancelBtn}
              onPress={() => { setShowAddForm(false); setShowTrainerPicker(false); setShowDietitianPicker(false); }}
              activeOpacity={0.7}
            >
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.saveBtn, saving && { opacity: 0.5 }]}
              onPress={handleAdd}
              disabled={saving}
              activeOpacity={0.7}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="save-outline" size={16} color="#fff" />
                  <Text style={s.saveBtnText}>Save Return</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Returns List */}
      {returns.length === 0 ? (
        <View style={s.emptyState}>
          <View style={s.emptyIcon}>
            <Ionicons name="arrow-undo-outline" size={48} color={COLORS.borderLight} />
          </View>
          <Text style={s.emptyTitle}>No Returns Recorded</Text>
          <Text style={s.emptyText}>
            When {firstName} returns to the program, record it here to credit the appropriate coach or dietitian.
          </Text>
        </View>
      ) : (
        <View style={s.listContainer}>
          {returns.map((ret, index) => (
            <View key={ret.id} style={s.returnCard}>
              <View style={s.returnRow}>
                {/* Return icon */}
                <View style={s.returnIconWrap}>
                  <Ionicons name="arrow-undo" size={16} color="#e67e22" />
                </View>

                {/* Info */}
                <View style={{ flex: 1 }}>
                  <Text style={s.returnDate}>{formatDate(ret.return_date)}</Text>
                  <View style={s.creditRow}>
                    {ret.credited_trainer && (
                      <View style={[s.creditChip, { backgroundColor: '#3498db12', borderColor: '#3498db30' }]}>
                        <Ionicons name="barbell-outline" size={10} color="#3498db" />
                        <Text style={[s.creditChipText, { color: '#3498db' }]}>{ret.credited_trainer}</Text>
                      </View>
                    )}
                    {ret.credited_dietitian && (
                      <View style={[s.creditChip, { backgroundColor: '#2ecc7112', borderColor: '#2ecc7130' }]}>
                        <Ionicons name="nutrition-outline" size={10} color="#2ecc71" />
                        <Text style={[s.creditChipText, { color: '#2ecc71' }]}>{ret.credited_dietitian}</Text>
                      </View>
                    )}
                  </View>
                  {ret.notes && (
                    <Text style={s.returnNotes} numberOfLines={2}>{ret.notes}</Text>
                  )}
                </View>

                {/* Delete button */}
                {canDelete && (
                  <TouchableOpacity
                    style={s.deleteBtn}
                    onPress={() => handleDelete(ret.id)}
                    disabled={deletingId === ret.id}
                    activeOpacity={0.6}
                  >
                    {deletingId === ret.id ? (
                      <ActivityIndicator size="small" color="#e74c3c" />
                    ) : (
                      <Ionicons name="trash-outline" size={16} color="#e74c3c" />
                    )}
                  </TouchableOpacity>
                )}
              </View>

              {/* Timeline connector */}
              {index < returns.length - 1 && (
                <View style={s.timelineConnector}>
                  <View style={s.timelineLine} />
                </View>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: SPACING.md,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: SPACING.xxxl,
    gap: SPACING.md,
  },
  loadingText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
  },
  errorIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#e74c3c10',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.primary,
  },
  errorText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingHorizontal: SPACING.xl,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: '#e67e22',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
  },
  retryBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
    borderWidth: 1,
    borderColor: '#e67e2220',
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#e67e2212',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: COLORS.primary,
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  countBadge: {
    backgroundColor: '#e67e22',
    borderRadius: BORDER_RADIUS.full,
    minWidth: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
  },
  countBadgeText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: COLORS.white,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: '#e67e2210',
    borderWidth: 1.5,
    borderColor: '#e67e2230',
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.lg,
    borderStyle: 'dashed' as any,
  },
  addBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: '#e67e22',
  },
  formCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
    borderWidth: 1,
    borderColor: '#e67e2220',
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  formTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: COLORS.primary,
  },
  fieldGroup: {
    marginBottom: SPACING.md,
  },
  fieldLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.borderLight,
    paddingHorizontal: SPACING.md,
    height: 48,
  },
  input: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    fontWeight: '600',
  },
  pickerList: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: SPACING.xs,
    ...SHADOWS.sm,
  },
  pickerItem: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  pickerItemActive: {
    backgroundColor: COLORS.background,
  },
  pickerItemText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: '500',
  },
  formActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  cancelBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
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
    backgroundColor: '#e67e22',
  },
  saveBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: '#fff',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: SPACING.xxxl,
    gap: SPACING.md,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
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
  listContainer: {
    gap: 0,
  },
  returnCard: {
    marginBottom: 0,
  },
  returnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    ...SHADOWS.sm,
  },
  returnIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e67e2212',
    justifyContent: 'center',
    alignItems: 'center',
  },
  returnDate: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.primary,
  },
  creditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
    flexWrap: 'wrap',
  },
  creditChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
  },
  creditChipText: {
    fontSize: 9,
    fontWeight: '700',
  },
  returnNotes: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 4,
    fontStyle: 'italic',
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e74c3c08',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineConnector: {
    alignItems: 'center',
    height: 16,
  },
  timelineLine: {
    width: 2,
    height: 16,
    backgroundColor: '#e67e2230',
  },
});
