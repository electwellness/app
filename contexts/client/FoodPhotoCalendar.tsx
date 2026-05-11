import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  LayoutAnimation,
  Platform,
  UIManager,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import { MEAL_CONFIG, REVIEW_STATUS_CONFIG } from '../../data/foodPhotoData';
import type { SubmittedFoodPhoto } from '../../lib/foodPhotoUploadService';
import type { MealType, ReviewStatus } from '../../data/foodPhotoData';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const IS_SMALL_SCREEN = SCREEN_WIDTH < 500;

const WEEKDAYS = IS_SMALL_SCREEN ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const REQUIRED_MEALS: MealType[] = ['breakfast', 'lunch', 'dinner'];

type DayStatus = 'complete' | 'partial' | 'empty' | 'future';

interface DayData {
  date: number;
  dateStr: string;
  status: DayStatus;
  mealsCovered: MealType[];
  totalPhotos: number;
  photos: SubmittedFoodPhoto[];
}

interface FoodPhotoCalendarProps {
  photos: SubmittedFoodPhoto[];
  onSnapPhoto?: () => void;
}

// ─── Helpers ───────────────────────────────────────────────
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function formatDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getStatusColor(status: DayStatus): string {
  switch (status) {
    case 'complete': return '#2ecc71';
    case 'partial': return '#f39c12';
    case 'empty': return COLORS.borderLight;
    case 'future': return 'transparent';
  }
}

function getStatusBg(status: DayStatus): string {
  switch (status) {
    case 'complete': return '#2ecc7118';
    case 'partial': return '#f39c1218';
    case 'empty': return COLORS.borderLight + '60';
    case 'future': return 'transparent';
  }
}

// ─── Component ─────────────────────────────────────────────
export default function FoodPhotoCalendar({ photos, onSnapPhoto }: FoodPhotoCalendarProps) {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Build a lookup: dateStr → photos[]
  const photosByDate = useMemo(() => {
    const map = new Map<string, SubmittedFoodPhoto[]>();
    for (const p of photos) {
      if (!p.date) continue;
      const existing = map.get(p.date) || [];
      existing.push(p);
      map.set(p.date, existing);
    }
    return map;
  }, [photos]);

  // Build calendar grid data for current month
  const calendarDays = useMemo(() => {
    const daysInMonth = getDaysInMonth(currentYear, currentMonth);
    const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
    const todayStr = formatDateStr(today.getFullYear(), today.getMonth(), today.getDate());

    const days: (DayData | null)[] = [];

    // Leading empty cells
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = formatDateStr(currentYear, currentMonth, d);
      const isFuture = dateStr > todayStr;
      const dayPhotos = photosByDate.get(dateStr) || [];

      const mealsCovered: MealType[] = [];
      const mealsSet = new Set<MealType>();
      for (const p of dayPhotos) {
        mealsSet.add(p.meal);
      }
      for (const m of mealsSet) {
        mealsCovered.push(m);
      }

      let status: DayStatus;
      if (isFuture) {
        status = 'future';
      } else if (dayPhotos.length === 0) {
        status = 'empty';
      } else {
        const hasAllRequired = REQUIRED_MEALS.every(m => mealsSet.has(m));
        status = hasAllRequired ? 'complete' : 'partial';
      }

      days.push({
        date: d,
        dateStr,
        status,
        mealsCovered,
        totalPhotos: dayPhotos.length,
        photos: dayPhotos,
      });
    }

    return days;
  }, [currentYear, currentMonth, photosByDate]);

  // Selected day data
  const selectedDayData = useMemo(() => {
    if (!selectedDay) return null;
    return calendarDays.find(d => d?.dateStr === selectedDay) || null;
  }, [selectedDay, calendarDays]);

  // Month stats
  const monthStats = useMemo(() => {
    let complete = 0, partial = 0, empty = 0, totalPhotos = 0;

    for (const d of calendarDays) {
      if (!d || d.status === 'future') continue;
      if (d.status === 'complete') complete++;
      else if (d.status === 'partial') partial++;
      else empty++;
      totalPhotos += d.totalPhotos;
    }

    const totalDays = complete + partial + empty;
    const consistency = totalDays > 0 ? Math.round(((complete + partial) / totalDays) * 100) : 0;

    return { complete, partial, empty, totalPhotos, consistency };
  }, [calendarDays]);

  // Navigation
  const goToPrevMonth = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(y => y - 1);
    } else {
      setCurrentMonth(m => m - 1);
    }
    setSelectedDay(null);
  }, [currentMonth]);

  const goToNextMonth = useCallback(() => {
    const isCurrentMonth = currentYear === today.getFullYear() && currentMonth === today.getMonth();
    if (isCurrentMonth) return;

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(y => y + 1);
    } else {
      setCurrentMonth(m => m + 1);
    }
    setSelectedDay(null);
  }, [currentMonth, currentYear]);

  const goToToday = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
    setSelectedDay(formatDateStr(today.getFullYear(), today.getMonth(), today.getDate()));
  }, []);

  const handleDayPress = useCallback((dateStr: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedDay(prev => prev === dateStr ? null : dateStr);
  }, []);

  const isCurrentMonth = currentYear === today.getFullYear() && currentMonth === today.getMonth();
  const todayStr = formatDateStr(today.getFullYear(), today.getMonth(), today.getDate());

  // Group selected day photos by meal
  const selectedDayMeals = useMemo(() => {
    if (!selectedDayData || selectedDayData.photos.length === 0) return [];
    const mealOrder: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
    const groups: { meal: MealType; photos: SubmittedFoodPhoto[] }[] = [];

    for (const meal of mealOrder) {
      const mealPhotos = selectedDayData.photos.filter(p => p.meal === meal);
      if (mealPhotos.length > 0) {
        groups.push({ meal, photos: mealPhotos });
      }
    }
    return groups;
  }, [selectedDayData]);

  // Meals missing for selected day
  const missingMeals = useMemo(() => {
    if (!selectedDayData) return [];
    return REQUIRED_MEALS.filter(m => !selectedDayData.mealsCovered.includes(m));
  }, [selectedDayData]);

  return (
    <View style={styles.container}>
      {/* ── Month Header ── */}
      <View style={styles.monthHeader}>
        <TouchableOpacity onPress={goToPrevMonth} style={styles.navBtn} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={18} color={COLORS.text} />
        </TouchableOpacity>

        <TouchableOpacity onPress={goToToday} activeOpacity={0.7}>
          <Text style={styles.monthTitle}>
            {IS_SMALL_SCREEN ? MONTH_NAMES_SHORT[currentMonth] : MONTH_NAMES[currentMonth]} {currentYear}
          </Text>
          {!isCurrentMonth && (
            <Text style={styles.goTodayHint}>Tap for today</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={goToNextMonth}
          style={[styles.navBtn, isCurrentMonth && styles.navBtnDisabled]}
          activeOpacity={isCurrentMonth ? 1 : 0.6}
        >
          <Ionicons
            name="chevron-forward"
            size={18}
            color={isCurrentMonth ? COLORS.borderLight : COLORS.text}
          />
        </TouchableOpacity>
      </View>

      {/* ── Month Stats Bar - compact ── */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <View style={[styles.statDot, { backgroundColor: '#2ecc71' }]} />
          <Text style={styles.statLabel}>{monthStats.complete}</Text>
        </View>
        <View style={styles.statItem}>
          <View style={[styles.statDot, { backgroundColor: '#f39c12' }]} />
          <Text style={styles.statLabel}>{monthStats.partial}</Text>
        </View>
        <View style={styles.statItem}>
          <View style={[styles.statDot, { backgroundColor: COLORS.border }]} />
          <Text style={styles.statLabel}>{monthStats.empty}</Text>
        </View>
        <View style={styles.consistencyBadge}>
          <Text style={styles.consistencyText}>{monthStats.consistency}%</Text>
        </View>
      </View>

      {/* ── Weekday Headers ── */}
      <View style={styles.weekdayRow}>
        {WEEKDAYS.map((day, idx) => (
          <View key={`${day}-${idx}`} style={styles.weekdayCell}>
            <Text style={styles.weekdayText}>{day}</Text>
          </View>
        ))}
      </View>

      {/* ── Calendar Grid - compact ── */}
      <View style={styles.calendarGrid}>
        {calendarDays.map((day, idx) => {
          if (!day) {
            return <View key={`empty-${idx}`} style={styles.dayCell} />;
          }

          const isToday = day.dateStr === todayStr;
          const isSelected = day.dateStr === selectedDay;
          const isFuture = day.status === 'future';
          const statusColor = getStatusColor(day.status);
          const statusBg = getStatusBg(day.status);

          return (
            <TouchableOpacity
              key={day.dateStr}
              style={[
                styles.dayCell,
                !isFuture && { backgroundColor: statusBg },
                isSelected && styles.dayCellSelected,
                isToday && styles.dayCellToday,
              ]}
              onPress={() => !isFuture && handleDayPress(day.dateStr)}
              activeOpacity={isFuture ? 1 : 0.6}
              disabled={isFuture}
            >
              <Text style={[
                styles.dayNumber,
                isFuture && styles.dayNumberFuture,
                isToday && styles.dayNumberToday,
                isSelected && styles.dayNumberSelected,
              ]}>
                {day.date}
              </Text>

              {/* Status indicator dots */}
              {!isFuture && day.status !== 'empty' && (
                <View style={styles.dayIndicatorRow}>
                  {day.mealsCovered.slice(0, 3).map((meal, mi) => (
                    <View
                      key={mi}
                      style={[
                        styles.mealDot,
                        { backgroundColor: MEAL_CONFIG[meal]?.color || statusColor },
                      ]}
                    />
                  ))}
                </View>
              )}

              {!isFuture && day.status === 'empty' && (
                <View style={styles.dayIndicatorRow}>
                  <View style={[styles.mealDot, { backgroundColor: COLORS.border, opacity: 0.4 }]} />
                </View>
              )}

              {/* Photo count badge */}
              {day.totalPhotos > 0 && (
                <View style={[styles.photoCountBadge, { backgroundColor: statusColor }]}>
                  <Text style={styles.photoCountText}>{day.totalPhotos}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Legend - compact ── */}
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSquare, { backgroundColor: '#2ecc7118', borderColor: '#2ecc7140' }]} />
          <Text style={styles.legendText}>All</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSquare, { backgroundColor: '#f39c1218', borderColor: '#f39c1240' }]} />
          <Text style={styles.legendText}>Partial</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSquare, { backgroundColor: COLORS.borderLight + '60', borderColor: COLORS.border }]} />
          <Text style={styles.legendText}>None</Text>
        </View>
      </View>

      {/* ── Selected Day Detail Panel ── */}
      {selectedDayData && (
        <View style={styles.dayDetailPanel}>
          {/* Day detail header */}
          <View style={styles.dayDetailHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.dayDetailTitle}>
                {selectedDayData.dateStr === todayStr
                  ? 'Today'
                  : new Date(selectedDayData.dateStr + 'T12:00:00').toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })
                }
              </Text>
              <Text style={styles.dayDetailSubtitle}>
                {selectedDayData.totalPhotos} photo{selectedDayData.totalPhotos !== 1 ? 's' : ''}
                {selectedDayData.status === 'complete' && ' — All logged'}
              </Text>
            </View>

            <View style={[
              styles.dayStatusChip,
              { backgroundColor: getStatusBg(selectedDayData.status) },
            ]}>
              <Ionicons
                name={
                  selectedDayData.status === 'complete' ? 'checkmark-circle' :
                  selectedDayData.status === 'partial' ? 'ellipsis-horizontal-circle' :
                  'close-circle-outline'
                }
                size={12}
                color={getStatusColor(selectedDayData.status)}
              />
              <Text style={[styles.dayStatusText, { color: getStatusColor(selectedDayData.status) }]}>
                {selectedDayData.status === 'complete' ? 'Complete' :
                 selectedDayData.status === 'partial' ? 'Partial' : 'No Logs'}
              </Text>
            </View>
          </View>

          {/* Meal coverage indicator - compact */}
          <View style={styles.mealCoverageRow}>
            {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map(meal => {
              const hasMeal = selectedDayData.mealsCovered.includes(meal);
              const cfg = MEAL_CONFIG[meal];
              return (
                <View
                  key={meal}
                  style={[
                    styles.mealCoverageChip,
                    hasMeal
                      ? { backgroundColor: cfg.color + '15', borderColor: cfg.color + '30' }
                      : { backgroundColor: COLORS.borderLight, borderColor: COLORS.border + '40' },
                  ]}
                >
                  <Ionicons
                    name={(hasMeal ? cfg.icon.replace('-outline', '') : cfg.icon) as any}
                    size={10}
                    color={hasMeal ? cfg.color : COLORS.textMuted}
                  />
                  <Text style={[
                    styles.mealCoverageText,
                    { color: hasMeal ? cfg.color : COLORS.textMuted },
                  ]}>
                    {IS_SMALL_SCREEN ? cfg.label.substring(0, 3) : cfg.label}
                  </Text>
                  {hasMeal && (
                    <Ionicons name="checkmark" size={8} color={cfg.color} />
                  )}
                </View>
              );
            })}
          </View>

          {/* Missing meals alert */}
          {missingMeals.length > 0 && selectedDayData.dateStr === todayStr && (
            <View style={styles.missingAlert}>
              <Ionicons name="information-circle-outline" size={12} color="#f39c12" />
              <Text style={styles.missingAlertText}>
                Missing: {missingMeals.map(m => MEAL_CONFIG[m].label).join(', ')}
              </Text>
              {onSnapPhoto && (
                <TouchableOpacity
                  style={styles.missingSnapBtn}
                  onPress={onSnapPhoto}
                  activeOpacity={0.7}
                >
                  <Ionicons name="camera" size={10} color={COLORS.white} />
                  <Text style={styles.missingSnapText}>Log</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Photos grouped by meal */}
          {selectedDayMeals.length > 0 ? (
            selectedDayMeals.map(({ meal, photos: mealPhotos }) => {
              const cfg = MEAL_CONFIG[meal];
              return (
                <View key={meal} style={styles.mealGroup}>
                  <View style={styles.mealGroupHeader}>
                    <View style={[styles.mealGroupIcon, { backgroundColor: cfg.color + '15' }]}>
                      <Ionicons name={cfg.icon as any} size={12} color={cfg.color} />
                    </View>
                    <Text style={[styles.mealGroupTitle, { color: cfg.color }]}>
                      {cfg.label}
                    </Text>
                    <Text style={styles.mealGroupCount}>
                      {mealPhotos.length} photo{mealPhotos.length !== 1 ? 's' : ''}
                    </Text>
                  </View>

                  {mealPhotos.map((photo, pi) => {
                    const statusCfg = REVIEW_STATUS_CONFIG[photo.status] || REVIEW_STATUS_CONFIG.pending;
                    return (
                      <View key={photo.photoId || pi} style={styles.photoItem}>
                        {/* Photo thumbnail */}
                        {photo.photoUri ? (
                          <Image source={{ uri: photo.photoUri }} style={styles.photoThumb} />
                        ) : (
                          <View style={styles.photoThumbPlaceholder}>
                            <Ionicons name="image-outline" size={16} color={COLORS.textMuted} />
                          </View>
                        )}

                        <View style={styles.photoItemInfo}>
                          {/* Status badge */}
                          <View style={styles.photoItemBadgeRow}>
                            <View style={[styles.statusBadge, { backgroundColor: statusCfg.bgColor }]}>
                              <Ionicons name={statusCfg.icon as any} size={8} color={statusCfg.color} />
                              <Text style={[styles.statusBadgeText, { color: statusCfg.color }]}>
                                {statusCfg.label}
                              </Text>
                            </View>
                            <Text style={styles.photoItemTime}>{photo.time}</Text>
                          </View>

                          {/* Description */}
                          {photo.description ? (
                            <Text style={styles.photoItemDesc} numberOfLines={2}>
                              {photo.description}
                            </Text>
                          ) : (
                            <Text style={styles.photoItemNoDesc}>No description</Text>
                          )}

                          {/* Dietitian feedback */}
                          {photo.dietitianFeedback && (
                            <View style={styles.feedbackBox}>
                              <View style={styles.feedbackBoxHeader}>
                                <Ionicons name="chatbubble-ellipses-outline" size={9} color={COLORS.accent} />
                                <Text style={styles.feedbackBoxLabel}>Feedback</Text>
                                {photo.reviewedAt && (
                                  <Text style={styles.feedbackBoxDate}>
                                    {new Date(photo.reviewedAt).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                    })}
                                  </Text>
                                )}
                              </View>
                              <Text style={styles.feedbackBoxText}>{photo.dietitianFeedback}</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              );
            })
          ) : (
            <View style={styles.emptyDayPanel}>
              <View style={styles.emptyDayIcon}>
                <Ionicons name="camera-outline" size={20} color={COLORS.textMuted} />
              </View>
              <Text style={styles.emptyDayTitle}>No photos for this day</Text>
              <Text style={styles.emptyDaySubtitle}>
                {selectedDayData.dateStr === todayStr
                  ? 'Snap a photo to start logging!'
                  : 'No food photos submitted.'}
              </Text>
              {selectedDayData.dateStr === todayStr && onSnapPhoto && (
                <TouchableOpacity
                  style={styles.emptyDayBtn}
                  onPress={onSnapPhoto}
                  activeOpacity={0.7}
                >
                  <Ionicons name="camera" size={12} color={COLORS.white} />
                  <Text style={styles.emptyDayBtnText}>Take a Photo</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────
// Calculate compact cell height based on screen width
const CELL_WIDTH_PCT = 100 / 7;
const APPROX_CELL_WIDTH = (SCREEN_WIDTH - SPACING.sm * 2 - SPACING.md * 2) / 7;
// Use a smaller fixed height instead of aspect ratio 1:1
const CELL_HEIGHT = IS_SMALL_SCREEN ? Math.min(APPROX_CELL_WIDTH * 0.85, 42) : 44;

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    ...SHADOWS.sm,
  },

  // Month Header - compact
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.sm,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  navBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navBtnDisabled: {
    opacity: 0.3,
  },
  monthTitle: {
    fontSize: IS_SMALL_SCREEN ? FONT_SIZES.md : FONT_SIZES.xl,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
  },
  goTodayHint: {
    fontSize: 8,
    color: COLORS.accent,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 1,
  },

  // Stats Bar - compact
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statLabel: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  consistencyBadge: {
    backgroundColor: COLORS.accent + '15',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: BORDER_RADIUS.full,
  },
  consistencyText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.accent,
  },

  // Weekday Row - compact
  weekdayRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    paddingBottom: 3,
  },
  weekdayCell: {
    flex: 1,
    alignItems: 'center',
  },
  weekdayText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  // Calendar Grid - compact, no aspect ratio
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SPACING.xs,
    paddingTop: 2,
    paddingBottom: SPACING.xs,
  },
  dayCell: {
    width: `${CELL_WIDTH_PCT}%` as any,
    height: CELL_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BORDER_RADIUS.sm - 2,
    marginVertical: 1,
    position: 'relative',
  },
  dayCellSelected: {
    borderWidth: 1.5,
    borderColor: COLORS.accent,
  },
  dayCellToday: {
    borderWidth: 1,
    borderColor: COLORS.primary + '60',
  },
  dayNumber: {
    fontSize: IS_SMALL_SCREEN ? 11 : FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.text,
  },
  dayNumberFuture: {
    color: COLORS.border,
  },
  dayNumberToday: {
    fontWeight: '800',
    color: COLORS.primary,
  },
  dayNumberSelected: {
    fontWeight: '800',
    color: COLORS.accent,
  },

  // Day indicators - smaller
  dayIndicatorRow: {
    flexDirection: 'row',
    gap: 1.5,
    marginTop: 1,
  },
  mealDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },

  // Photo count badge - smaller
  photoCountBadge: {
    position: 'absolute',
    top: 1,
    right: IS_SMALL_SCREEN ? 2 : 4,
    minWidth: 12,
    height: 12,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  photoCountText: {
    fontSize: 7,
    fontWeight: '800',
    color: COLORS.white,
  },

  // Legend - compact
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  legendSquare: {
    width: 10,
    height: 10,
    borderRadius: 2,
    borderWidth: 1,
  },
  legendText: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: '600',
  },

  // ── Day Detail Panel - compact ──
  dayDetailPanel: {
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    backgroundColor: COLORS.background,
    padding: SPACING.sm,
  },
  dayDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
  },
  dayDetailTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: COLORS.text,
  },
  dayDetailSubtitle: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: '600',
    marginTop: 1,
  },
  dayStatusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },
  dayStatusText: {
    fontSize: 9,
    fontWeight: '700',
  },

  // Meal coverage - compact
  mealCoverageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  mealCoverageChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: SPACING.xs + 2,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
  },
  mealCoverageText: {
    fontSize: 9,
    fontWeight: '700',
  },

  // Missing meals alert - compact
  missingAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: '#f39c1210',
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.xs,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: '#f39c1225',
  },
  missingAlertText: {
    flex: 1,
    fontSize: 10,
    color: '#f39c12',
    fontWeight: '600',
  },
  missingSnapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.xs + 2,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },
  missingSnapText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.white,
  },

  // Meal groups - compact
  mealGroup: {
    marginBottom: SPACING.sm,
  },
  mealGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  mealGroupIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mealGroupTitle: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    flex: 1,
  },
  mealGroupCount: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: '600',
  },

  // Photo items - compact
  photoItem: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.xs,
    gap: SPACING.xs,
    marginBottom: SPACING.xs,
    ...SHADOWS.sm,
  },
  photoThumb: {
    width: IS_SMALL_SCREEN ? 48 : 60,
    height: IS_SMALL_SCREEN ? 48 : 60,
    borderRadius: BORDER_RADIUS.sm - 2,
  },
  photoThumbPlaceholder: {
    width: IS_SMALL_SCREEN ? 48 : 60,
    height: IS_SMALL_SCREEN ? 48 : 60,
    borderRadius: BORDER_RADIUS.sm - 2,
    backgroundColor: COLORS.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoItemInfo: {
    flex: 1,
  },
  photoItemBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 8,
    fontWeight: '700',
  },
  photoItemTime: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  photoItemDesc: {
    fontSize: 10,
    color: COLORS.textSecondary,
    lineHeight: 14,
  },
  photoItemNoDesc: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },

  // Feedback box - compact
  feedbackBox: {
    marginTop: SPACING.xs,
    backgroundColor: COLORS.accent + '08',
    borderRadius: BORDER_RADIUS.sm - 2,
    padding: SPACING.xs,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.accent,
  },
  feedbackBoxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 2,
  },
  feedbackBoxLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: COLORS.accent,
    flex: 1,
  },
  feedbackBoxDate: {
    fontSize: 8,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  feedbackBoxText: {
    fontSize: 10,
    color: COLORS.textSecondary,
    lineHeight: 14,
  },

  // Empty day - compact
  emptyDayPanel: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
  },
  emptyDayIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  emptyDayTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  emptyDaySubtitle: {
    fontSize: 10,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 14,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  emptyDayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: BORDER_RADIUS.full,
  },
  emptyDayBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.white,
  },
});
