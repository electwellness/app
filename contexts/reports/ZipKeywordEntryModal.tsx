import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import {
  getMonthLabel, upsertRanking, deleteRanking,
  positionColor, positionLabel, ZipKeywordRankingRow,
} from '../../lib/zipKeywordRankingsService';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  franchiseId: string;
  franchiseName: string;
  zipcode: string;
  keyword: string;
  month: string;
  existingRanking?: ZipKeywordRankingRow | null;
  userId?: string;
}

export default function ZipKeywordEntryModal({
  visible, onClose, onSaved, franchiseId, franchiseName, zipcode, keyword, month, existingRanking, userId,
}: Props) {
  const [position, setPosition] = useState('');
  const [notes, setNotes] = useState('');
  const [notRanked, setNotRanked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      if (existingRanking) {
        setPosition(existingRanking.position !== null && existingRanking.position !== undefined ? String(existingRanking.position) : '');
        setNotes(existingRanking.notes || '');
        setNotRanked(existingRanking.position === null || existingRanking.position === undefined);
      } else {
        setPosition('');
        setNotes('');
        setNotRanked(false);
      }
      setError(null);
      setConfirmDelete(false);
    }
  }, [visible, existingRanking]);

  const posNumber = position ? parseFloat(position) : null;
  const isValidPos = notRanked || (posNumber !== null && !isNaN(posNumber) && posNumber >= 1 && posNumber <= 100);

  const handleSave = async () => {
    if (!notRanked && (!position.trim() || posNumber === null || isNaN(posNumber))) {
      setError('Enter a position (1–100) or mark as Not Ranked');
      return;
    }
    if (!notRanked && (posNumber! < 1 || posNumber! > 100)) {
      setError('Position must be between 1 and 100');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await upsertRanking({
        franchise_id: franchiseId,
        franchise_name: franchiseName,
        zipcode,
        keyword,
        month,
        position: notRanked ? null : posNumber,
        notes: notes.trim() || null,
        user_id: userId,
      });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save ranking');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existingRanking?.id) return;
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    setError(null);
    try {
      await deleteRanking(existingRanking.id);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to delete ranking');
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIcon}>
                <Ionicons name={existingRanking ? 'create' : 'location'} size={18} color={COLORS.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerTitle}>Zip {zipcode} Ranking</Text>
                <Text style={styles.headerSubtitle} numberOfLines={1}>
                  {keyword} · {franchiseName} · {getMonthLabel(month)}
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={22} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            {error && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color={COLORS.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Context card */}
            <View style={styles.contextCard}>
              <View style={styles.contextRow}>
                <Ionicons name="business-outline" size={14} color={COLORS.textMuted} />
                <Text style={styles.contextLabel}>Franchise</Text>
                <Text style={styles.contextValue}>{franchiseName}</Text>
              </View>
              <View style={styles.contextRow}>
                <Ionicons name="location-outline" size={14} color={COLORS.textMuted} />
                <Text style={styles.contextLabel}>Zipcode</Text>
                <Text style={styles.contextValue}>{zipcode}</Text>
              </View>
              <View style={styles.contextRow}>
                <Ionicons name="key-outline" size={14} color={COLORS.textMuted} />
                <Text style={styles.contextLabel}>Keyword</Text>
                <Text style={styles.contextValue}>{keyword}</Text>
              </View>
              <View style={styles.contextRow}>
                <Ionicons name="calendar-outline" size={14} color={COLORS.textMuted} />
                <Text style={styles.contextLabel}>Month</Text>
                <Text style={styles.contextValue}>{getMonthLabel(month)}</Text>
              </View>
            </View>

            {/* Not Ranked toggle */}
            <TouchableOpacity
              style={[styles.toggleRow, notRanked && styles.toggleRowActive]}
              onPress={() => setNotRanked(v => !v)}
              activeOpacity={0.7}
            >
              <View style={[styles.toggleBox, notRanked && styles.toggleBoxActive]}>
                {notRanked && <Ionicons name="checkmark" size={14} color={COLORS.white} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleTitle}>Not Ranked in Top 100</Text>
                <Text style={styles.toggleSubtitle}>Our page did not appear in the first 100 search results</Text>
              </View>
            </TouchableOpacity>


            {/* Position input */}
            {!notRanked && (
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Search Result Position</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="trending-up" size={16} color={COLORS.accent} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    value={position}
                    onChangeText={setPosition}
                    placeholder="e.g. 7"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="number-pad"
                    maxLength={3}
                  />
                  {posNumber !== null && !isNaN(posNumber) && (
                    <View style={[styles.posBadge, { backgroundColor: positionColor(posNumber) }]}>
                      <Text style={styles.posBadgeText}>{positionLabel(posNumber)}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.helpText}>1 = top of page 1 · 10 = bottom of page 1 · 11–20 = page 2 · up to 100</Text>

              </View>
            )}

            {/* Notes */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Notes (optional)</Text>
              <View style={[styles.inputWrapper, { alignItems: 'flex-start' }]}>
                <Ionicons name="document-text-outline" size={16} color={COLORS.textMuted} style={[styles.inputIcon, { marginTop: 10 }]} />
                <TextInput
                  style={[styles.input, { minHeight: 70 }]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Search source, browser, notes..."
                  placeholderTextColor={COLORS.textMuted}
                  multiline
                  textAlignVertical="top"
                />
              </View>
            </View>

            {existingRanking && (
              <TouchableOpacity
                style={[styles.deleteBtn, confirmDelete && styles.deleteBtnConfirm]}
                onPress={handleDelete}
                disabled={deleting}
              >
                {deleting ? <ActivityIndicator size="small" color={COLORS.danger} /> : (
                  <>
                    <Ionicons name="trash-outline" size={16} color={confirmDelete ? COLORS.white : COLORS.danger} />
                    <Text style={[styles.deleteBtnText, confirmDelete && styles.deleteBtnTextConfirm]}>
                      {confirmDelete ? 'Tap Again to Confirm Delete' : 'Delete This Ranking'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            <View style={{ height: 30 }} />
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, (saving || !isValidPos) && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving || !isValidPos}
            >
              {saving ? <ActivityIndicator size="small" color={COLORS.white} /> : (
                <>
                  <Ionicons name="checkmark" size={18} color={COLORS.white} />
                  <Text style={styles.saveBtnText}>{existingRanking ? 'Update' : 'Save Ranking'}</Text>
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
  overlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end' },
  container: { backgroundColor: COLORS.white, borderTopLeftRadius: BORDER_RADIUS.xl, borderTopRightRadius: BORDER_RADIUS.xl, maxHeight: '92%', ...SHADOWS.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight, gap: SPACING.sm },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, flex: 1 },
  headerIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FONT_SIZES.lg, fontWeight: '800', color: COLORS.primary },
  headerSubtitle: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '600', marginTop: 1 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.dangerLight, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md },
  errorText: { flex: 1, fontSize: FONT_SIZES.sm, color: COLORS.danger, fontWeight: '600' },
  contextCard: { backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.lg, gap: 6 },
  contextRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  contextLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '600', minWidth: 70 },
  contextValue: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.primary, flex: 1 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.lg },
  toggleRowActive: { backgroundColor: COLORS.danger + '10', borderColor: COLORS.danger + '40' },
  toggleBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  toggleBoxActive: { backgroundColor: COLORS.danger, borderColor: COLORS.danger },
  toggleTitle: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.primary },
  toggleSubtitle: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 2 },
  fieldGroup: { marginBottom: SPACING.lg },
  fieldLabel: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.primary, marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: 0.3 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md, gap: SPACING.sm },
  inputIcon: {},
  input: { flex: 1, fontSize: FONT_SIZES.md, color: COLORS.text, paddingVertical: SPACING.md, fontWeight: '600' },
  posBadge: { paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: BORDER_RADIUS.full },
  posBadgeText: { fontSize: FONT_SIZES.xs, fontWeight: '800', color: COLORS.white },
  helpText: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 6, fontStyle: 'italic' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.danger + '30', backgroundColor: COLORS.dangerLight, marginTop: SPACING.sm },
  deleteBtnConfirm: { backgroundColor: COLORS.danger, borderColor: COLORS.danger },
  deleteBtnText: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.danger },
  deleteBtnTextConfirm: { color: COLORS.white },
  footer: { flexDirection: 'row', gap: SPACING.sm, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.lg, borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  cancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  cancelBtnText: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.textSecondary },
  saveBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.accent, ...SHADOWS.sm },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.white },
});
