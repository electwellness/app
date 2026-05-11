import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import {
  fetchMFPDiary, fetchMFPWeeklySummary, syncMFPToJournal,
  MFP_BRAND, formatMFPSyncTime, getMFPConnection,
  type MFPDailySummary, type MFPWeeklySummary, type MFPDiaryEntry, type MFPConnection,
} from '../../lib/myfitnesspalService';

interface MFPSyncModalProps {
  visible: boolean;
  onClose: () => void;
  onImport: (entries: Array<{
    meal: 'breakfast' | 'lunch' | 'dinner' | 'snack';
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    sugar: number;
    sodium: number;
    servingSize: string;
  }>) => void;
}

export default function MFPSyncModal({ visible, onClose, onImport }: MFPSyncModalProps) {
  const [tab, setTab] = useState<'today' | 'weekly'>('today');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [diary, setDiary] = useState<MFPDailySummary | null>(null);
  const [weekly, setWeekly] = useState<MFPWeeklySummary | null>(null);
  const [connection, setConnection] = useState<MFPConnection | null>(null);
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());
  const [expandedMeal, setExpandedMeal] = useState<string | null>('breakfast');

  const today = new Date().toISOString().split('T')[0];

  const loadData = useCallback(async () => {
    setLoading(true);
    const conn = await getMFPConnection();
    setConnection(conn);

    const [diaryResult, weeklyResult] = await Promise.all([
      fetchMFPDiary(today),
      fetchMFPWeeklySummary(),
    ]);

    if (diaryResult.data) {
      setDiary(diaryResult.data);
      // Pre-select all entries
      const allIds = new Set(diaryResult.data.entries.map(e => e.id));
      setSelectedEntries(allIds);
    }
    if (weeklyResult.data) setWeekly(weeklyResult.data);
    setLoading(false);
  }, [today]);

  useEffect(() => {
    if (visible) loadData();
  }, [visible, loadData]);

  const toggleEntry = (id: string) => {
    setSelectedEntries(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllMeal = (meal: string) => {
    if (!diary) return;
    const mealEntries = diary.entries.filter(e => e.meal === meal);
    const allSelected = mealEntries.every(e => selectedEntries.has(e.id));

    setSelectedEntries(prev => {
      const next = new Set(prev);
      mealEntries.forEach(e => {
        if (allSelected) next.delete(e.id);
        else next.add(e.id);
      });
      return next;
    });
  };

  const handleImport = () => {
    if (!diary || selectedEntries.size === 0) return;

    const entriesToImport = diary.entries
      .filter(e => selectedEntries.has(e.id))
      .map(e => ({
        meal: e.meal,
        name: e.brand ? `${e.name} (${e.brand})` : e.name,
        calories: e.calories,
        protein: e.protein,
        carbs: e.carbs,
        fat: e.fat,
        fiber: e.fiber,
        sugar: e.sugar,
        sodium: e.sodium,
        servingSize: e.servingSize,
      }));

    onImport(entriesToImport);
    Alert.alert(
      'Import Complete',
      `${entriesToImport.length} entries imported from MyFitnessPal to your food journal.`,
      [{ text: 'OK', onPress: onClose }]
    );
  };

  const handleFullSync = async () => {
    setSyncing(true);
    const result = await syncMFPToJournal(today);
    setSyncing(false);

    if (result.error) {
      Alert.alert('Sync Error', result.error);
    } else {
      Alert.alert('Sync Complete', `${result.imported} entries synced from MyFitnessPal.`);
      loadData();
    }
  };

  const getMealIcon = (meal: string) => {
    switch (meal) {
      case 'breakfast': return 'sunny-outline';
      case 'lunch': return 'restaurant-outline';
      case 'dinner': return 'moon-outline';
      case 'snack': return 'cafe-outline';
      default: return 'nutrition-outline';
    }
  };

  const getMealColor = (meal: string) => {
    switch (meal) {
      case 'breakfast': return '#f39c12';
      case 'lunch': return '#2ecc71';
      case 'dinner': return '#3498db';
      case 'snack': return '#9b59b6';
      default: return COLORS.textMuted;
    }
  };

  const meals = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Image source={{ uri: MFP_BRAND.icon }} style={styles.headerIcon} />
            <Text style={styles.headerTitle}>MyFitnessPal</Text>
          </View>
          <TouchableOpacity
            onPress={handleFullSync}
            disabled={syncing}
            style={styles.syncBtn}
          >
            {syncing ? (
              <ActivityIndicator size="small" color={MFP_BRAND.color} />
            ) : (
              <Ionicons name="sync-outline" size={20} color={MFP_BRAND.color} />
            )}
          </TouchableOpacity>
        </View>

        {/* Connection Status */}
        {connection && (
          <View style={styles.statusBar}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>
              Connected as @{connection.username}
            </Text>
            <Text style={styles.statusSync}>
              Last sync: {formatMFPSyncTime(connection.lastSyncAt)}
            </Text>
          </View>
        )}

        {/* Tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, tab === 'today' && styles.tabActive]}
            onPress={() => setTab('today')}
          >
            <Ionicons
              name="today-outline"
              size={16}
              color={tab === 'today' ? MFP_BRAND.color : COLORS.textMuted}
            />
            <Text style={[styles.tabText, tab === 'today' && styles.tabTextActive]}>
              Today's Diary
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === 'weekly' && styles.tabActive]}
            onPress={() => setTab('weekly')}
          >
            <Ionicons
              name="bar-chart-outline"
              size={16}
              color={tab === 'weekly' ? MFP_BRAND.color : COLORS.textMuted}
            />
            <Text style={[styles.tabText, tab === 'weekly' && styles.tabTextActive]}>
              Weekly Summary
            </Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={MFP_BRAND.color} />
            <Text style={styles.loadingText}>Fetching MyFitnessPal data...</Text>
          </View>
        ) : (
          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {tab === 'today' && diary && (
              <>
                {/* Daily Summary Card */}
                <View style={styles.summaryCard}>
                  <View style={styles.summaryRow}>
                    <View style={styles.summaryItem}>
                      <Text style={styles.summaryValue}>{diary.totals.calories}</Text>
                      <Text style={styles.summaryLabel}>Calories</Text>
                    </View>
                    <View style={styles.summaryDivider} />
                    <View style={styles.summaryItem}>
                      <Text style={[styles.summaryValue, { color: '#3498db' }]}>{diary.totals.protein}g</Text>
                      <Text style={styles.summaryLabel}>Protein</Text>
                    </View>
                    <View style={styles.summaryDivider} />
                    <View style={styles.summaryItem}>
                      <Text style={[styles.summaryValue, { color: '#2ecc71' }]}>{diary.totals.carbs}g</Text>
                      <Text style={styles.summaryLabel}>Carbs</Text>
                    </View>
                    <View style={styles.summaryDivider} />
                    <View style={styles.summaryItem}>
                      <Text style={[styles.summaryValue, { color: '#f39c12' }]}>{diary.totals.fat}g</Text>
                      <Text style={styles.summaryLabel}>Fat</Text>
                    </View>
                  </View>

                  <View style={styles.calorieBreakdown}>
                    <View style={styles.calRow}>
                      <Text style={styles.calLabel}>Food Calories</Text>
                      <Text style={styles.calValue}>{diary.totals.calories}</Text>
                    </View>
                    <View style={styles.calRow}>
                      <Text style={styles.calLabel}>Exercise Calories</Text>
                      <Text style={[styles.calValue, { color: '#2ecc71' }]}>-{diary.exerciseCalories}</Text>
                    </View>
                    <View style={[styles.calRow, { borderTopWidth: 1, borderTopColor: COLORS.borderLight, paddingTop: 6 }]}>
                      <Text style={[styles.calLabel, { fontWeight: '700' }]}>Net Calories</Text>
                      <Text style={[styles.calValue, { fontWeight: '800' }]}>{diary.netCalories}</Text>
                    </View>
                  </View>

                  {/* Streak */}
                  <View style={styles.streakRow}>
                    <Ionicons name="flame" size={16} color="#ff6b6b" />
                    <Text style={styles.streakText}>{diary.streakDays} day logging streak</Text>
                  </View>
                </View>

                {/* Select All / Import Bar */}
                <View style={styles.importBar}>
                  <TouchableOpacity
                    style={styles.selectAllBtn}
                    onPress={() => {
                      if (selectedEntries.size === diary.entries.length) {
                        setSelectedEntries(new Set());
                      } else {
                        setSelectedEntries(new Set(diary.entries.map(e => e.id)));
                      }
                    }}
                  >
                    <Ionicons
                      name={selectedEntries.size === diary.entries.length ? 'checkbox' : 'square-outline'}
                      size={18}
                      color={MFP_BRAND.color}
                    />
                    <Text style={styles.selectAllText}>
                      {selectedEntries.size} of {diary.entries.length} selected
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.importBtn, selectedEntries.size === 0 && { opacity: 0.5 }]}
                    onPress={handleImport}
                    disabled={selectedEntries.size === 0}
                  >
                    <Ionicons name="download-outline" size={16} color={COLORS.white} />
                    <Text style={styles.importBtnText}>Import</Text>
                  </TouchableOpacity>
                </View>

                {/* Meal Sections */}
                {meals.map(meal => {
                  const entries = diary.entries.filter(e => e.meal === meal);
                  if (entries.length === 0) return null;
                  const mealCals = entries.reduce((s, e) => s + e.calories, 0);
                  const isExpanded = expandedMeal === meal;
                  const allMealSelected = entries.every(e => selectedEntries.has(e.id));

                  return (
                    <View key={meal} style={styles.mealCard}>
                      <TouchableOpacity
                        style={styles.mealHeader}
                        onPress={() => setExpandedMeal(isExpanded ? null : meal)}
                      >
                        <View style={[styles.mealIcon, { backgroundColor: getMealColor(meal) + '15' }]}>
                          <Ionicons name={getMealIcon(meal) as any} size={18} color={getMealColor(meal)} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.mealName}>
                            {meal.charAt(0).toUpperCase() + meal.slice(1)}
                          </Text>
                          <Text style={styles.mealInfo}>
                            {entries.length} items · {mealCals} cal
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.mealCheckAll}
                          onPress={() => toggleAllMeal(meal)}
                        >
                          <Ionicons
                            name={allMealSelected ? 'checkbox' : 'square-outline'}
                            size={20}
                            color={MFP_BRAND.color}
                          />
                        </TouchableOpacity>
                        <Ionicons
                          name={isExpanded ? 'chevron-up' : 'chevron-down'}
                          size={16}
                          color={COLORS.textMuted}
                        />
                      </TouchableOpacity>

                      {isExpanded && (
                        <View style={styles.mealEntries}>
                          {entries.map(entry => (
                            <TouchableOpacity
                              key={entry.id}
                              style={styles.entryRow}
                              onPress={() => toggleEntry(entry.id)}
                              activeOpacity={0.7}
                            >
                              <Ionicons
                                name={selectedEntries.has(entry.id) ? 'checkbox' : 'square-outline'}
                                size={18}
                                color={selectedEntries.has(entry.id) ? MFP_BRAND.color : COLORS.border}
                              />
                              <View style={{ flex: 1 }}>
                                <View style={styles.entryNameRow}>
                                  <Text style={styles.entryName} numberOfLines={1}>{entry.name}</Text>
                                  {entry.verified && (
                                    <Ionicons name="checkmark-circle" size={12} color="#2ecc71" />
                                  )}
                                </View>
                                {entry.brand && (
                                  <Text style={styles.entryBrand}>{entry.brand}</Text>
                                )}
                                <Text style={styles.entryServing}>
                                  {entry.servings > 1 ? `${entry.servings}x ` : ''}{entry.servingSize}
                                </Text>
                              </View>
                              <View style={styles.entryMacros}>
                                <Text style={styles.entryCals}>{entry.calories}</Text>
                                <Text style={styles.entryCalsLabel}>cal</Text>
                              </View>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })}
              </>
            )}

            {tab === 'weekly' && weekly && (
              <>
                {/* Weekly Overview */}
                <View style={styles.weeklyCard}>
                  <Text style={styles.weeklyTitle}>7-Day Averages</Text>
                  <View style={styles.weeklyGrid}>
                    <View style={styles.weeklyItem}>
                      <Text style={styles.weeklyValue}>{weekly.averages.calories}</Text>
                      <Text style={styles.weeklyLabel}>Avg Calories</Text>
                    </View>
                    <View style={styles.weeklyItem}>
                      <Text style={[styles.weeklyValue, { color: '#3498db' }]}>{weekly.averages.protein}g</Text>
                      <Text style={styles.weeklyLabel}>Avg Protein</Text>
                    </View>
                    <View style={styles.weeklyItem}>
                      <Text style={[styles.weeklyValue, { color: '#2ecc71' }]}>{weekly.averages.carbs}g</Text>
                      <Text style={styles.weeklyLabel}>Avg Carbs</Text>
                    </View>
                    <View style={styles.weeklyItem}>
                      <Text style={[styles.weeklyValue, { color: '#f39c12' }]}>{weekly.averages.fat}g</Text>
                      <Text style={styles.weeklyLabel}>Avg Fat</Text>
                    </View>
                  </View>

                  <View style={styles.adherenceRow}>
                    <View style={styles.adherenceBar}>
                      <View style={[styles.adherenceFill, { width: `${weekly.adherenceScore}%` }]} />
                    </View>
                    <Text style={styles.adherenceText}>{weekly.adherenceScore}% adherence</Text>
                  </View>
                </View>

                {/* Daily Breakdown */}
                <View style={styles.dailyBreakdown}>
                  <Text style={styles.breakdownTitle}>Daily Breakdown</Text>
                  {weekly.days.map((day, i) => {
                    const pct = Math.min((day.calories / day.calorieGoal) * 100, 100);
                    const isOver = day.calories > day.calorieGoal;
                    return (
                      <View key={i} style={styles.dayRow}>
                        <View style={styles.dayInfo}>
                          <Text style={styles.dayName}>{day.dayName}</Text>
                          <Text style={styles.dayDate}>
                            {new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </Text>
                        </View>
                        <View style={styles.dayBarContainer}>
                          <View style={styles.dayBar}>
                            <View style={[
                              styles.dayBarFill,
                              { width: `${pct}%`, backgroundColor: isOver ? '#e74c3c' : MFP_BRAND.color },
                            ]} />
                          </View>
                        </View>
                        <View style={styles.dayCals}>
                          <Text style={[styles.dayCalValue, isOver && { color: '#e74c3c' }]}>
                            {day.calories}
                          </Text>
                          <Text style={styles.dayCalLabel}>/ {day.calorieGoal}</Text>
                        </View>
                        <View style={styles.daySyncStatus}>
                          {day.synced ? (
                            <Ionicons name="checkmark-circle" size={14} color="#2ecc71" />
                          ) : (
                            <Ionicons name="time-outline" size={14} color={COLORS.textMuted} />
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>

                {/* Streak */}
                <View style={styles.streakCard}>
                  <Ionicons name="flame" size={28} color="#ff6b6b" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.streakCardTitle}>{weekly.streakDays} Day Streak</Text>
                    <Text style={styles.streakCardDesc}>
                      Keep logging to maintain your streak!
                    </Text>
                  </View>
                </View>
              </>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  closeBtn: { padding: SPACING.xs },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  headerIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: MFP_BRAND.color,
  },
  syncBtn: { padding: SPACING.xs },
  // Status
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: MFP_BRAND.colorLight,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2ecc71',
  },
  statusText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: MFP_BRAND.colorDark,
    flex: 1,
  },
  statusSync: {
    fontSize: FONT_SIZES.xs,
    color: MFP_BRAND.color,
    fontWeight: '500',
  },
  // Tabs
  tabs: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACING.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: MFP_BRAND.color },
  tabText: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.textMuted },
  tabTextActive: { color: MFP_BRAND.color, fontWeight: '700' },
  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.md,
  },
  loadingText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  scroll: { flex: 1 },
  // Summary Card
  summaryCard: {
    backgroundColor: COLORS.white,
    margin: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: SPACING.lg,
  },
  summaryItem: { alignItems: 'center' },
  summaryValue: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: COLORS.text,
  },
  summaryLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
    marginTop: 2,
  },
  summaryDivider: {
    width: 1,
    height: 30,
    backgroundColor: COLORS.borderLight,
    alignSelf: 'center',
  },
  calorieBreakdown: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    gap: 4,
    marginBottom: SPACING.md,
  },
  calRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  calLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  calValue: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.text,
    fontWeight: '600',
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  streakText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: '#ff6b6b',
  },
  // Import Bar
  importBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  selectAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  selectAllText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: MFP_BRAND.color,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
  },
  importBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.white,
  },
  // Meal Cards
  mealCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  mealHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  mealIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mealName: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.text,
  },
  mealInfo: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
  },
  mealCheckAll: {
    padding: 4,
  },
  mealEntries: {
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  entryNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  entryName: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
  },
  entryBrand: {
    fontSize: 9,
    color: MFP_BRAND.color,
    fontWeight: '500',
    marginTop: 1,
  },
  entryServing: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  entryMacros: {
    alignItems: 'flex-end',
    minWidth: 50,
  },
  entryCals: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.text,
  },
  entryCalsLabel: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  // Weekly
  weeklyCard: {
    backgroundColor: COLORS.white,
    margin: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  weeklyTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  weeklyGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: SPACING.lg,
  },
  weeklyItem: { alignItems: 'center' },
  weeklyValue: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.text,
  },
  weeklyLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
    marginTop: 2,
  },
  adherenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  adherenceBar: {
    flex: 1,
    height: 8,
    backgroundColor: COLORS.borderLight,
    borderRadius: 4,
    overflow: 'hidden',
  },
  adherenceFill: {
    height: '100%',
    backgroundColor: MFP_BRAND.color,
    borderRadius: 4,
  },
  adherenceText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: MFP_BRAND.color,
    minWidth: 80,
    textAlign: 'right',
  },
  // Daily Breakdown
  dailyBreakdown: {
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  breakdownTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.sm,
    marginBottom: SPACING.xs,
    gap: SPACING.sm,
    ...SHADOWS.sm,
  },
  dayInfo: {
    width: 50,
  },
  dayName: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.text,
  },
  dayDate: {
    fontSize: 9,
    color: COLORS.textMuted,
  },
  dayBarContainer: {
    flex: 1,
  },
  dayBar: {
    height: 6,
    backgroundColor: COLORS.borderLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  dayBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  dayCals: {
    alignItems: 'flex-end',
    minWidth: 70,
  },
  dayCalValue: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.text,
  },
  dayCalLabel: {
    fontSize: 9,
    color: COLORS.textMuted,
  },
  daySyncStatus: {
    width: 20,
    alignItems: 'center',
  },
  // Streak Card
  streakCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: '#ff6b6b08',
    marginHorizontal: SPACING.lg,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: '#ff6b6b20',
  },
  streakCardTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: '#ff6b6b',
  },
  streakCardDesc: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
});
