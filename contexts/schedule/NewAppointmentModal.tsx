import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity,
  TextInput, Alert, KeyboardAvoidingView, Platform, ActivityIndicator, Linking,
} from 'react-native';

import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';

import {
  Appointment, appointmentTypes, AppointmentType,
  getAppointmentTypesForProgram, getAppointmentTypesWithPartner, addMinutesToTime,
  formatTimeDisplay, hasTimeConflict, TIME_SLOTS_15, formatDateKey,
  getProgramDefinition, getProgramColor, getWeeklySessionBalance, getWeekDates,
  RecurrencePattern,
} from '../../data/scheduleData';
import { Trainer, Dietitian, Client } from '../../data/mockData';
import RecurrenceEditor from './RecurrenceEditor';
import {
  detectExternalConflicts, formatExternalEventTime, getExternalEvents,
  type ExternalCalendarEvent, type CalendarConflict,
} from '../../lib/calendarSyncService';
import { fetchPartnerGroup, type PartnerGroupData, type PartnerGroupMember } from '../../lib/partnerGroupService';


interface NewAppointmentModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (appointment: Omit<Appointment, 'id'>, recurrencePattern?: RecurrencePattern) => void;
  existingAppointments: Appointment[];
  preselectedDate?: string;
  preselectedCoachId?: string;
  filteredTrainers: Trainer[];
  filteredDietitians: Dietitian[];
  filteredClients: Client[];
  userRole?: string;
  userCoachName?: string;
  userId?: string;
  userFranchise?: string;
  externalEvents?: ExternalCalendarEvent[];
  externalConnections?: { id: string; provider: string; calendarName: string }[];
}

type Step = 'coach' | 'client' | 'type' | 'time' | 'recurrence' | 'confirm';

export default function NewAppointmentModal({
  visible, onClose, onSave, existingAppointments,
  preselectedDate, preselectedCoachId,
  filteredTrainers, filteredDietitians, filteredClients,
  userRole, userCoachName, userId, userFranchise,
  externalEvents: propExternalEvents, externalConnections: propExternalConnections,
}: NewAppointmentModalProps) {

  const [step, setStep] = useState<Step>('coach');
  const [selectedCoachId, setSelectedCoachId] = useState<string>('');
  const [selectedCoachType, setSelectedCoachType] = useState<'trainer' | 'dietitian'>('trainer');
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [selectedTypeId, setSelectedTypeId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(preselectedDate || formatDateKey(new Date()));
  const [selectedTime, setSelectedTime] = useState<string>('09:00');
  const [notes, setNotes] = useState('');
  const [coachSearch, setCoachSearch] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePattern>({ type: 'none', endDate: '' });

  // Partner group state
  const [partnerGroupData, setPartnerGroupData] = useState<PartnerGroupData | null>(null);
  const [loadingPartnerGroup, setLoadingPartnerGroup] = useState(false);
  const [includePartners, setIncludePartners] = useState(true);

  // Video call state
  const [videoCallEnabled, setVideoCallEnabled] = useState(false);
  const [videoCallLink, setVideoCallLink] = useState('');
  const [videoPlatform, setVideoPlatform] = useState<'jitsi' | 'facetime' | 'google-meet' | 'whatsapp' | 'zoom'>('jitsi');
  const [showPlatformDropdown, setShowPlatformDropdown] = useState(false);
  const [customLinkInput, setCustomLinkInput] = useState('');

  // Platform definitions
  const VIDEO_PLATFORMS = [
    {
      id: 'facetime' as const,
      name: 'Apple FaceTime',
      subtitle: 'iOS & macOS only',
      color: '#34C759',
      iconName: 'apple' as const,
      iconLib: 'material' as const,
      placeholder: 'facetime://+15551234567',
      prefix: 'facetime://',
    },
    {
      id: 'google-meet' as const,
      name: 'Google Meet',
      subtitle: 'Works everywhere',
      color: '#00897B',
      iconName: 'google' as const,
      iconLib: 'material' as const,
      placeholder: 'https://meet.google.com/abc-defg-hij',
      prefix: 'https://meet.google.com/',
    },
    {
      id: 'whatsapp' as const,
      name: 'WhatsApp Video',
      subtitle: 'Phone number required',
      color: '#25D366',
      iconName: 'whatsapp' as const,
      iconLib: 'fontawesome' as const,
      placeholder: 'https://wa.me/15551234567',
      prefix: 'https://wa.me/',
    },
    {
      id: 'zoom' as const,
      name: 'Zoom Video',
      subtitle: 'Professional meetings',
      color: '#2D8CFF',
      iconName: 'video-outline' as const,
      iconLib: 'material' as const,
      placeholder: 'https://zoom.us/j/1234567890',
      prefix: 'https://zoom.us/',
    },
  ];

  // Helper to get current platform info
  const currentPlatformInfo = videoPlatform === 'jitsi'
    ? { name: 'Jitsi Meet', color: '#FF6B35', subtitle: 'No account needed' }
    : VIDEO_PLATFORMS.find(p => p.id === videoPlatform) || { name: 'Jitsi Meet', color: '#FF6B35', subtitle: '' };

  // Generate Jitsi link
  const generateJitsiLink = () => {
    const adjectives = ['Healthy', 'Vibrant', 'Strong', 'Balanced', 'Focused', 'Energized', 'Thriving', 'Radiant'];
    const nouns = ['Nutrition', 'Wellness', 'Coaching', 'Session', 'Consult', 'Review', 'Checkup', 'Meetup'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(1000 + Math.random() * 9000);
    return `https://meet.jit.si/${adj}${noun}${num}`;
  };

  // Handle platform selection from the "Use Other Platform" dropdown
  const handlePlatformSelect = (platformId: typeof videoPlatform) => {
    setVideoPlatform(platformId);
    setShowPlatformDropdown(false);
    setCustomLinkInput('');
    // Auto-enable video call when a platform is selected
    setVideoCallEnabled(true);
    if (platformId === 'jitsi') {
      setVideoCallLink(generateJitsiLink());
    } else {
      // Clear the link so user can enter their own
      setVideoCallLink('');
    }
  };

  // Handle custom link confirmation
  const handleCustomLinkConfirm = () => {
    if (customLinkInput.trim()) {
      setVideoCallLink(customLinkInput.trim());
    }
  };




  // External calendar state
  const [externalEvents, setExternalEvents] = useState<ExternalCalendarEvent[]>(propExternalEvents || []);
  const [externalConnections, setExternalConnections] = useState<{ id: string; provider: string; calendarName: string }[]>(propExternalConnections || []);
  const [loadingExternal, setLoadingExternal] = useState(false);

  // Determine if the logged-in user is a coach (trainer or dietitian)
  const isCoachUser = userRole === 'trainer' || userRole === 'dietitian';

  // ── Fetch partner group when client is selected ──
  const loadPartnerGroup = useCallback(async (clientId: string) => {
    if (!clientId) {
      setPartnerGroupData(null);
      return;
    }
    setLoadingPartnerGroup(true);
    try {
      const data = await fetchPartnerGroup(clientId);
      setPartnerGroupData(data);
      // Auto-enable include partners when a partner group exists
      if (data.group && data.members.length >= 2) {
        setIncludePartners(true);
      }
    } catch (err) {
      console.log('Error loading partner group:', err);
      setPartnerGroupData(null);
    } finally {
      setLoadingPartnerGroup(false);
    }
  }, []);

  // Derived: does the selected client have a partner group?
  const hasPartnerGroup = !!(partnerGroupData?.group && partnerGroupData.members.length >= 2);
  const partnerMembers = useMemo(() => {
    if (!partnerGroupData?.members || !selectedClientId) return [];
    return partnerGroupData.members.filter(m => m.user_id !== selectedClientId);
  }, [partnerGroupData, selectedClientId]);

  useEffect(() => {
    if (visible) {
      if (isCoachUser && userCoachName && userId) {
        setSelectedCoachId(userId);
        setSelectedCoachType(userRole === 'dietitian' ? 'dietitian' : 'trainer');
        setStep('client');
      } else if (preselectedCoachId) {
        const trainer = filteredTrainers.find(t => t.id === preselectedCoachId);
        const dietitian = filteredDietitians.find(d => d.id === preselectedCoachId);
        if (trainer) {
          setSelectedCoachId(trainer.id);
          setSelectedCoachType('trainer');
          setStep('client');
        } else if (dietitian) {
          setSelectedCoachId(dietitian.id);
          setSelectedCoachType('dietitian');
          setStep('client');
        } else {
          setStep('coach');
        }
      } else {
        setStep('coach');
      }
      if (preselectedDate) setSelectedDate(preselectedDate);
      setSelectedClientId('');
      setSelectedTypeId('');
      setSelectedTime('09:00');
      setNotes('');
      setCoachSearch('');
      setClientSearch('');
      setRecurrencePattern({ type: 'none', endDate: '' });
      setVideoCallEnabled(false);
      setVideoCallLink('');
      setVideoPlatform('jitsi');
      setShowPlatformDropdown(false);
      setCustomLinkInput('');
      setPartnerGroupData(null);
      setLoadingPartnerGroup(false);
      setIncludePartners(true);

    }
  }, [visible]);


  // Load external events when modal opens (if not passed as props)
  useEffect(() => {
    if (visible && !propExternalEvents) {
      loadExternalCalendarEvents();
    } else if (propExternalEvents) {
      setExternalEvents(propExternalEvents);
    }
    if (propExternalConnections) {
      setExternalConnections(propExternalConnections);
    }
  }, [visible, propExternalEvents, propExternalConnections]);

  const loadExternalCalendarEvents = async () => {
    setLoadingExternal(true);
    try {
      const now = new Date();
      const dateFrom = formatDateKey(now);
      const future = new Date(now);
      future.setDate(future.getDate() + 60);
      const dateTo = formatDateKey(future);

      const { events, connections, error } = await getExternalEvents(dateFrom, dateTo);
      if (!error) {
        setExternalEvents(events);
        setExternalConnections(connections);
      }
    } catch (err) {
      console.log('Error loading external events:', err);
    } finally {
      setLoadingExternal(false);
    }
  };

  const activeTrainers = useMemo(() => filteredTrainers.filter(t => t.status === 'active'), [filteredTrainers]);
  const activeDietitians = useMemo(() => filteredDietitians.filter(d => d.status === 'active'), [filteredDietitians]);

  const allCoaches = useMemo(() => {
    const items: { id: string; name: string; type: 'trainer' | 'dietitian'; franchise: string; specialties: string[] }[] = [];
    activeTrainers.forEach(t => items.push({ id: t.id, name: t.name, type: 'trainer', franchise: t.franchise, specialties: t.specialties }));
    activeDietitians.forEach(d => items.push({ id: d.id, name: d.name, type: 'dietitian', franchise: d.franchise, specialties: d.specialties }));

    if (isCoachUser && userId && userCoachName) {
      const alreadyPresent = items.some(c => c.id === userId);
      if (!alreadyPresent) {
        items.push({
          id: userId,
          name: userCoachName,
          type: (userRole === 'dietitian' ? 'dietitian' : 'trainer') as 'trainer' | 'dietitian',
          franchise: userFranchise || '',
          specialties: [],
        });
      }
    }

    return items;
  }, [activeTrainers, activeDietitians, isCoachUser, userId, userCoachName, userRole, userFranchise]);

  const filteredCoachList = useMemo(() => {
    if (!coachSearch) return allCoaches;
    const q = coachSearch.toLowerCase();
    return allCoaches.filter(c => c.name.toLowerCase().includes(q) || c.franchise.toLowerCase().includes(q) || c.type.includes(q));
  }, [allCoaches, coachSearch]);

  const selectedCoach = useMemo(() => allCoaches.find(c => c.id === selectedCoachId) || null, [selectedCoachId, allCoaches]);


  const availableClients = useMemo(() => {
    if (!selectedCoach) return filteredClients.filter(c => c.status === 'active' || c.status === 'new');
    const active = filteredClients.filter(c => c.status === 'active' || c.status === 'new');
    const coachName = selectedCoach.name;
    const assigned = active.filter(c => selectedCoach.type === 'trainer' ? c.trainer === coachName : c.dietitian === coachName);
    const unassigned = active.filter(c => selectedCoach.type === 'trainer' ? c.trainer !== coachName : c.dietitian !== coachName);
    return [...assigned, ...unassigned];
  }, [selectedCoach, filteredClients]);

  const filteredClientList = useMemo(() => {
    if (!clientSearch) return availableClients;
    const q = clientSearch.toLowerCase();
    return availableClients.filter(c => c.name.toLowerCase().includes(q) || c.program.toLowerCase().includes(q));
  }, [availableClients, clientSearch]);

  const selectedClient = useMemo(() => filteredClients.find(c => c.id === selectedClientId) || null, [selectedClientId, filteredClients]);

  const availableTypes = useMemo(() => {
    if (!selectedClient) return appointmentTypes;
    // Use partner-aware type list when partner group data is loaded
    return getAppointmentTypesWithPartner(selectedClient.program, hasPartnerGroup);
  }, [selectedClient, hasPartnerGroup]);


  const selectedType = useMemo(() => appointmentTypes.find(t => t.id === selectedTypeId) || null, [selectedTypeId]);

  const endTime = useMemo(() => {
    if (!selectedType) return selectedTime;
    return addMinutesToTime(selectedTime, selectedType.defaultDuration);
  }, [selectedTime, selectedType]);

  const conflict = useMemo(() => {
    if (!selectedCoachId || !selectedDate || !selectedTime || !selectedType) return false;
    return hasTimeConflict(existingAppointments, selectedCoachId, selectedDate, selectedTime, endTime, undefined, selectedType.id);
  }, [existingAppointments, selectedCoachId, selectedDate, selectedTime, endTime, selectedType]);


  // External calendar conflict detection
  const externalConflicts = useMemo((): CalendarConflict[] => {
    if (!selectedDate || !selectedTime || !selectedType || externalEvents.length === 0) return [];
    return detectExternalConflicts(externalEvents, selectedDate, selectedTime, endTime, externalConnections);
  }, [externalEvents, externalConnections, selectedDate, selectedTime, endTime, selectedType]);

  const hasExternalConflict = externalConflicts.length > 0;

  const sessionBalance = useMemo(() => {
    if (!selectedClient) return null;
    const weekDates = getWeekDates(new Date(selectedDate + 'T12:00:00'));
    return getWeeklySessionBalance(selectedClient.id, existingAppointments, weekDates);
  }, [selectedClient, existingAppointments, selectedDate]);

  const isRecurring = recurrencePattern.type !== 'none';

  const handleSave = () => {
    if (!selectedCoach || !selectedClient || !selectedType) return;
    if (conflict && !isRecurring) {
      Alert.alert('Time Conflict', 'This coach already has an appointment at this time.');
      return;
    }

    // Warn about external calendar conflicts but allow override
    if (hasExternalConflict && !isRecurring) {
      const conflictNames = externalConflicts.map(c => `"${c.externalEvent.title}" (${c.calendarName})`).join(', ');
      Alert.alert(
        'External Calendar Conflict',
        `This time overlaps with: ${conflictNames}. Schedule anyway?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Schedule Anyway', onPress: doSaveWithSessionCheck },
        ]
      );
      return;
    }

    doSaveWithSessionCheck();
  };

  const doSaveWithSessionCheck = () => {
    if (!selectedCoach || !selectedClient || !selectedType) return;
    if (selectedType.countsAsSession && sessionBalance && sessionBalance.sessionsRemaining <= 0 && !isRecurring) {
      Alert.alert(
        'Session Limit Reached',
        `${selectedClient.name} has used all ${sessionBalance.sessionsAllowed} training sessions for this week on their ${selectedClient.program} plan. Schedule anyway?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Schedule Anyway', onPress: doSave },
        ]
      );
      return;
    }
    doSave();
  };

  const doSave = () => {
    if (!selectedCoach || !selectedClient || !selectedType) return;
    const isPartnerTraining = selectedType.id === 'partner-training' && hasPartnerGroup && includePartners;
    const apptData: Omit<Appointment, 'id'> = {
      coachId: selectedCoach.id,
      coachName: selectedCoach.name,
      coachType: selectedCoach.type,
      clientId: selectedClient.id,
      clientName: selectedClient.name,
      clientProgram: selectedClient.program,
      appointmentTypeId: selectedType.id,
      date: selectedDate,
      startTime: selectedTime,
      endTime,
      duration: selectedType.defaultDuration,
      status: 'scheduled',
      notes: notes.trim(),
      franchise: selectedCoach.franchise,
    };
    if (videoCallEnabled && videoCallLink) {
      apptData.videoCallLink = videoCallLink;
    }
    // Attach partner group data for partner-training sessions
    if (isPartnerTraining && partnerGroupData?.group) {
      apptData.partnerGroupId = partnerGroupData.group.id;
      // Set the first partner as secondClient for the appointment
      if (partnerMembers.length > 0) {
        apptData.secondClientId = partnerMembers[0].user_id;
        apptData.secondClientName = partnerMembers[0].full_name;
      }
      apptData.partnerClientNames = partnerMembers.map(m => m.full_name);
    }
    onSave(apptData, isRecurring ? recurrencePattern : undefined);
  };



  const canProceed = (): boolean => {
    switch (step) {
      case 'coach': return !!selectedCoachId;
      case 'client': return !!selectedClientId;
      case 'type': return !!selectedTypeId;
      case 'time': return !!selectedTime && !conflict;
      case 'recurrence': return true;
      case 'confirm': return true;
      default: return false;
    }
  };

  const steps: Step[] = isCoachUser
    ? ['client', 'type', 'time', 'recurrence', 'confirm']
    : ['coach', 'client', 'type', 'time', 'recurrence', 'confirm'];
  const stepLabels = isCoachUser
    ? ['Client', 'Type', 'Time', 'Repeat', 'Confirm']
    : ['Coach', 'Client', 'Type', 'Time', 'Repeat', 'Confirm'];
  const stepIndex = steps.indexOf(step);
  const nextStep = () => { if (stepIndex < steps.length - 1) setStep(steps[stepIndex + 1]); };
  const prevStep = () => { if (stepIndex > 0) setStep(steps[stepIndex - 1]); };

  const adjustDate = (days: number) => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + days);
    setSelectedDate(formatDateKey(d));
  };

  const formatDisplayDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  // Provider icon helper
  const getProviderIcon = (provider: string): string => {
    switch (provider) {
      case 'google': return 'logo-google';
      case 'apple': return 'logo-apple';
      case 'outlook': return 'mail';
      default: return 'calendar';
    }
  };

  const getProviderColor = (provider: string): string => {
    switch (provider) {
      case 'google': return '#4285F4';
      case 'apple': return '#333333';
      case 'outlook': return '#0078D4';
      default: return COLORS.textMuted;
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New Appointment</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Coach banner for trainer/dietitian users */}
        {isCoachUser && selectedCoach && (
          <View style={styles.coachBanner}>
            <View style={[styles.coachBannerIcon, { backgroundColor: selectedCoach.type === 'trainer' ? COLORS.accent + '18' : '#9b59b618' }]}>
              <Ionicons name={selectedCoach.type === 'trainer' ? 'fitness' : 'nutrition'} size={14} color={selectedCoach.type === 'trainer' ? COLORS.accent : '#9b59b6'} />
            </View>
            <Text style={styles.coachBannerText}>Scheduling as <Text style={{ fontWeight: '800' }}>{selectedCoach.name}</Text></Text>
          </View>
        )}

        <View style={styles.stepRow}>
          {stepLabels.map((label, i) => (
            <View key={label} style={styles.stepItem}>
              <View style={[styles.stepDot, i <= stepIndex && styles.stepDotActive, i < stepIndex && styles.stepDotDone]}>
                {i < stepIndex ? (
                  <Ionicons name="checkmark" size={12} color={COLORS.white} />
                ) : (
                  <Text style={[styles.stepNum, i <= stepIndex && styles.stepNumActive]}>{i + 1}</Text>
                )}
              </View>
              <Text style={[styles.stepLabel, i <= stepIndex && styles.stepLabelActive]}>{label}</Text>
            </View>
          ))}
        </View>

        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Step 1: Coach */}
          {step === 'coach' && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Select a Coach</Text>
              <View style={styles.searchWrap}>
                <Ionicons name="search" size={16} color={COLORS.textMuted} />
                <TextInput style={styles.searchInput} value={coachSearch} onChangeText={setCoachSearch} placeholder="Search coaches..." placeholderTextColor={COLORS.textMuted} />
              </View>
              {filteredCoachList.map(coach => (
                <TouchableOpacity key={coach.id} style={[styles.selectCard, selectedCoachId === coach.id && styles.selectCardActive]} onPress={() => { setSelectedCoachId(coach.id); setSelectedCoachType(coach.type); }}>
                  <View style={[styles.coachIcon, { backgroundColor: coach.type === 'trainer' ? COLORS.accent + '18' : '#9b59b618' }]}>
                    <Ionicons name={coach.type === 'trainer' ? 'fitness' : 'nutrition'} size={18} color={coach.type === 'trainer' ? COLORS.accent : '#9b59b6'} />
                  </View>
                  <View style={styles.selectCardInfo}>
                    <Text style={styles.selectCardName}>{coach.name}</Text>
                    <Text style={styles.selectCardSub}>{coach.type === 'trainer' ? 'Trainer' : 'Dietitian'} · {coach.franchise}</Text>
                  </View>
                  {selectedCoachId === coach.id && <Ionicons name="checkmark-circle" size={22} color={COLORS.accent} />}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Step 2: Client */}
          {step === 'client' && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Select a Client</Text>
              <View style={styles.searchWrap}>
                <Ionicons name="search" size={16} color={COLORS.textMuted} />
                <TextInput style={styles.searchInput} value={clientSearch} onChangeText={setClientSearch} placeholder="Search clients..." placeholderTextColor={COLORS.textMuted} />
              </View>
              {filteredClientList.slice(0, 20).map(client => {
                const isAssigned = selectedCoach && (selectedCoach.type === 'trainer' ? client.trainer === selectedCoach.name : client.dietitian === selectedCoach.name);
                const progDef = getProgramDefinition(client.program);
                const progColor = getProgramColor(client.program);
                return (
                  <TouchableOpacity key={client.id} style={[styles.selectCard, selectedClientId === client.id && styles.selectCardActive]} onPress={() => { setSelectedClientId(client.id); setSelectedTypeId(''); loadPartnerGroup(client.id); }}>
                    <View style={[styles.coachIcon, { backgroundColor: progColor + '18' }]}>
                      <Ionicons name="person" size={18} color={progColor} />
                    </View>
                    <View style={styles.selectCardInfo}>
                      <View style={styles.clientNameRow}>
                        <Text style={styles.selectCardName}>{client.name}</Text>
                        {isAssigned && <View style={styles.assignedBadge}><Text style={styles.assignedText}>Assigned</Text></View>}
                      </View>
                      <Text style={styles.selectCardSub}>{client.program} · ${progDef?.monthlyCost.toLocaleString()}/mo</Text>
                    </View>
                    {selectedClientId === client.id && <Ionicons name="checkmark-circle" size={22} color={COLORS.accent} />}
                  </TouchableOpacity>
                );

              })}
            </View>
          )}

          {/* Step 3: Appointment Type */}
          {step === 'type' && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Appointment Type</Text>
              {selectedClient && (
                <Text style={styles.stepSubtitle}>
                  Available for {selectedClient.program}
                </Text>
              )}
              {sessionBalance && (
                <View style={[styles.balanceCard, { borderColor: getProgramColor(sessionBalance.program) + '30' }]}>
                  <Ionicons name="ticket" size={14} color={getProgramColor(sessionBalance.program)} />
                  <Text style={styles.balanceText}>
                    <Text style={{ fontWeight: '800' }}>{sessionBalance.sessionsRemaining}</Text> of {sessionBalance.sessionsAllowed} training sessions remaining this week
                  </Text>
                </View>
              )}
              {availableTypes.map(type => (
                <TouchableOpacity key={type.id} style={[styles.typeCard, selectedTypeId === type.id && { borderColor: type.color, borderWidth: 2 }]} onPress={() => setSelectedTypeId(type.id)}>
                  <View style={[styles.typeIcon, { backgroundColor: type.color + '18' }]}>
                    <Ionicons name={type.icon as any} size={20} color={type.color} />
                  </View>
                  <View style={styles.typeInfo}>
                    <Text style={styles.typeName}>{type.name}</Text>
                    <Text style={styles.typeMeta}>{type.defaultDuration} min · {type.category}{type.countsAsSession ? ' · Redeems session' : ''}</Text>
                  </View>
                  {selectedTypeId === type.id && <Ionicons name="checkmark-circle" size={22} color={type.color} />}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Step 4: Date & Time */}
          {step === 'time' && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Date & Time</Text>
              <View style={styles.dateSelector}>
                <TouchableOpacity onPress={() => adjustDate(-1)} style={styles.dateArrow}>
                  <Ionicons name="chevron-back" size={20} color={COLORS.primary} />
                </TouchableOpacity>
                <Text style={styles.dateDisplay}>{formatDisplayDate(selectedDate)}</Text>
                <TouchableOpacity onPress={() => adjustDate(1)} style={styles.dateArrow}>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.primary} />
                </TouchableOpacity>
              </View>

              {/* External Calendar Conflict Warning */}
              {hasExternalConflict && (
                <View style={styles.externalConflictBanner}>
                  <View style={styles.externalConflictHeader}>
                    <Ionicons name="alert-circle" size={18} color="#e67e22" />
                    <Text style={styles.externalConflictTitle}>External Calendar Conflict</Text>
                  </View>
                  {externalConflicts.map((c, idx) => (
                    <View key={idx} style={styles.externalConflictItem}>
                      <Ionicons name={getProviderIcon(c.provider) as any} size={14} color={getProviderColor(c.provider)} />
                      <View style={styles.externalConflictInfo}>
                        <Text style={styles.externalConflictName} numberOfLines={1}>{c.externalEvent.title}</Text>
                        <Text style={styles.externalConflictTime}>
                          {formatExternalEventTime(c.externalEvent)} · {c.overlapMinutes}min overlap
                        </Text>
                      </View>
                      <View style={[styles.externalConflictBadge, { backgroundColor: getProviderColor(c.provider) + '15' }]}>
                        <Text style={[styles.externalConflictBadgeText, { color: getProviderColor(c.provider) }]}>{c.calendarName}</Text>
                      </View>
                    </View>
                  ))}
                  <Text style={styles.externalConflictHint}>
                    You can still schedule this appointment, but it overlaps with events in your external calendar.
                  </Text>
                </View>
              )}

              {/* External calendar sync indicator */}
              {externalConnections.length > 0 && !hasExternalConflict && selectedType && (
                <View style={styles.calendarSyncIndicator}>
                  <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
                  <Text style={styles.calendarSyncText}>
                    No conflicts with {externalConnections.length} connected calendar{externalConnections.length !== 1 ? 's' : ''}
                  </Text>
                </View>
              )}

              {loadingExternal && (
                <View style={styles.calendarSyncIndicator}>
                  <ActivityIndicator size="small" color={COLORS.accent} />
                  <Text style={styles.calendarSyncText}>Checking external calendars...</Text>
                </View>
              )}

              <Text style={styles.timeLabel}>Select Start Time (15-min increments)</Text>
              <View style={styles.timeGrid}>
                {TIME_SLOTS_15.map(slot => {
                  const isSelected = selectedTime === slot;
                  const wouldConflict = selectedType && hasTimeConflict(existingAppointments, selectedCoachId, selectedDate, slot, addMinutesToTime(slot, selectedType.defaultDuration), undefined, selectedType.id);

                  // Check external conflict for this slot
                  const slotEndTime = selectedType ? addMinutesToTime(slot, selectedType.defaultDuration) : slot;
                  const slotExternalConflicts = selectedType && externalEvents.length > 0
                    ? detectExternalConflicts(externalEvents, selectedDate, slot, slotEndTime, externalConnections)
                    : [];
                  const hasSlotExternalConflict = slotExternalConflicts.length > 0;

                  return (
                    <TouchableOpacity
                      key={slot}
                      style={[
                        styles.timeSlot,
                        isSelected && styles.timeSlotActive,
                        wouldConflict && styles.timeSlotConflict,
                        hasSlotExternalConflict && !wouldConflict && !isSelected && styles.timeSlotExternalConflict,
                      ]}
                      onPress={() => !wouldConflict && setSelectedTime(slot)}
                      disabled={!!wouldConflict}
                    >
                      <Text style={[
                        styles.timeSlotText,
                        isSelected && styles.timeSlotTextActive,
                        wouldConflict && styles.timeSlotTextConflict,
                        hasSlotExternalConflict && !wouldConflict && !isSelected && styles.timeSlotTextExternalConflict,
                      ]}>
                        {formatTimeDisplay(slot)}
                      </Text>
                      {hasSlotExternalConflict && !wouldConflict && (
                        <View style={styles.externalDot} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>


              {conflict && (
                <View style={styles.conflictBanner}>
                  <Ionicons name="warning" size={16} color={COLORS.danger} />
                  <Text style={styles.conflictText}>Time conflict with existing appointment</Text>
                </View>
              )}

              {selectedType && (
                <View style={styles.timeSummary}>
                  <Text style={styles.timeSummaryText}>
                    {formatTimeDisplay(selectedTime)} - {formatTimeDisplay(endTime)} ({selectedType.defaultDuration} min)
                  </Text>
                </View>
              )}

              <Text style={[styles.timeLabel, { marginTop: SPACING.lg }]}>Notes (optional)</Text>
              <TextInput style={styles.notesInput} value={notes} onChangeText={setNotes} placeholder="Add any notes..." placeholderTextColor={COLORS.textMuted} multiline numberOfLines={3} />

              {/* ═══════════════════════════════════════════════════════ */}
              {/* ── BUBBLE 1: Jitsi Video Call Toggle ── */}
              {/* ═══════════════════════════════════════════════════════ */}
              <Text style={[styles.timeLabel, { marginTop: SPACING.lg }]}>Video Call</Text>
              <TouchableOpacity
                style={[
                  styles.videoCallToggle,
                  videoCallEnabled && videoPlatform === 'jitsi' && { borderColor: '#FF6B35' + '40', backgroundColor: '#FF6B35' + '06' },
                  videoCallEnabled && videoPlatform !== 'jitsi' && { borderColor: currentPlatformInfo.color + '40', backgroundColor: currentPlatformInfo.color + '06' },
                ]}
                onPress={() => {
                  const newEnabled = !videoCallEnabled;
                  setVideoCallEnabled(newEnabled);
                  if (newEnabled && videoPlatform === 'jitsi') {
                    setVideoCallLink(generateJitsiLink());
                  }
                  if (!newEnabled) {
                    setVideoCallLink('');
                    setVideoPlatform('jitsi');
                    setShowPlatformDropdown(false);
                    setCustomLinkInput('');
                  }
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.videoCallToggleIcon, videoCallEnabled && { backgroundColor: currentPlatformInfo.color }]}>
                  <Ionicons name="videocam" size={20} color={videoCallEnabled ? COLORS.white : '#FF6B35'} />
                </View>
                <View style={styles.videoCallToggleContent}>
                  <Text style={[styles.videoCallToggleTitle, videoCallEnabled && { color: currentPlatformInfo.color }]}>
                    {videoCallEnabled ? `Video Call Enabled` : 'Add Video Call'}
                  </Text>
                  <Text style={styles.videoCallToggleSub}>
                    {videoCallEnabled
                      ? `Using ${currentPlatformInfo.name}${videoPlatform === 'jitsi' ? ' (auto-generated)' : ''}`
                      : 'Attach a Jitsi Meet link to this appointment'}
                  </Text>
                </View>
                <View style={[styles.videoCallCheckbox, videoCallEnabled && { backgroundColor: currentPlatformInfo.color, borderColor: currentPlatformInfo.color }]}>
                  {videoCallEnabled && <Ionicons name="checkmark" size={14} color={COLORS.white} />}
                </View>
              </TouchableOpacity>

              {/* Jitsi Link Preview (when Jitsi is selected and enabled) */}
              {videoCallEnabled && videoPlatform === 'jitsi' && videoCallLink ? (
                <View style={styles.videoCallLinkPreview}>
                  <Ionicons name="link-outline" size={14} color="#FF6B35" />
                  <Text style={styles.videoCallLinkText} numberOfLines={1}>{videoCallLink.replace('https://', '')}</Text>
                  <View style={styles.videoCallJitsiBadge}>
                    <Ionicons name="star" size={8} color={COLORS.white} />
                    <Text style={styles.videoCallJitsiBadgeText}>Jitsi</Text>
                  </View>
                </View>
              ) : null}

              {/* Other Platform Link Preview (when non-Jitsi is selected and has a link) */}
              {videoCallEnabled && videoPlatform !== 'jitsi' && videoCallLink ? (
                <View style={[styles.videoCallLinkPreview, { backgroundColor: currentPlatformInfo.color + '08', borderColor: currentPlatformInfo.color + '20' }]}>
                  <Ionicons name="link-outline" size={14} color={currentPlatformInfo.color} />
                  <Text style={[styles.videoCallLinkText, { color: currentPlatformInfo.color }]} numberOfLines={1}>{videoCallLink.replace('https://', '').replace('facetime://', '')}</Text>
                  <View style={[styles.videoCallJitsiBadge, { backgroundColor: currentPlatformInfo.color }]}>
                    <Text style={styles.videoCallJitsiBadgeText}>{currentPlatformInfo.name.split(' ')[0]}</Text>
                  </View>
                </View>
              ) : null}

              {/* Custom Link Input (when non-Jitsi platform is selected but no link yet) */}
              {videoCallEnabled && videoPlatform !== 'jitsi' && !videoCallLink ? (
                <View style={[styles.otherPlatformInputCard, { borderColor: currentPlatformInfo.color + '30' }]}>
                  <Text style={[styles.otherPlatformInputLabel, { color: currentPlatformInfo.color }]}>
                    Paste your {currentPlatformInfo.name} link
                  </Text>
                  <View style={styles.otherPlatformInputRow}>
                    <TextInput
                      style={[styles.otherPlatformInput, { borderColor: currentPlatformInfo.color + '30' }]}
                      placeholder={VIDEO_PLATFORMS.find(p => p.id === videoPlatform)?.placeholder || 'Paste link here...'}
                      placeholderTextColor={COLORS.textMuted}
                      value={customLinkInput}
                      onChangeText={setCustomLinkInput}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                    />
                    <TouchableOpacity
                      style={[styles.otherPlatformInputBtn, { backgroundColor: customLinkInput.trim() ? currentPlatformInfo.color : COLORS.borderLight }]}
                      onPress={handleCustomLinkConfirm}
                      disabled={!customLinkInput.trim()}
                    >
                      <Ionicons name="checkmark" size={18} color={COLORS.white} />
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              {/* ═══════════════════════════════════════════════════════ */}
              {/* ── BUBBLE 2: Use Other Platform (ALWAYS visible) ── */}
              {/* ═══════════════════════════════════════════════════════ */}
              <View style={styles.otherPlatformContainer}>
                <TouchableOpacity
                  style={[
                    styles.otherPlatformToggle,
                    showPlatformDropdown && { borderColor: COLORS.accent + '40', backgroundColor: COLORS.accent + '04' },
                  ]}
                  onPress={() => setShowPlatformDropdown(!showPlatformDropdown)}
                  activeOpacity={0.7}
                >
                  <View style={styles.otherPlatformToggleLeft}>
                    <View style={styles.otherPlatformToggleIconBg}>
                      <Ionicons name="swap-horizontal" size={16} color={COLORS.accent} />
                    </View>
                    <View>
                      <Text style={styles.otherPlatformToggleText}>Use Other Platform</Text>
                      <Text style={styles.otherPlatformToggleSub}>FaceTime, Google Meet, WhatsApp, Zoom</Text>
                    </View>
                  </View>
                  <Ionicons
                    name={showPlatformDropdown ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={COLORS.textMuted}
                  />
                </TouchableOpacity>

                {showPlatformDropdown && (
                  <View style={styles.otherPlatformDropdown}>
                    {/* Jitsi option (default / switch back) */}
                    <TouchableOpacity
                      style={[
                        styles.platformOption,
                        videoPlatform === 'jitsi' && videoCallEnabled && styles.platformOptionSelected,
                        videoPlatform === 'jitsi' && videoCallEnabled && { borderColor: '#FF6B35' + '50' },
                      ]}
                      onPress={() => handlePlatformSelect('jitsi')}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.platformOptionIcon, { backgroundColor: '#FF6B35' + '15' }]}>
                        <Ionicons name="videocam" size={18} color="#FF6B35" />
                      </View>
                      <View style={styles.platformOptionInfo}>
                        <Text style={styles.platformOptionName}>Jitsi Meet</Text>
                        <Text style={styles.platformOptionSub}>No account needed · Auto-generated</Text>
                      </View>
                      {videoPlatform === 'jitsi' && videoCallEnabled && (
                        <Ionicons name="checkmark-circle" size={20} color="#FF6B35" />
                      )}
                      <View style={[styles.platformPickBadge, { backgroundColor: '#FF6B35' }]}>
                        <Ionicons name="star" size={8} color={COLORS.white} />
                        <Text style={styles.platformPickBadgeText}>Default</Text>
                      </View>
                    </TouchableOpacity>

                    {/* Other 4 platform options */}
                    {VIDEO_PLATFORMS.map(platform => {
                      const isSelected = videoPlatform === platform.id && videoCallEnabled;
                      const renderIcon = () => {
                        if (platform.iconLib === 'fontawesome') {
                          return <FontAwesome5 name={platform.iconName} size={16} color={platform.color} />;
                        }
                        return <MaterialCommunityIcons name={platform.iconName as any} size={18} color={platform.color} />;
                      };
                      return (
                        <TouchableOpacity
                          key={platform.id}
                          style={[
                            styles.platformOption,
                            isSelected && styles.platformOptionSelected,
                            isSelected && { borderColor: platform.color + '50' },
                          ]}
                          onPress={() => handlePlatformSelect(platform.id)}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.platformOptionIcon, { backgroundColor: platform.color + '15' }]}>
                            {renderIcon()}
                          </View>
                          <View style={styles.platformOptionInfo}>
                            <Text style={styles.platformOptionName}>{platform.name}</Text>
                            <Text style={styles.platformOptionSub}>{platform.subtitle}</Text>
                          </View>
                          {isSelected && (
                            <Ionicons name="checkmark-circle" size={20} color={platform.color} />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>

            </View>
          )}


          {/* Step 5: Recurrence */}
          {step === 'recurrence' && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Repeat Schedule</Text>
              <Text style={styles.stepSubtitle}>
                Set up recurring appointments or keep as a one-time session
              </Text>
              <RecurrenceEditor
                pattern={recurrencePattern}
                onPatternChange={setRecurrencePattern}
                baseDate={selectedDate}
                baseTime={selectedTime}
                duration={selectedType?.defaultDuration || 45}
                coachId={selectedCoachId}
                existingAppointments={existingAppointments}
                coachName={selectedCoach?.name}
                appointmentTypeId={selectedType?.id}
              />

            </View>
          )}

          {/* Step 6: Confirm */}
          {step === 'confirm' && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Confirm Appointment</Text>
              <View style={styles.confirmCard}>
                {selectedType && (
                  <View style={[styles.confirmHeader, { backgroundColor: selectedType.color + '12' }]}>
                    <Ionicons name={selectedType.icon as any} size={24} color={selectedType.color} />
                    <Text style={[styles.confirmTypeName, { color: selectedType.color }]}>{selectedType.name}</Text>
                  </View>
                )}
                <View style={styles.confirmBody}>
                  <ConfirmRow icon="person-circle" label="Coach" value={selectedCoach?.name || ''} />
                  <ConfirmRow icon="person" label="Client" value={selectedClient?.name || ''} />
                  <ConfirmRow icon="ribbon" label="Program" value={selectedClient?.program || ''} />
                  <ConfirmRow icon="calendar" label="Date" value={formatDisplayDate(selectedDate)} />
                  <ConfirmRow icon="time" label="Time" value={`${formatTimeDisplay(selectedTime)} - ${formatTimeDisplay(endTime)}`} />
                  <ConfirmRow icon="hourglass" label="Duration" value={`${selectedType?.defaultDuration || 0} minutes`} />
                  {isRecurring && (
                    <ConfirmRow
                      icon="repeat"
                      label="Repeat"
                      value={
                        recurrencePattern.type === 'daily' ? 'Daily' :
                        recurrencePattern.type === 'weekly'
                          ? `Weekly (${recurrencePattern.weeklyDays?.map(d => ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][d.day]).join(', ')})`
                          : 'Monthly'
                      }
                    />
                  )}
                  {isRecurring && (
                    <ConfirmRow
                      icon="calendar-outline"
                      label="Until"
                      value={formatDisplayDate(recurrencePattern.endDate)}
                    />
                  )}
                  {selectedType?.countsAsSession && sessionBalance && !isRecurring && (
                    <ConfirmRow icon="ticket" label="Sessions" value={`${sessionBalance.sessionsUsed + 1}/${sessionBalance.sessionsAllowed} used after this`} />
                  )}
                  {videoCallEnabled && videoCallLink ? <ConfirmRow icon="videocam" label="Video" value={videoCallLink.replace('https://', '')} /> : null}
                </View>
              </View>

              {/* External conflict warning in confirm step */}
              {hasExternalConflict && (
                <View style={styles.confirmExternalWarning}>
                  <Ionicons name="alert-circle" size={16} color="#e67e22" />
                  <Text style={styles.confirmExternalWarningText}>
                    This appointment overlaps with {externalConflicts.length} external calendar event{externalConflicts.length !== 1 ? 's' : ''}
                  </Text>
                </View>
              )}

              {videoCallEnabled && videoCallLink && (
                <View style={[styles.recurringConfirmBanner, { backgroundColor: currentPlatformInfo.color + '10', borderColor: currentPlatformInfo.color + '20' }]}>
                  <Ionicons name="videocam" size={16} color={currentPlatformInfo.color} />
                  <Text style={[styles.recurringConfirmText, { color: currentPlatformInfo.color }]}>
                    A {currentPlatformInfo.name} video call link will be attached
                  </Text>
                </View>
              )}


              {isRecurring && (
                <View style={styles.recurringConfirmBanner}>
                  <Ionicons name="repeat" size={16} color={COLORS.accent} />
                  <Text style={styles.recurringConfirmText}>
                    This will create a recurring series of appointments
                  </Text>
                </View>
              )}
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>

        <View style={styles.footer}>
          {stepIndex > 0 ? (
            <TouchableOpacity style={styles.backBtn} onPress={prevStep}>
              <Ionicons name="arrow-back" size={18} color={COLORS.primary} />
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
          ) : <View style={{ flex: 1 }} />}

          {step === 'confirm' ? (
            <TouchableOpacity style={[styles.nextBtn, { backgroundColor: COLORS.success }]} onPress={handleSave}>
              <Ionicons name="checkmark-circle" size={18} color={COLORS.white} />
              <Text style={styles.nextBtnText}>
                {isRecurring ? 'Create Recurring Series' : 'Create Appointment'}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.nextBtn, !canProceed() && styles.nextBtnDisabled]} onPress={nextStep} disabled={!canProceed()}>
              <Text style={styles.nextBtnText}>Next</Text>
              <Ionicons name="arrow-forward" size={18} color={COLORS.white} />
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ConfirmRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.confirmRow}>
      <Ionicons name={icon as any} size={16} color={COLORS.textMuted} />
      <Text style={styles.confirmLabel}>{label}</Text>
      <Text style={styles.confirmValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.primary },
  coachBanner: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, backgroundColor: COLORS.accent + '08', borderBottomWidth: 1, borderBottomColor: COLORS.accent + '15' },
  coachBannerIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  coachBannerText: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, fontWeight: '500' },
  stepRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  stepItem: { alignItems: 'center', gap: 4 },
  stepDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.borderLight, alignItems: 'center', justifyContent: 'center' },
  stepDotActive: { backgroundColor: COLORS.accent },
  stepDotDone: { backgroundColor: COLORS.success },
  stepNum: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted },
  stepNumActive: { color: COLORS.white },
  stepLabel: { fontSize: 8, fontWeight: '600', color: COLORS.textMuted },
  stepLabelActive: { color: COLORS.accent },
  scroll: { flex: 1 },
  stepContent: { padding: SPACING.lg },
  stepTitle: { fontSize: FONT_SIZES.xl, fontWeight: '800', color: COLORS.primary, marginBottom: 4 },
  stepSubtitle: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, marginBottom: SPACING.lg },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, gap: SPACING.sm, marginBottom: SPACING.md, marginTop: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  searchInput: { flex: 1, fontSize: FONT_SIZES.md, color: COLORS.primary },
  selectCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm, gap: SPACING.md, borderWidth: 1.5, borderColor: COLORS.borderLight, ...SHADOWS.sm },
  selectCardActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accent + '06' },
  coachIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  selectCardInfo: { flex: 1 },
  selectCardName: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.primary },
  selectCardSub: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, marginTop: 2 },
  clientNameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  assignedBadge: { backgroundColor: COLORS.successLight, paddingHorizontal: 6, paddingVertical: 1, borderRadius: BORDER_RADIUS.sm },
  assignedText: { fontSize: 9, fontWeight: '700', color: COLORS.success },
  balanceCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.lg, borderWidth: 1, ...SHADOWS.sm },
  balanceText: { fontSize: FONT_SIZES.sm, color: COLORS.primary, flex: 1 },
  typeCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm, gap: SPACING.md, borderWidth: 1.5, borderColor: COLORS.borderLight, ...SHADOWS.sm },
  typeIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  typeInfo: { flex: 1 },
  typeName: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.primary },
  typeMeta: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, marginTop: 2, textTransform: 'capitalize' },
  dateSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.lg, backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md, ...SHADOWS.sm },
  dateArrow: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  dateDisplay: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.primary },
  externalConflictBanner: { backgroundColor: '#fef3e2', borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md, borderWidth: 1, borderColor: '#e67e2230' },
  externalConflictHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  externalConflictTitle: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: '#e67e22' },
  externalConflictItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.xs, borderTopWidth: 1, borderTopColor: '#e67e2215' },
  externalConflictInfo: { flex: 1 },
  externalConflictName: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.primary },
  externalConflictTime: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 1 },
  externalConflictBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: BORDER_RADIUS.sm },
  externalConflictBadgeText: { fontSize: 9, fontWeight: '700' },
  externalConflictHint: { fontSize: FONT_SIZES.xs, color: '#b07520', marginTop: SPACING.sm, fontStyle: 'italic' },
  calendarSyncIndicator: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, backgroundColor: COLORS.successLight, borderRadius: BORDER_RADIUS.sm, marginBottom: SPACING.md },
  calendarSyncText: { fontSize: FONT_SIZES.xs, color: COLORS.success, fontWeight: '600' },
  timeSlotExternalConflict: { backgroundColor: '#fef3e2', borderColor: '#e67e2240' },
  timeSlotTextExternalConflict: { color: '#b07520' },
  externalDot: { position: 'absolute', top: 2, right: 2, width: 6, height: 6, borderRadius: 3, backgroundColor: '#e67e22' },
  confirmExternalWarning: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: '#fef3e2', padding: SPACING.md, borderRadius: BORDER_RADIUS.md, marginTop: SPACING.md, borderWidth: 1, borderColor: '#e67e2220' },
  confirmExternalWarningText: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: '#b07520', flex: 1 },
  timeLabel: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.primary, marginBottom: SPACING.sm },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  timeSlot: { paddingHorizontal: SPACING.sm + 2, paddingVertical: 6, borderRadius: BORDER_RADIUS.sm, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, minWidth: 78, alignItems: 'center' },
  timeSlotActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  timeSlotConflict: { backgroundColor: COLORS.dangerLight, borderColor: COLORS.danger + '40', opacity: 0.6 },
  timeSlotText: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary },
  timeSlotTextActive: { color: COLORS.white },
  timeSlotTextConflict: { color: COLORS.danger, textDecorationLine: 'line-through' },
  conflictBanner: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.dangerLight, padding: SPACING.md, borderRadius: BORDER_RADIUS.md, marginTop: SPACING.md },
  conflictText: { fontSize: FONT_SIZES.sm, color: COLORS.danger, fontWeight: '600' },
  timeSummary: { backgroundColor: COLORS.accent + '12', padding: SPACING.md, borderRadius: BORDER_RADIUS.md, marginTop: SPACING.md, alignItems: 'center' },
  timeSummaryText: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.accent },
  notesInput: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, fontSize: FONT_SIZES.md, color: COLORS.primary, minHeight: 80, textAlignVertical: 'top' },
  confirmCard: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg, overflow: 'hidden', ...SHADOWS.md },
  confirmHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.lg },
  confirmTypeName: { fontSize: FONT_SIZES.lg, fontWeight: '800' },
  confirmBody: { padding: SPACING.lg, gap: SPACING.md },
  confirmRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  confirmLabel: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted, fontWeight: '500', width: 70 },
  confirmValue: { fontSize: FONT_SIZES.sm, color: COLORS.primary, fontWeight: '600', flex: 1 },
  recurringConfirmBanner: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.accent + '10', padding: SPACING.md, borderRadius: BORDER_RADIUS.md, marginTop: SPACING.md, borderWidth: 1, borderColor: COLORS.accent + '20' },
  recurringConfirmText: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.accent, flex: 1 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: COLORS.border, gap: SPACING.md },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  backBtnText: { fontSize: FONT_SIZES.md, fontWeight: '600', color: COLORS.primary },
  nextBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.accent, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.sm + 2, borderRadius: BORDER_RADIUS.md },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.white },
  // Video call toggle styles
  videoCallToggle: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, gap: SPACING.md, borderWidth: 1.5, borderColor: COLORS.borderLight, ...SHADOWS.sm },
  videoCallToggleActive: { borderColor: '#FF6B35' + '40', backgroundColor: '#FF6B35' + '06' },
  videoCallToggleIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FF6B35' + '15', alignItems: 'center', justifyContent: 'center' },
  videoCallToggleIconActive: { backgroundColor: '#FF6B35' },
  videoCallToggleContent: { flex: 1 },
  videoCallToggleTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.primary },
  videoCallToggleSub: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 2 },
  videoCallCheckbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  videoCallCheckboxActive: { backgroundColor: '#FF6B35', borderColor: '#FF6B35' },
  videoCallLinkPreview: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: '#FF6B35' + '08', borderRadius: BORDER_RADIUS.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, marginTop: SPACING.sm, borderWidth: 1, borderColor: '#FF6B35' + '20' },
  videoCallLinkText: { flex: 1, fontSize: FONT_SIZES.xs, fontWeight: '600', color: '#FF6B35' },
  videoCallJitsiBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FF6B35', paddingHorizontal: 6, paddingVertical: 2, borderRadius: BORDER_RADIUS.full },
  videoCallJitsiBadgeText: { fontSize: 8, fontWeight: '800', color: COLORS.white },
  // "Use Other Platform" dropdown styles
  otherPlatformContainer: { marginTop: SPACING.md },
  otherPlatformToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, borderWidth: 1.5, borderColor: COLORS.borderLight, ...SHADOWS.sm },
  otherPlatformToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flex: 1 },
  otherPlatformToggleIconBg: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.accent + '15', alignItems: 'center', justifyContent: 'center' },
  otherPlatformToggleText: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.primary },
  otherPlatformToggleSub: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 1 },
  otherPlatformDropdown: { marginTop: SPACING.sm, gap: SPACING.sm },
  platformOption: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, gap: SPACING.sm, borderWidth: 1.5, borderColor: COLORS.borderLight, position: 'relative' as const, ...SHADOWS.sm },
  platformOptionActive: { backgroundColor: COLORS.white + 'F8' },
  platformOptionSelected: { backgroundColor: COLORS.accent + '04' },
  platformOptionIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  platformOptionInfo: { flex: 1 },
  platformOptionName: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.primary },
  platformOptionSub: { fontSize: 10, color: COLORS.textMuted, marginTop: 1 },
  platformPickBadge: { position: 'absolute' as const, top: 6, right: 6, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: BORDER_RADIUS.full },
  platformPickBadgeText: { fontSize: 8, fontWeight: '800', color: COLORS.white },
  // Custom link input styles
  otherPlatformInputCard: { marginTop: SPACING.sm, backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, borderWidth: 1, ...SHADOWS.sm },
  otherPlatformInputLabel: { fontSize: FONT_SIZES.sm, fontWeight: '700', marginBottom: SPACING.sm },
  otherPlatformInputRow: { flexDirection: 'row', gap: SPACING.sm },
  otherPlatformInput: { flex: 1, backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, fontSize: FONT_SIZES.sm, color: COLORS.primary, borderWidth: 1 },
  otherPlatformInputBtn: { width: 40, height: 40, borderRadius: BORDER_RADIUS.md, alignItems: 'center', justifyContent: 'center' },
});

