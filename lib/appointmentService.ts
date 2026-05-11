/**
 * appointmentService.ts
 *
 * Frontend service layer for the appointments edge function.
 * All CRUD operations call the `manage-appointments` edge function
 * and return typed results matching the Appointment interface.
 * 
 * Uses the shared edgeFunctionHelper for session validation and retry logic.
 */

import { invokeEdgeFunction } from './edgeFunctionHelper';
import type { Appointment, RecurrencePattern } from '../data/scheduleData';

// ── Session Sync Result Type ─────────────────────────────────────────────────

export interface SessionSyncResult {
  synced: boolean;
  count: number;
  details: Array<{
    clientId: string;
    synced: boolean;
    action: string;
    error?: string;
  }>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function invoke<T = any>(body: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  return invokeEdgeFunction<T>('manage-appointments', body, {
    maxRetries: 1,
    retryDelay: 1500,
  });
}



// ── FETCH ────────────────────────────────────────────────────────────────────

export interface FetchAppointmentsParams {
  franchise?: string;
  coachId?: string;
  clientId?: string;
  dateFrom?: string;
  dateTo?: string;
}


export async function fetchAppointments(params: FetchAppointmentsParams = {}): Promise<{
  appointments: Appointment[];
  error: string | null;
}> {
  const { data, error } = await invoke<{ appointments: Appointment[] }>({
    action: 'fetch',
    ...params,
  });
  return {
    appointments: data?.appointments || [],
    error,
  };
}

// ── CREATE (single) ──────────────────────────────────────────────────────────

export async function createAppointment(appointment: Appointment): Promise<{
  appointment: Appointment | null;
  error: string | null;
}> {
  const { data, error } = await invoke<{ appointments: Appointment[] }>({
    action: 'create',
    appointment,
  });
  return {
    appointment: data?.appointments?.[0] || null,
    error,
  };
}

// ── CREATE BULK (recurring series) ───────────────────────────────────────────

export async function createAppointmentsBulk(appointments: Appointment[]): Promise<{
  appointments: Appointment[];
  error: string | null;
}> {
  const { data, error } = await invoke<{ appointments: Appointment[] }>({
    action: 'create',
    appointments,
  });
  return {
    appointments: data?.appointments || [],
    error,
  };
}

// ── CREATE PARTNER SESSION ───────────────────────────────────────────────────

export interface PartnerSessionResult {
  appointments: Appointment[];
  partnerGroup: {
    id: string;
    members: { userId: string; fullName: string }[];
  } | null;
  error: string | null;
}

export async function createPartnerSession(
  appointment: Omit<Appointment, 'id'>,
  partnerGroupId: string,
): Promise<PartnerSessionResult> {
  const { data, error } = await invoke<{
    appointments: Appointment[];
    partnerGroup: { id: string; members: { userId: string; fullName: string }[] };
  }>({
    action: 'createPartnerSession',
    appointment,
    partnerGroupId,
  });
  return {
    appointments: data?.appointments || [],
    partnerGroup: data?.partnerGroup || null,
    error,
  };
}


// ── UPDATE STATUS (with session sync info) ───────────────────────────────────

export async function updateAppointmentStatus(id: string, status: Appointment['status']): Promise<{
  appointment: Appointment | null;
  sessionSync: SessionSyncResult | null;
  error: string | null;
}> {
  const { data, error } = await invoke<{ appointment: Appointment; sessionSync?: SessionSyncResult }>({
    action: 'updateStatus',
    id,
    status,
  });
  return {
    appointment: data?.appointment || null,
    sessionSync: data?.sessionSync || null,
    error,
  };
}


// ── RESCHEDULE SINGLE ────────────────────────────────────────────────────────

export async function rescheduleAppointment(
  id: string,
  newDate: string,
  newStartTime: string,
  newEndTime: string,
  isRecurrenceException?: boolean,
): Promise<{
  appointment: Appointment | null;
  error: string | null;
}> {
  const { data, error } = await invoke<{ appointment: Appointment }>({
    action: 'reschedule',
    id,
    date: newDate,
    startTime: newStartTime,
    endTime: newEndTime,
    isRecurrenceException: isRecurrenceException || false,
  });
  return {
    appointment: data?.appointment || null,
    error,
  };
}

// ── BULK RESCHEDULE ──────────────────────────────────────────────────────────

export async function bulkRescheduleAppointments(
  recurrenceId: string,
  fromDate: string,
  dayTimeShifts: { oldDay: number; newDay: number; newTime: string }[],
): Promise<{
  appointments: Appointment[];
  count: number;
  error: string | null;
}> {
  const { data, error } = await invoke<{ appointments: Appointment[]; count: number }>({
    action: 'bulkReschedule',
    recurrenceId,
    fromDate,
    dayTimeShifts,
  });
  return {
    appointments: data?.appointments || [],
    count: data?.count || 0,
    error,
  };
}

// ── BULK CANCEL ──────────────────────────────────────────────────────────────

export async function bulkCancelAppointments(
  recurrenceId: string,
  fromDate: string,
): Promise<{
  appointments: Appointment[];
  count: number;
  error: string | null;
}> {
  const { data, error } = await invoke<{ appointments: Appointment[]; count: number }>({
    action: 'bulkCancel',
    recurrenceId,
    fromDate,
  });
  return {
    appointments: data?.appointments || [],
    count: data?.count || 0,
    error,
  };
}

// ── DELETE SINGLE ────────────────────────────────────────────────────────────

export async function deleteAppointment(id: string): Promise<{
  success: boolean;
  error: string | null;
}> {
  const { data, error } = await invoke<{ success: boolean }>({
    action: 'delete',
    id,
  });
  return {
    success: data?.success || false,
    error,
  };
}

// ── BULK DELETE ──────────────────────────────────────────────────────────────

export async function bulkDeleteAppointments(
  recurrenceId: string,
  fromDate: string,
): Promise<{
  deletedIds: string[];
  count: number;
  error: string | null;
}> {
  const { data, error } = await invoke<{ deletedIds: string[]; count: number }>({
    action: 'bulkDelete',
    recurrenceId,
    fromDate,
  });
  return {
    deletedIds: data?.deletedIds || [],
    count: data?.count || 0,
    error,
  };
}
