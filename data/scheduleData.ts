// ScheduleContact: lightweight interface for session-balance tracking (replaces mockData dependency)
export interface ScheduleContact {
  id: string;
  name: string;
  program: string;
  status: string;
  trainer?: string;
  dietitian?: string;
  franchise?: string;
}

// ── Program Definitions ──────────────────────────────────────────────────────

export type ProgramTier = 'Platinum' | 'Gold' | 'Silver' | 'Bronze';
export type ProgramVariant = 'Individual' | 'Shared';

export interface ProgramDefinition {
  id: string;
  tier: ProgramTier;
  variant: ProgramVariant;
  name: string;
  shortName: string;
  sessionsPerWeek: number;
  /** Total sessions in a 13-week cycle (sessionsPerWeek × 13) */
  sessionsPerCycle: number;
  monthlyCost: number;
  color: string;
}

export const CYCLE_WEEKS = 13;

export const programDefinitions: ProgramDefinition[] = [
  { id: 'platinum-individual', tier: 'Platinum', variant: 'Individual', name: 'Platinum Individual', shortName: 'Plat Ind', sessionsPerWeek: 4, sessionsPerCycle: 52, monthlyCost: 1418, color: '#8B5CF6' },
  { id: 'platinum-shared', tier: 'Platinum', variant: 'Shared', name: 'Platinum Shared', shortName: 'Plat Shared', sessionsPerWeek: 4, sessionsPerCycle: 52, monthlyCost: 1842, color: '#7C3AED' },
  { id: 'gold-individual', tier: 'Gold', variant: 'Individual', name: 'Gold Individual', shortName: 'Gold Ind', sessionsPerWeek: 3, sessionsPerCycle: 39, monthlyCost: 1124, color: '#F59E0B' },
  { id: 'gold-shared', tier: 'Gold', variant: 'Shared', name: 'Gold Shared', shortName: 'Gold Shared', sessionsPerWeek: 3, sessionsPerCycle: 39, monthlyCost: 1461, color: '#D97706' },
  { id: 'silver-individual', tier: 'Silver', variant: 'Individual', name: 'Silver Individual', shortName: 'Silver Ind', sessionsPerWeek: 2, sessionsPerCycle: 26, monthlyCost: 797, color: '#94A3B8' },
  { id: 'silver-shared', tier: 'Silver', variant: 'Shared', name: 'Silver Shared', shortName: 'Silver Shared', sessionsPerWeek: 2, sessionsPerCycle: 26, monthlyCost: 1036, color: '#64748B' },
  { id: 'bronze-individual', tier: 'Bronze', variant: 'Individual', name: 'Bronze Individual', shortName: 'Bronze Ind', sessionsPerWeek: 1, sessionsPerCycle: 13, monthlyCost: 439, color: '#B45309' },
  { id: 'bronze-shared', tier: 'Bronze', variant: 'Shared', name: 'Bronze Shared', shortName: 'Bronze Shared', sessionsPerWeek: 1, sessionsPerCycle: 13, monthlyCost: 571, color: '#92400E' },
];


export function getProgramDefinition(programName: string): ProgramDefinition | undefined {
  return programDefinitions.find(p => p.name === programName);
}

export function getProgramColor(programName: string): string {
  return getProgramDefinition(programName)?.color || '#94A3B8';
}

// ── Appointment Types ────────────────────────────────────────────────────────

export interface AppointmentType {
  id: string;
  name: string;
  shortName: string;
  color: string;
  defaultDuration: number;
  icon: string;
  category: 'training' | 'nutrition' | 'assessment' | 'advising';
  countsAsSession: boolean;
  description: string;
}

export const appointmentTypes: AppointmentType[] = [
  { id: 'individual-training', name: 'Individual Training', shortName: 'Training', color: '#2ecc71', defaultDuration: 45, icon: 'fitness', category: 'training', countsAsSession: true, description: 'One-on-one personal training session with your coach' },
  { id: 'couples-training', name: 'Couples Training', shortName: 'Couples', color: '#3498db', defaultDuration: 45, icon: 'people', category: 'training', countsAsSession: true, description: 'Shared training session for two clients with one coach' },
  { id: 'partner-training', name: 'Partner Session', shortName: 'Partner', color: '#8B5CF6', defaultDuration: 45, icon: 'people-circle', category: 'training', countsAsSession: true, description: 'Training session with your partner group — all partners train together' },
  { id: 'biometric-assessment', name: 'Biometric Assessment', shortName: 'Biometric', color: '#2563eb', defaultDuration: 15, icon: 'body', category: 'assessment', countsAsSession: false, description: 'Body composition and biometric measurements' },
  { id: 'nutrition-videochat', name: 'Nutrition Videochat', shortName: 'Nutrition', color: '#9b59b6', defaultDuration: 15, icon: 'videocam', category: 'nutrition', countsAsSession: false, description: 'Virtual nutrition consultation with your dietitian' },
  { id: 'daily-advising', name: 'Daily Advising', shortName: 'Advising', color: '#f39c12', defaultDuration: 5, icon: 'chatbubble-ellipses', category: 'advising', countsAsSession: false, description: 'Quick daily check-in and guidance' },
];

export function getAppointmentType(id: string): AppointmentType | undefined {
  return appointmentTypes.find(t => t.id === id);
}

export function getAppointmentTypesForProgram(programName: string): AppointmentType[] {
  const program = getProgramDefinition(programName);
  if (!program) return appointmentTypes;
  const isShared = program.variant === 'Shared';
  return appointmentTypes.filter(t => {
    if (t.id === 'individual-training') return !isShared;
    if (t.id === 'couples-training') return isShared;
    // Partner training is always available (partner group check is done in the modal)
    if (t.id === 'partner-training') return false; // Hidden from normal list; shown dynamically when partner group exists
    return true;
  });
}

/** Get appointment types including partner-training when client has a partner group */
export function getAppointmentTypesWithPartner(programName: string, hasPartnerGroup: boolean): AppointmentType[] {
  const program = getProgramDefinition(programName);
  if (!program) return appointmentTypes;
  const isShared = program.variant === 'Shared';
  return appointmentTypes.filter(t => {
    if (t.id === 'individual-training') return !isShared;
    if (t.id === 'couples-training') return isShared;
    if (t.id === 'partner-training') return hasPartnerGroup;
    return true;
  });
}


// ── Recurrence Model ─────────────────────────────────────────────────────────

export interface WeeklyDayTime {
  day: number;
  time: string;
}

export interface RecurrencePattern {
  type: 'none' | 'daily' | 'weekly' | 'monthly';
  endDate: string;
  weeklyDays?: WeeklyDayTime[];
  interval?: number;
}

// ── Appointment Model ────────────────────────────────────────────────────────


export interface Appointment {
  id: string;
  coachId: string;
  coachName: string;
  coachType: 'trainer' | 'dietitian';
  clientId: string;
  clientName: string;
  clientProgram: string;
  appointmentTypeId: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no-show';
  notes: string;
  franchise: string;
  secondClientId?: string;
  secondClientName?: string;
  recurrenceId?: string;
  recurrencePattern?: RecurrencePattern;
  isRecurrenceException?: boolean;
  /** Jitsi Meet room link for video-enabled appointments */
  videoCallLink?: string;
  /** Partner group ID — links this appointment to a partner group session */
  partnerGroupId?: string;
  /** Names of partner group members (populated by edge function, not stored in DB) */
  partnerClientNames?: string[];
}


// ── Recurrence Helpers ───────────────────────────────────────────────────────

export function generateRecurrenceId(): string {
  return `rec-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
}

export function generateRecurringDates(
  pattern: RecurrencePattern, baseDate: string, baseTime: string, duration: number,
): { date: string; startTime: string; endTime: string }[] {
  const results: { date: string; startTime: string; endTime: string }[] = [];
  if (pattern.type === 'none') return results;
  const endDate = new Date(pattern.endDate + 'T23:59:59');
  const interval = pattern.interval || 1;

  if (pattern.type === 'daily') {
    const start = new Date(baseDate + 'T12:00:00');
    const current = new Date(start);
    while (current <= endDate) {
      results.push({ date: formatDateKey(current), startTime: baseTime, endTime: addMinutesToTime(baseTime, duration) });
      current.setDate(current.getDate() + interval);
    }
  } else if (pattern.type === 'weekly' && pattern.weeklyDays && pattern.weeklyDays.length > 0) {
    const start = new Date(baseDate + 'T12:00:00');
    const dayOfWeek = start.getDay();
    const monday = new Date(start);
    monday.setDate(start.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const current = new Date(monday);
    while (current <= endDate) {
      for (const wd of pattern.weeklyDays) {
        const targetDate = new Date(current);
        targetDate.setDate(current.getDate() + wd.day);
        if (targetDate >= start && targetDate <= endDate) {
          results.push({ date: formatDateKey(targetDate), startTime: wd.time, endTime: addMinutesToTime(wd.time, duration) });
        }
      }
      current.setDate(current.getDate() + 7 * interval);
    }
  } else if (pattern.type === 'monthly') {
    const start = new Date(baseDate + 'T12:00:00');
    const dayOfMonth = start.getDate();
    const current = new Date(start);
    while (current <= endDate) {
      results.push({ date: formatDateKey(current), startTime: baseTime, endTime: addMinutesToTime(baseTime, duration) });
      current.setMonth(current.getMonth() + interval);
      current.setDate(Math.min(dayOfMonth, new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate()));
    }
  }
  return results;
}

export function detectRecurringConflicts(
  instances: { date: string; startTime: string; endTime: string }[],
  existingAppointments: Appointment[], coachId: string, excludeRecurrenceId?: string,
  appointmentTypeId?: string,
): { date: string; startTime: string; endTime: string; conflictWith: string }[] {
  const conflicts: { date: string; startTime: string; endTime: string; conflictWith: string }[] = [];
  for (const inst of instances) {
    const conflicting = existingAppointments.find(a => {
      if (a.coachId !== coachId || a.date !== inst.date || a.status === 'cancelled') return false;
      if (excludeRecurrenceId && a.recurrenceId === excludeRecurrenceId) return false;
      const timeOverlaps = a.startTime < inst.endTime && a.endTime > inst.startTime;
      if (!timeOverlaps) return false;
      // Allow overlap for training + biometric (done in-session)
      if (appointmentTypeId && canOverlapAppointmentTypes(appointmentTypeId, a.appointmentTypeId)) {
        return false;
      }
      return true;
    });
    if (conflicting) {
      conflicts.push({ date: inst.date, startTime: inst.startTime, endTime: inst.endTime, conflictWith: conflicting.clientName });
    }
  }
  return conflicts;
}


export function getFutureRecurringInstances(appointments: Appointment[], recurrenceId: string, fromDate: string): Appointment[] {
  return appointments
    .filter(a => a.recurrenceId === recurrenceId && a.date >= fromDate && a.status !== 'cancelled')
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
}

// ── Time Helpers ─────────────────────────────────────────────────────────────

export function getWeekDates(baseDate: Date): Date[] {
  const dates: Date[] = [];
  const day = baseDate.getDay();
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d);
  }
  return dates;
}

export function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function formatTimeDisplay(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function formatTimeShort(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'p' : 'a';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  if (m === 0) return `${hour12}${ampm}`;
  return `${hour12}:${String(m).padStart(2, '0')}${ampm}`;
}

export function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const totalMin = h * 60 + m + minutes;
  const newH = Math.floor(totalMin / 60) % 24;
  const newM = totalMin % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export const TIME_SLOTS_15: string[] = [];
for (let h = 6; h <= 20; h++) {
  for (let m = 0; m < 60; m += 15) {
    if (h === 20 && m > 0) break;
    TIME_SLOTS_15.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}

export const HOUR_LABELS: string[] = [];
for (let h = 6; h <= 20; h++) {
  HOUR_LABELS.push(`${String(h).padStart(2, '0')}:00`);
}

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DAY_NAMES_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const GRID_START_HOUR = 6;
export const GRID_END_HOUR = 20;
export const SLOT_HEIGHT = 20;
export const MINUTES_PER_SLOT = 15;

// ── Session Tracking ─────────────────────────────────────────────────────────

export interface WeeklySessionBalance {
  clientId: string;
  clientName: string;
  program: string;
  sessionsAllowed: number;
  sessionsUsed: number;
  sessionsRemaining: number;
}

/**
 * Get weekly session balance for a single client.
 * Now accepts an explicit clientList instead of relying on the (empty) global mock array.
 */
export function getWeeklySessionBalance(
  clientId: string,
  appointments: Appointment[],
  weekDates: Date[],
  clientList: ScheduleContact[] = [],
): WeeklySessionBalance | null {
  const client = clientList.find(c => c.id === clientId);
  if (!client) return null;

  const program = getProgramDefinition(client.program);
  if (!program) return null;
  const weekKeys = weekDates.map(d => formatDateKey(d));
  const sessionsUsed = appointments.filter(a =>
    a.clientId === clientId &&
    weekKeys.includes(a.date) &&
    a.status !== 'cancelled' &&
    a.status !== 'no-show' &&
    (a.appointmentTypeId === 'individual-training' || a.appointmentTypeId === 'couples-training' || a.appointmentTypeId === 'partner-training')
  ).length;



  return {
    clientId,
    clientName: client.name,
    program: client.program,
    sessionsAllowed: program.sessionsPerWeek,
    sessionsUsed,
    sessionsRemaining: Math.max(0, program.sessionsPerWeek - sessionsUsed),
  };
}

export function getAllSessionBalances(
  appointments: Appointment[],
  weekDates: Date[],
  clientList: ScheduleContact[],
): WeeklySessionBalance[] {
  return clientList
    .filter(c => c.status === 'active' || c.status === 'new' || c.status === 'active-client' || c.status === 'active-jumpstart')
    .map(c => getWeeklySessionBalance(c.id, appointments, weekDates, clientList))
    .filter(Boolean) as WeeklySessionBalance[];
}

// ── Utility Functions ────────────────────────────────────────────────────────

export function getAppointmentsForDate(appointments: Appointment[], dateKey: string): Appointment[] {
  return appointments
    .filter(a => a.date === dateKey && a.status !== 'cancelled')
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

export function getCoachAppointments(appointments: Appointment[], coachId: string, dateKey: string): Appointment[] {
  return appointments
    .filter(a => a.coachId === coachId && a.date === dateKey && a.status !== 'cancelled')
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

// ── Overlap Rules ────────────────────────────────────────────────────────────
// Some appointment types are allowed to overlap with each other because they
// happen during the same session. For example, biometric assessments are
// performed DURING a personal training session, so they can (and should) be
// able to share the same time slot with a training appointment.

/** Appointment type IDs that count as a "training session" */
export const TRAINING_TYPE_IDS = new Set<string>([
  'individual-training',
  'couples-training',
  'partner-training',
]);

/** Appointment type IDs that can overlap with training sessions (done in-session) */
export const IN_SESSION_TYPE_IDS = new Set<string>([
  'biometric-assessment',
]);

/**
 * Returns true if two appointment types are allowed to occupy the same time slot.
 * Currently: training sessions may overlap with biometric assessments (and vice versa)
 * because biometrics are performed during the session.
 */
export function canOverlapAppointmentTypes(typeIdA: string, typeIdB: string): boolean {
  if (!typeIdA || !typeIdB) return false;
  const aIsTraining = TRAINING_TYPE_IDS.has(typeIdA);
  const bIsTraining = TRAINING_TYPE_IDS.has(typeIdB);
  const aIsInSession = IN_SESSION_TYPE_IDS.has(typeIdA);
  const bIsInSession = IN_SESSION_TYPE_IDS.has(typeIdB);
  // Training + biometric (in either order) may share a slot
  if (aIsTraining && bIsInSession) return true;
  if (bIsTraining && aIsInSession) return true;
  return false;
}

/** Returns true if the appointment is a training session type. */
export function isTrainingAppointment(appt: Appointment | null | undefined): boolean {
  return !!appt && TRAINING_TYPE_IDS.has(appt.appointmentTypeId);
}

/** Returns true if the appointment is an in-session type (e.g. biometric). */
export function isInSessionAppointment(appt: Appointment | null | undefined): boolean {
  return !!appt && IN_SESSION_TYPE_IDS.has(appt.appointmentTypeId);
}

/**
 * Find an overlapping "in-session pair" for the given appointment.
 * Specifically: if appt is a training session, returns the overlapping biometric
 * (or other in-session type) on the same coach/date. Vice versa for biometric.
 * Returns null if no pair is found.
 */
export function findInSessionPair(
  appt: Appointment,
  allAppointments: Appointment[],
): Appointment | null {
  if (!appt) return null;
  const apptIsTraining = isTrainingAppointment(appt);
  const apptIsInSession = isInSessionAppointment(appt);
  if (!apptIsTraining && !apptIsInSession) return null;

  for (const other of allAppointments) {
    if (other.id === appt.id) continue;
    if (other.coachId !== appt.coachId) continue;
    if (other.date !== appt.date) continue;
    if (other.status === 'cancelled') continue;
    // Must also share the same client (biometrics are done for the client in-session)
    if (other.clientId !== appt.clientId) continue;
    // Types must be a valid in-session pair
    if (!canOverlapAppointmentTypes(appt.appointmentTypeId, other.appointmentTypeId)) continue;
    // Must overlap in time
    const overlaps = appt.startTime < other.endTime && appt.endTime > other.startTime;
    if (!overlaps) continue;
    return other;
  }
  return null;
}


export function hasTimeConflict(
  appointments: Appointment[], coachId: string, date: string, startTime: string, endTime: string,
  excludeId?: string, appointmentTypeId?: string,
): boolean {
  return appointments.some(a => {
    if (a.coachId !== coachId || a.date !== date || a.status === 'cancelled') return false;
    if (excludeId && a.id === excludeId) return false;
    const timeOverlaps = a.startTime < endTime && a.endTime > startTime;
    if (!timeOverlaps) return false;
    // Allow overlap when the two appointment types are permitted to share a slot
    if (appointmentTypeId && canOverlapAppointmentTypes(appointmentTypeId, a.appointmentTypeId)) {
      return false;
    }
    return true;
  });
}

// Mock appointments are now empty — trainers/dietitians/clients arrays were removed from mockData.
// Appointments should be created via the Schedule UI and stored in local state (or future DB table).
export const mockAppointments: Appointment[] = [];
