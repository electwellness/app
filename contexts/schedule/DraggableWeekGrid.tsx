import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, PanResponder,
  Animated, Dimensions, Platform, Vibration,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../../constants/theme';
import AppointmentCard from './AppointmentCard';
import DragGhostOverlay from './DragGhostOverlay';
import type { DragGhostProps } from './DragGhostOverlay';
import {
  Appointment, appointmentTypes, formatDateKey, formatTimeShort, formatTimeDisplay,
  DAY_NAMES, HOUR_LABELS, GRID_START_HOUR, SLOT_HEIGHT, timeToMinutes, addMinutesToTime,
  canOverlapAppointmentTypes, findInSessionPair, isTrainingAppointment,
} from '../../data/scheduleData';


const SCREEN_WIDTH = Dimensions.get('window').width;
const TIME_COL_WIDTH = 48;
const DAY_COL_WIDTH = Math.max(80, (SCREEN_WIDTH - TIME_COL_WIDTH - 32) / 5);
const GRID_SLOT_HEIGHT = SLOT_HEIGHT; // 20px per 15-min slot
const LONG_PRESS_MS = 450;
const MOVE_THRESHOLD = 8;

interface DraggableWeekGridProps {
  weekDates: Date[];
  todayKey: string;
  weekRangeLabel: string;
  filteredAppointments: Appointment[];
  allAppointments: Appointment[];
  totalGridHeight: number;
  onSelectDay: (date: Date) => void;
  onSelectAppt: (appt: Appointment) => void;
  onNavigateWeek: (dir: number) => void;
  onReschedule: (id: string, newDate: string, newStartTime: string, newEndTime: string) => void;
  onOpenNewAppt: (dateKey?: string) => void;
  canDrag?: (appt: Appointment) => boolean;
}

interface DropTarget {
  dayIdx: number;
  dateKey: string;
  timeMinutes: number;
  timeStr: string;
  endTimeStr: string;
  hasConflict: boolean;
  conflictName: string | null;
}

interface DragState {
  appointment: Appointment;
  startPageX: number;
  startPageY: number;
}

export default function DraggableWeekGrid({
  weekDates,
  todayKey,
  weekRangeLabel,
  filteredAppointments,
  allAppointments,
  totalGridHeight,
  onSelectDay,
  onSelectAppt,
  onNavigateWeek,
  onReschedule,
  onOpenNewAppt,
  canDrag,
}: DraggableWeekGridProps) {
  const weekDays = useMemo(() => weekDates.slice(0, 5), [weekDates]);
  const weekendDays = useMemo(() => weekDates.slice(5), [weekDates]);

  // ── Drag state ──
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [ghostPos, setGhostPos] = useState({ x: 0, y: 0 });
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const gridBodyRef = useRef<View>(null);
  const gridLayoutRef = useRef({ pageX: 0, pageY: 0, width: 0, height: 0 });
  const hScrollOffsetRef = useRef(0);
  const vScrollOffsetRef = useRef(0);
  const isDraggingRef = useRef(false);
  const longPressTimerRef = useRef<any>(null);
  const dragApptRef = useRef<Appointment | null>(null);
  const startPosRef = useRef({ x: 0, y: 0 });

  // Measure grid body position when layout changes
  const measureGrid = useCallback(() => {
    if (gridBodyRef.current) {
      gridBodyRef.current.measureInWindow((x, y, width, height) => {
        if (x !== undefined) {
          gridLayoutRef.current = { pageX: x, pageY: y, width, height };
        }
      });
    }
  }, []);

  // Get appointments for a specific date
  const getGridAppointments = useCallback((dateKey: string) => {
    return filteredAppointments
      .filter(a => a.date === dateKey && a.status !== 'cancelled')
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [filteredAppointments]);

  // Get appointment position in grid
  const getApptPosition = useCallback((appt: Appointment) => {
    const startMin = timeToMinutes(appt.startTime);
    const gridStartMin = GRID_START_HOUR * 60;
    const topSlots = (startMin - gridStartMin) / 15;
    const heightSlots = Math.max(1, appt.duration / 15);
    return {
      top: topSlots * GRID_SLOT_HEIGHT,
      height: heightSlots * GRID_SLOT_HEIGHT,
    };
  }, []);

  // Convert page coordinates to grid day/time
  const pageToGridTarget = useCallback((pageX: number, pageY: number, duration: number): DropTarget | null => {
    const grid = gridLayoutRef.current;
    if (!grid.width) return null;

    const gridRelX = pageX - grid.pageX + hScrollOffsetRef.current;
    const gridRelY = pageY - grid.pageY + vScrollOffsetRef.current;

    // Determine day column
    const xInDays = gridRelX - TIME_COL_WIDTH;
    const dayIdx = Math.floor(xInDays / DAY_COL_WIDTH);
    if (dayIdx < 0 || dayIdx >= 5) return null;

    // Determine time slot (snap to 15-min)
    const slotIdx = Math.round(gridRelY / GRID_SLOT_HEIGHT);
    const timeMinutes = GRID_START_HOUR * 60 + slotIdx * 15;
    if (timeMinutes < GRID_START_HOUR * 60 || timeMinutes >= 20 * 60) return null;

    const hours = Math.floor(timeMinutes / 60);
    const mins = timeMinutes % 60;
    const timeStr = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    const endTimeStr = addMinutesToTime(timeStr, duration);
    const dateKey = formatDateKey(weekDays[dayIdx]);

    // Check for conflicts (respecting training + biometric overlap allowance)
    const dragAppt = dragApptRef.current;
    const conflicting = allAppointments.find(a => {
      if (!dragAppt) return false;
      if (a.id === dragAppt.id) return false;
      if (a.coachId !== dragAppt.coachId) return false;
      if (a.date !== dateKey) return false;
      if (a.status === 'cancelled') return false;
      const timeOverlaps = a.startTime < endTimeStr && a.endTime > timeStr;
      if (!timeOverlaps) return false;
      // Allow overlap for training + biometric sessions (done in-session)
      if (canOverlapAppointmentTypes(dragAppt.appointmentTypeId, a.appointmentTypeId)) return false;
      return true;
    });


    return {
      dayIdx,
      dateKey,
      timeMinutes,
      timeStr,
      endTimeStr,
      hasConflict: !!conflicting,
      conflictName: conflicting?.clientName || null,
    };
  }, [weekDays, allAppointments]);

  // ── Drag handlers called from DraggableApptWrapper ──

  const handleDragStart = useCallback((appt: Appointment, pageX: number, pageY: number) => {
    measureGrid();
    isDraggingRef.current = true;
    dragApptRef.current = appt;
    setDragState({ appointment: appt, startPageX: pageX, startPageY: pageY });
    setGhostPos({ x: pageX, y: pageY });
    setScrollEnabled(false);

    // Haptic feedback
    if (Platform.OS !== 'web') {
      try { Vibration.vibrate(30); } catch (e) {}
    }
  }, [measureGrid]);

  const handleDragMove = useCallback((pageX: number, pageY: number) => {
    if (!isDraggingRef.current || !dragApptRef.current) return;
    setGhostPos({ x: pageX, y: pageY });

    const target = pageToGridTarget(pageX, pageY, dragApptRef.current.duration);
    setDropTarget(target);
  }, [pageToGridTarget]);

  const handleDragEnd = useCallback((pageX: number, pageY: number) => {
    if (!isDraggingRef.current || !dragApptRef.current) {
      cleanup();
      return;
    }

    const appt = dragApptRef.current;
    const target = pageToGridTarget(pageX, pageY, appt.duration);

    if (target && !target.hasConflict) {
      // Check if actually moved to a different slot
      const originalDateKey = appt.date;
      const originalTime = appt.startTime;
      if (target.dateKey !== originalDateKey || target.timeStr !== originalTime) {
        onReschedule(appt.id, target.dateKey, target.timeStr, target.endTimeStr);
      }
    }

    cleanup();
  }, [pageToGridTarget, onReschedule]);

  const handleDragCancel = useCallback(() => {
    cleanup();
  }, []);

  const cleanup = () => {
    isDraggingRef.current = false;
    dragApptRef.current = null;
    setDragState(null);
    setDropTarget(null);
    setScrollEnabled(true);
  };

  // ── Render helpers ──

  const renderDropZoneHighlight = (dayIdx: number) => {
    if (!dropTarget || dropTarget.dayIdx !== dayIdx) return null;

    const topSlots = (dropTarget.timeMinutes - GRID_START_HOUR * 60) / 15;
    const duration = dragState?.appointment.duration || 30;
    const heightSlots = Math.max(1, duration / 15);

    return (
      <View
        style={[
          styles.dropZone,
          {
            top: topSlots * GRID_SLOT_HEIGHT,
            height: heightSlots * GRID_SLOT_HEIGHT,
            backgroundColor: dropTarget.hasConflict ? COLORS.danger + '25' : COLORS.success + '25',
            borderColor: dropTarget.hasConflict ? COLORS.danger + '80' : COLORS.success + '80',
          },
        ]}
      >
        <Text style={[
          styles.dropZoneTime,
          { color: dropTarget.hasConflict ? COLORS.danger : COLORS.success },
        ]}>
          {formatTimeDisplay(dropTarget.timeStr)}
        </Text>
        {dropTarget.hasConflict && (
          <View style={styles.dropZoneConflict}>
            <Ionicons name="warning" size={10} color={COLORS.danger} />
            <Text style={styles.dropZoneConflictText}>Conflict</Text>
          </View>
        )}
      </View>
    );
  };

  // Check if the dragged appointment's original slot should be dimmed
  const isDraggedAppt = (apptId: string) => {
    return dragState?.appointment.id === apptId;
  };

  // Ghost overlay props
  const ghostProps: DragGhostProps | null = dragState ? {
    appointment: dragState.appointment,
    pageX: ghostPos.x,
    pageY: ghostPos.y,
    targetDayLabel: dropTarget ? DAY_NAMES[dropTarget.dayIdx] : null,
    targetTimeLabel: dropTarget ? formatTimeDisplay(dropTarget.timeStr) : null,
    hasConflict: dropTarget?.hasConflict || false,
    conflictName: dropTarget?.conflictName || null,
    isOutOfBounds: !dropTarget,
  } : null;

  return (
    <View style={styles.container}>
      {/* Week Navigation */}
      <View style={styles.weekNav}>
        <TouchableOpacity onPress={() => onNavigateWeek(-1)} style={styles.navArrow}>
          <Ionicons name="chevron-back" size={20} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.weekNavTitle}>{weekRangeLabel}</Text>
        <TouchableOpacity onPress={() => onNavigateWeek(1)} style={styles.navArrow}>
          <Ionicons name="chevron-forward" size={20} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* Drag hint */}
      {!dragState && (
        <View style={styles.dragHint}>
          <Ionicons name="hand-left-outline" size={12} color={COLORS.textMuted} />
          <Text style={styles.dragHintText}>Long-press an appointment to drag & reschedule</Text>
        </View>
      )}

      {/* Dragging indicator bar */}
      {dragState && (
        <View style={styles.draggingBar}>
          <Ionicons name="move" size={14} color={COLORS.white} />
          <Text style={styles.draggingBarText}>
            Dragging: {dragState.appointment.clientName} — Drop on a new time slot
          </Text>
          <TouchableOpacity onPress={handleDragCancel} style={styles.cancelDragBtn}>
            <Ionicons name="close" size={14} color={COLORS.white} />
            <Text style={styles.cancelDragText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Grid */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEnabled={scrollEnabled}
        onScroll={(e) => { hScrollOffsetRef.current = e.nativeEvent.contentOffset.x; }}
        scrollEventThrottle={16}
      >
        <View>
          {/* Header Row */}
          <View style={styles.gridHeaderRow}>
            <View style={[styles.timeColHeader, { width: TIME_COL_WIDTH }]} />
            {weekDays.map((date, idx) => {
              const dk = formatDateKey(date);
              const isToday = dk === todayKey;
              const dayApptCount = getGridAppointments(dk).length;
              const isDropDay = dropTarget?.dayIdx === idx;
              return (
                <TouchableOpacity
                  key={dk}
                  style={[
                    styles.dayColHeader,
                    { width: DAY_COL_WIDTH },
                    isToday && styles.dayColHeaderToday,
                    isDropDay && !dropTarget?.hasConflict && styles.dayColHeaderDropTarget,
                    isDropDay && dropTarget?.hasConflict && styles.dayColHeaderConflict,
                  ]}
                  onPress={() => onSelectDay(date)}
                >
                  <Text style={[
                    styles.dayHeaderName,
                    isToday && styles.dayHeaderNameToday,
                    isDropDay && styles.dayHeaderNameDrop,
                  ]}>{DAY_NAMES[idx]}</Text>
                  <View style={[
                    styles.dayHeaderNum,
                    isToday && styles.dayHeaderNumToday,
                  ]}>
                    <Text style={[
                      styles.dayHeaderNumText,
                      isToday && styles.dayHeaderNumTextToday,
                    ]}>{date.getDate()}</Text>
                  </View>
                  {dayApptCount > 0 && (
                    <Text style={[styles.dayApptCount, isToday && { color: COLORS.white }]}>{dayApptCount}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Grid Body */}
          <ScrollView
            style={{ maxHeight: 500 }}
            nestedScrollEnabled
            showsVerticalScrollIndicator
            scrollEnabled={scrollEnabled}
            onScroll={(e) => { vScrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
            scrollEventThrottle={16}
          >
            <View
              ref={gridBodyRef}
              style={[styles.gridBody, { height: totalGridHeight }]}
              onLayout={measureGrid}
            >
              {/* Time Column */}
              <View style={[styles.timeCol, { width: TIME_COL_WIDTH }]}>
                {HOUR_LABELS.map(hour => {
                  const hourNum = parseInt(hour);
                  const topPos = (hourNum - GRID_START_HOUR) * 4 * GRID_SLOT_HEIGHT;
                  return (
                    <View key={hour} style={[styles.timeLabel, { top: topPos }]}>
                      <Text style={styles.timeLabelText}>{formatTimeShort(hour)}</Text>
                    </View>
                  );
                })}
              </View>

              {/* Day Columns */}
              {weekDays.map((date, dayIdx) => {
                const dk = formatDateKey(date);
                const dayAppts = getGridAppointments(dk);

                // Pre-compute pair relationships for this day so we can split
                // training + biometric pairs into side-by-side half-width cards.
                const pairMap = new Map<string, Appointment>();
                for (const a of dayAppts) {
                  const pair = findInSessionPair(a, dayAppts);
                  if (pair) pairMap.set(a.id, pair);
                }

                return (
                  <View key={dk} style={[styles.dayGridCol, { width: DAY_COL_WIDTH }]}>
                    {/* Hour lines */}
                    {HOUR_LABELS.map(hour => {
                      const hourNum = parseInt(hour);
                      const topPos = (hourNum - GRID_START_HOUR) * 4 * GRID_SLOT_HEIGHT;
                      return <View key={hour} style={[styles.hourLine, { top: topPos }]} />;
                    })}

                    {/* Drop zone highlight */}
                    {renderDropZoneHighlight(dayIdx)}

                    {/* Appointments */}
                    {dayAppts.map(appt => {
                      const pos = getApptPosition(appt);
                      const draggable = canDrag ? canDrag(appt) : true;
                      const beingDragged = isDraggedAppt(appt.id);
                      const pair = pairMap.get(appt.id) || null;
                      // Training half sits on the left, biometric/in-session half on the right.
                      const isPairedTraining = !!pair && isTrainingAppointment(appt);
                      const isPairedInSession = !!pair && !isTrainingAppointment(appt);
                      const pairedSide: 'left' | 'right' | 'full' = isPairedTraining
                        ? 'left'
                        : isPairedInSession
                          ? 'right'
                          : 'full';

                      return (
                        <DraggableApptWrapper
                          key={appt.id}
                          appointment={appt}
                          top={pos.top}
                          height={pos.height}
                          draggable={draggable}
                          beingDragged={beingDragged}
                          onTap={onSelectAppt}
                          onDragStart={handleDragStart}
                          onDragMove={handleDragMove}
                          onDragEnd={handleDragEnd}
                          onDragCancel={handleDragCancel}
                          pairedSide={pairedSide}
                          inSessionPair={pair}
                        />
                      );
                    })}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </ScrollView>


      {/* Weekend Row */}
      <View style={styles.weekendRow}>
        {weekendDays.map((date, idx) => {
          const dk = formatDateKey(date);
          const dayAppts = getGridAppointments(dk);
          const isToday = dk === todayKey;
          return (
            <TouchableOpacity key={dk} style={[styles.weekendCard, isToday && { borderColor: COLORS.accent }]} onPress={() => onSelectDay(date)}>
              <Text style={[styles.weekendDay, isToday && { color: COLORS.accent }]}>{DAY_NAMES[5 + idx]} {date.getDate()}</Text>
              <Text style={styles.weekendCount}>{dayAppts.length} appts</Text>
              {dayAppts.slice(0, 2).map(a => (
                <AppointmentCard key={a.id} appointment={a} onPress={onSelectAppt} compact />
              ))}
              {dayAppts.length > 2 && <Text style={styles.weekendMore}>+{dayAppts.length - 2} more</Text>}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Ghost Overlay (rendered above everything) */}
      {ghostProps && <DragGhostOverlay {...ghostProps} />}
    </View>
  );
}

// ── Draggable Appointment Wrapper ──────────────────────────────────────────────
// Each appointment in the grid gets wrapped in this component which handles
// long-press detection and drag initiation via PanResponder.

interface DraggableApptWrapperProps {
  appointment: Appointment;
  top: number;
  height: number;
  draggable: boolean;
  beingDragged: boolean;
  onTap: (appt: Appointment) => void;
  onDragStart: (appt: Appointment, pageX: number, pageY: number) => void;
  onDragMove: (pageX: number, pageY: number) => void;
  onDragEnd: (pageX: number, pageY: number) => void;
  onDragCancel: () => void;
  /** 'left' = training half, 'right' = biometric half, 'full' = standalone */
  pairedSide?: 'left' | 'right' | 'full';
  /** The paired in-session appointment (if any) */
  inSessionPair?: Appointment | null;
}

function DraggableApptWrapper({
  appointment,
  top,
  height,
  draggable,
  beingDragged,
  onTap,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
  pairedSide = 'full',
  inSessionPair = null,
}: DraggableApptWrapperProps) {
  const isDragging = useRef(false);
  const longPressTimer = useRef<any>(null);
  const startPos = useRef({ x: 0, y: 0 });
  const longPressFired = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => draggable,
      onMoveShouldSetPanResponder: () => isDragging.current,
      onPanResponderGrant: (evt) => {
        const { pageX, pageY } = evt.nativeEvent;
        startPos.current = { x: pageX, y: pageY };
        longPressFired.current = false;
        isDragging.current = false;

        // Start long-press timer
        longPressTimer.current = setTimeout(() => {
          longPressFired.current = true;
          isDragging.current = true;
          onDragStart(appointment, pageX, pageY);
        }, LONG_PRESS_MS);
      },
      onPanResponderMove: (evt, gestureState) => {
        if (isDragging.current) {
          onDragMove(gestureState.moveX, gestureState.moveY);
        } else {
          // Cancel long press if moved too much
          const dist = Math.abs(gestureState.dx) + Math.abs(gestureState.dy);
          if (dist > MOVE_THRESHOLD) {
            clearTimeout(longPressTimer.current);
          }
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        clearTimeout(longPressTimer.current);
        if (isDragging.current) {
          onDragEnd(gestureState.moveX, gestureState.moveY);
        } else if (!longPressFired.current) {
          // It was a tap
          onTap(appointment);
        }
        isDragging.current = false;
        longPressFired.current = false;
      },
      onPanResponderTerminate: () => {
        clearTimeout(longPressTimer.current);
        if (isDragging.current) {
          onDragCancel();
        }
        isDragging.current = false;
        longPressFired.current = false;
      },
    })
  ).current;

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      clearTimeout(longPressTimer.current);
    };
  }, []);

  // Compute horizontal positioning based on pairedSide:
  // - 'left' (training half):  left = 1, right = 50% (with a small gap)
  // - 'right' (biometric half): left = 50%, right = 1
  // - 'full' (default):         left = 1, right = 1
  const wrapperPositionStyle: any = pairedSide === 'left'
    ? { left: 1, right: undefined, width: '50%' as any, paddingRight: 1 }
    : pairedSide === 'right'
      ? { left: '50%' as any, right: 1, paddingLeft: 1 }
      : { left: 1, right: 1 };

  return (
    <View
      style={[
        styles.gridApptWrap,
        wrapperPositionStyle,
        { top, height },
        beingDragged && styles.gridApptDragging,
      ]}
      {...panResponder.panHandlers}
    >
      {/* Connector line between training (left) and biometric (right) halves */}
      {pairedSide === 'right' && (
        <View style={styles.pairConnectorLine} pointerEvents="none" />
      )}
      <AppointmentCard
        appointment={appointment}
        onPress={() => {}} // Handled by PanResponder
        gridMode
        heightPx={height}
        inSessionPair={inSessionPair}
      />
      {/* Drag handle indicator for draggable appointments */}
      {draggable && !beingDragged && (
        <View style={styles.dragHandle}>
          <Ionicons name="reorder-two" size={10} color={COLORS.textMuted + '80'} />
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.sm,
  },

  // Week nav
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.sm,
  },
  navArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.sm,
  },
  weekNavTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.primary,
  },

  // Drag hint
  dragHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
    marginBottom: SPACING.xs,
    opacity: 0.6,
  },
  dragHintText: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: '500',
    fontStyle: 'italic',
  },

  // Dragging indicator bar
  draggingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
    ...SHADOWS.md,
  },
  draggingBarText: {
    flex: 1,
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.white,
  },
  cancelDragBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
  },
  cancelDragText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.white,
  },

  // Grid header
  gridHeaderRow: { flexDirection: 'row' },
  timeColHeader: { backgroundColor: COLORS.background },
  dayColHeader: {
    alignItems: 'center',
    paddingVertical: 4,
    backgroundColor: COLORS.white,
    borderWidth: 0.5,
    borderColor: COLORS.borderLight,
  },
  dayColHeaderToday: { backgroundColor: COLORS.accent },
  dayColHeaderDropTarget: {
    backgroundColor: COLORS.success + '20',
    borderColor: COLORS.success,
    borderWidth: 1.5,
  },
  dayColHeaderConflict: {
    backgroundColor: COLORS.danger + '20',
    borderColor: COLORS.danger,
    borderWidth: 1.5,
  },
  dayHeaderName: {
    fontSize: 8,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
  },
  dayHeaderNameToday: { color: COLORS.white },
  dayHeaderNameDrop: { fontWeight: '800' },
  dayHeaderNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  dayHeaderNumToday: { backgroundColor: 'rgba(255,255,255,0.3)' },
  dayHeaderNumText: { fontSize: 10, fontWeight: '700', color: COLORS.primary },
  dayHeaderNumTextToday: { color: COLORS.white },
  dayApptCount: { fontSize: 7, fontWeight: '700', color: COLORS.textMuted, marginTop: 1 },

  // Grid body
  gridBody: { flexDirection: 'row', position: 'relative', backgroundColor: COLORS.white },
  timeCol: { position: 'relative' },
  timeLabel: { position: 'absolute', right: 2, height: GRID_SLOT_HEIGHT * 4 },
  timeLabelText: { fontSize: 8, fontWeight: '600', color: COLORS.textMuted },
  dayGridCol: { position: 'relative', borderLeftWidth: 0.5, borderLeftColor: COLORS.borderLight },
  hourLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: COLORS.borderLight },

  // Appointment wrapper
  gridApptWrap: {
    position: 'absolute',
    left: 1,
    right: 1,
    zIndex: 2,
  },
  gridApptDragging: {
    opacity: 0.3,
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderStyle: 'dashed',
    borderRadius: 4,
  },

  // Drag handle
  dragHandle: {
    position: 'absolute',
    top: 1,
    right: 1,
    width: 14,
    height: 14,
    borderRadius: 3,
    backgroundColor: COLORS.white + 'CC',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Drop zone highlight
  dropZone: {
    position: 'absolute',
    left: 2,
    right: 2,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 4,
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  dropZoneTime: {
    fontSize: 9,
    fontWeight: '800',
  },
  dropZoneConflict: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 1,
  },
  dropZoneConflictText: {
    fontSize: 8,
    fontWeight: '700',
    color: COLORS.danger,
  },

  // Weekend
  weekendRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.sm,
  },
  weekendCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    minHeight: 60,
  },
  weekendDay: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 2,
  },
  weekendCount: { fontSize: 9, color: COLORS.textMuted, marginBottom: 2 },
  weekendMore: {
    fontSize: 8,
    color: COLORS.accent,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
  },

  // In-session pair visual connector — subtle dashed line on the biometric half's
  // left edge that visually links it back to the training half.
  pairConnectorLine: {
    position: 'absolute',
    top: '25%',
    bottom: '25%',
    left: 0,
    width: 2,
    backgroundColor: '#e74c3c' + '55',
    borderRadius: 1,
    zIndex: 1,
  },
});
