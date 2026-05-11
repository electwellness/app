import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import { supabase } from '@/app/lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { saveWorkout, getWorkoutTypeLabel, getWorkoutTypeColor } from '../../lib/savedWorkoutService';
import type { Exercise, Segment } from './WorkoutExerciseList';

interface ClientOption {
  id: string;
  name: string;
  email: string;
  franchise: string;
  program: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  workoutType: string;
  equipmentUsed: string[];
  exercises: Exercise[];
  segments: Segment[];
}

export default function SaveWorkoutModal({
  visible, onClose, onSaved, workoutType, equipmentUsed, exercises, segments,
}: Props) {
  const { profile } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [filteredClients, setFilteredClients] = useState<ClientOption[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const loadedRef = useRef(false);

  // Fetch clients when modal opens
  useEffect(() => {
    if (visible && !loadedRef.current) {
      loadedRef.current = true;
      loadClients();
    }
    if (!visible) {
      loadedRef.current = false;
      setSearchQuery('');
      setSelectedClient(null);
      setNotes('');
      setError(null);
      setSuccess(false);
      setSaving(false);
    }
  }, [visible]);

  // Filter clients based on search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredClients(clients);
    } else {
      const q = searchQuery.toLowerCase();
      setFilteredClients(
        clients.filter(c =>
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.franchise.toLowerCase().includes(q)
        )
      );
    }
  }, [searchQuery, clients]);

  const loadClients = async () => {
    setLoading(true);
    try {
      // Fetch active clients from user_profiles
      let query = supabase
        .from('user_profiles')
        .select('id, full_name, email, franchise_name, program, contact_status')
        .eq('role', 'client')
        .in('contact_status', ['active-client', 'jumpstart'])
        .order('full_name', { ascending: true });

      // If trainer, filter by their franchise
      if (profile?.role === 'trainer' && profile.franchise) {
        query = query.eq('franchise_name', profile.franchise);
      }

      const { data, error: fetchErr } = await query.limit(500);

      if (fetchErr) {
        console.error('Failed to fetch clients:', fetchErr);
        setError('Failed to load clients');
      } else {
        const clientList: ClientOption[] = (data || []).map((row: any) => ({
          id: row.id,
          name: row.full_name || 'Unknown',
          email: row.email || '',
          franchise: row.franchise_name || '',
          program: row.program || '',
        }));
        setClients(clientList);
        setFilteredClients(clientList);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load clients');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = useCallback(async () => {
    if (!selectedClient || !profile?.id) return;

    setSaving(true);
    setError(null);

    try {
      const result = await saveWorkout({
        trainer_id: profile.id,
        client_id: selectedClient.id,
        workout_type: workoutType,
        equipment_used: equipmentUsed,
        exercises,
        segments,
        notes: notes.trim(),
      });

      if (!result.success) {
        setError(result.error || 'Failed to save workout');
        setSaving(false);
        return;
      }

      setSuccess(true);
      setSaving(false);

      // Auto-close after success
      setTimeout(() => {
        onSaved();
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Failed to save workout');
      setSaving(false);
    }
  }, [selectedClient, profile, workoutType, equipmentUsed, exercises, segments, notes, onSaved, onClose]);

  const typeLabel = getWorkoutTypeLabel(workoutType);
  const typeColor = getWorkoutTypeColor(workoutType);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.modal}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={22} color={COLORS.textSecondary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Ionicons name="save" size={18} color={COLORS.accent} />
            <Text style={styles.headerTitle}>Save Workout</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Success Banner */}
        {success && (
          <View style={styles.successBanner}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.successTitle}>Workout Saved!</Text>
              <Text style={styles.successSubtitle}>
                {typeLabel} workout saved for {selectedClient?.name}
              </Text>
            </View>
          </View>
        )}

        {/* Error Banner */}
        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={16} color={COLORS.danger} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => setError(null)}>
              <Ionicons name="close-circle" size={16} color={COLORS.danger} />
            </TouchableOpacity>
          </View>
        )}

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Workout Summary */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryHeader}>
              <View style={[styles.summaryTypeIcon, { backgroundColor: typeColor + '15' }]}>
                <Ionicons name="flash" size={18} color={typeColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.summaryTypeLabel, { color: typeColor }]}>{typeLabel} Workout</Text>
                <Text style={styles.summaryMeta}>
                  {exercises.length} exercises
                  {segments.length > 0 ? ` · ${segments.length} segments` : ''}
                  {equipmentUsed.length > 0 ? ` · ${equipmentUsed.length} equipment` : ''}
                </Text>
              </View>
            </View>

            {/* Equipment pills */}
            {equipmentUsed.length > 0 && (
              <View style={styles.equipmentRow}>
                {equipmentUsed.slice(0, 6).map((eq, i) => (
                  <View key={i} style={styles.equipmentPill}>
                    <Text style={styles.equipmentPillText}>{eq}</Text>
                  </View>
                ))}
                {equipmentUsed.length > 6 && (
                  <View style={styles.equipmentPill}>
                    <Text style={styles.equipmentPillText}>+{equipmentUsed.length - 6} more</Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Client Picker */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Select Client</Text>
            <Text style={styles.sectionSubtitle}>Choose which client to save this workout for</Text>

            {/* Selected client display */}
            {selectedClient && (
              <View style={styles.selectedClientCard}>
                <View style={styles.selectedClientAvatar}>
                  <Text style={styles.selectedClientInitial}>
                    {selectedClient.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.selectedClientName}>{selectedClient.name}</Text>
                  <Text style={styles.selectedClientEmail}>{selectedClient.email}</Text>
                  {selectedClient.program ? (
                    <Text style={styles.selectedClientProgram}>{selectedClient.program}</Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  style={styles.changeClientBtn}
                  onPress={() => setSelectedClient(null)}
                >
                  <Text style={styles.changeClientText}>Change</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Client search & list */}
            {!selectedClient && (
              <>
                <View style={styles.searchWrapper}>
                  <Ionicons name="search" size={16} color={COLORS.textMuted} />
                  <TextInput
                    style={styles.searchInput}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search clients by name, email, or franchise..."
                    placeholderTextColor={COLORS.textMuted}
                    autoCapitalize="none"
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                      <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>

                {loading ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color={COLORS.accent} />
                    <Text style={styles.loadingText}>Loading clients...</Text>
                  </View>
                ) : filteredClients.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="people-outline" size={28} color={COLORS.textMuted} />
                    <Text style={styles.emptyText}>
                      {searchQuery ? 'No clients match your search' : 'No active clients found'}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.clientList}>
                    {filteredClients.slice(0, 20).map(client => (
                      <TouchableOpacity
                        key={client.id}
                        style={styles.clientRow}
                        onPress={() => setSelectedClient(client)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.clientAvatar}>
                          <Text style={styles.clientInitial}>
                            {client.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.clientName}>{client.name}</Text>
                          <Text style={styles.clientEmail} numberOfLines={1}>{client.email}</Text>
                        </View>
                        {client.franchise ? (
                          <View style={styles.franchiseBadge}>
                            <Text style={styles.franchiseBadgeText} numberOfLines={1}>{client.franchise}</Text>
                          </View>
                        ) : null}
                        <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                      </TouchableOpacity>
                    ))}
                    {filteredClients.length > 20 && (
                      <Text style={styles.moreClientsText}>
                        +{filteredClients.length - 20} more clients (refine your search)
                      </Text>
                    )}
                  </View>
                )}
              </>
            )}
          </View>

          {/* Notes */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes (Optional)</Text>
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Add any notes about this workout..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          <View style={{ height: 120 }} />
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveBtn, (!selectedClient || saving || success) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!selectedClient || saving || success}
            activeOpacity={0.7}
          >
            {saving ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : success ? (
              <>
                <Ionicons name="checkmark-circle" size={18} color={COLORS.white} />
                <Text style={styles.saveBtnText}>Saved!</Text>
              </>
            ) : (
              <>
                <Ionicons name="save" size={16} color={COLORS.white} />
                <Text style={styles.saveBtnText}>
                  Save for {selectedClient ? selectedClient.name.split(' ')[0] : 'Client'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

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
  closeBtn: {
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
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.primary,
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },

  // Success
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: '#f0fdf4',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.success,
  },
  successIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: COLORS.success,
  },
  successSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: '#5a7a8f',
    marginTop: 1,
  },

  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: '#fef2f2',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.danger,
  },
  errorText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.danger,
    fontWeight: '500',
    flex: 1,
  },

  // Summary
  summaryCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  summaryTypeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTypeLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
  },
  summaryMeta: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  equipmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  equipmentPill: {
    backgroundColor: COLORS.background,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  equipmentPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textMuted,
  },

  // Section
  section: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginBottom: SPACING.md,
  },

  // Search
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    height: 44,
    borderWidth: 1.5,
    borderColor: COLORS.borderLight,
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
  },

  // Loading
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xl,
  },
  loadingText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
  },

  // Empty
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    gap: SPACING.sm,
  },
  emptyText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    fontWeight: '600',
  },

  // Client list
  clientList: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  clientAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.accent + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clientInitial: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: COLORS.accent,
  },
  clientName: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.primary,
  },
  clientEmail: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  franchiseBadge: {
    backgroundColor: COLORS.background,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
    maxWidth: 100,
  },
  franchiseBadgeText: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  moreClientsText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: SPACING.md,
  },

  // Selected client
  selectedClientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 2,
    borderColor: COLORS.accent + '40',
    ...SHADOWS.sm,
  },
  selectedClientAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedClientInitial: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.white,
  },
  selectedClientName: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: COLORS.primary,
  },
  selectedClientEmail: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  selectedClientProgram: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.accent,
    marginTop: 2,
  },
  changeClientBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.accent + '12',
    borderWidth: 1,
    borderColor: COLORS.accent + '30',
  },
  changeClientText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.accent,
  },

  // Notes
  notesInput: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.borderLight,
    padding: SPACING.md,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    minHeight: 80,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    ...SHADOWS.md,
  },
  cancelBtn: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  cancelBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accent,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.full,
    ...SHADOWS.md,
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.white,
  },
});
