import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import { useAuth, UserProfile } from '../../contexts/AuthContext';
import { programDefinitions, ProgramDefinition, getProgramDefinition } from '../../data/scheduleData';
import { assignProgram, stopProgram, fetchProgramHistory, ProgramHistoryEntry } from '../../lib/programService';
import BirthdatePicker from '../BirthdatePicker';




// ── Staff data for dropdowns ──
const PERSONAL_TRAINERS = [
  { id: 'pt-1', name: 'Marcus Rivera', franchise: 'Collin County' },
  { id: 'pt-2', name: 'Jennifer Walsh', franchise: 'Collin County' },
  { id: 'pt-3', name: 'Ryan Brooks', franchise: 'Collin County' },
  { id: 'pt-4', name: 'David Chen', franchise: 'Grayson County' },
  { id: 'pt-5', name: 'Lisa Patel', franchise: 'Grayson County' },
  { id: 'pt-6', name: 'Sarah Kim', franchise: 'Grayson County' },
  { id: 'pt-7', name: 'Carlos Mendez', franchise: 'Park Cities' },
  { id: 'pt-8', name: 'Nicole Foster', franchise: 'Park Cities' },
  { id: 'pt-9', name: 'Emma Sullivan', franchise: 'Park Cities' },
  { id: 'pt-10', name: 'Thomas Wright', franchise: 'Lake Cities' },
  { id: 'pt-11', name: 'Jake Morrison', franchise: 'Lake Cities' },
  { id: 'pt-12', name: 'Olivia Barnes', franchise: 'Lake Cities' },
];

const DIETITIANS = [
  { id: 'dt-1', name: 'Dr. Alicia Reyes', franchise: 'Collin County' },
  { id: 'dt-2', name: 'Hannah Whitfield', franchise: 'Collin County' },
  { id: 'dt-3', name: 'Dr. Tomoko Sato', franchise: 'Collin County' },
  { id: 'dt-4', name: 'Dr. Priya Sharma', franchise: 'Grayson County' },
  { id: 'dt-5', name: 'Megan Calloway', franchise: 'Grayson County' },
  { id: 'dt-6', name: 'Brianna Holt', franchise: 'Grayson County' },
  { id: 'dt-7', name: 'Dr. Rachel Nguyen', franchise: 'Park Cities' },
  { id: 'dt-8', name: 'Kendra Jameson', franchise: 'Park Cities' },
  { id: 'dt-9', name: 'Dr. Sofia Petrov', franchise: 'Park Cities' },
  { id: 'dt-10', name: 'Leah Donovan', franchise: 'Lake Cities' },
];


interface EditProfileModalProps {
  visible: boolean;
  onClose: () => void;
}

type PickerMode = 'none' | 'trainer' | 'dietitian' | 'program' | 'startDate' | 'stopProgram';

export default function EditProfileModal({ visible, onClose }: EditProfileModalProps) {
  const { profile, updateProfile, user } = useAuth();

  // Form state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [occupation, setOccupation] = useState('');
  const [company, setCompany] = useState('');
  const [primaryTrainer, setPrimaryTrainer] = useState('');
  const [primaryDietitian, setPrimaryDietitian] = useState('');
  const [inFacebookGroup, setInFacebookGroup] = useState(false);
  const [hasNutrition, setHasNutrition] = useState(false);

  // Program state
  const [currentProgram, setCurrentProgram] = useState<string | null>(null);
  const [programStartDate, setProgramStartDate] = useState<string | null>(null);
  const [programStopDate, setProgramStopDate] = useState<string | null>(null);
  const [programStatus, setProgramStatus] = useState<'active' | 'stopped' | null>(null);
  const [pendingProgram, setPendingProgram] = useState<string | null>(null);
  const [startDateInput, setStartDateInput] = useState('');
  const [stopDateInput, setStopDateInput] = useState('');
  const [programHistory, setProgramHistory] = useState<ProgramHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [assigningProgram, setAssigningProgram] = useState(false);
  const [stoppingProgram, setStoppingProgram] = useState(false);

  // Inline date editing state (visible in Program section)
  const [inlineStartDate, setInlineStartDate] = useState('');
  const [inlineEndDate, setInlineEndDate] = useState('');
  const [savingDates, setSavingDates] = useState(false);


  // UI state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pickerMode, setPickerMode] = useState<PickerMode>('none');
  const [pickerSearch, setPickerSearch] = useState('');

  const scrollRef = useRef<ScrollView>(null);

  // Get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // Populate fields when modal opens
  useEffect(() => {
    if (visible && profile) {
      setFullName(profile.full_name || '');
      setEmail(profile.email || '');
      setAddress(profile.address || '');
      setPhone(profile.phone || '');
      setBirthdate(profile.birthdate || '');
      setOccupation(profile.occupation || '');
      setCompany(profile.company || '');
      setPrimaryTrainer(profile.primary_trainer || '');
      setPrimaryDietitian(profile.primary_dietitian || '');
      setInFacebookGroup(profile.in_facebook_group || false);
      setHasNutrition(profile.has_nutrition || false);

      setCurrentProgram(profile.program || null);
      setProgramStartDate(profile.program_start_date || null);
      setProgramStopDate(profile.program_stop_date || null);
      setProgramStatus(profile.program_status || null);
      setPendingProgram(null);
      setStartDateInput(getTodayDate());
      setStopDateInput(getTodayDate());
      setInlineStartDate(profile.program_start_date || '');
      setInlineEndDate(profile.program_stop_date || '');
      setSaved(false);
      setErrors({});
      setPickerMode('none');
      setPickerSearch('');

      // Load program history
      if (user?.id) {
        loadProgramHistory(user.id);
      }
    }
  }, [visible, profile]);


  const loadProgramHistory = async (userId: string) => {
    setLoadingHistory(true);
    try {
      const history = await fetchProgramHistory(userId);
      setProgramHistory(history);
    } catch (err) {
      console.error('Error loading program history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!fullName.trim()) {
      newErrors.fullName = 'Full name is required';
    } else if (fullName.trim().length < 2) {
      newErrors.fullName = 'Name must be at least 2 characters';
    }

    if (phone && !/^[\d\s\-\+\(\)]{7,20}$/.test(phone.trim())) {
      newErrors.phone = 'Please enter a valid phone number';
    }

    if (birthdate && !/^\d{4}-\d{2}-\d{2}$/.test(birthdate.trim())) {
      newErrors.birthdate = 'Use format YYYY-MM-DD';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      const updates: Partial<UserProfile> = {
        full_name: fullName.trim(),
        address: address.trim() || null,
        phone: phone.trim() || null,
        birthdate: birthdate.trim() || null,
        occupation: occupation.trim() || null,
        company: company.trim() || null,
        primary_trainer: primaryTrainer || null,
        primary_dietitian: primaryDietitian || null,
        in_facebook_group: inFacebookGroup,
        has_nutrition: hasNutrition,
      };


      const { error } = await updateProfile(updates);

      if (error) {
        Alert.alert('Update Failed', error);
      } else {
        setSaved(true);
        setTimeout(() => {
          onClose();
        }, 1200);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = () => {
    if (!profile) return false;
    return (
      fullName.trim() !== (profile.full_name || '') ||
      address.trim() !== (profile.address || '') ||
      phone.trim() !== (profile.phone || '') ||
      birthdate.trim() !== (profile.birthdate || '') ||
      occupation.trim() !== (profile.occupation || '') ||
      company.trim() !== (profile.company || '') ||
      primaryTrainer !== (profile.primary_trainer || '') ||
      primaryDietitian !== (profile.primary_dietitian || '') ||
      inFacebookGroup !== (profile.in_facebook_group || false) ||
      hasNutrition !== (profile.has_nutrition || false)
    );
  };


  const handleClose = () => {
    if (pickerMode !== 'none') {
      setPickerMode('none');
      setPickerSearch('');
      setPendingProgram(null);
      return;
    }
    if (hasChanges() && !saved) {
      Alert.alert(
        'Discard Changes?',
        'You have unsaved changes. Are you sure you want to close?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: onClose },
        ]
      );
    } else {
      onClose();
    }
  };

  // Birthdate parts state for MM/DD/YYYY inputs
  const [bdMonth, setBdMonth] = useState('');
  const [bdDay, setBdDay] = useState('');
  const [bdYear, setBdYear] = useState('');

  // Sync birthdate parts when profile loads
  useEffect(() => {
    if (visible && birthdate && /^\d{4}-\d{2}-\d{2}$/.test(birthdate)) {
      const [y, m, d] = birthdate.split('-');
      setBdMonth(String(parseInt(m, 10)));
      setBdDay(String(parseInt(d, 10)));
      setBdYear(y);
    } else if (visible && !birthdate) {
      setBdMonth('');
      setBdDay('');
      setBdYear('');
    }
  }, [visible, birthdate]);

  const handleBdPartChange = (part: 'month' | 'day' | 'year', value: string) => {
    const cleaned = value.replace(/[^\d]/g, '');
    if (part === 'month') setBdMonth(cleaned);
    else if (part === 'day') setBdDay(cleaned);
    else setBdYear(cleaned);

    const m = part === 'month' ? parseInt(cleaned, 10) : parseInt(bdMonth, 10);
    const d = part === 'day' ? parseInt(cleaned, 10) : parseInt(bdDay, 10);
    const y = part === 'year' ? parseInt(cleaned, 10) : parseInt(bdYear, 10);

    if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= 2100) {
      const built = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      setBirthdate(built);
    } else if (!cleaned && !bdMonth && !bdDay && !bdYear) {
      setBirthdate('');
    }
    if (errors.birthdate) setErrors(prev => ({ ...prev, birthdate: '' }));
  };


  // Format date input (for start/stop dates)
  const handleDateInputChange = (text: string, setter: (v: string) => void, currentVal: string) => {
    const cleaned = text.replace(/[^\d-]/g, '');
    let formatted = cleaned;
    if (cleaned.length === 4 && !cleaned.includes('-') && currentVal.length < text.length) {
      formatted = cleaned + '-';
    } else if (cleaned.length === 7 && cleaned.split('-').length === 2 && currentVal.length < text.length) {
      formatted = cleaned + '-';
    }
    if (formatted.length <= 10) {
      setter(formatted);
    }
  };

  const isValidDate = (dateStr: string): boolean => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
    const d = new Date(dateStr + 'T12:00:00');
    return !isNaN(d.getTime());
  };

  // Handle program assignment
  const handleAssignProgram = async () => {
    if (!pendingProgram || !isValidDate(startDateInput) || !user?.id) return;

    setAssigningProgram(true);
    try {
      const { error } = await assignProgram(user.id, pendingProgram, startDateInput, hasNutrition);

      if (error) {
        Alert.alert('Assignment Failed', error);
      } else {
        // Update local state
        setCurrentProgram(pendingProgram);
        setProgramStartDate(startDateInput);
        setProgramStopDate(null);
        setProgramStatus('active');
        setPendingProgram(null);
        setPickerMode('none');

        // Refresh profile and history
        await updateProfile({
          program: pendingProgram,
          program_start_date: startDateInput,
          program_stop_date: null,
          program_status: 'active',
        });
        await loadProgramHistory(user.id);

        Alert.alert('Program Assigned', `${pendingProgram} has been assigned starting ${formatDisplayDate(startDateInput)}.`);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Something went wrong');
    } finally {
      setAssigningProgram(false);
    }
  };

  // Handle program stop
  const handleStopProgram = async () => {
    if (!isValidDate(stopDateInput) || !user?.id) return;

    setStoppingProgram(true);
    try {
      const { error } = await stopProgram(user.id, stopDateInput, profile?.full_name || undefined);
      if (error) {
        Alert.alert('Stop Failed', error);
      } else {
        // Update local state
        setProgramStopDate(stopDateInput);
        setProgramStatus('stopped');
        setPickerMode('none');

        // Refresh profile and history
        await updateProfile({
          program_stop_date: stopDateInput,
          program_status: 'stopped',
        });
        await loadProgramHistory(user.id);

        Alert.alert('Program Stopped', `Program has been stopped as of ${formatDisplayDate(stopDateInput)}.`);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Something went wrong');
    } finally {
      setStoppingProgram(false);
    }
  };

  const formatDisplayDate = (dateStr: string): string => {
    if (!dateStr || !isValidDate(dateStr)) return dateStr;
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getDaysSince = (dateStr: string): number => {
    const d = new Date(dateStr + 'T12:00:00');
    const now = new Date();
    return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  };

  const filteredTrainers = PERSONAL_TRAINERS.filter(t =>
    t.name.toLowerCase().includes(pickerSearch.toLowerCase()) ||
    t.franchise.toLowerCase().includes(pickerSearch.toLowerCase())
  );

  const filteredDietitians = DIETITIANS.filter(d =>
    d.name.toLowerCase().includes(pickerSearch.toLowerCase()) ||
    d.franchise.toLowerCase().includes(pickerSearch.toLowerCase())
  );

  const filteredPrograms = programDefinitions.filter(p =>
    p.name.toLowerCase().includes(pickerSearch.toLowerCase()) ||
    p.tier.toLowerCase().includes(pickerSearch.toLowerCase()) ||
    p.variant.toLowerCase().includes(pickerSearch.toLowerCase())
  );

  // ── Program Picker View ──
  const renderProgramPickerView = () => {
    return (
      <View style={styles.pickerOverlay}>
        <View style={styles.pickerHeader}>
          <TouchableOpacity onPress={() => { setPickerMode('none'); setPickerSearch(''); setPendingProgram(null); }} style={styles.headerBtn}>
            <Ionicons name="arrow-back" size={22} color={COLORS.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.pickerTitle}>Select Program</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.pickerSearchWrap}>
          <Ionicons name="search" size={16} color={COLORS.textMuted} />
          <TextInput
            style={styles.pickerSearchInput}
            value={pickerSearch}
            onChangeText={setPickerSearch}
            placeholder="Search programs..."
            placeholderTextColor={COLORS.textMuted}
            autoCorrect={false}
          />
          {pickerSearch.length > 0 && (
            <TouchableOpacity onPress={() => setPickerSearch('')}>
              <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.pickerLabelRow}>
          <Ionicons name="barbell" size={14} color={COLORS.accent} />
          <Text style={styles.pickerLabelText}>Programs</Text>
          <Text style={styles.pickerCountText}>{filteredPrograms.length} available</Text>
        </View>

        <ScrollView style={styles.pickerScroll} contentContainerStyle={styles.pickerList} keyboardShouldPersistTaps="handled">
          {filteredPrograms.length === 0 ? (
            <View style={styles.pickerEmpty}>
              <Ionicons name="search-outline" size={32} color={COLORS.textMuted} />
              <Text style={styles.pickerEmptyText}>No programs found</Text>
            </View>
          ) : (
            filteredPrograms.map((prog) => {
              const isSelected = currentProgram === prog.name && programStatus === 'active';
              const isCurrent = currentProgram === prog.name;
              return (
                <TouchableOpacity
                  key={prog.id}
                  style={[styles.pickerItem, isSelected && styles.pickerItemSelected]}
                  onPress={() => {
                    setPendingProgram(prog.name);
                    setStartDateInput(getTodayDate());
                    setPickerMode('startDate');
                    setPickerSearch('');
                  }}
                  activeOpacity={0.6}
                >
                  <View style={[styles.programTierDot, { backgroundColor: prog.color }]} />
                  <View style={styles.pickerItemInfo}>
                    <Text style={[styles.pickerItemName, isCurrent && { color: prog.color }]}>
                      {prog.name}
                    </Text>
                    <Text style={styles.pickerItemSub}>
                      {prog.sessionsPerWeek}x/week  |  ${prog.monthlyCost.toLocaleString()}/mo
                    </Text>
                  </View>
                  <View style={[styles.programTierBadge, { backgroundColor: prog.color + '15' }]}>
                    <Text style={[styles.programTierBadgeText, { color: prog.color }]}>{prog.tier}</Text>
                  </View>
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={22} color={prog.color} />
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </View>
    );
  };

  // ── Start Date Entry View ──
  const renderStartDateView = () => {
    const prog = pendingProgram ? getProgramDefinition(pendingProgram) : null;
    const dateValid = isValidDate(startDateInput);

    return (
      <View style={styles.pickerOverlay}>
        <View style={styles.pickerHeader}>
          <TouchableOpacity onPress={() => { setPickerMode('program'); setPendingProgram(null); }} style={styles.headerBtn}>
            <Ionicons name="arrow-back" size={22} color={COLORS.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.pickerTitle}>Set Start Date</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView style={styles.pickerScroll} contentContainerStyle={{ padding: SPACING.lg }} keyboardShouldPersistTaps="handled">
          {/* Selected Program Card */}
          {prog && (
            <View style={[styles.selectedProgramCard, { borderColor: prog.color + '40' }]}>
              <View style={[styles.programTierDot, { backgroundColor: prog.color, width: 12, height: 12, borderRadius: 6 }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.selectedProgramName, { color: prog.color }]}>{prog.name}</Text>
                <Text style={styles.selectedProgramMeta}>
                  {prog.sessionsPerWeek} sessions/week  |  ${prog.monthlyCost.toLocaleString()}/month
                </Text>
              </View>
            </View>
          )}

          {/* Info Banner */}
          <View style={styles.infoBanner}>
            <Ionicons name="information-circle" size={18} color={COLORS.accent} />
            <Text style={styles.infoBannerText}>
              Assigning a program marks this client as <Text style={{ fontWeight: '800' }}>active</Text>. 
              The start date records when the program begins.
            </Text>
          </View>

          {/* Start Date Input */}
          <View style={styles.dateInputSection}>
            <Text style={styles.dateInputLabel}>Program Start Date</Text>
            <View style={[styles.inputWrapper, !dateValid && startDateInput.length === 10 ? styles.inputError : null]}>
              <Ionicons name="calendar" size={18} color={COLORS.accent} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={startDateInput}
                onChangeText={(t) => handleDateInputChange(t, setStartDateInput, startDateInput)}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="number-pad"
                maxLength={10}
              />
              {dateValid && (
                <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
              )}
            </View>
            {dateValid && (
              <Text style={styles.datePreview}>
                <Ionicons name="calendar-outline" size={12} color={COLORS.textMuted} /> {formatDisplayDate(startDateInput)}
              </Text>
            )}
            {!dateValid && startDateInput.length === 10 && (
              <Text style={styles.errorText}>Please enter a valid date</Text>
            )}
          </View>

          {/* Quick Date Buttons */}
          <View style={styles.quickDateRow}>
            <TouchableOpacity
              style={[styles.quickDateBtn, startDateInput === getTodayDate() && styles.quickDateBtnActive]}
              onPress={() => setStartDateInput(getTodayDate())}
            >
              <Text style={[styles.quickDateText, startDateInput === getTodayDate() && styles.quickDateTextActive]}>Today</Text>
            </TouchableOpacity>
            {(() => {
              const tomorrow = new Date();
              tomorrow.setDate(tomorrow.getDate() + 1);
              const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
              return (
                <TouchableOpacity
                  style={[styles.quickDateBtn, startDateInput === tomorrowStr && styles.quickDateBtnActive]}
                  onPress={() => setStartDateInput(tomorrowStr)}
                >
                  <Text style={[styles.quickDateText, startDateInput === tomorrowStr && styles.quickDateTextActive]}>Tomorrow</Text>
                </TouchableOpacity>
              );
            })()}
            {(() => {
              const nextMon = new Date();
              const day = nextMon.getDay();
              const diff = day === 0 ? 1 : 8 - day;
              nextMon.setDate(nextMon.getDate() + diff);
              const nextMonStr = `${nextMon.getFullYear()}-${String(nextMon.getMonth() + 1).padStart(2, '0')}-${String(nextMon.getDate()).padStart(2, '0')}`;
              return (
                <TouchableOpacity
                  style={[styles.quickDateBtn, startDateInput === nextMonStr && styles.quickDateBtnActive]}
                  onPress={() => setStartDateInput(nextMonStr)}
                >
                  <Text style={[styles.quickDateText, startDateInput === nextMonStr && styles.quickDateTextActive]}>Next Monday</Text>
                </TouchableOpacity>
              );
            })()}
          </View>

          {/* Assign Button */}
          <TouchableOpacity
            style={[styles.assignBtn, (!dateValid || assigningProgram) && styles.assignBtnDisabled]}
            onPress={handleAssignProgram}
            disabled={!dateValid || assigningProgram}
          >
            {assigningProgram ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.white} />
                <Text style={styles.assignBtnText}>Assign Program</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Warning if replacing active program */}
          {programStatus === 'active' && currentProgram && (
            <View style={styles.warningBanner}>
              <Ionicons name="warning" size={16} color={COLORS.warning} />
              <Text style={styles.warningText}>
                This will replace the current active program ({currentProgram}). The previous program will be automatically stopped.
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    );
  };

  // ── Stop Program View ──
  const renderStopProgramView = () => {
    const prog = currentProgram ? getProgramDefinition(currentProgram) : null;
    const dateValid = isValidDate(stopDateInput);

    return (
      <View style={styles.pickerOverlay}>
        <View style={styles.pickerHeader}>
          <TouchableOpacity onPress={() => { setPickerMode('none'); }} style={styles.headerBtn}>
            <Ionicons name="arrow-back" size={22} color={COLORS.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.pickerTitle}>Stop Program</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView style={styles.pickerScroll} contentContainerStyle={{ padding: SPACING.lg }} keyboardShouldPersistTaps="handled">
          {/* Current Program Card */}
          {prog && (
            <View style={[styles.selectedProgramCard, { borderColor: COLORS.danger + '40' }]}>
              <View style={[styles.programTierDot, { backgroundColor: prog.color, width: 12, height: 12, borderRadius: 6 }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.selectedProgramName, { color: prog.color }]}>{prog.name}</Text>
                <Text style={styles.selectedProgramMeta}>
                  Active since {programStartDate ? formatDisplayDate(programStartDate) : 'N/A'}
                  {programStartDate ? ` (${getDaysSince(programStartDate)} days)` : ''}
                </Text>
              </View>
            </View>
          )}

          {/* Warning Banner */}
          <View style={[styles.infoBanner, { backgroundColor: COLORS.dangerLight + '40', borderColor: COLORS.danger + '20' }]}>
            <Ionicons name="alert-circle" size={18} color={COLORS.danger} />
            <Text style={[styles.infoBannerText, { color: COLORS.danger }]}>
              Stopping the program will mark this client as <Text style={{ fontWeight: '800' }}>inactive</Text>. 
              The stop date will be recorded for your records.
            </Text>
          </View>

          {/* Stop Date Input */}
          <View style={styles.dateInputSection}>
            <Text style={styles.dateInputLabel}>Program Stop Date</Text>
            <View style={[styles.inputWrapper, !dateValid && stopDateInput.length === 10 ? styles.inputError : null]}>
              <Ionicons name="calendar" size={18} color={COLORS.danger} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={stopDateInput}
                onChangeText={(t) => handleDateInputChange(t, setStopDateInput, stopDateInput)}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="number-pad"
                maxLength={10}
              />
              {dateValid && (
                <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
              )}
            </View>
            {dateValid && (
              <Text style={styles.datePreview}>
                <Ionicons name="calendar-outline" size={12} color={COLORS.textMuted} /> {formatDisplayDate(stopDateInput)}
              </Text>
            )}
            {!dateValid && stopDateInput.length === 10 && (
              <Text style={styles.errorText}>Please enter a valid date</Text>
            )}
          </View>

          {/* Quick Date Buttons */}
          <View style={styles.quickDateRow}>
            <TouchableOpacity
              style={[styles.quickDateBtn, stopDateInput === getTodayDate() && styles.quickDateBtnActive]}
              onPress={() => setStopDateInput(getTodayDate())}
            >
              <Text style={[styles.quickDateText, stopDateInput === getTodayDate() && styles.quickDateTextActive]}>Today</Text>
            </TouchableOpacity>
          </View>

          {/* Stop Button */}
          <TouchableOpacity
            style={[styles.stopBtn, (!dateValid || stoppingProgram) && styles.stopBtnDisabled]}
            onPress={handleStopProgram}
            disabled={!dateValid || stoppingProgram}
          >
            {stoppingProgram ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <>
                <Ionicons name="stop-circle" size={20} color={COLORS.white} />
                <Text style={styles.stopBtnText}>Stop Program</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  };

  // ── Trainer/Dietitian Picker View ──
  const renderStaffPickerView = () => {
    const isTrainer = pickerMode === 'trainer';
    const items = isTrainer ? filteredTrainers : filteredDietitians;
    const selectedValue = isTrainer ? primaryTrainer : primaryDietitian;
    const title = isTrainer ? 'Select Personal Trainer' : 'Select Dietitian';
    const labelText = isTrainer ? 'Personal Trainer' : 'Dietitian';
    const accentColor = isTrainer ? COLORS.accent : '#2ecc71';
    const iconName = isTrainer ? 'fitness' : 'nutrition';

    return (
      <View style={styles.pickerOverlay}>
        <View style={styles.pickerHeader}>
          <TouchableOpacity onPress={() => { setPickerMode('none'); setPickerSearch(''); }} style={styles.headerBtn}>
            <Ionicons name="arrow-back" size={22} color={COLORS.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.pickerTitle}>{title}</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.pickerSearchWrap}>
          <Ionicons name="search" size={16} color={COLORS.textMuted} />
          <TextInput
            style={styles.pickerSearchInput}
            value={pickerSearch}
            onChangeText={setPickerSearch}
            placeholder={`Search ${isTrainer ? 'trainers' : 'dietitians'}...`}
            placeholderTextColor={COLORS.textMuted}
            autoCorrect={false}
          />
          {pickerSearch.length > 0 && (
            <TouchableOpacity onPress={() => setPickerSearch('')}>
              <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.pickerLabelRow}>
          <Ionicons name={iconName as any} size={14} color={accentColor} />
          <Text style={styles.pickerLabelText}>{labelText}s</Text>
          <Text style={styles.pickerCountText}>{items.length} available</Text>
        </View>

        <ScrollView style={styles.pickerScroll} contentContainerStyle={styles.pickerList} keyboardShouldPersistTaps="handled">
          {items.length === 0 ? (
            <View style={styles.pickerEmpty}>
              <Ionicons name="search-outline" size={32} color={COLORS.textMuted} />
              <Text style={styles.pickerEmptyText}>No {isTrainer ? 'trainers' : 'dietitians'} found</Text>
            </View>
          ) : (
            items.map((item) => {
              const isSelected = selectedValue === item.name;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.pickerItem, isSelected && styles.pickerItemSelected]}
                  onPress={() => {
                    if (isTrainer) {
                      setPrimaryTrainer(item.name);
                    } else {
                      setPrimaryDietitian(item.name);
                    }
                    setPickerMode('none');
                    setPickerSearch('');
                  }}
                  activeOpacity={0.6}
                >
                  <View style={[
                    styles.pickerItemAvatar,
                    { backgroundColor: accentColor + '15' },
                    isSelected && { backgroundColor: accentColor },
                  ]}>
                    <Text style={[
                      styles.pickerItemAvatarText,
                      { color: accentColor },
                      isSelected && { color: COLORS.white },
                    ]}>
                      {item.name.replace('Dr. ', '').charAt(0)}
                    </Text>
                  </View>
                  <View style={styles.pickerItemInfo}>
                    <Text style={[styles.pickerItemName, isSelected && { color: accentColor }]}>
                      {item.name}
                    </Text>
                    <Text style={styles.pickerItemSub}>{item.franchise}</Text>
                  </View>
                  <View style={[styles.pickerItemLabelBadge, { backgroundColor: accentColor + '12' }]}>
                    <Text style={[styles.pickerItemLabelText, { color: accentColor }]}>{labelText}</Text>
                  </View>
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={22} color={accentColor} />
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </View>
    );
  };

  // ── Program Section in Form ──
  const renderProgramSection = () => {
    const prog = currentProgram ? getProgramDefinition(currentProgram) : null;
    const isActive = programStatus === 'active';
    const isStopped = programStatus === 'stopped';

    return (
      <View style={styles.formSection}>
        <View style={styles.sectionTitleRow}>
          <View style={[styles.sectionIconBg, { backgroundColor: '#8B5CF615' }]}>
            <Ionicons name="barbell" size={16} color="#8B5CF6" />
          </View>
          <Text style={styles.formSectionTitle}>Program</Text>
          {isActive && (
            <View style={styles.activeBadge}>
              <View style={styles.activeDot} />
              <Text style={styles.activeBadgeText}>Active</Text>
            </View>
          )}
          {isStopped && (
            <View style={styles.stoppedBadge}>
              <View style={styles.stoppedDot} />
              <Text style={styles.stoppedBadgeText}>Stopped</Text>
            </View>
          )}
        </View>

        {/* Current Program Display */}
        {currentProgram && prog ? (
          <View style={styles.currentProgramCard}>
            <View style={[styles.programColorBar, { backgroundColor: prog.color }]} />
            <View style={styles.currentProgramContent}>
              <View style={styles.currentProgramHeader}>
                <Text style={[styles.currentProgramName, { color: prog.color }]}>{prog.name}</Text>
                <View style={[styles.programVariantBadge, { backgroundColor: prog.color + '15' }]}>
                  <Text style={[styles.programVariantText, { color: prog.color }]}>{prog.variant}</Text>
                </View>
              </View>
              <View style={styles.programDetailsRow}>
                <View style={styles.programDetailItem}>
                  <Ionicons name="repeat" size={13} color={COLORS.textMuted} />
                  <Text style={styles.programDetailText}>{prog.sessionsPerWeek}x/week</Text>
                </View>
                <View style={styles.programDetailItem}>
                   <Text style={styles.programDetailText}>${prog.monthlyCost.toLocaleString()}/mo</Text>
                </View>
              </View>
            </View>
          </View>

        ) : (
          <View style={styles.noProgramCard}>
            <Ionicons name="barbell-outline" size={28} color={COLORS.textMuted} />
            <Text style={styles.noProgramText}>No program assigned</Text>
            <Text style={styles.noProgramSub}>Assign a program to activate this client</Text>
          </View>
        )}

        {/* ── Inline Date Pickers ── */}
        {currentProgram && (
          <View style={styles.inlineDateSection}>
            {/* Start Date */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Start Date</Text>
              <View style={[
                styles.inputWrapper,
                inlineStartDate.length === 10 && !isValidDate(inlineStartDate) ? styles.inputError : null,
              ]}>
                <Ionicons name="calendar" size={16} color={COLORS.accent} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={inlineStartDate}
                  onChangeText={(t) => handleDateInputChange(t, setInlineStartDate, inlineStartDate)}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="number-pad"
                  maxLength={10}
                />
                {inlineStartDate && isValidDate(inlineStartDate) && (
                  <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
                )}
              </View>
              {inlineStartDate && isValidDate(inlineStartDate) && (
                <Text style={styles.fieldHint}>{formatDisplayDate(inlineStartDate)}</Text>
              )}
              {inlineStartDate.length === 10 && !isValidDate(inlineStartDate) && (
                <Text style={styles.errorText}>Please enter a valid date</Text>
              )}
            </View>

            {/* End Date (optional) */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>
                End Date <Text style={styles.optionalLabel}>(optional)</Text>
              </Text>
              <View style={[
                styles.inputWrapper,
                inlineEndDate.length === 10 && !isValidDate(inlineEndDate) ? styles.inputError : null,
              ]}>
                <Ionicons name="calendar-outline" size={16} color={COLORS.danger} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={inlineEndDate}
                  onChangeText={(t) => handleDateInputChange(t, setInlineEndDate, inlineEndDate)}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="number-pad"
                  maxLength={10}
                />
                {inlineEndDate && isValidDate(inlineEndDate) && (
                  <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
                )}
                {inlineEndDate.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setInlineEndDate('')}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={{ marginLeft: 4 }}
                  >
                    <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
              {inlineEndDate && isValidDate(inlineEndDate) && (
                <Text style={styles.fieldHint}>{formatDisplayDate(inlineEndDate)}</Text>
              )}
              {inlineEndDate.length === 10 && !isValidDate(inlineEndDate) && (
                <Text style={styles.errorText}>Please enter a valid date</Text>
              )}
              {!inlineEndDate && (
                <Text style={styles.fieldHint}>Leave blank if the program is ongoing</Text>
              )}
            </View>

            {/* Save Dates Button */}
            {(inlineStartDate !== (programStartDate || '') || inlineEndDate !== (programStopDate || '')) && (
              <TouchableOpacity
                style={[
                  styles.saveDatesBtn,
                  (savingDates || (inlineStartDate.length > 0 && !isValidDate(inlineStartDate)) || (inlineEndDate.length > 0 && inlineEndDate.length === 10 && !isValidDate(inlineEndDate))) && styles.saveDatesBtnDisabled,
                ]}
                onPress={async () => {
                  if (inlineStartDate && !isValidDate(inlineStartDate)) return;
                  if (inlineEndDate && inlineEndDate.length === 10 && !isValidDate(inlineEndDate)) return;

                  setSavingDates(true);
                  try {
                    const dateUpdates: Partial<UserProfile> = {
                      program_start_date: inlineStartDate || null,
                      program_stop_date: inlineEndDate || null,
                    };
                    // If end date is set, mark as stopped; if cleared, mark as active
                    if (inlineEndDate && isValidDate(inlineEndDate)) {
                      dateUpdates.program_status = 'stopped';
                    } else if (inlineStartDate && isValidDate(inlineStartDate)) {
                      dateUpdates.program_status = 'active';
                    }
                    const { error } = await updateProfile(dateUpdates);
                    if (error) {
                      Alert.alert('Update Failed', error);
                    } else {
                      setProgramStartDate(inlineStartDate || null);
                      setProgramStopDate(inlineEndDate || null);
                      setProgramStatus(inlineEndDate && isValidDate(inlineEndDate) ? 'stopped' : 'active');
                      Alert.alert('Dates Updated', 'Program dates have been saved successfully.');
                      if (user?.id) {
                        await loadProgramHistory(user.id);
                      }
                    }
                  } catch (err: any) {
                    Alert.alert('Error', err.message || 'Something went wrong');
                  } finally {
                    setSavingDates(false);
                  }
                }}
                disabled={savingDates || (inlineStartDate.length > 0 && !isValidDate(inlineStartDate)) || (inlineEndDate.length > 0 && inlineEndDate.length === 10 && !isValidDate(inlineEndDate))}
              >
                {savingDates ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <>
                    <Ionicons name="save" size={16} color={COLORS.white} />
                    <Text style={styles.saveDatesBtnText}>Save Dates</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {/* Duration display */}
            {inlineStartDate && isValidDate(inlineStartDate) && !inlineEndDate && (
              <View style={styles.durationBanner}>
                <Ionicons name="time-outline" size={14} color={COLORS.accent} />
                <Text style={styles.durationText}>
                  Active for {getDaysSince(inlineStartDate)} days
                </Text>
              </View>
            )}
            {inlineStartDate && isValidDate(inlineStartDate) && inlineEndDate && isValidDate(inlineEndDate) && (
              <View style={[styles.durationBanner, { backgroundColor: COLORS.textMuted + '10', borderColor: COLORS.textMuted + '20' }]}>
                <Ionicons name="time-outline" size={14} color={COLORS.textMuted} />
                <Text style={[styles.durationText, { color: COLORS.textMuted }]}>
                  Duration: {Math.max(0, Math.floor((new Date(inlineEndDate + 'T12:00:00').getTime() - new Date(inlineStartDate + 'T12:00:00').getTime()) / (1000 * 60 * 60 * 24)))} days
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.programActions}>
          <TouchableOpacity
            style={styles.assignProgramBtn}
            onPress={() => {
              setPickerMode('program');
              setPickerSearch('');
            }}
          >
            <Ionicons name={currentProgram ? 'swap-horizontal' : 'add-circle'} size={18} color={COLORS.accent} />
            <Text style={styles.assignProgramBtnText}>
              {currentProgram ? 'Change Program' : 'Assign Program'}
            </Text>
          </TouchableOpacity>

          {isActive && (
            <TouchableOpacity
              style={styles.stopProgramBtn}
              onPress={() => {
                setStopDateInput(getTodayDate());
                setPickerMode('stopProgram');
              }}
            >
              <Ionicons name="stop-circle" size={18} color={COLORS.danger} />
              <Text style={styles.stopProgramBtnText}>Stop Program</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Nutrition Toggle ── */}

        <View style={styles.nutritionSection}>
          <Text style={styles.nutritionSectionLabel}>Nutrition Coaching</Text>
          <TouchableOpacity
            style={[
              styles.nutritionToggle,
              hasNutrition ? styles.nutritionToggleOn : styles.nutritionToggleOff,
            ]}
            onPress={() => setHasNutrition(!hasNutrition)}
            activeOpacity={0.7}
          >
            <View style={[
              styles.nutritionToggleTrack,
              hasNutrition ? styles.nutritionTrackOn : styles.nutritionTrackOff,
            ]}>
              <View style={styles.nutritionToggleThumb}>
                <Ionicons
                  name={hasNutrition ? 'leaf' : 'leaf-outline'}
                  size={13}
                  color={hasNutrition ? '#9b59b6' : COLORS.textMuted}
                />
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[
                styles.nutritionToggleLabel,
                { color: hasNutrition ? '#9b59b6' : COLORS.textMuted },
              ]}>
                {hasNutrition ? 'Nutrition Included' : 'No Nutrition'}
              </Text>
              <Text style={styles.nutritionToggleHint}>
                {hasNutrition
                  ? 'Client has nutrition coaching with their program'
                  : 'Tap to add nutrition coaching to this client'}
              </Text>
            </View>
            {hasNutrition && (
              <View style={styles.nutritionActiveBadge}>
                <Ionicons name="checkmark-circle" size={14} color="#9b59b6" />
              </View>
            )}
          </TouchableOpacity>
        </View>


        {/* Program History */}
        {programHistory.length > 0 && (
          <View style={styles.historySection}>
            <Text style={styles.historyTitle}>Program History</Text>
            {programHistory.map((entry, idx) => {
              const histProg = getProgramDefinition(entry.program);
              const histColor = histProg?.color || '#94A3B8';
              return (
                <View key={entry.id || idx} style={styles.historyItem}>
                  <View style={[styles.historyDot, { backgroundColor: entry.status === 'active' ? COLORS.success : histColor }]} />
                  <View style={styles.historyContent}>
                    <View style={styles.historyHeader}>
                      <Text style={[styles.historyProgram, { color: histColor }]}>{entry.program}</Text>
                      <View style={[
                        styles.historyStatusBadge,
                        { backgroundColor: entry.status === 'active' ? COLORS.success + '15' : COLORS.textMuted + '15' }
                      ]}>
                        <Text style={[
                          styles.historyStatusText,
                          { color: entry.status === 'active' ? COLORS.success : COLORS.textMuted }
                        ]}>
                          {entry.status === 'active' ? 'Active' : 'Stopped'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.historyDates}>
                      {formatDisplayDate(entry.start_date)}
                      {entry.stop_date ? ` — ${formatDisplayDate(entry.stop_date)}` : ' — Present'}
                    </Text>
                    {entry.notes && (
                      <Text style={styles.historyNotes}>{entry.notes}</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
        {loadingHistory && (
          <View style={{ paddingVertical: SPACING.md, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={COLORS.accent} />
          </View>
        )}
      </View>
    );
  };

  // ── Determine which view to show ──
  const renderContent = () => {
    if (pickerMode === 'program') return renderProgramPickerView();
    if (pickerMode === 'startDate') return renderStartDateView();
    if (pickerMode === 'stopProgram') return renderStopProgramView();
    if (pickerMode === 'trainer' || pickerMode === 'dietitian') return renderStaffPickerView();
    return null;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Show picker view OR form view */}
        {pickerMode !== 'none' ? renderContent() : (
          <>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity onPress={handleClose} style={styles.headerBtn}>
                <Ionicons name="close" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Edit Profile</Text>
              <TouchableOpacity
                onPress={handleSave}
                style={[styles.saveBtn, (!hasChanges() || saving) && styles.saveBtnDisabled]}
                disabled={!hasChanges() || saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : saved ? (
                  <Ionicons name="checkmark-circle" size={18} color={COLORS.white} />
                ) : (
                  <Text style={styles.saveBtnText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Success Banner */}
            {saved && (
              <View style={styles.successBanner}>
                <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
                <Text style={styles.successText}>Profile updated successfully!</Text>
              </View>
            )}

            <ScrollView
              ref={scrollRef}
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Avatar Section */}
              <View style={styles.avatarSection}>
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarText}>
                    {fullName ? fullName.charAt(0).toUpperCase() : '?'}
                  </Text>
                </View>
                <TouchableOpacity style={styles.changePhotoBtn}>
                  <Ionicons name="camera-outline" size={14} color={COLORS.accent} />
                  <Text style={styles.changePhotoText}>Change Photo</Text>
                </TouchableOpacity>
              </View>

              {/* ── Program Section ── */}
              {renderProgramSection()}

              {/* ── Personal Information ── */}
              <View style={styles.formSection}>
                <View style={styles.sectionTitleRow}>
                  <View style={[styles.sectionIconBg, { backgroundColor: '#3498db15' }]}>
                    <Ionicons name="person" size={16} color="#3498db" />
                  </View>
                  <Text style={styles.formSectionTitle}>Personal Information</Text>
                </View>

                {/* Full Name */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Full Name</Text>
                  <View style={[styles.inputWrapper, errors.fullName ? styles.inputError : null]}>
                    <Ionicons name="person-outline" size={16} color={COLORS.textMuted} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      value={fullName}
                      onChangeText={(t) => {
                        setFullName(t);
                        if (errors.fullName) setErrors(prev => ({ ...prev, fullName: '' }));
                      }}
                      placeholder="Enter your full name"
                      placeholderTextColor={COLORS.textMuted}
                      autoCapitalize="words"
                      returnKeyType="next"
                    />
                    {fullName.trim().length >= 2 && !errors.fullName && (
                      <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
                    )}
                  </View>
                  {errors.fullName ? <Text style={styles.errorText}>{errors.fullName}</Text> : null}
                </View>

                {/* Email (read-only display) */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Email Address</Text>
                  <View style={[styles.inputWrapper, { backgroundColor: COLORS.borderLight }]}>
                    <Ionicons name="mail-outline" size={16} color={COLORS.textMuted} style={styles.inputIcon} />
                    <Text style={[styles.input, { color: COLORS.textSecondary }]} numberOfLines={1}>
                      {email || 'No email set'}
                    </Text>
                    <Ionicons name="lock-closed-outline" size={14} color={COLORS.textMuted} />
                  </View>
                  <Text style={styles.fieldHint}>Email is managed through account settings</Text>
                </View>

                {/* Address */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>
                    Address <Text style={styles.optionalLabel}>(optional)</Text>
                  </Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="location-outline" size={16} color={COLORS.textMuted} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      value={address}
                      onChangeText={setAddress}
                      placeholder="123 Main St, City, State ZIP"
                      placeholderTextColor={COLORS.textMuted}
                      autoCapitalize="words"
                      returnKeyType="next"
                    />
                  </View>
                </View>

                {/* Phone */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>
                    Phone Number <Text style={styles.optionalLabel}>(optional)</Text>
                  </Text>
                  <View style={[styles.inputWrapper, errors.phone ? styles.inputError : null]}>
                    <Ionicons name="call-outline" size={16} color={COLORS.textMuted} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      value={phone}
                      onChangeText={(t) => {
                        setPhone(t);
                        if (errors.phone) setErrors(prev => ({ ...prev, phone: '' }));
                      }}
                      placeholder="(555) 123-4567"
                      placeholderTextColor={COLORS.textMuted}
                      keyboardType="phone-pad"
                      returnKeyType="next"
                    />
                  </View>
                  {errors.phone ? <Text style={styles.errorText}>{errors.phone}</Text> : null}
                </View>

                {/* Birthdate */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>
                    Birthdate <Text style={styles.optionalLabel}>(optional)</Text>
                  </Text>
                  <BirthdatePicker
                    value={birthdate}
                    onChange={(date) => {
                      setBirthdate(date);
                      if (errors.birthdate) setErrors(prev => ({ ...prev, birthdate: '' }));
                    }}
                    error={errors.birthdate}
                  />
                </View>


              </View>

              {/* ── Professional Information ── */}
              <View style={styles.formSection}>
                <View style={styles.sectionTitleRow}>
                  <View style={[styles.sectionIconBg, { backgroundColor: '#9b59b615' }]}>
                    <Ionicons name="briefcase" size={16} color="#9b59b6" />
                  </View>
                  <Text style={styles.formSectionTitle}>Professional Information</Text>
                </View>

                {/* Occupation */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>
                    Occupation <Text style={styles.optionalLabel}>(optional)</Text>
                  </Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="briefcase-outline" size={16} color={COLORS.textMuted} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      value={occupation}
                      onChangeText={setOccupation}
                      placeholder="e.g. Software Engineer"
                      placeholderTextColor={COLORS.textMuted}
                      autoCapitalize="words"
                      returnKeyType="next"
                    />
                  </View>
                </View>

                {/* Company */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>
                    Company <Text style={styles.optionalLabel}>(optional)</Text>
                  </Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="business-outline" size={16} color={COLORS.textMuted} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      value={company}
                      onChangeText={setCompany}
                      placeholder="e.g. Acme Corp"
                      placeholderTextColor={COLORS.textMuted}
                      autoCapitalize="words"
                      returnKeyType="done"
                    />
                  </View>
                </View>
              </View>

              {/* ── Care Team ── */}
              <View style={styles.formSection}>
                <View style={styles.sectionTitleRow}>
                  <View style={[styles.sectionIconBg, { backgroundColor: '#2ecc7115' }]}>
                    <Ionicons name="people" size={16} color="#2ecc71" />
                  </View>
                  <Text style={styles.formSectionTitle}>Care Team</Text>
                </View>

                {/* Primary Trainer Dropdown */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Primary Trainer</Text>
                  <TouchableOpacity
                    style={styles.dropdownBtn}
                    onPress={() => {
                      setPickerMode('trainer');
                      setPickerSearch('');
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="fitness-outline" size={16} color={COLORS.textMuted} style={styles.inputIcon} />
                    <Text style={[styles.dropdownText, !primaryTrainer && styles.dropdownPlaceholder]}>
                      {primaryTrainer || 'Select a personal trainer'}
                    </Text>
                    {primaryTrainer ? (
                      <TouchableOpacity
                        onPress={() => setPrimaryTrainer('')}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
                      </TouchableOpacity>
                    ) : (
                      <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                    )}
                  </TouchableOpacity>
                  <Text style={styles.fieldHint}>Personal Trainer</Text>
                </View>

                {/* Primary Dietitian Dropdown */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Primary Dietitian</Text>
                  <TouchableOpacity
                    style={styles.dropdownBtn}
                    onPress={() => {
                      setPickerMode('dietitian');
                      setPickerSearch('');
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="nutrition-outline" size={16} color={COLORS.textMuted} style={styles.inputIcon} />
                    <Text style={[styles.dropdownText, !primaryDietitian && styles.dropdownPlaceholder]}>
                      {primaryDietitian || 'Select a dietitian'}
                    </Text>
                    {primaryDietitian ? (
                      <TouchableOpacity
                        onPress={() => setPrimaryDietitian('')}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
                      </TouchableOpacity>
                    ) : (
                      <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                    )}
                  </TouchableOpacity>
                  <Text style={styles.fieldHint}>Dietitian</Text>
                </View>
              </View>

              {/* ── Community ── */}
              <View style={styles.formSection}>
                <View style={styles.sectionTitleRow}>
                  <View style={[styles.sectionIconBg, { backgroundColor: '#3b599815' }]}>
                    <Ionicons name="logo-facebook" size={16} color="#3b5998" />
                  </View>
                  <Text style={styles.formSectionTitle}>Community</Text>
                </View>

                <View style={styles.fbToggleRow}>
                  <View style={styles.fbToggleInfo}>
                    <Text style={styles.fbToggleLabel}>In Facebook Group</Text>
                    <Text style={styles.fbToggleDesc}>
                      Member of the Elect Wellness Facebook community group
                    </Text>
                  </View>
                  <Switch
                    value={inFacebookGroup}
                    onValueChange={setInFacebookGroup}
                    trackColor={{ false: COLORS.border, true: COLORS.accent }}
                    thumbColor={COLORS.white}
                  />
                </View>

                {inFacebookGroup && (
                  <View style={styles.fbActiveCard}>
                    <Ionicons name="checkmark-circle" size={16} color="#2ecc71" />
                    <Text style={styles.fbActiveText}>You're part of the community!</Text>
                  </View>
                )}
              </View>

              {/* ── Account Details (read-only) ── */}
              <View style={styles.formSection}>
                <View style={styles.sectionTitleRow}>
                  <View style={[styles.sectionIconBg, { backgroundColor: '#f39c1215' }]}>
                    <Ionicons name="shield-checkmark" size={16} color="#f39c12" />
                  </View>
                  <Text style={styles.formSectionTitle}>Account Details</Text>
                </View>

                <View style={styles.readOnlyRow}>
                  <Text style={styles.readOnlyLabel}>Role</Text>
                  <View style={styles.readOnlyBadge}>
                    <Text style={styles.readOnlyBadgeText}>
                      {profile?.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : 'Client'}
                    </Text>
                  </View>
                </View>
                {profile?.franchise && (
                  <View style={styles.readOnlyRow}>
                    <Text style={styles.readOnlyLabel}>Franchise</Text>
                    <Text style={styles.readOnlyValue}>{profile.franchise}</Text>
                  </View>
                )}
                <View style={styles.readOnlyRow}>
                  <Text style={styles.readOnlyLabel}>Member ID</Text>
                  <Text style={styles.readOnlyValue}>
                    {profile?.id ? profile.id.substring(0, 8).toUpperCase() : '---'}
                  </Text>
                </View>
              </View>

              <View style={{ height: 40 }} />
            </ScrollView>
          </>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: Platform.OS === 'ios' ? 16 : SPACING.lg,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.text,
  },
  saveBtn: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    minWidth: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: {
    backgroundColor: COLORS.textMuted,
    opacity: 0.5,
  },
  saveBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.white,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.successLight,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.success + '30',
  },
  successText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.success,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },
  // Avatar
  avatarSection: {
    alignItems: 'center',
    marginBottom: SPACING.xxl,
  },
  avatarCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
    borderWidth: 3,
    borderColor: COLORS.accent + '40',
  },
  avatarText: {
    fontSize: FONT_SIZES.hero,
    fontWeight: '800',
    color: COLORS.white,
  },
  changePhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.accent + '12',
    borderWidth: 1,
    borderColor: COLORS.accent + '25',
  },
  changePhotoText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.accent,
  },
  // Form Sections
  formSection: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  sectionIconBg: {
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formSectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: COLORS.text,
    flex: 1,
  },
  fieldGroup: {
    marginBottom: SPACING.lg,
  },
  fieldLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  optionalLabel: {
    fontWeight: '500',
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  fieldHint: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 4,
    marginLeft: 2,
    fontStyle: 'italic',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.borderLight,
    paddingHorizontal: SPACING.md,
    height: 48,
  },
  inputError: {
    borderColor: COLORS.danger,
    backgroundColor: COLORS.dangerLight + '30',
  },
  inputIcon: {
    marginRight: SPACING.sm,
  },
  input: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    fontWeight: '600',
  },
  errorText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.danger,
    fontWeight: '600',
    marginTop: 4,
    marginLeft: 2,
  },
  // Dropdown
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.borderLight,
    paddingHorizontal: SPACING.md,
    height: 48,
  },
  dropdownText: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    fontWeight: '600',
  },
  dropdownPlaceholder: {
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  // Facebook toggle
  fbToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fbToggleInfo: {
    flex: 1,
    marginRight: SPACING.md,
  },
  fbToggleLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.text,
  },
  fbToggleDesc: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 3,
    lineHeight: 16,
  },
  fbActiveCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: '#2ecc7110',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.md,
    borderWidth: 1,
    borderColor: '#2ecc7120',
  },
  fbActiveText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: '#2ecc71',
  },
  // Read-only
  readOnlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  readOnlyLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  readOnlyValue: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.text,
  },
  readOnlyBadge: {
    backgroundColor: COLORS.accent + '15',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },
  readOnlyBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.accent,
  },
  // Picker (inline, no nested Modal)
  pickerOverlay: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: Platform.OS === 'ios' ? 16 : SPACING.lg,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  pickerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.text,
  },
  pickerSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    height: 44,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  pickerSearchInput: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    fontWeight: '500',
  },
  pickerLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  pickerLabelText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
  },
  pickerCountText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  pickerScroll: {
    flex: 1,
  },
  pickerList: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: 40,
    paddingTop: SPACING.sm,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    gap: SPACING.md,
    borderWidth: 1.5,
    borderColor: COLORS.borderLight,
  },
  pickerItemSelected: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accent + '06',
  },
  pickerItemAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerItemAvatarText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
  },
  pickerItemInfo: {
    flex: 1,
  },
  pickerItemName: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.text,
  },
  pickerItemSub: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  pickerItemLabelBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },
  pickerItemLabelText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pickerEmpty: {
    alignItems: 'center',
    paddingVertical: SPACING.xxxl,
    gap: SPACING.sm,
  },
  pickerEmptyText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textMuted,
    fontWeight: '600',
  },

  // ── Program Section Styles ──
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.success + '15',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.success,
  },
  activeBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.success,
  },
  stoppedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.textMuted + '15',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },
  stoppedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.textMuted,
  },
  stoppedBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  currentProgramCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  programColorBar: {
    width: 4,
  },
  currentProgramContent: {
    flex: 1,
    padding: SPACING.md,
  },
  currentProgramHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  currentProgramName: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
  },
  programVariantBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },
  programVariantText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
  },
  programDetailsRow: {
    flexDirection: 'row',
    gap: SPACING.lg,
    marginBottom: SPACING.md,
  },
  programDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  programDetailText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  programDatesRow: {
    flexDirection: 'row',
    gap: SPACING.lg,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  programDateItem: {},
  programDateLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  programDateValue: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.text,
  },
  noProgramCard: {
    alignItems: 'center',
    paddingVertical: SPACING.xxl,
    gap: SPACING.sm,
  },
  noProgramText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  noProgramSub: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
  },
  programActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  assignProgramBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accent + '12',
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.accent + '25',
  },
  assignProgramBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.accent,
  },
  stopProgramBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.danger + '10',
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.danger + '20',
  },
  stopProgramBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.danger,
  },

  // Program Picker specific
  programTierDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  programTierBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },
  programTierBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Start Date / Stop Date views
  selectedProgramCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1.5,
  },
  selectedProgramName: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
  },
  selectedProgramMeta: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    backgroundColor: COLORS.accent + '10',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.accent + '20',
  },
  infoBannerText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.accent,
    lineHeight: 18,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    backgroundColor: COLORS.warningLight,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.warning + '30',
  },
  warningText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.warning,
    lineHeight: 18,
  },
  dateInputSection: {
    marginBottom: SPACING.lg,
  },
  dateInputLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  datePreview: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
    fontWeight: '600',
  },
  quickDateRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.xxl,
  },
  quickDateBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  quickDateBtnActive: {
    backgroundColor: COLORS.accent + '15',
    borderColor: COLORS.accent,
  },
  quickDateText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  quickDateTextActive: {
    color: COLORS.accent,
  },
  assignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accent,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.lg,
    marginBottom: SPACING.md,
  },
  assignBtnDisabled: {
    opacity: 0.5,
  },
  assignBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: COLORS.white,
  },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.danger,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.lg,
    marginBottom: SPACING.md,
  },
  stopBtnDisabled: {
    opacity: 0.5,
  },
  stopBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: COLORS.white,
  },

  // Program History
  historySection: {
    marginTop: SPACING.lg,
    paddingTop: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  historyTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  historyItem: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  historyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  historyContent: {
    flex: 1,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: 2,
  },
  historyProgram: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
  },
  historyStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: BORDER_RADIUS.full,
  },
  historyStatusText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  historyDates: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  historyNotes: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
  },

  // Inline date section
  inlineDateSection: {
    marginBottom: SPACING.md,
    paddingTop: SPACING.sm,
  },
  saveDatesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accent,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.md,
  },
  saveDatesBtnDisabled: {
    opacity: 0.5,
  },
  saveDatesBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.white,
  },
  durationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accent + '10',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.accent + '20',
  },
  durationText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.accent,
  },

  // ── Nutrition Toggle Styles ──
  nutritionSection: {
    marginTop: SPACING.lg,
    paddingTop: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  nutritionSectionLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  nutritionToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5,
  },
  nutritionToggleOn: {
    borderColor: '#9b59b650',
    backgroundColor: '#9b59b610',
  },
  nutritionToggleOff: {
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.background,
  },
  nutritionToggleTrack: {
    width: 44,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  nutritionTrackOn: {
    backgroundColor: '#9b59b630',
    alignItems: 'flex-end',
  },
  nutritionTrackOff: {
    backgroundColor: COLORS.borderLight,
    alignItems: 'flex-start',
  },
  nutritionToggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  nutritionToggleLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
  },
  nutritionToggleHint: {
    fontSize: 10,
    fontWeight: '500',
    color: COLORS.textMuted,
    marginTop: 1,
  },
  nutritionActiveBadge: {
    marginLeft: SPACING.sm,
  },
});
