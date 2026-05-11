import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
  TextInput,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../../constants/theme';
import { supabase } from '../../lib/supabase';

export interface UnmatchedName {
  name: string;
  credit_count: number;
  as_trainer: number;
  as_dietitian: number;
}

interface ResolutionDetail {
  old_name: string;
  new_name: string;
  trainer_records_updated: number;
  dietitian_records_updated: number;
  error?: string;
}

interface ResolutionResult {
  success: boolean;
  total_mappings: number;
  total_trainer_records_updated: number;
  total_dietitian_records_updated: number;
  total_records_updated: number;
  errors: number;
  resolution_details: ResolutionDetail[];
  recount_results: Array<{ name: string; new_credits: number }>;
}

interface Props {
  unmatchedNames: UnmatchedName[];
  staffNames: string[];
  onResolved: () => void; // callback to re-run recount after resolution
}

export default function UnmatchedNameResolver({ unmatchedNames, staffNames, onResolved }: Props) {
  // Map of old_name → selected new_name
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [resolving, setResolving] = useState(false);
  const [result, setResult] = useState<ResolutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Staff picker modal state
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerForName, setPickerForName] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');

  const openPicker = useCallback((unmatchedName: string) => {
    setPickerForName(unmatchedName);
    setPickerSearch('');
    setPickerVisible(true);
  }, []);

  const selectStaff = useCallback((staffName: string) => {
    if (pickerForName) {
      setMappings(prev => ({ ...prev, [pickerForName]: staffName }));
    }
    setPickerVisible(false);
    setPickerForName(null);
  }, [pickerForName]);

  const clearMapping = useCallback((unmatchedName: string) => {
    setMappings(prev => {
      const next = { ...prev };
      delete next[unmatchedName];
      return next;
    });
  }, []);

  const filteredStaffNames = staffNames.filter(name =>
    name.toLowerCase().includes(pickerSearch.toLowerCase())
  );

  const mappedCount = Object.keys(mappings).length;
  const hasAnyMappings = mappedCount > 0;

  const runResolve = useCallback(async () => {
    const activeMappings = Object.entries(mappings)
      .filter(([_, newName]) => newName && newName.trim().length > 0)
      .map(([oldName, newName]) => ({ old_name: oldName, new_name: newName }));

    if (activeMappings.length === 0) {
      Alert.alert('No Mappings', 'Please select a staff member for at least one unmatched name before resolving.');
      return;
    }

    const summaryLines = activeMappings.map(m => `  "${m.old_name}" → "${m.new_name}"`).join('\n');

    Alert.alert(
      'Resolve Unmatched Names',
      `This will update all client referral credit fields with the following name corrections:\n\n${summaryLines}\n\nAll affected user_profiles records will be updated and staff credit counts will be recalculated.\n\nThis cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Resolve',
          style: 'destructive',
          onPress: async () => {
            setResolving(true);
            setError(null);
            setResult(null);

            try {
              const { data, error: fnError } = await supabase.functions.invoke('manage-client-data', {
                body: {
                  action: 'resolve_unmatched_names',
                  mappings: activeMappings,
                },
              });

              if (fnError) {
                let msg = 'Resolution failed';
                try {
                  const parsed = JSON.parse(fnError.message);
                  if (parsed?.error) msg = parsed.error;
                } catch {
                  if (fnError.message) msg = fnError.message;
                }
                setError(msg);
                return;
              }

              if (data?.error) {
                setError(data.error);
                return;
              }

              setResult(data as ResolutionResult);

              // Clear mappings for successfully resolved names
              const resolvedNames = (data as ResolutionResult).resolution_details
                .filter(d => !d.error)
                .map(d => d.old_name);

              setMappings(prev => {
                const next = { ...prev };
                for (const name of resolvedNames) {
                  delete next[name];
                }
                return next;
              });

            } catch (err: any) {
              setError(err.message || 'Unexpected error during resolution');
            } finally {
              setResolving(false);
            }
          },
        },
      ]
    );
  }, [mappings]);

  // If resolution completed successfully, show results
  if (result) {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Ionicons name="build" size={16} color={COLORS.success} />
          <Text style={styles.headerTitle}>Name Resolution Complete</Text>
        </View>

        {/* Summary stats */}
        <View style={styles.resultStatsRow}>
          <View style={styles.resultStatBox}>
            <Text style={styles.resultStatNum}>{result.total_mappings}</Text>
            <Text style={styles.resultStatLbl}>Mappings</Text>
          </View>
          <View style={[styles.resultStatBox, result.total_records_updated > 0 && styles.resultStatBoxHighlight]}>
            <Text style={[styles.resultStatNum, result.total_records_updated > 0 && styles.resultStatNumHighlight]}>
              {result.total_records_updated}
            </Text>
            <Text style={[styles.resultStatLbl, result.total_records_updated > 0 && styles.resultStatLblHighlight]}>
              Records Updated
            </Text>
          </View>
          {result.errors > 0 && (
            <View style={[styles.resultStatBox, styles.resultStatBoxError]}>
              <Text style={[styles.resultStatNum, styles.resultStatNumError]}>{result.errors}</Text>
              <Text style={[styles.resultStatLbl, styles.resultStatLblError]}>Errors</Text>
            </View>
          )}
        </View>

        {/* Detail rows */}
        {result.resolution_details.map((detail, idx) => (
          <View key={idx} style={[styles.resultDetailRow, detail.error && styles.resultDetailRowError]}>
            <View style={styles.resultDetailLeft}>
              <Ionicons
                name={detail.error ? 'close-circle' : 'checkmark-circle'}
                size={16}
                color={detail.error ? COLORS.danger : COLORS.success}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.resultDetailMapping}>
                  "{detail.old_name}" → "{detail.new_name}"
                </Text>
                {detail.error ? (
                  <Text style={styles.resultDetailError}>{detail.error}</Text>
                ) : (
                  <Text style={styles.resultDetailCounts}>
                    {detail.trainer_records_updated} trainer + {detail.dietitian_records_updated} dietitian records updated
                  </Text>
                )}
              </View>
            </View>
          </View>
        ))}

        {/* Recount results */}
        {result.recount_results && result.recount_results.length > 0 && (
          <View style={styles.recountResultBox}>
            <Text style={styles.recountResultTitle}>Updated Credit Counts</Text>
            {result.recount_results.map((r, idx) => (
              <View key={idx} style={styles.recountResultRow}>
                <Ionicons name="person" size={12} color={COLORS.accent} />
                <Text style={styles.recountResultName}>{r.name}</Text>
                <View style={styles.recountResultBadge}>
                  <Text style={styles.recountResultBadgeText}>{r.new_credits} credits</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Re-run recount button */}
        <TouchableOpacity
          style={styles.rerunBtn}
          onPress={onResolved}
          activeOpacity={0.8}
        >
          <Ionicons name="refresh" size={16} color={COLORS.white} />
          <Text style={styles.rerunBtnText}>Re-run Full Recount</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Ionicons name="build" size={16} color={COLORS.warning} />
        <Text style={styles.headerTitle}>
          Resolve Unmatched Names ({unmatchedNames.length})
        </Text>
      </View>

      <Text style={styles.description}>
        These names appear in client referral credit fields but don't match any staff_contacts record. Map each to the correct staff member to fix the data.
      </Text>

      {/* Unmatched name rows */}
      {unmatchedNames.map((item, idx) => {
        const selectedStaff = mappings[item.name];
        return (
          <View key={idx} style={styles.unmatchedRow}>
            {/* Left: unmatched name info */}
            <View style={styles.unmatchedInfo}>
              <View style={styles.unmatchedNameRow}>
                <Ionicons name="help-circle" size={16} color={COLORS.warning} />
                <Text style={styles.unmatchedNameText} numberOfLines={1}>{item.name}</Text>
              </View>
              <View style={styles.unmatchedMeta}>
                <Text style={styles.unmatchedMetaText}>
                  {item.credit_count} client{item.credit_count !== 1 ? 's' : ''}
                </Text>
                {item.as_trainer > 0 && (
                  <View style={styles.metaChip}>
                    <Text style={styles.metaChipText}>{item.as_trainer} trainer</Text>
                  </View>
                )}
                {item.as_dietitian > 0 && (
                  <View style={[styles.metaChip, styles.metaChipDiet]}>
                    <Text style={[styles.metaChipText, styles.metaChipTextDiet]}>{item.as_dietitian} dietitian</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Arrow */}
            <Ionicons name="arrow-forward" size={16} color={COLORS.textMuted} style={{ marginHorizontal: 4 }} />

            {/* Right: staff picker */}
            <View style={styles.pickerWrap}>
              {selectedStaff ? (
                <View style={styles.selectedStaffRow}>
                  <TouchableOpacity
                    style={styles.selectedStaffBtn}
                    onPress={() => openPicker(item.name)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="person" size={12} color={COLORS.success} />
                    <Text style={styles.selectedStaffText} numberOfLines={1}>{selectedStaff}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.clearBtn}
                    onPress={() => clearMapping(item.name)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close" size={14} color={COLORS.danger} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.selectBtn}
                  onPress={() => openPicker(item.name)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.selectBtnText}>Select Staff</Text>
                  <Ionicons name="chevron-down" size={14} color={COLORS.accent} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        );
      })}

      {/* Resolve button */}
      <TouchableOpacity
        style={[
          styles.resolveBtn,
          (!hasAnyMappings || resolving) && styles.resolveBtnDisabled,
        ]}
        onPress={runResolve}
        disabled={!hasAnyMappings || resolving}
        activeOpacity={0.8}
      >
        {resolving ? (
          <ActivityIndicator size="small" color={COLORS.white} />
        ) : (
          <Ionicons name="checkmark-done" size={18} color={COLORS.white} />
        )}
        <Text style={styles.resolveBtnText}>
          {resolving
            ? 'Resolving...'
            : `Resolve ${mappedCount} Name${mappedCount !== 1 ? 's' : ''} & Recount`}
        </Text>
      </TouchableOpacity>

      {hasAnyMappings && (
        <Text style={styles.resolveHint}>
          {mappedCount} of {unmatchedNames.length} name{unmatchedNames.length !== 1 ? 's' : ''} mapped. 
          Unmapped names will be left unchanged.
        </Text>
      )}

      {/* Error */}
      {error && (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={16} color={COLORS.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Staff Picker Modal */}
      <Modal
        visible={pickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Select Staff Member</Text>
                {pickerForName && (
                  <Text style={styles.modalSubtitle}>
                    Mapping: "{pickerForName}"
                  </Text>
                )}
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setPickerVisible(false)}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={styles.searchRow}>
              <Ionicons name="search" size={16} color={COLORS.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search staff names..."
                placeholderTextColor={COLORS.textMuted}
                value={pickerSearch}
                onChangeText={setPickerSearch}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {pickerSearch.length > 0 && (
                <TouchableOpacity onPress={() => setPickerSearch('')}>
                  <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Staff list */}
            <FlatList
              data={filteredStaffNames}
              keyExtractor={(item, index) => `${item}-${index}`}
              style={styles.staffList}
              renderItem={({ item }) => {
                const isSelected = pickerForName ? mappings[pickerForName] === item : false;
                return (
                  <TouchableOpacity
                    style={[styles.staffListItem, isSelected && styles.staffListItemSelected]}
                    onPress={() => selectStaff(item)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={isSelected ? 'checkmark-circle' : 'person-outline'}
                      size={18}
                      color={isSelected ? COLORS.success : COLORS.textSecondary}
                    />
                    <Text style={[styles.staffListItemText, isSelected && styles.staffListItemTextSelected]}>
                      {item}
                    </Text>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyList}>
                  <Ionicons name="search" size={24} color={COLORS.textMuted} />
                  <Text style={styles.emptyListText}>
                    {pickerSearch ? `No staff matching "${pickerSearch}"` : 'No staff members found'}
                  </Text>
                </View>
              }
              ItemSeparatorComponent={() => <View style={styles.listSeparator} />}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.warningLight,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  headerTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.primary,
  },
  description: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    lineHeight: 16,
    marginBottom: SPACING.md,
  },

  // Unmatched row
  unmatchedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  unmatchedInfo: {
    flex: 1,
    minWidth: 0,
  },
  unmatchedNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  unmatchedNameText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.primary,
    flex: 1,
  },
  unmatchedMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
    marginLeft: 20,
  },
  unmatchedMetaText: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  metaChip: {
    backgroundColor: COLORS.brandBlueLight,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  metaChipDiet: {
    backgroundColor: COLORS.successLight,
  },
  metaChipText: {
    fontSize: 8,
    fontWeight: '600',
    color: COLORS.accent,
  },
  metaChipTextDiet: {
    color: COLORS.success,
  },

  // Picker area
  pickerWrap: {
    flex: 1,
    minWidth: 0,
  },
  selectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: COLORS.brandBlueLight,
    borderRadius: BORDER_RADIUS.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderStyle: 'dashed',
  },
  selectBtnText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.accent,
  },
  selectedStaffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  selectedStaffBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.successLight,
    borderRadius: BORDER_RADIUS.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  selectedStaffText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.success,
    flex: 1,
  },
  clearBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.dangerLight,
  },

  // Resolve button
  resolveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.warning,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
  },
  resolveBtnDisabled: {
    opacity: 0.5,
  },
  resolveBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.white,
  },
  resolveHint: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.xs,
    fontStyle: 'italic',
  },

  // Error
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    backgroundColor: COLORS.dangerLight,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    marginTop: SPACING.sm,
  },
  errorText: {
    flex: 1,
    fontSize: FONT_SIZES.xs,
    color: COLORS.danger,
    lineHeight: 16,
  },

  // ═══════════════════════════════════════
  // Modal styles
  // ═══════════════════════════════════════
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    maxHeight: '70%',
    paddingBottom: Platform.OS === 'ios' ? 34 : SPACING.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  modalTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.primary,
  },
  modalSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },

  // Search
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: Platform.OS === 'ios' ? SPACING.md : SPACING.xs,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    color: COLORS.primary,
    paddingVertical: 0,
  },

  // Staff list
  staffList: {
    paddingHorizontal: SPACING.lg,
  },
  staffListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
  },
  staffListItemSelected: {
    backgroundColor: COLORS.successLight,
  },
  staffListItemText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.primary,
    fontWeight: '500',
  },
  staffListItemTextSelected: {
    color: COLORS.success,
    fontWeight: '700',
  },
  listSeparator: {
    height: 1,
    backgroundColor: COLORS.borderLight,
  },
  emptyList: {
    alignItems: 'center',
    paddingVertical: SPACING.xxxl,
    gap: SPACING.sm,
  },
  emptyListText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
  },

  // ═══════════════════════════════════════
  // Resolution result styles
  // ═══════════════════════════════════════
  resultStatsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  resultStatBox: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    alignItems: 'center',
  },
  resultStatBoxHighlight: {
    backgroundColor: COLORS.successLight,
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  resultStatBoxError: {
    backgroundColor: COLORS.dangerLight,
  },
  resultStatNum: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: COLORS.primary,
  },
  resultStatNumHighlight: {
    color: COLORS.success,
  },
  resultStatNumError: {
    color: COLORS.danger,
  },
  resultStatLbl: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginTop: 1,
    textAlign: 'center',
  },
  resultStatLblHighlight: {
    color: COLORS.success,
  },
  resultStatLblError: {
    color: COLORS.danger,
  },

  // Detail rows
  resultDetailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    marginBottom: SPACING.xs,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.success,
  },
  resultDetailRowError: {
    borderLeftColor: COLORS.danger,
  },
  resultDetailLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  resultDetailMapping: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.primary,
  },
  resultDetailCounts: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  resultDetailError: {
    fontSize: 10,
    color: COLORS.danger,
    marginTop: 2,
  },

  // Recount result
  recountResultBox: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    marginTop: SPACING.sm,
  },
  recountResultTitle: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: SPACING.xs,
  },
  recountResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: 3,
  },
  recountResultName: {
    flex: 1,
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  recountResultBadge: {
    backgroundColor: COLORS.brandBlueLight,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  recountResultBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.accent,
  },

  // Re-run button
  rerunBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accent,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.md,
  },
  rerunBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.white,
  },
});
