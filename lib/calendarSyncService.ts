/**
 * calendarSyncService.ts
 *
 * Frontend service layer for the manage-calendar-sync edge function.
 * Handles calendar connections, external event import, and conflict detection.
 * 
 * Uses the shared edgeFunctionHelper for session validation and retry logic.
 */

import { invokeEdgeFunction } from './edgeFunctionHelper';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CalendarConnection {
  id: string;
  user_id: string;
  provider: 'google' | 'apple' | 'outlook';
  provider_email: string;
  calendar_name: string;
  sync_enabled: boolean;
  sync_direction: 'export_only' | 'import_only' | 'bidirectional';
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExternalCalendarEvent {
  id: string;
  connection_id: string;
  user_id: string;
  external_event_id: string;
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  all_day: boolean;
  location: string;
  status: string;
  source_calendar: string;
}

export interface CalendarConflict {
  externalEvent: ExternalCalendarEvent;
  provider: string;
  calendarName: string;
  overlapMinutes: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function invoke<T = any>(body: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  return invokeEdgeFunction<T>('manage-calendar-sync', body, {
    maxRetries: 1,
    retryDelay: 1500,
  });
}

// ── Connection Management ────────────────────────────────────────────────────

export async function getConnections(): Promise<{
  connections: CalendarConnection[];
  error: string | null;
}> {
  const { data, error } = await invoke<{ connections: CalendarConnection[] }>({
    action: 'getConnections',
  });
  return {
    connections: data?.connections || [],
    error,
  };
}

export async function saveConnection(params: {
  provider: 'google' | 'apple' | 'outlook';
  providerEmail?: string;
  calendarName?: string;
  syncDirection?: 'export_only' | 'import_only' | 'bidirectional';
}): Promise<{
  connection: CalendarConnection | null;
  error: string | null;
}> {
  const { data, error } = await invoke<{ connection: CalendarConnection }>({
    action: 'saveConnection',
    ...params,
  });
  return {
    connection: data?.connection || null,
    error,
  };
}

export async function disconnectCalendar(provider: string): Promise<{
  success: boolean;
  error: string | null;
}> {
  const { data, error } = await invoke<{ success: boolean }>({
    action: 'disconnect',
    provider,
  });
  return {
    success: data?.success || false,
    error,
  };
}

export async function toggleSync(connectionId: string, enabled: boolean): Promise<{
  connection: CalendarConnection | null;
  error: string | null;
}> {
  const { data, error } = await invoke<{ connection: CalendarConnection }>({
    action: 'toggleSync',
    connectionId,
    enabled,
  });
  return {
    connection: data?.connection || null,
    error,
  };
}

export async function updateSyncDirection(connectionId: string, syncDirection: string): Promise<{
  connection: CalendarConnection | null;
  error: string | null;
}> {
  const { data, error } = await invoke<{ connection: CalendarConnection }>({
    action: 'updateSyncDirection',
    connectionId,
    syncDirection,
  });
  return {
    connection: data?.connection || null,
    error,
  };
}

// ── External Events ──────────────────────────────────────────────────────────

export async function getExternalEvents(dateFrom: string, dateTo: string): Promise<{
  events: ExternalCalendarEvent[];
  connections: { id: string; provider: string; calendarName: string; providerEmail: string }[];
  error: string | null;
}> {
  const { data, error } = await invoke<{
    events: ExternalCalendarEvent[];
    connections: { id: string; provider: string; calendarName: string; providerEmail: string }[];
  }>({
    action: 'getExternalEvents',
    dateFrom,
    dateTo,
  });
  return {
    events: data?.events || [],
    connections: data?.connections || [],
    error,
  };
}

export async function importEvents(connectionId: string, dateFrom: string, dateTo: string): Promise<{
  events: ExternalCalendarEvent[];
  lastSynced: string;
  error: string | null;
}> {
  const { data, error } = await invoke<{
    events: ExternalCalendarEvent[];
    lastSynced: string;
  }>({
    action: 'importEvents',
    connectionId,
    dateFrom,
    dateTo,
  });
  return {
    events: data?.events || [],
    lastSynced: data?.lastSynced || '',
    error,
  };
}

export async function saveExternalEvents(connectionId: string, events: {
  externalEventId: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  allDay?: boolean;
  location?: string;
  status?: string;
  sourceCalendar?: string;
}[]): Promise<{
  events: ExternalCalendarEvent[];
  error: string | null;
}> {
  const { data, error } = await invoke<{ events: ExternalCalendarEvent[] }>({
    action: 'saveExternalEvents',
    connectionId,
    events,
  });
  return {
    events: data?.events || [],
    error,
  };
}

// ── Google OAuth ─────────────────────────────────────────────────────────────

export async function getGoogleAuthUrl(redirectUri: string): Promise<{
  authUrl: string | null;
  manualSetup: boolean;
  message: string;
  error: string | null;
}> {
  const { data, error } = await invoke<{
    authUrl: string | null;
    manualSetup: boolean;
    message: string;
  }>({
    action: 'getGoogleAuthUrl',
    redirectUri,
  });
  return {
    authUrl: data?.authUrl || null,
    manualSetup: data?.manualSetup || false,
    message: data?.message || '',
    error,
  };
}

// ── Conflict Detection ───────────────────────────────────────────────────────

/**
 * Check if a proposed appointment time conflicts with external calendar events.
 * Returns a list of conflicting external events.
 */
export function detectExternalConflicts(
  externalEvents: ExternalCalendarEvent[],
  date: string,
  startTime: string,
  endTime: string,
  connections: { id: string; provider: string; calendarName: string }[] = [],
): CalendarConflict[] {
  const conflicts: CalendarConflict[] = [];

  // Convert proposed time to comparable format
  const proposedStart = new Date(`${date}T${startTime}:00`);
  const proposedEnd = new Date(`${date}T${endTime}:00`);

  for (const event of externalEvents) {
    if (event.all_day) continue; // Skip all-day events for time conflict
    if (event.status === 'cancelled') continue;

    const eventStart = new Date(event.start_time);
    const eventEnd = new Date(event.end_time);

    // Check if the event is on the same date
    const eventDate = eventStart.toISOString().split('T')[0];
    if (eventDate !== date) continue;

    // Check for time overlap
    if (proposedStart < eventEnd && proposedEnd > eventStart) {
      // Calculate overlap in minutes
      const overlapStart = Math.max(proposedStart.getTime(), eventStart.getTime());
      const overlapEnd = Math.min(proposedEnd.getTime(), eventEnd.getTime());
      const overlapMinutes = Math.round((overlapEnd - overlapStart) / 60000);

      const connection = connections.find(c => c.id === event.connection_id);

      conflicts.push({
        externalEvent: event,
        provider: connection?.provider || 'external',
        calendarName: connection?.calendarName || 'External Calendar',
        overlapMinutes,
      });
    }
  }

  return conflicts;
}

/**
 * Format a time range for display
 */
export function formatExternalEventTime(event: ExternalCalendarEvent): string {
  const start = new Date(event.start_time);
  const end = new Date(event.end_time);
  
  const formatTime = (d: Date) => {
    const h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  if (event.all_day) return 'All Day';
  return `${formatTime(start)} - ${formatTime(end)}`;
}
