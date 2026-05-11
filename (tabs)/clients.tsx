import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';

import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../constants/theme';
import Header from '../components/Header';
import SearchBar from '../components/SearchBar';
import ClientCard from '../components/ClientCard';
import FilterPanel from '../components/FilterPanel';
import ClientDetailModal from '../components/ClientDetailModal';
import AuthModal from '../components/AuthModal';
import CreateClientContactModal from '../components/CreateClientContactModal';
import MassImportModal from '../components/MassImportModal';
import { Client, CONTACT_STATUS_OPTIONS, ContactStatus, Franchise } from '../data/mockData';
import { useAuth } from '../contexts/AuthContext';
import { filterFranchises } from '../lib/dataFilters';

import { listApprovedEmails, ApprovedEmail } from '../lib/approvedEmailsService';
import { supabase } from '../lib/supabase';
import { getProgramDefinition, formatTimeDisplay } from '../data/scheduleData';
import { fetchAppointments as fetchAppointmentsFromDB } from '../lib/appointmentService';




// Legacy status options (for admin/non-FM views)
const LEGACY_STATUS_OPTIONS = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'At Risk', value: 'at-risk' },
  { label: 'Paused', value: 'paused' },
  { label: 'New', value: 'new' },
  { label: 'Alumni', value: 'alumni' },
];

// FM-specific contact status options — all statuses (with 'all' prepended)
const FM_STATUS_OPTIONS = [
  { label: 'All', value: 'all' },
  ...CONTACT_STATUS_OPTIONS.map(s => ({ label: s.label, value: s.value })),
];

// Coach-specific (trainer/dietitian) contact status options
// Coaches should NOT see Active Staff, Former Staff, or Referring Partner
const COACH_HIDDEN_STATUSES = new Set(['active-staff', 'former-staff', 'referring-partner']);
const COACH_STATUS_OPTIONS = [
  { label: 'All', value: 'all' },
  ...CONTACT_STATUS_OPTIONS
    .filter(s => !COACH_HIDDEN_STATUSES.has(s.value))
    .map(s => ({ label: s.label, value: s.value })),
];


// Color map for FM status chips
const FM_STATUS_COLORS: Record<string, string> = {};
CONTACT_STATUS_OPTIONS.forEach(s => { FM_STATUS_COLORS[s.value] = s.color; });

// Icon map for FM status
const FM_STATUS_ICONS: Record<string, string> = {};
CONTACT_STATUS_OPTIONS.forEach(s => { FM_STATUS_ICONS[s.value] = s.icon; });

const SORT_OPTIONS = [
  { label: 'Name', value: 'name' },
  { label: 'Status', value: 'status' },
  { label: 'Newest', value: 'newest' },
  { label: 'Spend', value: 'spend' },
  { label: 'Satisfaction', value: 'satisfaction' },
  { label: 'Sessions', value: 'sessions' },
];

// Convert an unclaimed approved email to an active Client object with unclaimed flag
function approvedEmailToClient(ae: ApprovedEmail, index: number): Client {
  return {
    id: `unclaimed-${ae.id}`,
    name: ae.full_name || ae.email.split('@')[0],
    email: ae.email,
    phone: '',
    avatar: '',
    status: 'active',
    franchise: ae.franchise || 'Unassigned',
    trainer: 'None',
    dietitian: 'None',
    joinDate: ae.created_at ? ae.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
    lastSession: '',
    nextSession: '',
    program: 'Not yet assigned',
    weight: 0,
    targetWeight: 0,
    startWeight: 0,
    bodyFat: 0,
    sessionsCompleted: 0,
    totalSessions: 0,
    satisfaction: 0,
    monthlySpend: 0,
    goals: [],
    milestones: [],
    phase: 'Pre-onboarding',
    renewalDate: '',
    birthdate: '',
    occupation: '',
    address: ae.address || undefined,
    unclaimed: true,
  };
}

// Convert a DB user profile to a Client object
// _firstProgramStartDate is an optional override attached after fetching program history
// _latestWeight, _startWeight, _latestBodyFat, _sessionsCompleted, _totalSessions,
// _avgRating, _nextSession, _lastSession are enrichment fields from biometrics/sessions

function dbProfileToClient(p: any): Client {
  // Map contact_status to legacy status for non-FM views
  let legacyStatus: Client['status'] = 'active';
  if (p.contact_status === 'former-client' || p.contact_status === 'failed-jumpstart') {
    legacyStatus = 'alumni';
  } else if (p.contact_status === 'active-client' || p.contact_status === 'active-jumpstart') {
    legacyStatus = 'active';
  }

  // Join date priority: earliest program history start_date > current program_start_date > created_at
  const joinDate = p._firstProgramStartDate
    || (p.program_start_date ? p.program_start_date.split('T')[0] : null)
    || (p.created_at ? p.created_at.split('T')[0] : new Date().toISOString().split('T')[0]);

  // Enrichment data from biometrics and sessions (defaults to 0 if not available)
  const currentWeight = p._latestWeight || 0;
  const startWeight = p._startWeight || 0;
  const bodyFat = p._latestBodyFat || 0;
  const sessionsCompleted = p._sessionsCompleted || 0;
  const totalSessions = p._totalSessions || 0;
  const satisfaction = p._avgRating || 0;
  const nextSession = p._nextSession || '';
  const lastSession = p._lastSession || '';

  // Look up the program definition to get the monthly cost
  const programName = p.program || 'Not yet assigned';
  const programDef = getProgramDefinition(programName);
  const monthlySpend = programDef?.monthlyCost ?? 0;

  return {
    id: p.id, // real UUID from DB
    name: p.full_name || p.email?.split('@')[0] || 'Unknown',
    email: p.email || '',
    phone: p.phone || '',
    avatar: p.photo_url || '', // now using photo_url column

    status: legacyStatus,
    contactStatus: p.contact_status || undefined,
    role: p.role || undefined,
    franchise: p.franchise || 'Unassigned',
    trainer: p.primary_trainer || 'None',
    dietitian: p.primary_dietitian || 'None',
    joinDate,
    lastSession,
    nextSession,
    program: programName,
    weight: currentWeight,
    targetWeight: 0,
    startWeight,
    bodyFat,
    sessionsCompleted,
    totalSessions,
    satisfaction,
    monthlySpend,
    goals: [],
    milestones: [],
    phase: 'Active',
    renewalDate: '',
    birthdate: p.birthdate ? p.birthdate.split('T')[0] : '',

    occupation: p.occupation || '',
    address: p.address || undefined,
    has_nutrition: p.has_nutrition || false,
  };
}







export default function ClientsScreen() {
  const { profile, showAuthModal, setShowAuthModal } = useAuth();
  const params = useLocalSearchParams<{ initialStatus?: string }>();

  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [franchiseFilter, setFranchiseFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [viewMode, setViewMode] = useState<'full' | 'compact'>('full');
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [showMassImport, setShowMassImport] = useState(false);

  // Apply initialStatus from route params (from dashboard navigation)
  const appliedInitialRef = useRef<string | null>(null);
  useEffect(() => {
    if (params.initialStatus && params.initialStatus !== appliedInitialRef.current) {
      appliedInitialRef.current = params.initialStatus;
      setStatusFilter(params.initialStatus);
    }
  }, [params.initialStatus]);



  // Unclaimed clients from approved_emails (shown in their proper status with unclaimed indicator)
  const [unclaimedClients, setUnclaimedClients] = useState<Client[]>([]);
  const [unclaimedLoading, setUnclaimedLoading] = useState(false);
  
  // Real DB contacts (created via Create Contact or who have signed up)
  const [dbContacts, setDbContacts] = useState<Client[]>([]);
  const [dbContactsLoading, setDbContactsLoading] = useState(false);

  // DB franchises for franchise filter dropdown
  const [dbFranchises, setDbFranchises] = useState<Franchise[]>([]);
  
  const isAdmin = profile?.role === 'admin';
  const isFranchiseManager = profile?.role === 'franchise_manager';
  const isTrainer = profile?.role === 'trainer';
  const isDietitian = profile?.role === 'dietitian';
  const canCreateContacts = isFranchiseManager;
  const canSeeUnclaimed = isAdmin || isFranchiseManager;
  // Trainers and dietitians can now fetch their assigned clients
  const canFetchDbContacts = isAdmin || isFranchiseManager || isTrainer || isDietitian;
  const isStaff = isAdmin || isFranchiseManager || isTrainer || isDietitian;

  // Build the list of names to match for trainer/dietitian filtering
  // primary_trainer/primary_dietitian on clients is set from the dropdown using full_name,
  // but trainer_name may also be used in some contexts, so we match against both.
  const staffMatchNames = useMemo(() => {
    if (!isTrainer && !isDietitian) return [];
    const names: string[] = [];
    if (profile?.full_name) names.push(profile.full_name);
    if (profile?.trainer_name && profile.trainer_name !== profile.full_name) names.push(profile.trainer_name);
    return names;
  }, [isTrainer, isDietitian, profile?.full_name, profile?.trainer_name]);




  // Use FM status system for franchise managers, trainers, and dietitians
  // Coaches see a subset of contact statuses (no staff/partner categories)
  // FM sees all contact statuses
  const useFMStatuses = isFranchiseManager || isTrainer || isDietitian;
  const isCoach = isTrainer || isDietitian;
  const STATUS_OPTIONS = isCoach ? COACH_STATUS_OPTIONS : (isFranchiseManager ? FM_STATUS_OPTIONS : LEGACY_STATUS_OPTIONS);

  // Only admin (master login) sees the location filter
  const hideLocationFilter = !isAdmin;




  // Fetch real DB contacts DIRECTLY from user_profiles table
  // This bypasses the edge function JWT auth issues by using the Supabase client directly
  const fetchDbContacts = useCallback(async () => {
    if (!canFetchDbContacts) {
      setDbContacts([]);
      return;
    }

    setDbContactsLoading(true);
    try {
      // Build query directly against user_profiles table (includes program_start_date for join date)
      let query = supabase
        .from('user_profiles')
        .select('id, full_name, email, phone, role, franchise, program, primary_trainer, primary_dietitian, contact_status, photo_url, address, birthdate, occupation, company, has_nutrition, program_start_date, created_at, updated_at')
        .order('full_name', { ascending: true });

      // Franchise managers only see contacts in their franchise
      if (isFranchiseManager && profile?.franchise) {
        query = query.eq('franchise', profile.franchise);
      }

      // Trainers: filter to only show clients assigned to them
      // Match primary_trainer against the trainer's full_name and/or trainer_name
      if (isTrainer && staffMatchNames.length > 0) {
        if (staffMatchNames.length === 1) {
          query = query.eq('primary_trainer', staffMatchNames[0]);
        } else {
          // Match against either full_name or trainer_name
          query = query.or(staffMatchNames.map(n => `primary_trainer.eq.${n}`).join(','));
        }
      }

      // Dietitians: filter to only show clients assigned to them
      // Match primary_dietitian against the dietitian's full_name and/or trainer_name
      if (isDietitian && staffMatchNames.length > 0) {
        if (staffMatchNames.length === 1) {
          query = query.eq('primary_dietitian', staffMatchNames[0]);
        } else {
          query = query.or(staffMatchNames.map(n => `primary_dietitian.eq.${n}`).join(','));
        }
      }

      // Exclude the current user from the list
      if (profile?.id) {
        query = query.neq('id', profile.id);
      }

      const { data: contacts, error: queryError } = await query;

      if (queryError) {
        console.log('Direct DB query error, falling back to edge function:', queryError.message);
        // Fallback: try the edge function
        try {
          const { data, error } = await supabase.functions.invoke('manage-client-data', {
            body: { action: 'list_contacts' },
          });
          if (!error && data?.data && Array.isArray(data.data)) {
            let fallbackContacts = data.data.map((p: any) => dbProfileToClient(p));
            // Apply trainer/dietitian filter to fallback results too
            if (isTrainer && staffMatchNames.length > 0) {
              fallbackContacts = fallbackContacts.filter((c: Client) =>
                staffMatchNames.some(n => c.trainer === n)
              );
            }
            if (isDietitian && staffMatchNames.length > 0) {
              fallbackContacts = fallbackContacts.filter((c: Client) =>
                staffMatchNames.some(n => c.dietitian === n)
              );
            }
            setDbContacts(fallbackContacts);
            return;
          }
        } catch { /* ignore fallback error */ }
        setDbContacts([]);
      } else if (contacts && Array.isArray(contacts)) {
        // Fetch earliest program start dates from client_program_history
        // to use as the "joined" date instead of created_at
        const userIds = contacts.map((c: any) => c.id).filter(Boolean);
        let firstProgramDates: Record<string, string> = {};

        if (userIds.length > 0) {
          try {
            const { data: historyRows } = await supabase
              .from('client_program_history')
              .select('user_id, start_date')
              .in('user_id', userIds)
              .order('start_date', { ascending: true });

            if (historyRows && Array.isArray(historyRows)) {
              // Build map of user_id -> earliest start_date
              for (const row of historyRows) {
                if (row.user_id && row.start_date && !firstProgramDates[row.user_id]) {
                  firstProgramDates[row.user_id] = row.start_date.split('T')[0];
                }
              }
            }
          } catch (histErr) {
            console.log('Error fetching program history for join dates:', histErr);
          }
        }

        // ── Fetch biometric data for enrichment (weight, body fat) ──
        let latestBiometrics: Record<string, { weight: number; bodyFat: number }> = {};
        let startBiometrics: Record<string, { weight: number }> = {};

        if (userIds.length > 0) {
          try {
            // Latest biometrics per user (most recent measured_at)
            const { data: latestBioRows } = await supabase
              .from('client_biometrics')
              .select('user_id, weight, body_fat, measured_at')
              .in('user_id', userIds)
              .not('weight', 'is', null)
              .order('measured_at', { ascending: false });

            if (latestBioRows && Array.isArray(latestBioRows)) {
              for (const row of latestBioRows) {
                if (row.user_id && !latestBiometrics[row.user_id]) {
                  latestBiometrics[row.user_id] = {
                    weight: Number(row.weight) || 0,
                    bodyFat: Number(row.body_fat) || 0,
                  };
                }
              }
            }

            // Earliest biometrics per user (oldest measured_at) for start weight
            const { data: earliestBioRows } = await supabase
              .from('client_biometrics')
              .select('user_id, weight, measured_at')
              .in('user_id', userIds)
              .not('weight', 'is', null)
              .order('measured_at', { ascending: true });

            if (earliestBioRows && Array.isArray(earliestBioRows)) {
              for (const row of earliestBioRows) {
                if (row.user_id && !startBiometrics[row.user_id]) {
                  startBiometrics[row.user_id] = {
                    weight: Number(row.weight) || 0,
                  };
                }
              }
            }
          } catch (bioErr) {
            console.log('Error fetching biometrics for client cards:', bioErr);
          }
        }

        // ── Fetch session data for enrichment (completed, total, rating) ──
        // Session records are used for completed count, total, and avg rating
        let sessionStats: Record<string, {
          completed: number;
          total: number;
          avgRating: number;
          nextSession: string;
          lastSession: string;
        }> = {};

        if (userIds.length > 0) {
          try {
            const { data: sessionRows } = await supabase
              .from('session_records')
              .select('user_id, status, rating, session_date')
              .in('user_id', userIds)
              .order('session_date', { ascending: false });

            if (sessionRows && Array.isArray(sessionRows)) {
              const todayStr = new Date().toISOString().split('T')[0];
              // Group by user_id
              const grouped: Record<string, typeof sessionRows> = {};
              for (const row of sessionRows) {
                if (!row.user_id) continue;
                if (!grouped[row.user_id]) grouped[row.user_id] = [];
                grouped[row.user_id].push(row);
              }

              for (const [userId, rows] of Object.entries(grouped)) {
                const completed = rows.filter(r => r.status === 'completed').length;
                const total = rows.length;
                const rated = rows.filter(r => r.rating != null && r.rating > 0);
                const avgRating = rated.length > 0
                  ? parseFloat((rated.reduce((sum, r) => sum + Number(r.rating), 0) / rated.length).toFixed(1))
                  : 0;
                // Fallback next/last from session_records (will be overridden by appointments if available)
                const upcoming = rows
                  .filter(r => r.status === 'upcoming' && r.session_date >= todayStr)
                  .sort((a, b) => a.session_date.localeCompare(b.session_date));
                const nextSession = upcoming.length > 0
                  ? new Date(upcoming[0].session_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : '';
                const completedRows = rows
                  .filter(r => r.status === 'completed')
                  .sort((a, b) => b.session_date.localeCompare(a.session_date));
                const lastSession = completedRows.length > 0
                  ? new Date(completedRows[0].session_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : '';

                sessionStats[userId] = { completed, total, avgRating, nextSession, lastSession };
              }
            }
          } catch (sessErr) {
            console.log('Error fetching sessions for client cards:', sessErr);
          }
        }

        // ── Fetch LIVE appointment data for next/last session (from the schedule) ──
        // The appointments table is the source of truth for upcoming scheduled sessions.
        // This overrides session_records data for next/last session fields.
        let appointmentStats: Record<string, { nextSession: string; lastSession: string }> = {};

        try {
          const fetchParams: any = {};
          // Scope to franchise if franchise manager
          if (isFranchiseManager && profile?.franchise) {
            fetchParams.franchise = profile.franchise;
          }
          // For trainers/dietitians, scope to their coach ID
          if ((isTrainer || isDietitian) && profile?.id) {
            fetchParams.coachId = profile.id;
          }

          const { appointments: allAppts, error: apptError } = await fetchAppointmentsFromDB(fetchParams);

          if (!apptError && allAppts && allAppts.length > 0) {
            const todayStr = new Date().toISOString().split('T')[0];

            // Group appointments by clientId (and secondClientId for couples)
            const clientAppts: Record<string, typeof allAppts> = {};
            for (const appt of allAppts) {
              if (appt.clientId) {
                if (!clientAppts[appt.clientId]) clientAppts[appt.clientId] = [];
                clientAppts[appt.clientId].push(appt);
              }
              // Also index by secondClientId for couples/shared sessions
              if (appt.secondClientId) {
                if (!clientAppts[appt.secondClientId]) clientAppts[appt.secondClientId] = [];
                clientAppts[appt.secondClientId].push(appt);
              }
            }

            for (const [clientId, appts] of Object.entries(clientAppts)) {
              // Next session: earliest scheduled/confirmed appointment >= today
              const upcomingAppts = appts
                .filter(a => (a.status === 'scheduled' || a.status === 'confirmed') && a.date >= todayStr)
                .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

              const nextSession = upcomingAppts.length > 0
                ? `${new Date(upcomingAppts[0].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${formatTimeDisplay(upcomingAppts[0].startTime)}`
                : '';

              // Last session: most recent completed appointment
              const completedAppts = appts
                .filter(a => a.status === 'completed')
                .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));

              const lastSession = completedAppts.length > 0
                ? new Date(completedAppts[0].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : '';

              appointmentStats[clientId] = { nextSession, lastSession };
            }
          }
        } catch (apptErr) {
          console.log('Error fetching appointments for client enrichment:', apptErr);
          // Non-fatal: we still have session_records fallback
        }

        // Attach all enrichment data to each profile before converting
        // Appointment data takes priority over session_records for next/last session
        const enriched = contacts.map((p: any) => {
          const bio = latestBiometrics[p.id];
          const startBio = startBiometrics[p.id];
          const sess = sessionStats[p.id];
          const apptData = appointmentStats[p.id];

          // Prefer appointment data for next/last session, fall back to session_records
          const nextSession = apptData?.nextSession || sess?.nextSession || '';
          const lastSession = apptData?.lastSession || sess?.lastSession || '';

          return {
            ...p,
            _firstProgramStartDate: firstProgramDates[p.id] || null,
            _latestWeight: bio?.weight || 0,
            _latestBodyFat: bio?.bodyFat || 0,
            _startWeight: startBio?.weight || 0,
            _sessionsCompleted: sess?.completed || 0,
            _totalSessions: sess?.total || 0,
            _avgRating: sess?.avgRating || 0,
            _nextSession: nextSession,
            _lastSession: lastSession,
          };
        });


        const converted = enriched.map((p: any) => dbProfileToClient(p));
        setDbContacts(converted);
        const roleLabel = isTrainer ? 'trainer' : isDietitian ? 'dietitian' : 'admin/FM';
        console.log(`Direct DB query (${roleLabel}): loaded ${converted.length} contacts (with biometrics & sessions)`);

      } else {
        setDbContacts([]);
      }
    } catch (err) {
      console.log('Exception fetching DB contacts:', err);
      setDbContacts([]);

    } finally {
      setDbContactsLoading(false);
    }
  }, [canFetchDbContacts, isFranchiseManager, isTrainer, isDietitian, staffMatchNames, profile?.franchise, profile?.id]);



  // Fetch unclaimed clients from approved_emails
  const fetchUnclaimedClients = useCallback(async () => {
    if (!canSeeUnclaimed) {
      setUnclaimedClients([]);
      return;
    }

    setUnclaimedLoading(true);
    try {
      const franchiseScope = isFranchiseManager ? (profile?.franchise || undefined) : undefined;
      const { data, error } = await listApprovedEmails(undefined, 'unclaimed', franchiseScope);

      if (error || !data) {
        console.log('Error fetching unclaimed clients:', error);
        setUnclaimedClients([]);
      } else {
        // Only include client-role approved emails
        const clientEmails = data.filter(ae => ae.role === 'client');
        const converted = clientEmails.map((ae, i) => approvedEmailToClient(ae, i));
        setUnclaimedClients(converted);
      }
    } catch (err) {
      console.log('Exception fetching unclaimed clients:', err);
      setUnclaimedClients([]);
    } finally {
      setUnclaimedLoading(false);
    }
  }, [canSeeUnclaimed, isFranchiseManager, profile?.franchise]);

  // Fetch DB franchises for the franchise filter dropdown
  const fetchFranchises = useCallback(async () => {
    if (!isStaff) return;
    try {
      const { data, error } = await supabase.functions.invoke('manage-franchises', {
        body: { action: 'list' },
      });
      if (!error && data?.data) {
        const converted: Franchise[] = data.data.map((dbf: any) => ({
          id: dbf.id,
          name: dbf.name,
          city: dbf.city,
          state: dbf.state,
          manager: dbf.manager_name || 'Unassigned',
          managerAvatar: '',
          activeClients: dbf.active_clients || 0,
          totalTrainers: dbf.total_trainers || 0,
          status: dbf.status || 'good',
          isActive: dbf.is_active !== false,
        }));

        setDbFranchises(converted);
      }
    } catch (err) {
      console.log('Error fetching franchises for clients filter:', err);
    }
  }, [isStaff]);

  useEffect(() => {
    fetchUnclaimedClients();
    fetchDbContacts();
    fetchFranchises();
  }, [fetchUnclaimedClients, fetchDbContacts, fetchFranchises]);

  // Use DB franchises for franchise filter dropdown
  const roleFilteredFranchises = useMemo(() => {
    const activeFranchises = dbFranchises.filter(f => f.isActive !== false);
    return filterFranchises(activeFranchises, profile);
  }, [dbFranchises, profile]);


  // Merge DB contacts + unclaimed clients (all data comes from the database now)
  const allClients = useMemo(() => {
    const emailSet = new Set<string>();
    const merged: Client[] = [];

    // 1. Add real DB contacts first (highest priority)
    for (const c of dbContacts) {
      const key = c.email.toLowerCase();
      if (key && !emailSet.has(key)) {
        emailSet.add(key);
        merged.push(c);
      }
    }

    // 2. Add unclaimed contacts (skip if email already in DB contacts)
    for (const c of unclaimedClients) {
      const key = c.email.toLowerCase();
      if (key && !emailSet.has(key)) {
        emailSet.add(key);
        merged.push(c);
      }
    }

    return merged;
  }, [unclaimedClients, dbContacts]);




  const FRANCHISE_OPTIONS = useMemo(() => [
    { label: 'All Locations', value: 'all' },
    ...roleFilteredFranchises.map(f => ({ label: f.name, value: f.name })),
  ], [roleFilteredFranchises]);

  const filteredClients = useMemo(() => {
    let result = [...allClients];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.franchise.toLowerCase().includes(q) ||
        c.program.toLowerCase().includes(q) ||
        c.trainer.toLowerCase().includes(q) ||
        (c.alumniReason && c.alumniReason.toLowerCase().includes(q)) ||
        (c.contactStatus && c.contactStatus.toLowerCase().includes(q))
      );
    }

    // Status filtering
    if (statusFilter !== 'all') {
      if (useFMStatuses) {
        // FM mode: filter by contactStatus
        result = result.filter(c => c.contactStatus === statusFilter);
      } else {
        // Legacy mode: filter by status
        result = result.filter(c => c.status === statusFilter);
      }
    }

    if (franchiseFilter !== 'all') {
      result = result.filter(c => c.franchise === franchiseFilter);
    }

    // Sorting
    switch (sortBy) {
      case 'newest': result.sort((a, b) => b.joinDate.localeCompare(a.joinDate)); break;
      case 'spend': result.sort((a, b) => b.monthlySpend - a.monthlySpend); break;
      case 'satisfaction': result.sort((a, b) => b.satisfaction - a.satisfaction); break;
      case 'sessions': result.sort((a, b) => b.sessionsCompleted - a.sessionsCompleted); break;
      case 'status':
        if (useFMStatuses) {
          // Sort by contact status grouping
          const statusOrder: Record<string, number> = {};
          CONTACT_STATUS_OPTIONS.forEach((s, i) => { statusOrder[s.value] = i; });
          result.sort((a, b) => {
            const aOrder = a.contactStatus ? (statusOrder[a.contactStatus] ?? 99) : 99;
            const bOrder = b.contactStatus ? (statusOrder[b.contactStatus] ?? 99) : 99;
            if (aOrder !== bOrder) return aOrder - bOrder;
            return a.name.localeCompare(b.name);
          });
        } else {
          result.sort((a, b) => a.status.localeCompare(b.status));
        }
        break;
      default:
        // Sort unclaimed clients to the top when sorting by name
        result.sort((a, b) => {
          if (a.unclaimed && !b.unclaimed) return -1;
          if (!a.unclaimed && b.unclaimed) return 1;
          return a.name.localeCompare(b.name);
        });
    }

    return result;
  }, [search, statusFilter, franchiseFilter, sortBy, allClients, useFMStatuses]);

  const filterActive = statusFilter !== 'all' || franchiseFilter !== 'all';

  // Status counts
  const statusCounts = useMemo(() => {
    if (useFMStatuses) {
      const counts: Record<string, number> = { all: allClients.length };
      CONTACT_STATUS_OPTIONS.forEach(s => {
        counts[s.value] = allClients.filter(c => c.contactStatus === s.value).length;
      });
      return counts;
    }
    return {
      all: allClients.length,
      active: allClients.filter(c => c.status === 'active').length,
      'at-risk': allClients.filter(c => c.status === 'at-risk').length,
      paused: allClients.filter(c => c.status === 'paused').length,
      new: allClients.filter(c => c.status === 'new').length,
      alumni: allClients.filter(c => c.status === 'alumni').length,
    };
  }, [allClients, useFMStatuses]);

  // Count unclaimed for informational display
  const unclaimedCount = unclaimedClients.length;

  // Helpers for active filter display
  const activeStatusLabel = useMemo(() => {
    if (statusFilter === 'all') return null;
    const opt = STATUS_OPTIONS.find(o => o.value === statusFilter);
    return opt?.label || statusFilter;
  }, [statusFilter, STATUS_OPTIONS]);

  const activeStatusColor = useFMStatuses ? FM_STATUS_COLORS[statusFilter] : null;

  const activeFranchiseLabel = useMemo(() => {
    if (franchiseFilter === 'all') return null;
    return franchiseFilter;
  }, [franchiseFilter]);

  const activeSortLabel = useMemo(() => {
    if (sortBy === 'name') return null;
    const opt = SORT_OPTIONS.find(o => o.value === sortBy);
    return opt?.label || null;
  }, [sortBy]);

  const hasActiveFilters = activeStatusLabel || activeFranchiseLabel || activeSortLabel;


  // Dynamic header title/subtitle based on role
  const headerTitle = useMemo(() => {
    if (isTrainer) return 'My Clients';
    if (isDietitian) return 'My Clients';
    if (isFranchiseManager) return 'Contacts';
    return 'Contacts';
  }, [isTrainer, isDietitian, isFranchiseManager]);

  const headerSubtitle = useMemo(() => {
    if (isTrainer || isDietitian) {
      const clientWord = allClients.length === 1 ? 'client' : 'clients';
      return `${filteredClients.length} of ${allClients.length} assigned ${clientWord}`;
    }
    return `${filteredClients.length} of ${allClients.length} contacts`;
  }, [isTrainer, isDietitian, filteredClients.length, allClients.length]);

  return (
    <View style={styles.container}>
      <Header title={headerTitle} subtitle={headerSubtitle} />

      <View style={styles.content}>

        {/* Assigned clients info banner for trainers/dietitians */}
        {(isTrainer || isDietitian) && !dbContactsLoading && (
          <View style={styles.assignedBanner}>
            <View style={styles.assignedBannerIcon}>
              <Ionicons name={isTrainer ? 'barbell-outline' : 'nutrition-outline'} size={16} color={isTrainer ? '#3498db' : '#2ecc71'} />
            </View>
            <Text style={styles.assignedBannerText}>
              Showing clients assigned to you{staffMatchNames.length > 0 ? ` (${staffMatchNames[0]})` : ''}
            </Text>
          </View>
        )}

        {/* Unclaimed accounts info banner */}
        {canSeeUnclaimed && unclaimedCount > 0 && (
          <View style={styles.unclaimedBanner}>
            <View style={styles.unclaimedBannerIcon}>
              <Ionicons name="information-circle-outline" size={16} color="#6366f1" />
            </View>
            <Text style={styles.unclaimedBannerText}>
              {unclaimedCount} contact{unclaimedCount !== 1 ? 's' : ''} haven't claimed {unclaimedCount !== 1 ? 'their accounts' : 'their account'} yet
            </Text>
          </View>
        )}


        {/* Status Quick Filters — only shown for NON-FM users */}
        {!useFMStatuses && (
          <View style={styles.statusRow}>
            {STATUS_OPTIONS.map((opt) => {
              const count = statusCounts[opt.value] || 0;
              const isActive = statusFilter === opt.value;
              const isAlumniLegacy = opt.value === 'alumni';

              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.statusChip,
                    isActive && styles.statusChipActive,
                    isAlumniLegacy && !isActive && styles.alumniChip,
                  ]}
                  onPress={() => setStatusFilter(opt.value)}
                >
                  {isAlumniLegacy && !isActive && (
                    <Ionicons name="school-outline" size={12} color="#8B5CF6" />
                  )}
                  <Text style={[
                    styles.statusChipText,
                    isActive && styles.statusChipTextActive,
                    isAlumniLegacy && !isActive && styles.alumniChipText,
                  ]}>
                    {opt.label}
                  </Text>
                  <View style={[
                    styles.countBadge,
                    isActive && styles.countBadgeActive,
                    isAlumniLegacy && !isActive && styles.alumniCountBadge,
                  ]}>
                    <Text style={[
                      styles.countText,
                      isActive && styles.countTextActive,
                      isAlumniLegacy && !isActive && styles.alumniCountText,
                    ]}>
                      {count}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Search + Filter button */}
        <View style={[styles.searchRow, useFMStatuses && { marginTop: SPACING.md }]}>
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Search contacts, programs, trainers..."
            onFilter={() => setShowFilters(!showFilters)}
            filterActive={filterActive}
          />
        </View>

        {/* Active Filter Indicator Chips (for FM — replaces the removed bubbles) */}
        {useFMStatuses && hasActiveFilters && !showFilters && (
          <View style={styles.activeFiltersRow}>
            {activeStatusLabel && (
              <View style={[styles.activeFilterChip, activeStatusColor ? { backgroundColor: activeStatusColor + '18', borderColor: activeStatusColor + '40' } : null]}>
                <View style={[styles.activeFilterDot, activeStatusColor ? { backgroundColor: activeStatusColor } : null]} />
                <Text style={[styles.activeFilterLabel, activeStatusColor ? { color: activeStatusColor } : null]}>
                  {activeStatusLabel}
                </Text>
                <Text style={[styles.activeFilterCount, activeStatusColor ? { color: activeStatusColor } : null]}>
                  ({statusCounts[statusFilter] ?? 0})
                </Text>
                <TouchableOpacity
                  onPress={() => setStatusFilter('all')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.activeFilterClose}
                >
                  <Ionicons name="close-circle" size={16} color={activeStatusColor || COLORS.textMuted} />
                </TouchableOpacity>
              </View>
            )}
            {activeFranchiseLabel && (
              <View style={styles.activeFilterChip}>
                <Ionicons name="business-outline" size={12} color={COLORS.primary} />
                <Text style={styles.activeFilterLabel}>{activeFranchiseLabel}</Text>
                <TouchableOpacity
                  onPress={() => setFranchiseFilter('all')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.activeFilterClose}
                >
                  <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>
            )}
            {activeSortLabel && (
              <View style={styles.activeFilterChip}>
                <Ionicons name="swap-vertical-outline" size={12} color={COLORS.primary} />
                <Text style={styles.activeFilterLabel}>Sort: {activeSortLabel}</Text>
                <TouchableOpacity
                  onPress={() => setSortBy('name')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.activeFilterClose}
                >
                  <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity
              onPress={() => {
                setStatusFilter('all');
                setFranchiseFilter('all');
                setSortBy('name');
              }}
              style={styles.clearAllBtn}
            >
              <Text style={styles.clearAllText}>Clear all</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* View mode toggle */}
        <View style={styles.viewToggle}>
          <TouchableOpacity
            style={[styles.viewBtn, viewMode === 'full' && styles.viewBtnActive]}
            onPress={() => setViewMode('full')}
          >
            <Text style={[styles.viewBtnText, viewMode === 'full' && styles.viewBtnTextActive]}>Detailed</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewBtn, viewMode === 'compact' && styles.viewBtnActive]}
            onPress={() => setViewMode('compact')}
          >
            <Text style={[styles.viewBtnText, viewMode === 'compact' && styles.viewBtnTextActive]}>Compact</Text>
          </TouchableOpacity>
        </View>

        {/* Filter Panel (shown when filter icon is clicked) */}
        <FilterPanel
          visible={showFilters}
          onClose={() => setShowFilters(false)}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          franchiseFilter={franchiseFilter}
          onFranchiseChange={setFranchiseFilter}
          sortBy={sortBy}
          onSortChange={setSortBy}
          statusOptions={STATUS_OPTIONS}
          franchiseOptions={FRANCHISE_OPTIONS}
          sortOptions={SORT_OPTIONS}
          statusCounts={useFMStatuses ? statusCounts : undefined}
          statusColors={useFMStatuses ? FM_STATUS_COLORS : undefined}
          statusIcons={useFMStatuses ? FM_STATUS_ICONS : undefined}
          hideFranchiseFilter={hideLocationFilter}
        />


        {(unclaimedLoading || dbContactsLoading) && allClients.length === 0 ? (
          <View style={styles.loadingUnclaimed}>
            <ActivityIndicator size="small" color={COLORS.accent} />
            <Text style={styles.loadingUnclaimedText}>Loading contacts...</Text>
          </View>
        ) : null}


        <FlatList
          data={filteredClients}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ClientCard client={item} onPress={setSelectedClient} compact={viewMode === 'compact'} />
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListFooterComponent={
            canCreateContacts ? (
              <View style={styles.listFooterActions}>
                <TouchableOpacity
                  style={styles.footerCreateBtn}
                  onPress={() => setShowCreateClient(true)}
                  activeOpacity={0.8}
                >
                  <View style={styles.footerBtnIcon}>
                    <Ionicons name="person-add" size={18} color={COLORS.white} />
                  </View>
                  <View style={styles.footerBtnTextWrap}>
                    <Text style={styles.footerBtnTitle}>Create Contact</Text>
                    <Text style={styles.footerCreateSubtitle}>Add a single contact</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.white} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.footerImportBtn}
                  onPress={() => setShowMassImport(true)}
                  activeOpacity={0.8}
                >
                  <View style={styles.footerBtnIcon}>
                    <Ionicons name="cloud-upload" size={18} color={COLORS.white} />
                  </View>
                  <View style={styles.footerBtnTextWrap}>
                    <Text style={styles.footerBtnTitle}>Mass Import</Text>
                    <Text style={styles.footerImportSubtitle}>Bulk import contacts</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.white} />
                </TouchableOpacity>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons
                name={(isTrainer || isDietitian) ? 'people-outline' : 'search-outline'}
                size={48}
                color={COLORS.borderLight}
                style={{ marginBottom: 12 }}
              />
              <Text style={styles.emptyTitle}>
                {(isTrainer || isDietitian)
                  ? 'No clients assigned yet'
                  : 'No contacts found'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {(isTrainer || isDietitian)
                  ? 'Clients will appear here once a franchise manager assigns them to you'
                  : 'Try adjusting your search or filters'}
              </Text>
              {filterActive && (
                <TouchableOpacity
                  style={styles.emptyResetBtn}
                  onPress={() => {
                    setStatusFilter('all');
                    setFranchiseFilter('all');
                    setSortBy('name');
                    setSearch('');
                  }}
                >
                  <Ionicons name="refresh-outline" size={14} color={COLORS.white} />
                  <Text style={styles.emptyResetText}>Reset Filters</Text>
                </TouchableOpacity>
              )}
            </View>
          }

        />
      </View>


      <ClientDetailModal
        client={selectedClient}
        visible={!!selectedClient}
        onClose={() => setSelectedClient(null)}
        onClientUpdated={(updatedClient) => {
          // Update the selected client immediately so the modal reflects changes
          setSelectedClient(updatedClient);
          // Refresh DB contacts list so the contacts list reflects the persisted changes
          fetchDbContacts();
          // If this was an unclaimed contact (status change creates a new DB record),
          // also refresh the unclaimed list so the old unclaimed entry disappears,
          // and close the modal since the unclaimed-xxx ID is now stale.
          if (updatedClient.unclaimed || updatedClient.id.startsWith('unclaimed-')) {
            fetchUnclaimedClients();
            // Close the modal after a brief delay so the user sees the success alert first
            setTimeout(() => {
              setSelectedClient(null);
            }, 300);
          }
        }}
        onContactDeleted={() => { setSelectedClient(null); fetchUnclaimedClients(); fetchDbContacts(); }}
      />


      <AuthModal visible={showAuthModal} onClose={() => setShowAuthModal(false)} />
      <CreateClientContactModal
        visible={showCreateClient}
        onClose={() => setShowCreateClient(false)}
        onSuccess={() => {
          fetchUnclaimedClients();
          fetchDbContacts();
        }}
        adminId={profile?.id}
      />
      <MassImportModal
        visible={showMassImport}
        onClose={() => setShowMassImport(false)}
        onSuccess={() => {
          fetchUnclaimedClients();
          fetchDbContacts();
        }}
        adminId={profile?.id}
      />

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { flex: 1, paddingHorizontal: SPACING.lg },

  // Footer action buttons (after all contacts in the list)
  listFooterActions: {
    marginTop: SPACING.lg,
    paddingBottom: SPACING.xl,
    gap: SPACING.sm,
  },
  footerCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accent,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    gap: SPACING.md,
    ...SHADOWS.md,
  },
  footerImportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    gap: SPACING.md,
    ...SHADOWS.md,
  },
  footerBtnIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerBtnTextWrap: {
    flex: 1,
  },
  footerBtnTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  footerCreateSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 1,
  },
  footerImportSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 1,
  },


  // Unclaimed accounts info banner
  unclaimedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eef2ff',
    borderWidth: 1,
    borderColor: '#c7d2fe',
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  unclaimedBannerIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#e0e7ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  unclaimedBannerText: {
    flex: 1,
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: '#4338ca',
  },
  // Assigned clients banner for trainers/dietitians
  assignedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  assignedBannerIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#e0f2fe',
    justifyContent: 'center',
    alignItems: 'center',
  },
  assignedBannerText: {
    flex: 1,
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: '#0369a1',
  },
  // Status chips (non-FM only)
  statusRow: { flexDirection: 'row', gap: SPACING.sm, paddingVertical: SPACING.md, flexWrap: 'wrap' },

  statusChip: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, gap: 4,
  },
  statusChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  statusChipText: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.textSecondary },
  statusChipTextActive: { color: COLORS.white },
  countBadge: { backgroundColor: COLORS.borderLight, borderRadius: BORDER_RADIUS.full, paddingHorizontal: 5, paddingVertical: 1, minWidth: 20, alignItems: 'center' },
  countBadgeActive: { backgroundColor: 'rgba(255,255,255,0.2)' },
  countText: { fontSize: 9, fontWeight: '700', color: COLORS.textMuted },
  countTextActive: { color: COLORS.white },
  // Alumni chip styles
  alumniChip: { backgroundColor: '#faf5ff', borderColor: '#ddd6fe' },
  alumniChipText: { color: '#8B5CF6' },
  alumniCountBadge: { backgroundColor: '#ede9fe' },
  alumniCountText: { color: '#6D28D9' },

  // Active filter indicator chips (FM mode)
  activeFiltersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  activeFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.primaryLight + '12',
    borderWidth: 1,
    borderColor: COLORS.primary + '25',
    borderRadius: BORDER_RADIUS.full,
    paddingLeft: SPACING.sm,
    paddingRight: 4,
    paddingVertical: 4,
  },
  activeFilterDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  activeFilterLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.primary,
  },
  activeFilterCount: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.primary,
  },
  activeFilterClose: {
    padding: 2,
  },
  clearAllBtn: {
    paddingVertical: 4,
    paddingHorizontal: SPACING.sm,
  },
  clearAllText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.accent,
    textDecorationLine: 'underline',
  },

  searchRow: { marginBottom: SPACING.sm },
  viewToggle: {
    flexDirection: 'row', backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.sm,
    padding: 2, marginBottom: SPACING.md, ...SHADOWS.sm,
  },
  viewBtn: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: BORDER_RADIUS.sm },
  viewBtnActive: { backgroundColor: COLORS.primary },
  viewBtnText: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.textSecondary },
  viewBtnTextActive: { color: COLORS.white },
  listContent: { paddingBottom: 20 },
  loadingUnclaimed: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  loadingUnclaimedText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
  },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.primary, marginBottom: 4 },
  emptySubtitle: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted, marginBottom: SPACING.lg },
  emptyResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.accent,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
  },
  emptyResetText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.white,
  },
});
