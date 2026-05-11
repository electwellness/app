import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import UnmatchedNameResolver, { UnmatchedName } from './UnmatchedNameResolver';


interface AuthUser {
  id: string;
  email: string;
  created_at?: string;
  last_sign_in_at?: string;
}

interface AuditResult {
  total_auth_users: number;
  total_user_profiles: number;
  total_approved_emails: number;
  orphaned_auth_users: AuthUser[];
  matched_users: AuthUser[];
  approved_emails_without_profile: any[];
}

interface DeleteResult {
  email: string;
  success: boolean;
  error?: string;
}

interface RecountStaffDetail {
  staff_id: string;
  staff_name: string;
  old_credits: number | null;
  new_credits: number;
  changed: boolean;
}

interface RecountResult {
  total_staff_processed: number;
  updated: number;
  unchanged: number;
  errors: number;
  total_credit_entries: number;
  unique_credited_staff_names: number;
  unmatched_names: UnmatchedName[];
  staff_names: string[];
  details: RecountStaffDetail[];
}


export default function DatabaseHealthPanel() {
  const [expanded, setExpanded] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteResults, setDeleteResults] = useState<DeleteResult[] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Referral credit recount state
  const [recounting, setRecounting] = useState(false);
  const [recountResult, setRecountResult] = useState<RecountResult | null>(null);
  const [recountError, setRecountError] = useState<string | null>(null);
  const [showRecountDetails, setShowRecountDetails] = useState(false);

  const runAudit = useCallback(async () => {
    setAuditing(true);
    setAuditError(null);
    setAuditResult(null);
    setDeleteResults(null);

    try {
      const { data, error } = await supabase.functions.invoke('cleanup-users', {
        body: { mode: 'audit' },
      });

      if (error) {
        let msg = 'Audit failed';
        try {
          const parsed = JSON.parse(error.message);
          if (parsed?.error) msg = parsed.error;
        } catch {
          if (error.message) msg = error.message;
        }
        setAuditError(msg);
        return;
      }

      if (data?.error) {
        setAuditError(data.error);
        return;
      }

      setAuditResult(data);
    } catch (err: any) {
      setAuditError(err.message || 'Unexpected error during audit');
    } finally {
      setAuditing(false);
    }
  }, []);

  const deleteOrphanedUser = useCallback(async (userId: string, email: string) => {
    Alert.alert(
      'Delete Orphaned User',
      `Are you sure you want to delete the orphaned auth account for:\n\n${email}\n\nThis will permanently remove the auth.users record. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(userId);
            try {
              const { data, error } = await supabase.functions.invoke('cleanup-users', {
                body: { mode: 'delete-one', user_id: userId },
              });

              if (error || data?.error) {
                const msg = data?.error || error?.message || 'Delete failed';
                Alert.alert('Delete Failed', msg);
              } else {
                setAuditResult(prev => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    orphaned_auth_users: prev.orphaned_auth_users.filter(u => u.id !== userId),
                    total_auth_users: prev.total_auth_users - 1,
                  };
                });
                Alert.alert('Success', `Deleted orphaned account: ${email}`);
              }
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Unexpected error');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  }, []);

  const deleteAllOrphaned = useCallback(async () => {
    if (!auditResult?.orphaned_auth_users?.length) return;

    const count = auditResult.orphaned_auth_users.length;
    Alert.alert(
      'Delete All Orphaned Users',
      `Are you sure you want to delete ALL ${count} orphaned auth accounts?\n\nThis will permanently remove these auth.users records that have no matching user_profile. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Delete All ${count}`,
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            setDeleteResults(null);
            try {
              const { data, error } = await supabase.functions.invoke('cleanup-users', {
                body: { mode: 'nuke' },
              });

              if (error) {
                let msg = 'Bulk delete failed';
                try {
                  const parsed = JSON.parse(error.message);
                  if (parsed?.error) msg = parsed.error;
                } catch {
                  if (error.message) msg = error.message;
                }
                Alert.alert('Error', msg);
                return;
              }

              if (data?.error) {
                Alert.alert('Error', data.error);
                return;
              }

              if (data?.results) {
                setDeleteResults(data.results);
              }

              setTimeout(() => runAudit(), 1000);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Unexpected error');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  }, [auditResult, runAudit]);

  // Core recount execution (no confirmation dialog) - can be called directly
  const doRecount = useCallback(async () => {
    setRecounting(true);
    setRecountError(null);
    setRecountResult(null);
    setShowRecountDetails(false);

    try {
      const { data, error } = await supabase.functions.invoke('manage-client-data', {
        body: { action: 'bulk_recount_referral_credits' },
      });

      if (error) {
        let msg = 'Recount failed';
        try {
          const parsed = JSON.parse(error.message);
          if (parsed?.error) msg = parsed.error;
        } catch {
          if (error.message) msg = error.message;
        }
        setRecountError(msg);
        return;
      }

      if (data?.error) {
        setRecountError(data.error);
        return;
      }

      setRecountResult(data as RecountResult);
    } catch (err: any) {
      setRecountError(err.message || 'Unexpected error during recount');
    } finally {
      setRecounting(false);
    }
  }, []);

  // Button handler with confirmation dialog
  const runBulkRecount = useCallback(async () => {
    Alert.alert(
      'Recount Referral Credits',
      'This will scan all client profiles and recompute referral_credits for every staff member in staff_contacts.\n\nThis is safe to run and will fix any historical mismatches.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Run Recount',
          onPress: doRecount,
        },
      ]
    );
  }, [doRecount]);


  if (!expanded) {
    return (
      <TouchableOpacity
        style={styles.collapsedCard}
        onPress={() => setExpanded(true)}
        activeOpacity={0.7}
      >
        <View style={styles.collapsedIcon}>
          <Ionicons name="medkit" size={22} color={COLORS.warning} />
        </View>
        <View style={styles.collapsedTextWrap}>
          <Text style={styles.collapsedTitle}>Database Health</Text>
          <Text style={styles.collapsedSubtitle}>Audit & clean up orphaned records</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.panel}>
      {/* Header */}
      <View style={styles.panelHeader}>
        <View style={styles.panelHeaderLeft}>
          <Ionicons name="medkit" size={22} color={COLORS.warning} />
          <Text style={styles.panelTitle}>Database Health</Text>
        </View>
        <TouchableOpacity onPress={() => setExpanded(false)}>
          <Ionicons name="chevron-up" size={22} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      <Text style={styles.panelDescription}>
        Audit auth.users vs user_profiles to find orphaned accounts that exist in the database but aren't visible in the app. Orphaned accounts can be safely deleted.
      </Text>

      {/* Audit Button */}
      <TouchableOpacity
        style={[styles.auditBtn, auditing && styles.auditBtnDisabled]}
        onPress={runAudit}
        disabled={auditing}
        activeOpacity={0.8}
      >
        {auditing ? (
          <ActivityIndicator size="small" color={COLORS.white} />
        ) : (
          <Ionicons name="search" size={18} color={COLORS.white} />
        )}
        <Text style={styles.auditBtnText}>
          {auditing ? 'Running Audit...' : 'Run Database Audit'}
        </Text>
      </TouchableOpacity>

      {/* Error */}
      {auditError && (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={18} color={COLORS.danger} />
          <Text style={styles.errorText}>{auditError}</Text>
        </View>
      )}

      {/* Audit Results */}
      {auditResult && (
        <View style={styles.resultsSection}>
          {/* Summary Stats */}
          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{auditResult.total_auth_users}</Text>
              <Text style={styles.statLbl}>Auth Users</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{auditResult.total_user_profiles}</Text>
              <Text style={styles.statLbl}>User Profiles</Text>
            </View>
            <View style={[styles.statBox, auditResult.orphaned_auth_users.length > 0 && styles.statBoxDanger]}>
              <Text style={[styles.statNum, auditResult.orphaned_auth_users.length > 0 && styles.statNumDanger]}>
                {auditResult.orphaned_auth_users.length}
              </Text>
              <Text style={[styles.statLbl, auditResult.orphaned_auth_users.length > 0 && styles.statLblDanger]}>
                Orphaned
              </Text>
            </View>
          </View>

          {/* Health Status */}
          {auditResult.orphaned_auth_users.length === 0 ? (
            <View style={styles.healthyBox}>
              <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
              <View style={{ flex: 1 }}>
                <Text style={styles.healthyTitle}>Database is Healthy</Text>
                <Text style={styles.healthySubtitle}>
                  All {auditResult.total_auth_users} auth.users have matching user_profiles. No cleanup needed.
                </Text>
              </View>
            </View>
          ) : (
            <>
              {/* Orphaned Users List */}
              <View style={styles.orphanedSection}>
                <View style={styles.orphanedHeader}>
                  <Text style={styles.orphanedTitle}>
                    Orphaned Auth Users ({auditResult.orphaned_auth_users.length})
                  </Text>
                  <TouchableOpacity
                    style={[styles.deleteAllBtn, deleting && styles.deleteAllBtnDisabled]}
                    onPress={deleteAllOrphaned}
                    disabled={deleting}
                    activeOpacity={0.8}
                  >
                    {deleting ? (
                      <ActivityIndicator size="small" color={COLORS.white} />
                    ) : (
                      <Ionicons name="trash" size={14} color={COLORS.white} />
                    )}
                    <Text style={styles.deleteAllBtnText}>
                      {deleting ? 'Deleting...' : 'Delete All'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.orphanedDescription}>
                  These accounts exist in auth.users but have no user_profile, making them invisible in the app. They can be safely deleted.
                </Text>

                {auditResult.orphaned_auth_users.map((user) => (
                  <View key={user.id} style={styles.orphanedRow}>
                    <View style={styles.orphanedRowIcon}>
                      <Ionicons name="person-remove" size={16} color={COLORS.danger} />
                    </View>
                    <View style={styles.orphanedRowInfo}>
                      <Text style={styles.orphanedEmail} numberOfLines={1}>
                        {user.email}
                      </Text>
                      <Text style={styles.orphanedId} numberOfLines={1}>
                        ID: {user.id.substring(0, 8)}...
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.deleteOneBtn, deletingId === user.id && styles.deleteOneBtnDisabled]}
                      onPress={() => deleteOrphanedUser(user.id, user.email)}
                      disabled={deletingId === user.id}
                      activeOpacity={0.7}
                    >
                      {deletingId === user.id ? (
                        <ActivityIndicator size="small" color={COLORS.danger} />
                      ) : (
                        <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
                      )}
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Matched Users (collapsible) */}
          {auditResult.matched_users && auditResult.matched_users.length > 0 && (
            <MatchedUsersSection users={auditResult.matched_users} />
          )}

          {/* Delete Results */}
          {deleteResults && deleteResults.length > 0 && (
            <View style={styles.deleteResultsSection}>
              <Text style={styles.deleteResultsTitle}>Delete Results</Text>
              {deleteResults.map((result, idx) => (
                <View key={idx} style={styles.deleteResultRow}>
                  <Ionicons
                    name={result.success ? 'checkmark-circle' : 'close-circle'}
                    size={16}
                    color={result.success ? COLORS.success : COLORS.danger}
                  />
                  <Text style={[styles.deleteResultText, !result.success && styles.deleteResultTextError]}>
                    {result.email} {result.success ? '- Deleted' : `- Failed: ${result.error || 'Unknown error'}`}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* Referral Credit Recount Section                            */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <View style={styles.divider} />

      <View style={styles.recountSection}>
        <View style={styles.recountHeaderRow}>
          <View style={styles.recountIconWrap}>
            <Ionicons name="git-network" size={20} color={COLORS.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.recountTitle}>Referral Credit Recount</Text>
            <Text style={styles.recountSubtitle}>
              Bulk recompute referral_credits for all staff members
            </Text>
          </View>
        </View>

        <Text style={styles.recountDescription}>
          Scans every client's referral_credit_trainer and referral_credit_dietitian fields, then updates each staff member's referral_credits count in staff_contacts. Use this to fix historical mismatches from before auto-sync was enabled.
        </Text>

        {/* Recount Button */}
        <TouchableOpacity
          style={[styles.recountBtn, recounting && styles.recountBtnDisabled]}
          onPress={runBulkRecount}
          disabled={recounting}
          activeOpacity={0.8}
        >
          {recounting ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <Ionicons name="refresh" size={18} color={COLORS.white} />
          )}
          <Text style={styles.recountBtnText}>
            {recounting ? 'Recounting Credits...' : 'Recount All Referral Credits'}
          </Text>
        </TouchableOpacity>

        {/* Progress Indicator */}
        {recounting && (
          <View style={styles.progressBox}>
            <ActivityIndicator size="large" color={COLORS.accent} />
            <Text style={styles.progressText}>
              Scanning client profiles and recalculating staff credits...
            </Text>
            <Text style={styles.progressSubtext}>
              This may take a moment depending on the number of records.
            </Text>
          </View>
        )}

        {/* Recount Error */}
        {recountError && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color={COLORS.danger} />
            <Text style={styles.errorText}>{recountError}</Text>
          </View>
        )}

        {/* Recount Results */}
        {recountResult && (
          <View style={styles.recountResults}>
            {/* Summary Stats */}
            <View style={styles.recountStatsGrid}>
              <View style={styles.recountStatBox}>
                <Text style={styles.recountStatNum}>{recountResult.total_staff_processed}</Text>
                <Text style={styles.recountStatLbl}>Staff Processed</Text>
              </View>
              <View style={[
                styles.recountStatBox,
                recountResult.updated > 0 && styles.recountStatBoxHighlight,
              ]}>
                <Text style={[
                  styles.recountStatNum,
                  recountResult.updated > 0 && styles.recountStatNumHighlight,
                ]}>
                  {recountResult.updated}
                </Text>
                <Text style={[
                  styles.recountStatLbl,
                  recountResult.updated > 0 && styles.recountStatLblHighlight,
                ]}>
                  Updated
                </Text>
              </View>
              <View style={styles.recountStatBox}>
                <Text style={styles.recountStatNum}>{recountResult.unchanged}</Text>
                <Text style={styles.recountStatLbl}>Unchanged</Text>
              </View>
              {recountResult.errors > 0 && (
                <View style={[styles.recountStatBox, styles.statBoxDanger]}>
                  <Text style={[styles.recountStatNum, styles.statNumDanger]}>
                    {recountResult.errors}
                  </Text>
                  <Text style={[styles.recountStatLbl, styles.statLblDanger]}>Errors</Text>
                </View>
              )}
            </View>

            {/* Overall Status */}
            {recountResult.updated === 0 && recountResult.errors === 0 ? (
              <View style={styles.healthyBox}>
                <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.healthyTitle}>All Credits in Sync</Text>
                  <Text style={styles.healthySubtitle}>
                    All {recountResult.total_staff_processed} staff members already had correct referral credit counts. No updates needed.
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.recountSummaryBox}>
                <Ionicons
                  name={recountResult.errors > 0 ? 'warning' : 'checkmark-done-circle'}
                  size={24}
                  color={recountResult.errors > 0 ? COLORS.warning : COLORS.success}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.recountSummaryTitle}>
                    {recountResult.errors > 0
                      ? `Recount Complete with ${recountResult.errors} Error${recountResult.errors > 1 ? 's' : ''}`
                      : 'Recount Complete'}
                  </Text>
                  <Text style={styles.recountSummarySubtitle}>
                    {recountResult.updated} staff member{recountResult.updated !== 1 ? 's' : ''} updated
                    {recountResult.unchanged > 0 ? `, ${recountResult.unchanged} already correct` : ''}.
                    {'\n'}Scanned {recountResult.total_credit_entries} credit entries across {recountResult.unique_credited_staff_names} unique staff names.
                  </Text>
                </View>
              </View>
            )}

            {/* Unmatched Names - Interactive Resolver */}
            {recountResult.unmatched_names.length > 0 && (
              <UnmatchedNameResolver
                unmatchedNames={recountResult.unmatched_names}
                staffNames={recountResult.staff_names || []}
                onResolved={doRecount}
              />
            )}


            {/* Details Toggle */}
            {recountResult.details && recountResult.details.length > 0 && (
              <View style={styles.detailsSection}>
                <TouchableOpacity
                  style={styles.detailsToggle}
                  onPress={() => setShowRecountDetails(!showRecountDetails)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="list" size={16} color={COLORS.textSecondary} />
                  <Text style={styles.detailsToggleText}>
                    {showRecountDetails ? 'Hide' : 'Show'} Staff Details ({recountResult.details.length})
                  </Text>
                  <Ionicons
                    name={showRecountDetails ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={COLORS.textMuted}
                  />
                </TouchableOpacity>

                {showRecountDetails && (
                  <View style={styles.detailsList}>
                    {/* Column Headers */}
                    <View style={styles.detailsHeaderRow}>
                      <Text style={[styles.detailsHeaderCell, { flex: 2 }]}>Staff Member</Text>
                      <Text style={[styles.detailsHeaderCell, { flex: 1, textAlign: 'center' }]}>Old</Text>
                      <Text style={[styles.detailsHeaderCell, { flex: 0.5, textAlign: 'center' }]}></Text>
                      <Text style={[styles.detailsHeaderCell, { flex: 1, textAlign: 'center' }]}>New</Text>
                      <Text style={[styles.detailsHeaderCell, { flex: 1, textAlign: 'center' }]}>Status</Text>
                    </View>

                    {recountResult.details.map((detail, idx) => (
                      <View
                        key={detail.staff_id}
                        style={[
                          styles.detailRow,
                          idx % 2 === 0 && styles.detailRowAlt,
                          detail.changed && styles.detailRowChanged,
                        ]}
                      >
                        <Text style={[styles.detailName, { flex: 2 }]} numberOfLines={1}>
                          {detail.staff_name || '(unnamed)'}
                        </Text>
                        <Text style={[styles.detailNum, { flex: 1, textAlign: 'center' }]}>
                          {detail.old_credits ?? 0}
                        </Text>
                        <Text style={[styles.detailArrow, { flex: 0.5, textAlign: 'center' }]}>
                          {detail.changed ? '>' : '='}
                        </Text>
                        <Text style={[
                          styles.detailNum,
                          { flex: 1, textAlign: 'center' },
                          detail.changed && styles.detailNumChanged,
                        ]}>
                          {detail.new_credits}
                        </Text>
                        <View style={[styles.detailStatusWrap, { flex: 1 }]}>
                          {detail.changed ? (
                            <View style={styles.detailChangedBadge}>
                              <Ionicons name="swap-horizontal" size={10} color={COLORS.white} />
                              <Text style={styles.detailChangedText}>Changed</Text>
                            </View>
                          ) : (
                            <View style={styles.detailUnchangedBadge}>
                              <Ionicons name="checkmark" size={10} color={COLORS.success} />
                              <Text style={styles.detailUnchangedText}>OK</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

function MatchedUsersSection({ users }: { users: AuthUser[] }) {
  const [showMatched, setShowMatched] = useState(false);

  return (
    <View style={styles.matchedSection}>
      <TouchableOpacity
        style={styles.matchedToggle}
        onPress={() => setShowMatched(!showMatched)}
        activeOpacity={0.7}
      >
        <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
        <Text style={styles.matchedToggleText}>
          Matched Users ({users.length})
        </Text>
        <Ionicons
          name={showMatched ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={COLORS.textMuted}
        />
      </TouchableOpacity>
      {showMatched && users.map((user) => (
        <View key={user.id} style={styles.matchedRow}>
          <Ionicons name="person" size={14} color={COLORS.success} />
          <Text style={styles.matchedEmail} numberOfLines={1}>{user.email}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // Collapsed state
  collapsedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    gap: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.warningLight,
    ...SHADOWS.sm,
  },
  collapsedIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.warningLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  collapsedTextWrap: { flex: 1 },
  collapsedTitle: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.primary },
  collapsedSubtitle: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 2 },

  // Expanded panel
  panel: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.warningLight,
    ...SHADOWS.sm,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  panelHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  panelTitle: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.primary },
  panelDescription: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginBottom: SPACING.md,
  },

  // Audit button
  auditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accent,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  auditBtnDisabled: { opacity: 0.6 },
  auditBtnText: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.white },

  // Error
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    backgroundColor: COLORS.dangerLight,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  errorText: { flex: 1, fontSize: FONT_SIZES.sm, color: COLORS.danger, lineHeight: 18 },

  // Results
  resultsSection: { marginTop: SPACING.sm },

  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  statBox: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
  },
  statBoxDanger: {
    backgroundColor: COLORS.dangerLight,
  },
  statNum: { fontSize: FONT_SIZES.xxl, fontWeight: '800', color: COLORS.primary },
  statNumDanger: { color: COLORS.danger },
  statLbl: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: COLORS.textMuted, marginTop: 2 },
  statLblDanger: { color: COLORS.danger },

  // Healthy state
  healthyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.successLight,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  healthyTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.success },
  healthySubtitle: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, marginTop: 2 },

  // Orphaned section
  orphanedSection: {
    marginBottom: SPACING.md,
  },
  orphanedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  orphanedTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.danger },
  orphanedDescription: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    lineHeight: 16,
    marginBottom: SPACING.sm,
  },

  // Delete all button
  deleteAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.danger,
    borderRadius: BORDER_RADIUS.sm,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  deleteAllBtnDisabled: { opacity: 0.6 },
  deleteAllBtnText: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.white },

  // Orphaned row
  orphanedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.dangerLight,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.md,
    marginBottom: SPACING.xs,
  },
  orphanedRowIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(231, 76, 60, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  orphanedRowInfo: { flex: 1 },
  orphanedEmail: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.primary },
  orphanedId: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 1 },
  deleteOneBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
  },
  deleteOneBtnDisabled: { opacity: 0.5 },

  // Matched section
  matchedSection: {
    marginTop: SPACING.sm,
  },
  matchedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
  },
  matchedToggleText: { flex: 1, fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.textSecondary },
  matchedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
  },
  matchedEmail: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary },

  // Delete results
  deleteResultsSection: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
  },
  deleteResultsTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.primary, marginBottom: SPACING.sm },
  deleteResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  deleteResultText: { flex: 1, fontSize: FONT_SIZES.sm, color: COLORS.textSecondary },
  deleteResultTextError: { color: COLORS.danger },

  // ═══════════════════════════════════════════════════
  // Referral Credit Recount Styles
  // ═══════════════════════════════════════════════════
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.lg,
  },

  recountSection: {
    // No extra wrapper needed
  },
  recountHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  recountIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.brandBlueLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recountTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.primary,
  },
  recountSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  recountDescription: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginBottom: SPACING.md,
  },

  // Recount button
  recountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accent,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  recountBtnDisabled: { opacity: 0.6 },
  recountBtnText: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.white },

  // Progress
  progressBox: {
    alignItems: 'center',
    backgroundColor: COLORS.brandBlueLight,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.xl,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  progressText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.primary,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  progressSubtext: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    textAlign: 'center',
  },

  // Recount results
  recountResults: {
    marginTop: SPACING.xs,
  },
  recountStatsGrid: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
    flexWrap: 'wrap',
  },
  recountStatBox: {
    flex: 1,
    minWidth: 70,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
  },
  recountStatBoxHighlight: {
    backgroundColor: COLORS.brandBlueLight,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  recountStatNum: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: COLORS.primary,
  },
  recountStatNumHighlight: {
    color: COLORS.accent,
  },
  recountStatLbl: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
  recountStatLblHighlight: {
    color: COLORS.accent,
  },

  // Summary box
  recountSummaryBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.brandBlueLight,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  recountSummaryTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.primary,
  },
  recountSummarySubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },

  // Unmatched names warning
  unmatchedBox: {
    backgroundColor: COLORS.warningLight,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  unmatchedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  unmatchedTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.warning,
  },
  unmatchedDescription: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    lineHeight: 16,
    marginBottom: SPACING.sm,
  },
  unmatchedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: 3,
  },
  unmatchedName: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: '500',
  },

  // Details section
  detailsSection: {
    marginTop: SPACING.sm,
  },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
  },
  detailsToggleText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  detailsList: {
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  detailsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  detailsHeaderCell: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.white,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  detailRowAlt: {
    backgroundColor: COLORS.background,
  },
  detailRowChanged: {
    backgroundColor: COLORS.brandBlueLight,
  },
  detailName: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '500',
    color: COLORS.primary,
  },
  detailNum: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  detailArrow: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  detailNumChanged: {
    color: COLORS.accent,
    fontWeight: '800',
  },
  detailStatusWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailChangedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: COLORS.accent,
    borderRadius: BORDER_RADIUS.sm,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  detailChangedText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.white,
  },
  detailUnchangedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: COLORS.successLight,
    borderRadius: BORDER_RADIUS.sm,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  detailUnchangedText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.success,
  },
});
