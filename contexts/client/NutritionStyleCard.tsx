import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';


// ============================================================
// TYPES
// ============================================================

interface DietStyle {
  id: string;
  label: string;
  icon: string;
  color: string;
  macros: { protein: number; carbs: number; fat: number }; // percentages
  description: string;
}

interface LoggingMethod {
  id: string;
  label: string;
  icon: string;
  color: string;
}

interface TopFood {
  name: string;
  count: number;
  avgCalories: number;
  category: string;
}

interface MealTimingSlot {
  meal: string;
  icon: string;
  color: string;
  time: string;
  avgCalories: number;
}

interface NutritionStyleCardProps {
  /** Total food entries logged */
  totalEntries?: number;
  /** Number of days with at least one entry */
  daysLogged?: number;
  /** Current logging streak in days */
  streak?: number;
  /** Average daily calories from recent logs */
  avgDailyCalories?: number;
  /** Average daily protein from recent logs */
  avgDailyProtein?: number;
  /** Most frequently logged foods */
  topFoods?: TopFood[];
  /** Callback when diet style changes */
  onDietStyleChange?: (styleId: string) => void;
  /** Callback when logging methods change */
  onLoggingMethodsChange?: (methods: string[]) => void;
  /** Currently selected diet style */
  selectedDietStyle?: string;
  /** Currently preferred logging methods */
  preferredMethods?: string[];
}

// ============================================================
// DATA
// ============================================================

const DIET_STYLES: DietStyle[] = [
  {
    id: 'balanced',
    label: 'Balanced',
    icon: 'pie-chart-outline',
    color: '#3498db',
    macros: { protein: 30, carbs: 40, fat: 30 },
    description: 'Even macro split for general health',
  },
  {
    id: 'high-protein',
    label: 'High Protein',
    icon: 'barbell-outline',
    color: '#e74c3c',
    macros: { protein: 40, carbs: 30, fat: 30 },
    description: 'Muscle building & recovery focus',
  },
  {
    id: 'low-carb',
    label: 'Low Carb',
    icon: 'leaf-outline',
    color: '#2ecc71',
    macros: { protein: 35, carbs: 20, fat: 45 },
    description: 'Reduced carbs for fat loss',
  },
  {
    id: 'keto',
    label: 'Keto',
    icon: 'flame-outline',
    color: '#f39c12',
    macros: { protein: 25, carbs: 5, fat: 70 },
    description: 'Very low carb, high fat',
  },
  {
    id: 'mediterranean',
    label: 'Mediterranean',
    icon: 'fish-outline',
    color: '#1abc9c',
    macros: { protein: 25, carbs: 45, fat: 30 },
    description: 'Heart-healthy whole foods',
  },
  {
    id: 'custom',
    label: 'Custom',
    icon: 'options-outline',
    color: '#9b59b6',
    macros: { protein: 33, carbs: 34, fat: 33 },
    description: 'Your own macro targets',
  },
];

const LOGGING_METHODS: LoggingMethod[] = [
  { id: 'manual', label: 'Manual Entry', icon: 'create-outline', color: '#3498db' },
  { id: 'photo', label: 'Photo Snap', icon: 'camera-outline', color: COLORS.accent },
  { id: 'mfp', label: 'MFP Import', icon: 'sync-outline', color: '#00b248' },
  { id: 'barcode', label: 'Barcode Scan', icon: 'barcode-outline', color: '#9b59b6' },
];

const DEFAULT_TOP_FOODS: TopFood[] = [
  { name: 'Grilled Chicken Breast', count: 24, avgCalories: 320, category: 'Protein' },
  { name: 'Brown Rice', count: 18, avgCalories: 215, category: 'Carbs' },
  { name: 'Egg White Omelette', count: 16, avgCalories: 280, category: 'Protein' },
  { name: 'Protein Shake', count: 14, avgCalories: 240, category: 'Supplement' },
  { name: 'Baked Salmon', count: 12, avgCalories: 350, category: 'Protein' },
];

const MEAL_TIMING: MealTimingSlot[] = [
  { meal: 'Breakfast', icon: 'sunny-outline', color: '#f39c12', time: '6:30 AM', avgCalories: 415 },
  { meal: 'Lunch', icon: 'restaurant-outline', color: '#2ecc71', time: '12:30 PM', avgCalories: 620 },
  { meal: 'Snack', icon: 'cafe-outline', color: '#9b59b6', time: '3:30 PM', avgCalories: 340 },
  { meal: 'Dinner', icon: 'moon-outline', color: '#3498db', time: '6:30 PM', avgCalories: 585 },
];

// ============================================================
// COMPONENT
// ============================================================

export default function NutritionStyleCard({
  totalEntries = 156,
  daysLogged = 42,
  streak = 12,
  avgDailyCalories = 2180,
  avgDailyProtein = 178,
  topFoods = DEFAULT_TOP_FOODS,
  onDietStyleChange,
  onLoggingMethodsChange,
  selectedDietStyle: initialDietStyle = 'high-protein',
  preferredMethods: initialMethods = ['manual', 'photo'],
}: NutritionStyleCardProps) {
  const [activeDietStyle, setActiveDietStyle] = useState(initialDietStyle);
  const [activeMethods, setActiveMethods] = useState<string[]>(initialMethods);
  const [showAllFoods, setShowAllFoods] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>('style');

  const currentDiet = useMemo(
    () => DIET_STYLES.find(d => d.id === activeDietStyle) || DIET_STYLES[0],
    [activeDietStyle]
  );

  const handleDietStyleSelect = (styleId: string) => {
    setActiveDietStyle(styleId);
    onDietStyleChange?.(styleId);
  };

  const handleMethodToggle = (methodId: string) => {
    setActiveMethods(prev => {
      const next = prev.includes(methodId)
        ? prev.filter(m => m !== methodId)
        : [...prev, methodId];
      onLoggingMethodsChange?.(next);
      return next;
    });
  };

  const toggleSection = (section: string) => {
    setExpandedSection(prev => (prev === section ? null : section));
  };

  const displayedFoods = showAllFoods ? topFoods : topFoods.slice(0, 3);

  // Consistency score
  const consistencyPct = Math.min(Math.round((daysLogged / 60) * 100), 100);

  return (
    <View style={styles.wrapper}>
      {/* ── Logging Stats Row ── */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <View style={[styles.statIconWrap, { backgroundColor: '#3498db15' }]}>
            <Ionicons name="document-text-outline" size={16} color="#3498db" />
          </View>
          <Text style={styles.statValue}>{totalEntries}</Text>
          <Text style={styles.statLabel}>Entries</Text>
        </View>
        <View style={styles.statBox}>
          <View style={[styles.statIconWrap, { backgroundColor: '#2ecc7115' }]}>
            <Ionicons name="calendar-outline" size={16} color="#2ecc71" />
          </View>
          <Text style={styles.statValue}>{daysLogged}</Text>
          <Text style={styles.statLabel}>Days Logged</Text>
        </View>
        <View style={styles.statBox}>
          <View style={[styles.statIconWrap, { backgroundColor: '#f39c1215' }]}>
            <Ionicons name="flame-outline" size={16} color="#f39c12" />
          </View>
          <Text style={styles.statValue}>{streak}</Text>
          <Text style={styles.statLabel}>Day Streak</Text>
        </View>
        <View style={styles.statBox}>
          <View style={[styles.statIconWrap, { backgroundColor: '#9b59b615' }]}>
            <Ionicons name="trending-up-outline" size={16} color="#9b59b6" />
          </View>
          <Text style={styles.statValue}>{consistencyPct}%</Text>
          <Text style={styles.statLabel}>Consistency</Text>
        </View>
      </View>

      {/* ── Diet Style Section ── */}
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => toggleSection('style')}
        activeOpacity={0.7}
      >
        <View style={styles.sectionHeaderLeft}>
          <View style={[styles.sectionIcon, { backgroundColor: currentDiet.color + '15' }]}>
            <Ionicons name={currentDiet.icon as any} size={16} color={currentDiet.color} />
          </View>
          <View>
            <Text style={styles.sectionHeaderTitle}>Diet Style</Text>
            <Text style={styles.sectionHeaderSub}>{currentDiet.label} — {currentDiet.description}</Text>
          </View>
        </View>
        <Ionicons
          name={expandedSection === 'style' ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={COLORS.textMuted}
        />
      </TouchableOpacity>

      {expandedSection === 'style' && (
        <View style={styles.sectionBody}>
          {/* Diet Style Chips */}
          <View style={styles.chipGrid}>
            {DIET_STYLES.map(diet => {
              const isActive = diet.id === activeDietStyle;
              return (
                <TouchableOpacity
                  key={diet.id}
                  style={[
                    styles.dietChip,
                    isActive && { backgroundColor: diet.color + '15', borderColor: diet.color },
                  ]}
                  onPress={() => handleDietStyleSelect(diet.id)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={diet.icon as any}
                    size={14}
                    color={isActive ? diet.color : COLORS.textMuted}
                  />
                  <Text
                    style={[
                      styles.dietChipText,
                      isActive && { color: diet.color, fontWeight: '800' },
                    ]}
                  >
                    {diet.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Macro Split Bar */}
          <View style={styles.macroSplitCard}>
            <Text style={styles.macroSplitTitle}>Target Macro Split</Text>
            <View style={styles.macroBar}>
              <View
                style={[
                  styles.macroSegment,
                  {
                    flex: currentDiet.macros.protein,
                    backgroundColor: '#3498db',
                    borderTopLeftRadius: 6,
                    borderBottomLeftRadius: 6,
                  },
                ]}
              />
              <View
                style={[
                  styles.macroSegment,
                  { flex: currentDiet.macros.carbs, backgroundColor: '#2ecc71' },
                ]}
              />
              <View
                style={[
                  styles.macroSegment,
                  {
                    flex: currentDiet.macros.fat,
                    backgroundColor: '#f39c12',
                    borderTopRightRadius: 6,
                    borderBottomRightRadius: 6,
                  },
                ]}
              />
            </View>
            <View style={styles.macroLegend}>
              <View style={styles.macroLegendItem}>
                <View style={[styles.macroLegendDot, { backgroundColor: '#3498db' }]} />
                <Text style={styles.macroLegendLabel}>Protein {currentDiet.macros.protein}%</Text>
              </View>
              <View style={styles.macroLegendItem}>
                <View style={[styles.macroLegendDot, { backgroundColor: '#2ecc71' }]} />
                <Text style={styles.macroLegendLabel}>Carbs {currentDiet.macros.carbs}%</Text>
              </View>
              <View style={styles.macroLegendItem}>
                <View style={[styles.macroLegendDot, { backgroundColor: '#f39c12' }]} />
                <Text style={styles.macroLegendLabel}>Fat {currentDiet.macros.fat}%</Text>
              </View>
            </View>
          </View>

          {/* Daily Averages */}
          <View style={styles.avgRow}>
            <View style={styles.avgBox}>
              <Ionicons name="flash-outline" size={14} color="#ff6b6b" />
              <Text style={styles.avgValue}>{avgDailyCalories}</Text>
              <Text style={styles.avgLabel}>Avg Cal/Day</Text>
            </View>
            <View style={styles.avgDivider} />
            <View style={styles.avgBox}>
              <Ionicons name="barbell-outline" size={14} color="#3498db" />
              <Text style={styles.avgValue}>{avgDailyProtein}g</Text>
              <Text style={styles.avgLabel}>Avg Protein/Day</Text>
            </View>
          </View>
        </View>
      )}

      {/* ── Logging Methods Section ── */}
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => toggleSection('methods')}
        activeOpacity={0.7}
      >
        <View style={styles.sectionHeaderLeft}>
          <View style={[styles.sectionIcon, { backgroundColor: COLORS.accent + '15' }]}>
            <Ionicons name="apps-outline" size={16} color={COLORS.accent} />
          </View>
          <View>
            <Text style={styles.sectionHeaderTitle}>Logging Methods</Text>
            <Text style={styles.sectionHeaderSub}>
              {activeMethods.length} method{activeMethods.length !== 1 ? 's' : ''} active
            </Text>
          </View>
        </View>
        <Ionicons
          name={expandedSection === 'methods' ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={COLORS.textMuted}
        />
      </TouchableOpacity>

      {expandedSection === 'methods' && (
        <View style={styles.sectionBody}>
          <View style={styles.methodGrid}>
            {LOGGING_METHODS.map(method => {
              const isActive = activeMethods.includes(method.id);
              return (
                <TouchableOpacity
                  key={method.id}
                  style={[
                    styles.methodCard,
                    isActive && {
                      backgroundColor: method.color + '10',
                      borderColor: method.color,
                    },
                  ]}
                  onPress={() => handleMethodToggle(method.id)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.methodIconWrap,
                      {
                        backgroundColor: isActive ? method.color + '20' : COLORS.borderLight,
                      },
                    ]}
                  >
                    <Ionicons
                      name={method.icon as any}
                      size={20}
                      color={isActive ? method.color : COLORS.textMuted}
                    />
                  </View>
                  <Text
                    style={[
                      styles.methodLabel,
                      isActive && { color: method.color, fontWeight: '800' },
                    ]}
                  >
                    {method.label}
                  </Text>
                  <View
                    style={[
                      styles.methodCheck,
                      isActive && { backgroundColor: method.color, borderColor: method.color },
                    ]}
                  >
                    {isActive && <Ionicons name="checkmark" size={12} color={COLORS.white} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* ── Meal Timing Section ── */}
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => toggleSection('timing')}
        activeOpacity={0.7}
      >
        <View style={styles.sectionHeaderLeft}>
          <View style={[styles.sectionIcon, { backgroundColor: '#f39c1215' }]}>
            <Ionicons name="time-outline" size={16} color="#f39c12" />
          </View>
          <View>
            <Text style={styles.sectionHeaderTitle}>Meal Timing</Text>
            <Text style={styles.sectionHeaderSub}>Typical eating schedule</Text>
          </View>
        </View>
        <Ionicons
          name={expandedSection === 'timing' ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={COLORS.textMuted}
        />
      </TouchableOpacity>

      {expandedSection === 'timing' && (
        <View style={styles.sectionBody}>
          {MEAL_TIMING.map((slot, i) => {
            const maxCal = Math.max(...MEAL_TIMING.map(s => s.avgCalories));
            const barPct = (slot.avgCalories / maxCal) * 100;
            return (
              <View key={slot.meal} style={styles.timingRow}>
                <View style={[styles.timingIcon, { backgroundColor: slot.color + '15' }]}>
                  <Ionicons name={slot.icon as any} size={16} color={slot.color} />
                </View>
                <View style={styles.timingInfo}>
                  <View style={styles.timingTop}>
                    <Text style={styles.timingMeal}>{slot.meal}</Text>
                    <Text style={styles.timingTime}>{slot.time}</Text>
                  </View>
                  <View style={styles.timingBarBg}>
                    <View
                      style={[
                        styles.timingBarFill,
                        { width: `${barPct}%`, backgroundColor: slot.color },
                      ]}
                    />
                  </View>
                  <Text style={styles.timingCal}>{slot.avgCalories} avg cal</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* ── Top Foods Section ── */}
      <TouchableOpacity
        style={[styles.sectionHeader, { borderBottomWidth: expandedSection === 'foods' ? 0 : 0 }]}
        onPress={() => toggleSection('foods')}
        activeOpacity={0.7}
      >
        <View style={styles.sectionHeaderLeft}>
          <View style={[styles.sectionIcon, { backgroundColor: '#2ecc7115' }]}>
            <Ionicons name="nutrition-outline" size={16} color="#2ecc71" />
          </View>
          <View>
            <Text style={styles.sectionHeaderTitle}>Top Foods</Text>
            <Text style={styles.sectionHeaderSub}>Most frequently logged</Text>
          </View>
        </View>
        <Ionicons
          name={expandedSection === 'foods' ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={COLORS.textMuted}
        />
      </TouchableOpacity>

      {expandedSection === 'foods' && (
        <View style={styles.sectionBody}>
          {displayedFoods.map((food, i) => {
            const maxCount = Math.max(...topFoods.map(f => f.count));
            const barPct = (food.count / maxCount) * 100;
            const categoryColor =
              food.category === 'Protein'
                ? '#3498db'
                : food.category === 'Carbs'
                ? '#2ecc71'
                : food.category === 'Supplement'
                ? '#9b59b6'
                : '#f39c12';

            return (
              <View key={i} style={styles.foodRow}>
                <View style={styles.foodRank}>
                  <Text style={styles.foodRankText}>#{i + 1}</Text>
                </View>
                <View style={styles.foodInfo}>
                  <View style={styles.foodNameRow}>
                    <Text style={styles.foodNameText} numberOfLines={1}>
                      {food.name}
                    </Text>
                    <View style={[styles.foodCategoryBadge, { backgroundColor: categoryColor + '15' }]}>
                      <Text style={[styles.foodCategoryText, { color: categoryColor }]}>
                        {food.category}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.foodBarBg}>
                    <View
                      style={[
                        styles.foodBarFill,
                        { width: `${barPct}%`, backgroundColor: categoryColor },
                      ]}
                    />
                  </View>
                  <Text style={styles.foodMeta}>
                    Logged {food.count}x · ~{food.avgCalories} cal
                  </Text>
                </View>
              </View>
            );
          })}

          {topFoods.length > 3 && (
            <TouchableOpacity
              style={styles.showMoreBtn}
              onPress={() => setShowAllFoods(!showAllFoods)}
              activeOpacity={0.7}
            >
              <Text style={styles.showMoreText}>
                {showAllFoods ? 'Show Less' : `Show All ${topFoods.length} Foods`}
              </Text>
              <Ionicons
                name={showAllFoods ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={COLORS.accent}
              />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

// ============================================================
// STYLES
// ============================================================

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    ...SHADOWS.sm,
  },

  // ── Stats Row ──
  statsRow: {
    flexDirection: 'row',
    padding: SPACING.md,
    gap: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statValue: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.text,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textMuted,
    textAlign: 'center',
  },

  // ── Section Headers ──
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
  },
  sectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionHeaderTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.text,
  },
  sectionHeaderSub: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 1,
  },

  // ── Section Body ──
  sectionBody: {
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },

  // ── Diet Style Chips ──
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  dietChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  dietChipText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },

  // ── Macro Split Bar ──
  macroSplitCard: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  macroSplitTitle: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  macroBar: {
    flexDirection: 'row',
    height: 14,
    borderRadius: 7,
    overflow: 'hidden',
    gap: 2,
  },
  macroSegment: {
    height: '100%',
  },
  macroLegend: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: SPACING.sm,
  },
  macroLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  macroLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  macroLegendLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },

  // ── Daily Averages ──
  avgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
  },
  avgBox: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  avgValue: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: COLORS.text,
  },
  avgLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  avgDivider: {
    width: 1,
    height: 36,
    backgroundColor: COLORS.border,
  },

  // ── Logging Methods ──
  methodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  methodCard: {
    width: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  methodIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  methodLabel: {
    flex: 1,
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  methodCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Meal Timing ──
  timingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  timingIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timingInfo: {
    flex: 1,
  },
  timingTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  timingMeal: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.text,
  },
  timingTime: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  timingBarBg: {
    height: 6,
    backgroundColor: COLORS.borderLight,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 3,
  },
  timingBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  timingCal: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textMuted,
  },

  // ── Top Foods ──
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  foodRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  foodRankText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '800',
    color: COLORS.textMuted,
  },
  foodInfo: {
    flex: 1,
  },
  foodNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  foodNameText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
    marginRight: SPACING.sm,
  },
  foodCategoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },
  foodCategoryText: {
    fontSize: 9,
    fontWeight: '700',
  },
  foodBarBg: {
    height: 5,
    backgroundColor: COLORS.borderLight,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 3,
  },
  foodBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  foodMeta: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textMuted,
  },

  // ── Show More ──
  showMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: SPACING.sm,
  },
  showMoreText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.accent,
  },
});
