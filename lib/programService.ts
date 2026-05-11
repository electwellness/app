import { supabase } from './supabase';
import { isValidUUID } from './clientDataService';
import { getProgramDefinition } from '../data/scheduleData';

export interface ProgramHistoryEntry {
  id: string;
  user_id: string;
  program: string;
  start_date: string;
  stop_date: string | null;
  status: 'active' | 'stopped';
  stopped_by: string | null;
  notes: string | null;
  has_nutrition: boolean;
  created_at: string;
}

// ─── Program Cycle Constants ─────────────────────────────────────────────────



export const PROGRAM_CYCLE_WEEKS = 13;
export const PROGRAM_CYCLE_DAYS = PROGRAM_CYCLE_WEEKS * 7; // 91 days

export interface ProgramCycleInfo {
  /** Total days since program start */
  totalDays: number;
  /** Current cycle number (1-based) */
  currentCycle: number;
  /** Current week within the cycle (1-13) */
  weekInCycle: number;
  /** Day within the current week (1-7) */
  dayInWeek: number;
  /** Days elapsed in the current cycle */
  daysIntoCycle: number;
  /** Days remaining until next renewal */
  daysUntilRenewal: number;
  /** The date the next renewal will occur */
  nextRenewalDate: Date;
  /** Formatted next renewal date string (e.g. "Jun 30, 2026") */
  nextRenewalDateFormatted: string;
  /** Whether the program has an end date set (stops auto-renewal) */
  hasEndDate: boolean;
  /** Sessions per cycle for the program tier (e.g. Platinum=52, Gold=39, Silver=26, Bronze=13). Null if tier unknown. */
  sessionsPerCycle: number | null;
  /** Sessions per week for the program tier. Null if tier unknown. */
  sessionsPerWeek: number | null;
}


/**
 * Calculate program cycle information based on a 13-week (91-day) cycle.
 * Programs auto-renew every 13 weeks until an end date is set.
 * If programName is provided, sessionsPerCycle and sessionsPerWeek are populated from the program definition.
 */
export function getProgramCycleInfo(startDateStr: string, endDateStr?: string | null, programName?: string | null): ProgramCycleInfo | null {
  if (!startDateStr) return null;
  try {
    const start = new Date(startDateStr + 'T12:00:00');
    if (isNaN(start.getTime())) return null;

    const hasEndDate = !!endDateStr;
    const now = new Date();
    const referenceDate = hasEndDate ? new Date(endDateStr + 'T12:00:00') : now;
    if (isNaN(referenceDate.getTime())) return null;

    const totalDays = Math.max(0, Math.floor((referenceDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));

    // Programs renew at the END of each 91-day cycle.
    // Day 91 is the last day of cycle 1 (renewal day), day 92 starts cycle 2.
    const currentCycle = totalDays <= 0 ? 1 : Math.ceil(totalDays / PROGRAM_CYCLE_DAYS);
    const daysIntoCycle = totalDays - ((currentCycle - 1) * PROGRAM_CYCLE_DAYS);
    const weekInCycle = Math.min(PROGRAM_CYCLE_WEEKS, Math.floor(daysIntoCycle / 7) + 1);
    const dayInWeek = (daysIntoCycle % 7) + 1;
    const daysUntilRenewal = PROGRAM_CYCLE_DAYS - daysIntoCycle;

    // Calculate next renewal date from start
    const nextRenewalDate = new Date(start);
    nextRenewalDate.setDate(nextRenewalDate.getDate() + (currentCycle * PROGRAM_CYCLE_DAYS));


    const nextRenewalDateFormatted = nextRenewalDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    // Look up session counts from program definition if programName is provided
    let sessionsPerCycle: number | null = null;
    let sessionsPerWeek: number | null = null;
    if (programName) {
      const progDef = getProgramDefinition(programName);
      if (progDef) {
        sessionsPerCycle = progDef.sessionsPerCycle;
        sessionsPerWeek = progDef.sessionsPerWeek;
      }
    }

    return {
      totalDays,
      currentCycle,
      weekInCycle,
      dayInWeek,
      daysIntoCycle,
      daysUntilRenewal,
      nextRenewalDate,
      nextRenewalDateFormatted,
      hasEndDate,
      sessionsPerCycle,
      sessionsPerWeek,
    };
  } catch {
    return null;
  }
}






// ─── Date Validation Helpers ─────────────────────────────────────────────────

/**
 * Returns today's date as a YYYY-MM-DD string.
 */
export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Validates that a string is a well-formed YYYY-MM-DD date
 * AND that it represents a real calendar date (e.g. rejects 2025-02-30).
 */
export function isValidDateString(dateStr: unknown): dateStr is string {
  if (typeof dateStr !== 'string' || !dateStr) return false;
  // Must match YYYY-MM-DD pattern
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  // Parse and verify the date is real (not NaN, and round-trips correctly)
  const d = new Date(dateStr + 'T12:00:00');
  if (isNaN(d.getTime())) return false;
  // Verify the parsed date matches the input (catches things like Feb 30 → Mar 2)
  const parsedYear = d.getFullYear();
  const parsedMonth = d.getMonth() + 1;
  const parsedDay = d.getDate();
  const [inputYear, inputMonth, inputDay] = dateStr.split('-').map(Number);
  return parsedYear === inputYear && parsedMonth === inputMonth && parsedDay === inputDay;
}

/**
 * Sanitizes a date string: returns it if valid YYYY-MM-DD, otherwise returns
 * the provided fallback (defaults to today's date).
 */
export function sanitizeDateString(dateStr: unknown, fallback?: string): string {
  if (isValidDateString(dateStr)) return dateStr;
  if (fallback && isValidDateString(fallback)) return fallback;
  return getTodayDateString();
}


// ─── Service Functions ───────────────────────────────────────────────────────

/**
 * Fetch program history for a user, ordered by start_date descending
 */
export async function fetchProgramHistory(userId: string): Promise<ProgramHistoryEntry[]> {
  if (!isValidUUID(userId)) {
    console.warn('fetchProgramHistory: skipping for non-UUID userId:', userId);
    return [];
  }

  const { data, error } = await supabase
    .from('client_program_history')
    .select('*')
    .eq('user_id', userId)
    .order('start_date', { ascending: false });

  if (error) {
    console.error('Error fetching program history:', error);
    return [];
  }

  return (data || []) as ProgramHistoryEntry[];
}

/**
 * Assign a program to a user. This:
 * 1. Validates and sanitizes the start_date (must be YYYY-MM-DD; defaults to today)
 * 2. Stops any currently active program
 * 3. Creates a new program history entry
 * 4. Updates user_profiles with the new program info
 */
export async function assignProgram(
  userId: string,
  programName: string,
  startDate: string,
  hasNutrition?: boolean,
): Promise<{ error: string | null }> {
  if (!isValidUUID(userId)) {
    console.warn('assignProgram: skipping for non-UUID userId:', userId);
    return { error: null };
  }

  // ── Validate & sanitize start_date ──
  const validatedStartDate = sanitizeDateString(startDate);
  if (!isValidDateString(startDate)) {
    console.warn(
      `assignProgram: invalid start_date "${startDate}" was provided for user ${userId}. ` +
      `Falling back to "${validatedStartDate}".`
    );
  }

  // ── Validate programName ──
  if (!programName || typeof programName !== 'string' || programName.trim().length === 0) {
    return { error: 'Program name is required' };
  }

  try {
    // 1. Stop any currently active program in history
    const { data: activePrograms } = await supabase
      .from('client_program_history')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (activePrograms && activePrograms.length > 0) {
      for (const ap of activePrograms) {
        await supabase
          .from('client_program_history')
          .update({
            status: 'stopped',
            stop_date: validatedStartDate,
            notes: 'Auto-stopped: new program assigned',
            updated_at: new Date().toISOString(),
          })
          .eq('id', ap.id);
      }
    }

    // 2. Create new program history entry
    const { error: historyError } = await supabase
      .from('client_program_history')
      .insert({
        user_id: userId,
        program: programName.trim(),
        start_date: validatedStartDate,
        status: 'active',
        has_nutrition: hasNutrition ?? false,
      });

    if (historyError) {
      console.error('Error creating program history:', historyError);
      return { error: historyError.message };
    }

    // 3. Update user_profiles
    const { error: profileError } = await supabase
      .from('user_profiles')
      .update({
        program: programName.trim(),
        program_start_date: validatedStartDate,
        program_stop_date: null,
        program_status: 'active',
        has_nutrition: hasNutrition ?? false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (profileError) {
      console.error('Error updating profile program:', profileError);
      return { error: profileError.message };
    }

    return { error: null };
  } catch (err: any) {
    return { error: err.message || 'An unexpected error occurred' };
  }
}


/**
 * Stop the current program for a user. This:
 * 1. Validates and sanitizes the stop_date (must be YYYY-MM-DD; defaults to today)
 * 2. Updates the active program history entry with stop date
 * 3. Updates user_profiles with stopped status
 */
export async function stopProgram(
  userId: string,
  stopDate: string,
  stoppedBy?: string,
  notes?: string,
): Promise<{ error: string | null }> {
  if (!isValidUUID(userId)) {
    console.warn('stopProgram: skipping for non-UUID userId:', userId);
    return { error: null };
  }

  // ── Validate & sanitize stop_date ──
  const validatedStopDate = sanitizeDateString(stopDate);
  if (!isValidDateString(stopDate)) {
    console.warn(
      `stopProgram: invalid stop_date "${stopDate}" was provided for user ${userId}. ` +
      `Falling back to "${validatedStopDate}".`
    );
  }

  try {
    // 1. Update active program history entry
    const { error: historyError } = await supabase
      .from('client_program_history')
      .update({
        status: 'stopped',
        stop_date: validatedStopDate,
        stopped_by: stoppedBy || null,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('status', 'active');

    if (historyError) {
      console.error('Error updating program history:', historyError);
      return { error: historyError.message };
    }

    // 2. Update user_profiles
    const { error: profileError } = await supabase
      .from('user_profiles')
      .update({
        program_stop_date: validatedStopDate,
        program_status: 'stopped',
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (profileError) {
      console.error('Error updating profile program status:', profileError);
      return { error: profileError.message };
    }

    return { error: null };
  } catch (err: any) {
    return { error: err.message || 'An unexpected error occurred' };
  }
}


/**
 * Update a single program history entry by ID.
 * Validates start_date and stop_date if provided.
 * Optionally syncs changes to user_profiles if the entry is active.
 * Includes retry logic for transient network failures.
 */
export async function updateProgramHistoryEntry(
  entryId: string,
  updates: {
    program?: string;
    start_date?: string;
    stop_date?: string | null;
    status?: 'active' | 'stopped';
    notes?: string | null;
    stopped_by?: string | null;
    has_nutrition?: boolean;
  },
): Promise<{ error: string | null }> {
  if (!isValidUUID(entryId)) {
    return { error: 'Invalid entry ID' };
  }

  // ── Validate start_date if provided ──
  if (updates.start_date !== undefined) {
    if (!isValidDateString(updates.start_date)) {
      const sanitized = sanitizeDateString(updates.start_date);
      console.warn(
        `updateProgramHistoryEntry: invalid start_date "${updates.start_date}" for entry ${entryId}. ` +
        `Falling back to "${sanitized}".`
      );
      updates.start_date = sanitized;
    }
  }

  // ── Validate stop_date if provided and non-null ──
  if (updates.stop_date !== undefined && updates.stop_date !== null) {
    if (!isValidDateString(updates.stop_date)) {
      const sanitized = sanitizeDateString(updates.stop_date);
      console.warn(
        `updateProgramHistoryEntry: invalid stop_date "${updates.stop_date}" for entry ${entryId}. ` +
        `Falling back to "${sanitized}".`
      );
      updates.stop_date = sanitized;
    }
  }

  // ── Validate program name if provided ──
  if (updates.program !== undefined) {
    if (!updates.program || typeof updates.program !== 'string' || updates.program.trim().length === 0) {
      return { error: 'Program name cannot be empty' };
    }
    updates.program = updates.program.trim();
  }

  // Retry helper for transient network failures
  const attemptFetch = async <T>(fn: () => Promise<T>, retries = 2, delayMs = 800): Promise<T> => {
    for (let i = 0; i <= retries; i++) {
      try {
        return await fn();
      } catch (err: any) {
        const isFetchError = err?.message?.toLowerCase()?.includes('fetch') || err?.name === 'TypeError';
        if (i < retries && isFetchError) {
          console.warn(`Network error on attempt ${i + 1}, retrying in ${delayMs}ms...`);
          await new Promise(r => setTimeout(r, delayMs));
          continue;
        }
        throw err;
      }
    }
    throw new Error('Max retries exceeded');
  };

  try {
    const updatePayload: Record<string, unknown> = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    const { error } = await attemptFetch(() =>
      supabase
        .from('client_program_history')
        .update(updatePayload)
        .eq('id', entryId)
    );

    if (error) {
      console.error('Error updating program history entry:', error);
      return { error: error.message };
    }

    // Fetch the full entry to get user_id and current data for profile sync
    const { data: entry } = await supabase
      .from('client_program_history')
      .select('*')
      .eq('id', entryId)
      .single();

    if (entry && entry.status === 'active') {
      const profileUpdate: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (updates.program !== undefined) profileUpdate.program = updates.program;
      if (updates.start_date !== undefined) profileUpdate.program_start_date = updates.start_date;
      if (updates.stop_date !== undefined) profileUpdate.program_stop_date = updates.stop_date;
      if (updates.status !== undefined) profileUpdate.program_status = updates.status;
      if (updates.has_nutrition !== undefined) profileUpdate.has_nutrition = updates.has_nutrition;

      // Only update profile if there are meaningful changes
      if (Object.keys(profileUpdate).length > 1) {
        try {
          await attemptFetch(() =>
            supabase
              .from('user_profiles')
              .update(profileUpdate)
              .eq('id', entry.user_id)
          );
        } catch (profileErr) {
          // Profile sync failure is non-fatal; the history entry was already saved
          console.warn('Profile sync failed (non-fatal):', profileErr);
        }
      }
    }

    // If entry was changed to stopped, also sync
    if (entry && updates.status === 'stopped') {
      try {
        await attemptFetch(() =>
          supabase
            .from('user_profiles')
            .update({
              program_stop_date: updates.stop_date || entry.stop_date,
              program_status: 'stopped',
              updated_at: new Date().toISOString(),
            })
            .eq('id', entry.user_id)
        );
      } catch (profileErr) {
        console.warn('Profile status sync failed (non-fatal):', profileErr);
      }
    }

    return { error: null };
  } catch (err: any) {
    const msg = err?.message || 'An unexpected error occurred';
    if (msg.toLowerCase().includes('fetch')) {
      return { error: 'Network error — please check your connection and try again.' };
    }
    return { error: msg };
  }
}



/**
 * Delete a single program history entry by ID.
 */
export async function deleteProgramHistoryEntry(
  entryId: string,
): Promise<{ error: string | null }> {
  if (!isValidUUID(entryId)) {
    return { error: 'Invalid entry ID' };
  }

  try {
    const { error } = await supabase
      .from('client_program_history')
      .delete()
      .eq('id', entryId);

    if (error) {
      console.error('Error deleting program history entry:', error);
      return { error: error.message };
    }

    return { error: null };
  } catch (err: any) {
    return { error: err.message || 'An unexpected error occurred' };
  }
}
