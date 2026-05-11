// Notification Preferences Service
// Communicates with the manage-notification-preferences edge function
import { supabase } from './supabase';

export interface NotificationPreferences {
  user_id?: string;

  // Meal photo logging reminders
  meal_reminders_enabled: boolean;
  breakfast_reminder_enabled: boolean;
  breakfast_reminder_time: string; // "HH:MM" format
  lunch_reminder_enabled: boolean;
  lunch_reminder_time: string;
  dinner_reminder_enabled: boolean;
  dinner_reminder_time: string;

  // Upcoming session alerts
  session_alerts_enabled: boolean;
  session_alert_advance_minutes: number; // 15, 30, 60, 120, 1440
  session_alert_same_day: boolean;
  session_alert_day_before: boolean;

  // Weekly progress summary
  weekly_summary_enabled: boolean;
  weekly_summary_day: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
  weekly_summary_time: string; // "HH:MM" format

  // Quiet hours
  quiet_hours_enabled: boolean;
  quiet_hours_start: string; // "HH:MM"
  quiet_hours_end: string;   // "HH:MM"
}

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  meal_reminders_enabled: true,
  breakfast_reminder_enabled: true,
  breakfast_reminder_time: '08:00',
  lunch_reminder_enabled: true,
  lunch_reminder_time: '12:00',
  dinner_reminder_enabled: true,
  dinner_reminder_time: '18:30',
  session_alerts_enabled: true,
  session_alert_advance_minutes: 60,
  session_alert_same_day: true,
  session_alert_day_before: true,
  weekly_summary_enabled: true,
  weekly_summary_day: 0,
  weekly_summary_time: '09:00',
  quiet_hours_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '07:00',
};

export interface FetchPreferencesResult {
  success: boolean;
  preferences: NotificationPreferences;
  isDefault: boolean;
  error?: string;
}

export interface SavePreferencesResult {
  success: boolean;
  preferences?: NotificationPreferences;
  error?: string;
}

/**
 * Fetch notification preferences for a user.
 * Returns defaults if no preferences have been saved yet.
 */
export async function fetchNotificationPreferences(
  userId: string
): Promise<FetchPreferencesResult> {
  try {
    const { data, error } = await supabase.functions.invoke(
      'manage-notification-preferences',
      {
        body: {
          action: 'get-preferences',
          userId,
        },
      }
    );

    if (error) {
      console.error('[notifPrefsService] fetch error:', error);
      return {
        success: false,
        preferences: { ...DEFAULT_PREFERENCES },
        isDefault: true,
        error: error.message || 'Network error',
      };
    }

    if (data && data.success === false) {
      return {
        success: false,
        preferences: { ...DEFAULT_PREFERENCES },
        isDefault: true,
        error: data.error || 'Unknown API error',
      };
    }

    return {
      success: true,
      preferences: data?.preferences || { ...DEFAULT_PREFERENCES },
      isDefault: data?.isDefault ?? true,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[notifPrefsService] fetch exception:', msg);
    return {
      success: false,
      preferences: { ...DEFAULT_PREFERENCES },
      isDefault: true,
      error: msg,
    };
  }
}

/**
 * Save (upsert) notification preferences for a user.
 */
export async function saveNotificationPreferences(
  userId: string,
  preferences: Partial<NotificationPreferences>
): Promise<SavePreferencesResult> {
  try {
    const { data, error } = await supabase.functions.invoke(
      'manage-notification-preferences',
      {
        body: {
          action: 'upsert-preferences',
          userId,
          preferences,
        },
      }
    );

    if (error) {
      console.error('[notifPrefsService] save error:', error);
      return { success: false, error: error.message || 'Network error' };
    }

    if (data && data.success === false) {
      return { success: false, error: data.error || 'Unknown API error' };
    }

    return {
      success: true,
      preferences: data?.preferences,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[notifPrefsService] save exception:', msg);
    return { success: false, error: msg };
  }
}

// Helper: format "HH:MM" to a human-readable time string
export function formatTime(time: string): string {
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

// Helper: day number to name
export function dayName(day: number): string {
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return names[day] || 'Sunday';
}

// Helper: advance minutes to human string
export function advanceLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min before`;
  if (minutes === 60) return '1 hour before';
  if (minutes < 1440) return `${Math.round(minutes / 60)} hours before`;
  return '1 day before';
}
