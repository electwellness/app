/**
 * icsGenerator.ts
 *
 * Generates RFC 5545 compliant .ics (iCalendar) files from appointments.
 * Supports single events, recurring series, and full schedule export.
 */

import type { Appointment, RecurrencePattern } from '../data/scheduleData';
import { Platform } from 'react-native';

// ── Helpers ──────────────────────────────────────────────────────────────────

function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function formatICSDate(dateStr: string, timeStr: string): string {
  // Convert "2026-03-25" + "18:00" to "20260325T180000"
  const [year, month, day] = dateStr.split('-');
  const [hour, minute] = timeStr.split(':');
  return `${year}${month}${day}T${hour}${minute}00`;
}

function formatICSDateOnly(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

function generateUID(appointment: Appointment): string {
  return `${appointment.id}@electwellness.com`;
}

function getRecurrenceRule(pattern: RecurrencePattern): string | null {
  if (pattern.type === 'none') return null;

  const endDate = formatICSDateOnly(pattern.endDate) + 'T235959';
  const interval = pattern.interval || 1;

  if (pattern.type === 'daily') {
    return `RRULE:FREQ=DAILY;INTERVAL=${interval};UNTIL=${endDate}`;
  }

  if (pattern.type === 'weekly' && pattern.weeklyDays && pattern.weeklyDays.length > 0) {
    const dayMap = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
    const days = pattern.weeklyDays.map(wd => dayMap[wd.day]).join(',');
    return `RRULE:FREQ=WEEKLY;INTERVAL=${interval};BYDAY=${days};UNTIL=${endDate}`;
  }

  if (pattern.type === 'monthly') {
    return `RRULE:FREQ=MONTHLY;INTERVAL=${interval};UNTIL=${endDate}`;
  }

  return null;
}

function getAppointmentTypeName(typeId: string): string {
  const typeNames: Record<string, string> = {
    'individual-training': 'Individual Training',
    'couples-training': 'Couples Training',
    'biometric-assessment': 'Biometric Assessment',
    'nutrition-videochat': 'Nutrition Videochat',
    'daily-advising': 'Daily Advising',
  };
  return typeNames[typeId] || 'Appointment';
}

// ── Single Event ICS ─────────────────────────────────────────────────────────

function generateEventBlock(appointment: Appointment, includeRecurrence = false): string {
  const dtStart = formatICSDate(appointment.date, appointment.startTime);
  const dtEnd = formatICSDate(appointment.date, appointment.endTime);
  const uid = generateUID(appointment);
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const typeName = getAppointmentTypeName(appointment.appointmentTypeId);
  const summary = `${typeName} - ${appointment.clientName}`;
  const description = [
    `Coach: ${appointment.coachName}`,
    `Client: ${appointment.clientName}`,
    `Program: ${appointment.clientProgram}`,
    `Type: ${typeName}`,
    `Duration: ${appointment.duration} minutes`,
    `Franchise: ${appointment.franchise}`,
    appointment.notes ? `Notes: ${appointment.notes}` : '',
  ].filter(Boolean).join('\\n');

  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeICSText(summary)}`,
    `DESCRIPTION:${escapeICSText(description)}`,
    `CATEGORIES:${escapeICSText(typeName)}`,
    `STATUS:${appointment.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
    `ORGANIZER;CN=${escapeICSText(appointment.coachName)}:mailto:noreply@electwellness.com`,
  ];

  // Add recurrence rule if applicable
  if (includeRecurrence && appointment.recurrencePattern) {
    const rrule = getRecurrenceRule(appointment.recurrencePattern);
    if (rrule) lines.push(rrule);
  }

  // Add alarm (15 min before)
  lines.push(
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeICSText(summary)} in 15 minutes`,
    'END:VALARM',
  );

  lines.push('END:VEVENT');
  return lines.join('\r\n');
}

// ── Full ICS File Generation ─────────────────────────────────────────────────

function wrapInCalendar(events: string): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Elect Wellness//Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Elect Wellness Schedule',
    'X-WR-TIMEZONE:America/Chicago',
    events,
    'END:VCALENDAR',
  ].join('\r\n');
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate ICS content for a single appointment
 */
export function generateSingleEventICS(appointment: Appointment): string {
  const event = generateEventBlock(appointment, false);
  return wrapInCalendar(event);
}

/**
 * Generate ICS content for a recurring series (uses RRULE)
 */
export function generateRecurringSeriesICS(appointment: Appointment): string {
  const event = generateEventBlock(appointment, true);
  return wrapInCalendar(event);
}

/**
 * Generate ICS content for multiple appointments
 */
export function generateMultiEventICS(appointments: Appointment[]): string {
  const events = appointments
    .filter(a => a.status !== 'cancelled')
    .map(a => generateEventBlock(a, false))
    .join('\r\n');
  return wrapInCalendar(events);
}

/**
 * Generate ICS for a coach's full schedule within a date range
 */
export function generateCoachScheduleICS(
  appointments: Appointment[],
  coachId: string,
  dateFrom?: string,
  dateTo?: string,
): string {
  let filtered = appointments.filter(a => a.coachId === coachId && a.status !== 'cancelled');
  if (dateFrom) filtered = filtered.filter(a => a.date >= dateFrom);
  if (dateTo) filtered = filtered.filter(a => a.date <= dateTo);
  
  const events = filtered
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
    .map(a => generateEventBlock(a, false))
    .join('\r\n');
  return wrapInCalendar(events);
}

/**
 * Generate ICS for all appointments (admin export)
 */
export function generateFullScheduleICS(appointments: Appointment[]): string {
  const events = appointments
    .filter(a => a.status !== 'cancelled')
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
    .map(a => generateEventBlock(a, false))
    .join('\r\n');
  return wrapInCalendar(events);
}

/**
 * Download ICS file (web) or share (native)
 */
export function downloadICSFile(icsContent: string, filename: string): void {
  if (Platform.OS === 'web') {
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.ics') ? filename : `${filename}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } else {
    // For native platforms, we'd use expo-sharing or expo-file-system
    // For now, just log the content
    console.log('ICS content generated:', icsContent.substring(0, 200));
  }
}

/**
 * Generate a Google Calendar URL for quick add
 */
export function generateGoogleCalendarURL(appointment: Appointment): string {
  const typeName = getAppointmentTypeName(appointment.appointmentTypeId);
  const title = `${typeName} - ${appointment.clientName}`;
  const dtStart = formatICSDate(appointment.date, appointment.startTime);
  const dtEnd = formatICSDate(appointment.date, appointment.endTime);
  const description = `Coach: ${appointment.coachName}\nClient: ${appointment.clientName}\nProgram: ${appointment.clientProgram}`;

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${dtStart}/${dtEnd}`,
    details: description,
    sf: 'true',
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Generate an Outlook Calendar URL for quick add
 */
export function generateOutlookCalendarURL(appointment: Appointment): string {
  const typeName = getAppointmentTypeName(appointment.appointmentTypeId);
  const title = `${typeName} - ${appointment.clientName}`;
  const startDate = `${appointment.date}T${appointment.startTime}:00`;
  const endDate = `${appointment.date}T${appointment.endTime}:00`;

  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: title,
    startdt: startDate,
    enddt: endDate,
    body: `Coach: ${appointment.coachName}, Client: ${appointment.clientName}, Program: ${appointment.clientProgram}`,
  });

  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}
