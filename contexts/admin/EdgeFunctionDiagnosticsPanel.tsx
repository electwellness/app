import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../../constants/theme';
import { supabase } from '../../lib/supabase';

type TestStatus = 'idle' | 'running' | 'success' | 'error';

interface TestResult {
  status: TestStatus;
  durationMs: number | null;
  message: string;
  responsePreview: string | null;
  httpStatus: number | null;
}

interface EdgeFunctionTest {
  id: string;
  name: string;
  description: string;
  icon: string;
  body: Record<string, unknown>;
  /** Optional: validate the response shape */
  validate?: (data: any) => string | null;
}

const EDGE_FUNCTION_TESTS: EdgeFunctionTest[] = [
  {
    id: 'manage-client-data',
    name: 'manage-client-data',
    description: 'list_contacts action',
    icon: 'people',
    body: { action: 'list_contacts' },
    validate: (data) => {
      if (!data) return 'No data returned';
      if (Array.isArray(data)) return null; // success
      if (data.contacts && Array.isArray(data.contacts)) return null;
      if (data.error) return `Function error: ${data.error}`;
      return null;
    },
  },
  {
    id: 'manage-appointments',
    name: 'manage-appointments',
    description: 'fetch action (today)',
    icon: 'calendar',
    body: {
      action: 'fetch',
      start: new Date().toISOString().split('T')[0],
      end: new Date().toISOString().split('T')[0],
    },
    validate: (data) => {
      if (!data) return 'No data returned';
      if (data.error) return `Function error: ${data.error}`;
      return null;
    },
  },
  {
    id: 'compute-kpis',
    name: 'compute-kpis',
    description: 'Compute dashboard KPIs',
    icon: 'stats-chart',
    body: {},
    validate: (data) => {
      if (!data) return 'No data returned';
      if (data.error) return `Function error: ${data.error}`;
      return null;
    },
  },
  {
    id: 'compute-trainer-kpis',
    name: 'compute-trainer-kpis',
    description: 'Compute trainer KPIs (current month)',
    icon: 'fitness',
    body: {
      month: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
    },
    validate: (data) => {
      if (!data) return 'No data returned';
      if (data.error) return `Function error: ${data.error}`;
      return null;
    },
  },
  {
    id: 'manage-activity-feed',
    name: 'manage-activity-feed',
    description: 'get_recent (limit 5)',
    icon: 'pulse',
    body: { action: 'get_recent', limit: 5 },
    validate: (data) => {
      if (!data) return 'No data returned';
      if (data.error) return `Function error: ${data.error}`;
      return null;
    },
  },
  {
    id: 'manage-alerts',
    name: 'manage-alerts',
    description: 'Get active alerts',
    icon: 'notifications',
    body: {},
    validate: (data) => {
      if (!data) return 'No data returned';
      if (data.error) return `Function error: ${data.error}`;
      if (data.data !== undefined && data.total !== undefined) return null;
      return null;
    },
  },
  {
    id: 'manage-franchises',
    name: 'manage-franchises',
    description: 'list action',
    icon: 'business',
    body: { action: 'list' },
    validate: (data) => {
      if (!data) return 'No data returned';
      if (data.error) return `Function error: ${data.error}`;
      return null;
    },
  },
  {
    id: 'manage-marketing-data',
    name: 'manage-marketing-data',
    description: 'get_channels action',
    icon: 'megaphone',
    body: { action: 'get_channels' },
    validate: (data) => {
      if (!data) return 'No data returned';
      if (data.error) return `Function error: ${data.error}`;
      if (data.success === false) return `Function error: ${data.error || 'unknown'}`;
      return null;
    },
  },
  {
    id: 'manage-calendar-sync',
    name: 'manage-calendar-sync',
    description: 'getConnections action',
    icon: 'sync',
    body: { action: 'getConnections' },
    validate: (data) => {
      if (data?.error) return `Function error: ${data.error}`;
      return null;
    },
  },
  {
    id: 'cleanup-users',
    name: 'cleanup-users',
    description: 'audit mode (read-only)',
    icon: 'trash-bin',
    body: { mode: 'audit' },
    validate: (data) => {
      if (!data) return 'No data returned';
      if (data.error) return `Function error: ${data.error}`;
      if (data.summary) return null;
      return null;
    },
  },
  {
    id: 'cleanup-orphaned-users',
    name: 'cleanup-orphaned-users',
    description: 'verify-corruption-fix (read-only)',
    icon: 'warning',
    body: { mode: 'verify-corruption-fix' },
    validate: (data) => {
      if (data?.error) return `Function error: ${data.error}`;
      return null;
    },
  },

];

const initialResults: Record<string, TestResult> = {};
EDGE_FUNCTION_TESTS.forEach((t) => {
  initialResults[t.id] = {
    status: 'idle',
    durationMs: null,
    message: 'Not tested',
    responsePreview: null,
    httpStatus: null,
  };
});

export default function EdgeFunctionDiagnosticsPanel() {
  const [expanded, setExpanded] = useState(false);
  const [results, setResults] = useState<Record<string, TestResult>>({ ...initialResults });
  const [runningAll, setRunningAll] = useState(false);

  const runSingleTest = useCallback(async (test: EdgeFunctionTest) => {
    setResults((prev) => ({
      ...prev,
      [test.id]: {
        status: 'running',
        durationMs: null,
        message: 'Invoking...',
        responsePreview: null,
        httpStatus: null,
      },
    }));

    const startTime = Date.now();
    try {
      const { data, error } = await supabase.functions.invoke(test.id, {
        body: test.body,
      });
      const durationMs = Date.now() - startTime;

      if (error) {
        // The supabase-js client wraps non-2xx responses as errors
        // Try to extract useful info
        let errorMsg = 'Invocation error';
        if (typeof error === 'object' && error !== null) {
          if ('message' in error) errorMsg = (error as any).message;
          else errorMsg = JSON.stringify(error).slice(0, 200);
        } else if (typeof error === 'string') {
          errorMsg = error;
        }

        setResults((prev) => ({
          ...prev,
          [test.id]: {
            status: 'error',
            durationMs,
            message: errorMsg,
            responsePreview: data ? JSON.stringify(data).slice(0, 300) : null,
            httpStatus: null,
          },
        }));
        return false;
      }

      // Check validation
      const validationError = test.validate ? test.validate(data) : null;
      if (validationError) {
        setResults((prev) => ({
          ...prev,
          [test.id]: {
            status: 'error',
            durationMs,
            message: validationError,
            responsePreview: JSON.stringify(data).slice(0, 300),
            httpStatus: 200,
          },
        }));
        return false;
      }

      // Build a summary of what was returned
      let preview = '';
      if (Array.isArray(data)) {
        preview = `Array with ${data.length} items`;
      } else if (data && typeof data === 'object') {
        const keys = Object.keys(data);
        if (keys.length <= 5) {
          preview = keys.map((k) => {
            const v = (data as any)[k];
            if (Array.isArray(v)) return `${k}: [${v.length}]`;
            if (typeof v === 'object' && v !== null) return `${k}: {...}`;
            return `${k}: ${String(v).slice(0, 30)}`;
          }).join(', ');
        } else {
          preview = `Object with ${keys.length} keys: ${keys.slice(0, 5).join(', ')}...`;
        }
      } else {
        preview = String(data).slice(0, 100);
      }

      setResults((prev) => ({
        ...prev,
        [test.id]: {
          status: 'success',
          durationMs,
          message: 'OK',
          responsePreview: preview,
          httpStatus: 200,
        },
      }));
      return true;
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      setResults((prev) => ({
        ...prev,
        [test.id]: {
          status: 'error',
          durationMs,
          message: err?.message || 'Unexpected error',
          responsePreview: null,
          httpStatus: null,
        },
      }));
      return false;
    }
  }, []);

  const runAllTests = useCallback(async () => {
    setRunningAll(true);
    // Reset all
    setResults({ ...initialResults });

    // Run sequentially to avoid overwhelming the server
    for (const test of EDGE_FUNCTION_TESTS) {
      await runSingleTest(test);
    }
    setRunningAll(false);
  }, [runSingleTest]);

  const successCount = Object.values(results).filter((r) => r.status === 'success').length;
  const errorCount = Object.values(results).filter((r) => r.status === 'error').length;
  const runningCount = Object.values(results).filter((r) => r.status === 'running').length;
  const totalTests = EDGE_FUNCTION_TESTS.length;

  const getStatusColor = (status: TestStatus) => {
    switch (status) {
      case 'success': return COLORS.success;
      case 'error': return COLORS.danger;
      case 'running': return COLORS.accent;
      default: return COLORS.textMuted;
    }
  };

  const getStatusIcon = (status: TestStatus): string => {
    switch (status) {
      case 'success': return 'checkmark-circle';
      case 'error': return 'close-circle';
      case 'running': return 'hourglass';
      default: return 'ellipse-outline';
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}>
            <Ionicons name="flask" size={20} color={COLORS.white} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Edge Function Diagnostics</Text>
            <Text style={styles.headerSubtitle}>
              {successCount + errorCount === 0
                ? `${totalTests} functions to test`
                : `${successCount} passed, ${errorCount} failed${runningCount > 0 ? `, ${runningCount} running` : ''}`}
            </Text>
          </View>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={COLORS.textMuted}
        />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.body}>
          {/* Summary bar */}
          {(successCount + errorCount > 0) && (
            <View style={styles.summaryBar}>
              <View style={[styles.summarySegment, { flex: successCount || 0.01, backgroundColor: COLORS.success }]} />
              <View style={[styles.summarySegment, { flex: errorCount || 0.01, backgroundColor: COLORS.danger }]} />
              <View style={[styles.summarySegment, { flex: Math.max(totalTests - successCount - errorCount, 0.01), backgroundColor: COLORS.borderLight }]} />
            </View>
          )}

          {/* Run All Button */}
          <TouchableOpacity
            style={[styles.runAllBtn, runningAll && styles.runAllBtnDisabled]}
            onPress={runAllTests}
            disabled={runningAll}
            activeOpacity={0.8}
          >
            {runningAll ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <Ionicons name="play" size={18} color={COLORS.white} />
            )}
            <Text style={styles.runAllBtnText}>
              {runningAll ? 'Running Tests...' : 'Run All Tests'}
            </Text>
          </TouchableOpacity>

          {/* Individual test rows */}
          {EDGE_FUNCTION_TESTS.map((test) => {
            const result = results[test.id];
            const statusColor = getStatusColor(result.status);
            const statusIcon = getStatusIcon(result.status);

            return (
              <View key={test.id} style={styles.testRow}>
                <View style={styles.testRowTop}>
                  <View style={styles.testInfo}>
                    <Ionicons
                      name={statusIcon as any}
                      size={18}
                      color={statusColor}
                    />
                    <View style={styles.testNameWrap}>
                      <Text style={styles.testName}>{test.name}</Text>
                      <Text style={styles.testDesc}>{test.description}</Text>
                    </View>
                  </View>
                  <View style={styles.testActions}>
                    {result.durationMs !== null && (
                      <Text style={[styles.testDuration, { color: statusColor }]}>
                        {result.durationMs}ms
                      </Text>
                    )}
                    <TouchableOpacity
                      style={[
                        styles.testRunBtn,
                        result.status === 'running' && styles.testRunBtnDisabled,
                      ]}
                      onPress={() => runSingleTest(test)}
                      disabled={result.status === 'running'}
                    >
                      {result.status === 'running' ? (
                        <ActivityIndicator size="small" color={COLORS.accent} />
                      ) : (
                        <Ionicons name="play-circle" size={24} color={COLORS.accent} />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Result details */}
                {result.status !== 'idle' && result.status !== 'running' && (
                  <View style={[styles.testResult, { borderLeftColor: statusColor }]}>
                    <Text style={[styles.testResultStatus, { color: statusColor }]}>
                      {result.status === 'success' ? 'PASS' : 'FAIL'}: {result.message}
                    </Text>
                    {result.responsePreview && (
                      <Text style={styles.testResultPreview} numberOfLines={3}>
                        {result.responsePreview}
                      </Text>
                    )}
                  </View>
                )}
              </View>
            );
          })}

          {/* Cleanup note */}
          <View style={styles.noteBox}>
            <Ionicons name="information-circle" size={16} color={COLORS.accent} />
            <Text style={styles.noteText}>
              Tests use read-only actions (list, fetch, audit) and do not modify any data.
              cleanup-program-dates is excluded as it has no read-only mode.
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.md,
    overflow: 'hidden',
    ...SHADOWS.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.lg,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.primary,
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  body: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  summaryBar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: SPACING.md,
    gap: 2,
  },
  summarySegment: {
    borderRadius: 3,
  },
  runAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accent,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.lg,
  },
  runAllBtnDisabled: {
    opacity: 0.7,
  },
  runAllBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  testRow: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    paddingVertical: SPACING.sm,
  },
  testRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  testInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
  },
  testNameWrap: {
    flex: 1,
  },
  testName: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.primary,
  },
  testDesc: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
  },
  testActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  testDuration: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
  },
  testRunBtn: {
    padding: 4,
  },
  testRunBtnDisabled: {
    opacity: 0.5,
  },
  testResult: {
    marginTop: SPACING.xs,
    marginLeft: 26,
    paddingLeft: SPACING.sm,
    borderLeftWidth: 3,
  },
  testResultStatus: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
  },
  testResultPreview: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
    fontFamily: 'monospace',
  },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    marginTop: SPACING.md,
    padding: SPACING.md,
    backgroundColor: COLORS.brandBlue50,
    borderRadius: BORDER_RADIUS.md,
  },
  noteText: {
    flex: 1,
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
});
