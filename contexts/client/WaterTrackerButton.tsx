import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../../constants/theme';

interface WaterTrackerButtonProps {
  glasses: number;
  goal: number;
  onAdd: () => void;
  onRemove: () => void;
  saving?: boolean;
}

const WATER_COLOR = '#3498db';
const WATER_LIGHT = '#ebf5fb';
const WATER_DARK = '#2980b9';

export default function WaterTrackerButton({
  glasses,
  goal,
  onAdd,
  onRemove,
  saving = false,
}: WaterTrackerButtonProps) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const rippleAnim = useRef(new Animated.Value(0)).current;
  const feedbackOpacity = useRef(new Animated.Value(0)).current;
  const feedbackTranslateY = useRef(new Animated.Value(0)).current;
  const waveAnim = useRef(new Animated.Value(0)).current;

  const pct = Math.min((glasses / goal) * 100, 100);
  const isComplete = glasses >= goal;

  // Continuous subtle wave animation
  useEffect(() => {
    const wave = Animated.loop(
      Animated.sequence([
        Animated.timing(waveAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(waveAnim, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    wave.start();
    return () => wave.stop();
  }, []);

  const triggerFeedback = (text: string) => {
    setFeedbackText(text);
    setShowFeedback(true);
    feedbackOpacity.setValue(1);
    feedbackTranslateY.setValue(0);

    Animated.parallel([
      Animated.timing(feedbackOpacity, {
        toValue: 0,
        duration: 1200,
        useNativeDriver: true,
      }),
      Animated.timing(feedbackTranslateY, {
        toValue: -40,
        duration: 1200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => setShowFeedback(false));
  };

  const handleTap = () => {
    // Bounce animation
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.85,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 3,
        tension: 200,
        useNativeDriver: true,
      }),
    ]).start();

    // Ripple animation
    rippleAnim.setValue(0);
    Animated.timing(rippleAnim, {
      toValue: 1,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    onAdd();

    const newCount = glasses + 1;
    if (newCount >= goal) {
      triggerFeedback('Goal reached!');
    } else if (newCount === Math.floor(goal / 2)) {
      triggerFeedback('Halfway there!');
    } else {
      triggerFeedback(`+1 glass`);
    }
  };

  const handleLongPress = () => {
    if (glasses > 0) {
      onRemove();
      triggerFeedback('-1 glass');
    }
  };

  const rippleScale = rippleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 2.5],
  });
  const rippleOpacity = rippleAnim.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [0.3, 0.15, 0],
  });

  const waveTranslateX = waveAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-2, 2],
  });

  const getMessage = () => {
    if (isComplete) return 'Hydration goal met!';
    if (glasses === 0) return 'Tap to log water';
    const remaining = goal - glasses;
    return `${remaining} more to go`;
  };

  return (
    <View style={styles.container}>
      {/* Floating Feedback */}
      {showFeedback && (
        <Animated.View
          style={[
            styles.feedbackBubble,
            {
              opacity: feedbackOpacity,
              transform: [{ translateY: feedbackTranslateY }],
            },
          ]}
        >
          <Text style={styles.feedbackText}>{feedbackText}</Text>
        </Animated.View>
      )}

      {/* Main Button */}
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <TouchableOpacity
          style={[
            styles.button,
            isComplete && styles.buttonComplete,
          ]}
          onPress={handleTap}
          onLongPress={handleLongPress}
          activeOpacity={0.8}
          delayLongPress={400}
        >
          {/* Ripple Effect */}
          <Animated.View
            style={[
              styles.ripple,
              {
                transform: [{ scale: rippleScale }],
                opacity: rippleOpacity,
              },
            ]}
          />

          {/* Water Fill Level */}
          <View style={styles.fillContainer}>
            <Animated.View
              style={[
                styles.waterFill,
                {
                  height: `${pct}%`,
                  backgroundColor: isComplete ? '#27ae60' : WATER_COLOR,
                  transform: [{ translateX: waveTranslateX }],
                },
              ]}
            />
          </View>

          {/* Icon */}
          <View style={styles.iconContainer}>
            <Ionicons
              name={isComplete ? 'checkmark-circle' : 'water'}
              size={28}
              color={COLORS.white}
            />
          </View>
        </TouchableOpacity>
      </Animated.View>

      {/* Count + Label */}
      <View style={styles.infoContainer}>
        <Text style={[styles.count, isComplete && styles.countComplete]}>
          {glasses}
          <Text style={styles.countGoal}>/{goal}</Text>
        </Text>
        <Text style={[styles.label, isComplete && styles.labelComplete]}>
          {getMessage()}
        </Text>
      </View>
    </View>
  );
}

// ── Expanded Water Tracker Section ──
// A full-width card version for the journal page

interface WaterTrackerSectionProps {
  glasses: number;
  goal: number;
  onGlassChange: (count: number) => void;
  saving?: boolean;
  isOfflineQueued?: boolean;
}


export function WaterTrackerSection({
  glasses,
  goal,
  onGlassChange,
  saving = false,
  isOfflineQueued = false,
}: WaterTrackerSectionProps) {
  const [lastTapped, setLastTapped] = useState<number | null>(null);
  const scaleAnims = useRef<Animated.Value[]>(
    Array.from({ length: 16 }, () => new Animated.Value(1))
  ).current;

  const pct = Math.min((glasses / goal) * 100, 100);
  const isComplete = glasses >= goal;

  const handleGlassTap = (index: number) => {
    const newCount = index + 1;
    // If tapping the same glass that's already the last one, toggle it off
    if (newCount === glasses) {
      onGlassChange(glasses - 1);
    } else {
      onGlassChange(newCount);
    }
    setLastTapped(index);

    // Animate the tapped glass
    Animated.sequence([
      Animated.timing(scaleAnims[index], {
        toValue: 1.3,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnims[index], {
        toValue: 1,
        friction: 4,
        tension: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const getEncouragementText = () => {
    if (glasses === 0) return 'Tap a drop to start tracking';
    if (isComplete) return 'Amazing! You hit your hydration goal!';
    if (pct >= 75) return 'Almost there! Keep drinking!';
    if (pct >= 50) return 'Halfway to your goal!';
    if (pct >= 25) return 'Good start! Keep it up!';
    return `${goal - glasses} glasses to go`;
  };

  return (
    <View style={sectionStyles.container}>
      {/* Header */}
      <View style={sectionStyles.header}>
        <View style={sectionStyles.headerLeft}>
          <View style={[sectionStyles.iconCircle, isComplete && sectionStyles.iconCircleComplete]}>
            <Ionicons
              name={isComplete ? 'checkmark-circle' : 'water'}
              size={20}
              color={isComplete ? '#27ae60' : WATER_COLOR}
            />
          </View>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={sectionStyles.title}>Water Intake</Text>
              {isOfflineQueued && (
                <View style={sectionStyles.offlineBadge}>
                  <Ionicons name="cloud-offline-outline" size={10} color="#f39c12" />
                  <Text style={sectionStyles.offlineBadgeText}>Queued</Text>
                </View>
              )}
            </View>
            <Text style={sectionStyles.subtitle}>{getEncouragementText()}</Text>
          </View>
        </View>
        <View style={sectionStyles.countBadge}>
          <Text style={[sectionStyles.countText, isComplete && sectionStyles.countTextComplete]}>
            {glasses}/{goal}
          </Text>
          {saving && (
            <View style={sectionStyles.savingDot} />
          )}
          {isOfflineQueued && !saving && (
            <View style={sectionStyles.offlineDot} />
          )}
        </View>
      </View>


      {/* Progress Bar */}
      <View style={sectionStyles.progressBar}>
        <View
          style={[
            sectionStyles.progressFill,
            {
              width: `${pct}%`,
              backgroundColor: isComplete ? '#27ae60' : WATER_COLOR,
            },
          ]}
        />
        {/* Milestone markers */}
        <View style={[sectionStyles.milestone, { left: '25%' }]} />
        <View style={[sectionStyles.milestone, { left: '50%' }]} />
        <View style={[sectionStyles.milestone, { left: '75%' }]} />
      </View>

      {/* Water Drops Grid */}
      <View style={sectionStyles.dropsGrid}>
        {Array.from({ length: goal }, (_, i) => {
          const isFilled = i < glasses;
          return (
            <Animated.View
              key={i}
              style={{ transform: [{ scale: scaleAnims[i] }] }}
            >
              <TouchableOpacity
                style={[
                  sectionStyles.dropButton,
                  isFilled && sectionStyles.dropButtonFilled,
                  isComplete && isFilled && sectionStyles.dropButtonComplete,
                ]}
                onPress={() => handleGlassTap(i)}
                activeOpacity={0.6}
              >
                <Ionicons
                  name={isFilled ? 'water' : 'water-outline'}
                  size={20}
                  color={
                    isFilled
                      ? isComplete
                        ? '#27ae60'
                        : WATER_COLOR
                      : COLORS.border
                  }
                />
                {isFilled && (
                  <Text style={[
                    sectionStyles.dropNumber,
                    isComplete && sectionStyles.dropNumberComplete,
                  ]}>
                    {i + 1}
                  </Text>
                )}
              </TouchableOpacity>
            </Animated.View>
          );
        })}

        {/* Quick Add Button (if under goal) */}
        {glasses < goal && (
          <TouchableOpacity
            style={sectionStyles.quickAddBtn}
            onPress={() => onGlassChange(glasses + 1)}
            activeOpacity={0.6}
          >
            <Ionicons name="add" size={20} color={WATER_COLOR} />
          </TouchableOpacity>
        )}
      </View>

      {/* Quick Actions */}
      <View style={sectionStyles.quickActions}>
        <TouchableOpacity
          style={sectionStyles.quickActionBtn}
          onPress={() => onGlassChange(Math.max(0, glasses - 1))}
          disabled={glasses === 0}
          activeOpacity={0.6}
        >
          <Ionicons
            name="remove-circle-outline"
            size={16}
            color={glasses === 0 ? COLORS.border : WATER_DARK}
          />
          <Text style={[
            sectionStyles.quickActionText,
            glasses === 0 && sectionStyles.quickActionTextDisabled,
          ]}>
            Undo Last
          </Text>
        </TouchableOpacity>

        <Text style={sectionStyles.holdHint}>
          Hold to remove
        </Text>

        <TouchableOpacity
          style={sectionStyles.quickActionBtn}
          onPress={() => onGlassChange(0)}
          disabled={glasses === 0}
          activeOpacity={0.6}
        >
          <Ionicons
            name="refresh-outline"
            size={16}
            color={glasses === 0 ? COLORS.border : COLORS.textMuted}
          />
          <Text style={[
            sectionStyles.quickActionText,
            glasses === 0 && sectionStyles.quickActionTextDisabled,
          ]}>
            Reset
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Compact Inline Water Button ──
// For placing next to the Snap button in the header

interface InlineWaterButtonProps {
  glasses: number;
  goal: number;
  onPress: () => void;
}

export function InlineWaterButton({ glasses, goal, onPress }: InlineWaterButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const isComplete = glasses >= goal;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.85,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 4,
        tension: 300,
        useNativeDriver: true,
      }),
    ]).start();
    onPress();
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[
          inlineStyles.button,
          isComplete && inlineStyles.buttonComplete,
        ]}
        onPress={handlePress}
        activeOpacity={0.7}
      >
        <Ionicons
          name="water"
          size={14}
          color={isComplete ? '#27ae60' : WATER_COLOR}
        />
        <Text style={[
          inlineStyles.text,
          isComplete && inlineStyles.textComplete,
        ]}>
          {glasses}/{goal}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Styles ──

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: SPACING.sm,
  },
  feedbackBubble: {
    position: 'absolute',
    top: -30,
    zIndex: 10,
    backgroundColor: WATER_COLOR,
    paddingHorizontal: SPACING.md,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
  },
  feedbackText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '800',
    color: COLORS.white,
  },
  button: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: WATER_COLOR,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    ...SHADOWS.md,
  },
  buttonComplete: {
    backgroundColor: '#27ae60',
  },
  ripple: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.white,
  },
  fillContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    top: 0,
    overflow: 'hidden',
    borderRadius: 32,
  },
  waterFill: {
    position: 'absolute',
    bottom: 0,
    left: -4,
    right: -4,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    opacity: 0.3,
  },
  iconContainer: {
    zIndex: 2,
  },
  infoContainer: {
    alignItems: 'center',
  },
  count: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: WATER_COLOR,
  },
  countComplete: {
    color: '#27ae60',
  },
  countGoal: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  label: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginTop: 1,
  },
  labelComplete: {
    color: '#27ae60',
  },
});

const sectionStyles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: WATER_LIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconCircleComplete: {
    backgroundColor: '#d5f5e3',
  },
  title: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
    marginTop: 1,
  },
  countBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: WATER_LIGHT,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
  },
  countText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: WATER_COLOR,
  },
  countTextComplete: {
    color: '#27ae60',
  },
  savingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#f39c12',
  },
  offlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#f39c12',
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#f39c1210',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#f39c1225',
  },
  offlineBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#f39c12',
  },

  progressBar: {
    height: 6,
    backgroundColor: COLORS.borderLight,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: SPACING.lg,
    position: 'relative',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  milestone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: COLORS.white,
    opacity: 0.5,
  },
  dropsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  dropButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropButtonFilled: {
    backgroundColor: WATER_LIGHT,
    borderWidth: 1.5,
    borderColor: WATER_COLOR + '40',
  },
  dropButtonComplete: {
    backgroundColor: '#d5f5e3',
    borderColor: '#27ae6040',
  },
  dropNumber: {
    position: 'absolute',
    bottom: 2,
    fontSize: 7,
    fontWeight: '800',
    color: WATER_COLOR,
  },
  dropNumberComplete: {
    color: '#27ae60',
  },
  quickAddBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: WATER_COLOR + '30',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingTop: SPACING.sm,
  },
  quickActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: SPACING.sm,
  },
  quickActionText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  quickActionTextDisabled: {
    color: COLORS.border,
  },
  holdHint: {
    fontSize: 9,
    color: COLORS.border,
    fontWeight: '600',
  },
});

const inlineStyles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: WATER_LIGHT,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: WATER_COLOR + '40',
    minWidth: 60,
    justifyContent: 'center',
  },
  buttonComplete: {
    backgroundColor: '#d5f5e3',
    borderColor: '#27ae6040',
  },
  text: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '800',
    color: WATER_COLOR,
  },
  textComplete: {
    color: '#27ae60',
  },
});
