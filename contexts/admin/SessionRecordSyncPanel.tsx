import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../../constants/theme';
import { supabase } from '../../lib/supabase';

interface ScanResult {
  totalAppointments: number;
  totalExistingLinks: number;
  unsyncedCount: number;
  completedCount: number;
  noShowCount: number;
  earliestDate: string | null;
  latestDate: string | null;
  unsyncedItems: {
    appointmentId: string;
    clientId: string;
    clientName: string;
    coachName: string;
    date: string;
    status: string;
  }[];
}

interface SyncBatchResult {
  batchSize: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  totalProcessed: number;
  results: {
    appointmentId: string;
    clientId: string;
    clientName: string;
    date: string;
    status: string;
    synced: boolean;
    action: string;
    error?: string;
  }[];
}

interface SyncTotals {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  totalProcessed: number;
  batchesCompleted: number;
  totalBatches: number;
}

const BATCH_SIZE = 10;

function formatDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`;
  } catch {
    return dateStr;
  }
}

export default function SessionRecordSyncPanel() {
  const [expanded, setExpanded] = useState(false);

  // Scan state
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncTotals, setSyncTotals] = useState<SyncTotals | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncComplete, setSyncComplete] = useState(false);
  const [failedItems, setFailedItems] = useState<SyncBatchResult['results']>([]);
  const [showFailedDetails, setShowFailedDetails] = useState(false);

  // Progress animation
  const progressAnim = useRef(new Animated.Value(0)).current;
  const abortRef = useRef(false);

  const runScan = useCallback(async () => {
    setScanning(true);
    setScanError(null);
    setScanResult(null);
    setSyncTotals(null);
    setSyncComplete(false);
    setFailedItems([]);
    setSyncError(null);
    progressAnim.setValue(0);

    try {
      const { data, error } = await supabase.functions.invoke('manage-appointments', {
        body: { action: 'scanUnsyncedAppointments' },
      });

      if (error) {
        let msg = 'Scan failed';
        try {
          const parsed = JSON.parse(error.message);
          if (parsed?.error) msg = parsed.error;
        } catch {
          if (error.message) msg = error.message;
        }
        setScanError(msg);
        return;
      }

      if (data?.error) {
        setScanError(data.error);
        return;
      }

      setScanResult(data as ScanResult);
    } catch (err: any) {
      setScanError(err.message || 'Unexpected error during scan');
    } finally {
      setScanning(false);
    }
  }, []);

  const runSync = useCallback(async () => {
    if (!scanResult || scanResult.unsyncedCount === 0) return;

    Alert.alert(
      'Sync Session Records',
      `This will create ${scanResult.unsyncedCount} session record${scanResult.unsyncedCount !== 1 ? 's' : ''} from historical appointment data.\n\nThis is safe to run — it only creates missing records and won't duplicate existing ones.\n\nContinue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start Sync',
          onPress: async () => {
            setSyncing(true);
            setSyncError(null);
            setSyncComplete(false);
            setFailedItems([]);
            abortRef.current = false;

            // Get unique appointment IDs from scan results
            const uniqueApptIds = [...new Set(scanResult.unsyncedItems.map(i => i.appointmentId))];
            const totalBatches = Math.ceil(uniqueApptIds.length / BATCH_SIZE);

            const totals: SyncTotals = {
              created: 0,
              updated: 0,
              skipped: 0,
              failed: 0,
              totalProcessed: 0,
              batchesCompleted: 0,
              totalBatches,
            };

            setSyncTotals({ ...totals });
            progressAnim.setValue(0);

            const allFailed: SyncBatchResult['results'] = [];

            try {
              for (let i = 0; i < uniqueApptIds.length; i += BATCH_SIZE) {
                if (abortRef.current) {
                  console.log('Sync aborted by user');
                  break;
                }

                const batch = uniqueApptIds.slice(i, i + BATCH_SIZE);
                const batchNum = Math.floor(i / BATCH_SIZE) + 1;

                console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} appointments)`);

                const { data, error } = await supabase.functions.invoke('manage-appointments', {
                  body: {
                    action: 'bulkSyncSessionRecords',
                    appointmentIds: batch,
                  },
                });

                if (error) {
                  let msg = 'Batch sync failed';
                  try {
                    const parsed = JSON.parse(error.message);
                    if (parsed?.error) msg = parsed.error;
                  } catch {
                    if (error.message) msg = error.message;
                  }
                  // Don't abort on batch error, just count as failed
                  totals.failed += batch.length;
                  totals.batchesCompleted = batchNum;
                  setSyncTotals({ ...totals });
                  console.error(`Batch ${batchNum} error:`, msg);
                  continue;
                }

                if (data?.error) {
                  totals.failed += batch.length;
                  totals.batchesCompleted = batchNum;
                  setSyncTotals({ ...totals });
                  console.error(`Batch ${batchNum} error:`, data.error);
                  continue;
                }

                const batchResult = data as SyncBatchResult;
                totals.created += batchResult.created;
                totals.updated += batchResult.updated;
                totals.skipped += batchResult.skipped;
                totals.failed += batchResult.failed;
                totals.totalProcessed += batchResult.totalProcessed;
                totals.batchesCompleted = batchNum;

                // Collect failed items
                const batchFailed = batchResult.results.filter(
                  r => r.action.includes('failed') || r.action === 'exception'
                );
                allFailed.push(...batchFailed);

                setSyncTotals({ ...totals });

                // Animate progress
                const progress = batchNum / totalBatches;
                Animated.timing(progressAnim, {
                  toValue: progress,
                  duration: 300,
                  useNativeDriver: false,
                }).start();
              }

              // Complete
              Animated.timing(progressAnim, {
                toValue: 1,
                duration: 200,
                useNativeDriver: false,
              }).start();

              setFailedItems(allFailed);
              setSyncComplete(true);
            } catch (err: any) {
              setSyncError(err.message || 'Unexpected error during sync');
            } finally {
              setSyncing(false);
            }
          },
        },
      ]
    );
  }, [scanResult]);

  const handleAbort = useCallback(() => {
    Alert.alert(
      'Abort Sync',
      'Are you sure you want to stop the sync? Records already created will remain.',
      [
        { text: 'Continue Sync', style: 'cancel' },
        {
          text: 'Abort',
          style: 'destructive',
          onPress: () => {
            abortRef.current = true;
          },
        },
      ]
    );
  }, []);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const progressPercent = syncTotals
    ? Math.round((syncTotals.batchesCompleted / syncTotals.totalBatches) * 100)
    : 0;

  // ── Collapsed State ──
  if (!expanded) {
    return (
      <TouchableOpacity
        style={styles.collapsedCard}
        onPress={() => setExpanded(true)}
        activeOpacity={0.7}
      >
        <View style={styles.collapsedIcon}>
          <Ionicons name="sync-circle" size={22} color={COLORS.accent} />
        </View>
        <View style={styles.collapsedTextWrap}>
          <Text style={styles.collapsedTitle}>Session Record Sync</Text>
          <Text style={styles.collapsedSubtitle}>
            Retroactively sync historical appointments to client portals
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
      </TouchableOpacity>
    );
  }

  // ── Expanded State ──
  return (
    <View style={styles.panel}>
      {/* Header */}
      <View style={styles.panelHeader}>
        <View style={styles.panelHeaderLeft}>
          <Ionicons name="sync-circle" size={22} color={COLORS.accent} />
          <Text style={styles.panelTitle}>Session Record Sync</Text>
        </View>
        <TouchableOpacity onPress={() => setExpanded(false)}>
          <Ionicons name="chevron-up" size={22} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      <Text style={styles.panelDescription}>
        Scans all historical appointments with status "completed" or "no-show" that don't yet have a linked session_record entry. Creates the missing records so client portal dashboards and session history stay in sync with the trainer's schedule.
      </Text>

      {/* Info Box */}
      <View style={styles.infoBox}>
        <Ionicons name="information-circle" size={18} color={COLORS.info} />
        <Text style={styles.infoText}>
          This is a one-time utility. Going forward, session records are automatically created when appointment status changes. This tool catches any historical data that predates the auto-sync feature.
        </Text>
      </View>

      {/* ── Step 1: Scan ── */}
      <View style={[styles.stepCard, scanResult && styles.stepCardDone]}>
        <View style={styles.stepHeader}>
          <View style={[styles.stepBadge, scanResult && styles.stepBadgeDone]}>
            {scanResult ? (
              <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
            ) : (
              <Text style={styles.stepBadgeText}>1</Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.stepTitle}>Scan for Unsynced Appointments</Text>
            <Text style={styles.stepSubtitle}>
              Find completed/no-show appointments missing session records
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.actionBtn, scanning && styles.actionBtnDisabled]}
          onPress={runScan}
          disabled={scanning || syncing}
          activeOpacity={0.8}
        >
          {scanning ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <Ionicons name="search" size={18} color={COLORS.white} />
          )}
          <Text style={styles.actionBtnText}>
            {scanning ? 'Scanning...' : scanResult ? 'Re-scan' : 'Scan Appointments'}
          </Text>
        </TouchableOpacity>

        {scanError && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color={COLORS.danger} />
            <Text style={styles.errorText}>{scanError}</Text>
          </View>
        )}

        {/* Scan Results */}
        {scanResult && (
          <View style={styles.scanResults}>
            <View style={styles.scanStatsGrid}>
              <View style={styles.scanStatBox}>
                <Text style={styles.scanStatNum}>{scanResult.totalAppointments}</Text>
                <Text style={styles.scanStatLbl}>Total Completed{'\n'}/ No-Show</Text>
              </View>
              <View style={styles.scanStatBox}>
                <Text style={styles.scanStatNum}>{scanResult.totalExistingLinks}</Text>
                <Text style={styles.scanStatLbl}>Already{'\n'}Synced</Text>
              </View>
              <View style={[
                styles.scanStatBox,
                scanResult.unsyncedCount > 0 && styles.scanStatBoxHighlight,
              ]}>
                <Text style={[
                  styles.scanStatNum,
                  scanResult.unsyncedCount > 0 && styles.scanStatNumHighlight,
                ]}>
                  {scanResult.unsyncedCount}
                </Text>
                <Text style={[
                  styles.scanStatLbl,
                  scanResult.unsyncedCount > 0 && styles.scanStatLblHighlight,
                ]}>
                  Missing{'\n'}Records
                </Text>
              </View>
            </View>

            {scanResult.unsyncedCount === 0 ? (
              <View style={styles.healthyBox}>
                <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.healthyTitle}>All Synced</Text>
                  <Text style={styles.healthySubtitle}>
                    All {scanResult.totalAppointments} completed/no-show appointments already have linked session records. No action needed.
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.unsyncedSummary}>
                <View style={styles.unsyncedRow}>
                  <View style={styles.unsyncedDot}>
                    <Ionicons name="checkmark-done" size={14} color={COLORS.success} />
                  </View>
                  <Text style={styles.unsyncedLabel}>Completed:</Text>
                  <Text style={styles.unsyncedValue}>{scanResult.completedCount}</Text>
                </View>
                <View style={styles.unsyncedRow}>
                  <View style={[styles.unsyncedDot, { backgroundColor: COLORS.warningLight }]}>
                    <Ionicons name="close" size={14} color={COLORS.warning} />
                  </View>
                  <Text style={styles.unsyncedLabel}>No-Show:</Text>
                  <Text style={styles.unsyncedValue}>{scanResult.noShowCount}</Text>
                </View>
                {scanResult.earliestDate && scanResult.latestDate && (
                  <View style={styles.unsyncedRow}>
                    <View style={[styles.unsyncedDot, { backgroundColor: COLORS.infoLight }]}>
                      <Ionicons name="calendar" size={14} color={COLORS.info} />
                    </View>
                    <Text style={styles.unsyncedLabel}>Date Range:</Text>
                    <Text style={styles.unsyncedValue}>
                      {formatDate(scanResult.earliestDate)} — {formatDate(scanResult.latestDate)}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}
      </View>

      {/* ── Step 2: Sync ── */}
      {scanResult && scanResult.unsyncedCount > 0 && (
        <View style={[
          styles.stepCard,
          (!scanResult || scanResult.unsyncedCount === 0) && styles.stepCardDisabled,
          syncComplete && styles.stepCardDone,
        ]}>
          <View style={styles.stepHeader}>
            <View style={[
              styles.stepBadge,
              syncComplete && styles.stepBadgeDone,
            ]}>
              {syncComplete ? (
                <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
              ) : (
                <Text style={styles.stepBadgeText}>2</Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.stepTitle}>
                Create Missing Session Records
              </Text>
              <Text style={styles.stepSubtitle}>
                Bulk-create {scanResult.unsyncedCount} session record{scanResult.unsyncedCount !== 1 ? 's' : ''} in batches of {BATCH_SIZE}
              </Text>
            </View>
          </View>

          {/* Sync Button or Abort Button */}
          {!syncing && !syncComplete && (
            <TouchableOpacity
              style={styles.syncBtn}
              onPress={runSync}
              activeOpacity={0.8}
            >
              <Ionicons name="sync" size={18} color={COLORS.white} />
              <Text style={styles.syncBtnText}>
                Start Sync ({scanResult.unsyncedCount} records)
              </Text>
            </TouchableOpacity>
          )}

          {syncing && (
            <TouchableOpacity
              style={styles.abortBtn}
              onPress={handleAbort}
              activeOpacity={0.8}
            >
              <Ionicons name="stop-circle" size={18} color={COLORS.white} />
              <Text style={styles.abortBtnText}>Abort Sync</Text>
            </TouchableOpacity>
          )}

          {/* Progress Bar */}
          {(syncing || syncComplete) && syncTotals && (
            <View style={styles.progressSection}>
              {/* Progress Bar Track */}
              <View style={styles.progressTrack}>
                <Animated.View
                  style={[
                    styles.progressFill,
                    { width: progressWidth },
                    syncComplete && syncTotals.failed === 0 && styles.progressFillSuccess,
                    syncComplete && syncTotals.failed > 0 && styles.progressFillWarning,
                  ]}
                />
              </View>

              {/* Progress Label */}
              <View style={styles.progressLabelRow}>
                <Text style={styles.progressLabel}>
                  {syncing
                    ? `Processing batch ${syncTotals.batchesCompleted} of ${syncTotals.totalBatches}...`
                    : abortRef.current
                      ? 'Sync aborted'
                      : 'Sync complete'}
                </Text>
                <Text style={styles.progressPercent}>{progressPercent}%</Text>
              </View>

              {/* Live Stats */}
              <View style={styles.liveStatsGrid}>
                <View style={styles.liveStatBox}>
                  <Ionicons name="add-circle" size={16} color={COLORS.success} />
                  <Text style={styles.liveStatNum}>{syncTotals.created}</Text>
                  <Text style={styles.liveStatLbl}>Created</Text>
                </View>
                <View style={styles.liveStatBox}>
                  <Ionicons name="refresh-circle" size={16} color={COLORS.accent} />
                  <Text style={styles.liveStatNum}>{syncTotals.updated}</Text>
                  <Text style={styles.liveStatLbl}>Updated</Text>
                </View>
                <View style={styles.liveStatBox}>
                  <Ionicons name="remove-circle" size={16} color={COLORS.textMuted} />
                  <Text style={styles.liveStatNum}>{syncTotals.skipped}</Text>
                  <Text style={styles.liveStatLbl}>Skipped</Text>
                </View>
                {syncTotals.failed > 0 && (
                  <View style={[styles.liveStatBox, styles.liveStatBoxDanger]}>
                    <Ionicons name="close-circle" size={16} color={COLORS.danger} />
                    <Text style={[styles.liveStatNum, { color: COLORS.danger }]}>
                      {syncTotals.failed}
                    </Text>
                    <Text style={[styles.liveStatLbl, { color: COLORS.danger }]}>Failed</Text>
                  </View>
                )}
              </View>

              {/* Spinner while syncing */}
              {syncing && (
                <View style={styles.syncingIndicator}>
                  <ActivityIndicator size="small" color={COLORS.accent} />
                  <Text style={styles.syncingText}>
                    Processing appointments...
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Sync Error */}
          {syncError && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color={COLORS.danger} />
              <Text style={styles.errorText}>{syncError}</Text>
            </View>
          )}

          {/* Sync Complete Summary */}
          {syncComplete && syncTotals && (
            <View style={styles.completeSummary}>
              {syncTotals.failed === 0 ? (
                <View style={styles.healthyBox}>
                  <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.healthyTitle}>
                      {abortRef.current ? 'Sync Partially Complete' : 'Sync Complete'}
                    </Text>
                    <Text style={styles.healthySubtitle}>
                      {syncTotals.created > 0
                        ? `Successfully created ${syncTotals.created} session record${syncTotals.created !== 1 ? 's' : ''}.`
                        : 'No new records needed to be created.'}
                      {syncTotals.updated > 0
                        ? ` Updated ${syncTotals.updated} existing record${syncTotals.updated !== 1 ? 's' : ''}.`
                        : ''}
                      {'\n'}Client portal dashboards are now in sync with the schedule.
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.warningBox}>
                  <Ionicons name="warning" size={24} color={COLORS.warning} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.warningTitle}>
                      Sync Complete with {syncTotals.failed} Error{syncTotals.failed !== 1 ? 's' : ''}
                    </Text>
                    <Text style={styles.warningSubtitle}>
                      Created {syncTotals.created} record{syncTotals.created !== 1 ? 's' : ''}, but {syncTotals.failed} failed.
                      You can re-run the scan to check remaining unsynced appointments.
                    </Text>
                  </View>
                </View>
              )}

              {/* Failed Items Details */}
              {failedItems.length > 0 && (
                <View style={styles.failedSection}>
                  <TouchableOpacity
                    style={styles.failedToggle}
                    onPress={() => setShowFailedDetails(!showFailedDetails)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="alert-circle" size={16} color={COLORS.danger} />
                    <Text style={styles.failedToggleText}>
                      {showFailedDetails ? 'Hide' : 'Show'} Failed Items ({failedItems.length})
                    </Text>
                    <Ionicons
                      name={showFailedDetails ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={COLORS.textMuted}
                    />
                  </TouchableOpacity>

                  {showFailedDetails && failedItems.map((item, idx) => (
                    <View key={`${item.appointmentId}-${item.clientId}-${idx}`} style={styles.failedRow}>
                      <View style={styles.failedRowIcon}>
                        <Ionicons name="close-circle" size={14} color={COLORS.danger} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.failedRowName} numberOfLines={1}>
                          {item.clientName} — {item.date}
                        </Text>
                        <Text style={styles.failedRowError} numberOfLines={2}>
                          {item.error || item.action}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Re-scan Button */}
              <TouchableOpacity
                style={styles.rescanBtn}
                onPress={runScan}
                activeOpacity={0.8}
              >
                <Ionicons name="refresh" size={16} color={COLORS.accent} />
                <Text style={styles.rescanBtnText}>Re-scan to Verify</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Collapsed ──
  collapsedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    gap: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.brandBlueLight,
    ...SHADOWS.sm,
  },
  collapsedIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.brandBlueLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  collapsedTextWrap: { flex: 1 },
  collapsedTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.primary,
  },
  collapsedSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  // ── Expanded Panel ──
  panel: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.brandBlueLight,
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
  panelTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.primary,
  },
  panelDescription: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginBottom: SPACING.md,
  },

  // ── Info Box ──
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    backgroundColor: COLORS.infoLight,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  infoText: {
    flex: 1,
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    lineHeight: 16,
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
    opacity: 0.5,
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
  stepBadgeDone: {
    backgroundColor: 'transparent',
  },
  stepBadgeText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '800',
    color: COLORS.white,
  },
  stepTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.primary,
  },
  stepSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  // ── Action Button ──
  actionBtn: {
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
  actionBtnDisabled: { opacity: 0.6 },
  actionBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.white,
  },

  // ── Sync Button ──
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.success,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  syncBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.white,
  },

  // ── Abort Button ──
  abortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.danger,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  abortBtnText: {
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

  // ── Scan Results ──
  scanResults: {
    marginTop: SPACING.xs,
  },
  scanStatsGrid: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  scanStatBox: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  scanStatBoxHighlight: {
    backgroundColor: COLORS.brandBlueLight,
    borderColor: COLORS.accent,
  },
  scanStatNum: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '800',
    color: COLORS.primary,
  },
  scanStatNumHighlight: {
    color: COLORS.accent,
  },
  scanStatLbl: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginTop: 2,
    textAlign: 'center',
  },
  scanStatLblHighlight: {
    color: COLORS.accent,
  },

  // ── Healthy Box ──
  healthyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.successLight,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  healthyTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.success,
  },
  healthySubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },

  // ── Warning Box ──
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.warningLight,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  warningTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.warning,
  },
  warningSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },

  // ── Unsynced Summary ──
  unsyncedSummary: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  unsyncedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  unsyncedDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.successLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unsyncedLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  unsyncedValue: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.primary,
    flex: 1,
  },

  // ── Progress ──
  progressSection: {
    marginBottom: SPACING.md,
  },
  progressTrack: {
    height: 12,
    backgroundColor: COLORS.borderLight,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: SPACING.sm,
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.accent,
    borderRadius: 6,
  },
  progressFillSuccess: {
    backgroundColor: COLORS.success,
  },
  progressFillWarning: {
    backgroundColor: COLORS.warning,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  progressLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  progressPercent: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.accent,
  },

  // ── Live Stats ──
  liveStatsGrid: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  liveStatBox: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    alignItems: 'center',
    gap: 2,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  liveStatBoxDanger: {
    backgroundColor: COLORS.dangerLight,
    borderColor: COLORS.danger,
  },
  liveStatNum: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.primary,
  },
  liveStatLbl: {
    fontSize: 8,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  // ── Syncing Indicator ──
  syncingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  syncingText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },

  // ── Complete Summary ──
  completeSummary: {
    marginTop: SPACING.xs,
  },

  // ── Failed Section ──
  failedSection: {
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  failedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
  },
  failedToggleText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.danger,
  },
  failedRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    backgroundColor: COLORS.dangerLight,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  failedRowIcon: {
    marginTop: 2,
  },
  failedRowName: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.primary,
  },
  failedRowError: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.danger,
    marginTop: 1,
  },

  // ── Re-scan Button ──
  rescanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.accent,
    marginTop: SPACING.sm,
  },
  rescanBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.accent,
  },
});
