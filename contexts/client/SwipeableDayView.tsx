import React, { useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  PanResponder,
  Animated,
  Dimensions,
} from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = 50; // Minimum horizontal distance to trigger a swipe
const SWIPE_VELOCITY_THRESHOLD = 0.3; // Minimum velocity to trigger a swipe
const VERTICAL_DISMISS = 20; // If vertical movement exceeds this, cancel swipe

interface SwipeableDayViewProps {
  children: React.ReactNode;
  onSwipeLeft: () => void; // Go to next day
  onSwipeRight: () => void; // Go to previous day
  canSwipeLeft?: boolean; // Can go to next day (disabled for future dates)
}

export default function SwipeableDayView({
  children,
  onSwipeLeft,
  onSwipeRight,
  canSwipeLeft = true,
}: SwipeableDayViewProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only capture horizontal gestures
        const { dx, dy } = gestureState;
        return Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10;
      },
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        // Don't capture if vertical movement is dominant
        const { dx, dy } = gestureState;
        return Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 15;
      },
      onPanResponderGrant: () => {
        // Reset values
      },
      onPanResponderMove: (_, gestureState) => {
        const { dx, dy } = gestureState;

        // Cancel if too much vertical movement
        if (Math.abs(dy) > VERTICAL_DISMISS * 3) return;

        // Limit the drag distance and add resistance
        let clampedDx = dx;

        // Add resistance when swiping left and can't go forward
        if (dx < 0 && !canSwipeLeft) {
          clampedDx = dx * 0.2;
        }

        // Add rubber-band resistance at edges
        const resistance = 0.4;
        if (Math.abs(clampedDx) > SCREEN_WIDTH * 0.3) {
          const excess = Math.abs(clampedDx) - SCREEN_WIDTH * 0.3;
          clampedDx =
            (SCREEN_WIDTH * 0.3 + excess * resistance) *
            (clampedDx > 0 ? 1 : -1);
        }

        translateX.setValue(clampedDx);

        // Fade content slightly as it moves
        const progress = Math.min(Math.abs(clampedDx) / SCREEN_WIDTH, 0.3);
        opacity.setValue(1 - progress * 0.5);
      },
      onPanResponderRelease: (_, gestureState) => {
        const { dx, vx } = gestureState;

        const isSwipeRight =
          dx > SWIPE_THRESHOLD || (dx > 0 && vx > SWIPE_VELOCITY_THRESHOLD);
        const isSwipeLeft =
          dx < -SWIPE_THRESHOLD || (dx < 0 && vx < -SWIPE_VELOCITY_THRESHOLD);

        if (isSwipeRight) {
          // Swipe right → previous day
          Animated.parallel([
            Animated.timing(translateX, {
              toValue: SCREEN_WIDTH * 0.4,
              duration: 150,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0.3,
              duration: 150,
              useNativeDriver: true,
            }),
          ]).start(() => {
            onSwipeRight();
            // Animate in from the left
            translateX.setValue(-SCREEN_WIDTH * 0.3);
            Animated.parallel([
              Animated.spring(translateX, {
                toValue: 0,
                tension: 100,
                friction: 12,
                useNativeDriver: true,
              }),
              Animated.timing(opacity, {
                toValue: 1,
                duration: 200,
                useNativeDriver: true,
              }),
            ]).start();
          });
        } else if (isSwipeLeft && canSwipeLeft) {
          // Swipe left → next day
          Animated.parallel([
            Animated.timing(translateX, {
              toValue: -SCREEN_WIDTH * 0.4,
              duration: 150,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0.3,
              duration: 150,
              useNativeDriver: true,
            }),
          ]).start(() => {
            onSwipeLeft();
            // Animate in from the right
            translateX.setValue(SCREEN_WIDTH * 0.3);
            Animated.parallel([
              Animated.spring(translateX, {
                toValue: 0,
                tension: 100,
                friction: 12,
                useNativeDriver: true,
              }),
              Animated.timing(opacity, {
                toValue: 1,
                duration: 200,
                useNativeDriver: true,
              }),
            ]).start();
          });
        } else {
          // Snap back
          Animated.parallel([
            Animated.spring(translateX, {
              toValue: 0,
              tension: 120,
              friction: 10,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 1,
              duration: 150,
              useNativeDriver: true,
            }),
          ]).start();
        }
      },
      onPanResponderTerminate: () => {
        // Snap back on terminate
        Animated.parallel([
          Animated.spring(translateX, {
            toValue: 0,
            tension: 120,
            friction: 10,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
          }),
        ]).start();
      },
    })
  ).current;

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.content,
          {
            transform: [{ translateX }],
            opacity,
          },
        ]}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
  },
});
