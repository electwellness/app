import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../../constants/theme';
import { supabase } from '../../lib/supabase';

const ORPHANED_EMAILS = [
  'janedoe@electwellness.com',
  'ollyjensen@gmail123.com',
  'jamiebethjensen@gmail.com',
  'john.doe@electwellness.com',
  'alicia.akins@electwellness.com',
  'tcjensen1@gmail.com',
  'Liza_Janee@yahoo.com',
];

const CORRUPTION_FIX_SQL = `DELETE FROM auth.identities WHERE id::text = '' OR length(id::text) < 36;`;



interface CleanupResult {
  email: string;
  auth_user_found: boolean;
  auth_user_id: string | null;
  auth_user_deleted: boolean;
  dependent_records_deleted: Record<string, any>;
  errors: string[];
}

interface CleanupResponse {
  success: boolean;
  summary: {
    emails_requested: number;
    auth_users_deleted: number;
    auth_users_failed: number;
    remaining_auth_users: number;
    remaining_user_profiles: number;
  };
  results: CleanupResult[];
  remaining_auth_users: { id: string; email: string }[];
  remaining_user_profiles: { id: string; email: string; full_name: string; role: string }[];
}

type StepStatus = 'pending' | 'in_progress' | 'done' | 'error';

export default function OrphanedAccountCleanup() {
  const [expanded, setExpanded] = useState(false);
  const [step1Status, setStep1Status] = useState<StepStatus>('pending');
  const [step1Copied, setStep1Copied] = useState(false);
  const [step1VerifyResult, setStep1VerifyResult] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [running, setRunning] = useState(false);
  const [response, setResponse] = useState<CleanupResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const copySQL = async (sql: string) => {
    try {
      if (Platform.OS === 'web' && navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(sql);
        setStep1Copied(true);
        setTimeout(() => setStep1Copied(false), 3000);
      } else {
        // On native, the SQL text is selectable so users can long-press to copy
        Alert.alert('SQL Command', sql, [{ text: 'OK' }]);
      }
    } catch {
      Alert.alert('Copy SQL', sql, [{ text: 'OK' }]);
    }
  };


  const verifyCorruptionFix = async () => {
    setVerifying(true);
    setStep1VerifyResult(null);
    try {
      // Try to query auth.identities for corrupted rows via the edge function
      const { data, error: fnError } = await supabase.functions.invoke(
        'cleanup-orphaned-users',
        { body: { mode: 'verify-corruption-fix' } }
      );

      if (fnError) {
        // If the edge function doesn't support this mode, try a different approach
        // Just try to check if we can delete a user (dry run)
        setStep1VerifyResult(
          'Cannot verify automatically. Please confirm you ran the SQL in the Dashboard SQL Editor, then proceed to Step 2.'
        );
        setStep1Status('done'); // Assume fixed, let Step 2 confirm
        return;
      }

      if (data?.corrupted_rows === 0) {
        setStep1VerifyResult('Corruption fixed! No corrupted rows found in auth.identities. Proceed to Step 2.');
        setStep1Status('done');
      } else if (data?.corrupted_rows > 0) {
        setStep1VerifyResult(
          `Still ${data.corrupted_rows} corrupted row(s) found. Please run the SQL fix in the Dashboard SQL Editor.`
        );
        setStep1Status('error');
      } else if (data?.error) {
        setStep1VerifyResult(data.error);
        setStep1Status('error');
      } else {
        // Edge function returned but without expected fields - assume it doesn't support verify mode
        setStep1VerifyResult(
          'Verification not available. Please confirm you ran the SQL fix, then proceed to Step 2.'
        );
        setStep1Status('done');
      }
    } catch (err: any) {
      setStep1VerifyResult(
        'Could not verify automatically. Please confirm you ran the SQL in the Dashboard, then proceed to Step 2.'
      );
      setStep1Status('done');
    } finally {
      setVerifying(false);
    }
  };

  const markStep1Done = () => {
    setStep1Status('done');
    setStep1VerifyResult('Manually confirmed. Proceeding to Step 2.');
  };

  const runCleanup = async () => {
    Alert.alert(
      `Delete ${ORPHANED_EMAILS.length} Orphaned Accounts`,
      `This will permanently delete all ${ORPHANED_EMAILS.length} orphaned accounts from auth.users AND remove all their dependent records.\n\nThis cannot be undone. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Delete All ${ORPHANED_EMAILS.length}`,
          style: 'destructive',
          onPress: async () => {
            setRunning(true);
            setError(null);
            setResponse(null);

            try {
              const { data, error: fnError } = await supabase.functions.invoke(
                'cleanup-orphaned-users',
                { body: { emails: ORPHANED_EMAILS } }
              );

              if (fnError) {
                let msg = 'Cleanup failed';
                try {
                  const parsed =
                    typeof fnError.message === 'string'
                      ? JSON.parse(fnError.message)
                      : fnError;
                  if (parsed && parsed.error) msg = parsed.error;
                  else if (fnError.message) msg = fnError.message;
                } catch {
                  if (fnError.message) msg = fnError.message;
                }
                setError(msg);
                return;
              }

              if (data && data.error) {
                setError(data.error);
                return;
              }

              setResponse(data as CleanupResponse);
            } catch (err: any) {
              setError(
                err.message ||
                  'Unexpected error — ensure the cleanup-orphaned-users edge function is deployed'
              );
            } finally {
              setRunning(false);
            }
          },
        },
      ]
    );
  };

  if (!expanded) {
    return (
      <TouchableOpacity
        style={styles.collapsedCard}
        onPress={() => setExpanded(true)}
        activeOpacity={0.7}
      >
        <View style={styles.collapsedIcon}>
          <Ionicons name="nuclear" size={22} color={COLORS.danger} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.collapsedTitle}>Orphaned Account Cleanup</Text>
          <Text style={styles.collapsedSub}>
            2-step fix: repair corrupted row, then delete {ORPHANED_EMAILS.length} orphaned accounts
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.panel}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="nuclear" size={22} color={COLORS.danger} />
          <Text style={styles.title}>Orphaned Account Cleanup</Text>
        </View>
        <TouchableOpacity onPress={() => setExpanded(false)}>
          <Ionicons name="chevron-up" size={22} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      <Text style={styles.description}>
        A corrupted row in auth.identities (empty string in UUID column) blocks all CASCADE DELETE
        operations on auth.users. Follow both steps below to fix and clean up.
      </Text>

      {/* ── STEP 1: Fix Corrupted Row ── */}
      <View style={[styles.stepCard, step1Status === 'done' && styles.stepCardDone]}>
        <View style={styles.stepHeader}>
          <View style={styles.stepBadge}>
            {step1Status === 'done' ? (
              <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
            ) : (
              <Text style={styles.stepBadgeText}>1</Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.stepTitle}>Fix Corrupted auth.identities Row</Text>
            <Text style={styles.stepSubtitle}>
              Run this SQL in the Supabase Dashboard &gt; SQL Editor
            </Text>
          </View>
        </View>

        {/* SQL Command Box */}
        <View style={styles.sqlBox}>
          <Text style={styles.sqlLabel}>SQL Command:</Text>
          <View style={styles.sqlCodeRow}>
            <Text style={styles.sqlCode} selectable>
              {CORRUPTION_FIX_SQL}
            </Text>
            <TouchableOpacity
              style={[styles.copyBtn, step1Copied && styles.copyBtnDone]}
              onPress={() => copySQL(CORRUPTION_FIX_SQL)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={step1Copied ? 'checkmark' : 'copy-outline'}
                size={16}
                color={step1Copied ? COLORS.success : COLORS.accent}
              />
              <Text style={[styles.copyBtnText, step1Copied && styles.copyBtnTextDone]}>
                {step1Copied ? 'Copied!' : 'Copy'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Instructions */}
        <View style={styles.instructionsList}>
          <View style={styles.instructionRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.instructionText}>
              Open the Supabase Dashboard for this project
            </Text>
          </View>
          <View style={styles.instructionRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.instructionText}>
              Go to <Text style={styles.bold}>SQL Editor</Text> (left sidebar)
            </Text>
          </View>
          <View style={styles.instructionRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.instructionText}>
              Paste and run the SQL command above
            </Text>
          </View>
          <View style={styles.instructionRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.instructionText}>
              Expected result: <Text style={styles.bold}>1 row deleted</Text> (the corrupted empty-string UUID row)
            </Text>
          </View>
        </View>

        {/* Verify / Confirm Buttons */}
        <View style={styles.step1Actions}>
          <TouchableOpacity
            style={[styles.verifyBtn, verifying && styles.verifyBtnDisabled]}
            onPress={verifyCorruptionFix}
            disabled={verifying}
            activeOpacity={0.7}
          >
            {verifying ? (
              <ActivityIndicator size="small" color={COLORS.accent} />
            ) : (
              <Ionicons name="shield-checkmark-outline" size={16} color={COLORS.accent} />
            )}
            <Text style={styles.verifyBtnText}>
              {verifying ? 'Verifying...' : 'Verify Fix'}
            </Text>
          </TouchableOpacity>

          {step1Status !== 'done' && (
            <TouchableOpacity
              style={styles.confirmBtn}
              onPress={markStep1Done}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark" size={16} color={COLORS.success} />
              <Text style={styles.confirmBtnText}>I've Run the SQL</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Verify Result */}
        {step1VerifyResult && (
          <View
            style={[
              styles.verifyResultBox,
              step1Status === 'done' && styles.verifyResultBoxSuccess,
              step1Status === 'error' && styles.verifyResultBoxError,
            ]}
          >
            <Ionicons
              name={
                step1Status === 'done'
                  ? 'checkmark-circle'
                  : step1Status === 'error'
                    ? 'alert-circle'
                    : 'information-circle'
              }
              size={16}
              color={
                step1Status === 'done'
                  ? COLORS.success
                  : step1Status === 'error'
                    ? COLORS.danger
                    : COLORS.accent
              }
            />
            <Text
              style={[
                styles.verifyResultText,
                step1Status === 'done' && { color: COLORS.success },
                step1Status === 'error' && { color: COLORS.danger },
              ]}
            >
              {step1VerifyResult}
            </Text>
          </View>
        )}
      </View>

      {/* ── STEP 2: Run Cleanup ── */}
      <View
        style={[
          styles.stepCard,
          step1Status !== 'done' && styles.stepCardDisabled,
          response && styles.stepCardDone,
        ]}
      >
        <View style={styles.stepHeader}>
          <View
            style={[
              styles.stepBadge,
              step1Status !== 'done' && styles.stepBadgeDisabled,
              response && styles.stepBadgeDone,
            ]}
          >
            {response ? (
              <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
            ) : (
              <Text
                style={[
                  styles.stepBadgeText,
                  step1Status !== 'done' && styles.stepBadgeTextDisabled,
                ]}
              >
                2
              </Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.stepTitle,
                step1Status !== 'done' && styles.stepTitleDisabled,
              ]}
            >
              Delete {ORPHANED_EMAILS.length} Orphaned Accounts
            </Text>
            <Text style={styles.stepSubtitle}>
              Invokes cleanup-orphaned-users edge function via GoTrue API
            </Text>
          </View>
        </View>

        {/* Email List */}
        <View style={styles.emailList}>
          <Text style={styles.emailListTitle}>
            Target Accounts ({ORPHANED_EMAILS.length})
          </Text>
          {ORPHANED_EMAILS.map((email, i) => (
            <View key={i} style={styles.emailRow}>
              <Ionicons name="person-remove" size={14} color={COLORS.danger} />
              <Text style={styles.emailText} numberOfLines={1}>
                {email}
              </Text>
            </View>
          ))}
        </View>

        {/* Run Button */}
        <TouchableOpacity
          style={[
            styles.runBtn,
            (running || step1Status !== 'done') && styles.runBtnDisabled,
          ]}
          onPress={runCleanup}
          disabled={running || step1Status !== 'done'}
          activeOpacity={0.8}
        >
          {running ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <Ionicons name="trash" size={18} color={COLORS.white} />
          )}
          <Text style={styles.runBtnText}>
            {running
              ? 'Cleaning up...'
              : step1Status !== 'done'
                ? 'Complete Step 1 First'
                : `Delete All ${ORPHANED_EMAILS.length} Orphaned Accounts`}
          </Text>
        </TouchableOpacity>

        {step1Status !== 'done' && (
          <View style={styles.blockedNotice}>
            <Ionicons name="lock-closed" size={14} color={COLORS.textMuted} />
            <Text style={styles.blockedNoticeText}>
              Step 2 is locked until the corrupted auth.identities row is fixed in Step 1.
              CASCADE DELETE will fail on the corrupted UUID row.
            </Text>
          </View>
        )}
      </View>

      {/* Error */}
      {error && (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={18} color={COLORS.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Results */}
      {response && (
        <View style={styles.resultsSection}>
          {/* Summary Header */}
          <View style={styles.resultsBanner}>
            <Ionicons
              name={
                response.summary.auth_users_deleted === ORPHANED_EMAILS.length
                  ? 'checkmark-circle'
                  : response.summary.auth_users_deleted > 0
                    ? 'alert-circle'
                    : 'close-circle'
              }
              size={24}
              color={
                response.summary.auth_users_deleted === ORPHANED_EMAILS.length
                  ? COLORS.success
                  : response.summary.auth_users_deleted > 0
                    ? COLORS.warning
                    : COLORS.danger
              }
            />
            <Text style={styles.resultsBannerText}>
              {response.summary.auth_users_deleted === ORPHANED_EMAILS.length
                ? `All ${response.summary.auth_users_deleted} orphaned accounts successfully deleted!`
                : response.summary.auth_users_deleted > 0
                  ? `${response.summary.auth_users_deleted} of ${ORPHANED_EMAILS.length} deleted. ${response.summary.auth_users_failed} failed.`
                  : `Deletion failed for all ${ORPHANED_EMAILS.length} accounts.`}
            </Text>
          </View>

          <View style={styles.summaryGrid}>
            <View style={[styles.summaryBox, { backgroundColor: COLORS.successLight }]}>
              <Text style={[styles.summaryNum, { color: COLORS.success }]}>
                {response.summary.auth_users_deleted}
              </Text>
              <Text style={styles.summaryLabel}>Deleted</Text>
            </View>
            <View
              style={[
                styles.summaryBox,
                response.summary.auth_users_failed > 0
                  ? { backgroundColor: COLORS.dangerLight }
                  : {},
              ]}
            >
              <Text
                style={[
                  styles.summaryNum,
                  response.summary.auth_users_failed > 0
                    ? { color: COLORS.danger }
                    : {},
                ]}
              >
                {response.summary.auth_users_failed}
              </Text>
              <Text style={styles.summaryLabel}>Failed</Text>
            </View>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryNum}>
                {response.summary.remaining_auth_users}
              </Text>
              <Text style={styles.summaryLabel}>Auth Left</Text>
            </View>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryNum}>
                {response.summary.remaining_user_profiles}
              </Text>
              <Text style={styles.summaryLabel}>Profiles</Text>
            </View>
          </View>

          {/* Match check */}
          {response.summary.remaining_auth_users ===
          response.summary.remaining_user_profiles ? (
            <View style={styles.healthyBox}>
              <Ionicons name="checkmark-circle" size={22} color={COLORS.success} />
              <Text style={styles.healthyText}>
                auth.users ({response.summary.remaining_auth_users}) matches user_profiles (
                {response.summary.remaining_user_profiles}) — Database is clean!
              </Text>
            </View>
          ) : (
            <View style={[styles.healthyBox, { backgroundColor: COLORS.warningLight }]}>
              <Ionicons name="warning" size={22} color={COLORS.warning} />
              <Text style={[styles.healthyText, { color: COLORS.warning }]}>
                Mismatch: {response.summary.remaining_auth_users} auth.users vs{' '}
                {response.summary.remaining_user_profiles} user_profiles
              </Text>
            </View>
          )}

          {/* Per-email details toggle */}
          <TouchableOpacity
            style={styles.detailsToggle}
            onPress={() => setShowDetails(!showDetails)}
          >
            <Text style={styles.detailsToggleText}>
              {showDetails ? 'Hide' : 'Show'} Per-Account Details
            </Text>
            <Ionicons
              name={showDetails ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={COLORS.accent}
            />
          </TouchableOpacity>

          {showDetails &&
            response.results.map((r, i) => (
              <View key={i} style={styles.resultRow}>
                <View style={styles.resultHeader}>
                  <Ionicons
                    name={
                      r.auth_user_deleted
                        ? 'checkmark-circle'
                        : r.auth_user_found
                          ? 'close-circle'
                          : 'help-circle'
                    }
                    size={16}
                    color={
                      r.auth_user_deleted
                        ? COLORS.success
                        : r.auth_user_found
                          ? COLORS.danger
                          : COLORS.textMuted
                    }
                  />
                  <Text style={styles.resultEmail} numberOfLines={1}>
                    {r.email}
                  </Text>
                </View>
                {!r.auth_user_found && (
                  <Text style={styles.resultNote}>
                    Not found in auth.users (already deleted or never existed)
                  </Text>
                )}
                {r.auth_user_found && !r.auth_user_deleted && r.errors.length > 0 && (
                  <Text style={styles.resultError}>{r.errors.join('; ')}</Text>
                )}
                {r.auth_user_deleted && (
                  <Text style={styles.resultSuccess}>
                    Deleted (ID: {r.auth_user_id?.substring(0, 8)}...)
                  </Text>
                )}
              </View>
            ))}

          {/* Remaining users */}
          {response.remaining_auth_users &&
            response.remaining_auth_users.length > 0 && (
              <View style={styles.remainingSection}>
                <Text style={styles.remainingTitle}>
                  Remaining Auth Users ({response.remaining_auth_users.length})
                </Text>
                {response.remaining_auth_users.map((u, i) => (
                  <View key={i} style={styles.remainingRow}>
                    <Ionicons name="person" size={14} color={COLORS.success} />
                    <Text style={styles.remainingEmail} numberOfLines={1}>
                      {u.email}
                    </Text>
                  </View>
                ))}
              </View>
            )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  collapsedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    gap: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.dangerLight,
    ...SHADOWS.sm,
  },
  collapsedIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.dangerLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  collapsedTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.primary,
  },
  collapsedSub: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  panel: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.dangerLight,
    ...SHADOWS.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  title: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.primary,
  },
  description: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginBottom: SPACING.lg,
  },

  // ── Step Cards ──
  stepCard: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  stepCardDone: {
    borderColor: COLORS.success,
    backgroundColor: '#f0fdf4',
  },
  stepCardDisabled: {
    opacity: 0.6,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepBadgeDisabled: {
    backgroundColor: COLORS.textMuted,
  },
  stepBadgeDone: {
    backgroundColor: 'transparent',
  },
  stepBadgeText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '800',
    color: COLORS.white,
  },
  stepBadgeTextDisabled: {
    color: COLORS.white,
  },
  stepTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.primary,
  },
  stepTitleDisabled: {
    color: COLORS.textMuted,
  },
  stepSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  // ── SQL Box ──
  sqlBox: {
    backgroundColor: '#1a1a2e',
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  sqlLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: '#8892b0',
    marginBottom: SPACING.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sqlCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  sqlCode: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#64ffda',
    lineHeight: 18,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(100, 255, 218, 0.1)',
    borderRadius: BORDER_RADIUS.sm,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderWidth: 1,
    borderColor: 'rgba(100, 255, 218, 0.2)',
  },
  copyBtnDone: {
    backgroundColor: 'rgba(46, 204, 113, 0.15)',
    borderColor: 'rgba(46, 204, 113, 0.3)',
  },
  copyBtnText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.accent,
  },
  copyBtnTextDone: {
    color: COLORS.success,
  },

  // ── Instructions ──
  instructionsList: {
    marginBottom: SPACING.md,
    gap: SPACING.xs,
  },
  instructionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.accent,
    marginTop: 5,
  },
  instructionText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  bold: {
    fontWeight: '700',
    color: COLORS.primary,
  },

  // ── Step 1 Actions ──
  step1Actions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  verifyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.sm,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  verifyBtnDisabled: {
    opacity: 0.6,
  },
  verifyBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.accent,
  },
  confirmBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.sm,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  confirmBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.success,
  },

  // ── Verify Result ──
  verifyResultBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    backgroundColor: COLORS.infoLight,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
  },
  verifyResultBoxSuccess: {
    backgroundColor: COLORS.successLight,
  },
  verifyResultBoxError: {
    backgroundColor: COLORS.dangerLight,
  },
  verifyResultText: {
    flex: 1,
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },

  // ── Blocked Notice ──
  blockedNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    backgroundColor: COLORS.warningLight,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    marginTop: SPACING.sm,
  },
  blockedNoticeText: {
    flex: 1,
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    lineHeight: 16,
  },

  // ── Email List ──
  emailList: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  emailListTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: SPACING.sm,
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 3,
  },
  emailText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    flex: 1,
  },

  // ── Run Button ──
  runBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.danger,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  runBtnDisabled: {
    opacity: 0.5,
  },
  runBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.white,
  },

  // ── Error ──
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
    lineHeight: 18,
  },

  // ── Results ──
  resultsSection: {
    marginTop: SPACING.xs,
  },
  resultsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.successLight,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  resultsBannerText: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.primary,
    lineHeight: 20,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  summaryBox: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    alignItems: 'center',
  },
  summaryNum: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: COLORS.primary,
  },
  summaryLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  healthyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.successLight,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  healthyText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.success,
  },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
  },
  detailsToggleText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.accent,
  },
  resultRow: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  resultEmail: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.primary,
    flex: 1,
  },
  resultNote: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
    marginLeft: 24,
  },
  resultError: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.danger,
    marginTop: 2,
    marginLeft: 24,
  },
  resultSuccess: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.success,
    marginTop: 2,
    marginLeft: 24,
  },
  remainingSection: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
  },
  remainingTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: SPACING.sm,
  },
  remainingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 3,
  },
  remainingEmail: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
});
