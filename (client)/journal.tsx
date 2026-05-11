import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Image, Alert } from 'react-native';


import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../constants/theme';
import ClientHeader from '../components/client/ClientHeader';
import NutritionRing from '../components/client/NutritionRing';
import SimpleChart from '../components/client/SimpleChart';
import AddFoodModal from '../components/client/AddFoodModal';
import MFPSyncModal from '../components/client/MFPSyncModal';
import PhotoFoodLogModal from '../components/client/PhotoFoodLogModal';
import FoodPhotoCalendar from '../components/client/FoodPhotoCalendar';
import DayNavigator from '../components/client/DayNavigator';
import SwipeableDayView from '../components/client/SwipeableDayView';
import OfflineIndicator from '../components/client/OfflineIndicator';
import { InlineWaterButton, WaterTrackerSection } from '../components/client/WaterTrackerButton';
import { useAuth } from '../contexts/AuthContext';
import type { FoodEntry, DailyNutritionGoal } from '../data/clientPortalData';
import type { MealType, FoodPhotoEntry } from '../data/foodPhotoData';
import { REVIEW_STATUS_CONFIG, MEAL_CONFIG } from '../data/foodPhotoData';
import {
  offlineFoodQueue,
  subscribeToFoodQueue,
  type FoodQueueState,
} from '../lib/offlineFoodJournalQueue';


import {
  fetchFoodEntries,
  fetchFoodEntriesRange,
  addFoodEntry,
  deleteFoodEntry,
  fetchWaterIntake,
  upsertWaterIntake,
  fetchNutritionGoals,
} from '../lib/clientDataService';
import {
  getMFPConnection,
  formatMFPSyncTime,
  MFP_BRAND,
  type MFPConnection,
} from '../lib/myfitnesspalService';
import {
  uploadFoodPhoto,
  fetchClientSubmittedPhotos,
  type SubmittedFoodPhoto,
} from '../lib/foodPhotoUploadService';

const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

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

export default function FoodJournalScreen() {
  const { user, profile } = useAuth();
  const today = new Date().toISOString().split('T')[0];

  // ── Day Navigation State ──
  const [selectedDate, setSelectedDate] = useState(today);
  const isViewingToday = selectedDate === today;

  const [foodLog, setFoodLog] = useState<FoodEntry[]>([]);
  const [weeklyEntries, setWeeklyEntries] = useState<FoodEntry[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('breakfast');
  const [expandedMeal, setExpandedMeal] = useState<string | null>('breakfast');
  const [waterGlasses, setWaterGlasses] = useState(0);
  const [nutritionGoals, setNutritionGoals] = useState<DailyNutritionGoal>({
    calories: 2400, protein: 200, carbs: 250, fat: 80, fiber: 35, water: 10,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  // MFP Integration State
  const [showMFPModal, setShowMFPModal] = useState(false);
  const [mfpConnection, setMfpConnection] = useState<MFPConnection | null>(null);
  const [importingMFP, setImportingMFP] = useState(false);

  // Photo Food Log State
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [submittedPhotos, setSubmittedPhotos] = useState<SubmittedFoodPhoto[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [photoViewMode, setPhotoViewMode] = useState<'calendar' | 'list'>('calendar');

  // ── Offline Queue State ──
  const [queueState, setQueueState] = useState<FoodQueueState>(offlineFoodQueue.getState());
  const prevSyncStatusRef = useRef<string>(queueState.syncStatus);

  // ── Subscribe to offline queue state changes ──
  useEffect(() => {
    const unsubscribe = subscribeToFoodQueue((newState) => {
      setQueueState(newState);

      // When sync completes successfully, reload data from server
      const prev = prevSyncStatusRef.current;
      if (
        (prev === 'syncing' && (newState.syncStatus === 'synced' || newState.syncStatus === 'partial')) ||
        (prev === 'offline' && newState.isOnline && newState.queueCount === 0)
      ) {
        // Queue just finished syncing — refresh from server
        loadData();
      }
      prevSyncStatusRef.current = newState.syncStatus;
    });
    return unsubscribe;
  }, [loadData]);

  // Merge pending offline adds into the displayed food log
  const pendingOfflineAdds = useMemo(() => {
    if (!user?.id) return [];
    return offlineFoodQueue.getPendingAdds(user.id, selectedDate);
  }, [user?.id, selectedDate, queueState.queueCount]);

  const pendingDeleteIds = useMemo(() => {
    return offlineFoodQueue.getPendingDeleteIds();
  }, [queueState.queueCount]);

  // Combined food log: server entries (minus pending deletes) + pending offline adds
  const mergedFoodLog = useMemo(() => {
    const serverEntries = foodLog.filter(e => !pendingDeleteIds.has(e.id));
    return [...serverEntries, ...pendingOfflineAdds];
  }, [foodLog, pendingOfflineAdds, pendingDeleteIds]);

  // Set of offline entry IDs for visual indicator
  const offlineEntryIds = useMemo(() => {
    return new Set(pendingOfflineAdds.map(e => e.id));
  }, [pendingOfflineAdds]);



  // Client info derived from auth profile
  const clientInfo = useMemo(() => ({
    clientId: user?.id || '',
    clientName: profile?.full_name || 'Client',
    dietitianName: profile?.primary_dietitian || 'Unassigned',
    franchise: profile?.franchise || 'Unknown',
  }), [user?.id, profile?.full_name, profile?.primary_dietitian, profile?.franchise]);

  // ============================================================
  // LOAD DATA (food entries + submitted photos from DB)
  // ============================================================
  const loadData = useCallback(async (dateToLoad?: string) => {
    if (!user?.id) return;
    const targetDate = dateToLoad || selectedDate;
    try {
      const weekStart = new Date(targetDate + 'T12:00:00');
      weekStart.setDate(weekStart.getDate() - 7);
      const weekStartStr = weekStart.toISOString().split('T')[0];

      const [dateEntries, weekEntries, water, goals, mfpConn] = await Promise.all([
        fetchFoodEntries(user.id, targetDate),
        fetchFoodEntriesRange(user.id, weekStartStr, targetDate),
        fetchWaterIntake(user.id, targetDate),
        fetchNutritionGoals(user.id),
        getMFPConnection(),
      ]);

      setFoodLog(dateEntries);
      setWeeklyEntries(weekEntries);
      setWaterGlasses(water);
      setNutritionGoals(goals);
      setMfpConnection(mfpConn);
    } catch (err) {
      console.error('Error loading food journal:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, selectedDate]);

  // Load submitted food photos from database
  const loadSubmittedPhotos = useCallback(async () => {
    if (!user?.id) return;
    setLoadingPhotos(true);
    try {
      const result = await fetchClientSubmittedPhotos(user.id);
      if (result.success && result.photos.length > 0) {
        setSubmittedPhotos(result.photos);
      }
    } catch (err) {
      console.error('Error loading submitted photos:', err);
    } finally {
      setLoadingPhotos(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
    loadSubmittedPhotos();
  }, [loadData, loadSubmittedPhotos]);

  // ── Day Navigation Handler ──
  const handleDateChange = useCallback((newDate: string) => {
    setSelectedDate(newDate);
    // Load data for the new date
    loadData(newDate);
  }, [loadData]);

  // Compute entry counts for the week strip dots
  const weekEntryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of weeklyEntries) {
      counts[entry.date] = (counts[entry.date] || 0) + 1;
    }
    return counts;
  }, [weeklyEntries]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
    loadSubmittedPhotos();
  }, [loadData, loadSubmittedPhotos]);


  const todayTotals = useMemo(() => {
    return mergedFoodLog.reduce(
      (acc, entry) => ({
        calories: acc.calories + entry.calories,
        protein: acc.protein + entry.protein,
        carbs: acc.carbs + entry.carbs,
        fat: acc.fat + entry.fat,
        fiber: acc.fiber + entry.fiber,
        sugar: acc.sugar + entry.sugar,
        sodium: acc.sodium + entry.sodium,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 }
    );
  }, [mergedFoodLog]);

  const mealGroups = useMemo(() => {
    const groups: Record<string, FoodEntry[]> = {};
    for (const meal of MEAL_ORDER) {
      groups[meal] = mergedFoodLog.filter(e => e.meal === meal);
    }
    return groups;
  }, [mergedFoodLog]);


  // Build weekly calorie chart data from real entries
  const weeklyCalorieData = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const result: { label: string; value: number; secondaryValue: number }[] = [];
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayEntries = weeklyEntries.filter(e => e.date === dateStr);
      const totalCals = dayEntries.reduce((sum, e) => sum + e.calories, 0);
      result.push({
        label: days[d.getDay()],
        value: totalCals,
        secondaryValue: nutritionGoals.calories,
      });
    }
    return result;
  }, [weeklyEntries, nutritionGoals.calories]);

  const handleAddFood = async (entry: Omit<FoodEntry, 'id'>) => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const { data, error } = await addFoodEntry(user.id, entry);
      if (error) {
        // Network or server error — queue offline
        console.warn('Online add failed, queuing offline:', error);
        offlineFoodQueue.enqueueAdd(user.id, entry);
        setSaving(false);
        return;
      }
      // Add to local state immediately
      if (data) {
        const newEntry: FoodEntry = {
          id: data.id,
          date: entry.date,
          time: entry.time,
          meal: entry.meal,
          name: entry.name,
          calories: entry.calories,
          protein: entry.protein,
          carbs: entry.carbs,
          fat: entry.fat,
          fiber: entry.fiber,
          sugar: entry.sugar,
          sodium: entry.sodium,
          servingSize: entry.servingSize,
        };
        if (entry.date === selectedDate) {
          setFoodLog(prev => [...prev, newEntry]);
        }
        setWeeklyEntries(prev => [...prev, newEntry]);
      }
    } catch (err) {
      // Network exception — queue offline for later sync
      console.warn('Add food threw exception, queuing offline:', err);
      offlineFoodQueue.enqueueAdd(user.id, entry);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFood = async (id: string) => {
    if (!user?.id) return;
    // Optimistically remove from UI immediately
    setFoodLog(prev => prev.filter(e => e.id !== id));
    setWeeklyEntries(prev => prev.filter(e => e.id !== id));
    try {
      const { error } = await deleteFoodEntry(id);
      if (error) {
        console.warn('Online delete failed, queuing offline:', error);
        offlineFoodQueue.enqueueDelete(user.id, id);
        return;
      }
    } catch (err) {
      // Network exception — queue offline
      console.warn('Delete food threw exception, queuing offline:', err);
      offlineFoodQueue.enqueueDelete(user.id, id);
    }
  };


  // ============================================================
  // MFP IMPORT HANDLER
  // ============================================================
  const handleMFPImport = async (entries: Array<{
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
  }>) => {
    if (!user?.id || entries.length === 0) return;

    setImportingMFP(true);
    setSaving(true);

    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    let importedCount = 0;

    for (const entry of entries) {
      try {
        const foodEntry: Omit<FoodEntry, 'id'> = {
          date: today,
          time: timeStr,
          meal: entry.meal,
          name: entry.name,
          calories: entry.calories,
          protein: entry.protein,
          carbs: entry.carbs,
          fat: entry.fat,
          fiber: entry.fiber,
          sugar: entry.sugar,
          sodium: entry.sodium,
          servingSize: entry.servingSize,
        };

        const { data, error } = await addFoodEntry(user.id, foodEntry);

        if (!error && data) {
          const newEntry: FoodEntry = {
            id: data.id,
            ...foodEntry,
          };
          setFoodLog(prev => [...prev, newEntry]);
          setWeeklyEntries(prev => [...prev, newEntry]);
          importedCount++;
        }
      } catch (err) {
        console.error('Error importing MFP entry:', err);
      }
    }

    // Refresh MFP connection to get updated lastSyncAt
    try {
      const updatedConn = await getMFPConnection();
      setMfpConnection(updatedConn);
    } catch (e) {
      // ignore
    }

    setImportingMFP(false);
    setSaving(false);

    console.log(`Imported ${importedCount}/${entries.length} entries from MyFitnessPal`);
  };

  // ============================================================
  // PHOTO FOOD LOG HANDLER - Upload to storage + create DB record
  // ============================================================
  const handlePhotoFoodSave = async (photo: { photoUri: string; meal: MealType; description: string }) => {
    if (!user?.id) {
      throw new Error('You must be signed in to submit food photos.');
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    // Upload photo to Supabase storage and create food_photo_reviews record
    const result = await uploadFoodPhoto(
      photo.photoUri,
      photo.meal,
      photo.description,
      clientInfo,
    );

    if (!result.success) {
      throw new Error(result.error || 'Failed to upload food photo.');
    }

    // Add the newly uploaded photo to local state with the real cloud URL
    const newPhoto: SubmittedFoodPhoto = {
      id: result.photoId || `local-${Date.now()}`,
      photoId: result.photoId || `local-${Date.now()}`,
      photoUri: result.photoUrl || photo.photoUri,
      meal: photo.meal,
      description: photo.description,
      date: today,
      time: timeStr,
      status: 'pending',
      createdAt: now.toISOString(),
    };

    setSubmittedPhotos(prev => [newPhoto, ...prev]);

    console.log(`Photo uploaded and submitted for dietitian review: ${photo.meal} at ${timeStr} → ${result.photoUrl}`);
  };


  // Track whether water intake is queued offline for the current date
  const waterIsOfflineQueued = useMemo(() => {
    if (!user?.id) return false;
    return offlineFoodQueue.hasWaterPending(user.id, selectedDate);
  }, [user?.id, selectedDate, queueState.pendingWaterUpserts]);

  const handleWaterChange = async (glasses: number) => {
    if (!user?.id) return;
    // Optimistically update UI immediately
    setWaterGlasses(glasses);
    try {
      const { error } = await upsertWaterIntake(user.id, selectedDate, glasses);
      if (error) {
        // Server returned an error — queue offline for later sync
        console.warn('[Water] Online upsert failed, queuing offline:', error);
        offlineFoodQueue.enqueueWaterUpsert(user.id, selectedDate, glasses);
      }
    } catch (err) {
      // Network exception — queue offline for later sync
      console.warn('[Water] Upsert threw exception, queuing offline:', err);
      offlineFoodQueue.enqueueWaterUpsert(user.id, selectedDate, glasses);
    }
  };


  const getMealCalories = (meal: string) => {
    return (mealGroups[meal] || []).reduce((sum, e) => sum + e.calories, 0);
  };

  // Count photos by status (flagged treated as reviewed for display)
  const photoStatusCounts = useMemo(() => {
    const counts = { pending: 0, reviewed: 0 };
    for (const p of submittedPhotos) {
      if (p.status === 'pending') counts.pending++;
      else counts.reviewed++; // 'reviewed' and 'flagged' (legacy) both count as reviewed
    }
    return counts;
  }, [submittedPhotos]);


  if (loading) {
    return (
      <View style={styles.container}>
        <ClientHeader title="Food Journal" subtitle="Track Your Nutrition" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={styles.loadingText}>Loading your food journal...</Text>
        </View>
      </View>
    );
  }

  const addDaysHelper = (dateStr: string, days: number): string => {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  };

  const isFutureDate = selectedDate >= today;

  return (
    <View style={styles.container}>
      <ClientHeader title="Food Journal" subtitle="Track Your Nutrition" />

      {/* Day Navigator with Week Strip */}
      <DayNavigator
        selectedDate={selectedDate}
        onDateChange={handleDateChange}
        entryCounts={weekEntryCounts}
        todayString={today}
      />

      <SwipeableDayView
        onSwipeLeft={() => handleDateChange(addDaysHelper(selectedDate, 1))}
        onSwipeRight={() => handleDateChange(addDaysHelper(selectedDate, -1))}
        canSwipeLeft={!isFutureDate}
      >
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />
        }
      >


        {/* Data Source Badge + MFP Sync Status */}
        <View style={styles.badgeRow}>
          <View style={styles.dataBadge}>
            <Ionicons name="cloud-done-outline" size={12} color="#2ecc71" />
            <Text style={styles.dataBadgeText}>
              {foodLog.length} entries today · Auto-saved
            </Text>
            {saving && <ActivityIndicator size="small" color={COLORS.accent} style={{ marginLeft: 4 }} />}
          </View>

          {mfpConnection?.connected && (
            <TouchableOpacity
              style={styles.mfpSyncBadge}
              onPress={() => setShowMFPModal(true)}
              activeOpacity={0.7}
            >
              <View style={styles.mfpSyncDot} />
              <Ionicons name="sync-outline" size={10} color={MFP_BRAND.color} />
              <Text style={styles.mfpSyncText}>
                MFP: {formatMFPSyncTime(mfpConnection.lastSyncAt)}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Offline Indicator — shown when offline or entries are queued */}
        <OfflineIndicator />



        {/* Calorie Summary */}
        <View style={styles.calorieCard}>
          <View style={styles.calorieHeader}>
            <View>
              <Text style={styles.calorieLabel}>Today's Calories</Text>
              <View style={styles.calorieValueRow}>
                <Text style={styles.calorieValue}>{todayTotals.calories}</Text>
                <Text style={styles.calorieGoal}>/ {nutritionGoals.calories}</Text>
              </View>
            </View>
            <View style={[styles.calorieBadge, {
              backgroundColor: todayTotals.calories > nutritionGoals.calories ? '#e74c3c15' : '#2ecc7115'
            }]}>
              <Ionicons
                name={todayTotals.calories > nutritionGoals.calories ? 'arrow-up' : 'checkmark-circle'}
                size={14}
                color={todayTotals.calories > nutritionGoals.calories ? '#e74c3c' : '#2ecc71'}
              />
              <Text style={{
                fontSize: FONT_SIZES.xs,
                fontWeight: '700',
                color: todayTotals.calories > nutritionGoals.calories ? '#e74c3c' : '#2ecc71',
              }}>
                {Math.abs(nutritionGoals.calories - todayTotals.calories)} {todayTotals.calories > nutritionGoals.calories ? 'over' : 'remaining'}
              </Text>
            </View>
          </View>
          <View style={styles.calorieBar}>
            <View style={[styles.calorieFill, {
              width: `${Math.min((todayTotals.calories / nutritionGoals.calories) * 100, 100)}%`,
              backgroundColor: todayTotals.calories > nutritionGoals.calories ? '#e74c3c' : COLORS.accent,
            }]} />
          </View>
        </View>

        {/* Today's Meals — moved directly under calories */}
        <View style={styles.mealSection}>
          <View style={styles.mealHeader}>
            <Text style={styles.mealSectionTitle}>Today's Meals</Text>
            <View style={styles.mealHeaderActions}>
              {/* Import from MyFitnessPal Button */}
              <TouchableOpacity
                style={styles.mfpImportBtn}
                onPress={() => setShowMFPModal(true)}
                activeOpacity={0.7}
              >
                {importingMFP ? (
                  <ActivityIndicator size="small" color={MFP_BRAND.color} />
                ) : (
                  <>
                    <Ionicons name="download-outline" size={14} color={MFP_BRAND.color} />
                    <Text style={styles.mfpImportText}>MFP Import</Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Photo Food Log Button */}
              <TouchableOpacity
                style={styles.snapBtn}
                onPress={() => setShowPhotoModal(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="camera" size={14} color={COLORS.white} />
                <Text style={styles.snapBtnText}>Snap</Text>
              </TouchableOpacity>

              {/* Quick Water Log Button */}
              <InlineWaterButton
                glasses={waterGlasses}
                goal={nutritionGoals.water}
                onPress={() => handleWaterChange(Math.min(waterGlasses + 1, nutritionGoals.water + 5))}
              />

              {/* Add Food Button */}
              <TouchableOpacity
                style={styles.addFoodBtn}
                onPress={() => { setSelectedMeal('snack'); setShowAddModal(true); }}
              >
                <Ionicons name="add-circle" size={16} color={COLORS.white} />
                <Text style={styles.addFoodText}>Add Food</Text>
              </TouchableOpacity>
            </View>
          </View>

          {MEAL_ORDER.map(meal => {
            const entries = mealGroups[meal] || [];
            const mealCals = getMealCalories(meal);
            const isExpanded = expandedMeal === meal;

            return (
              <View key={meal} style={styles.mealCard}>
                <TouchableOpacity
                  style={styles.mealCardHeader}
                  onPress={() => setExpandedMeal(isExpanded ? null : meal)}
                >
                  <View style={[styles.mealIcon, { backgroundColor: getMealColor(meal) + '15' }]}>
                    <Ionicons name={getMealIcon(meal) as any} size={18} color={getMealColor(meal)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mealName}>
                      {meal.charAt(0).toUpperCase() + meal.slice(1)}
                    </Text>
                    <Text style={styles.mealItemCount}>
                      {entries.length} item{entries.length !== 1 ? 's' : ''} · {mealCals} cal
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.mealAddBtn}
                    onPress={() => { setSelectedMeal(meal); setShowAddModal(true); }}
                  >
                    <Ionicons name="add" size={18} color={getMealColor(meal)} />
                  </TouchableOpacity>
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={COLORS.textMuted}
                  />
                </TouchableOpacity>

                {isExpanded && entries.length > 0 && (
                  <View style={styles.mealEntries}>
                    {entries.map(entry => (
                      <View key={entry.id} style={[
                        styles.foodEntry,
                        offlineEntryIds.has(entry.id) && { backgroundColor: '#f39c1206', borderLeftWidth: 2, borderLeftColor: '#f39c12' },
                      ]}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={styles.foodName}>{entry.name}</Text>
                            {offlineEntryIds.has(entry.id) && (
                              <Ionicons name="cloud-offline-outline" size={11} color="#f39c12" />
                            )}
                          </View>
                          <Text style={styles.foodServing}>{entry.servingSize}</Text>
                          <View style={styles.foodMacros}>
                            <Text style={styles.foodMacro}>{entry.calories} cal</Text>
                            <Text style={[styles.foodMacroDot, { color: '#3498db' }]}>P:{entry.protein}g</Text>
                            <Text style={[styles.foodMacroDot, { color: '#2ecc71' }]}>C:{entry.carbs}g</Text>
                            <Text style={[styles.foodMacroDot, { color: '#f39c12' }]}>F:{entry.fat}g</Text>
                          </View>
                        </View>
                        <TouchableOpacity
                          style={styles.deleteBtn}
                          onPress={() => handleDeleteFood(entry.id)}
                        >
                          <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>

                )}

                {isExpanded && entries.length === 0 && (
                  <View style={styles.emptyMeal}>
                    <Text style={styles.emptyMealText}>No entries yet</Text>
                    <TouchableOpacity
                      style={styles.emptyAddBtn}
                      onPress={() => { setSelectedMeal(meal); setShowAddModal(true); }}
                    >
                      <Ionicons name="add" size={14} color={COLORS.accent} />
                      <Text style={styles.emptyAddText}>Add Food</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Macro Rings */}
        <View style={styles.macroSection}>
          <Text style={styles.macroTitle}>Macronutrients</Text>
          <View style={styles.macroGrid}>
            <NutritionRing label="Protein" current={todayTotals.protein} goal={nutritionGoals.protein} unit="g" color="#3498db" />
            <NutritionRing label="Carbs" current={todayTotals.carbs} goal={nutritionGoals.carbs} unit="g" color="#2ecc71" />
            <NutritionRing label="Fat" current={todayTotals.fat} goal={nutritionGoals.fat} unit="g" color="#f39c12" />
            <NutritionRing label="Fiber" current={todayTotals.fiber} goal={nutritionGoals.fiber} unit="g" color="#9b59b6" />
          </View>
        </View>

        {/* Water Tracker - Tap to log water */}
        <WaterTrackerSection
          glasses={waterGlasses}
          goal={nutritionGoals.water}
          onGlassChange={handleWaterChange}
          saving={saving}
          isOfflineQueued={waterIsOfflineQueued}
        />


        {/* Weekly Calorie Chart */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Weekly Calorie Trend</Text>
          <SimpleChart
            data={weeklyCalorieData}
            color={COLORS.accent}
            secondaryColor={COLORS.border}
            height={120}
            type="bar"
          />
          <View style={styles.chartLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: COLORS.accent }]} />
              <Text style={styles.legendText}>Actual</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: COLORS.border, opacity: 0.4 }]} />
              <Text style={styles.legendText}>Goal</Text>
            </View>
          </View>
        </View>

        {/* Submitted Food Photos (from database) */}
        <View style={styles.mealSection}>
          {/* Section Header with View Toggle */}
          <View style={styles.photoSectionHeader}>
            <View style={styles.photoSectionTitleRow}>
              <Text style={styles.mealSectionTitle}>Submitted Photos</Text>
              <View style={styles.photoStatusRow}>
                {submittedPhotos.length > 0 && (
                  <>
                    {photoStatusCounts.pending > 0 && (
                      <View style={[styles.photoStatusBadge, { backgroundColor: '#f39c1212' }]}>
                        <Ionicons name="time-outline" size={10} color="#f39c12" />
                        <Text style={[styles.photoStatusText, { color: '#f39c12' }]}>{photoStatusCounts.pending}</Text>
                      </View>
                    )}
                    {photoStatusCounts.reviewed > 0 && (
                      <View style={[styles.photoStatusBadge, { backgroundColor: '#2ecc7112' }]}>
                        <Ionicons name="checkmark-circle-outline" size={10} color="#2ecc71" />
                        <Text style={[styles.photoStatusText, { color: '#2ecc71' }]}>{photoStatusCounts.reviewed}</Text>
                      </View>
                    )}
                  </>
                )}
              </View>
            </View>

            {/* View Toggle + Dietitian Badge */}
            <View style={styles.photoSectionControls}>
              <View style={styles.viewToggle}>
                <TouchableOpacity
                  style={[
                    styles.viewToggleBtn,
                    photoViewMode === 'calendar' && styles.viewToggleBtnActive,
                  ]}
                  onPress={() => setPhotoViewMode('calendar')}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="calendar"
                    size={14}
                    color={photoViewMode === 'calendar' ? COLORS.white : COLORS.textMuted}
                  />
                  <Text style={[
                    styles.viewToggleText,
                    photoViewMode === 'calendar' && styles.viewToggleTextActive,
                  ]}>Calendar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.viewToggleBtn,
                    photoViewMode === 'list' && styles.viewToggleBtnActive,
                  ]}
                  onPress={() => setPhotoViewMode('list')}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="list"
                    size={14}
                    color={photoViewMode === 'list' ? COLORS.white : COLORS.textMuted}
                  />
                  <Text style={[
                    styles.viewToggleText,
                    photoViewMode === 'list' && styles.viewToggleTextActive,
                  ]}>List</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.dietitianReviewBadge}>
                <Ionicons name="eye-outline" size={12} color="#9b59b6" />
                <Text style={styles.dietitianReviewText}>Dietitian Review</Text>
              </View>
            </View>
          </View>

          {/* Loading State */}
          {loadingPhotos && submittedPhotos.length === 0 && (
            <View style={styles.photosLoadingCard}>
              <ActivityIndicator size="small" color={COLORS.accent} />
              <Text style={styles.photosLoadingText}>Loading submitted photos...</Text>
            </View>
          )}

          {/* Empty State */}
          {!loadingPhotos && submittedPhotos.length === 0 && (
            <View style={styles.noPhotosCard}>
              <View style={styles.noPhotosIcon}>
                <Ionicons name="camera-outline" size={28} color={COLORS.textMuted} />
              </View>
              <Text style={styles.noPhotosTitle}>No Photos Submitted Yet</Text>
              <Text style={styles.noPhotosSubtitle}>
                Tap the "Snap" button above to take a photo of your meal and submit it for dietitian review.
              </Text>
              <TouchableOpacity
                style={styles.noPhotosBtn}
                onPress={() => setShowPhotoModal(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="camera" size={16} color={COLORS.white} />
                <Text style={styles.noPhotosBtnText}>Take Your First Photo</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Calendar View */}
          {submittedPhotos.length > 0 && photoViewMode === 'calendar' && (
            <FoodPhotoCalendar
              photos={submittedPhotos}
              onSnapPhoto={() => setShowPhotoModal(true)}
            />
          )}

          {/* List View */}
          {submittedPhotos.length > 0 && photoViewMode === 'list' && (
            <>
              {submittedPhotos.map((photo, idx) => {
                const mealCfg = MEAL_CONFIG[photo.meal] || MEAL_CONFIG.snack;
                const statusCfg = REVIEW_STATUS_CONFIG[photo.status] || REVIEW_STATUS_CONFIG.pending;
                const isCloudPhoto = photo.photoUri && (photo.photoUri.startsWith('http://') || photo.photoUri.startsWith('https://'));

                return (
                  <View key={photo.photoId || idx} style={styles.photoCard}>
                    <View style={styles.photoCardRow}>
                      {/* Photo thumbnail */}
                      {photo.photoUri ? (
                        <Image source={{ uri: photo.photoUri }} style={styles.photoThumb} />
                      ) : (
                        <View style={styles.photoThumbPlaceholder}>
                          <Ionicons name="camera-outline" size={24} color={COLORS.textMuted} />
                        </View>
                      )}

                      {/* Photo info */}
                      <View style={styles.photoInfo}>
                        <View style={styles.photoBadgeRow}>
                          <View style={[styles.photoBadge, { backgroundColor: mealCfg.color + '12' }]}>
                            <Ionicons name={mealCfg.icon as any} size={10} color={mealCfg.color} />
                            <Text style={[styles.photoBadgeText, { color: mealCfg.color }]}>{mealCfg.label}</Text>
                          </View>
                          <View style={[styles.photoBadge, { backgroundColor: statusCfg.bgColor }]}>
                            <Ionicons name={statusCfg.icon as any} size={10} color={statusCfg.color} />
                            <Text style={[styles.photoBadgeText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
                          </View>
                          {isCloudPhoto && (
                            <View style={styles.cloudBadge}>
                              <Ionicons name="cloud-done-outline" size={10} color="#2ecc71" />
                            </View>
                          )}
                        </View>

                        {photo.description ? (
                          <Text style={styles.photoDesc} numberOfLines={2}>{photo.description}</Text>
                        ) : (
                          <Text style={styles.photoNoDesc}>No description</Text>
                        )}

                        <View style={styles.photoMetaRow}>
                          <Ionicons name="calendar-outline" size={10} color={COLORS.textMuted} />
                          <Text style={styles.photoMetaText}>{photo.date}</Text>
                          <Ionicons name="time-outline" size={10} color={COLORS.textMuted} />
                          <Text style={styles.photoMetaText}>{photo.time}</Text>
                        </View>
                      </View>
                    </View>

                    {/* Dietitian Feedback (if reviewed) */}
                    {photo.dietitianFeedback && (
                      <View style={styles.feedbackSection}>
                        <View style={styles.feedbackHeader}>
                          <Ionicons name="chatbubble-outline" size={12} color={COLORS.accent} />
                          <Text style={styles.feedbackLabel}>Dietitian Feedback</Text>
                          {photo.reviewedAt && (
                            <Text style={styles.feedbackTime}>
                              {new Date(photo.reviewedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </Text>
                          )}
                        </View>
                        <Text style={styles.feedbackText}>{photo.dietitianFeedback}</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </>
          )}
        </View>

        {/* Nutrition Details */}
        <View style={styles.detailSection}>
          <Text style={styles.detailTitle}>Nutrition Breakdown</Text>
          <View style={styles.detailCard}>
            {[
              { label: 'Calories', value: todayTotals.calories, goal: nutritionGoals.calories, unit: 'kcal', color: '#ff6b6b' },
              { label: 'Protein', value: todayTotals.protein, goal: nutritionGoals.protein, unit: 'g', color: '#3498db' },
              { label: 'Carbohydrates', value: todayTotals.carbs, goal: nutritionGoals.carbs, unit: 'g', color: '#2ecc71' },
              { label: 'Fat', value: todayTotals.fat, goal: nutritionGoals.fat, unit: 'g', color: '#f39c12' },
              { label: 'Fiber', value: todayTotals.fiber, goal: nutritionGoals.fiber, unit: 'g', color: '#9b59b6' },
              { label: 'Sugar', value: todayTotals.sugar, goal: 50, unit: 'g', color: '#e74c3c' },
              { label: 'Sodium', value: todayTotals.sodium, goal: 2300, unit: 'mg', color: '#1abc9c' },
            ].map((item, i) => {
              const pct = Math.min((item.value / item.goal) * 100, 100);
              return (
                <View key={i} style={styles.detailRow}>
                  <View style={styles.detailLabelRow}>
                    <View style={[styles.detailDot, { backgroundColor: item.color }]} />
                    <Text style={styles.detailLabel}>{item.label}</Text>
                    <Text style={styles.detailValue}>
                      {Math.round(item.value)} / {item.goal} {item.unit}
                    </Text>
                  </View>
                  <View style={styles.detailBar}>
                    <View style={[styles.detailFill, { width: `${pct}%`, backgroundColor: item.color }]} />
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
      </SwipeableDayView>


      <AddFoodModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAddFood}
        selectedMeal={selectedMeal}
        selectedDate={selectedDate}
      />


      <MFPSyncModal
        visible={showMFPModal}
        onClose={() => {
          setShowMFPModal(false);
          // Refresh MFP connection status after closing modal
          getMFPConnection().then(conn => setMfpConnection(conn)).catch(() => {});
        }}
        onImport={handleMFPImport}
      />

      <PhotoFoodLogModal
        visible={showPhotoModal}
        onClose={() => setShowPhotoModal(false)}
        onSave={handlePhotoFoodSave}
        dietitianName={clientInfo.dietitianName !== 'Unassigned' ? clientInfo.dietitianName : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({

  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
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
  // Badge Row (Data Badge + MFP Sync Badge)
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    flexWrap: 'wrap',
  },
  dataBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: SPACING.md,
    backgroundColor: '#2ecc7108',
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderColor: '#2ecc7120',
  },
  dataBadgeText: {
    fontSize: FONT_SIZES.xs,
    color: '#2ecc71',
    fontWeight: '600',
  },
  // MFP Sync Status Badge
  mfpSyncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: SPACING.sm,
    backgroundColor: MFP_BRAND.colorLight,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderColor: MFP_BRAND.color + '30',
  },
  mfpSyncDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#2ecc71',
  },
  mfpSyncText: {
    fontSize: 9,
    color: MFP_BRAND.colorDark,
    fontWeight: '700',
  },
  calorieCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  calorieHeader: {

    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  calorieLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  calorieValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  calorieValue: {
    fontSize: FONT_SIZES.hero,
    fontWeight: '800',
    color: COLORS.text,
  },
  calorieGoal: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  calorieBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
  },
  calorieBar: {
    height: 8,
    backgroundColor: COLORS.borderLight,
    borderRadius: 4,
    overflow: 'hidden',
  },
  calorieFill: {
    height: '100%',
    borderRadius: 4,
  },
  // Macros
  macroSection: {
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  macroTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  macroGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  // Water
  waterSection: {
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
  },
  waterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  waterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  waterTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.text,
  },
  waterCount: {
    fontSize: FONT_SIZES.sm,
    color: '#3498db',
    fontWeight: '700',
  },
  waterGlasses: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  waterGlass: {
    padding: 4,
  },
  // Chart
  chartCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
  },
  chartTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  chartLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.lg,
    marginTop: SPACING.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  // Meals
  mealSection: {
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  mealHeader: {
    flexDirection: 'column',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  mealSectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.text,
  },
  mealHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },

  // MFP Import Button
  mfpImportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: MFP_BRAND.colorLight,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: MFP_BRAND.color + '40',
    minWidth: 90,
    justifyContent: 'center',
  },
  mfpImportText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: MFP_BRAND.color,
  },
  // Snap (Photo Food Log) Button
  snapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.accentDark,
    minWidth: 70,
    justifyContent: 'center',
  },
  snapBtnText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.white,
    letterSpacing: 0.3,
  },
  addFoodBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
  },
  addFoodText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.white,
  },
  mealCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  mealCardHeader: {
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
  mealItemCount: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
  },
  mealAddBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mealEntries: {
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  foodEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  foodName: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.text,
  },
  foodServing: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  foodMacros: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: 4,
  },
  foodMacro: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  foodMacroDot: {
    fontSize: 10,
    fontWeight: '600',
  },
  deleteBtn: {
    padding: SPACING.sm,
  },
  emptyMeal: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    gap: SPACING.sm,
  },
  emptyMealText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
  },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  emptyAddText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.accent,
  },

  // ── Submitted Photos Section ──
  photoStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  photoStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  photoStatusText: {
    fontSize: 9,
    fontWeight: '800',
  },
  dietitianReviewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#9b59b612',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  dietitianReviewText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9b59b6',
  },
  photosLoadingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  photosLoadingText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  noPhotosCard: {
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    ...SHADOWS.sm,
  },
  noPhotosIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  noPhotosTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  noPhotosSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  noPhotosBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.full,
  },
  noPhotosBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.white,
  },

  // Photo Card
  photoCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  photoCardRow: {
    flexDirection: 'row',
    padding: SPACING.sm,
    gap: SPACING.sm,
  },
  photoThumb: {
    width: 64,
    height: 64,
    borderRadius: 8,
  },
  photoThumbPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: COLORS.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  photoBadgeRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  photoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  photoBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  cloudBadge: {
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: '#2ecc7108',
  },
  photoDesc: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  photoNoDesc: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  photoMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  photoMetaText: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: '600',
    marginRight: 4,
  },

  // Feedback Section
  feedbackSection: {
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    padding: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.accent + '04',
  },
  feedbackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: 4,
  },
  feedbackLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.accent,
    flex: 1,
  },
  feedbackTime: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  feedbackText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },

  // Detail Section
  detailSection: {
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  detailTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  detailCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  detailRow: {
    marginBottom: SPACING.md,
  },
  detailLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  detailDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: SPACING.sm,
  },
  detailLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
  },
  detailValue: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  detailBar: {
    height: 6,
    backgroundColor: COLORS.borderLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  detailFill: {
    height: '100%',
    borderRadius: 3,
  },


  // ── Photo Section Header + View Toggle ──
  photoSectionHeader: {
    marginBottom: SPACING.md,
  },
  photoSectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  photoSectionControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: COLORS.borderLight,
    borderRadius: BORDER_RADIUS.full,
    padding: 2,
  },
  viewToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
  },
  viewToggleBtnActive: {
    backgroundColor: COLORS.accent,
  },
  viewToggleText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  viewToggleTextActive: {
    color: COLORS.white,
  },
});
