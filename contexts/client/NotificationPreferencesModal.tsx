import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
  Alert,
  Platform,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import TimePickerModal from './TimePickerModal';
import {
  NotificationPreferences,
  DEFAULT_PREFERENCES,
  fetchNotificationPreferences,
  saveNotificationPreferences,
  formatTime,
  dayName,
  advanceLabel,
} from '../../lib/notificationPreferencesService';

interface Props {
  visible: boolean;
  onClose: () => void;
}

type TimePickerTarget =
  | 'breakfast_reminder_time'
  | 'lunch_reminder_time'
  | 'dinner_reminder_time'
  | 'weekly_summary_time'
  | 'quiet_hours_start'
  | 'quiet_hours_end'
  | null;

const ADVANCE_OPTIONS = [
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '2 hours', value: 120 },
];

const DAY_OPTIONS = [
  { label: 'Sun', value: 0 },
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
];

const MEAL_ICONS: Record<string, { icon: string; color: string; label: string }> = {
  breakfast: { icon: 'sunny-outline', color: '#f39c12', label: 'Breakfast' },
  lunch: { icon: 'restaurant-outline', color: '#e67e22', label: 'Lunch' },
  dinner: { icon: 'moon-outline', color: '#9b59b6', label: 'Dinner' },
};

export default function NotificationPreferencesModal({ visible, onClose }: Props) {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPreferences>({ ...DEFAULT_PREFERENCES });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [savedSuccessfully, setSavedSuccessfully] = useState(false);
  const [timePickerTarget, setTimePickerTarget] = useState<TimePickerTarget>(null);
  const [timePickerTitle, setTimePickerTitle] = useState('Select Time');

  const originalPrefsRef = useRef<NotificationPreferences>({ ...DEFAULT_PREFERENCES });
  const successFade = useRef(new Animated.Value(0)).current;

  // Load preferences on open
  const loadPreferences = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setLoadError(null);
    setSavedSuccessfully(false);

    const result = await fetchNotificationPreferences(user.id);

    if (result.success) {
      setPrefs(result.preferences);
      originalPrefsRef.current = { ...result.preferences };
      setHasChanges(false);
    } else {
      setLoadError(result.error || 'Failed to load preferences');
      // Still set defaults so the UI is usable
      setPrefs({ ...DEFAULT_PREFERENCES });
      originalPrefsRef.current = { ...DEFAULT_PREFERENCES };
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (visible) {
      loadPreferences();
    }
  }, [visible, loadPreferences]);

  // Track changes
  const updatePref = useCallback(<K extends keyof NotificationPreferences>(
    key: K,
    value: NotificationPreferences[K]
  ) => {
    setPrefs(prev => {
      const updated = { ...prev, [key]: value };
      // Check if anything differs from original
      const changed = Object.keys(updated).some(
        k => (updated as any)[k] !== (originalPrefsRef.current as any)[k]
      );
      setHasChanges(changed);
      setSavedSuccessfully(false);
      return updated;
    });
  }, []);

  // Save preferences
  const handleSave = useCallback(async () => {
    if (!user?.id || !hasChanges) return;
    setSaving(true);

    const result = await saveNotificationPreferences(user.id, prefs);

    if (result.success) {
      originalPrefsRef.current = { ...prefs };
      setHasChanges(false);
      setSavedSuccessfully(true);

      // Animate success badge
      Animated.sequence([
        Animated.timing(successFade, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.delay(2000),
        Animated.timing(successFade, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]).start(() => setSavedSuccessfully(false));
    } else {
      Alert.alert(
        'Save Failed',
        result.error || 'Could not save your preferences. Please try again.',
        [{ text: 'OK' }]
      );
    }
    setSaving(false);
  }, [user?.id, hasChanges, prefs, successFade]);

  // Reset to defaults
  const handleResetDefaults = useCallback(() => {
    Alert.alert(
      'Reset to Defaults',
      'This will restore all notification settings to their default values.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            setPrefs({ ...DEFAULT_PREFERENCES });
            setHasChanges(true);
            setSavedSuccessfully(false);
          },
        },
      ]
    );
  }, []);

  // Close handler
  const handleClose = useCallback(() => {
    if (hasChanges) {
      Alert.alert(
        'Unsaved Changes',
        'You have unsaved changes. Would you like to save before leaving?',
        [
          { text: 'Discard', style: 'destructive', onPress: onClose },
          { text: 'Keep Editing', style: 'cancel' },
          { text: 'Save & Close', onPress: async () => { await handleSave(); onClose(); } },
        ]
      );
    } else {
      onClose();
    }
  }, [hasChanges, onClose, handleSave]);

  // Open time picker
  const openTimePicker = useCallback((target: TimePickerTarget, title: string) => {
    setTimePickerTarget(target);
    setTimePickerTitle(title);
  }, []);

  const handleTimeSelected = useCallback((time: string) => {
    if (timePickerTarget) {
      updatePref(timePickerTarget, time);
    }
    setTimePickerTarget(null);
  }, [timePickerTarget, updatePref]);

  // ── Render helpers ──

  const renderToggleRow = (
    icon: string,
    iconColor: string,
    label: string,
    description: string,
    value: boolean,
    onToggle: (val: boolean) => void,
    disabled?: boolean
  ) => (
    <View style={[styles.toggleRow, disabled && styles.toggleRowDisabled]}>
      <View style={[styles.toggleIcon, { backgroundColor: iconColor + '15' }]}>
        <Ionicons name={icon as any} size={18} color={iconColor} />
      </View>
      <View style={styles.toggleContent}>
        <Text style={[styles.toggleLabel, disabled && styles.toggleLabelDisabled]}>{label}</Text>
        <Text style={styles.toggleDesc}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: COLORS.border, true: COLORS.accent + '50' }}
        thumbColor={value ? COLORS.accent : COLORS.textMuted}
        disabled={disabled}
      />
    </View>
  );

  const renderTimeButton = (
    time: string,
    target: TimePickerTarget,
    title: string,
    disabled?: boolean
  ) => (
    <TouchableOpacity
      style={[styles.timeBtn, disabled && styles.timeBtnDisabled]}
      onPress={() => !disabled && openTimePicker(target, title)}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <Ionicons name="time-outline" size={14} color={disabled ? COLORS.textMuted : COLORS.accent} />
      <Text style={[styles.timeBtnText, disabled && styles.timeBtnTextDisabled]}>
        {formatTime(time)}
      </Text>
      <Ionicons name="chevron-forward" size={12} color={disabled ? COLORS.textMuted : COLORS.accent} />
    </TouchableOpacity>
  );

  // ── Main render ──

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.headerBtn}>
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Notifications</Text>
            <Text style={styles.headerSubtitle}>Manage your reminders</Text>
          </View>
          <View style={styles.headerRight}>
            {savedSuccessfully && (
              <Animated.View style={[styles.savedBadge, { opacity: successFade }]}>
                <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
                <Text style={styles.savedBadgeText}>Saved</Text>
              </Animated.View>
            )}
            {hasChanges && !saving && (
              <TouchableOpacity onPress={handleResetDefaults} style={styles.resetBtn}>
                <Ionicons name="refresh-outline" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Loading state */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <View style={styles.loadingCard}>
              <ActivityIndicator size="large" color={COLORS.accent} />
              <Text style={styles.loadingTitle}>Loading Preferences</Text>
              <Text style={styles.loadingSubtitle}>Fetching your notification settings...</Text>
            </View>
          </View>
        ) : loadError ? (
          /* Error state */
          <View style={styles.loadingContainer}>
            <View style={styles.errorCard}>
              <View style={styles.errorIconWrap}>
                <Ionicons name="cloud-offline-outline" size={40} color={COLORS.danger} />
              </View>
              <Text style={styles.errorTitle}>Unable to Load</Text>
              <Text style={styles.errorMessage}>{loadError}</Text>
              <Text style={styles.errorHint}>
                Default settings are shown below. You can still make changes and save.
              </Text>
              <TouchableOpacity style={styles.retryBtn} onPress={loadPreferences}>
                <Ionicons name="refresh" size={16} color={COLORS.white} />
                <Text style={styles.retryBtnText}>Retry</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* Content */}
        {!loading && (
          <ScrollView
            style={styles.scroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* ── SECTION: Meal Photo Reminders ── */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIcon, { backgroundColor: '#f39c1215' }]}>
                  <Ionicons name="camera-outline" size={20} color="#f39c12" />
                </View>
                <View style={styles.sectionHeaderText}>
                  <Text style={styles.sectionTitle}>Meal Photo Reminders</Text>
                  <Text style={styles.sectionSubtitle}>
                    Get reminded to log your meals with photos
                  </Text>
                </View>
              </View>

              <View style={styles.sectionCard}>
                {renderToggleRow(
                  'notifications-outline',
                  '#f39c12',
                  'Enable Meal Reminders',
                  'Receive reminders to photograph your meals',
                  prefs.meal_reminders_enabled,
                  (val) => updatePref('meal_reminders_enabled', val)
                )}

                {/* Individual meal toggles */}
                {(['breakfast', 'lunch', 'dinner'] as const).map((meal) => {
                  const config = MEAL_ICONS[meal];
                  const enabledKey = `${meal}_reminder_enabled` as keyof NotificationPreferences;
                  const timeKey = `${meal}_reminder_time` as keyof NotificationPreferences;
                  const isEnabled = prefs[enabledKey] as boolean;
                  const time = prefs[timeKey] as string;
                  const isDisabled = !prefs.meal_reminders_enabled;

                  return (
                    <View key={meal} style={styles.mealRow}>
                      <View style={styles.mealRowLeft}>
                        <View style={[styles.mealIcon, { backgroundColor: config.color + '15' }]}>
                          <Ionicons name={config.icon as any} size={16} color={config.color} />
                        </View>
                        <View style={styles.mealInfo}>
                          <Text style={[styles.mealLabel, isDisabled && styles.textDisabled]}>
                            {config.label}
                          </Text>
                          <Text style={styles.mealTimeLabel}>
                            {isEnabled && !isDisabled ? formatTime(time) : 'Disabled'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.mealRowRight}>
                        {renderTimeButton(
                          time,
                          timeKey as TimePickerTarget,
                          `${config.label} Reminder Time`,
                          isDisabled || !isEnabled
                        )}
                        <Switch
                          value={isEnabled}
                          onValueChange={(val) => updatePref(enabledKey as any, val)}
                          trackColor={{ false: COLORS.border, true: config.color + '50' }}
                          thumbColor={isEnabled ? config.color : COLORS.textMuted}
                          disabled={isDisabled}
                          style={styles.mealSwitch}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* ── SECTION: Session Alerts ── */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIcon, { backgroundColor: '#3498db15' }]}>
                  <Ionicons name="calendar-outline" size={20} color="#3498db" />
                </View>
                <View style={styles.sectionHeaderText}>
                  <Text style={styles.sectionTitle}>Session Alerts</Text>
                  <Text style={styles.sectionSubtitle}>
                    Never miss an upcoming training session
                  </Text>
                </View>
              </View>

              <View style={styles.sectionCard}>
                {renderToggleRow(
                  'alarm-outline',
                  '#3498db',
                  'Enable Session Alerts',
                  'Get notified before your scheduled sessions',
                  prefs.session_alerts_enabled,
                  (val) => updatePref('session_alerts_enabled', val)
                )}

                {/* Advance time selector */}
                <View style={[styles.subSection, !prefs.session_alerts_enabled && styles.subSectionDisabled]}>
                  <Text style={[styles.subSectionLabel, !prefs.session_alerts_enabled && styles.textDisabled]}>
                    Advance Notice
                  </Text>
                  <View style={styles.chipRow}>
                    {ADVANCE_OPTIONS.map((opt) => {
                      const isActive = prefs.session_alert_advance_minutes === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          style={[styles.chip, isActive && styles.chipActive]}
                          onPress={() => updatePref('session_alert_advance_minutes', opt.value)}
                          disabled={!prefs.session_alerts_enabled}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {renderToggleRow(
                  'today-outline',
                  '#2ecc71',
                  'Morning of Session',
                  'Reminder on the morning of your session day',
                  prefs.session_alert_same_day,
                  (val) => updatePref('session_alert_same_day', val),
                  !prefs.session_alerts_enabled
                )}

                {renderToggleRow(
                  'calendar-number-outline',
                  '#e67e22',
                  'Day Before',
                  'Get a heads-up the evening before',
                  prefs.session_alert_day_before,
                  (val) => updatePref('session_alert_day_before', val),
                  !prefs.session_alerts_enabled
                )}
              </View>
            </View>

            {/* ── SECTION: Weekly Progress Summary ── */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIcon, { backgroundColor: '#2ecc7115' }]}>
                  <Ionicons name="trending-up-outline" size={20} color="#2ecc71" />
                </View>
                <View style={styles.sectionHeaderText}>
                  <Text style={styles.sectionTitle}>Weekly Progress Summary</Text>
                  <Text style={styles.sectionSubtitle}>
                    Receive a weekly recap of your progress
                  </Text>
                </View>
              </View>

              <View style={styles.sectionCard}>
                {renderToggleRow(
                  'bar-chart-outline',
                  '#2ecc71',
                  'Enable Weekly Summary',
                  'Get a digest of your week\'s achievements',
                  prefs.weekly_summary_enabled,
                  (val) => updatePref('weekly_summary_enabled', val)
                )}

                {/* Day of week selector */}
                <View style={[styles.subSection, !prefs.weekly_summary_enabled && styles.subSectionDisabled]}>
                  <Text style={[styles.subSectionLabel, !prefs.weekly_summary_enabled && styles.textDisabled]}>
                    Delivery Day
                  </Text>
                  <View style={styles.dayRow}>
                    {DAY_OPTIONS.map((opt) => {
                      const isActive = prefs.weekly_summary_day === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          style={[styles.dayChip, isActive && styles.dayChipActive]}
                          onPress={() => updatePref('weekly_summary_day', opt.value)}
                          disabled={!prefs.weekly_summary_enabled}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.dayChipText, isActive && styles.dayChipTextActive]}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Delivery time */}
                <View style={[styles.subSection, !prefs.weekly_summary_enabled && styles.subSectionDisabled]}>
                  <Text style={[styles.subSectionLabel, !prefs.weekly_summary_enabled && styles.textDisabled]}>
                    Delivery Time
                  </Text>
                  <View style={styles.deliveryTimeRow}>
                    <View style={styles.deliveryInfo}>
                      <Ionicons
                        name="mail-outline"
                        size={16}
                        color={prefs.weekly_summary_enabled ? '#2ecc71' : COLORS.textMuted}
                      />
                      <Text style={[styles.deliveryText, !prefs.weekly_summary_enabled && styles.textDisabled]}>
                        Every {dayName(prefs.weekly_summary_day)} at{' '}
                        {formatTime(prefs.weekly_summary_time)}
                      </Text>
                    </View>
                    {renderTimeButton(
                      prefs.weekly_summary_time,
                      'weekly_summary_time',
                      'Summary Delivery Time',
                      !prefs.weekly_summary_enabled
                    )}
                  </View>
                </View>
              </View>
            </View>

            {/* ── SECTION: Quiet Hours ── */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIcon, { backgroundColor: '#9b59b615' }]}>
                  <Ionicons name="moon-outline" size={20} color="#9b59b6" />
                </View>
                <View style={styles.sectionHeaderText}>
                  <Text style={styles.sectionTitle}>Quiet Hours</Text>
                  <Text style={styles.sectionSubtitle}>
                    Pause all notifications during set hours
                  </Text>
                </View>
              </View>

              <View style={styles.sectionCard}>
                {renderToggleRow(
                  'volume-mute-outline',
                  '#9b59b6',
                  'Enable Quiet Hours',
                  'No notifications during your rest time',
                  prefs.quiet_hours_enabled,
                  (val) => updatePref('quiet_hours_enabled', val)
                )}

                <View style={[styles.quietTimeRow, !prefs.quiet_hours_enabled && styles.subSectionDisabled]}>
                  <View style={styles.quietTimeBlock}>
                    <Text style={[styles.quietTimeLabel, !prefs.quiet_hours_enabled && styles.textDisabled]}>
                      From
                    </Text>
                    {renderTimeButton(
                      prefs.quiet_hours_start,
                      'quiet_hours_start',
                      'Quiet Hours Start',
                      !prefs.quiet_hours_enabled
                    )}
                  </View>
                  <View style={styles.quietTimeDivider}>
                    <Ionicons
                      name="arrow-forward"
                      size={16}
                      color={prefs.quiet_hours_enabled ? COLORS.textMuted : COLORS.border}
                    />
                  </View>
                  <View style={styles.quietTimeBlock}>
                    <Text style={[styles.quietTimeLabel, !prefs.quiet_hours_enabled && styles.textDisabled]}>
                      Until
                    </Text>
                    {renderTimeButton(
                      prefs.quiet_hours_end,
                      'quiet_hours_end',
                      'Quiet Hours End',
                      !prefs.quiet_hours_enabled
                    )}
                  </View>
                </View>

                {prefs.quiet_hours_enabled && (
                  <View style={styles.quietInfoBanner}>
                    <Ionicons name="information-circle-outline" size={16} color="#9b59b6" />
                    <Text style={styles.quietInfoText}>
                      Notifications will be silenced from{' '}
                      {formatTime(prefs.quiet_hours_start)} to{' '}
                      {formatTime(prefs.quiet_hours_end)} daily.
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Summary info */}
            <View style={styles.summaryCard}>
              <Ionicons name="shield-checkmark-outline" size={18} color={COLORS.accent} />
              <View style={{ flex: 1 }}>
                <Text style={styles.summaryTitle}>Your Preferences are Synced</Text>
                <Text style={styles.summaryText}>
                  Notification settings are stored securely and apply across all your devices.
                </Text>
              </View>
            </View>

            <View style={{ height: 100 }} />
          </ScrollView>
        )}

        {/* Floating save bar */}
        {!loading && (
          <View style={styles.saveBar}>
            {hasChanges ? (
              <>
                <View style={styles.saveBarInfo}>
                  <View style={styles.unsavedDot} />
                  <Text style={styles.saveBarText}>Unsaved changes</Text>
                </View>
                <TouchableOpacity
                  style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                  onPress={handleSave}
                  disabled={saving}
                  activeOpacity={0.8}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color={COLORS.white} />
                  ) : (
                    <>
                      <Ionicons name="cloud-upload-outline" size={18} color={COLORS.white} />
                      <Text style={styles.saveBtnText}>Save Preferences</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.saveBarSaved}>
                <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
                <Text style={styles.saveBarSavedText}>All changes saved</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Time Picker Modal */}
      <TimePickerModal
        visible={timePickerTarget !== null}
        onClose={() => setTimePickerTarget(null)}
        onSelect={handleTimeSelected}
        currentTime={timePickerTarget ? (prefs[timePickerTarget] as string) : '08:00'}
        title={timePickerTitle}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    ...SHADOWS.sm,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: COLORS.text,
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '500',
    marginTop: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  savedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.success + '15',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
  },
  savedBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.success,
  },
  resetBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Loading
  loadingContainer: {
    padding: SPACING.xl,
  },
  loadingCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xxxl,
    alignItems: 'center',
    ...SHADOWS.md,
  },
  loadingTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: SPACING.lg,
  },
  loadingSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
  },

  // Error
  errorCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xxl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.danger + '20',
    ...SHADOWS.md,
  },
  errorIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.danger + '10',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  errorTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.danger,
  },
  errorMessage: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
  errorHint: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.sm,
    lineHeight: 16,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.lg,
  },
  retryBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.white,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
  },

  // Sections
  section: {
    marginBottom: SPACING.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
    gap: SPACING.md,
  },
  sectionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionHeaderText: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.text,
  },
  sectionSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  sectionCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    ...SHADOWS.sm,
  },

  // Toggle rows
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    gap: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  toggleRowDisabled: {
    opacity: 0.5,
  },
  toggleIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleContent: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.text,
  },
  toggleLabelDisabled: {
    color: COLORS.textMuted,
  },
  toggleDesc: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
    lineHeight: 15,
  },

  // Meal rows
  mealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  mealRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
  },
  mealIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mealInfo: {
    flex: 1,
  },
  mealLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.text,
  },
  mealTimeLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  mealRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  mealSwitch: {
    transform: [{ scale: 0.85 }],
  },

  // Time button
  timeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.accent + '10',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.accent + '25',
  },
  timeBtnDisabled: {
    backgroundColor: COLORS.borderLight,
    borderColor: COLORS.border,
  },
  timeBtnText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.accent,
  },
  timeBtnTextDisabled: {
    color: COLORS.textMuted,
  },

  // Sub-sections
  subSection: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  subSectionDisabled: {
    opacity: 0.45,
  },
  subSectionLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: SPACING.sm,
  },
  textDisabled: {
    color: COLORS.textMuted,
  },

  // Chips
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.background,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  chipActive: {
    backgroundColor: COLORS.accent + '15',
    borderColor: COLORS.accent,
  },
  chipText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  chipTextActive: {
    color: COLORS.accent,
    fontWeight: '700',
  },

  // Day chips
  dayRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dayChip: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  dayChipActive: {
    backgroundColor: '#2ecc7115',
    borderColor: '#2ecc71',
  },
  dayChipText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  dayChipTextActive: {
    color: '#2ecc71',
    fontWeight: '800',
  },

  // Delivery time
  deliveryTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deliveryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
  },
  deliveryText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '500',
    color: COLORS.textSecondary,
    flex: 1,
  },

  // Quiet hours
  quietTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  quietTimeBlock: {
    flex: 1,
    alignItems: 'center',
    gap: SPACING.xs,
  },
  quietTimeLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  quietTimeDivider: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
  },
  quietInfoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: '#9b59b608',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: '#9b59b615',
  },
  quietInfoText: {
    flex: 1,
    fontSize: FONT_SIZES.xs,
    color: '#9b59b6',
    fontWeight: '500',
    lineHeight: 16,
  },

  // Summary card
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.accent + '08',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.accent + '15',
    marginBottom: SPACING.lg,
  },
  summaryTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.accent,
    marginBottom: 2,
  },
  summaryText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },

  // Save bar
  saveBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    paddingBottom: Platform.OS === 'ios' ? 34 : SPACING.md,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    ...SHADOWS.md,
  },
  saveBarInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  unsavedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.warning,
  },
  saveBarText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.warning,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    minWidth: 160,
    justifyContent: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  saveBarSaved: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  saveBarSavedText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.success,
  },
});
