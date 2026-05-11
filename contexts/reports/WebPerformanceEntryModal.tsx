import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import {
  WebPerformanceEntry, DEFAULT_PAGES, getMonthLabel, upsertEntry, deleteEntry,
} from '../../lib/webPerformanceService';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  month: string;
  existingEntry?: WebPerformanceEntry | null;
}

export default function WebPerformanceEntryModal({ visible, onClose, onSaved, month, existingEntry }: Props) {
  // Form state
  const [pageUrl, setPageUrl] = useState('Site-Wide');
  const [pageLoadTime, setPageLoadTime] = useState('');
  const [ttfb, setTtfb] = useState('');
  const [fcp, setFcp] = useState('');
  const [lcp, setLcp] = useState('');
  const [cls, setCls] = useState('');
  const [fid, setFid] = useState('');
  const [inp, setInp] = useState('');
  const [totalPageViews, setTotalPageViews] = useState('');

  const [newUsers, setNewUsers] = useState('');
  const [allUsers, setAllUsers] = useState('');
  const [bounceRate, setBounceRate] = useState('');
  const [pagesPerSession, setPagesPerSession] = useState('');
  const [avgSessionDuration, setAvgSessionDuration] = useState('');
  const [mobilePct, setMobilePct] = useState('');
  const [desktopPct, setDesktopPct] = useState('');
  const [tabletPct, setTabletPct] = useState('');
  const [uptimePct, setUptimePct] = useState('');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activeSection, setActiveSection] = useState<'vitals' | 'traffic' | 'device' | 'other'>('vitals');

  const isEditing = !!existingEntry;

  useEffect(() => {
    if (visible) {
      if (existingEntry) {
        setPageUrl(existingEntry.page_url || 'Site-Wide');
        setPageLoadTime(String(existingEntry.page_load_time || ''));
        setTtfb(String(existingEntry.ttfb || ''));
        setFcp(String(existingEntry.fcp || ''));
        setLcp(String(existingEntry.lcp || ''));
        setCls(String(existingEntry.cls || ''));
        setFid(String(existingEntry.fid || ''));
        setInp(String(existingEntry.inp || ''));
        setTotalPageViews(String(existingEntry.total_page_views || ''));

        setNewUsers(String(existingEntry.new_users || ''));
        setAllUsers(String(existingEntry.all_users || ''));
        setBounceRate(String(existingEntry.bounce_rate || ''));
        setPagesPerSession(String(existingEntry.pages_per_session || ''));
        setAvgSessionDuration(String(existingEntry.avg_session_duration || ''));
        setMobilePct(String(existingEntry.mobile_traffic_pct || ''));
        setDesktopPct(String(existingEntry.desktop_traffic_pct || ''));
        setTabletPct(String(existingEntry.tablet_traffic_pct || ''));
        setUptimePct(String(existingEntry.uptime_pct || ''));
        setNotes(existingEntry.notes || '');
      } else {
        setPageUrl('Site-Wide');
        setPageLoadTime(''); setTtfb(''); setFcp(''); setLcp('');
        setCls(''); setFid(''); setInp('');
        setTotalPageViews('');

        setNewUsers(''); setAllUsers('');
        setBounceRate(''); setPagesPerSession(''); setAvgSessionDuration('');
        setMobilePct(''); setDesktopPct(''); setTabletPct('');
        setUptimePct(''); setNotes('');
      }
      setError(null);
      setConfirmDelete(false);
      setActiveSection('vitals');
    }
  }, [visible, existingEntry]);


  // Auto-calculate tablet when mobile + desktop change
  useEffect(() => {
    const m = parseFloat(mobilePct) || 0;
    const d = parseFloat(desktopPct) || 0;
    if (m > 0 || d > 0) {
      const remainder = Math.max(0, 100 - m - d);
      setTabletPct(remainder.toFixed(1));
    }
  }, [mobilePct, desktopPct]);

  const handleSave = async () => {
    if (!pageUrl.trim()) {
      setError('Page URL / name is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await upsertEntry({
        month,
        page_url: pageUrl.trim(),
        page_load_time: parseFloat(pageLoadTime) || 0,
        ttfb: parseFloat(ttfb) || 0,
        fcp: parseFloat(fcp) || 0,
        lcp: parseFloat(lcp) || 0,
        cls: parseFloat(cls) || 0,
        fid: parseFloat(fid) || 0,
        inp: parseFloat(inp) || 0,
        total_page_views: parseInt(totalPageViews) || 0,
        unique_visitors: 0,

        new_users: parseInt(newUsers) || 0,
        all_users: parseInt(allUsers) || 0,
        bounce_rate: parseFloat(bounceRate) || 0,
        pages_per_session: parseFloat(pagesPerSession) || 0,
        avg_session_duration: parseFloat(avgSessionDuration) || 0,
        mobile_traffic_pct: parseFloat(mobilePct) || 0,
        desktop_traffic_pct: parseFloat(desktopPct) || 0,
        tablet_traffic_pct: parseFloat(tabletPct) || 0,
        uptime_pct: parseFloat(uptimePct) || 0,
        notes: notes.trim(),
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
    if (!confirmDelete) { setConfirmDelete(true); return; }
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

  const sections = [
    { key: 'vitals' as const, label: 'Core Web Vitals', icon: 'speedometer-outline' },
    { key: 'traffic' as const, label: 'Traffic & Engagement', icon: 'people-outline' },
    { key: 'device' as const, label: 'Device Split', icon: 'phone-portrait-outline' },
    { key: 'other' as const, label: 'Other', icon: 'ellipsis-horizontal' },
  ];

  const renderMetricField = (
    label: string, value: string, setter: (v: string) => void,
    icon: string, iconColor: string, placeholder: string, unit?: string,
    keyboardType: 'decimal-pad' | 'number-pad' = 'decimal-pad'
  ) => (
    <View style={styles.metricField}>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.metricInputWrapper}>
        <Ionicons name={icon as any} size={14} color={iconColor} />
        <TextInput
          style={styles.metricInput}
          value={value}
          onChangeText={setter}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textMuted}
          keyboardType={keyboardType}
        />
        {unit && <Text style={styles.metricUnit}>{unit}</Text>}
      </View>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIcon}>
                <Ionicons name={isEditing ? 'create' : 'add-circle'} size={20} color={COLORS.white} />
              </View>
              <View>
                <Text style={styles.headerTitle}>{isEditing ? 'Edit Performance Data' : 'Add Performance Data'}</Text>
                <Text style={styles.headerSubtitle}>{getMonthLabel(month)}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={22} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {error && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color={COLORS.danger} />
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity onPress={() => setError(null)}>
                  <Ionicons name="close" size={14} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>
            )}

            {/* Page URL / Name */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Page / Section</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="globe-outline" size={16} color={COLORS.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={pageUrl}
                  onChangeText={setPageUrl}
                  placeholder="e.g. Site-Wide, Homepage"
                  placeholderTextColor={COLORS.textMuted}
                  editable={!isEditing}
                />
              </View>
              {!isEditing && (
                <View style={styles.quickPages}>
                  <Text style={styles.quickPagesLabel}>Quick select:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickPagesRow}>
                    {DEFAULT_PAGES.map(p => (
                      <TouchableOpacity
                        key={p}
                        style={[styles.quickPageChip, pageUrl === p && styles.quickPageChipActive]}
                        onPress={() => setPageUrl(p)}
                      >
                        <Text style={[styles.quickPageText, pageUrl === p && styles.quickPageTextActive]}>{p}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Section Tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sectionTabs} contentContainerStyle={styles.sectionTabsContent}>
              {sections.map(s => (
                <TouchableOpacity
                  key={s.key}
                  style={[styles.sectionTab, activeSection === s.key && styles.sectionTabActive]}
                  onPress={() => setActiveSection(s.key)}
                >
                  <Ionicons
                    name={s.icon as any}
                    size={14}
                    color={activeSection === s.key ? COLORS.white : COLORS.textMuted}
                  />
                  <Text style={[styles.sectionTabText, activeSection === s.key && styles.sectionTabTextActive]}>
                    {s.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Core Web Vitals */}
            {activeSection === 'vitals' && (
              <>
                <Text style={styles.sectionTitle}>Core Web Vitals</Text>
                <View style={styles.metricsGrid}>
                  {renderMetricField('Page Load Time', pageLoadTime, setPageLoadTime, 'time-outline', COLORS.accent, '0.00', 's')}
                  {renderMetricField('TTFB', ttfb, setTtfb, 'flash-outline', COLORS.warning, '0', 'ms')}
                  {renderMetricField('FCP', fcp, setFcp, 'color-palette-outline', COLORS.info, '0.00', 's')}
                  {renderMetricField('LCP', lcp, setLcp, 'image-outline', COLORS.success, '0.00', 's')}
                  {renderMetricField('CLS', cls, setCls, 'move-outline', '#9b59b6', '0.000')}
                  {renderMetricField('FID', fid, setFid, 'hand-left-outline', COLORS.danger, '0', 'ms')}
                  {renderMetricField('INP', inp, setInp, 'finger-print-outline', COLORS.primary, '0', 'ms')}
                </View>
                <View style={styles.cwvHelpCard}>
                  <Ionicons name="information-circle-outline" size={14} color={COLORS.textMuted} />
                  <Text style={styles.cwvHelpText}>
                    LCP {'<'} 2.5s, FID {'<'} 100ms, CLS {'<'} 0.1 = Good. INP {'<'} 200ms = Good.
                  </Text>
                </View>
              </>
            )}

            {/* Traffic & Engagement */}
            {activeSection === 'traffic' && (
              <>
                <Text style={styles.sectionTitle}>Traffic & Engagement</Text>
                <View style={styles.metricsGrid}>
                  {renderMetricField('Total Page Views', totalPageViews, setTotalPageViews, 'eye-outline', COLORS.info, '0', undefined, 'number-pad')}

                  {renderMetricField('New Users', newUsers, setNewUsers, 'person-add-outline', '#1abc9c', '0', undefined, 'number-pad')}
                  {renderMetricField('All Users', allUsers, setAllUsers, 'people-circle-outline', '#3498db', '0', undefined, 'number-pad')}
                  {renderMetricField('Bounce Rate', bounceRate, setBounceRate, 'exit-outline', COLORS.danger, '0.0', '%')}
                  {renderMetricField('Pages / Session', pagesPerSession, setPagesPerSession, 'documents-outline', COLORS.success, '0.0')}
                  {renderMetricField('Avg Session Duration', avgSessionDuration, setAvgSessionDuration, 'timer-outline', COLORS.warning, '0', 's')}
                </View>
              </>
            )}


            {/* Device Split */}
            {activeSection === 'device' && (
              <>
                <Text style={styles.sectionTitle}>Device Split</Text>
                <View style={styles.metricsGrid}>
                  {renderMetricField('Mobile Traffic', mobilePct, setMobilePct, 'phone-portrait-outline', COLORS.accent, '0.0', '%')}
                  {renderMetricField('Desktop Traffic', desktopPct, setDesktopPct, 'desktop-outline', COLORS.info, '0.0', '%')}
                  {renderMetricField('Tablet Traffic', tabletPct, setTabletPct, 'tablet-portrait-outline', '#9b59b6', '0.0', '%')}
                </View>
                <View style={styles.cwvHelpCard}>
                  <Ionicons name="information-circle-outline" size={14} color={COLORS.textMuted} />
                  <Text style={styles.cwvHelpText}>Tablet % auto-calculates from 100 - Mobile - Desktop.</Text>
                </View>
              </>
            )}

            {/* Other */}
            {activeSection === 'other' && (
              <>
                <Text style={styles.sectionTitle}>Availability & Notes</Text>
                <View style={styles.metricsGrid}>
                  {renderMetricField('Uptime', uptimePct, setUptimePct, 'shield-checkmark-outline', COLORS.success, '100.0', '%')}
                </View>
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Notes</Text>
                  <View style={[styles.inputWrapper, { minHeight: 80, alignItems: 'flex-start' }]}>
                    <TextInput
                      style={[styles.input, { textAlignVertical: 'top', paddingTop: SPACING.md }]}
                      value={notes}
                      onChangeText={setNotes}
                      placeholder="Any notes about this month's performance..."
                      placeholderTextColor={COLORS.textMuted}
                      multiline
                      numberOfLines={4}
                    />
                  </View>
                </View>
              </>
            )}

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
  overlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end' },
  container: {
    backgroundColor: COLORS.white, borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl, maxHeight: '92%', ...SHADOWS.lg,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.lg,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  headerIcon: {
    width: 38, height: 38, borderRadius: 10, backgroundColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: FONT_SIZES.lg, fontWeight: '800', color: COLORS.primary },
  headerSubtitle: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '600', marginTop: 1 },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.background,
    alignItems: 'center', justifyContent: 'center',
  },
  body: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.dangerLight, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, marginBottom: SPACING.md,
  },
  errorText: { flex: 1, fontSize: FONT_SIZES.sm, color: COLORS.danger, fontWeight: '600' },

  // Field Group
  fieldGroup: { marginBottom: SPACING.lg },
  fieldLabel: {
    fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.primary,
    marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: 0.3,
  },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md,
  },
  inputIcon: { marginRight: SPACING.sm },
  input: { flex: 1, fontSize: FONT_SIZES.md, color: COLORS.text, paddingVertical: SPACING.md, fontWeight: '600' },

  // Quick Pages
  quickPages: { marginTop: SPACING.sm },
  quickPagesLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '600', marginBottom: 4 },
  quickPagesRow: { gap: SPACING.xs },
  quickPageChip: {
    paddingHorizontal: SPACING.md, paddingVertical: 5, borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border,
  },
  quickPageChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  quickPageText: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: COLORS.textSecondary },
  quickPageTextActive: { color: COLORS.white },

  // Section Tabs
  sectionTabs: { marginBottom: SPACING.md, flexGrow: 0 },
  sectionTabsContent: { gap: SPACING.sm },
  sectionTab: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.background,
    borderWidth: 1, borderColor: COLORS.border,
  },
  sectionTabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  sectionTabText: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: COLORS.textMuted },
  sectionTabTextActive: { color: COLORS.white },

  // Section Title
  sectionTitle: {
    fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.primary,
    marginBottom: SPACING.md, textTransform: 'uppercase', letterSpacing: 0.3,
  },

  // Metrics Grid
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.md },
  metricField: { flex: 1, minWidth: '45%' },
  metricLabel: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 4 },
  metricInputWrapper: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: SPACING.md, gap: SPACING.sm,
  },
  metricInput: { flex: 1, fontSize: FONT_SIZES.md, color: COLORS.text, paddingVertical: SPACING.sm, fontWeight: '700' },
  metricUnit: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.textMuted },

  // CWV Help
  cwvHelpCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.infoLight, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, marginBottom: SPACING.md,
  },
  cwvHelpText: { flex: 1, fontSize: FONT_SIZES.xs, color: COLORS.info, fontWeight: '500', lineHeight: 16 },

  // Delete
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1, borderColor: COLORS.danger + '30', backgroundColor: COLORS.dangerLight, marginTop: SPACING.sm,
  },
  deleteBtnConfirm: { backgroundColor: COLORS.danger, borderColor: COLORS.danger },
  deleteBtnText: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.danger },
  deleteBtnTextConfirm: { color: COLORS.white },

  // Footer
  footer: {
    flexDirection: 'row', gap: SPACING.sm, paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg, borderTopWidth: 1, borderTopColor: COLORS.borderLight,
  },
  cancelBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border,
  },
  cancelBtnText: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.textSecondary },
  saveBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.accent, ...SHADOWS.sm,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.white },
});
