/**
 * attendanceService.ts
 *
 * Frontend service for session attendance tracking within 13-week program cycles.
 * Calls the manage-appointments edge function's fetchCycleAttendance action.
 */

import { invokeEdgeFunction } from './edgeFunctionHelper';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CycleSession {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  status: 'completed' | 'missed' | 'no-show' | 'cancelled' | 'scheduled' | 'confirmed';
  originalStatus: string;
  coachName: string;
  duration: number;
  weekNumber: number;
  notes: string;
}

export interface CycleAttendanceStats {
  completed: number;
  missed: number;
  cancelled: number;
  upcoming: number;
  scheduled: number;
  total: number;
  attendanceRate: number;
  currentStreak: number;
  longestStreak: number;
  sessionsRemaining: number;
}

export interface CycleAttendanceData {
  clientId: string;
  clientName: string;
  program: string;
  tier: string;
  sessionsPerWeek: number;
  sessionsPerCycle: number;
  cycleNumber: number;
  cycleStartDate: string | null;
  cycleEndDate: string | null;
  weekInCycle: number;
  sessions: CycleSession[];
  stats: CycleAttendanceStats;
  error?: string;
}

// ── Service Functions ────────────────────────────────────────────────────────

export async function fetchCycleAttendance(clientId: string): Promise<{
  data: CycleAttendanceData | null;
  error: string | null;
}> {
  const result = await invokeEdgeFunction<CycleAttendanceData>('manage-appointments', {
    action: 'fetchCycleAttendance',
    clientId,
  }, {
    maxRetries: 1,
    retryDelay: 1500,
  });

  return {
    data: result.data || null,
    error: result.error || null,
  };
}

// ── Helper: Group sessions by week number ────────────────────────────────────

export interface WeekGroup {
  weekNumber: number;
  weekStartDate: string;
  weekEndDate: string;
  sessions: CycleSession[];
  /** Expected sessions for this week based on program tier */
  expectedSessions: number;
  /** Whether this week is in the past, current, or future */
  status: 'past' | 'current' | 'future';
}

export function groupSessionsByWeek(
  data: CycleAttendanceData,
): WeekGroup[] {
  if (!data.cycleStartDate) return [];

  const cycleStart = new Date(data.cycleStartDate + 'T12:00:00');
  const today = new Date();
  const todayKey = formatDateKey(today);

  const weeks: WeekGroup[] = [];

  for (let w = 1; w <= 13; w++) {
    const weekStart = new Date(cycleStart);
    weekStart.setDate(cycleStart.getDate() + (w - 1) * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const weekStartKey = formatDateKey(weekStart);
    const weekEndKey = formatDateKey(weekEnd);

    const weekSessions = data.sessions.filter(s => s.weekNumber === w);

    let status: 'past' | 'current' | 'future';
    if (weekEndKey < todayKey) {
      status = 'past';
    } else if (weekStartKey <= todayKey && weekEndKey >= todayKey) {
      status = 'current';
    } else {
      status = 'future';
    }

    weeks.push({
      weekNumber: w,
      weekStartDate: weekStartKey,
      weekEndDate: weekEndKey,
      sessions: weekSessions,
      expectedSessions: data.sessionsPerWeek,
      status,
    });
  }

  return weeks;
}

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
