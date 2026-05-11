import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../constants/theme';
import Header from '../components/Header';
import type { SummaryStat } from '../components/Header';
import AuthModal from '../components/AuthModal';
import AppointmentCard from '../components/schedule/AppointmentCard';
import DraggableWeekGrid from '../components/schedule/DraggableWeekGrid';
import BatchActionBar from '../components/schedule/BatchActionBar';

import BiometricEntryForm from '../components/client/BiometricEntryForm';
import { fetchBiometrics } from '../lib/clientDataService';
import type { BiometricEntry } from '../data/clientPortalData';

import NewAppointmentModal from '../components/schedule/NewAppointmentModal';
import AppointmentDetailModal from '../components/schedule/AppointmentDetailModal';
import CalendarSyncModal from '../components/schedule/CalendarSyncModal';

import StatusChangeToast from '../components/schedule/StatusChangeToast';
import type { StatusChangeInfo, BatchStatusChangeInfo } from '../components/schedule/StatusChangeToast';
import OfflineStatusBar from '../components/schedule/OfflineStatusBar';
import { scheduleOffline } from '../lib/scheduleOfflineService';



import {
  Appointment, appointmentTypes,
  getWeekDates, formatDateKey, DAY_NAMES, formatTimeDisplay, formatTimeShort,
  getAppointmentsForDate, HOUR_LABELS, SLOT_HEIGHT, GRID_START_HOUR,
  timeToMinutes, programDefinitions, getProgramColor, getProgramDefinition,
  getWeeklySessionBalance, getAllSessionBalances, WeeklySessionBalance,
  RecurrencePattern, generateRecurringDates, generateRecurrenceId, addMinutesToTime,
  findInSessionPair,
} from '../data/scheduleData';


import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { Trainer, Dietitian, Client } from '../data/mockData';
import { filterTrainers, filterDietitians, filterClients } from '../lib/dataFilters';
import {
  fetchAppointments as fetchAppointmentsFromDB,
  createAppointment as createAppointmentInDB,
  createAppointmentsBulk as createAppointmentsBulkInDB,
  updateAppointmentStatus as updateAppointmentStatusInDB,
  rescheduleAppointment as rescheduleAppointmentInDB,
  bulkRescheduleAppointments as bulkRescheduleInDB,
  bulkCancelAppointments as bulkCancelInDB,
  deleteAppointment as deleteAppointmentInDB,
  bulkDeleteAppointments as bulkDeleteInDB,
  createPartnerSession as createPartnerSessionInDB,
} from '../lib/appointmentService';


const SCREEN_WIDTH = Dimensions.get('window').width;
const IS_SMALL_SCREEN = SCREEN_WIDTH < 500;

// Mobile-friendly: calculate day column width to fit 5 days on screen without scrolling
const TIME_COL_WIDTH = IS_SMALL_SCREEN ? 36 : 48;
const DAY_COL_WIDTH = IS_SMALL_SCREEN
  ? Math.floor((SCREEN_WIDTH - TIME_COL_WIDTH - 16) / 5)
  : Math.max(80, (SCREEN_WIDTH - TIME_COL_WIDTH - 32) / 5);

// Compact slot height for mobile
const MOBILE_SLOT_HEIGHT = IS_SMALL_SCREEN ? 14 : SLOT_HEIGHT;

type ViewMode = 'week' | 'day';


// ── DB → Trainer/Dietitian/Client mapping helpers ───────────────────────────

function dbRowToTrainer(row: any): Trainer {
  return {
    id: row.id,
    name: row.name || row.full_name || row.email?.split('@')[0] || 'Unknown',
    avatar: row.avatar || row.photo_url || '',
    franchise: row.franchise || 'Unassigned',
    specialties: Array.isArray(row.specialties) ? row.specialties : [],
    certifications: Array.isArray(row.certifications)
      ? row.certifications.map((c: any) => ({ name: c.name || c, expirationDate: c.expirationDate || '2099-12-31' }))
      : [],
    activeClients: row.active_clients ?? 0,
    maxClients: row.max_clients ?? 20,
    rating: parseFloat(row.rating) || 0,
    totalReviews: row.total_reviews ?? 0,
    sessionsThisMonth: row.sessions_this_month ?? 0,
    revenueGenerated: parseFloat(row.revenue_generated) || 0,
    yearsExperience: row.years_experience ?? 0,
    bonusEarned: parseFloat(row.bonus_earned) || 0,
    status: row.status === 'inactive' ? 'inactive' : 'active',
    hireDate: row.hire_date || row.created_at?.split('T')[0] || '',
    email: row.email || '',
    address: row.address || '',
    phone: row.phone || '',
    birthday: row.birthday ? row.birthday.split('T')[0] : '',
    inFacebookGroup: row.in_facebook_group ?? false,
    reviewCredits: row.review_credits ?? 0,
    referralCredits: row.referral_credits ?? 0,
    returnCredits: row.return_credits ?? 0,
  };
}

function dbRowToDietitian(row: any): Dietitian {
  return {
    id: row.id,
    name: row.name || row.full_name || row.email?.split('@')[0] || 'Unknown',
    avatar: row.avatar || row.photo_url || '',
    franchise: row.franchise || 'Unassigned',
    specialties: Array.isArray(row.specialties) ? row.specialties : [],
    certifications: Array.isArray(row.certifications)
      ? row.certifications.map((c: any) => ({ name: c.name || c, expirationDate: c.expirationDate || '2099-12-31' }))
      : [],
    activeClients: row.active_clients ?? 0,
    maxClients: row.max_clients ?? 20,
    rating: parseFloat(row.rating) || 0,
    totalReviews: row.total_reviews ?? 0,
    yearsExperience: row.years_experience ?? 0,
    status: row.status === 'inactive' ? 'inactive' : 'active',
    hireDate: row.hire_date || row.created_at?.split('T')[0] || '',
    email: row.email || '',
    address: row.address || '',
    phone: row.phone || '',
    birthday: row.birthday ? row.birthday.split('T')[0] : '',
    inFacebookGroup: row.in_facebook_group ?? false,
    reviewCredits: row.review_credits ?? 0,
    referralCredits: row.referral_credits ?? 0,
    returnCredits: row.return_credits ?? 0,
  };
}

function dbProfileToClient(p: any): Client {
  let legacyStatus: Client['status'] = 'active';
  if (p.contact_status === 'former-client' || p.contact_status === 'failed-jumpstart') {
    legacyStatus = 'alumni';
  } else if (p.contact_status === 'active-client' || p.contact_status === 'active-jumpstart') {
    legacyStatus = 'active';
  }

  // Join date priority: earliest program history start_date > current program_start_date > created_at
  const joinDate = p._firstProgramStartDate
    || (p.program_start_date ? p.program_start_date.split('T')[0] : null)
    || (p.created_at ? p.created_at.split('T')[0] : '');

  return {
    id: p.id,
    name: p.full_name || p.email?.split('@')[0] || 'Unknown',
    email: p.email || '',
    phone: p.phone || '',
    avatar: p.photo_url || '',
    status: legacyStatus,
    contactStatus: p.contact_status || undefined,
    role: p.role || undefined,
    franchise: p.franchise || 'Unassigned',
    trainer: p.primary_trainer || 'None',
    dietitian: p.primary_dietitian || 'None',
    joinDate,
    lastSession: '',
    nextSession: '',
    program: p.program || 'Not yet assigned',
    weight: 0, targetWeight: 0, startWeight: 0, bodyFat: 0,
    sessionsCompleted: 0, totalSessions: 0, satisfaction: 0, monthlySpend: 0,
    goals: [], milestones: [], phase: 'Active', renewalDate: '',
    birthdate: p.birthdate ? p.birthdate.split('T')[0] : '',
    occupation: p.occupation || '',
    address: p.address || undefined,
    has_nutrition: p.has_nutrition || false,
  };
}


export default function ScheduleScreen() {
  const { profile, showAuthModal, setShowAuthModal } = useAuth();

  // ── Fetched data from DB ──
  const [dbTrainers, setDbTrainers] = useState<Trainer[]>([]);
  const [dbDietitians, setDbDietitians] = useState<Dietitian[]>([]);
  const [dbClients, setDbClients] = useState<Client[]>([]);

  // Fetch coaches and clients from the database
  const fetchScheduleData = useCallback(async () => {
    try {
      // 1. Fetch coaches from staff_contacts
      const { data: staffRows } = await supabase
        .from('staff_contacts')
        .select('*')
        .in('role', ['trainer', 'dietitian'])
        .order('name', { ascending: true });

      const trainers: Trainer[] = [];
      const dietitians: Dietitian[] = [];
      const staffUserIds = new Set<string>();

      if (staffRows && Array.isArray(staffRows)) {
        for (const row of staffRows) {
          if (row.user_id) staffUserIds.add(row.user_id);
          if (row.role === 'trainer') trainers.push(dbRowToTrainer(row));
          else if (row.role === 'dietitian') dietitians.push(dbRowToDietitian(row));
        }
      }

      // 2. Fallback: coaches from user_profiles not already in staff_contacts
      const { data: profileCoachRows } = await supabase
        .from('user_profiles')
        .select('id, email, full_name, role, franchise, phone, address, birthdate, in_facebook_group, photo_url, contact_status, created_at')
        .in('role', ['trainer', 'dietitian'])
        .order('full_name', { ascending: true });

      if (profileCoachRows && Array.isArray(profileCoachRows)) {
        for (const row of profileCoachRows) {
          if (staffUserIds.has(row.id)) continue;
          if (row.role === 'trainer') trainers.push(dbRowToTrainer(row));
          else if (row.role === 'dietitian') dietitians.push(dbRowToDietitian(row));
        }
      }

      setDbTrainers(trainers);
      setDbDietitians(dietitians);

      // 3. Fetch clients from user_profiles (includes program_start_date for join date)
      let clientQuery = supabase
        .from('user_profiles')
        .select('id, full_name, email, phone, role, franchise, program, primary_trainer, primary_dietitian, contact_status, photo_url, address, birthdate, occupation, has_nutrition, program_start_date, created_at')
        .order('full_name', { ascending: true });

      // Scope by franchise for franchise managers
      if (profile?.role === 'franchise_manager' && profile.franchise) {
        clientQuery = clientQuery.eq('franchise', profile.franchise);
      }

      // Exclude the current user
      if (profile?.id) {
        clientQuery = clientQuery.neq('id', profile.id);
      }

      const { data: clientRows } = await clientQuery;
      if (clientRows && Array.isArray(clientRows)) {
        // Fetch earliest program start dates from client_program_history
        const clientIds = clientRows.map((c: any) => c.id).filter(Boolean);
        let firstProgramDates: Record<string, string> = {};

        if (clientIds.length > 0) {
          try {
            const { data: historyRows } = await supabase
              .from('client_program_history')
              .select('user_id, start_date')
              .in('user_id', clientIds)
              .order('start_date', { ascending: true });

            if (historyRows && Array.isArray(historyRows)) {
              for (const row of historyRows) {
                if (row.user_id && row.start_date && !firstProgramDates[row.user_id]) {
                  firstProgramDates[row.user_id] = row.start_date.split('T')[0];
                }
              }
            }
          } catch (histErr) {
            console.log('Schedule: error fetching program history for join dates:', histErr);
          }
        }

        // Attach _firstProgramStartDate to each profile before converting
        const enriched = clientRows.map((p: any) => ({
          ...p,
          _firstProgramStartDate: firstProgramDates[p.id] || null,
        }));

        setDbClients(enriched.map(dbProfileToClient));
      }

    } catch (err) {
      console.log('Schedule: error fetching data:', err);
    }
  }, [profile?.role, profile?.franchise, profile?.id]);

  useEffect(() => {
    if (profile) fetchScheduleData();
  }, [profile, fetchScheduleData]);

  // Apply role-based filtering
  const roleTrainers = useMemo(() => filterTrainers(dbTrainers, profile), [dbTrainers, profile]);
  const roleDietitians = useMemo(() => filterDietitians(dbDietitians, profile), [dbDietitians, profile]);
  const roleClients = useMemo(() => filterClients(dbClients, profile), [dbClients, profile]);



  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loadingAppts, setLoadingAppts] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  // Default to day view on small screens for better mobile UX
  const [viewMode, setViewMode] = useState<ViewMode>(IS_SMALL_SCREEN ? 'day' : 'week');
  const [selectedCoachId, setSelectedCoachId] = useState<string>('all');

  const [showNewAppt, setShowNewAppt] = useState(false);
  const [preselectedDate, setPreselectedDate] = useState<string>('');

  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [showSessionPanel, setShowSessionPanel] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [showCalendarSync, setShowCalendarSync] = useState(false);

  // ── Biometric assessment modal state ──
  const [biometricAppt, setBiometricAppt] = useState<Appointment | null>(null);
  const [biometricLatestEntry, setBiometricLatestEntry] = useState<BiometricEntry | null>(null);
  const [biometricInitialHeight, setBiometricInitialHeight] = useState<number | undefined>(undefined);

  const handleBiometricPress = useCallback(async (appt: Appointment) => {
    setBiometricAppt(appt);
    // Fetch latest biometric data for this client
    try {
      const entries = await fetchBiometrics(appt.clientId);
      if (entries.length > 0) {
        setBiometricLatestEntry(entries[entries.length - 1]);
        // Initial height from first entry
        const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
        const firstHeight = sorted.find(e => e.height && e.height > 0)?.height;
        setBiometricInitialHeight(firstHeight || undefined);
      } else {
        setBiometricLatestEntry(null);
        setBiometricInitialHeight(undefined);
      }
    } catch (err) {
      console.log('Schedule: error fetching biometrics for client:', err);
      setBiometricLatestEntry(null);
      setBiometricInitialHeight(undefined);
    }
  }, []);

  const handleBiometricClose = useCallback(() => {
    setBiometricAppt(null);
    setBiometricLatestEntry(null);
    setBiometricInitialHeight(undefined);
  }, []);

  // ── Biometric success toast (shown after saving a biometric from the schedule) ──
  const [biometricSuccessMsg, setBiometricSuccessMsg] = useState<string | null>(null);
  const biometricToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showBiometricSuccess = useCallback((msg: string) => {
    if (biometricToastTimer.current) clearTimeout(biometricToastTimer.current);
    setBiometricSuccessMsg(msg);
    biometricToastTimer.current = setTimeout(() => {
      setBiometricSuccessMsg(null);
      biometricToastTimer.current = null;
    }, 3500);
  }, []);

  // ── Status change undo toast state ──
  const [statusChangeInfo, setStatusChangeInfo] = useState<StatusChangeInfo | null>(null);
  const [batchStatusChangeInfo, setBatchStatusChangeInfo] = useState<BatchStatusChangeInfo | null>(null);
  const appointmentsRef = useRef<Appointment[]>([]);
  appointmentsRef.current = appointments;

  // ── Multi-select mode state ──
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedApptIds, setSelectedApptIds] = useState<Set<string>>(new Set());


  // ── Load appointments from DB on mount (with offline cache support) ──
  const loadAppointments = useCallback(async () => {
    try {
      setLoadingAppts(true);

      // 1. Immediately show cached data for instant render
      if (scheduleOffline.hasCachedData()) {
        const cached = scheduleOffline.getCachedAppointments();
        setAppointments(cached);
      }

      // 2. Try to fetch fresh data from DB
      const params: any = {};
      if (profile?.role === 'franchise_manager' && profile.franchise) {
        params.franchise = profile.franchise;
      }
      if ((profile?.role === 'trainer' || profile?.role === 'dietitian') && profile?.id) {
        params.coachId = profile.id;
      }

      const { appointments: dbAppts, error } = await fetchAppointmentsFromDB(params);
      if (error) {
        console.log('Schedule: error loading appointments:', error);
        // If DB fetch fails, keep using cached data (already set above)
        if (!scheduleOffline.hasCachedData()) {
          console.log('Schedule: no cached data available either');
        }
      } else {
        // 3. Update state and cache with fresh data
        setAppointments(dbAppts);
        scheduleOffline.updateCache(dbAppts);
      }
    } catch (err) {
      console.log('Schedule: exception loading appointments:', err);
      // On exception, fall back to cache
      if (scheduleOffline.hasCachedData() && appointments.length === 0) {
        setAppointments(scheduleOffline.getCachedAppointments());
      }
    } finally {
      setLoadingAppts(false);
    }
  }, [profile?.role, profile?.franchise, profile?.id]);

  useEffect(() => {
    if (profile) loadAppointments();
  }, [profile, loadAppointments]);




  const weekDates = useMemo(() => getWeekDates(currentDate), [currentDate]);
  const selectedDateKey = formatDateKey(currentDate);
  const todayKey = formatDateKey(new Date());

  // Filter appointments by selected individual coach and role-based access
  const filteredAppointments = useMemo(() => {
    let result = [...appointments];
    if (selectedCoachId !== 'all') result = result.filter(a => a.coachId === selectedCoachId);
    if (profile) {
      if (profile.role === 'franchise_manager' && profile.franchise) {
        result = result.filter(a => a.franchise === profile.franchise);
      } else if (profile.role === 'trainer' || profile.role === 'dietitian') {
        // Match by coachId (most reliable) OR by name (trainer_name or full_name)
        const coachNames = [profile.trainer_name, profile.full_name].filter(Boolean) as string[];
        if (profile.id || coachNames.length > 0) {
          result = result.filter(a =>
            a.coachId === profile.id ||
            coachNames.some(name => a.coachName === name)
          );
        }
      }
    }

    return result;
  }, [appointments, selectedCoachId, profile]);



  // Session balances for the week
  const sessionBalances = useMemo(() => {
    return getAllSessionBalances(appointments, weekDates, roleClients);
  }, [appointments, weekDates, roleClients]);

  const getApptSessionBalance = useCallback((appt: Appointment | null) => {
    if (!appt) return null;
    const balance = sessionBalances.find(b => b.clientId === appt.clientId);
    if (!balance) return null;
    return { used: balance.sessionsUsed, allowed: balance.sessionsAllowed };
  }, [sessionBalances]);

  // Navigation
  const navigateWeek = (dir: number) => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + dir * 7);
    setCurrentDate(d);
  };
  const navigateDay = (dir: number) => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + dir);
    setCurrentDate(d);
  };
  const goToToday = () => setCurrentDate(new Date());
  const selectDay = (date: Date) => {
    setCurrentDate(date);
    if (viewMode === 'week') setViewMode('day');
  };

  // ── CRUD (DB-backed with optimistic local state + offline queue) ────────────

  const handleCreateAppointment = useCallback(async (appt: Omit<Appointment, 'id'>, recurrencePattern?: RecurrencePattern) => {
    const isOnline = scheduleOffline.getOnlineStatus();
    const isPartnerTraining = appt.appointmentTypeId === 'partner-training' && !!appt.partnerGroupId;

    if (recurrencePattern && recurrencePattern.type !== 'none') {
      // ── Recurring series ──
      const recurrenceId = generateRecurrenceId();
      const instances = generateRecurringDates(recurrencePattern, appt.date, appt.startTime, appt.duration);

      // For partner-training recurring series, each instance inherits partnerGroupId,
      // secondClientId, secondClientName, and partnerClientNames from the base appointment
      const newAppts: Appointment[] = instances.map((inst, idx) => ({
        ...appt,
        id: `appt-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 5)}`,
        date: inst.date,
        startTime: inst.startTime,
        endTime: inst.endTime,
        recurrenceId,
        recurrencePattern,
        // Partner fields are spread from appt automatically:
        // partnerGroupId, secondClientId, secondClientName, partnerClientNames
      }));

      // Optimistic update
      setAppointments(prev => [...prev, ...newAppts]);
      setShowNewAppt(false);

      if (!isOnline) {
        scheduleOffline.queueCreateBulk(newAppts);
        Alert.alert(
          'Saved Offline',
          `${newAppts.length} appointments queued. They will sync when you're back online.`
        );
        return;
      }

      // Persist to DB — the edge function's create action stores partner_group_id,
      // second_client_id, and second_client_name on each row
      const { appointments: saved, error } = await createAppointmentsBulkInDB(newAppts);
      if (error) {
        console.log('Schedule: error saving recurring series:', error);
        scheduleOffline.queueCreateBulk(newAppts);
        Alert.alert('Queued', 'Failed to save now. The series has been queued for sync.');
        return;
      }
      if (saved.length > 0) {
        const ids = new Set(newAppts.map(a => a.id));
        setAppointments(prev => [...prev.filter(a => !ids.has(a.id)), ...saved]);
        scheduleOffline.updateCache([...appointments.filter(a => !ids.has(a.id)), ...saved]);
      }

      const partnerLabel = isPartnerTraining
        ? ` (Partner Session with ${appt.partnerClientNames?.join(', ') || 'partners'})`
        : '';
      Alert.alert(
        'Recurring Series Created',
        `${newAppts.length} appointments scheduled for ${appt.clientName} with ${appt.coachName}${partnerLabel}`
      );
    } else {
      // ── Single appointment ──
      const newAppt: Appointment = {
        ...appt,
        id: `appt-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      };

      // Optimistic update
      setAppointments(prev => [...prev, newAppt]);
      setShowNewAppt(false);

      if (!isOnline) {
        scheduleOffline.queueCreate(newAppt);
        Alert.alert('Saved Offline', 'Appointment queued. It will sync when you\'re back online.');
        return;
      }

      // For partner-training, use the dedicated createPartnerSession endpoint
      // which auto-populates secondClientId/secondClientName from the partner group
      if (isPartnerTraining) {
        const { appointments: savedArr, error } = await createPartnerSessionInDB(newAppt, appt.partnerGroupId!);
        if (error) {
          console.log('Schedule: error saving partner session:', error);
          scheduleOffline.queueCreate(newAppt);
          Alert.alert('Queued', 'Failed to save now. The appointment has been queued for sync.');
          return;
        }
        if (savedArr.length > 0) {
          setAppointments(prev => prev.map(a => a.id === newAppt.id ? savedArr[0] : a));
        }
        Alert.alert(
          'Partner Session Created',
          `${appt.clientName} and ${appt.partnerClientNames?.join(', ') || 'partner(s)'} scheduled with ${appt.coachName}`
        );
      } else {
        // Standard single appointment
        const { appointment: saved, error } = await createAppointmentInDB(newAppt);
        if (error) {
          console.log('Schedule: error saving appointment:', error);
          scheduleOffline.queueCreate(newAppt);
          Alert.alert('Queued', 'Failed to save now. The appointment has been queued for sync.');
          return;
        }
        if (saved) {
          setAppointments(prev => prev.map(a => a.id === newAppt.id ? saved : a));
        }
        Alert.alert('Appointment Created', `${appt.clientName} scheduled with ${appt.coachName}`);
      }
    }
  }, [appointments]);


  // ── Session sync state for toast ──
  const [sessionSynced, setSessionSynced] = useState(false);
  const [sessionSyncCount, setSessionSyncCount] = useState(0);

  const handleUpdateStatus = useCallback(async (id: string, status: Appointment['status']) => {
    const isOnline = scheduleOffline.getOnlineStatus();

    // Capture old status and client name for undo toast (use ref for current data)
    const targetAppt = appointmentsRef.current.find(a => a.id === id);
    const oldStatus = targetAppt?.status || 'scheduled';
    const clientName = targetAppt?.clientName || 'Client';

    // Reset sync state
    setSessionSynced(false);
    setSessionSyncCount(0);

    // Show undo toast with status change info
    setStatusChangeInfo({
      appointmentId: id,
      clientName,
      oldStatus,
      newStatus: status,
    });

    // Optimistic update
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status } : a));

    if (!isOnline) {
      scheduleOffline.queueUpdateStatus(id, status);
      return;
    }

    // Persist to DB (edge function now auto-syncs session_records)
    const { sessionSync, error } = await updateAppointmentStatusInDB(id, status);
    if (error) {
      console.log('Schedule: error updating status:', error);
      scheduleOffline.queueUpdateStatus(id, status);
    }

    // Update sync indicator on the toast
    if (sessionSync && sessionSync.synced) {
      setSessionSynced(true);
      setSessionSyncCount(sessionSync.count);
    }
  }, [loadAppointments]);

  /**
   * Called from BiometricEntryForm.onSaved when a biometric is successfully saved
   * via the schedule's quick-entry flow. Automatically marks the biometric
   * appointment as 'completed' and — if the biometric overlaps a training session
   * (in-session pair) — marks that training session as 'completed' too.
   * Shows a confirmation toast with the client's name.
   *
   * NOTE: This is intentionally wrapped in try/catch and individual `.catch()`
   * guards on the async `handleUpdateStatus` calls because they hit the network
   * (edge function) and can reject with transient NetworkErrors (offline, DNS
   * hiccup, etc.). Those failures are already handled internally by falling back
   * to the offline queue, but we must NOT let them propagate as unhandled
   * promise rejections to the global error handler.
   */
  const handleBiometricSaved = useCallback(async () => {
    try {
      const savedAppt = biometricAppt;
      // Close the modal first for snappy UX
      handleBiometricClose();
      if (!savedAppt) return;

      // Find an overlapping in-session pair (e.g. the training session this
      // biometric was performed during) using the freshest appointment list.
      const pair = findInSessionPair(savedAppt, appointmentsRef.current);

      // Mark the biometric appointment as completed (triggers status toast + DB sync).
      // Swallow any transient network rejection — the status update is already
      // applied optimistically and the offline queue will retry on reconnect.
      if (savedAppt.status !== 'completed') {
        Promise.resolve(handleUpdateStatus(savedAppt.id, 'completed')).catch((err) => {
          console.log('Schedule: handleUpdateStatus (biometric) rejected:', err);
        });
      }

      // Also mark the paired training session as completed if present and not already.
      if (pair && pair.status !== 'completed') {
        Promise.resolve(handleUpdateStatus(pair.id, 'completed')).catch((err) => {
          console.log('Schedule: handleUpdateStatus (paired session) rejected:', err);
        });
      }

      // Show a success toast confirming the save + auto-completion.
      const pairLabel = pair ? ' and training session' : '';
      showBiometricSuccess(
        `✓ Biometric saved and appointment${pairLabel} completed for ${savedAppt.clientName}`
      );
    } catch (err) {
      // Defensive: never let this handler reject — the biometric form is already
      // closed and the user has been given a success toast.
      console.log('Schedule: handleBiometricSaved caught exception:', err);
    }
  }, [biometricAppt, handleBiometricClose, handleUpdateStatus, showBiometricSuccess]);





  // ── Undo status change handler (called from toast) ──
  const handleUndoStatusChange = useCallback(async (appointmentId: string, oldStatus: string) => {
    const isOnline = scheduleOffline.getOnlineStatus();
    const revertStatus = oldStatus as Appointment['status'];

    // Clear the toast info
    setStatusChangeInfo(null);

    // Optimistic revert
    setAppointments(prev => prev.map(a => a.id === appointmentId ? { ...a, status: revertStatus } : a));

    if (!isOnline) {
      scheduleOffline.queueUpdateStatus(appointmentId, revertStatus);
      return;
    }

    // Persist revert to DB
    const { error } = await updateAppointmentStatusInDB(appointmentId, revertStatus);
    if (error) {
      console.log('Schedule: error reverting status:', error);
      scheduleOffline.queueUpdateStatus(appointmentId, revertStatus);
    }
  }, [loadAppointments]);


  // ── Multi-select handlers ──

  // Get visible (non-cancelled) appointments for the current view
  const visibleDayAppts = useMemo(() => {
    return filteredAppointments.filter(a => a.date === selectedDateKey && a.status !== 'cancelled');
  }, [filteredAppointments, selectedDateKey]);

  const toggleApptSelection = useCallback((appt: Appointment) => {
    setSelectedApptIds(prev => {
      const next = new Set(prev);
      if (next.has(appt.id)) {
        next.delete(appt.id);
      } else {
        next.add(appt.id);
      }
      return next;
    });
  }, []);

  const handleApptPress = useCallback((appt: Appointment) => {
    if (multiSelectMode) {
      toggleApptSelection(appt);
      return;
    }
    // Tapping a biometric-assessment appointment opens the quick-entry form
    // (pre-filled with the client) so the trainer can log measurements directly
    // from the schedule without leaving the view.
    const apptType = appointmentTypes.find(t => t.id === appt.appointmentTypeId);
    if (apptType?.category === 'assessment') {
      handleBiometricPress(appt);
      return;
    }
    setSelectedAppt(appt);
  }, [multiSelectMode, toggleApptSelection, handleBiometricPress]);


  const handleApptLongPress = useCallback((appt: Appointment) => {
    if (!multiSelectMode) {
      // Enter multi-select mode and select this appointment
      setMultiSelectMode(true);
      setSelectedApptIds(new Set([appt.id]));
    }
  }, [multiSelectMode]);

  const exitMultiSelect = useCallback(() => {
    setMultiSelectMode(false);
    setSelectedApptIds(new Set());
  }, []);

  const handleSelectAll = useCallback(() => {
    const allIds = new Set(visibleDayAppts.map(a => a.id));
    setSelectedApptIds(allIds);
  }, [visibleDayAppts]);

  const handleDeselectAll = useCallback(() => {
    setSelectedApptIds(new Set());
  }, []);

  const handleBatchStatusUpdate = useCallback(async (newStatus: 'confirmed' | 'completed' | 'no-show' | 'cancelled') => {
    const isOnline = scheduleOffline.getOnlineStatus();
    const idsToUpdate = Array.from(selectedApptIds);
    if (idsToUpdate.length === 0) return;

    // For cancel, show confirmation
    if (newStatus === 'cancelled') {
      Alert.alert(
        'Cancel Appointments',
        `Are you sure you want to cancel ${idsToUpdate.length} appointment${idsToUpdate.length > 1 ? 's' : ''}?`,
        [
          { text: 'Keep', style: 'cancel' },
          {
            text: 'Cancel All',
            style: 'destructive',
            onPress: () => executeBatchUpdate(idsToUpdate, newStatus, isOnline),
          },
        ]
      );
      return;
    }

    executeBatchUpdate(idsToUpdate, newStatus, isOnline);
  }, [selectedApptIds]);

  const executeBatchUpdate = useCallback(async (ids: string[], newStatus: Appointment['status'], isOnline: boolean) => {
    // Capture old statuses for undo
    const changes = ids.map(id => {
      const appt = appointmentsRef.current.find(a => a.id === id);
      return {
        appointmentId: id,
        clientName: appt?.clientName || 'Client',
        oldStatus: appt?.status || 'scheduled',
      };
    });

    // Clear single toast, show batch toast
    setStatusChangeInfo(null);
    setBatchStatusChangeInfo({ changes, newStatus });

    // Optimistic update all
    setAppointments(prev => prev.map(a =>
      ids.includes(a.id) ? { ...a, status: newStatus } : a
    ));

    // Exit multi-select mode
    exitMultiSelect();

    // Persist each to DB
    for (const id of ids) {
      if (!isOnline) {
        scheduleOffline.queueUpdateStatus(id, newStatus);
      } else {
        const { error } = await updateAppointmentStatusInDB(id, newStatus);
        if (error) {
          console.log('Schedule: error batch updating status for', id, error);
          scheduleOffline.queueUpdateStatus(id, newStatus);
        }
      }
    }
  }, [exitMultiSelect]);

  const handleBatchUndo = useCallback(async (changes: { appointmentId: string; oldStatus: string }[]) => {
    const isOnline = scheduleOffline.getOnlineStatus();

    // Clear batch toast
    setBatchStatusChangeInfo(null);

    // Optimistic revert all
    setAppointments(prev => prev.map(a => {
      const change = changes.find(c => c.appointmentId === a.id);
      if (change) {
        return { ...a, status: change.oldStatus as Appointment['status'] };
      }
      return a;
    }));

    // Persist each revert to DB
    for (const change of changes) {
      const revertStatus = change.oldStatus as Appointment['status'];
      if (!isOnline) {
        scheduleOffline.queueUpdateStatus(change.appointmentId, revertStatus);
      } else {
        const { error } = await updateAppointmentStatusInDB(change.appointmentId, revertStatus);
        if (error) {
          console.log('Schedule: error reverting batch status for', change.appointmentId, error);
          scheduleOffline.queueUpdateStatus(change.appointmentId, revertStatus);
        }
      }
    }
  }, []);


  const handleDeleteAppointment = useCallback(async (id: string) => {
    const isOnline = scheduleOffline.getOnlineStatus();
    const backup = appointments.find(a => a.id === id);

    // Optimistic update
    setAppointments(prev => prev.filter(a => a.id !== id));

    if (!isOnline) {
      scheduleOffline.queueDelete(id);
      return;
    }

    // Persist to DB
    const { error } = await deleteAppointmentInDB(id);
    if (error) {
      console.log('Schedule: error deleting appointment:', error);
      scheduleOffline.queueDelete(id);
    }
  }, [appointments]);

  const handleRescheduleAppointment = useCallback(async (id: string, newDate: string, newStartTime: string, newEndTime: string) => {
    const isOnline = scheduleOffline.getOnlineStatus();
    const isRecException = !!appointments.find(a => a.id === id)?.recurrenceId;

    // Optimistic update
    setAppointments(prev => prev.map(a =>
      a.id === id
        ? { ...a, date: newDate, startTime: newStartTime, endTime: newEndTime, isRecurrenceException: isRecException }
        : a
    ));
    setSelectedAppt(prev => {
      if (prev && prev.id === id) {
        return { ...prev, date: newDate, startTime: newStartTime, endTime: newEndTime, isRecurrenceException: isRecException };
      }
      return prev;
    });

    if (!isOnline) {
      scheduleOffline.queueReschedule(id, newDate, newStartTime, newEndTime, isRecException);
      return;
    }

    // Persist to DB
    const { error } = await rescheduleAppointmentInDB(id, newDate, newStartTime, newEndTime, isRecException);
    if (error) {
      console.log('Schedule: error rescheduling:', error);
      scheduleOffline.queueReschedule(id, newDate, newStartTime, newEndTime, isRecException);
    }
  }, [appointments, loadAppointments]);

  const handleBulkReschedule = useCallback(async (recurrenceId: string, fromDate: string, dayTimeShifts: { oldDay: number; newDay: number; newTime: string }[]) => {
    const isOnline = scheduleOffline.getOnlineStatus();

    // Optimistic update (local computation)
    setAppointments(prev => prev.map(a => {
      if (a.recurrenceId !== recurrenceId || a.date < fromDate || a.status === 'cancelled') return a;

      const d = new Date(a.date + 'T12:00:00');
      const dayOfWeek = d.getDay();
      const mondayBased = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

      const shift = dayTimeShifts.find(s => s.oldDay === mondayBased);
      if (!shift) return a;

      const dayDiff = shift.newDay - shift.oldDay;
      const newDate = new Date(d);
      newDate.setDate(newDate.getDate() + dayDiff);
      const newDateKey = formatDateKey(newDate);
      const newEndTime = addMinutesToTime(shift.newTime, a.duration);

      return {
        ...a,
        date: newDateKey,
        startTime: shift.newTime,
        endTime: newEndTime,
      };
    }));

    setSelectedAppt(prev => {
      if (prev && prev.recurrenceId === recurrenceId && prev.date >= fromDate) {
        const d = new Date(prev.date + 'T12:00:00');
        const dayOfWeek = d.getDay();
        const mondayBased = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const shift = dayTimeShifts.find(s => s.oldDay === mondayBased);
        if (shift) {
          const dayDiff = shift.newDay - shift.oldDay;
          const newDate = new Date(d);
          newDate.setDate(newDate.getDate() + dayDiff);
          return {
            ...prev,
            date: formatDateKey(newDate),
            startTime: shift.newTime,
            endTime: addMinutesToTime(shift.newTime, prev.duration),
          };
        }
      }
      return prev;
    });

    if (!isOnline) {
      scheduleOffline.queueBulkReschedule(recurrenceId, fromDate, dayTimeShifts);
      return;
    }

    // Persist to DB
    const { error } = await bulkRescheduleInDB(recurrenceId, fromDate, dayTimeShifts);
    if (error) {
      console.log('Schedule: error bulk rescheduling:', error);
      scheduleOffline.queueBulkReschedule(recurrenceId, fromDate, dayTimeShifts);
    }
  }, [loadAppointments]);

  const handleBulkCancel = useCallback(async (recurrenceId: string, fromDate: string) => {
    const isOnline = scheduleOffline.getOnlineStatus();

    // Optimistic update
    setAppointments(prev => prev.map(a => {
      if (a.recurrenceId === recurrenceId && a.date >= fromDate && a.status !== 'cancelled') {
        return { ...a, status: 'cancelled' as const };
      }
      return a;
    }));

    if (!isOnline) {
      scheduleOffline.queueBulkCancel(recurrenceId, fromDate);
      return;
    }

    // Persist to DB
    const { error } = await bulkCancelInDB(recurrenceId, fromDate);
    if (error) {
      console.log('Schedule: error bulk cancelling:', error);
      scheduleOffline.queueBulkCancel(recurrenceId, fromDate);
    }
  }, [loadAppointments]);

  const handleBulkDelete = useCallback(async (recurrenceId: string, fromDate: string) => {
    const isOnline = scheduleOffline.getOnlineStatus();
    const toDelete = appointments.filter(a => a.recurrenceId === recurrenceId && a.date >= fromDate);

    // Optimistic update
    setAppointments(prev => prev.filter(a => !(a.recurrenceId === recurrenceId && a.date >= fromDate)));

    if (!isOnline) {
      scheduleOffline.queueBulkDelete(recurrenceId, fromDate);
      return;
    }

    // Persist to DB
    const { error } = await bulkDeleteInDB(recurrenceId, fromDate);
    if (error) {
      console.log('Schedule: error bulk deleting:', error);
      scheduleOffline.queueBulkDelete(recurrenceId, fromDate);
    }
  }, [appointments]);




  const handleOpenNewAppt = (dateKey?: string) => {
    setPreselectedDate(dateKey || selectedDateKey);
    setShowNewAppt(true);
  };

  // ── Drag permission check for DraggableWeekGrid ──
  const canDragAppointment = useCallback((appt: Appointment) => {
    if (!profile) return false;
    // Admins and franchise managers can drag any appointment
    if (profile.role === 'admin' || profile.role === 'franchise_manager') return true;
    // Trainers/dietitians can only drag their own appointments
    if (profile.role === 'trainer' || profile.role === 'dietitian') {
      const coachNames = [profile.trainer_name, profile.full_name].filter(Boolean) as string[];
      return appt.coachId === profile.id || coachNames.some(name => appt.coachName === name);
    }
    return false;
  }, [profile]);


  // Coach list
  const coachList = useMemo(() => {
    const items: { id: string; name: string; type: 'trainer' | 'dietitian' }[] = [];
    roleTrainers.filter(t => t.status === 'active').forEach(t => items.push({ id: t.id, name: t.name, type: 'trainer' }));
    roleDietitians.filter(d => d.status === 'active').forEach(d => items.push({ id: d.id, name: d.name, type: 'dietitian' }));
    return items;
  }, [roleTrainers, roleDietitians]);

  // ── Address lookup maps for driving directions on training sessions ──
  const clientAddressMap = useMemo(() => {
    const map: Record<string, string> = {};
    dbClients.forEach(c => { if (c.address) map[c.id] = c.address; });
    return map;
  }, [dbClients]);

  const coachAddressMap = useMemo(() => {
    const map: Record<string, string> = {};
    // Current user's address (trainer/dietitian viewing own schedule)
    if (profile?.id && profile?.address) map[profile.id] = profile.address;
    // All trainer addresses
    dbTrainers.forEach(t => { if (t.address) map[t.id] = t.address; });
    // All dietitian addresses
    dbDietitians.forEach(d => { if (d.address) map[d.id] = d.address; });
    return map;
  }, [profile?.id, profile?.address, dbTrainers, dbDietitians]);

  /**
   * Compute the directions origin for a given appointment within a sorted day list.
   * - First appointment of the day → coach's home address
   * - Subsequent appointments → previous client's address
   */
  const getDirectionsOriginForAppt = useCallback((appt: Appointment, sortedDayAppts: Appointment[]): string | undefined => {
    const idx = sortedDayAppts.findIndex(a => a.id === appt.id);
    if (idx <= 0) {
      // First appointment: navigate from coach's home address
      return coachAddressMap[appt.coachId] || undefined;
    }
    // Not first: navigate from previous client's address
    const prevAppt = sortedDayAppts[idx - 1];
    return clientAddressMap[prevAppt.clientId] || undefined;
  }, [coachAddressMap, clientAddressMap]);


  // Stats
  const weekApptCount = useMemo(() => weekDates.reduce((sum, d) => sum + filteredAppointments.filter(a => a.date === formatDateKey(d) && a.status !== 'cancelled').length, 0), [weekDates, filteredAppointments]);
  const todayApptCount = filteredAppointments.filter(a => a.date === selectedDateKey && a.status !== 'cancelled').length;
  const weekTrainingSessions = useMemo(() => weekDates.reduce((sum, d) => sum + filteredAppointments.filter(a => a.date === formatDateKey(d) && a.status !== 'cancelled' && (a.appointmentTypeId === 'individual-training' || a.appointmentTypeId === 'couples-training')).length, 0), [weekDates, filteredAppointments]);

  // Pending biometric assessments on the currently-selected day — used for the
  // non-blocking banner at the top of the day view. Excludes already-completed,
  // cancelled, and no-show entries so trainers only see what still needs logging.
  const pendingBiometricsToday = useMemo(() => {
    return filteredAppointments
      .filter(a =>
        a.date === selectedDateKey &&
        a.appointmentTypeId === 'biometric-assessment' &&
        a.status !== 'completed' &&
        a.status !== 'cancelled' &&
        a.status !== 'no-show'
      )
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [filteredAppointments, selectedDateKey]);

  // Overlapping biometric for the currently-selected appointment (used by the
  // AppointmentDetailModal's inline reminder chip).
  const selectedApptBiometric = useMemo(() => {
    if (!selectedAppt) return null;
    const pair = findInSessionPair(selectedAppt, appointments);
    // Only show the chip when we actually found a biometric overlap (not the
    // reverse — biometric → training pair; that direction uses the chip on the
    // biometric card's own flow).
    if (pair && pair.appointmentTypeId === 'biometric-assessment') return pair;
    return null;
  }, [selectedAppt, appointments]);


  const recurringSeriesCount = useMemo(() => {
    const ids = new Set<string>();
    appointments.forEach(a => { if (a.recurrenceId) ids.add(a.recurrenceId); });
    return ids.size;
  }, [appointments]);

  const lowSessionClients = useMemo(() => {
    return sessionBalances
      .filter(b => b.sessionsRemaining <= 1 && b.sessionsAllowed > 0)
      .sort((a, b) => a.sessionsRemaining - b.sessionsRemaining);
  }, [sessionBalances]);

  const weekRangeLabel = useMemo(() => {
    const s = weekDates[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const e = weekDates[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${s} - ${e}`;
  }, [weekDates]);

  const getGridAppointments = (dateKey: string) => {
    return filteredAppointments
      .filter(a => a.date === dateKey && a.status !== 'cancelled')
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  };

  const getApptPosition = (appt: Appointment) => {
    const startMin = timeToMinutes(appt.startTime);
    const gridStartMin = GRID_START_HOUR * 60;
    const topSlots = (startMin - gridStartMin) / 15;
    const heightSlots = Math.max(1, appt.duration / 15);
    return {
      top: topSlots * MOBILE_SLOT_HEIGHT,
      height: heightSlots * MOBILE_SLOT_HEIGHT,
    };
  };

  const totalGridHeight = (20 - 6) * 4 * MOBILE_SLOT_HEIGHT;

  // Summary stats for header bar
  const headerStats: SummaryStat[] = useMemo(() => [
    { label: 'Week', value: `${weekApptCount}`, color: COLORS.accentLight },
    { label: 'Training', value: `${weekTrainingSessions}`, color: '#58d68d' },
    { label: 'Today', value: `${todayApptCount}`, color: '#f5b041' },
    { label: 'Low Sess.', value: `${lowSessionClients.length}`, color: lowSessionClients.length > 0 ? '#e74c3c' : '#58d68d' },
  ], [weekApptCount, weekTrainingSessions, todayApptCount, lowSessionClients.length]);

  // ── Helper: Render the compact week strip (used in both week and day views on mobile) ──
  const renderWeekStrip = () => (
    <View style={styles.weekStrip}>
      <TouchableOpacity onPress={() => navigateWeek(-1)} style={styles.weekStripNav}>
        <Ionicons name="chevron-back" size={16} color={COLORS.primary} />
      </TouchableOpacity>
      <View style={styles.weekStripDays}>
        {weekDates.map((date, idx) => {
          const dk = formatDateKey(date);
          const isToday = dk === todayKey;
          const isSelected = dk === selectedDateKey;
          const dayApptCount = getGridAppointments(dk).length;
          return (
            <TouchableOpacity
              key={dk}
              style={[
                styles.weekStripDay,
                isToday && styles.weekStripDayToday,
                isSelected && styles.weekStripDaySelected,
              ]}
              onPress={() => {
                setCurrentDate(date);
                if (viewMode === 'week' && IS_SMALL_SCREEN) setViewMode('day');
              }}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.weekStripDayName,
                isToday && styles.weekStripDayNameToday,
                isSelected && styles.weekStripDayNameSelected,
              ]}>{DAY_NAMES[idx].charAt(0)}</Text>
              <Text style={[
                styles.weekStripDayNum,
                isToday && styles.weekStripDayNumToday,
                isSelected && styles.weekStripDayNumSelected,
              ]}>{date.getDate()}</Text>
              {dayApptCount > 0 && (
                <View style={[
                  styles.weekStripDot,
                  isSelected && { backgroundColor: COLORS.white },
                  isToday && !isSelected && { backgroundColor: COLORS.accent },
                ]} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
      <TouchableOpacity onPress={() => navigateWeek(1)} style={styles.weekStripNav}>
        <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <Header
        title="Schedule"
        subtitle={weekRangeLabel}
        summaryStats={headerStats}
      />

      {/* Offline Status Bar - shows when offline or has pending changes */}
      <OfflineStatusBar onSyncComplete={loadAppointments} />

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>


        {/* Session Alert Panel */}
        {showSessionPanel && lowSessionClients.length > 0 && (
          <View style={styles.sessionPanel}>
            <View style={styles.sessionPanelHeader}>
              <Ionicons name="ticket-outline" size={14} color={COLORS.danger} />
              <Text style={styles.sessionPanelTitle}>Clients Near Session Limit</Text>
              <TouchableOpacity onPress={() => setShowSessionPanel(false)}>
                <Ionicons name="close" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
            {lowSessionClients.slice(0, 6).map(b => {
              const progColor = getProgramColor(b.program);
              return (
                <View key={b.clientId} style={styles.sessionRow}>
                  <View style={styles.sessionRowLeft}>
                    <Text style={styles.sessionClientName} numberOfLines={1}>{b.clientName}</Text>
                    <Text style={[styles.sessionProgram, { color: progColor }]}>{b.program}</Text>
                  </View>
                  <View style={styles.sessionRowRight}>
                    <View style={styles.sessionBarBg}>
                      <View style={[styles.sessionBarFill, {
                        backgroundColor: b.sessionsRemaining === 0 ? COLORS.danger : '#f39c12',
                        width: `${(b.sessionsUsed / b.sessionsAllowed) * 100}%`,
                      }]} />
                    </View>
                    <Text style={[styles.sessionCount, { color: b.sessionsRemaining === 0 ? COLORS.danger : '#f39c12' }]}>
                      {b.sessionsUsed}/{b.sessionsAllowed}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Controls - compact for mobile */}
        <View style={styles.controlsRow}>
          <View style={styles.viewToggle}>
            <TouchableOpacity style={[styles.viewBtn, viewMode === 'week' && styles.viewBtnActive]} onPress={() => setViewMode('week')}>
              <Ionicons name="calendar" size={IS_SMALL_SCREEN ? 12 : 14} color={viewMode === 'week' ? COLORS.white : COLORS.textSecondary} />
              <Text style={[styles.viewBtnText, viewMode === 'week' && styles.viewBtnTextActive]}>Week</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.viewBtn, viewMode === 'day' && styles.viewBtnActive]} onPress={() => setViewMode('day')}>
              <Ionicons name="today" size={IS_SMALL_SCREEN ? 12 : 14} color={viewMode === 'day' ? COLORS.white : COLORS.textSecondary} />
              <Text style={[styles.viewBtnText, viewMode === 'day' && styles.viewBtnTextActive]}>Day</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.todayBtn} onPress={goToToday}>
            <Text style={styles.todayBtnText}>Today</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.addBtn} onPress={() => handleOpenNewAppt()}>
            <Ionicons name="add" size={16} color={COLORS.white} />
            {!IS_SMALL_SCREEN && <Text style={styles.addBtnText}>New</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.syncBtn} onPress={() => setShowCalendarSync(true)}>
            <Ionicons name="sync" size={IS_SMALL_SCREEN ? 14 : 16} color={COLORS.accent} />
            {!IS_SMALL_SCREEN && <Text style={styles.syncBtnText}>Sync</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.syncBtn, multiSelectMode && { backgroundColor: COLORS.accent, borderColor: COLORS.accent }]}
            onPress={() => multiSelectMode ? exitMultiSelect() : setMultiSelectMode(true)}
          >
            <Ionicons name={multiSelectMode ? 'close-circle' : 'checkbox-outline'} size={IS_SMALL_SCREEN ? 14 : 16} color={multiSelectMode ? COLORS.white : COLORS.accent} />
            {!IS_SMALL_SCREEN && <Text style={[styles.syncBtnText, multiSelectMode && { color: COLORS.white }]}>{multiSelectMode ? 'Exit' : 'Select'}</Text>}
          </TouchableOpacity>

        </View>




        {/* Coach Filters - only visible for franchise managers and admins */}
        {(profile?.role === 'franchise_manager' || profile?.role === 'admin') && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterScrollContent}>
            <TouchableOpacity
              style={[styles.filterChip, selectedCoachId === 'all' && styles.filterChipActive]}
              onPress={() => setSelectedCoachId('all')}
            >
              <Ionicons name="people" size={11} color={selectedCoachId === 'all' ? COLORS.white : COLORS.textSecondary} />
              <Text style={[styles.filterChipText, selectedCoachId === 'all' && styles.filterChipTextActive]}>All Coaches</Text>
            </TouchableOpacity>
            {coachList.map(coach => (
              <TouchableOpacity key={coach.id} style={[styles.filterChip, selectedCoachId === coach.id && styles.filterChipActive]} onPress={() => setSelectedCoachId(selectedCoachId === coach.id ? 'all' : coach.id)}>
                <Ionicons name={coach.type === 'trainer' ? 'fitness' : 'nutrition'} size={10} color={selectedCoachId === coach.id ? COLORS.white : COLORS.textMuted} />
                <Text style={[styles.filterChipText, selectedCoachId === coach.id && styles.filterChipTextActive]} numberOfLines={1}>{coach.name.split(' ')[0]}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}



        {/* ── WEEK VIEW ──────────────────────────── */}
        {viewMode === 'week' && (
          <View style={styles.weekContainer}>
            {/* Mobile: compact week strip + day list */}
            {IS_SMALL_SCREEN ? (
              <>
                {renderWeekStrip()}
                
                {/* Show selected day's appointments as a list */}
                <View style={styles.mobileWeekDayHeader}>
                  <Text style={styles.mobileWeekDayTitle}>
                    {currentDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </Text>
                  <Text style={styles.mobileWeekDayCount}>
                    {getGridAppointments(selectedDateKey).length} appointment{getGridAppointments(selectedDateKey).length !== 1 ? 's' : ''}
                  </Text>
                </View>

                {(() => {
                  const dayAppts = getGridAppointments(selectedDateKey);
                  if (dayAppts.length === 0) {
                    return (
                      <View style={styles.emptyDayCompact}>
                        <Ionicons name="calendar-outline" size={32} color={COLORS.textMuted} />
                        <Text style={styles.emptyDayCompactText}>No appointments</Text>
                        <TouchableOpacity style={styles.emptyAddBtnCompact} onPress={() => handleOpenNewAppt(selectedDateKey)}>
                          <Ionicons name="add-circle" size={14} color={COLORS.white} />
                          <Text style={styles.emptyAddBtnCompactText}>Add</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  }
                  return dayAppts.map(appt => (
                    <View key={appt.id} style={styles.mobileApptWrap}>
                      <AppointmentCard
                        appointment={appt}
                        onPress={handleApptPress}
                        onLongPress={handleApptLongPress}
                        selected={selectedApptIds.has(appt.id)}
                        multiSelectMode={multiSelectMode}
                        clientAddress={clientAddressMap[appt.clientId]}
                        directionsOrigin={getDirectionsOriginForAppt(appt, dayAppts)}
                        onBiometricPress={handleBiometricPress}
                        inSessionPair={findInSessionPair(appt, dayAppts)}
                      />
                    </View>
                  ));



                })()}


                {/* Quick overview of the whole week */}
                <View style={styles.weekOverview}>
                  <Text style={styles.weekOverviewTitle}>Week Overview</Text>
                  <View style={styles.weekOverviewGrid}>
                    {weekDates.map((date, idx) => {
                      const dk = formatDateKey(date);
                      const dayAppts = getGridAppointments(dk);
                      const isToday = dk === todayKey;
                      const isSelected = dk === selectedDateKey;
                      return (
                        <TouchableOpacity
                          key={dk}
                          style={[
                            styles.weekOverviewDay,
                            isToday && styles.weekOverviewDayToday,
                            isSelected && styles.weekOverviewDaySelected,
                          ]}
                          onPress={() => setCurrentDate(date)}
                        >
                          <Text style={[
                            styles.weekOverviewDayName,
                            (isToday || isSelected) && { color: COLORS.white },
                          ]}>{DAY_NAMES[idx]}</Text>
                          <Text style={[
                            styles.weekOverviewDayNum,
                            (isToday || isSelected) && { color: COLORS.white },
                          ]}>{date.getDate()}</Text>
                          <Text style={[
                            styles.weekOverviewCount,
                            (isToday || isSelected) && { color: COLORS.white + 'CC' },
                          ]}>{dayAppts.length > 0 ? `${dayAppts.length}` : '-'}</Text>
                          {dayAppts.slice(0, 2).map(a => {
                            const apptType = appointmentTypes.find(t => t.id === a.appointmentTypeId);
                            return (
                              <View key={a.id} style={[styles.weekOverviewDot, { backgroundColor: apptType?.color || '#999' }]} />
                            );
                          })}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </>
            ) : (
              /* Desktop: draggable grid view with drag-and-drop rescheduling */
              <DraggableWeekGrid
                weekDates={weekDates}
                todayKey={todayKey}
                weekRangeLabel={weekRangeLabel}
                filteredAppointments={filteredAppointments}
                allAppointments={appointments}
                totalGridHeight={totalGridHeight}
                onSelectDay={selectDay}
                onSelectAppt={handleApptPress}

                onNavigateWeek={navigateWeek}
                onReschedule={handleRescheduleAppointment}
                onOpenNewAppt={handleOpenNewAppt}
                canDrag={canDragAppointment}
              />

            )}
          </View>
        )}

        {/* ── DAY VIEW ───────────────────────────────────────── */}
        {viewMode === 'day' && (
          <View style={styles.dayViewContainer}>
            {/* Mobile: show week strip for quick navigation */}
            {IS_SMALL_SCREEN && renderWeekStrip()}

            <View style={styles.dayNav}>
              <TouchableOpacity onPress={() => navigateDay(-1)} style={styles.navArrowSmall}>
                <Ionicons name="chevron-back" size={18} color={COLORS.primary} />
              </TouchableOpacity>
              <View style={styles.dayNavCenter}>
                <Text style={styles.dayNavTitle}>
                  {currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </Text>
                {selectedDateKey === todayKey && (
                  <View style={styles.todayBadge}><Text style={styles.todayBadgeText}>Today</Text></View>
                )}
              </View>
              <TouchableOpacity onPress={() => navigateDay(1)} style={styles.navArrowSmall}>
                <Ionicons name="chevron-forward" size={18} color={COLORS.primary} />
              </TouchableOpacity>
            </View>

            {/* Non-blocking banner: clients with biometric assessments scheduled
                today that haven't been completed yet. Tapping a chip opens the
                BiometricEntryForm pre-filled for that client. */}
            {pendingBiometricsToday.length > 0 && (
              <View style={styles.pendingBiometricsBanner}>
                <View style={styles.pendingBiometricsHeader}>
                  <View style={styles.pendingBiometricsIconWrap}>
                    <Ionicons name="body" size={14} color="#2563eb" />
                  </View>
                  <Text style={styles.pendingBiometricsTitle}>
                    {pendingBiometricsToday.length === 1
                      ? '1 biometric assessment due'
                      : `${pendingBiometricsToday.length} biometric assessments due`}
                  </Text>
                  <Text style={styles.pendingBiometricsHint}>Tap a name to log</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.pendingBiometricsList}
                >
                  {pendingBiometricsToday.map(appt => (
                    <TouchableOpacity
                      key={appt.id}
                      style={styles.pendingBiometricChip}
                      onPress={() => handleBiometricPress(appt)}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="time-outline" size={11} color="#2563eb" />
                      <Text style={styles.pendingBiometricChipTime}>
                        {formatTimeShort(appt.startTime)}
                      </Text>
                      <Text style={styles.pendingBiometricChipName} numberOfLines={1}>
                        {appt.clientName}
                      </Text>
                      <Ionicons name="chevron-forward" size={11} color="#2563eb" />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}


            {(() => {
              const dayAppts = filteredAppointments
                .filter(a => a.date === selectedDateKey && a.status !== 'cancelled')
                .sort((a, b) => a.startTime.localeCompare(b.startTime));

              if (dayAppts.length === 0) {
                return (
                  <View style={styles.emptyDay}>
                    <Ionicons name="calendar-outline" size={36} color={COLORS.textMuted} />
                    <Text style={styles.emptyDayTitle}>No Appointments</Text>
                    <TouchableOpacity style={styles.emptyAddBtn} onPress={() => handleOpenNewAppt(selectedDateKey)}>
                      <Ionicons name="add-circle" size={16} color={COLORS.white} />
                      <Text style={styles.emptyAddBtnText}>Schedule Appointment</Text>
                    </TouchableOpacity>
                  </View>
                );
              }

              const timeBlocks: { time: string; appointments: Appointment[] }[] = [];
              dayAppts.forEach(appt => {
                const existing = timeBlocks.find(b => b.time === appt.startTime);
                if (existing) existing.appointments.push(appt);
                else timeBlocks.push({ time: appt.startTime, appointments: [appt] });
              });

              return (
                <View style={styles.dayTimeline}>
                  {timeBlocks.map(block => (
                    <View key={block.time} style={styles.timeBlock}>
                      <View style={styles.timeBlockLeft}>
                        <Text style={styles.timeBlockTime}>{formatTimeDisplay(block.time)}</Text>
                        <View style={styles.timelineLine} />
                      </View>
                      <View style={styles.timeBlockRight}>
                        {block.appointments.map(appt => (
                          <AppointmentCard
                            key={appt.id}
                            appointment={appt}
                            onPress={handleApptPress}
                            onLongPress={handleApptLongPress}
                            selected={selectedApptIds.has(appt.id)}
                            multiSelectMode={multiSelectMode}
                            clientAddress={clientAddressMap[appt.clientId]}
                            directionsOrigin={getDirectionsOriginForAppt(appt, dayAppts)}
                            onBiometricPress={handleBiometricPress}
                            inSessionPair={findInSessionPair(appt, dayAppts)}
                          />
                        ))}
                      </View>
                    </View>
                  ))}
                </View>
              );
            })()}


            <TouchableOpacity style={styles.dayAddBtn} onPress={() => handleOpenNewAppt(selectedDateKey)}>
              <Ionicons name="add-circle" size={18} color={COLORS.accent} />
              <Text style={styles.dayAddBtnText}>Add appointment for this day</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Collapsible Legend & Program Info */}
        <TouchableOpacity
          style={styles.legendToggle}
          onPress={() => setShowLegend(!showLegend)}
          activeOpacity={0.7}
        >
          <Ionicons name="information-circle-outline" size={14} color={COLORS.textMuted} />
          <Text style={styles.legendToggleText}>
            {showLegend ? 'Hide' : 'Show'} Appointment Types & Programs
          </Text>
          <Ionicons name={showLegend ? 'chevron-up' : 'chevron-down'} size={14} color={COLORS.textMuted} />
        </TouchableOpacity>

        {showLegend && (
          <>
            <View style={styles.legend}>
              <Text style={styles.legendTitle}>Appointment Types</Text>
              <View style={styles.legendGrid}>
                {appointmentTypes.map(type => (
                  <View key={type.id} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: type.color }]} />
                    <Text style={styles.legendText}>{type.shortName} ({type.defaultDuration}m)</Text>
                    {type.countsAsSession && <Ionicons name="ticket" size={8} color={COLORS.textMuted} />}
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.programSection}>
              <Text style={styles.legendTitle}>Program Tiers</Text>
              <View style={styles.programGrid}>
                {programDefinitions.map(p => (
                  <View key={p.id} style={[styles.programChip, { borderColor: p.color + '40' }]}>
                    <View style={[styles.programDot, { backgroundColor: p.color }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.programChipName}>{p.name}</Text>
                      <Text style={styles.programChipMeta}>{p.sessionsPerWeek}x/wk · ${p.monthlyCost.toLocaleString()}/mo</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      <NewAppointmentModal
        visible={showNewAppt}
        onClose={() => setShowNewAppt(false)}
        onSave={handleCreateAppointment}
        existingAppointments={appointments}
        preselectedDate={preselectedDate}
        preselectedCoachId={selectedCoachId !== 'all' ? selectedCoachId : undefined}
        filteredTrainers={roleTrainers}
        filteredDietitians={roleDietitians}
        filteredClients={roleClients}
        userRole={profile?.role}
        userCoachName={profile?.trainer_name || profile?.full_name || undefined}
        userId={profile?.id}
        userFranchise={profile?.franchise || undefined}
      />



      <AppointmentDetailModal
        visible={!!selectedAppt}
        appointment={selectedAppt}
        onClose={() => setSelectedAppt(null)}
        onUpdateStatus={handleUpdateStatus}
        onDelete={handleDeleteAppointment}
        sessionBalance={getApptSessionBalance(selectedAppt)}
        existingAppointments={appointments}
        onReschedule={handleRescheduleAppointment}
        onBulkReschedule={handleBulkReschedule}
        onBulkCancel={handleBulkCancel}
        onBulkDelete={handleBulkDelete}
        userRole={profile?.role}
        userCoachName={profile?.trainer_name || profile?.full_name || undefined}
        userCoachId={profile?.id}
        inSessionBiometric={selectedApptBiometric}
        onLogBiometric={handleBiometricPress}
      />



      <CalendarSyncModal
        visible={showCalendarSync}
        onClose={() => setShowCalendarSync(false)}
        appointments={appointments}
        coachId={selectedCoachId !== 'all' ? selectedCoachId : undefined}
        coachName={selectedCoachId !== 'all' ? coachList.find(c => c.id === selectedCoachId)?.name : undefined}
        userRole={profile?.role}
      />

      {/* Biometric Assessment Entry Form - opens when tapping a biometric appointment
          or the measuring-tape icon. On save we auto-complete the biometric + any
          overlapping training session, and show the success toast below. */}
      {biometricAppt && (
        <BiometricEntryForm
          visible={!!biometricAppt}
          onClose={handleBiometricClose}
          onSaved={handleBiometricSaved}
          userId={biometricAppt.clientId}
          latestEntry={biometricLatestEntry}
          initialHeight={biometricInitialHeight}
          clientName={biometricAppt.clientName}
        />
      )}

      {/* Biometric-saved success toast (separate from StatusChangeToast so both
          can coexist — this one confirms the auto-completion.) */}
      {biometricSuccessMsg && (
        <View style={styles.biometricToast} pointerEvents="box-none">
          <View style={styles.biometricToastInner}>
            <Ionicons name="checkmark-circle" size={18} color={COLORS.white} />
            <Text style={styles.biometricToastText} numberOfLines={2}>
              {biometricSuccessMsg}
            </Text>
            <TouchableOpacity
              onPress={() => {
                if (biometricToastTimer.current) {
                  clearTimeout(biometricToastTimer.current);
                  biometricToastTimer.current = null;
                }
                setBiometricSuccessMsg(null);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={16} color={COLORS.white} />
            </TouchableOpacity>
          </View>
        </View>
      )}


      <AuthModal visible={showAuthModal} onClose={() => setShowAuthModal(false)} />

      {/* Status Change Undo Toast - shows after single or batch status update with 5s undo window */}
      <StatusChangeToast
        info={statusChangeInfo}
        batchInfo={batchStatusChangeInfo}
        sessionSynced={sessionSynced}
        sessionSyncCount={sessionSyncCount}
        onUndo={handleUndoStatusChange}
        onBatchUndo={handleBatchUndo}
        onDismiss={() => { setStatusChangeInfo(null); setBatchStatusChangeInfo(null); setSessionSynced(false); }}
      />


      {/* Batch Action Bar - shows when in multi-select mode */}
      <BatchActionBar
        visible={multiSelectMode}
        selectedCount={selectedApptIds.size}
        totalCount={visibleDayAppts.length}
        onSelectAll={handleSelectAll}
        onDeselectAll={handleDeselectAll}
        onBatchStatus={handleBatchStatusUpdate}
        onExit={exitMultiSelect}
      />

    </View>
  );
}



const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },

  // Session Panel
  sessionPanel: { marginHorizontal: SPACING.md, marginTop: SPACING.sm, backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, padding: SPACING.sm, borderWidth: 1, borderColor: COLORS.danger + '20', ...SHADOWS.sm },
  sessionPanelHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginBottom: SPACING.xs },
  sessionPanelTitle: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.danger, flex: 1 },
  sessionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  sessionRowLeft: { flex: 1 },
  sessionClientName: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: COLORS.primary },
  sessionProgram: { fontSize: 9, fontWeight: '500' },
  sessionRowRight: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 90 },
  sessionBarBg: { flex: 1, height: 5, backgroundColor: COLORS.borderLight, borderRadius: 3, overflow: 'hidden' },
  sessionBarFill: { height: '100%', borderRadius: 3 },
  sessionCount: { fontSize: 9, fontWeight: '800', minWidth: 22, textAlign: 'right' },

  // Controls - compact
  controlsRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, gap: SPACING.xs },
  viewToggle: { flexDirection: 'row', backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.sm, padding: 2, borderWidth: 1, borderColor: COLORS.border },
  viewBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: IS_SMALL_SCREEN ? SPACING.sm : SPACING.md, paddingVertical: 5, borderRadius: BORDER_RADIUS.sm - 1 },
  viewBtnActive: { backgroundColor: COLORS.primary },
  viewBtnText: { fontSize: IS_SMALL_SCREEN ? 10 : FONT_SIZES.sm, fontWeight: '600', color: COLORS.textSecondary },
  viewBtnTextActive: { color: COLORS.white },
  todayBtn: { paddingHorizontal: SPACING.sm, paddingVertical: 6, borderRadius: BORDER_RADIUS.sm, borderWidth: 1, borderColor: COLORS.accent },
  todayBtnText: { fontSize: IS_SMALL_SCREEN ? 10 : FONT_SIZES.sm, fontWeight: '700', color: COLORS.accent },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: COLORS.accent, paddingHorizontal: IS_SMALL_SCREEN ? SPACING.sm : SPACING.md, paddingVertical: 6, borderRadius: BORDER_RADIUS.sm, marginLeft: 'auto' },
  addBtnText: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.white },
  syncBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: IS_SMALL_SCREEN ? SPACING.sm : SPACING.md, paddingVertical: 6, borderRadius: BORDER_RADIUS.sm, borderWidth: 1, borderColor: COLORS.accent },
  syncBtnText: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.accent },


  // Filters - single scrollable row
  filterScroll: { marginTop: SPACING.xs },
  filterScrollContent: { paddingHorizontal: SPACING.md, gap: SPACING.xs, flexDirection: 'row', paddingBottom: SPACING.xs },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: SPACING.sm, paddingVertical: 5, borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border },
  filterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterChipText: { fontSize: 10, fontWeight: '600', color: COLORS.textSecondary },
  filterChipTextActive: { color: COLORS.white },

  // ── Week Strip (mobile) ──
  weekStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.xs,
    paddingVertical: SPACING.xs,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    ...SHADOWS.sm,
  },
  weekStripNav: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekStripDays: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  weekStripDay: {
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: BORDER_RADIUS.sm,
    minWidth: 32,
  },
  weekStripDayToday: {
    backgroundColor: COLORS.accent + '15',
  },
  weekStripDaySelected: {
    backgroundColor: COLORS.primary,
  },
  weekStripDayName: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
  },
  weekStripDayNameToday: {
    color: COLORS.accent,
  },
  weekStripDayNameSelected: {
    color: COLORS.white + 'CC',
  },
  weekStripDayNum: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.primary,
    marginTop: 1,
  },
  weekStripDayNumToday: {
    color: COLORS.accent,
  },
  weekStripDayNumSelected: {
    color: COLORS.white,
  },
  weekStripDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.primary,
    marginTop: 2,
  },

  // Mobile week day header
  mobileWeekDayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  mobileWeekDayTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.primary,
  },
  mobileWeekDayCount: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  mobileApptWrap: {
    paddingHorizontal: SPACING.md,
  },
  emptyDayCompact: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    gap: SPACING.xs,
  },
  emptyDayCompactText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  emptyAddBtnCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.sm,
    marginTop: SPACING.xs,
  },
  emptyAddBtnCompactText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.white,
  },

  // Week overview grid (mobile)
  weekOverview: {
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  weekOverviewTitle: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.xs,
  },
  weekOverviewGrid: {
    flexDirection: 'row',
    gap: 4,
  },
  weekOverviewDay: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.xs,
    alignItems: 'center',
    minHeight: 60,
    ...SHADOWS.sm,
  },
  weekOverviewDayToday: {
    backgroundColor: COLORS.accent,
  },
  weekOverviewDaySelected: {
    backgroundColor: COLORS.primary,
  },
  weekOverviewDayName: {
    fontSize: 8,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
  },
  weekOverviewDayNum: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '800',
    color: COLORS.primary,
    marginTop: 1,
  },
  weekOverviewCount: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: '600',
    marginTop: 2,
  },
  weekOverviewDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 2,
  },

  // Week container (desktop grid)
  weekContainer: { marginTop: SPACING.sm, paddingHorizontal: IS_SMALL_SCREEN ? 0 : SPACING.sm },
  weekNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.md, marginBottom: SPACING.sm, paddingHorizontal: SPACING.sm },
  navArrow: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', ...SHADOWS.sm },
  navArrowSmall: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', ...SHADOWS.sm },
  weekNavTitle: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.primary },
  gridHeaderRow: { flexDirection: 'row' },
  timeColHeader: { backgroundColor: COLORS.background },
  dayColHeader: { alignItems: 'center', paddingVertical: 4, backgroundColor: COLORS.white, borderWidth: 0.5, borderColor: COLORS.borderLight },
  dayColHeaderToday: { backgroundColor: COLORS.accent },
  dayHeaderName: { fontSize: 8, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase' },
  dayHeaderNameToday: { color: COLORS.white },
  dayHeaderNum: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  dayHeaderNumToday: { backgroundColor: 'rgba(255,255,255,0.3)' },
  dayHeaderNumText: { fontSize: 10, fontWeight: '700', color: COLORS.primary },
  dayHeaderNumTextToday: { color: COLORS.white },
  dayApptCount: { fontSize: 7, fontWeight: '700', color: COLORS.textMuted, marginTop: 1 },
  gridBody: { flexDirection: 'row', position: 'relative', backgroundColor: COLORS.white },
  timeCol: { position: 'relative' },
  timeLabel: { position: 'absolute', right: 2, height: MOBILE_SLOT_HEIGHT * 4 },
  timeLabelText: { fontSize: 8, fontWeight: '600', color: COLORS.textMuted },
  dayGridCol: { position: 'relative', borderLeftWidth: 0.5, borderLeftColor: COLORS.borderLight },
  hourLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: COLORS.borderLight },
  gridApptWrap: { position: 'absolute', left: 1, right: 1 },
  weekendRow: { flexDirection: 'row', gap: SPACING.xs, marginTop: SPACING.sm, paddingHorizontal: SPACING.sm },
  weekendCard: { flex: 1, backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.sm, padding: SPACING.xs, borderWidth: 1, borderColor: COLORS.borderLight, minHeight: 60 },
  weekendDay: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.primary, marginBottom: 2 },
  weekendCount: { fontSize: 9, color: COLORS.textMuted, marginBottom: 2 },
  weekendMore: { fontSize: 8, color: COLORS.accent, fontWeight: '600', textAlign: 'center', marginTop: 2 },

  // Day View - compact
  dayViewContainer: { paddingHorizontal: SPACING.md, marginTop: SPACING.sm },
  dayNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm },
  dayNavCenter: { alignItems: 'center', flex: 1 },
  dayNavTitle: { fontSize: IS_SMALL_SCREEN ? FONT_SIZES.md : FONT_SIZES.lg, fontWeight: '700', color: COLORS.primary },
  todayBadge: { backgroundColor: COLORS.accent, paddingHorizontal: SPACING.sm, paddingVertical: 1, borderRadius: BORDER_RADIUS.full, marginTop: 2 },
  todayBadgeText: { fontSize: 9, fontWeight: '700', color: COLORS.white },
  emptyDay: { alignItems: 'center', paddingVertical: 40, gap: SPACING.xs },
  emptyDayTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.primary },
  emptyAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.accent, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.sm, marginTop: SPACING.sm },
  emptyAddBtnText: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.white },
  dayTimeline: { gap: 0 },
  timeBlock: { flexDirection: 'row', minHeight: 70 },
  timeBlockLeft: { width: IS_SMALL_SCREEN ? 56 : 70, alignItems: 'flex-end', paddingRight: SPACING.sm },
  timeBlockTime: { fontSize: IS_SMALL_SCREEN ? 10 : FONT_SIZES.xs, fontWeight: '700', color: COLORS.textSecondary },
  timelineLine: { width: 2, flex: 1, backgroundColor: COLORS.borderLight, marginTop: 4, alignSelf: 'center' },
  timeBlockRight: { flex: 1, paddingBottom: SPACING.xs },
  dayAddBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, paddingVertical: SPACING.sm, marginTop: SPACING.sm, borderWidth: 1.5, borderColor: COLORS.accent + '40', borderRadius: BORDER_RADIUS.sm, borderStyle: 'dashed' },
  dayAddBtnText: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: COLORS.accent },

  // Legend - collapsible
  legendToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    marginTop: SPACING.md,
    marginHorizontal: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  legendToggleText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  legend: { marginTop: SPACING.xs, paddingHorizontal: SPACING.md },
  legendTitle: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.primary, marginBottom: SPACING.xs },
  legendGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendText: { fontSize: 9, color: COLORS.textSecondary, fontWeight: '500' },
  programSection: { marginTop: SPACING.sm, paddingHorizontal: SPACING.md },
  programGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  programChip: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.sm, padding: SPACING.xs, borderWidth: 1, width: IS_SMALL_SCREEN ? '100%' as any : '48%' as any },
  programDot: { width: 8, height: 8, borderRadius: 4 },
  programChipName: { fontSize: 9, fontWeight: '700', color: COLORS.primary },
  programChipMeta: { fontSize: 8, color: COLORS.textMuted },

  // Biometric success toast (floats above other UI)
  biometricToast: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 80,
    paddingHorizontal: SPACING.md,
    alignItems: 'center',
    zIndex: 1000,
  },
  biometricToastInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: '#16a34a',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    maxWidth: 520,
    ...SHADOWS.md,
  },
  biometricToastText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.white,
  },

  // ── Pending biometrics banner (Day view) ──
  pendingBiometricsBanner: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#2563eb' + '33',
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.xs + 2,
    paddingHorizontal: SPACING.sm,
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  pendingBiometricsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  pendingBiometricsIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#2563eb' + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingBiometricsTitle: {
    flex: 1,
    fontSize: FONT_SIZES.xs,
    fontWeight: '800',
    color: '#1e40af',
  },
  pendingBiometricsHint: {
    fontSize: 9,
    fontWeight: '600',
    color: '#2563eb',
  },
  pendingBiometricsList: {
    flexDirection: 'row',
    gap: SPACING.xs,
    paddingRight: SPACING.xs,
  },
  pendingBiometricChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#2563eb' + '40',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: BORDER_RADIUS.full,
    maxWidth: 200,
  },
  pendingBiometricChipTime: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2563eb',
  },
  pendingBiometricChipName: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.primary,
    maxWidth: 120,
  },
});


