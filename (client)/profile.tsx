import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, RefreshControl, Linking } from 'react-native';

import { useRouter } from 'expo-router';
import { usePlatformAlert } from '../lib/platformAlert';

import { Ionicons } from '@expo/vector-icons';

import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../constants/theme';
import { getProgramDefinition } from '../data/scheduleData';

import ClientHeader from '../components/client/ClientHeader';
import MyFitnessPalCard from '../components/client/MyFitnessPalCard';
import NutritionStyleCard from '../components/client/NutritionStyleCard';
import NotificationPreferencesModal from '../components/client/NotificationPreferencesModal';
import ProgramHistoryPanel from '../components/client/ProgramHistoryPanel';




import { useAuth } from '../contexts/AuthContext';

import type { BiometricEntry, SessionRecord, FoodEntry } from '../data/clientPortalData';
import { fetchBiometrics, fetchSessions, fetchFoodEntriesRange } from '../lib/clientDataService';
import {
  generateCSV,
  downloadCSV,
  generatePDFHTML,
  openPDFInNewWindow,
} from '../lib/biometricExportService';
import { openAddressInMaps } from '../lib/openMaps';


// Helper to categorize food names for the top foods display
function categorizeFood(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('chicken') || n.includes('salmon') || n.includes('beef') || n.includes('turkey') ||
      n.includes('tuna') || n.includes('shrimp') || n.includes('egg') || n.includes('steak')) return 'Protein';
  if (n.includes('rice') || n.includes('toast') || n.includes('oat') || n.includes('potato') ||
      n.includes('quinoa') || n.includes('pancake') || n.includes('bread') || n.includes('pasta')) return 'Carbs';
  if (n.includes('shake') || n.includes('protein bar') || n.includes('whey') ||
      n.includes('supplement') || n.includes('creatine')) return 'Supplement';
  if (n.includes('salad') || n.includes('broccoli') || n.includes('spinach') ||
      n.includes('veggie') || n.includes('avocado') || n.includes('fruit')) return 'Veggies';
  if (n.includes('yogurt') || n.includes('cottage') || n.includes('cheese') ||
      n.includes('milk')) return 'Dairy';
  if (n.includes('almond') || n.includes('peanut') || n.includes('nut') ||
      n.includes('seed')) return 'Fats';
  return 'Other';
}

// Default metrics for export
const DEFAULT_EXPORT_METRICS = ['weight', 'bodyFat', 'muscleMass', 'heartRate', 'bloodPressureSys', 'bloodPressureDia'];


export default function ClientProfile() {
  const { profile, signOut, user } = useAuth();
  const router = useRouter();
  const { platformAlert } = usePlatformAlert();
  const displayName = profile?.full_name || 'Client';
  const progDef = profile?.program ? getProgramDefinition(profile.program) : null;



  const [biometricHistory, setBiometricHistory] = useState<BiometricEntry[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [foodEntries, setFoodEntries] = useState<FoodEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Nutrition style preferences (local state, could be persisted)
  const [dietStyle, setDietStyle] = useState('high-protein');
  const [loggingMethods, setLoggingMethods] = useState(['manual', 'photo']);
  const [showNotificationPrefs, setShowNotificationPrefs] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);


  // Export state
  const [exporting, setExporting] = useState<'pdf' | 'csv' | null>(null);
  const [exportMessage, setExportMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // Handler for Account settings rows
  const handleSettingsPress = useCallback((label: string) => {
    switch (label) {
      case 'Notifications':
        setShowNotificationPrefs(true);
        break;


      case 'Change Password':
        platformAlert(
          'Change Password',
          'A password reset link will be sent to your email address.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Send Reset Link',
              onPress: () => {
                platformAlert('Email Sent', 'Check your inbox for the password reset link.');
              },
            },
          ]
        );
        break;
      case 'Billing & Payments':
        platformAlert(
          'Billing & Payments',
          'Your membership is managed through your franchise location. Contact your trainer or franchise for billing inquiries.'
        );
        break;
      case 'Help & Support':
        platformAlert(
          'Help & Support',
          'How would you like to get help?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Email Support',
              onPress: () => Linking.openURL('mailto:support@electwellness.com'),
            },
            {
              text: 'Visit FAQ',
              onPress: () => Linking.openURL('https://electwellness.com/faq'),
            },
          ]
        );
        break;
      case 'Terms & Privacy':
        platformAlert(
          'Terms & Privacy',
          'View our legal documents:',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Terms of Service',
              onPress: () => Linking.openURL('https://electwellness.com/terms'),
            },
            {
              text: 'Privacy Policy',
              onPress: () => Linking.openURL('https://electwellness.com/privacy'),
            },
          ]
        );
        break;
      default:
        break;
    }
  }, [platformAlert]);



  const loadData = useCallback(async () => {
    if (!user?.id) return;
    try {
      // Fetch last 60 days of food entries for nutrition stats
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      const startDate = sixtyDaysAgo.toISOString().split('T')[0];
      const endDate = new Date().toISOString().split('T')[0];

      const [bioData, sessData, foodData] = await Promise.all([
        fetchBiometrics(user.id),
        fetchSessions(user.id),
        fetchFoodEntriesRange(user.id, startDate, endDate),
      ]);
      setBiometricHistory(bioData);
      setSessions(sessData);
      setFoodEntries(foodData);
    } catch (err) {
      console.error('Error loading profile data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  // ── Export handlers ──
  const handleExportCSV = useCallback(async () => {
    if (biometricHistory.length === 0) {
      setExportMessage({ text: 'No biometric data to export.', isError: true });
      return;
    }
    setExporting('csv');
    setExportMessage(null);
    try {
      await new Promise(r => setTimeout(r, 300));
      const csv = generateCSV(biometricHistory, displayName);
      const filename = `biometrics_${displayName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
      downloadCSV(csv, filename);
      setExportMessage({ text: 'CSV downloaded successfully!', isError: false });
    } catch (err) {
      console.error('CSV export error:', err);
      setExportMessage({ text: 'Export failed. Please try again.', isError: true });
    } finally {
      setExporting(null);
    }
  }, [biometricHistory, displayName]);

  const handleExportPDF = useCallback(async () => {
    if (biometricHistory.length === 0) {
      setExportMessage({ text: 'No biometric data to export.', isError: true });
      return;
    }
    setExporting('pdf');
    setExportMessage(null);
    try {
      await new Promise(r => setTimeout(r, 300));
      const html = generatePDFHTML({
        clientName: displayName,
        selectedMetrics: DEFAULT_EXPORT_METRICS,
        data: biometricHistory,
      });
      openPDFInNewWindow(html);
      setExportMessage({ text: 'PDF report opened in new tab!', isError: false });
    } catch (err) {
      console.error('PDF export error:', err);
      setExportMessage({ text: 'Export failed. Please try again.', isError: true });
    } finally {
      setExporting(null);
    }
  }, [biometricHistory, displayName]);

  // ── Compute nutrition stats from food entries ──
  const nutritionStats = useMemo(() => {
    const totalEntries = foodEntries.length;

    // Unique days logged
    const uniqueDays = new Set(foodEntries.map(e => e.date));
    const daysLogged = uniqueDays.size;

    // Calculate streak (consecutive days ending today or yesterday)
    const today = new Date();
    let streak = 0;
    const dateSet = new Set(foodEntries.map(e => e.date));
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      if (dateSet.has(ds)) {
        streak++;
      } else if (i > 0) {
        break; // allow today to not be logged yet
      }
    }

    // Average daily calories and protein
    const dailyTotals: Record<string, { calories: number; protein: number }> = {};
    for (const entry of foodEntries) {
      if (!dailyTotals[entry.date]) {
        dailyTotals[entry.date] = { calories: 0, protein: 0 };
      }
      dailyTotals[entry.date].calories += entry.calories;
      dailyTotals[entry.date].protein += entry.protein;
    }
    const dayValues = Object.values(dailyTotals);
    const avgDailyCalories = dayValues.length > 0
      ? Math.round(dayValues.reduce((s, d) => s + d.calories, 0) / dayValues.length)
      : 0;
    const avgDailyProtein = dayValues.length > 0
      ? Math.round(dayValues.reduce((s, d) => s + d.protein, 0) / dayValues.length)
      : 0;

    // Top foods by frequency
    const foodCounts: Record<string, { count: number; totalCal: number; name: string }> = {};
    for (const entry of foodEntries) {
      const key = entry.name.toLowerCase();
      if (!foodCounts[key]) {
        foodCounts[key] = { count: 0, totalCal: 0, name: entry.name };
      }
      foodCounts[key].count++;
      foodCounts[key].totalCal += entry.calories;
    }
    const topFoods = Object.values(foodCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(f => ({
        name: f.name,
        count: f.count,
        avgCalories: Math.round(f.totalCal / f.count),
        category: categorizeFood(f.name),
      }));

    return { totalEntries, daysLogged, streak, avgDailyCalories, avgDailyProtein, topFoods };
  }, [foodEntries]);



  const latest = biometricHistory.length > 0 ? biometricHistory[biometricHistory.length - 1] : null;
  const first = biometricHistory.length > 0 ? biometricHistory[0] : null;
  const completedSessions = sessions.filter(s => s.status === 'completed');

  const achievements = [];
  if (completedSessions.length >= 1) {
    achievements.push({ icon: 'trophy', color: '#f39c12', title: 'First Session', date: completedSessions.length > 0 ? completedSessions[completedSessions.length - 1].date.substring(0, 7).replace('-', ' ') : '' });
  }
  if (completedSessions.length >= 10) {
    achievements.push({ icon: 'flame', color: '#e74c3c', title: '10 Sessions Done', date: '' });
  }
  if (first && latest && (first.weight - latest.weight) >= 10) {
    achievements.push({ icon: 'scale-outline', color: '#2ecc71', title: '10 lbs Lost', date: '' });
  }
  if (completedSessions.length >= 50) {
    achievements.push({ icon: 'barbell-outline', color: '#3498db', title: '50 Sessions Done', date: '' });
  }
  if (latest && latest.bloodPressureSys <= 120) {
    achievements.push({ icon: 'heart', color: '#e74c3c', title: 'BP in Normal Range', date: '' });
  }
  if (first && latest && (first.weight - latest.weight) >= 20) {
    achievements.push({ icon: 'ribbon', color: '#9b59b6', title: '20 lbs Lost', date: '' });
  }
  // Always show at least a few
  if (achievements.length === 0) {
    achievements.push(
      { icon: 'star-outline', color: '#f39c12', title: 'Getting Started', date: 'Keep going!' },
      { icon: 'fitness-outline', color: '#3498db', title: 'First Steps', date: 'Log your data' },
    );
  }

  const goals = first && latest ? [
    { label: 'Target Weight', current: latest.weight, target: 185, unit: 'lbs', progress: ((first.weight - latest.weight) / (first.weight - 185)) * 100 },
    { label: 'Body Fat Goal', current: latest.bodyFat, target: 15, unit: '%', progress: ((first.bodyFat - latest.bodyFat) / (first.bodyFat - 15)) * 100 },

  ] : [];

  // Date range text for export
  const dateRangeText = first && latest
    ? `${new Date(first.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - ${new Date(latest.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : 'No data';

  return (
    <View style={styles.container}>
      <ClientHeader title="My Profile" subtitle="Account & Goals" />
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#9b59b6" />
        }
      >
        {/* Profile Card */}

        <View style={styles.profileCard}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarLargeText}>{displayName.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.profileName}>{displayName}</Text>
          <Text style={styles.profileEmail}>{profile?.email || 'client@fitpro.com'}</Text>


          {/* Address - always shown prominently when available */}
          {profile?.address && (
            <TouchableOpacity
              style={styles.addressRow}
              onPress={() => openAddressInMaps(profile.address!)}
              activeOpacity={0.6}
            >
              <Ionicons name="location" size={14} color={COLORS.accent} />
              <Text style={styles.addressText} numberOfLines={2}>
                {profile.address}
              </Text>
              <Ionicons name="open-outline" size={12} color={COLORS.accent} style={{ marginLeft: 2 }} />
            </TouchableOpacity>
          )}


          {/* Extra profile info — phone only (occupation hidden from client view) */}
          {profile?.phone && (
            <View style={styles.profileExtraInfo}>
              <View style={styles.profileExtraRow}>
                <Ionicons name="call-outline" size={12} color={COLORS.textMuted} />
                <Text style={styles.profileExtraText}>{profile.phone}</Text>
              </View>
            </View>
          )}


          <View style={styles.profileTags}>
            {profile?.program ? (
              <View style={[styles.profileTag, { backgroundColor: (progDef?.color || '#9b59b6') + '15' }]}>
                <Ionicons name="barbell" size={12} color={progDef?.color || '#9b59b6'} />
                <Text style={[styles.profileTagText, { color: progDef?.color || '#9b59b6' }]}>{profile.program}</Text>
              </View>
            ) : (
              <View style={[styles.profileTag, { backgroundColor: '#9b59b615' }]}>
                <Ionicons name="shield-checkmark" size={12} color="#9b59b6" />
                <Text style={[styles.profileTagText, { color: '#9b59b6' }]}>Member</Text>
              </View>
            )}
            {profile?.program_start_date && (
              <View style={[styles.profileTag, { backgroundColor: '#2ecc7115' }]}>
                <Ionicons name="calendar" size={12} color="#2ecc71" />
                <Text style={[styles.profileTagText, { color: '#2ecc71' }]}>
                  Since {(() => {
                    try {
                      const d = new Date(profile.program_start_date + 'T12:00:00');
                      return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                    } catch { return profile.program_start_date; }
                  })()}
                </Text>
              </View>
            )}
            {profile?.program_status === 'active' && (
              <View style={[styles.profileTag, { backgroundColor: '#2ecc7115' }]}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#2ecc71' }} />
                <Text style={[styles.profileTagText, { color: '#2ecc71' }]}>Active</Text>
              </View>
            )}
            {profile?.program_status === 'stopped' && (
              <View style={[styles.profileTag, { backgroundColor: COLORS.textMuted + '15' }]}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.textMuted }} />
                <Text style={[styles.profileTagText, { color: COLORS.textMuted }]}>Inactive</Text>
              </View>
            )}
            {profile?.in_facebook_group && (
              <View style={[styles.profileTag, { backgroundColor: '#3b599815' }]}>
                <Ionicons name="logo-facebook" size={12} color="#3b5998" />
                <Text style={[styles.profileTagText, { color: '#3b5998' }]}>FB Group</Text>
              </View>
            )}
          </View>

          {/* Stats summary */}
          <View style={styles.profileStats}>
            <View style={styles.profileStatItem}>
              <Text style={styles.profileStatValue}>{completedSessions.length}</Text>
              <Text style={styles.profileStatLabel}>Sessions</Text>
            </View>
            <View style={styles.profileStatDivider} />
            <View style={styles.profileStatItem}>
              <Text style={styles.profileStatValue}>{biometricHistory.length}</Text>
              <Text style={styles.profileStatLabel}>Measurements</Text>
            </View>
            <View style={styles.profileStatDivider} />
            <View style={styles.profileStatItem}>
              <Text style={styles.profileStatValue}>
                {first && latest ? `${(first.weight - latest.weight).toFixed(1)}` : '--'}

              </Text>
              <Text style={styles.profileStatLabel}>lbs Lost</Text>
            </View>
          </View>
        </View>


        {/* Trainer & Dietitian Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My Team</Text>
          {/* Trainer */}
          <View style={styles.trainerCard}>
            <View style={[styles.trainerAvatar, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#2ecc7130' }]}>
              <Ionicons name="fitness" size={24} color="#2ecc71" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.trainerName}>{profile?.primary_trainer || 'Not assigned'}</Text>
              <Text style={styles.trainerFranchise}>{profile?.franchise || 'Unknown'}</Text>
              <View style={styles.trainerSpecialties}>
                <View style={styles.specialtyTag}>
                  <Text style={styles.specialtyText}>Trainer</Text>
                </View>
              </View>
            </View>
          </View>
          {/* Dietitian */}
          <View style={[styles.trainerCard, { marginTop: SPACING.sm }]}>
            <View style={[styles.trainerAvatar, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#9b59b630' }]}>
              <Ionicons name="nutrition" size={24} color="#9b59b6" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.trainerName}>{profile?.primary_dietitian || 'Not assigned'}</Text>
              <Text style={styles.trainerFranchise}>{profile?.franchise || 'Unknown'}</Text>
              <View style={styles.trainerSpecialties}>
                <View style={styles.specialtyTag}>
                  <Text style={styles.specialtyText}>Dietitian</Text>
                </View>
              </View>
            </View>
          </View>
        </View>


        {/* My Program - with start/end dates and history */}

        {user?.id && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>My Program</Text>
            <ProgramHistoryPanel
              userId={user.id}
              currentProgram={profile?.program || null}
              programStartDate={profile?.program_start_date || null}
              programStopDate={profile?.program_stop_date || null}
              programStatus={profile?.program_status || null}
              compact
            />
          </View>
        )}



        {/* Goals Progress */}
        {goals.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>My Goals</Text>
            {goals.map((goal, i) => (
              <View key={i} style={styles.goalCard}>
                <View style={styles.goalHeader}>
                  <Text style={styles.goalLabel}>{goal.label}</Text>
                  <Text style={styles.goalValues}>
                    {goal.current} {goal.unit} / {goal.target} {goal.unit}
                  </Text>
                </View>
                <View style={styles.goalBar}>
                  <View style={[styles.goalFill, { width: `${Math.min(Math.max(goal.progress, 0), 100)}%` }]} />
                </View>
                <Text style={styles.goalProgress}>
                  {Math.round(Math.min(Math.max(goal.progress, 0), 100))}% complete
                </Text>
              </View>
            ))}
          </View>
        )}

        {loading && (
          <View style={{ alignItems: 'center', paddingVertical: SPACING.lg }}>
            <ActivityIndicator size="small" color="#9b59b6" />
            <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 4 }}>Loading goals...</Text>
          </View>
        )}

        {/* Achievements */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Achievements</Text>
          <View style={styles.achievementGrid}>
            {achievements.map((ach, i) => (
              <View key={i} style={styles.achievementCard}>
                <View style={[styles.achievementIcon, { backgroundColor: ach.color + '15' }]}>
                  <Ionicons name={ach.icon as any} size={22} color={ach.color} />
                </View>
                <Text style={styles.achievementTitle} numberOfLines={2}>{ach.title}</Text>
                <Text style={styles.achievementDate}>{ach.date}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Nutrition Logging Style */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Nutrition Logging Style</Text>
          <NutritionStyleCard
            totalEntries={nutritionStats.totalEntries}
            daysLogged={nutritionStats.daysLogged}
            streak={nutritionStats.streak}
            avgDailyCalories={nutritionStats.avgDailyCalories}
            avgDailyProtein={nutritionStats.avgDailyProtein}
            topFoods={nutritionStats.topFoods.length > 0 ? nutritionStats.topFoods : undefined}
            selectedDietStyle={dietStyle}
            preferredMethods={loggingMethods}
            onDietStyleChange={setDietStyle}
            onLoggingMethodsChange={setLoggingMethods}
          />
        </View>

        {/* MyFitnessPal Integration */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Integrations</Text>
          <MyFitnessPalCard />
        </View>

        {/* ============================================================ */}
        {/* EXPORT BIOMETRICS SECTION */}
        {/* ============================================================ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Export Biometrics</Text>
          <View style={styles.exportCard}>
            {/* Header with icon */}
            <View style={styles.exportHeader}>
              <View style={styles.exportIconBg}>
                <Ionicons name="download-outline" size={22} color={COLORS.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.exportHeaderTitle}>Download Your Data</Text>
                <Text style={styles.exportHeaderSubtitle}>
                  Export your biometric measurements as a report or raw data file
                </Text>
              </View>
            </View>

            {/* Data summary */}
            <View style={styles.exportDataSummary}>
              <View style={styles.exportDataItem}>
                <Ionicons name="analytics-outline" size={14} color="#9b59b6" />
                <Text style={styles.exportDataText}>
                  {biometricHistory.length} measurement{biometricHistory.length !== 1 ? 's' : ''}
                </Text>
              </View>
              <View style={styles.exportDataDot} />
              <View style={styles.exportDataItem}>
                <Ionicons name="calendar-outline" size={14} color="#9b59b6" />
                <Text style={styles.exportDataText}>{dateRangeText}</Text>
              </View>
            </View>

            {/* Export buttons */}
            <View style={styles.exportButtonsRow}>
              <TouchableOpacity
                style={styles.exportBtn}
                onPress={handleExportPDF}
                activeOpacity={0.7}
                disabled={exporting !== null}
              >
                {exporting === 'pdf' ? (
                  <ActivityIndicator size="small" color={COLORS.accent} />
                ) : (
                  <View style={[styles.exportBtnIcon, { backgroundColor: COLORS.accent + '15' }]}>
                    <Ionicons name="document-text-outline" size={20} color={COLORS.accent} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.exportBtnTitle}>PDF Report</Text>
                  <Text style={styles.exportBtnSubtitle}>Charts & summary</Text>
                </View>
                <Ionicons name="open-outline" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.exportBtn}
                onPress={handleExportCSV}
                activeOpacity={0.7}
                disabled={exporting !== null}
              >
                {exporting === 'csv' ? (
                  <ActivityIndicator size="small" color="#2ecc71" />
                ) : (
                  <View style={[styles.exportBtnIcon, { backgroundColor: '#2ecc7115' }]}>
                    <Ionicons name="grid-outline" size={20} color="#2ecc71" />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.exportBtnTitle}>CSV Data</Text>
                  <Text style={styles.exportBtnSubtitle}>Excel / Google Sheets</Text>
                </View>
                <Ionicons name="download-outline" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Export success/error message */}
            {exportMessage && (
              <View style={[
                styles.exportMessageBanner,
                { backgroundColor: exportMessage.isError ? '#e74c3c10' : '#2ecc7110' },
              ]}>
                <Ionicons
                  name={exportMessage.isError ? 'alert-circle' : 'checkmark-circle'}
                  size={16}
                  color={exportMessage.isError ? '#e74c3c' : '#2ecc71'}
                />
                <Text style={[
                  styles.exportMessageText,
                  { color: exportMessage.isError ? '#e74c3c' : '#2ecc71' },
                ]}>
                  {exportMessage.text}
                </Text>
              </View>
            )}

            {/* Included metrics info */}
            <View style={styles.exportMetricsInfo}>
              <Ionicons name="information-circle-outline" size={14} color={COLORS.textMuted} />
              <Text style={styles.exportMetricsInfoText}>
                Exports include: Weight, Body Fat, Muscle Mass, Blood Pressure, Heart Rate, all body measurements, and more.
                For advanced export options, visit the Trends tab in Biometrics.

              </Text>
            </View>
          </View>
        </View>

        {/* Account Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.settingsCard}>
            {[
              { icon: 'notifications-outline', label: 'Notifications', color: '#f39c12' },
              { icon: 'lock-closed-outline', label: 'Change Password', color: '#9b59b6' },
              { icon: 'document-text-outline', label: 'Billing & Payments', color: '#2ecc71' },
              { icon: 'help-circle-outline', label: 'Help & Support', color: '#1abc9c' },
              { icon: 'information-circle-outline', label: 'Terms & Privacy', color: COLORS.textMuted },
            ].map((item, i) => (
              <TouchableOpacity
                key={i}
                style={styles.settingsRow}
                onPress={() => handleSettingsPress(item.label)}
                activeOpacity={0.6}
              >
                <View style={[styles.settingsIcon, { backgroundColor: item.color + '15' }]}>
                  <Ionicons name={item.icon as any} size={18} color={item.color} />
                </View>
                <Text style={styles.settingsLabel}>{item.label}</Text>
                {item.label === 'Notifications' && (
                  <View style={[
                    styles.notifBadge,
                    { backgroundColor: notificationsEnabled ? COLORS.success + '20' : COLORS.textMuted + '20' },
                  ]}>
                    <Text style={[
                      styles.notifBadgeText,
                      { color: notificationsEnabled ? COLORS.success : COLORS.textMuted },
                    ]}>
                      {notificationsEnabled ? 'On' : 'Off'}
                    </Text>
                  </View>
                )}
                <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Data Info */}
        <View style={styles.dataInfoCard}>
          <Ionicons name="server-outline" size={16} color="#3498db" />
          <View style={{ flex: 1 }}>
            <Text style={styles.dataInfoTitle}>Your Data is Synced</Text>
            <Text style={styles.dataInfoText}>
              All your biometrics, sessions, and food journal entries are securely stored in the cloud and synced across devices.
            </Text>
          </View>
        </View>

        {/* Sign Out */}
        <TouchableOpacity style={styles.signOutBtn} onPress={async () => { await signOut(); }}>
          <Ionicons name="log-out-outline" size={18} color={COLORS.danger} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* Notification Preferences Modal */}
      <NotificationPreferencesModal
        visible={showNotificationPrefs}
        onClose={() => setShowNotificationPrefs(false)}
      />
    </View>
  );
}






const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  // Profile Card
  profileCard: {
    backgroundColor: COLORS.white,
    margin: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xxl,
    alignItems: 'center',
    ...SHADOWS.md,
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#9b59b6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
    borderWidth: 3,
    borderColor: '#9b59b640',
  },
  avatarLargeText: {
    fontSize: FONT_SIZES.hero,
    fontWeight: '800',
    color: COLORS.white,
  },
  profileName: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '800',
    color: COLORS.text,
  },
  profileEmail: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  // Address row (clickable, opens Google Maps)
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: SPACING.sm,
    backgroundColor: COLORS.accent + '08',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.accent + '20',
    maxWidth: '100%',
  },
  addressText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.accent,
    textDecorationLine: 'underline',
    flex: 1,
  },
  profileExtraInfo: {

    marginTop: SPACING.sm,
    gap: 4,
    alignItems: 'center',
  },
  profileExtraRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  profileExtraText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  profileTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },

  profileTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
  },
  profileTagText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
  },
  profileStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.lg,
    paddingTop: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    width: '100%',
    justifyContent: 'space-around',
  },
  profileStatItem: {
    alignItems: 'center',
  },
  profileStatValue: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '800',
    color: COLORS.text,
  },
  profileStatLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
    marginTop: 2,
  },
  profileStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: COLORS.border,
  },
  // Section
  section: {
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  // Trainer
  trainerCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    gap: SPACING.md,
    ...SHADOWS.sm,
  },
  trainerAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.border,
  },
  trainerName: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.text,
  },
  trainerFranchise: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  trainerSpecialties: {
    flexDirection: 'row',
    gap: 4,
    marginTop: SPACING.sm,
  },
  specialtyTag: {
    backgroundColor: COLORS.background,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  specialtyText: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  trainerRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: '#f39c12',
  },
  // Goals
  goalCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  goalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  goalLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.text,
  },
  goalValues: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  goalBar: {
    height: 8,
    backgroundColor: COLORS.borderLight,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  goalFill: {
    height: '100%',
    backgroundColor: '#9b59b6',
    borderRadius: 4,
  },
  goalProgress: {
    fontSize: FONT_SIZES.xs,
    color: '#9b59b6',
    fontWeight: '700',
  },
  // Achievements
  achievementGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  achievementCard: {
    width: '31%',
    flexGrow: 1,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    ...SHADOWS.sm,
  },
  achievementIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  achievementTitle: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 16,
  },
  achievementDate: {
    fontSize: 9,
    color: COLORS.textMuted,
    marginTop: 4,
  },

  // ============================================================
  // EXPORT BIOMETRICS STYLES
  // ============================================================
  exportCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  exportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  exportIconBg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.accent + '12',
    justifyContent: 'center',
    alignItems: 'center',
  },
  exportHeaderTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: COLORS.primary,
  },
  exportHeaderSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
    lineHeight: 16,
  },
  exportDataSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.background,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.md,
  },
  exportDataItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  exportDataText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: '#9b59b6',
  },
  exportDataDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: COLORS.textMuted,
  },
  exportButtonsRow: {
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.background,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  exportBtnIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  exportBtnTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.text,
  },
  exportBtnSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  exportMessageBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
  },
  exportMessageText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    flex: 1,
  },
  exportMetricsInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  exportMetricsInfoText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    flex: 1,
    lineHeight: 16,
  },

  // Data Info
  dataInfoCard: {
    flexDirection: 'row',
    backgroundColor: '#3498db08',
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.md,
    borderWidth: 1,
    borderColor: '#3498db20',
  },
  dataInfoTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: '#3498db',
    marginBottom: 2,
  },
  dataInfoText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  // Settings
  settingsCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    gap: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  settingsIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsLabel: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.text,
  },
  notifBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },
  notifBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
  },
  // Sign Out

  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
    paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#e74c3c30',
    ...SHADOWS.sm,
  },
  signOutText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.danger,
  },
});
