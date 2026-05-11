import React, { useState, useRef, useEffect } from 'react';

import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Modal, ActivityIndicator, Platform, KeyboardAvoidingView, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import { addBiometricEntry, uploadBiometricPhoto, requestPosturalAssessment, savePosturalAssessment } from '../../lib/clientDataService';
import type { BiometricEntry } from '../../data/clientPortalData';
import type { PosturalAssessment } from '../../lib/clientDataService';
import CameraCapture from './CameraCapture';
import { usePlatformAlert } from '../../lib/platformAlert';
import { emitBiometricsUpdated } from '../../lib/biometricEvents';





interface BiometricEntryFormProps {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  userId: string;
  latestEntry?: BiometricEntry | null;
  initialHeight?: number; // Height from the first/initial assessment
  clientName?: string; // Optional: show client name banner when opened from schedule
}


interface FormSection {
  title: string;
  icon: string;
  color: string;
  fields: FormField[];
}

interface FormField {
  key: string;
  label: string;
  unit: string;
  placeholder: string;
  keyboardType?: 'numeric' | 'decimal-pad';
  readOnly?: boolean;
  computed?: boolean;
  // When true, an explicit value of 0 (or a negative value) is treated as a
  // valid entered measurement — not as "missing / skipped". Useful for metrics
  // like flexibility (sit-and-reach) where 0 means "fingertips at toes" and
  // negative values are legitimate.
  zeroAllowed?: boolean;
}


// BMI calculation: (weight in lbs / (height in inches)^2) * 703
function calculateBMI(weightLbs: number, heightInches: number): number {
  if (!weightLbs || !heightInches || heightInches === 0) return 0;
  return parseFloat(((weightLbs / (heightInches * heightInches)) * 703).toFixed(1));
}

// Compute derived body composition fields
// muscleMassPct is a manual input; muscleMass = weight * (muscleMassPct / 100)
function computeFormBodyComp(weight: number, bodyFat: number, muscleMassPct: number): {
  leanMusclePct: string;
  fatMass: string;
  leanMuscleMass: string;
  muscleMass: string;
  massPerMuscleLb: string;
} {
  const leanMusclePct = (weight && bodyFat) ? (100 - bodyFat).toFixed(1) : '';
  const fatMass = (weight && bodyFat) ? (weight * (bodyFat / 100)).toFixed(1) : '';
  const leanMuscleMass = (weight && fatMass) ? (weight - parseFloat(fatMass)).toFixed(1) : '';
  // Muscle Mass = Total Weight × Muscle Mass %
  const muscleMass = (weight && muscleMassPct && muscleMassPct > 0)
    ? (weight * (muscleMassPct / 100)).toFixed(1)
    : '';
  const massPerMuscleLb = (weight && muscleMass && parseFloat(muscleMass) > 0)
    ? (weight / parseFloat(muscleMass)).toFixed(2)
    : '';
  return { leanMusclePct, fatMass, leanMuscleMass, muscleMass, massPerMuscleLb };
}


const FORM_SECTIONS: FormSection[] = [
  {
    title: 'Cardiovascular',
    icon: 'heart-outline',
    color: '#e74c3c',
    fields: [
      { key: 'bloodPressureSys', label: 'BP Systolic', unit: 'mmHg', placeholder: '0' },
      { key: 'bloodPressureDia', label: 'BP Diastolic', unit: 'mmHg', placeholder: '0' },
      { key: 'heartRate', label: 'Heart Rate', unit: 'bpm', placeholder: '0' },
      { key: 'bodyAge', label: 'Body Age', unit: 'yrs', placeholder: '0' },
    ],
  },

  {

    title: 'Body Composition',
    icon: 'body-outline',
    color: '#ff6b6b',
    fields: [
      { key: 'height', label: 'Height', unit: 'in', placeholder: '0.0' },
      { key: 'weight', label: 'Weight', unit: 'lbs', placeholder: '0.0' },
      { key: 'bmi', label: 'BMI', unit: '', placeholder: '--', readOnly: true, computed: true },
      { key: 'bodyFat', label: 'Body Fat', unit: '%', placeholder: '0.0' },
      { key: 'muscleMassPct', label: 'Muscle Mass %', unit: '%', placeholder: '0.0' },
      { key: 'leanMusclePct', label: 'Lean Muscle %', unit: '%', placeholder: '--', readOnly: true, computed: true },
      { key: 'fatMass', label: 'Fat Mass', unit: 'lbs', placeholder: '--', readOnly: true, computed: true },
      { key: 'leanMuscleMass', label: 'Lean Muscle Mass', unit: 'lbs', placeholder: '--', readOnly: true, computed: true },
      { key: 'muscleMass', label: 'Muscle Mass', unit: 'lbs', placeholder: '--', readOnly: true, computed: true },
      { key: 'massPerMuscleLb', label: 'Mass / Muscle Lb', unit: '', placeholder: '--', readOnly: true, computed: true },
      { key: 'visceralFat', label: 'Visceral Fat', unit: '', placeholder: '0' },
    ],
  },

  {
    title: 'Waist Measurements',
    icon: 'resize-outline',
    color: '#e74c3c',
    fields: [
      { key: 'navelWaist', label: 'Navel Waist', unit: 'in', placeholder: '0.0' },
      { key: 'widestWaist', label: 'Widest Waist', unit: 'in', placeholder: '0.0' },
      { key: 'narrowestWaist', label: 'Narrowest Waist', unit: 'in', placeholder: '0.0' },
    ],
  },
  {
    title: 'Upper Body',
    icon: 'fitness-outline',
    color: '#3498db',
    fields: [
      { key: 'shoulders', label: 'Shoulders', unit: 'in', placeholder: '0.0' },
      { key: 'bicep', label: 'Bicep', unit: 'in', placeholder: '0.0' },
    ],
  },
  {
    title: 'Lower Body',
    icon: 'walk-outline',
    color: '#2ecc71',
    fields: [
      { key: 'sideHip', label: 'Side Hip', unit: 'in', placeholder: '0.0' },
      { key: 'rearHip', label: 'Rear Hip', unit: 'in', placeholder: '0.0' },
      { key: 'calf', label: 'Calf', unit: 'in', placeholder: '0.0' },
    ],
  },
  {
    title: 'Performance',
    icon: 'speedometer-outline',
    color: '#9b59b6',
    fields: [
      // Flexibility (sit-and-reach) can legitimately be 0 (fingertips at toes)
      // or negative (short of toes), so 0 must NOT be treated as "missing".
      { key: 'flexibility', label: 'Flexibility', unit: 'in', placeholder: '0.0', zeroAllowed: true },
    ],
  },
];




type PhotoType = 'front' | 'side' | 'back';

export default function BiometricEntryForm({ visible, onClose, onSaved, userId, latestEntry, initialHeight, clientName }: BiometricEntryFormProps) {

  const { platformAlert } = usePlatformAlert();
  const [step, setStep] = useState<'form' | 'photos' | 'assessment' | 'success'>('form');

  const [saving, setSaving] = useState(false);
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  // Default: ALL sections expanded for speed of entry
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set(FORM_SECTIONS.map((_, i) => i)));
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [measureDate, setMeasureDate] = useState(new Date().toISOString().split('T')[0]);
  const [photos, setPhotos] = useState<Record<PhotoType, string | null>>({ front: null, side: null, back: null });
  const [photoUrls, setPhotoUrls] = useState<Record<PhotoType, string | null>>({ front: null, side: null, back: null });
  const [assessment, setAssessment] = useState<PosturalAssessment | null>(null);
  const [savedEntryId, setSavedEntryId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const [heightLocked, setHeightLocked] = useState(false); // tracks whether height was auto-populated

  // Camera state
  const [showCamera, setShowCamera] = useState(false);
  const [cameraPose, setCameraPose] = useState<PhotoType>('front');

  // Skip confirmation state
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const [skippedItems, setSkippedItems] = useState<string[]>([]);
  const pendingSkipActionRef = useRef<(() => void) | null>(null);




  // Auto-populate height from initial assessment when form opens
  useEffect(() => {
    if (visible && initialHeight && initialHeight > 0 && !formValues['height']) {
      setFormValues(prev => ({ ...prev, height: String(initialHeight) }));
      setHeightLocked(true);
    }
  }, [visible, initialHeight]);

  // Auto-calculate BMI whenever height or weight changes
  useEffect(() => {
    const heightVal = parseFloat(formValues['height'] || '0');
    const weightVal = parseFloat(formValues['weight'] || '0');
    const bmi = calculateBMI(weightVal, heightVal);
    if (bmi > 0) {
      setFormValues(prev => ({ ...prev, bmi: String(bmi) }));
    } else if (formValues['bmi']) {
      setFormValues(prev => ({ ...prev, bmi: '' }));
    }
  }, [formValues['height'], formValues['weight']]);

  // Auto-calculate body composition derived fields whenever weight, bodyFat, or muscleMassPct changes
  useEffect(() => {
    const weightVal = parseFloat(formValues['weight'] || '0');
    const bodyFatVal = parseFloat(formValues['bodyFat'] || '0');
    const muscleMassPctVal = parseFloat(formValues['muscleMassPct'] || '0');
    const comp = computeFormBodyComp(weightVal, bodyFatVal, muscleMassPctVal);
    setFormValues(prev => ({
      ...prev,
      leanMusclePct: comp.leanMusclePct,
      fatMass: comp.fatMass,
      leanMuscleMass: comp.leanMuscleMass,
      muscleMass: comp.muscleMass,
      massPerMuscleLb: comp.massPerMuscleLb,
    }));
  }, [formValues['weight'], formValues['bodyFat'], formValues['muscleMassPct']]);


  const openCamera = (pose: PhotoType) => {
    setCameraPose(pose);
    setShowCamera(true);
  };

  const handleCameraCapture = (photoDataUrl: string, poseType: PhotoType) => {
    setPhotos(prev => ({ ...prev, [poseType]: photoDataUrl }));
    setShowCamera(false);
    // Auto-advance to next pose if not all captured
    const nextPose: Record<PhotoType, PhotoType | null> = { front: 'side', side: 'back', back: null };
    const next = nextPose[poseType];
    if (next && !photos[next]) {
      // Small delay so user can see the captured photo
      setTimeout(() => {
        setCameraPose(next);
        setShowCamera(true);
      }, 800);
    }
  };

  const resetForm = () => {
    setStep('form');
    setFormValues({});
    setNotes('');
    setMeasureDate(new Date().toISOString().split('T')[0]);
    setPhotos({ front: null, side: null, back: null });
    setPhotoUrls({ front: null, side: null, back: null });
    setAssessment(null);
    setSavedEntryId(null);
    setExpandedSections(new Set(FORM_SECTIONS.map((_, i) => i)));
    setShowCamera(false);
    setHeightLocked(false);
    setShowSkipConfirm(false);
    setSkippedItems([]);
    pendingSkipActionRef.current = null;
  };



  const handleClose = () => {
    resetForm();
    onClose();
  };

  const toggleSection = (index: number) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleHeightChange = (newValue: string) => {
    // If height was auto-populated and user is trying to change it, show confirmation
    if (heightLocked && initialHeight && initialHeight > 0) {
      const currentHeight = formValues['height'] || '';
      if (newValue !== currentHeight && newValue !== '') {
        platformAlert(
          'Override Height?',
          `Your height was set to ${initialHeight} in from your initial assessment. Are you sure you want to change it to ${newValue} in?`,
          [
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => {
                setFormValues(prev => ({ ...prev, height: String(initialHeight) }));
              },
            },
            {
              text: 'Yes, Update Height',
              style: 'destructive',
              onPress: () => {
                setFormValues(prev => ({ ...prev, height: newValue }));
                setHeightLocked(false);
              },
            },
          ]
        );
        return;
      }
    }
    if (newValue === '' || /^-?\d*\.?\d*$/.test(newValue)) {
      setFormValues(prev => ({ ...prev, height: newValue }));
    }
  };

  const COMPUTED_KEYS = new Set(['bmi', 'leanMusclePct', 'fatMass', 'leanMuscleMass', 'muscleMass', 'massPerMuscleLb']);

  const updateField = (key: string, value: string) => {
    if (key === 'height') { handleHeightChange(value); return; }
    if (COMPUTED_KEYS.has(key)) return;
    if (value === '' || /^-?\d*\.?\d*$/.test(value)) {
      setFormValues(prev => ({ ...prev, [key]: value }));
    }
  };

  const getFieldValue = (key: string): string => {
    if (formValues[key] !== undefined) return formValues[key];
    if (COMPUTED_KEYS.has(key)) return '';
    if (latestEntry) {
      const val = (latestEntry as any)[key];
      if (val !== undefined && val !== 0) return String(val);
    }
    return '';
  };

  const pickPhoto = async (type: PhotoType) => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e: any) => {
        const file = e.target?.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const dataUrl = ev.target?.result as string;
            setPhotos(prev => ({ ...prev, [type]: dataUrl }));
          };
          reader.readAsDataURL(file);
        }
      };
      input.click();
    } else {
      platformAlert(
        'Select Photo',
        'Photo upload from device is available. Please select a photo from your library.',
        [
          {
            text: 'Choose Photo',
            onPress: () => {
              platformAlert('Info', 'Install expo-image-picker for native photo selection. Photos can be uploaded on web.');
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    }
  };

  // ── Collect missing (skipped) items for validation ──
  // A field is "missing" only when no value has been entered. Empty string and
  // `undefined` always count as missing. The literal '0' is considered missing
  // for most metrics (a weight / BP / waist of 0 is clearly not measured), but
  // fields flagged `zeroAllowed` (e.g. Flexibility — sit-and-reach can be 0 or
  // negative) treat '0' as a valid entered value.
  const getMissingMeasurements = (): string[] => {
    const missing: string[] = [];
    for (const section of FORM_SECTIONS) {
      for (const field of section.fields) {
        // Skip computed/readOnly fields — they auto-fill from other inputs
        if (field.readOnly || field.computed) continue;
        const val = formValues[field.key];
        const isEmpty = val === undefined || val === null || val === '';
        // Treat "just a minus sign" as still-empty (user started typing a negative)
        const isPartial = val === '-' || val === '.' || val === '-.';
        // '0' counts as missing UNLESS this field explicitly allows zero.
        const isZero = !field.zeroAllowed && (val === '0' || val === '0.0' || val === '0.00');
        if (isEmpty || isPartial || isZero) {
          missing.push(`${section.title} — ${field.label}`);
        }
      }
    }
    return missing;
  };


  const getMissingPhotos = (): string[] => {
    const missing: string[] = [];
    if (!photos.front) missing.push('Front View photo');
    if (!photos.side) missing.push('Side View photo');
    if (!photos.back) missing.push('Back View photo');
    return missing;
  };

  // ── Actual save logic (called after validation or skip confirmation) ──
  const executeSaveMeasurements = async () => {
    setSaving(true);
    try {
      const entry: Partial<BiometricEntry> & { date: string } = { date: measureDate };
      for (const section of FORM_SECTIONS) {
        for (const field of section.fields) {
          const val = formValues[field.key];
          if (val !== undefined && val !== '') {
            (entry as any)[field.key] = parseFloat(val);
          }
        }
      }
      if (notes.trim()) { entry.notes = notes.trim(); }

      const { data, error } = await addBiometricEntry(userId, entry);
      if (error) {
        platformAlert('Error', 'Failed to save measurement. Please try again.');
        console.error('Save error:', error);
        setSaving(false);
        return;
      }
      setSavedEntryId(data?.id || null);
      setStep('photos');
    } catch (err) {
      platformAlert('Error', 'An unexpected error occurred.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMeasurements = async () => {
    // "Has any value entered?" — mirrors getMissingMeasurements semantics so that
    // a legitimate 0 on a zeroAllowed field (e.g. Flexibility) counts as data.
    const hasValues = FORM_SECTIONS.some(section =>
      section.fields.some(field => {
        if (field.readOnly || field.computed) return false;
        const val = formValues[field.key];
        if (val === undefined || val === null || val === '') return false;
        if (val === '-' || val === '.' || val === '-.') return false;
        if (!field.zeroAllowed && (val === '0' || val === '0.0' || val === '0.00')) return false;
        return true;
      })
    );
    if (!hasValues) {
      platformAlert('No Data', 'Please enter at least one measurement value.');
      return;
    }

    // Check for missing measurements
    const missing = getMissingMeasurements();
    if (missing.length > 0) {
      // Show skip confirmation modal
      setSkippedItems(missing);
      pendingSkipActionRef.current = () => {
        setShowSkipConfirm(false);
        executeSaveMeasurements();
      };
      setShowSkipConfirm(true);
      return;
    }

    // All fields filled — save directly
    await executeSaveMeasurements();
  };



  // ── Actual photo upload logic (called after validation or skip confirmation) ──
  const executeUploadPhotos = async () => {
    setSaving(true);
    const uploadedUrls: Record<PhotoType, string | null> = { front: null, side: null, back: null };

    try {
      for (const type of ['front', 'side', 'back'] as PhotoType[]) {
        if (photos[type]) {
          const { url, error } = await uploadBiometricPhoto(
            userId,
            photos[type]!,
            type,
            savedEntryId || undefined
          );
          if (url) {
            uploadedUrls[type] = url;
          }
          if (error) {
            console.error(`Error uploading ${type} photo:`, error);
          }
        }
      }
      setPhotoUrls(uploadedUrls);
    } catch (err) {
      console.error('Photo upload error:', err);
    } finally {
      setSaving(false);
    }

    // Run postural assessment
    const hasPhotos = Object.values(uploadedUrls).some(u => u);
    if (hasPhotos || Object.values(formValues).some(v => v !== '')) {
      setAssessmentLoading(true);
      setStep('assessment');

      const biometricData: any = {};
      for (const section of FORM_SECTIONS) {
        for (const field of section.fields) {
          const val = formValues[field.key];
          if (val) biometricData[field.key] = parseFloat(val);
        }
      }

      try {
        const { assessment: result, error } = await requestPosturalAssessment(
          uploadedUrls as any,
          biometricData
        );
        if (result) {
          setAssessment(result);
          if (savedEntryId) {
            // Pass the uploaded photo URLs so the history screen can render
            // before/after thumbnails for each saved assessment.
            await savePosturalAssessment(userId, savedEntryId, result, uploadedUrls as any);
          }

        } else {
          console.error('Assessment error:', error);
        }
      } catch (err) {
        console.error('Assessment request error:', err);
      } finally {
        setAssessmentLoading(false);
      }
    } else {
      setStep('success');
    }
  };

  const handleUploadPhotos = async () => {
    // Check for missing photos
    const missingPhotos = getMissingPhotos();
    if (missingPhotos.length > 0) {
      setSkippedItems(missingPhotos);
      pendingSkipActionRef.current = () => {
        setShowSkipConfirm(false);
        executeUploadPhotos();
      };
      setShowSkipConfirm(true);
      return;
    }
    // All photos present — upload directly
    await executeUploadPhotos();
  };

  const handleSkipPhotos = () => {
    // All 3 photos are missing when skipping
    const missingPhotos = getMissingPhotos();
    if (missingPhotos.length > 0) {
      setSkippedItems(missingPhotos);
      pendingSkipActionRef.current = () => {
        setShowSkipConfirm(false);
        setStep('success');
      };
      setShowSkipConfirm(true);
      return;
    }
    setStep('success');
  };



  const handleFinish = () => {
    // Notify all listeners that biometric data has been updated for this user
    emitBiometricsUpdated(userId);
    onSaved();
    handleClose();
  };


  const filledCount = Object.values(formValues).filter(v => v !== '' && v !== undefined).length;
  const totalFields = FORM_SECTIONS.reduce((sum, s) => sum + s.fields.length, 0);

  // ============================================================
  // RENDER: FORM STEP
  // ============================================================
  const renderFormStep = () => (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView ref={scrollRef} style={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Date Picker */}
        <View style={styles.dateSection}>
          <View style={styles.dateIcon}>
            <Ionicons name="calendar" size={20} color="#9b59b6" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.dateLabel}>Measurement Date</Text>
            <TextInput
              style={styles.dateInput}
              value={measureDate}
              onChangeText={setMeasureDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={COLORS.textMuted}
            />
          </View>
        </View>

        {/* Progress indicator */}
        <View style={styles.progressIndicator}>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${(filledCount / totalFields) * 100}%` }]} />
          </View>
          <Text style={styles.progressText}>{filledCount} of {totalFields} fields filled</Text>
        </View>

        {/* Form Sections */}
        {FORM_SECTIONS.map((section, sIdx) => {
          const isExpanded = expandedSections.has(sIdx);
          const sectionFilledCount = section.fields.filter(f => formValues[f.key] && formValues[f.key] !== '').length;
          
          return (
            <View key={sIdx} style={styles.formSection}>
              <TouchableOpacity style={styles.sectionHeader} onPress={() => toggleSection(sIdx)} activeOpacity={0.7}>
                <View style={[styles.sectionIconBg, { backgroundColor: section.color + '15' }]}>
                  <Ionicons name={section.icon as any} size={18} color={section.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                  <Text style={styles.sectionSubtitle}>
                    {sectionFilledCount}/{section.fields.length} fields
                  </Text>
                </View>
                {sectionFilledCount > 0 && (
                  <View style={[styles.filledBadge, { backgroundColor: section.color + '15' }]}>
                    <Ionicons name="checkmark-circle" size={14} color={section.color} />
                  </View>
                )}
                <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.textMuted} />
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.fieldsContainer}>
                  {section.fields.map((field) => {
                    const isReadOnly = field.readOnly || false;
                    const isHeightLocked = field.key === 'height' && heightLocked;
                    return (
                    <View key={field.key} style={[styles.fieldRow, isReadOnly && { backgroundColor: '#f8f9fa' }]}>
                      <View style={styles.fieldLabelRow}>
                        <Text style={styles.fieldLabel}>{field.label}</Text>
                        {field.unit ? <Text style={styles.fieldUnit}>{field.unit}</Text> : null}
                        {isReadOnly && <Text style={{ fontSize: 9, color: '#9b59b6', fontWeight: '700', marginLeft: 4 }}>AUTO</Text>}
                        {isHeightLocked && <Ionicons name="lock-closed" size={12} color="#f39c12" style={{ marginLeft: 4 }} />}
                      </View>
                      <TextInput
                        style={[styles.fieldInput, isReadOnly && { backgroundColor: '#f0f0f0', color: '#9b59b6' }]}
                        value={getFieldValue(field.key)}
                        onChangeText={(v) => updateField(field.key, v)}
                        placeholder={field.placeholder}
                        placeholderTextColor={COLORS.textMuted}
                        keyboardType="decimal-pad"
                        returnKeyType="next"
                        editable={!isReadOnly}
                      />
                    </View>
                    );
                  })}

                </View>
              )}
            </View>
          );
        })}

        {/* Notes */}
        <View style={styles.notesSection}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIconBg, { backgroundColor: '#f39c1215' }]}>
              <Ionicons name="document-text-outline" size={18} color="#f39c12" />
            </View>
            <Text style={styles.sectionTitle}>Notes</Text>
          </View>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="Add any notes about this measurement session..."
            placeholderTextColor={COLORS.textMuted}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSaveMeasurements}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="save-outline" size={20} color="#fff" />
              <Text style={styles.saveBtnText}>Save Measurements & Continue</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );

  // ============================================================
  // RENDER: PHOTOS STEP
  // ============================================================
  const POSE_COLORS: Record<PhotoType, string> = { front: '#2ecc71', side: '#3498db', back: '#f39c12' };

  const renderPhotosStep = () => (
    <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.photoHeader}>
        <View style={[styles.photoHeaderIcon, { backgroundColor: '#3498db15' }]}>
          <Ionicons name="camera-outline" size={32} color="#3498db" />
        </View>
        <Text style={styles.photoTitle}>Progress Photos</Text>
        <Text style={styles.photoSubtitle}>
          Capture front, side, and back photos using your camera or upload from files for a comprehensive AI postural assessment.
        </Text>
      </View>

      {/* Camera Capture CTA */}
      <View style={styles.cameraCaptureSection}>
        <TouchableOpacity
          style={styles.cameraCaptureCta}
          onPress={() => {
            // Start with the first pose that doesn't have a photo
            const firstEmpty = (['front', 'side', 'back'] as PhotoType[]).find(t => !photos[t]) || 'front';
            openCamera(firstEmpty);
          }}
          activeOpacity={0.7}
        >
          <View style={styles.cameraCaptureIconBg}>
            <Ionicons name="videocam-outline" size={24} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cameraCaptureTitle}>Use Camera</Text>
            <Text style={styles.cameraCaptureSubtitle}>
              Live preview with pose guides, countdown timer & auto-capture
            </Text>
          </View>
          <View style={styles.cameraCaptureArrow}>
            <Ionicons name="chevron-forward" size={18} color="#9b59b6" />
          </View>
        </TouchableOpacity>

        {/* Quick camera buttons per pose */}
        <View style={styles.quickCameraRow}>
          {(['front', 'side', 'back'] as PhotoType[]).map(pose => (
            <TouchableOpacity
              key={pose}
              style={[
                styles.quickCameraBtn,
                photos[pose] && { backgroundColor: POSE_COLORS[pose] + '15', borderColor: POSE_COLORS[pose] + '40' },
              ]}
              onPress={() => openCamera(pose)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={photos[pose] ? 'checkmark-circle' : 'camera-outline'}
                size={16}
                color={photos[pose] ? POSE_COLORS[pose] : COLORS.textMuted}
              />
              <Text style={[
                styles.quickCameraBtnText,
                photos[pose] && { color: POSE_COLORS[pose] },
              ]}>
                {pose.charAt(0).toUpperCase() + pose.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Divider */}
      <View style={styles.orDivider}>
        <View style={styles.orDividerLine} />
        <Text style={styles.orDividerText}>or upload files</Text>
        <View style={styles.orDividerLine} />
      </View>

      {/* Photo Cards (file upload) */}
      <View style={styles.photoGrid}>
        {(['front', 'side', 'back'] as PhotoType[]).map((type) => (
          <TouchableOpacity
            key={type}
            style={styles.photoCard}
            onPress={() => pickPhoto(type)}
            activeOpacity={0.7}
          >
            {photos[type] ? (
              <View style={styles.photoPreviewContainer}>
                <Image source={{ uri: photos[type]! }} style={styles.photoPreview} />
                <View style={styles.photoOverlay}>
                  <Ionicons name="checkmark-circle" size={24} color="#2ecc71" />
                </View>
                <TouchableOpacity
                  style={styles.photoRemoveBtn}
                  onPress={() => setPhotos(prev => ({ ...prev, [type]: null }))}
                >
                  <Ionicons name="close-circle" size={22} color="#e74c3c" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.photoPlaceholder}>
                <Ionicons name="person-outline" size={40} color={COLORS.textMuted} />
                <View style={styles.photoAddIcon}>
                  <Ionicons name="add-circle" size={22} color="#3498db" />
                </View>
              </View>
            )}
            <Text style={styles.photoLabel}>{type.charAt(0).toUpperCase() + type.slice(1)} View</Text>
            <Text style={styles.photoHint}>
              {photos[type] ? 'Tap to change' : 'Tap to upload'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Photo progress indicator */}
      <View style={styles.photoProgressBar}>
        <View style={styles.photoProgressTrack}>
          <View style={[styles.photoProgressFill, {
            width: `${(Object.values(photos).filter(p => p).length / 3) * 100}%`
          }]} />
        </View>
        <Text style={styles.photoProgressText}>
          {Object.values(photos).filter(p => p).length}/3 photos captured
        </Text>
      </View>

      <View style={styles.photoTips}>
        <Text style={styles.tipsTitle}>Photo Tips</Text>
        <View style={styles.tipRow}>
          <Ionicons name="sunny-outline" size={16} color="#f39c12" />
          <Text style={styles.tipText}>Use consistent, well-lit environment</Text>
        </View>
        <View style={styles.tipRow}>
          <Ionicons name="shirt-outline" size={16} color="#3498db" />
          <Text style={styles.tipText}>Wear fitted clothing for accurate assessment</Text>
        </View>
        <View style={styles.tipRow}>
          <Ionicons name="body-outline" size={16} color="#2ecc71" />
          <Text style={styles.tipText}>Stand naturally with arms at your sides</Text>
        </View>
        <View style={styles.tipRow}>
          <Ionicons name="grid-outline" size={16} color="#9b59b6" />
          <Text style={styles.tipText}>Use the same background each time</Text>
        </View>
      </View>

      <View style={styles.photoActions}>
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleUploadPhotos}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
              <Text style={styles.saveBtnText}>
                {Object.values(photos).some(p => p) ? 'Upload & Get Assessment' : 'Continue Without Photos'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipBtn} onPress={handleSkipPhotos}>
          <Text style={styles.skipBtnText}>Skip Photos</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );


  // ============================================================
  // RENDER: ASSESSMENT STEP
  // ============================================================
  const renderAssessmentStep = () => (
    <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
      {assessmentLoading ? (
        <View style={styles.assessmentLoading}>
          <ActivityIndicator size="large" color="#9b59b6" />
          <Text style={styles.assessmentLoadingTitle}>Analyzing Your Data...</Text>
          <Text style={styles.assessmentLoadingText}>
            Our AI is reviewing your measurements and photos to create a comprehensive postural assessment.
          </Text>
        </View>
      ) : assessment ? (
        <>
          {/* Score Card */}
          <View style={styles.scoreCard}>
            <View style={styles.scoreCircle}>
              <Text style={styles.scoreNumber}>{assessment.overallScore}</Text>
              <Text style={styles.scoreLabel}>/ 100</Text>
            </View>
            <Text style={styles.scoreSummary}>{assessment.summary}</Text>
          </View>

          {/* Findings */}
          {assessment.findings && assessment.findings.length > 0 && (
            <View style={styles.assessmentSection}>
              <Text style={styles.assessmentSectionTitle}>Key Findings</Text>
              {assessment.findings.map((finding, i) => (
                <View key={i} style={styles.findingCard}>
                  <View style={[styles.findingSeverity, {
                    backgroundColor: finding.severity === 'significant' ? '#e74c3c15' :
                      finding.severity === 'moderate' ? '#f39c1215' : '#2ecc7115'
                  }]}>
                    <Ionicons
                      name={(finding.icon || 'alert-circle-outline') as any}
                      size={18}
                      color={finding.severity === 'significant' ? '#e74c3c' :
                        finding.severity === 'moderate' ? '#f39c12' : '#2ecc71'}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.findingArea}>{finding.area}</Text>
                    <Text style={styles.findingText}>{finding.observation}</Text>
                    <View style={[styles.severityBadge, {
                      backgroundColor: finding.severity === 'significant' ? '#e74c3c15' :
                        finding.severity === 'moderate' ? '#f39c1215' : '#2ecc7115'
                    }]}>
                      <Text style={[styles.severityText, {
                        color: finding.severity === 'significant' ? '#e74c3c' :
                          finding.severity === 'moderate' ? '#f39c12' : '#2ecc71'
                      }]}>
                        {finding.severity}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Recommendations */}
          {assessment.recommendations && assessment.recommendations.length > 0 && (
            <View style={styles.assessmentSection}>
              <Text style={styles.assessmentSectionTitle}>Recommendations</Text>
              {assessment.recommendations.map((rec, i) => (
                <View key={i} style={styles.recCard}>
                  <View style={styles.recHeader}>
                    <View style={[styles.priorityDot, {
                      backgroundColor: rec.priority === 'high' ? '#e74c3c' :
                        rec.priority === 'medium' ? '#f39c12' : '#2ecc71'
                    }]} />
                    <Text style={styles.recTitle}>{rec.title}</Text>
                    <View style={[styles.priorityBadge, {
                      backgroundColor: rec.priority === 'high' ? '#e74c3c15' :
                        rec.priority === 'medium' ? '#f39c1215' : '#2ecc7115'
                    }]}>
                      <Text style={[styles.priorityText, {
                        color: rec.priority === 'high' ? '#e74c3c' :
                          rec.priority === 'medium' ? '#f39c12' : '#2ecc71'
                      }]}>
                        {rec.priority}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.recDescription}>{rec.description}</Text>
                  {rec.exercises && rec.exercises.length > 0 && (
                    <View style={styles.exerciseList}>
                      {rec.exercises.map((ex, j) => (
                        <View key={j} style={styles.exerciseItem}>
                          <Ionicons name="fitness-outline" size={12} color="#9b59b6" />
                          <Text style={styles.exerciseText}>{ex}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Symmetry Analysis */}
          {assessment.symmetryAnalysis && (
            <View style={styles.assessmentSection}>
              <Text style={styles.assessmentSectionTitle}>Symmetry Analysis</Text>
              <View style={styles.symmetryCard}>
                <View style={styles.symmetryRow}>
                  <Ionicons name="body-outline" size={16} color="#3498db" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.symmetryLabel}>Upper Body</Text>
                    <Text style={styles.symmetryText}>{assessment.symmetryAnalysis.upperBody}</Text>
                  </View>
                </View>
                <View style={styles.symmetryDivider} />
                <View style={styles.symmetryRow}>
                  <Ionicons name="walk-outline" size={16} color="#2ecc71" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.symmetryLabel}>Lower Body</Text>
                    <Text style={styles.symmetryText}>{assessment.symmetryAnalysis.lowerBody}</Text>
                  </View>
                </View>
                <View style={styles.symmetryDivider} />
                <View style={styles.symmetryRow}>
                  <Ionicons name="analytics-outline" size={16} color="#9b59b6" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.symmetryLabel}>Overall</Text>
                    <Text style={styles.symmetryText}>{assessment.symmetryAnalysis.overall}</Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          <TouchableOpacity style={styles.saveBtn} onPress={handleFinish} activeOpacity={0.8}>
            <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
            <Text style={styles.saveBtnText}>Done - View Updated Charts</Text>
          </TouchableOpacity>
        </>
      ) : (
        <View style={styles.assessmentLoading}>
          <Ionicons name="alert-circle-outline" size={48} color="#f39c12" />
          <Text style={styles.assessmentLoadingTitle}>Assessment Unavailable</Text>
          <Text style={styles.assessmentLoadingText}>
            We couldn't generate an assessment at this time. Your measurements have been saved successfully.
          </Text>
          <TouchableOpacity style={styles.saveBtn} onPress={handleFinish} activeOpacity={0.8}>
            <Text style={styles.saveBtnText}>Continue</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );

  // ============================================================
  // RENDER: SUCCESS STEP
  // ============================================================
  const renderSuccessStep = () => (
    <View style={styles.successContainer}>
      <View style={styles.successIcon}>
        <Ionicons name="checkmark-circle" size={80} color="#2ecc71" />
      </View>
      <Text style={styles.successTitle}>Measurement Saved!</Text>
      <Text style={styles.successText}>
        Your biometric data for {new Date(measureDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} has been recorded successfully.
      </Text>
      <View style={styles.successStats}>
        <View style={styles.successStat}>
          <Text style={styles.successStatValue}>{filledCount}</Text>
          <Text style={styles.successStatLabel}>Metrics Recorded</Text>
        </View>
        <View style={styles.successStatDivider} />
        <View style={styles.successStat}>
          <Text style={styles.successStatValue}>
            {Object.values(photos).filter(p => p).length}
          </Text>
          <Text style={styles.successStatLabel}>Photos Uploaded</Text>
        </View>
      </View>
      <TouchableOpacity style={styles.saveBtn} onPress={handleFinish} activeOpacity={0.8}>
        <Ionicons name="bar-chart-outline" size={20} color="#fff" />
        <Text style={styles.saveBtnText}>View Updated Charts</Text>
      </TouchableOpacity>
    </View>
  );

  // ============================================================
  // MAIN RENDER
  // ============================================================
  const stepTitles: Record<string, string> = {
    form: 'New Measurement',
    photos: 'Progress Photos',
    assessment: 'Postural Assessment',
    success: 'Complete',
  };

  return (
    <>
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.headerBtn}>
            <Ionicons name="close" size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{stepTitles[step]}</Text>
            <View style={styles.stepIndicator}>
              {['form', 'photos', 'assessment'].map((s, i) => (
                <View
                  key={s}
                  style={[
                    styles.stepDot,
                    (step === s || ['form', 'photos', 'assessment', 'success'].indexOf(step) > i) && styles.stepDotActive,
                  ]}
                />
              ))}
            </View>
          </View>
          <View style={styles.headerBtn} />
        </View>

        {/* Client Name Banner - shown when opened from schedule for a specific client */}
        {clientName && (
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACING.sm,
            paddingVertical: SPACING.sm,
            paddingHorizontal: SPACING.lg,
            backgroundColor: '#9b59b6' + '08',
            borderBottomWidth: 1,
            borderBottomColor: '#9b59b6' + '15',
          }}>
            <View style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: '#9b59b6' + '15',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Ionicons name="person" size={14} color="#9b59b6" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '600' }}>Assessment for</Text>
              <Text style={{ fontSize: FONT_SIZES.md, fontWeight: '800', color: '#9b59b6' }}>{clientName}</Text>
            </View>
          </View>
        )}

        {/* Content */}

        {step === 'form' && renderFormStep()}
        {step === 'photos' && renderPhotosStep()}
        {step === 'assessment' && renderAssessmentStep()}
        {step === 'success' && renderSuccessStep()}
      </View>
    </Modal>

    {/* Camera Capture Modal */}
    <CameraCapture
      visible={showCamera}
      onClose={() => setShowCamera(false)}
      onCapture={handleCameraCapture}
      currentPose={cameraPose}
    />

    {/* Skip Confirmation Modal */}
    <Modal visible={showSkipConfirm} transparent animationType="fade" onRequestClose={() => setShowSkipConfirm(false)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: SPACING.lg }}>
        <View style={{ backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg, width: '100%', maxWidth: 440, maxHeight: '80%', ...SHADOWS.lg }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#f39c1215', justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name="alert-circle" size={24} color="#f39c12" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: FONT_SIZES.lg, fontWeight: '800', color: COLORS.primary }}>
                Incomplete Assessment
              </Text>
              <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 2 }}>
                {skippedItems.length} item{skippedItems.length !== 1 ? 's' : ''} not entered
              </Text>
            </View>
            <TouchableOpacity onPress={() => setShowSkipConfirm(false)} style={{ padding: 4 }}>
              <Ionicons name="close" size={22} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Description */}
          <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.md }}>
            <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, lineHeight: 20 }}>
              The following measurements or photos were not entered. Please confirm you are intentionally skipping these:
            </Text>
          </View>

          {/* Skipped Items List */}
          <ScrollView style={{ maxHeight: 280, paddingHorizontal: SPACING.lg, marginTop: SPACING.md }} showsVerticalScrollIndicator>
            {skippedItems.map((item, idx) => (
              <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: 6, borderBottomWidth: idx < skippedItems.length - 1 ? 1 : 0, borderBottomColor: COLORS.borderLight }}>
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#e74c3c12', justifyContent: 'center', alignItems: 'center' }}>
                  <Ionicons name="remove-circle-outline" size={14} color="#e74c3c" />
                </View>
                <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.text, fontWeight: '500', flex: 1 }}>
                  {item}
                </Text>
              </View>
            ))}
          </ScrollView>

          {/* Action Buttons */}
          <View style={{ flexDirection: 'row', gap: SPACING.sm, padding: SPACING.lg, borderTopWidth: 1, borderTopColor: COLORS.borderLight, marginTop: SPACING.md }}>
            <TouchableOpacity
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.md, borderWidth: 1.5, borderColor: COLORS.borderLight }}
              onPress={() => setShowSkipConfirm(false)}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={16} color={COLORS.primary} />
              <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.primary }}>Go Back & Fill In</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: '#f39c12', borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.md }}
              onPress={() => {
                if (pendingSkipActionRef.current) {
                  pendingSkipActionRef.current();
                }
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark-circle" size={16} color="#fff" />
              <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '700', color: '#fff' }}>Yes, Skip These</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
    </>

  );
}


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerBtn: { width: 40, alignItems: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: FONT_SIZES.lg, fontWeight: '800', color: COLORS.primary },
  stepIndicator: { flexDirection: 'row', gap: 6, marginTop: 4 },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.border },
  stepDotActive: { backgroundColor: '#9b59b6', width: 20 },
  scroll: { flex: 1 },

  // Date Section
  dateSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.md,
    ...SHADOWS.sm,
  },
  dateIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#9b59b615',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '600' },
  dateInput: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.primary,
    paddingVertical: 2,
  },

  // Progress
  progressIndicator: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#9b59b6',
    borderRadius: 2,
  },
  progressText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 4,
    textAlign: 'right',
  },

  // Form Sections
  formSection: {
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  sectionIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.primary },
  sectionSubtitle: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 1 },
  filledBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fieldsContainer: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  fieldLabel: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, fontWeight: '600' },
  fieldUnit: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted },
  fieldInput: {
    width: 100,
    textAlign: 'right',
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.primary,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.sm,
  },

  // Notes
  notesSection: {
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  notesInput: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    minHeight: 80,
  },

  // Save Button
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#9b59b6',
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
    paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.sm,
    ...SHADOWS.md,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: FONT_SIZES.md, fontWeight: '700', color: '#fff' },

  // Photos
  photoHeader: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.lg,
  },
  photoHeaderIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  photoTitle: { fontSize: FONT_SIZES.xxl, fontWeight: '800', color: COLORS.primary },
  photoSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.sm,
    lineHeight: 20,
  },
  photoGrid: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
  },
  photoCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    alignItems: 'center',
    ...SHADOWS.sm,
  },
  photoPreviewContainer: {
    width: '100%',
    aspectRatio: 0.75,
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    position: 'relative',
  },
  photoPreview: {
    width: '100%',
    height: '100%',
  },
  photoOverlay: {
    position: 'absolute',
    bottom: 6,
    right: 6,
  },
  photoRemoveBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
  photoPlaceholder: {
    width: '100%',
    aspectRatio: 0.75,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.background,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  photoAddIcon: {
    position: 'absolute',
    bottom: 8,
    right: 8,
  },
  photoLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: SPACING.sm,
  },
  photoHint: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  photoTips: {
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    ...SHADOWS.sm,
  },
  tipsTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: SPACING.md,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  tipText: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary },
  photoActions: {
    paddingHorizontal: 0,
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
    marginHorizontal: SPACING.lg,
  },
  skipBtnText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    fontWeight: '600',
  },

  // Assessment
  assessmentLoading: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: SPACING.xl,
    gap: SPACING.lg,
  },
  assessmentLoadingTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: COLORS.primary,
  },
  assessmentLoadingText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  scoreCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    padding: SPACING.xl,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    ...SHADOWS.md,
  },
  scoreCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#9b59b615',
    borderWidth: 4,
    borderColor: '#9b59b6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  scoreNumber: { fontSize: 32, fontWeight: '900', color: '#9b59b6' },
  scoreLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '600' },
  scoreSummary: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  assessmentSection: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
  },
  assessmentSectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: SPACING.md,
  },
  findingCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    gap: SPACING.md,
    ...SHADOWS.sm,
  },
  findingSeverity: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  findingArea: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.primary },
  findingText: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, marginTop: 2, lineHeight: 16 },
  severityBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
    marginTop: SPACING.xs,
  },
  severityText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase' },
  recCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  recHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  priorityDot: { width: 8, height: 8, borderRadius: 4 },
  recTitle: { flex: 1, fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.primary },
  priorityBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },
  priorityText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase' },
  recDescription: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
    lineHeight: 16,
  },
  exerciseList: {
    marginTop: SPACING.sm,
    gap: 4,
  },
  exerciseItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  exerciseText: { fontSize: FONT_SIZES.xs, color: '#9b59b6', fontWeight: '600' },
  symmetryCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  symmetryRow: { flexDirection: 'row', gap: SPACING.md, alignItems: 'flex-start' },
  symmetryLabel: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.primary },
  symmetryText: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, marginTop: 2, lineHeight: 16 },
  symmetryDivider: { height: 1, backgroundColor: COLORS.borderLight, marginVertical: SPACING.md },

  // Success
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  successIcon: { marginBottom: SPACING.lg },
  successTitle: { fontSize: FONT_SIZES.xxxl, fontWeight: '900', color: COLORS.primary },
  successText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.sm,
    lineHeight: 20,
  },
  successStats: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    marginTop: SPACING.xl,
    gap: SPACING.xl,
    ...SHADOWS.sm,
  },
  successStat: { alignItems: 'center' },
  successStatValue: { fontSize: FONT_SIZES.xxxl, fontWeight: '900', color: '#9b59b6' },
  successStatLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '600' },
  successStatDivider: { width: 1, backgroundColor: COLORS.border },

  // Camera Capture Section
  cameraCaptureSection: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  cameraCaptureCta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.md,
    borderWidth: 2,
    borderColor: '#9b59b630',
    ...SHADOWS.sm,
  },
  cameraCaptureIconBg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#9b59b6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraCaptureTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.primary,
  },
  cameraCaptureSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
    lineHeight: 16,
  },
  cameraCaptureArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#9b59b610',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickCameraRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  quickCameraBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  quickCameraBtnText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.textMuted,
  },

  // Or Divider
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    gap: SPACING.md,
  },
  orDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  orDividerText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // Photo Progress
  photoProgressBar: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  photoProgressTrack: {
    height: 6,
    backgroundColor: COLORS.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  photoProgressFill: {
    height: '100%',
    backgroundColor: '#2ecc71',
    borderRadius: 3,
  },
  photoProgressText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
});
