import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import { SEOKeywordEntry, DEFAULT_KEYWORDS, getMonthLabel, upsertEntry, deleteEntry } from '../../lib/seoService';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  month: string;
  existingEntry?: SEOKeywordEntry | null;
}

export default function SEOEntryModal({ visible, onClose, onSaved, month, existingEntry }: Props) {
  const [keyword, setKeyword] = useState('');
  const [queries, setQueries] = useState('');
  const [impressions, setImpressions] = useState('');
  const [position, setPosition] = useState('');
  const [clicks, setClicks] = useState('');
  const [ctr, setCtr] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showKeywordSuggestions, setShowKeywordSuggestions] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isEditing = !!existingEntry;

  // Reset form when modal opens
  useEffect(() => {
    if (visible) {
      if (existingEntry) {
        setKeyword(existingEntry.keyword);
        setQueries(String(existingEntry.queries || 0));
        setImpressions(String(existingEntry.impressions || 0));
        setPosition(String(existingEntry.position || 0));
        setClicks(String(existingEntry.clicks || 0));
        setCtr(String(existingEntry.ctr || 0));
      } else {
        setKeyword('');
        setQueries('');
        setImpressions('');
        setPosition('');
        setClicks('');
        setCtr('');
      }
      setError(null);
      setConfirmDelete(false);
    }
  }, [visible, existingEntry]);

  // Auto-calculate CTR when clicks and impressions change
  useEffect(() => {
    const imp = parseFloat(impressions);
    const clk = parseFloat(clicks);
    if (imp > 0 && clk >= 0) {
      const calculatedCtr = (clk / imp) * 100;
      setCtr(calculatedCtr.toFixed(2));
    }
  }, [clicks, impressions]);

  const filteredSuggestions = DEFAULT_KEYWORDS.filter(
    k => k.toLowerCase().includes(keyword.toLowerCase()) && k.toLowerCase() !== keyword.toLowerCase()
  );

  const validate = (): boolean => {
    if (!keyword.trim()) {
      setError('Keyword is required');
      return false;
    }
    if (position && (isNaN(parseFloat(position)) || parseFloat(position) < 0)) {
      setError('Position must be a valid number');
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;

    setSaving(true);
    setError(null);
    try {
      await upsertEntry({
        keyword: keyword.trim(),
        month,
        queries: parseInt(queries) || 0,
        impressions: parseInt(impressions) || 0,
        position: parseFloat(position) || 0,
        clicks: parseInt(clicks) || 0,
        ctr: parseFloat(ctr) || 0,
      });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save entry');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existingEntry?.id) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setDeleting(true);
    setError(null);
    try {
      await deleteEntry(existingEntry.id);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to delete entry');
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
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIcon}>
                <Ionicons name={isEditing ? 'create' : 'add-circle'} size={20} color={COLORS.white} />
              </View>
              <View>
                <Text style={styles.headerTitle}>{isEditing ? 'Edit Keyword' : 'Add Keyword Entry'}</Text>
                <Text style={styles.headerSubtitle}>{getMonthLabel(month)}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={22} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Error */}
            {error && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color={COLORS.danger} />
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity onPress={() => setError(null)}>
                  <Ionicons name="close" size={14} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>
            )}

            {/* Keyword Field */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Keyword</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="key-outline" size={16} color={COLORS.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={keyword}
                  onChangeText={(t) => {
                    setKeyword(t);
                    setShowKeywordSuggestions(t.length > 0);
                  }}
                  placeholder="e.g. Personal Trainer Near Me"
                  placeholderTextColor={COLORS.textMuted}
                  editable={!isEditing}
                  onBlur={() => setTimeout(() => setShowKeywordSuggestions(false), 200)}
                />
              </View>
              {showKeywordSuggestions && filteredSuggestions.length > 0 && !isEditing && (
                <View style={styles.suggestionsContainer}>
                  {filteredSuggestions.map(s => (
                    <TouchableOpacity
                      key={s}
                      style={styles.suggestionItem}
                      onPress={() => {
                        setKeyword(s);
                        setShowKeywordSuggestions(false);
                      }}
                    >
                      <Ionicons name="search-outline" size={12} color={COLORS.textMuted} />
                      <Text style={styles.suggestionText}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {!isEditing && (
                <View style={styles.quickKeywords}>
                  <Text style={styles.quickKeywordsLabel}>Quick add:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickKeywordsRow}>
                    {DEFAULT_KEYWORDS.map(k => (
                      <TouchableOpacity
                        key={k}
                        style={[styles.quickKeywordChip, keyword === k && styles.quickKeywordChipActive]}
                        onPress={() => setKeyword(k)}
                      >
                        <Text style={[styles.quickKeywordText, keyword === k && styles.quickKeywordTextActive]}>{k}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Metrics Grid */}
            <Text style={styles.sectionLabel}>Metrics</Text>
            <View style={styles.metricsGrid}>
              <View style={styles.metricField}>
                <Text style={styles.metricLabel}>Position</Text>
                <View style={styles.metricInputWrapper}>
                  <Ionicons name="trending-up" size={14} color={COLORS.accent} />
                  <TextInput
                    style={styles.metricInput}
                    value={position}
                    onChangeText={setPosition}
                    placeholder="0.0"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
              <View style={styles.metricField}>
                <Text style={styles.metricLabel}>Impressions</Text>
                <View style={styles.metricInputWrapper}>
                  <Ionicons name="eye-outline" size={14} color={COLORS.info} />
                  <TextInput
                    style={styles.metricInput}
                    value={impressions}
                    onChangeText={setImpressions}
                    placeholder="0"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="number-pad"
                  />
                </View>
              </View>
              <View style={styles.metricField}>
                <Text style={styles.metricLabel}>Clicks</Text>
                <View style={styles.metricInputWrapper}>
                  <Ionicons name="hand-left-outline" size={14} color={COLORS.success} />
                  <TextInput
                    style={styles.metricInput}
                    value={clicks}
                    onChangeText={setClicks}
                    placeholder="0"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="number-pad"
                  />
                </View>
              </View>
              <View style={styles.metricField}>
                <Text style={styles.metricLabel}>Queries</Text>
                <View style={styles.metricInputWrapper}>
                  <Ionicons name="search-outline" size={14} color={COLORS.warning} />
                  <TextInput
                    style={styles.metricInput}
                    value={queries}
                    onChangeText={setQueries}
                    placeholder="0"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="number-pad"
                  />
                </View>
              </View>
            </View>

            {/* CTR (auto-calculated) */}
            <View style={styles.ctrRow}>
              <View style={styles.ctrField}>
                <Text style={styles.metricLabel}>CTR (%)</Text>
                <View style={[styles.metricInputWrapper, styles.ctrInputWrapper]}>
                  <Ionicons name="analytics" size={14} color="#9b59b6" />
                  <TextInput
                    style={[styles.metricInput, styles.ctrInput]}
                    value={ctr}
                    onChangeText={setCtr}
                    placeholder="0.00"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="decimal-pad"
                  />
                  <Text style={styles.ctrSuffix}>%</Text>
                </View>
              </View>
              <View style={styles.ctrAutoNote}>
                <Ionicons name="information-circle-outline" size={12} color={COLORS.textMuted} />
                <Text style={styles.ctrAutoNoteText}>Auto-calculated from clicks / impressions</Text>
              </View>
            </View>

            {/* Delete button for editing */}
            {isEditing && (
              <TouchableOpacity
                style={[styles.deleteBtn, confirmDelete && styles.deleteBtnConfirm]}
                onPress={handleDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color={COLORS.danger} />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={16} color={confirmDelete ? COLORS.white : COLORS.danger} />
                    <Text style={[styles.deleteBtnText, confirmDelete && styles.deleteBtnTextConfirm]}>
                      {confirmDelete ? 'Tap Again to Confirm Delete' : 'Delete This Entry'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            <View style={{ height: 24 }} />
          </ScrollView>

          {/* Footer Actions */}
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
                  <Text style={styles.saveBtnText}>{isEditing ? 'Update' : 'Save Entry'}</Text>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.primary,
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
    marginTop: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.background,
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
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  errorText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.danger,
    fontWeight: '600',
  },

  // Field Group
  fieldGroup: {
    marginBottom: SPACING.lg,
  },
  fieldLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
  },
  inputIcon: {
    marginRight: SPACING.sm,
  },
  input: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    paddingVertical: SPACING.md,
    fontWeight: '600',
  },

  // Suggestions
  suggestionsContainer: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: SPACING.xs,
    ...SHADOWS.sm,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  suggestionText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: '500',
  },

  // Quick Keywords
  quickKeywords: {
    marginTop: SPACING.sm,
  },
  quickKeywordsLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
    marginBottom: 4,
  },
  quickKeywordsRow: {
    gap: SPACING.xs,
  },
  quickKeywordChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 5,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  quickKeywordChipActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  quickKeywordText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  quickKeywordTextActive: {
    color: COLORS.white,
  },

  // Section Label
  sectionLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  // Metrics Grid
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  metricField: {
    flex: 1,
    minWidth: '45%',
  },
  metricLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  metricInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  metricInput: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    paddingVertical: SPACING.sm,
    fontWeight: '700',
  },

  // CTR
  ctrRow: {
    marginBottom: SPACING.lg,
  },
  ctrField: {
    maxWidth: '50%',
  },
  ctrInputWrapper: {
    backgroundColor: '#9b59b6' + '08',
    borderColor: '#9b59b6' + '30',
  },
  ctrInput: {
    color: '#9b59b6',
  },
  ctrSuffix: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: '#9b59b6',
  },
  ctrAutoNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  ctrAutoNoteText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },

  // Delete
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.danger + '30',
    backgroundColor: COLORS.dangerLight,
    marginTop: SPACING.sm,
  },
  deleteBtnConfirm: {
    backgroundColor: COLORS.danger,
    borderColor: COLORS.danger,
  },
  deleteBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.danger,
  },
  deleteBtnTextConfirm: {
    color: COLORS.white,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
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
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
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
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.accent,
    ...SHADOWS.sm,
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
