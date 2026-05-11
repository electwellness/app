import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView,
  ActivityIndicator, Image, TextInput, Alert, Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import { MEAL_CONFIG, REVIEW_STATUS_CONFIG } from '../../data/foodPhotoData';
import type { MealType, FoodPhotoEntry } from '../../data/foodPhotoData';

interface PhotoFoodLogModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (photo: { photoUri: string; meal: MealType; description: string }) => void | Promise<void>;
  defaultMeal?: MealType;
  dietitianName?: string;
}

const MEAL_OPTIONS: { key: MealType; label: string; icon: string; color: string }[] = [
  { key: 'breakfast', label: 'Breakfast', icon: 'sunny-outline', color: '#f39c12' },
  { key: 'lunch', label: 'Lunch', icon: 'restaurant-outline', color: '#2ecc71' },
  { key: 'dinner', label: 'Dinner', icon: 'moon-outline', color: '#3498db' },
  { key: 'snack', label: 'Snack', icon: 'cafe-outline', color: '#9b59b6' },
];

export default function PhotoFoodLogModal({ visible, onClose, onSave, defaultMeal, dietitianName }: PhotoFoodLogModalProps) {
  const [step, setStep] = useState<'capture' | 'review' | 'uploading'>('capture');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [selectedMeal, setSelectedMeal] = useState<MealType>(defaultMeal || 'lunch');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string>('');

  const resetState = () => {
    setStep('capture');
    setPhotoUri(null);
    setSelectedMeal(defaultMeal || 'lunch');
    setDescription('');
    setSaving(false);
    setError(null);
    setUploadProgress('');
  };

  const handleClose = () => {
    if (saving) return; // Prevent closing during upload
    resetState();
    onClose();
  };

  // ── PHOTO CAPTURE ──
  const pickPhoto = async () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e: any) => {
        const file = e.target?.files?.[0];
        if (file) {
          if (file.size > 4 * 1024 * 1024) {
            setError('Photo is too large. Please use a smaller image (under 4MB).');
            return;
          }
          const reader = new FileReader();
          reader.onload = (ev) => {
            const dataUrl = ev.target?.result as string;
            setPhotoUri(dataUrl);
            setStep('review');
          };
          reader.readAsDataURL(file);
        }
      };
      input.click();
    } else {
      Alert.alert(
        'Select Photo',
        'Choose how to add your food photo',
        [
          { text: 'Take Photo', onPress: () => Alert.alert('Info', 'Camera access requires expo-image-picker.') },
          { text: 'Choose from Library', onPress: () => Alert.alert('Info', 'Photo library access requires expo-image-picker.') },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    }
  };

  const takePhoto = async () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment';
      input.onchange = (e: any) => {
        const file = e.target?.files?.[0];
        if (file) {
          if (file.size > 4 * 1024 * 1024) {
            setError('Photo is too large. Please use a smaller image (under 4MB).');
            return;
          }
          const reader = new FileReader();
          reader.onload = (ev) => {
            const dataUrl = ev.target?.result as string;
            setPhotoUri(dataUrl);
            setStep('review');
          };
          reader.readAsDataURL(file);
        }
      };
      input.click();
    } else {
      pickPhoto();
    }
  };

  // ── SAVE (supports async onSave for real uploads) ──
  const handleSave = async () => {
    if (!photoUri) return;
    setSaving(true);
    setError(null);
    setStep('uploading');
    setUploadProgress('Uploading photo...');

    try {
      setUploadProgress('Uploading to cloud storage...');
      await onSave({ photoUri, meal: selectedMeal, description: description.trim() });
      setUploadProgress('Done!');
      // Brief delay to show success state
      await new Promise(resolve => setTimeout(resolve, 600));
      resetState();
      onClose();
    } catch (err: any) {
      console.error('Error saving photo:', err);
      const errorMsg = err?.message || 'Failed to upload food photo. Please try again.';
      setError(errorMsg);
      setStep('review'); // Go back to review step so user can retry
    } finally {
      setSaving(false);
      setUploadProgress('');
    }
  };

  // ── RENDER: UPLOADING STEP ──
  const renderUploadingStep = () => (
    <View style={styles.uploadingContainer}>
      <View style={styles.uploadingContent}>
        {/* Photo preview (small) */}
        {photoUri && (
          <Image source={{ uri: photoUri }} style={styles.uploadingPhoto} />
        )}

        <View style={styles.uploadingSpinner}>
          <ActivityIndicator size="large" color={COLORS.accent} />
        </View>

        <Text style={styles.uploadingTitle}>Submitting Your Meal Photo</Text>
        <Text style={styles.uploadingSubtitle}>{uploadProgress || 'Please wait...'}</Text>

        {/* Upload steps indicator */}
        <View style={styles.uploadSteps}>
          <View style={styles.uploadStepRow}>
            <View style={[styles.uploadStepDot, styles.uploadStepDotActive]}>
              <Ionicons name="checkmark" size={10} color={COLORS.white} />
            </View>
            <Text style={[styles.uploadStepText, styles.uploadStepTextActive]}>Photo selected</Text>
          </View>
          <View style={styles.uploadStepRow}>
            <View style={[
              styles.uploadStepDot,
              uploadProgress.includes('cloud') || uploadProgress.includes('Creating') || uploadProgress === 'Done!'
                ? styles.uploadStepDotActive : styles.uploadStepDotPending
            ]}>
              {uploadProgress.includes('cloud') ? (
                <ActivityIndicator size={10} color={COLORS.white} />
              ) : uploadProgress.includes('Creating') || uploadProgress === 'Done!' ? (
                <Ionicons name="checkmark" size={10} color={COLORS.white} />
              ) : (
                <View style={styles.uploadStepDotInner} />
              )}
            </View>
            <Text style={[
              styles.uploadStepText,
              (uploadProgress.includes('cloud') || uploadProgress.includes('Creating') || uploadProgress === 'Done!') && styles.uploadStepTextActive
            ]}>Uploading to storage</Text>
          </View>
          <View style={styles.uploadStepRow}>
            <View style={[
              styles.uploadStepDot,
              uploadProgress.includes('Creating') || uploadProgress === 'Done!'
                ? styles.uploadStepDotActive : styles.uploadStepDotPending
            ]}>
              {uploadProgress.includes('Creating') ? (
                <ActivityIndicator size={10} color={COLORS.white} />
              ) : uploadProgress === 'Done!' ? (
                <Ionicons name="checkmark" size={10} color={COLORS.white} />
              ) : (
                <View style={styles.uploadStepDotInner} />
              )}
            </View>
            <Text style={[
              styles.uploadStepText,
              (uploadProgress.includes('Creating') || uploadProgress === 'Done!') && styles.uploadStepTextActive
            ]}>Creating review record</Text>
          </View>
          <View style={styles.uploadStepRow}>
            <View style={[
              styles.uploadStepDot,
              uploadProgress === 'Done!' ? styles.uploadStepDotSuccess : styles.uploadStepDotPending
            ]}>
              {uploadProgress === 'Done!' ? (
                <Ionicons name="checkmark" size={10} color={COLORS.white} />
              ) : (
                <View style={styles.uploadStepDotInner} />
              )}
            </View>
            <Text style={[
              styles.uploadStepText,
              uploadProgress === 'Done!' && { color: '#2ecc71', fontWeight: '700' }
            ]}>Sent to dietitian for review</Text>
          </View>
        </View>
      </View>
    </View>
  );

  // ── RENDER: CAPTURE STEP ──
  const renderCaptureStep = () => (
    <View style={styles.captureContainer}>
      <View style={styles.captureHero}>
        <View style={styles.cameraIconContainer}>
          <View style={styles.cameraIconOuter}>
            <View style={styles.cameraIconInner}>
              <Ionicons name="camera" size={48} color={COLORS.accent} />
            </View>
          </View>
        </View>
        <Text style={styles.captureTitle}>Snap Your Meal</Text>
        <Text style={styles.captureSubtitle}>
          Take a photo of your food and your dietitian{dietitianName ? `, ${dietitianName},` : ''} will review it and provide personalized feedback.
        </Text>
      </View>

      {/* Dietitian Info Banner */}
      {dietitianName && dietitianName !== 'None' && (
        <View style={styles.dietitianBanner}>
          <View style={styles.dietitianBannerIcon}>
            <Ionicons name="person-circle-outline" size={20} color="#9b59b6" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.dietitianBannerTitle}>Your Dietitian</Text>
            <Text style={styles.dietitianBannerName}>{dietitianName}</Text>
          </View>
          <View style={styles.dietitianBannerBadge}>
            <Ionicons name="eye-outline" size={12} color="#9b59b6" />
            <Text style={styles.dietitianBannerBadgeText}>Will Review</Text>
          </View>
        </View>
      )}

      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={18} color="#e74c3c" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)}>
            <Ionicons name="close-circle" size={18} color="#e74c3c" />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.captureActions}>
        <TouchableOpacity style={styles.captureBtn} onPress={takePhoto} activeOpacity={0.8}>
          <View style={styles.captureBtnIcon}>
            <Ionicons name="camera" size={28} color={COLORS.white} />
          </View>
          <View style={styles.captureBtnContent}>
            <Text style={styles.captureBtnTitle}>Take Photo</Text>
            <Text style={styles.captureBtnDesc}>Use your camera to snap a picture</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.captureBtn} onPress={pickPhoto} activeOpacity={0.8}>
          <View style={[styles.captureBtnIcon, { backgroundColor: '#9b59b6' }]}>
            <Ionicons name="images" size={28} color={COLORS.white} />
          </View>
          <View style={styles.captureBtnContent}>
            <Text style={styles.captureBtnTitle}>Choose from Library</Text>
            <Text style={styles.captureBtnDesc}>Select an existing food photo</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={styles.tipSection}>
        <Text style={styles.tipSectionTitle}>Tips for Best Results</Text>
        <View style={styles.tipGrid}>
          <View style={styles.tipCard}>
            <View style={[styles.tipIcon, { backgroundColor: '#f39c1215' }]}>
              <Ionicons name="sunny-outline" size={18} color="#f39c12" />
            </View>
            <Text style={styles.tipLabel}>Good Lighting</Text>
          </View>
          <View style={styles.tipCard}>
            <View style={[styles.tipIcon, { backgroundColor: '#3498db15' }]}>
              <Ionicons name="scan-outline" size={18} color="#3498db" />
            </View>
            <Text style={styles.tipLabel}>Clear Focus</Text>
          </View>
          <View style={styles.tipCard}>
            <View style={[styles.tipIcon, { backgroundColor: '#2ecc7115' }]}>
              <Ionicons name="eye-outline" size={18} color="#2ecc71" />
            </View>
            <Text style={styles.tipLabel}>Show All Items</Text>
          </View>
          <View style={styles.tipCard}>
            <View style={[styles.tipIcon, { backgroundColor: '#9b59b615' }]}>
              <Ionicons name="resize-outline" size={18} color="#9b59b6" />
            </View>
            <Text style={styles.tipLabel}>Top-Down Angle</Text>
          </View>
        </View>
      </View>
    </View>
  );

  // ── RENDER: REVIEW STEP ──
  const renderReviewStep = () => (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.reviewScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Photo Preview */}
        {photoUri && (
          <View style={styles.photoPreviewContainer}>
            <Image source={{ uri: photoUri }} style={styles.photoPreview} />
            <TouchableOpacity
              style={styles.retakeOverlay}
              onPress={() => { setPhotoUri(null); setStep('capture'); }}
            >
              <Ionicons name="camera-reverse-outline" size={16} color={COLORS.white} />
              <Text style={styles.retakeOverlayText}>Retake</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Error Banner (shown if upload failed and user returned to review step) */}
        {error && (
          <View style={[styles.errorBanner, { marginHorizontal: SPACING.lg, marginBottom: SPACING.md }]}>
            <Ionicons name="alert-circle" size={18} color="#e74c3c" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => setError(null)}>
              <Ionicons name="close-circle" size={18} color="#e74c3c" />
            </TouchableOpacity>
          </View>
        )}

        {/* Submission Info */}
        <View style={styles.submissionInfo}>
          <View style={styles.submissionInfoIcon}>
            <Ionicons name="cloud-upload-outline" size={16} color={COLORS.accent} />
          </View>
          <Text style={styles.submissionInfoText}>
            Your photo will be uploaded to secure cloud storage and sent to your dietitian for review.
          </Text>
        </View>

        {/* Meal Type Selector */}
        <View style={styles.mealSelector}>
          <Text style={styles.mealSelectorLabel}>What meal is this?</Text>
          <View style={styles.mealOptions}>
            {MEAL_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.mealOption,
                  selectedMeal === opt.key && { backgroundColor: opt.color + '15', borderColor: opt.color },
                ]}
                onPress={() => setSelectedMeal(opt.key)}
              >
                <Ionicons
                  name={opt.icon as any}
                  size={18}
                  color={selectedMeal === opt.key ? opt.color : COLORS.textMuted}
                />
                <Text style={[
                  styles.mealOptionText,
                  selectedMeal === opt.key && { color: opt.color, fontWeight: '700' },
                ]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Description */}
        <View style={styles.descriptionSection}>
          <Text style={styles.descriptionLabel}>Describe your meal (optional)</Text>
          <TextInput
            style={styles.descriptionInput}
            value={description}
            onChangeText={setDescription}
            placeholder="e.g., Grilled chicken with steamed broccoli and brown rice"
            placeholderTextColor={COLORS.textMuted}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
          <Text style={styles.descriptionHint}>
            Adding a description helps your dietitian provide more specific feedback
          </Text>
        </View>

        {/* Submit Actions */}
        <View style={styles.reviewActions}>
          <TouchableOpacity
            style={styles.retakeBtn}
            onPress={() => { setPhotoUri(null); setStep('capture'); }}
          >
            <Ionicons name="camera-reverse-outline" size={18} color={COLORS.accent} />
            <Text style={styles.retakeBtnText}>Retake Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <>
                <ActivityIndicator color={COLORS.white} size="small" />
                <Text style={styles.saveBtnText}>Uploading...</Text>
              </>
            ) : (
              <>
                <Ionicons name="cloud-upload" size={18} color={COLORS.white} />
                <Text style={styles.saveBtnText}>Upload & Submit for Review</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );

  // ── MAIN RENDER ──
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.headerBtn} disabled={saving}>
            <Ionicons name="close" size={24} color={saving ? COLORS.textMuted : COLORS.primary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <View style={styles.headerTitleRow}>
              <Ionicons name="camera" size={16} color={COLORS.accent} />
              <Text style={styles.headerTitle}>
                {step === 'capture' ? 'Photo Food Log' : step === 'uploading' ? 'Uploading...' : 'Review & Submit'}
              </Text>
            </View>
            <View style={styles.stepIndicator}>
              <View style={[styles.stepDot, styles.stepDotActive]} />
              <View style={[styles.stepDot, (step === 'review' || step === 'uploading') && styles.stepDotActive]} />
              <View style={[styles.stepDot, step === 'uploading' && styles.stepDotActive]} />
            </View>
          </View>
          <View style={styles.headerBtn} />
        </View>

        {step === 'capture' && (
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {renderCaptureStep()}
          </ScrollView>
        )}
        {step === 'review' && renderReviewStep()}
        {step === 'uploading' && renderUploadingStep()}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerBtn: { width: 40, alignItems: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  headerTitle: { fontSize: FONT_SIZES.lg, fontWeight: '800', color: COLORS.primary },
  stepIndicator: { flexDirection: 'row', gap: 6, marginTop: 4 },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.border },
  stepDotActive: { backgroundColor: COLORS.accent, width: 20 },

  // Capture
  captureContainer: { padding: SPACING.lg },
  captureHero: { alignItems: 'center', paddingVertical: SPACING.xl },
  cameraIconContainer: { position: 'relative', marginBottom: SPACING.lg },
  cameraIconOuter: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: COLORS.accent + '10', justifyContent: 'center', alignItems: 'center',
  },
  cameraIconInner: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.accent + '18', justifyContent: 'center', alignItems: 'center',
  },
  captureTitle: { fontSize: FONT_SIZES.xxl, fontWeight: '900', color: COLORS.primary, marginBottom: SPACING.sm },
  captureSubtitle: {
    fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20, paddingHorizontal: SPACING.lg,
  },

  // Dietitian Banner
  dietitianBanner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: '#9b59b608', borderWidth: 1, borderColor: '#9b59b620',
    borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.lg,
  },
  dietitianBannerIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#9b59b615', justifyContent: 'center', alignItems: 'center',
  },
  dietitianBannerTitle: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '600' },
  dietitianBannerName: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.primary },
  dietitianBannerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#9b59b612', paddingHorizontal: SPACING.sm, paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
  },
  dietitianBannerBadgeText: { fontSize: 9, fontWeight: '700', color: '#9b59b6' },

  // Error
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: '#e74c3c10', borderWidth: 1, borderColor: '#e74c3c30',
    borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.lg,
  },
  errorText: { flex: 1, fontSize: FONT_SIZES.sm, color: '#e74c3c', fontWeight: '600' },

  // Capture Actions
  captureActions: { gap: SPACING.sm, marginBottom: SPACING.xl },
  captureBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg, gap: SPACING.md, ...SHADOWS.sm,
  },
  captureBtnIcon: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.accent,
    justifyContent: 'center', alignItems: 'center',
  },
  captureBtnContent: { flex: 1 },
  captureBtnTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.primary },
  captureBtnDesc: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 2 },

  // Tips
  tipSection: { marginTop: SPACING.sm },
  tipSectionTitle: {
    fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.textSecondary,
    marginBottom: SPACING.md, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  tipGrid: { flexDirection: 'row', gap: SPACING.sm },
  tipCard: {
    flex: 1, backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, alignItems: 'center', ...SHADOWS.sm,
  },
  tipIcon: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.sm,
  },
  tipLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textSecondary, textAlign: 'center' },

  // Review
  reviewScroll: { flex: 1 },
  photoPreviewContainer: {
    margin: SPACING.lg, borderRadius: BORDER_RADIUS.lg, overflow: 'hidden',
    ...SHADOWS.md, position: 'relative',
  },
  photoPreview: { width: '100%', height: 250 },
  retakeOverlay: {
    position: 'absolute', top: SPACING.sm, right: SPACING.sm,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: SPACING.md, paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
  },
  retakeOverlayText: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.white },

  // Submission Info
  submissionInfo: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    marginHorizontal: SPACING.lg, marginBottom: SPACING.lg,
    backgroundColor: COLORS.accent + '08', borderWidth: 1, borderColor: COLORS.accent + '20',
    borderRadius: BORDER_RADIUS.md, padding: SPACING.md,
  },
  submissionInfoIcon: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.accent + '15', justifyContent: 'center', alignItems: 'center',
  },
  submissionInfoText: { flex: 1, fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, lineHeight: 16 },

  // Meal Selector
  mealSelector: { paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg },
  mealSelectorLabel: {
    fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.primary,
    marginBottom: SPACING.sm,
  },
  mealOptions: { flexDirection: 'row', gap: SPACING.sm },
  mealOption: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.white, borderWidth: 1.5, borderColor: COLORS.border,
  },
  mealOptionText: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: COLORS.textMuted },

  // Description
  descriptionSection: { paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg },
  descriptionLabel: {
    fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.primary, marginBottom: SPACING.sm,
  },
  descriptionInput: {
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md,
    fontSize: FONT_SIZES.md, color: COLORS.text, minHeight: 80,
    ...SHADOWS.sm,
  },
  descriptionHint: {
    fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: SPACING.sm, fontStyle: 'italic',
  },

  // Actions
  reviewActions: { paddingHorizontal: SPACING.lg, gap: SPACING.sm },
  retakeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.accent,
  },
  retakeBtnText: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.accent },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.accent, paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.md, gap: SPACING.sm, ...SHADOWS.md,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.white },

  // Uploading Step
  uploadingContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.xl,
  },
  uploadingContent: {
    alignItems: 'center', width: '100%', maxWidth: 320,
  },
  uploadingPhoto: {
    width: 120, height: 120, borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.xl, ...SHADOWS.md,
  },
  uploadingSpinner: {
    marginBottom: SPACING.lg,
  },
  uploadingTitle: {
    fontSize: FONT_SIZES.xl, fontWeight: '800', color: COLORS.primary,
    textAlign: 'center', marginBottom: SPACING.sm,
  },
  uploadingSubtitle: {
    fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  uploadSteps: {
    width: '100%', gap: SPACING.md,
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, ...SHADOWS.sm,
  },
  uploadStepRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
  },
  uploadStepDot: {
    width: 24, height: 24, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: COLORS.border,
  },
  uploadStepDotActive: {
    backgroundColor: COLORS.accent,
  },
  uploadStepDotPending: {
    backgroundColor: COLORS.borderLight,
  },
  uploadStepDotSuccess: {
    backgroundColor: '#2ecc71',
  },
  uploadStepDotInner: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.textMuted,
  },
  uploadStepText: {
    fontSize: FONT_SIZES.sm, color: COLORS.textMuted, fontWeight: '600',
  },
  uploadStepTextActive: {
    color: COLORS.primary, fontWeight: '700',
  },
});
