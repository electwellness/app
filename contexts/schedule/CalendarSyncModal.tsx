import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Switch, Linking, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import type { Appointment } from '../../data/scheduleData';
import { formatDateKey, formatTimeDisplay } from '../../data/scheduleData';
import {
  getConnections, saveConnection, disconnectCalendar, toggleSync,
  updateSyncDirection, importEvents, getExternalEvents,
  type CalendarConnection, type ExternalCalendarEvent,
} from '../../lib/calendarSyncService';
import {
  generateCoachScheduleICS, generateFullScheduleICS,
  generateSingleEventICS, generateMultiEventICS,
  downloadICSFile, generateGoogleCalendarURL,
} from '../../lib/icsGenerator';

interface CalendarSyncModalProps {
  visible: boolean;
  onClose: () => void;
  appointments: Appointment[];
  coachId?: string;
  coachName?: string;
  userRole?: string;
  onExternalEventsLoaded?: (events: ExternalCalendarEvent[], connections: any[]) => void;
}

type Tab = 'connections' | 'export' | 'events';

export default function CalendarSyncModal({
  visible, onClose, appointments, coachId, coachName, userRole,
  onExternalEventsLoaded,
}: CalendarSyncModalProps) {
  const [tab, setTab] = useState<Tab>('connections');
  const [connections, setConnections] = useState<CalendarConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [externalEvents, setExternalEvents] = useState<ExternalCalendarEvent[]>([]);

  // Connect form state
  const [showConnectForm, setShowConnectForm] = useState(false);
  const [connectProvider, setConnectProvider] = useState<'google' | 'apple' | 'outlook'>('google');
  const [connectEmail, setConnectEmail] = useState('');
  const [connectCalName, setConnectCalName] = useState('');
  const [connectDirection, setConnectDirection] = useState<'bidirectional' | 'export_only' | 'import_only'>('bidirectional');

  // Export options
  const [exportRange, setExportRange] = useState<'week' | 'month' | '3months' | 'all'>('month');

  const loadConnections = useCallback(async () => {
    setLoading(true);
    try {
      const { connections: conns, error } = await getConnections();
      if (!error) setConnections(conns);
    } catch (err) {
      console.log('Error loading connections:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadExternalEvents = useCallback(async () => {
    setSyncing(true);
    try {
      const now = new Date();
      const dateFrom = formatDateKey(now);
      const future = new Date(now);
      future.setDate(future.getDate() + 30);
      const dateTo = formatDateKey(future);

      const { events, connections: conns, error } = await getExternalEvents(dateFrom, dateTo);
      if (!error) {
        setExternalEvents(events);
        if (onExternalEventsLoaded) {
          onExternalEventsLoaded(events, conns);
        }
      }
    } catch (err) {
      console.log('Error loading external events:', err);
    } finally {
      setSyncing(false);
    }
  }, [onExternalEventsLoaded]);

  useEffect(() => {
    if (visible) {
      loadConnections();
      loadExternalEvents();
    }
  }, [visible, loadConnections, loadExternalEvents]);

  const handleConnect = async () => {
    if (!connectEmail.trim() && connectProvider !== 'apple') {
      Alert.alert('Email Required', 'Please enter your calendar email address.');
      return;
    }

    setLoading(true);
    try {
      const { connection, error } = await saveConnection({
        provider: connectProvider,
        providerEmail: connectEmail.trim() || undefined,
        calendarName: connectCalName.trim() || `${connectProvider.charAt(0).toUpperCase() + connectProvider.slice(1)} Calendar`,
        syncDirection: connectDirection,
      });

      if (error) {
        Alert.alert('Error', error);
      } else {
        setShowConnectForm(false);
        setConnectEmail('');
        setConnectCalName('');
        loadConnections();
        Alert.alert('Connected', `${connectProvider.charAt(0).toUpperCase() + connectProvider.slice(1)} Calendar has been connected successfully.`);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to connect calendar.');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = (conn: CalendarConnection) => {
    Alert.alert(
      'Disconnect Calendar',
      `Are you sure you want to disconnect ${conn.calendar_name}? External events from this calendar will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            const { error } = await disconnectCalendar(conn.provider);
            if (!error) {
              loadConnections();
              loadExternalEvents();
            } else {
              Alert.alert('Error', error);
            }
          },
        },
      ]
    );
  };

  const handleToggleSync = async (conn: CalendarConnection) => {
    const { error } = await toggleSync(conn.id, !conn.sync_enabled);
    if (!error) loadConnections();
  };

  const handleSyncNow = async (conn: CalendarConnection) => {
    setSyncing(true);
    try {
      const now = new Date();
      const dateFrom = formatDateKey(now);
      const future = new Date(now);
      future.setDate(future.getDate() + 30);
      const dateTo = formatDateKey(future);

      const { error } = await importEvents(conn.id, dateFrom, dateTo);
      if (error) {
        Alert.alert('Sync Error', error);
      } else {
        loadConnections();
        loadExternalEvents();
        Alert.alert('Synced', 'Calendar events have been synced successfully.');
      }
    } finally {
      setSyncing(false);
    }
  };

  // ── Export Helpers ──

  const getExportDateRange = useMemo(() => {
    const now = new Date();
    const from = formatDateKey(now);
    let to: string;
    const future = new Date(now);

    switch (exportRange) {
      case 'week':
        future.setDate(future.getDate() + 7);
        to = formatDateKey(future);
        break;
      case 'month':
        future.setMonth(future.getMonth() + 1);
        to = formatDateKey(future);
        break;
      case '3months':
        future.setMonth(future.getMonth() + 3);
        to = formatDateKey(future);
        break;
      default:
        to = '2099-12-31';
    }
    return { from, to };
  }, [exportRange]);

  const exportableAppointments = useMemo(() => {
    let filtered = appointments.filter(a => a.status !== 'cancelled');
    if (coachId) filtered = filtered.filter(a => a.coachId === coachId);
    if (exportRange !== 'all') {
      const { from, to } = getExportDateRange;
      filtered = filtered.filter(a => a.date >= from && a.date <= to);
    }
    return filtered.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  }, [appointments, coachId, exportRange, getExportDateRange]);

  const handleExportICS = () => {
    if (exportableAppointments.length === 0) {
      Alert.alert('No Appointments', 'There are no appointments to export for the selected range.');
      return;
    }

    const icsContent = coachId
      ? generateCoachScheduleICS(appointments, coachId, getExportDateRange.from, exportRange === 'all' ? undefined : getExportDateRange.to)
      : generateFullScheduleICS(exportableAppointments);

    const filename = coachName
      ? `${coachName.replace(/\s+/g, '_')}_schedule.ics`
      : 'elect_wellness_schedule.ics';

    downloadICSFile(icsContent, filename);
    Alert.alert('Exported', `${exportableAppointments.length} appointments exported as ${filename}`);
  };

  const handleAddToGoogleCalendar = (appt: Appointment) => {
    const url = generateGoogleCalendarURL(appt);
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url);
    }
  };

  const providerConfig = {
    google: {
      name: 'Google Calendar',
      icon: 'logo-google' as const,
      color: '#4285F4',
      bgColor: '#4285F410',
    },
    apple: {
      name: 'Apple Calendar',
      icon: 'logo-apple' as const,
      color: '#333333',
      bgColor: '#33333310',
    },
    outlook: {
      name: 'Outlook Calendar',
      icon: 'mail' as const,
      color: '#0078D4',
      bgColor: '#0078D410',
    },
  };

  const formatLastSynced = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const directionLabels: Record<string, { label: string; icon: string }> = {
    bidirectional: { label: 'Two-way Sync', icon: 'swap-horizontal' },
    export_only: { label: 'Export Only', icon: 'arrow-forward' },
    import_only: { label: 'Import Only', icon: 'arrow-back' },
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Calendar Sync</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Tab Bar */}
        <View style={styles.tabBar}>
          {([
            { key: 'connections' as Tab, label: 'Connections', icon: 'link' },
            { key: 'export' as Tab, label: 'Export', icon: 'download' },
            { key: 'events' as Tab, label: 'Events', icon: 'calendar' },
          ]).map(t => (
            <TouchableOpacity
              key={t.key}
              style={[styles.tabItem, tab === t.key && styles.tabItemActive]}
              onPress={() => setTab(t.key)}
            >
              <Ionicons name={t.icon as any} size={16} color={tab === t.key ? COLORS.accent : COLORS.textMuted} />
              <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* ── CONNECTIONS TAB ── */}
          {tab === 'connections' && (
            <View style={styles.tabContent}>
              <Text style={styles.sectionTitle}>Connected Calendars</Text>
              <Text style={styles.sectionDesc}>
                Connect your external calendars to sync appointments and detect scheduling conflicts.
              </Text>

              {loading && connections.length === 0 ? (
                <ActivityIndicator size="small" color={COLORS.accent} style={{ marginTop: SPACING.xl }} />
              ) : connections.length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIcon}>
                    <Ionicons name="calendar-outline" size={36} color={COLORS.textMuted} />
                  </View>
                  <Text style={styles.emptyTitle}>No Calendars Connected</Text>
                  <Text style={styles.emptyDesc}>
                    Connect Google Calendar, Apple Calendar, or Outlook to enable automatic sync and conflict detection.
                  </Text>
                </View>
              ) : (
                connections.map(conn => {
                  const config = providerConfig[conn.provider] || providerConfig.google;
                  const dirConfig = directionLabels[conn.sync_direction] || directionLabels.bidirectional;
                  return (
                    <View key={conn.id} style={styles.connectionCard}>
                      <View style={styles.connectionHeader}>
                        <View style={[styles.providerIcon, { backgroundColor: config.bgColor }]}>
                          <Ionicons name={config.icon} size={22} color={config.color} />
                        </View>
                        <View style={styles.connectionInfo}>
                          <Text style={styles.connectionName}>{conn.calendar_name || config.name}</Text>
                          <Text style={styles.connectionEmail}>{conn.provider_email}</Text>
                        </View>
                        <Switch
                          value={conn.sync_enabled}
                          onValueChange={() => handleToggleSync(conn)}
                          trackColor={{ false: COLORS.borderLight, true: COLORS.accent + '50' }}
                          thumbColor={conn.sync_enabled ? COLORS.accent : COLORS.textMuted}
                        />
                      </View>

                      <View style={styles.connectionMeta}>
                        <View style={styles.metaItem}>
                          <Ionicons name={dirConfig.icon as any} size={12} color={COLORS.textMuted} />
                          <Text style={styles.metaText}>{dirConfig.label}</Text>
                        </View>
                        <View style={styles.metaItem}>
                          <Ionicons name="time-outline" size={12} color={COLORS.textMuted} />
                          <Text style={styles.metaText}>Synced: {formatLastSynced(conn.last_synced_at)}</Text>
                        </View>
                      </View>

                      <View style={styles.connectionActions}>
                        <TouchableOpacity
                          style={styles.syncNowBtn}
                          onPress={() => handleSyncNow(conn)}
                          disabled={syncing}
                        >
                          {syncing ? (
                            <ActivityIndicator size="small" color={COLORS.accent} />
                          ) : (
                            <Ionicons name="sync" size={14} color={COLORS.accent} />
                          )}
                          <Text style={styles.syncNowText}>Sync Now</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.disconnectBtn}
                          onPress={() => handleDisconnect(conn)}
                        >
                          <Ionicons name="unlink" size={14} color={COLORS.danger} />
                          <Text style={styles.disconnectText}>Disconnect</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}

              {/* Add Calendar Button */}
              {!showConnectForm ? (
                <TouchableOpacity style={styles.addCalendarBtn} onPress={() => setShowConnectForm(true)}>
                  <Ionicons name="add-circle" size={20} color={COLORS.accent} />
                  <Text style={styles.addCalendarText}>Connect a Calendar</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.connectForm}>
                  <Text style={styles.formTitle}>Connect Calendar</Text>

                  {/* Provider Selection */}
                  <Text style={styles.formLabel}>Calendar Provider</Text>
                  <View style={styles.providerGrid}>
                    {(['google', 'apple', 'outlook'] as const).map(p => {
                      const config = providerConfig[p];
                      const isSelected = connectProvider === p;
                      return (
                        <TouchableOpacity
                          key={p}
                          style={[styles.providerOption, isSelected && { borderColor: config.color, backgroundColor: config.bgColor }]}
                          onPress={() => setConnectProvider(p)}
                        >
                          <Ionicons name={config.icon} size={24} color={isSelected ? config.color : COLORS.textMuted} />
                          <Text style={[styles.providerOptionName, isSelected && { color: config.color }]}>
                            {config.name.split(' ')[0]}
                          </Text>
                          {isSelected && (
                            <View style={[styles.providerCheck, { backgroundColor: config.color }]}>
                              <Ionicons name="checkmark" size={10} color={COLORS.white} />
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Email */}
                  <Text style={styles.formLabel}>Calendar Email</Text>
                  <TextInput
                    style={styles.formInput}
                    value={connectEmail}
                    onChangeText={setConnectEmail}
                    placeholder={`your.email@${connectProvider === 'google' ? 'gmail.com' : connectProvider === 'outlook' ? 'outlook.com' : 'icloud.com'}`}
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />

                  {/* Calendar Name */}
                  <Text style={styles.formLabel}>Calendar Name (optional)</Text>
                  <TextInput
                    style={styles.formInput}
                    value={connectCalName}
                    onChangeText={setConnectCalName}
                    placeholder="My Work Calendar"
                    placeholderTextColor={COLORS.textMuted}
                  />

                  {/* Sync Direction */}
                  <Text style={styles.formLabel}>Sync Direction</Text>
                  <View style={styles.directionGrid}>
                    {([
                      { key: 'bidirectional' as const, label: 'Two-way', desc: 'Import & export events', icon: 'swap-horizontal' },
                      { key: 'export_only' as const, label: 'Export Only', desc: 'Push appointments out', icon: 'arrow-forward' },
                      { key: 'import_only' as const, label: 'Import Only', desc: 'Pull events in', icon: 'arrow-back' },
                    ]).map(d => (
                      <TouchableOpacity
                        key={d.key}
                        style={[styles.directionOption, connectDirection === d.key && styles.directionOptionActive]}
                        onPress={() => setConnectDirection(d.key)}
                      >
                        <Ionicons name={d.icon as any} size={18} color={connectDirection === d.key ? COLORS.accent : COLORS.textMuted} />
                        <Text style={[styles.directionLabel, connectDirection === d.key && { color: COLORS.accent }]}>{d.label}</Text>
                        <Text style={styles.directionDesc}>{d.desc}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Info Banner */}
                  <View style={styles.infoBanner}>
                    <Ionicons name="information-circle" size={16} color={COLORS.accent} />
                    <Text style={styles.infoBannerText}>
                      Calendar sync uses your email to identify your calendar. For Google Calendar, events will be synced automatically. For Apple Calendar, use the ICS export feature for best results.
                    </Text>
                  </View>

                  {/* Form Actions */}
                  <View style={styles.formActions}>
                    <TouchableOpacity style={styles.formCancelBtn} onPress={() => setShowConnectForm(false)}>
                      <Text style={styles.formCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.formSaveBtn} onPress={handleConnect} disabled={loading}>
                      {loading ? (
                        <ActivityIndicator size="small" color={COLORS.white} />
                      ) : (
                        <>
                          <Ionicons name="link" size={16} color={COLORS.white} />
                          <Text style={styles.formSaveText}>Connect</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* ── EXPORT TAB ── */}
          {tab === 'export' && (
            <View style={styles.tabContent}>
              <Text style={styles.sectionTitle}>Export Schedule</Text>
              <Text style={styles.sectionDesc}>
                Download your schedule as an .ics file compatible with Google Calendar, Apple Calendar, and Outlook.
              </Text>

              {/* Export Range */}
              <Text style={styles.formLabel}>Date Range</Text>
              <View style={styles.rangeGrid}>
                {([
                  { key: 'week' as const, label: 'This Week', icon: 'today' },
                  { key: 'month' as const, label: 'This Month', icon: 'calendar' },
                  { key: '3months' as const, label: '3 Months', icon: 'calendar-outline' },
                  { key: 'all' as const, label: 'All', icon: 'infinite' },
                ]).map(r => (
                  <TouchableOpacity
                    key={r.key}
                    style={[styles.rangeOption, exportRange === r.key && styles.rangeOptionActive]}
                    onPress={() => setExportRange(r.key)}
                  >
                    <Ionicons name={r.icon as any} size={16} color={exportRange === r.key ? COLORS.white : COLORS.textSecondary} />
                    <Text style={[styles.rangeLabel, exportRange === r.key && styles.rangeLabelActive]}>{r.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Export Summary */}
              <View style={styles.exportSummary}>
                <View style={styles.exportSummaryIcon}>
                  <Ionicons name="document-text" size={24} color={COLORS.accent} />
                </View>
                <View style={styles.exportSummaryInfo}>
                  <Text style={styles.exportSummaryCount}>{exportableAppointments.length}</Text>
                  <Text style={styles.exportSummaryLabel}>appointments to export</Text>
                </View>
                {coachName && (
                  <View style={styles.exportCoachBadge}>
                    <Ionicons name="person" size={12} color={COLORS.accent} />
                    <Text style={styles.exportCoachName}>{coachName}</Text>
                  </View>
                )}
              </View>

              {/* Export Button */}
              <TouchableOpacity style={styles.exportBtn} onPress={handleExportICS}>
                <View style={styles.exportBtnIcon}>
                  <Ionicons name="download" size={22} color={COLORS.white} />
                </View>
                <View style={styles.exportBtnContent}>
                  <Text style={styles.exportBtnTitle}>Download .ics File</Text>
                  <Text style={styles.exportBtnDesc}>
                    Compatible with Google Calendar, Apple Calendar, and Outlook
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.white + '80'} />
              </TouchableOpacity>

              {/* Quick Add to Google */}
              <Text style={[styles.formLabel, { marginTop: SPACING.xl }]}>Quick Add Individual Events</Text>
              <Text style={styles.sectionDesc}>
                Click any appointment below to add it directly to Google Calendar.
              </Text>

              {exportableAppointments.slice(0, 10).map(appt => (
                <TouchableOpacity
                  key={appt.id}
                  style={styles.quickAddCard}
                  onPress={() => handleAddToGoogleCalendar(appt)}
                >
                  <View style={styles.quickAddLeft}>
                    <Text style={styles.quickAddDate}>
                      {new Date(appt.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </Text>
                    <Text style={styles.quickAddTime}>
                      {formatTimeDisplay(appt.startTime)} - {formatTimeDisplay(appt.endTime)}
                    </Text>
                  </View>
                  <View style={styles.quickAddRight}>
                    <Text style={styles.quickAddClient} numberOfLines={1}>{appt.clientName}</Text>
                    <Text style={styles.quickAddCoach} numberOfLines={1}>{appt.coachName}</Text>
                  </View>
                  <View style={styles.quickAddAction}>
                    <Ionicons name="logo-google" size={16} color="#4285F4" />
                  </View>
                </TouchableOpacity>
              ))}

              {exportableAppointments.length > 10 && (
                <Text style={styles.moreText}>
                  +{exportableAppointments.length - 10} more appointments
                </Text>
              )}
            </View>
          )}

          {/* ── EVENTS TAB ── */}
          {tab === 'events' && (
            <View style={styles.tabContent}>
              <Text style={styles.sectionTitle}>External Calendar Events</Text>
              <Text style={styles.sectionDesc}>
                Events imported from your connected calendars. These are used for conflict detection when scheduling new appointments.
              </Text>

              {syncing ? (
                <View style={styles.loadingState}>
                  <ActivityIndicator size="small" color={COLORS.accent} />
                  <Text style={styles.loadingText}>Syncing events...</Text>
                </View>
              ) : externalEvents.length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIcon}>
                    <Ionicons name="cloud-outline" size={36} color={COLORS.textMuted} />
                  </View>
                  <Text style={styles.emptyTitle}>No External Events</Text>
                  <Text style={styles.emptyDesc}>
                    {connections.length === 0
                      ? 'Connect a calendar first to import external events for conflict detection.'
                      : 'No events found in your connected calendars for the next 30 days. Try syncing your calendar.'}
                  </Text>
                  {connections.length > 0 && (
                    <TouchableOpacity
                      style={styles.syncAllBtn}
                      onPress={loadExternalEvents}
                    >
                      <Ionicons name="sync" size={16} color={COLORS.white} />
                      <Text style={styles.syncAllText}>Sync All Calendars</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <>
                  <View style={styles.eventsSummary}>
                    <Text style={styles.eventsSummaryText}>
                      {externalEvents.length} event{externalEvents.length !== 1 ? 's' : ''} from {connections.filter(c => c.sync_enabled).length} calendar{connections.filter(c => c.sync_enabled).length !== 1 ? 's' : ''}
                    </Text>
                    <TouchableOpacity onPress={loadExternalEvents} disabled={syncing}>
                      <Ionicons name="refresh" size={18} color={COLORS.accent} />
                    </TouchableOpacity>
                  </View>

                  {externalEvents.map(evt => {
                    const start = new Date(evt.start_time);
                    const end = new Date(evt.end_time);
                    const conn = connections.find(c => c.id === evt.connection_id);
                    const config = conn ? providerConfig[conn.provider] : providerConfig.google;

                    return (
                      <View key={evt.id} style={styles.eventCard}>
                        <View style={[styles.eventDot, { backgroundColor: config.color }]} />
                        <View style={styles.eventInfo}>
                          <Text style={styles.eventTitle} numberOfLines={1}>{evt.title}</Text>
                          <Text style={styles.eventTime}>
                            {start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                            {' '}
                            {evt.all_day ? 'All Day' : `${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} - ${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
                          </Text>
                          {evt.location && (
                            <Text style={styles.eventLocation} numberOfLines={1}>
                              <Ionicons name="location-outline" size={10} color={COLORS.textMuted} /> {evt.location}
                            </Text>
                          )}
                        </View>
                        <View style={[styles.eventProviderBadge, { backgroundColor: config.bgColor }]}>
                          <Ionicons name={config.icon} size={12} color={config.color} />
                        </View>
                      </View>
                    );
                  })}
                </>
              )}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTitle: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.primary },
  tabBar: {
    flexDirection: 'row', backgroundColor: COLORS.white, borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight, paddingHorizontal: SPACING.md,
  },
  tabItem: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: SPACING.md, borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabItemActive: { borderBottomColor: COLORS.accent },
  tabLabel: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.textMuted },
  tabLabelActive: { color: COLORS.accent },
  scroll: { flex: 1 },
  tabContent: { padding: SPACING.lg },
  sectionTitle: { fontSize: FONT_SIZES.xl, fontWeight: '800', color: COLORS.primary, marginBottom: 4 },
  sectionDesc: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, marginBottom: SPACING.lg, lineHeight: 20 },

  // Empty State
  emptyState: { alignItems: 'center', paddingVertical: SPACING.xxxl, gap: SPACING.sm },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.borderLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm,
  },
  emptyTitle: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.primary },
  emptyDesc: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, textAlign: 'center', maxWidth: 280, lineHeight: 20 },

  // Connection Card
  connectionCard: {
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg,
    marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.borderLight, ...SHADOWS.sm,
  },
  connectionHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  providerIcon: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
  },
  connectionInfo: { flex: 1 },
  connectionName: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.primary },
  connectionEmail: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, marginTop: 2 },
  connectionMeta: {
    flexDirection: 'row', gap: SPACING.lg, marginTop: SPACING.md, paddingTop: SPACING.sm,
    borderTopWidth: 1, borderTopColor: COLORS.borderLight,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '500' },
  connectionActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  syncNowBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: SPACING.sm + 2, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.accent,
  },
  syncNowText: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.accent },
  disconnectBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm + 2, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.danger + '40',
  },
  disconnectText: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.danger },

  // Add Calendar Button
  addCalendarBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    paddingVertical: SPACING.lg, borderWidth: 2, borderColor: COLORS.accent + '30',
    borderStyle: 'dashed', borderRadius: BORDER_RADIUS.lg, marginTop: SPACING.md,
  },
  addCalendarText: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.accent },

  // Connect Form
  connectForm: {
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg,
    marginTop: SPACING.md, borderWidth: 1, borderColor: COLORS.accent + '20', ...SHADOWS.md,
  },
  formTitle: { fontSize: FONT_SIZES.lg, fontWeight: '800', color: COLORS.primary, marginBottom: SPACING.lg },
  formLabel: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.primary, marginBottom: SPACING.sm, marginTop: SPACING.md },
  formInput: {
    backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md, borderWidth: 1,
    borderColor: COLORS.border, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm + 2,
    fontSize: FONT_SIZES.md, color: COLORS.primary,
  },
  providerGrid: { flexDirection: 'row', gap: SPACING.sm },
  providerOption: {
    flex: 1, alignItems: 'center', paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.borderLight, backgroundColor: COLORS.white, gap: 6,
  },
  providerOptionName: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.textSecondary },
  providerCheck: {
    position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  directionGrid: { gap: SPACING.sm },
  directionOption: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    padding: SPACING.md, borderRadius: BORDER_RADIUS.md, borderWidth: 1.5,
    borderColor: COLORS.borderLight, backgroundColor: COLORS.white,
  },
  directionOptionActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accent + '06' },
  directionLabel: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.primary, flex: 1 },
  directionDesc: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted },
  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm,
    backgroundColor: COLORS.accent + '08', padding: SPACING.md, borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.lg, borderWidth: 1, borderColor: COLORS.accent + '15',
  },
  infoBannerText: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, flex: 1, lineHeight: 18 },
  formActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.lg },
  formCancelBtn: {
    flex: 1, alignItems: 'center', paddingVertical: SPACING.sm + 4, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.border,
  },
  formCancelText: { fontSize: FONT_SIZES.md, fontWeight: '600', color: COLORS.textSecondary },
  formSaveBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: COLORS.accent, paddingVertical: SPACING.sm + 4, borderRadius: BORDER_RADIUS.md,
  },
  formSaveText: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.white },

  // Export Tab
  rangeGrid: { flexDirection: 'row', gap: SPACING.sm },
  rangeOption: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: SPACING.sm + 2, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.borderLight, backgroundColor: COLORS.white,
  },
  rangeOptionActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  rangeLabel: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.textSecondary },
  rangeLabelActive: { color: COLORS.white },
  exportSummary: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg,
    marginTop: SPACING.lg, borderWidth: 1, borderColor: COLORS.borderLight, ...SHADOWS.sm,
  },
  exportSummaryIcon: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.accent + '12',
    alignItems: 'center', justifyContent: 'center',
  },
  exportSummaryInfo: { flex: 1 },
  exportSummaryCount: { fontSize: FONT_SIZES.xxl, fontWeight: '800', color: COLORS.primary },
  exportSummaryLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '500' },
  exportCoachBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.accent + '10', paddingHorizontal: SPACING.sm, paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
  },
  exportCoachName: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.accent },
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.accent,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg, gap: SPACING.md,
    marginTop: SPACING.lg, ...SHADOWS.md,
  },
  exportBtnIcon: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  exportBtnContent: { flex: 1 },
  exportBtnTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.white },
  exportBtnDesc: { fontSize: FONT_SIZES.xs, color: 'rgba(255,255,255,0.75)', marginTop: 2 },

  // Quick Add
  quickAddCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.borderLight, gap: SPACING.md,
  },
  quickAddLeft: { width: 90 },
  quickAddDate: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.primary },
  quickAddTime: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
  quickAddRight: { flex: 1 },
  quickAddClient: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.primary },
  quickAddCoach: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, marginTop: 1 },
  quickAddAction: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#4285F410',
    alignItems: 'center', justifyContent: 'center',
  },
  moreText: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, textAlign: 'center', marginTop: SPACING.sm, fontWeight: '600' },

  // Events Tab
  loadingState: { alignItems: 'center', paddingVertical: SPACING.xxxl, gap: SPACING.sm },
  loadingText: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted },
  eventsSummary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  eventsSummaryText: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.textSecondary },
  syncAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm + 2, borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.md,
  },
  syncAllText: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.white },
  eventCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, padding: SPACING.md,
    marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.borderLight,
  },
  eventDot: { width: 4, height: 36, borderRadius: 2 },
  eventInfo: { flex: 1 },
  eventTitle: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.primary },
  eventTime: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, marginTop: 2 },
  eventLocation: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
  eventProviderBadge: {
    width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
});
