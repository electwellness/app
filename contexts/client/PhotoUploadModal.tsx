import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Image,
  ActivityIndicator, ScrollView, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import { uploadBiometricPhoto } from '../../lib/clientDataService';

type PoseType = 'front' | 'side' | 'back';

interface PhotoUploadModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
  onUploadComplete: () => void;
}

const POSE_CONFIG: Record<PoseType, { label: string; icon: string; color: string; instructions: string }> = {
  front: {
    label: 'Front View',
    icon: 'person-outline',
    color: '#2ecc71',
    instructions: 'Face the camera directly with arms relaxed at your sides.',
  },
  side: {
    label: 'Side View',
    icon: 'body-outline',
    color: '#3498db',
    instructions: 'Turn 90 degrees. Stand naturally with arms at your sides.',
  },
  back: {
    label: 'Back View',
    icon: 'accessibility-outline',
    color: '#f39c12',
    instructions: 'Turn away from the camera with arms relaxed.',
  },
};

// Compress image using canvas (web only)
async function compressImage(dataUrl: string, maxWidth: number = 1200, quality: number = 0.8): Promise<string> {
  if (Platform.OS !== 'web') return dataUrl;

  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(dataUrl); return; }

      ctx.drawImage(img, 0, 0, width, height);
      const compressed = canvas.toDataURL('image/jpeg', quality);
      resolve(compressed);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// Convert file to data URL
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function PhotoUploadModal({ visible, onClose, userId, onUploadComplete }: PhotoUploadModalProps) {
  const [selectedPose, setSelectedPose] = useState<PoseType>('front');
  const [photos, setPhotos] = useState<Record<PoseType, string | null>>({
    front: null,
    side: null,
    back: null,
  });
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<PoseType, 'idle' | 'uploading' | 'done' | 'error'>>({
    front: 'idle',
    side: 'idle',
    back: 'idle',
  });
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileSelect = useCallback(async (event: any) => {
    const file = event?.target?.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await fileToDataUrl(file);
      const compressed = await compressImage(dataUrl);
      setPhotos(prev => ({ ...prev, [selectedPose]: compressed }));
    } catch (err) {
      console.error('Error processing file:', err);
    }

    // Reset input value so same file can be selected again
    if (event?.target) event.target.value = '';
  }, [selectedPose]);

  const openFilePicker = useCallback(() => {
    if (Platform.OS === 'web' && fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  const openCamera = useCallback(() => {
    if (Platform.OS === 'web' && cameraInputRef.current) {
      cameraInputRef.current.click();
    }
  }, []);

  const removePhoto = useCallback((pose: PoseType) => {
    setPhotos(prev => ({ ...prev, [pose]: null }));
    setUploadProgress(prev => ({ ...prev, [pose]: 'idle' }));
  }, []);

  const handleUploadAll = useCallback(async () => {
    const photosToUpload = (Object.entries(photos) as [PoseType, string | null][])
      .filter(([_, uri]) => uri !== null);

    if (photosToUpload.length === 0) {
      setUploadError('Please select at least one photo to upload.');
      return;
    }

    setUploading(true);
    setUploadError(null);

    let hasError = false;

    for (const [pose, uri] of photosToUpload) {
      if (!uri) continue;
      setUploadProgress(prev => ({ ...prev, [pose]: 'uploading' }));

      try {
        const { url, error } = await uploadBiometricPhoto(userId, uri, pose);
        if (error || !url) {
          setUploadProgress(prev => ({ ...prev, [pose]: 'error' }));
          hasError = true;
        } else {
          setUploadProgress(prev => ({ ...prev, [pose]: 'done' }));
        }
      } catch (err) {
        setUploadProgress(prev => ({ ...prev, [pose]: 'error' }));
        hasError = true;
      }
    }

    setUploading(false);

    if (!hasError) {
      // Success - notify parent and close
      setTimeout(() => {
        onUploadComplete();
        handleReset();
        onClose();
      }, 800);
    } else {
      setUploadError('Some photos failed to upload. Please try again.');
    }
  }, [photos, userId, onUploadComplete, onClose]);

  const handleReset = useCallback(() => {
    setPhotos({ front: null, side: null, back: null });
    setUploadProgress({ front: 'idle', side: 'idle', back: 'idle' });
    setUploadError(null);
    setSelectedPose('front');
  }, []);

  const handleClose = useCallback(() => {
    if (uploading) return;
    handleReset();
    onClose();
  }, [uploading, onClose, handleReset]);

  const photoCount = Object.values(photos).filter(Boolean).length;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.headerBtn} disabled={uploading}>
            <Ionicons name="close" size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Upload Progress Photos</Text>
            <Text style={styles.headerSubtitle}>
              {photoCount === 0 ? 'Select photos to upload' : `${photoCount} photo${photoCount !== 1 ? 's' : ''} selected`}
            </Text>
          </View>
          <View style={styles.headerBtn} />
        </View>

        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Pose Selector */}
          <View style={styles.poseSelectorRow}>
            {(['front', 'side', 'back'] as PoseType[]).map(pose => {
              const config = POSE_CONFIG[pose];
              const isActive = selectedPose === pose;
              const hasPhoto = !!photos[pose];
              const status = uploadProgress[pose];

              return (
                <TouchableOpacity
                  key={pose}
                  style={[
                    styles.poseTab,
                    isActive && { borderColor: config.color, backgroundColor: config.color + '08' },
                    hasPhoto && !isActive && { borderColor: config.color + '40' },
                  ]}
                  onPress={() => setSelectedPose(pose)}
                  activeOpacity={0.7}
                  disabled={uploading}
                >
                  <View style={[styles.poseIconBg, { backgroundColor: config.color + '15' }]}>
                    <Ionicons name={config.icon as any} size={20} color={config.color} />
                    {hasPhoto && (
                      <View style={[styles.poseCheckmark, { backgroundColor: config.color }]}>
                        {status === 'done' ? (
                          <Ionicons name="checkmark" size={8} color="#fff" />
                        ) : status === 'uploading' ? (
                          <ActivityIndicator size={8} color="#fff" />
                        ) : status === 'error' ? (
                          <Ionicons name="alert" size={8} color="#fff" />
                        ) : (
                          <Ionicons name="checkmark" size={8} color="#fff" />
                        )}
                      </View>
                    )}
                  </View>
                  <Text style={[styles.poseTabLabel, isActive && { color: config.color, fontWeight: '800' }]}>
                    {config.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Photo Preview Area */}
          <View style={styles.previewSection}>
            {photos[selectedPose] ? (
              <View style={styles.previewContainer}>
                <Image
                  source={{ uri: photos[selectedPose]! }}
                  style={styles.previewImage}
                  resizeMode="cover"
                />
                <View style={styles.previewOverlay}>
                  <View style={[styles.previewBadge, { backgroundColor: POSE_CONFIG[selectedPose].color }]}>
                    <Ionicons name={POSE_CONFIG[selectedPose].icon as any} size={14} color="#fff" />
                    <Text style={styles.previewBadgeText}>{POSE_CONFIG[selectedPose].label}</Text>
                  </View>
                </View>
                {!uploading && (
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => removePhoto(selectedPose)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={18} color="#fff" />
                  </TouchableOpacity>
                )}
                {uploadProgress[selectedPose] === 'uploading' && (
                  <View style={styles.uploadingOverlay}>
                    <ActivityIndicator size="large" color="#fff" />
                    <Text style={styles.uploadingText}>Uploading...</Text>
                  </View>
                )}
                {uploadProgress[selectedPose] === 'done' && (
                  <View style={[styles.uploadingOverlay, { backgroundColor: 'rgba(46,204,113,0.7)' }]}>
                    <Ionicons name="checkmark-circle" size={48} color="#fff" />
                    <Text style={styles.uploadingText}>Uploaded!</Text>
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.emptyPreview}>
                <View style={[styles.emptyPreviewIcon, { backgroundColor: POSE_CONFIG[selectedPose].color + '10' }]}>
                  <Ionicons name="camera-outline" size={40} color={POSE_CONFIG[selectedPose].color} />
                </View>
                <Text style={styles.emptyPreviewTitle}>Add {POSE_CONFIG[selectedPose].label}</Text>
                <Text style={styles.emptyPreviewText}>{POSE_CONFIG[selectedPose].instructions}</Text>

                {/* Action Buttons */}
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: POSE_CONFIG[selectedPose].color }]}
                    onPress={openCamera}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="camera" size={22} color="#fff" />
                    <Text style={styles.actionBtnText}>Take Photo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionBtnOutline, { borderColor: POSE_CONFIG[selectedPose].color }]}
                    onPress={openFilePicker}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="images" size={22} color={POSE_CONFIG[selectedPose].color} />
                    <Text style={[styles.actionBtnText, { color: POSE_CONFIG[selectedPose].color }]}>
                      Photo Library
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* Replace Photo Buttons (when photo exists) */}
          {photos[selectedPose] && !uploading && (
            <View style={styles.replaceRow}>
              <TouchableOpacity style={styles.replaceBtn} onPress={openCamera} activeOpacity={0.7}>
                <Ionicons name="camera-outline" size={16} color={COLORS.accent} />
                <Text style={styles.replaceBtnText}>Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.replaceBtn} onPress={openFilePicker} activeOpacity={0.7}>
                <Ionicons name="images-outline" size={16} color={COLORS.accent} />
                <Text style={styles.replaceBtnText}>Choose Different</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Photo Thumbnails Summary */}
          <View style={styles.thumbnailRow}>
            {(['front', 'side', 'back'] as PoseType[]).map(pose => {
              const config = POSE_CONFIG[pose];
              const photo = photos[pose];
              const status = uploadProgress[pose];
              return (
                <TouchableOpacity
                  key={pose}
                  style={[
                    styles.thumbnailCard,
                    selectedPose === pose && { borderColor: config.color, borderWidth: 2 },
                  ]}
                  onPress={() => setSelectedPose(pose)}
                  activeOpacity={0.7}
                  disabled={uploading}
                >
                  {photo ? (
                    <Image source={{ uri: photo }} style={styles.thumbnailImage} resizeMode="cover" />
                  ) : (
                    <View style={styles.thumbnailEmpty}>
                      <Ionicons name="add" size={20} color={COLORS.textMuted} />
                    </View>
                  )}
                  <View style={[styles.thumbnailLabel, { backgroundColor: config.color }]}>
                    <Text style={styles.thumbnailLabelText}>{pose.charAt(0).toUpperCase()}</Text>
                  </View>
                  {status === 'done' && (
                    <View style={styles.thumbnailCheck}>
                      <Ionicons name="checkmark-circle" size={16} color="#2ecc71" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Tips Section */}
          <View style={styles.tipsCard}>
            <View style={styles.tipsHeader}>
              <Ionicons name="bulb-outline" size={16} color="#f39c12" />
              <Text style={styles.tipsTitle}>Photo Tips</Text>
            </View>
            <View style={styles.tipsList}>
              <View style={styles.tipItem}>
                <View style={[styles.tipDot, { backgroundColor: '#2ecc71' }]} />
                <Text style={styles.tipText}>Use consistent lighting and background</Text>
              </View>
              <View style={styles.tipItem}>
                <View style={[styles.tipDot, { backgroundColor: '#3498db' }]} />
                <Text style={styles.tipText}>Wear similar fitted clothing each time</Text>
              </View>
              <View style={styles.tipItem}>
                <View style={[styles.tipDot, { backgroundColor: '#f39c12' }]} />
                <Text style={styles.tipText}>Photos are auto-compressed for fast uploads</Text>
              </View>
            </View>
          </View>

          {/* Error Message */}
          {uploadError && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={18} color="#e74c3c" />
              <Text style={styles.errorText}>{uploadError}</Text>
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Upload Button */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.uploadBtn,
              photoCount === 0 && styles.uploadBtnDisabled,
              uploading && styles.uploadBtnDisabled,
            ]}
            onPress={handleUploadAll}
            disabled={photoCount === 0 || uploading}
            activeOpacity={0.8}
          >
            {uploading ? (
              <>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.uploadBtnText}>Uploading Photos...</Text>
              </>
            ) : (
              <>
                <Ionicons name="cloud-upload" size={20} color="#fff" />
                <Text style={styles.uploadBtnText}>
                  Upload {photoCount} Photo{photoCount !== 1 ? 's' : ''}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Hidden file inputs for web */}
        {Platform.OS === 'web' && (
          <div style={{ display: 'none' }}>
            <input
              ref={(el: any) => { fileInputRef.current = el; }}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
            />
            <input
              ref={(el: any) => { cameraInputRef.current = el; }}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
            />
          </div>
        )}
      </View>
    </Modal>
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
  headerSubtitle: { fontSize: FONT_SIZES.xs, color: '#9b59b6', fontWeight: '600', marginTop: 2 },
  scroll: { flex: 1 },

  // Pose Selector
  poseSelectorRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    gap: SPACING.sm,
  },
  poseTab: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: COLORS.white,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    gap: SPACING.sm,
    ...SHADOWS.sm,
  },
  poseIconBg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  poseCheckmark: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  poseTabLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },

  // Preview
  previewSection: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
  },
  previewContainer: {
    aspectRatio: 0.75,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: COLORS.white,
    ...SHADOWS.lg,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewOverlay: {
    position: 'absolute',
    top: SPACING.md,
    left: SPACING.md,
  },
  previewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
  },
  previewBadgeText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: '#fff',
  },
  removeBtn: {
    position: 'absolute',
    top: SPACING.md,
    right: SPACING.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(231,76,60,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  uploadingText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: '#fff',
  },

  // Empty Preview
  emptyPreview: {
    aspectRatio: 0.85,
    borderRadius: BORDER_RADIUS.xl,
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    gap: SPACING.md,
    ...SHADOWS.sm,
  },
  emptyPreviewIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyPreviewTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.primary,
  },
  emptyPreviewText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  actionRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.sm,
    width: '100%',
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.sm,
  },
  actionBtnOutline: {
    backgroundColor: 'transparent',
    borderWidth: 2,
  },
  actionBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: '#fff',
  },

  // Replace Row
  replaceRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.lg,
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  replaceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  replaceBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.accent,
  },

  // Thumbnail Row
  thumbnailRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    gap: SPACING.md,
  },
  thumbnailCard: {
    flex: 1,
    aspectRatio: 0.75,
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  thumbnailEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  thumbnailLabel: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailLabelText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
  },
  thumbnailCheck: {
    position: 'absolute',
    bottom: 4,
    right: 4,
  },

  // Tips
  tipsCard: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  tipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  tipsTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.primary,
  },
  tipsList: { gap: SPACING.sm },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  tipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tipText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },

  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    padding: SPACING.md,
    backgroundColor: '#e74c3c10',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: '#e74c3c30',
  },
  errorText: {
    fontSize: FONT_SIZES.sm,
    color: '#e74c3c',
    fontWeight: '600',
    flex: 1,
  },

  // Footer
  footer: {
    padding: SPACING.lg,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#9b59b6',
    paddingVertical: SPACING.md + 2,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.sm,
    ...SHADOWS.md,
  },
  uploadBtnDisabled: {
    opacity: 0.5,
  },
  uploadBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: '#fff',
  },
});
