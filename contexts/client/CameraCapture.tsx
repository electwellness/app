import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Platform,
  ActivityIndicator, Animated, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../../constants/theme';

type PoseType = 'front' | 'side' | 'back';

interface CameraCaptureProps {
  visible: boolean;
  onClose: () => void;
  onCapture: (photoDataUrl: string, poseType: PoseType) => void;
  currentPose: PoseType;
}

const POSE_CONFIG: Record<PoseType, { label: string; icon: string; color: string; instructions: string; guideTip: string }> = {
  front: {
    label: 'Front View',
    icon: 'person-outline',
    color: '#2ecc71',
    instructions: 'Face the camera directly. Stand with feet shoulder-width apart, arms relaxed at your sides.',
    guideTip: 'Align your body within the outline',
  },
  side: {
    label: 'Side View',
    icon: 'body-outline',
    color: '#3498db',
    instructions: 'Turn 90 degrees to your right. Stand naturally with arms at your sides.',
    guideTip: 'Position your profile within the outline',
  },
  back: {
    label: 'Back View',
    icon: 'accessibility-outline',
    color: '#f39c12',
    instructions: 'Turn away from the camera. Stand with feet shoulder-width apart, arms relaxed.',
    guideTip: 'Center your back within the outline',
  },
};

const COUNTDOWN_SECONDS = 3;

export default function CameraCapture({ visible, onClose, onCapture, currentPose }: CameraCaptureProps) {
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [autoCapture, setAutoCapture] = useState(false);
  const [autoCountdown, setAutoCountdown] = useState<number | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [flashEffect, setFlashEffect] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const containerRef = useRef<View>(null);
  const countdownTimerRef = useRef<any>(null);
  const autoTimerRef = useRef<any>(null);
  const flashAnim = useRef(new Animated.Value(0)).current;

  const config = POSE_CONFIG[currentPose];

  // Start camera on web
  const startCamera = useCallback(async () => {
    if (Platform.OS !== 'web') {
      setCameraError('Camera capture requires a web browser. Please use the file upload option on native devices.');
      return;
    }

    try {
      setCameraError(null);
      setCameraReady(false);

      // Stop existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 1920 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setCameraReady(true);
        };
      }
    } catch (err: any) {
      console.error('Camera error:', err);
      if (err.name === 'NotAllowedError') {
        setCameraError('Camera access denied. Please allow camera permissions in your browser settings.');
      } else if (err.name === 'NotFoundError') {
        setCameraError('No camera found on this device. Please use the file upload option.');
      } else {
        setCameraError(`Unable to access camera: ${err.message || 'Unknown error'}`);
      }
    }
  }, [facingMode]);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
    setCountdown(null);
    setAutoCountdown(null);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    if (autoTimerRef.current) clearInterval(autoTimerRef.current);
  }, []);

  useEffect(() => {
    if (visible && Platform.OS === 'web') {
      // Small delay to let the modal render
      const timer = setTimeout(() => startCamera(), 300);
      return () => clearTimeout(timer);
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [visible, startCamera, stopCamera]);

  // Flip camera
  const flipCamera = useCallback(() => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  }, []);

  useEffect(() => {
    if (visible && cameraReady) {
      startCamera();
    }
  }, [facingMode]);

  // Capture photo from video
  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Mirror if using front camera
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0);

    // Flash effect
    setFlashEffect(true);
    Animated.sequence([
      Animated.timing(flashAnim, { toValue: 1, duration: 100, useNativeDriver: false }),
      Animated.timing(flashAnim, { toValue: 0, duration: 300, useNativeDriver: false }),
    ]).start(() => setFlashEffect(false));

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    
    // Small delay for flash effect
    setTimeout(() => {
      onCapture(dataUrl, currentPose);
    }, 400);
  }, [facingMode, currentPose, onCapture, flashAnim]);

  // Countdown capture
  const startCountdown = useCallback(() => {
    setCountdown(COUNTDOWN_SECONDS);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);

    let remaining = COUNTDOWN_SECONDS;
    countdownTimerRef.current = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(countdownTimerRef.current);
        setCountdown(null);
        capturePhoto();
      } else {
        setCountdown(remaining);
      }
    }, 1000);
  }, [capturePhoto]);

  // Auto-capture toggle
  const toggleAutoCapture = useCallback(() => {
    if (autoCapture) {
      setAutoCapture(false);
      setAutoCountdown(null);
      if (autoTimerRef.current) clearInterval(autoTimerRef.current);
    } else {
      setAutoCapture(true);
      setAutoCountdown(5);
      let remaining = 5;
      if (autoTimerRef.current) clearInterval(autoTimerRef.current);
      autoTimerRef.current = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
          clearInterval(autoTimerRef.current);
          setAutoCountdown(null);
          capturePhoto();
          setAutoCapture(false);
        } else {
          setAutoCountdown(remaining);
        }
      }, 1000);
    }
  }, [autoCapture, capturePhoto]);

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  // Non-web fallback
  if (Platform.OS !== 'web') {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
        <View style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose} style={styles.headerBtn}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Camera Capture</Text>
            <View style={styles.headerBtn} />
          </View>
          <View style={styles.errorContainer}>
            <Ionicons name="camera-outline" size={64} color={COLORS.textMuted} />
            <Text style={styles.errorTitle}>Camera Not Available</Text>
            <Text style={styles.errorText}>
              Direct camera capture is available on web browsers. On mobile devices, please use the file upload option to select photos from your gallery or take a photo using your device's camera app.
            </Text>
            <TouchableOpacity style={styles.errorBtn} onPress={handleClose}>
              <Text style={styles.errorBtnText}>Use File Upload Instead</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={styles.container}>
        {/* Camera Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.headerBtn}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <View style={[styles.poseBadge, { backgroundColor: config.color + '30' }]}>
              <Ionicons name={config.icon as any} size={14} color={config.color} />
              <Text style={[styles.poseBadgeText, { color: config.color }]}>{config.label}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={flipCamera} style={styles.headerBtn}>
            <Ionicons name="camera-reverse-outline" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Camera Preview Area */}
        <View style={styles.cameraArea}>
          {/* Hidden video and canvas elements */}
          {Platform.OS === 'web' && (
            <div style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              overflow: 'hidden',
              borderRadius: 0,
            }}>
              <video
                ref={(el) => { videoRef.current = el; }}
                autoPlay
                playsInline
                muted
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
                }}
              />
              <canvas
                ref={(el) => { canvasRef.current = el; }}
                style={{ display: 'none' }}
              />
            </div>
          )}

          {/* Loading State */}
          {!cameraReady && !cameraError && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={styles.loadingText}>Starting camera...</Text>
            </View>
          )}

          {/* Error State */}
          {cameraError && (
            <View style={styles.errorOverlay}>
              <Ionicons name="warning-outline" size={48} color="#f39c12" />
              <Text style={styles.errorOverlayText}>{cameraError}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={startCamera}>
                <Ionicons name="refresh" size={18} color="#fff" />
                <Text style={styles.retryBtnText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Pose Overlay Guide */}
          {cameraReady && (
            <View style={styles.overlayGuide} pointerEvents="none">
              {/* Body outline guide */}
              <View style={styles.guideContainer}>
                {currentPose === 'front' && (
                  <View style={[styles.bodyOutline, { borderColor: config.color + '60' }]}>
                    {/* Head circle */}
                    <View style={[styles.headCircle, { borderColor: config.color + '60' }]} />
                    {/* Shoulder line */}
                    <View style={[styles.shoulderLine, { backgroundColor: config.color + '40' }]} />
                    {/* Torso */}
                    <View style={[styles.torsoOutline, { borderColor: config.color + '40' }]} />
                    {/* Center line */}
                    <View style={[styles.centerLine, { backgroundColor: config.color + '30' }]} />
                  </View>
                )}
                {currentPose === 'side' && (
                  <View style={[styles.bodyOutlineSide, { borderColor: config.color + '60' }]}>
                    <View style={[styles.headCircle, { borderColor: config.color + '60' }]} />
                    <View style={[styles.sideBodyLine, { backgroundColor: config.color + '40' }]} />
                    <View style={[styles.sidePostureLine, { borderColor: config.color + '40' }]} />
                  </View>
                )}
                {currentPose === 'back' && (
                  <View style={[styles.bodyOutline, { borderColor: config.color + '60' }]}>
                    <View style={[styles.headCircle, { borderColor: config.color + '60' }]} />
                    <View style={[styles.shoulderLine, { backgroundColor: config.color + '40' }]} />
                    <View style={[styles.torsoOutline, { borderColor: config.color + '40' }]} />
                    <View style={[styles.spineGuide, { backgroundColor: config.color + '30' }]} />
                  </View>
                )}
              </View>

              {/* Guide tip at top */}
              <View style={styles.guideTipContainer}>
                <View style={[styles.guideTipBadge, { backgroundColor: config.color + '20', borderColor: config.color + '40' }]}>
                  <Ionicons name="locate-outline" size={14} color={config.color} />
                  <Text style={[styles.guideTipText, { color: config.color }]}>{config.guideTip}</Text>
                </View>
              </View>

              {/* Corner brackets */}
              <View style={[styles.cornerBracket, styles.cornerTL, { borderColor: config.color }]} />
              <View style={[styles.cornerBracket, styles.cornerTR, { borderColor: config.color }]} />
              <View style={[styles.cornerBracket, styles.cornerBL, { borderColor: config.color }]} />
              <View style={[styles.cornerBracket, styles.cornerBR, { borderColor: config.color }]} />
            </View>
          )}

          {/* Countdown Overlay */}
          {(countdown !== null || autoCountdown !== null) && (
            <View style={styles.countdownOverlay}>
              <View style={styles.countdownCircle}>
                <Text style={styles.countdownNumber}>
                  {countdown !== null ? countdown : autoCountdown}
                </Text>
              </View>
              <Text style={styles.countdownLabel}>
                {autoCountdown !== null ? 'Auto-capture in...' : 'Capturing in...'}
              </Text>
            </View>
          )}

          {/* Flash Effect */}
          {flashEffect && (
            <Animated.View
              style={[
                styles.flashOverlay,
                { opacity: flashAnim },
              ]}
            />
          )}
        </View>

        {/* Instructions */}
        <View style={styles.instructionBar}>
          <Ionicons name="information-circle" size={16} color={config.color} />
          <Text style={styles.instructionText}>{config.instructions}</Text>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          {/* Auto-capture toggle */}
          <TouchableOpacity
            style={[styles.controlBtn, autoCapture && styles.controlBtnActive]}
            onPress={toggleAutoCapture}
            disabled={!cameraReady || countdown !== null}
          >
            <Ionicons
              name={autoCapture ? 'timer' : 'timer-outline'}
              size={22}
              color={autoCapture ? '#fff' : '#ccc'}
            />
            <Text style={[styles.controlBtnLabel, autoCapture && { color: '#fff' }]}>
              {autoCapture ? 'Cancel' : 'Auto'}
            </Text>
          </TouchableOpacity>

          {/* Main Capture Button */}
          <TouchableOpacity
            style={[styles.captureBtn, !cameraReady && styles.captureBtnDisabled]}
            onPress={startCountdown}
            disabled={!cameraReady || countdown !== null || autoCountdown !== null}
            activeOpacity={0.7}
          >
            <View style={[styles.captureBtnInner, { borderColor: config.color }]}>
              <View style={[styles.captureBtnCenter, { backgroundColor: config.color }]} />
            </View>
          </TouchableOpacity>

          {/* Instant capture */}
          <TouchableOpacity
            style={styles.controlBtn}
            onPress={capturePhoto}
            disabled={!cameraReady || countdown !== null || autoCountdown !== null}
          >
            <Ionicons name="flash-outline" size={22} color="#ccc" />
            <Text style={styles.controlBtnLabel}>Instant</Text>
          </TouchableOpacity>
        </View>

        {/* Pose selector */}
        <View style={styles.poseSelector}>
          {(['front', 'side', 'back'] as PoseType[]).map(pose => {
            const pc = POSE_CONFIG[pose];
            const isActive = currentPose === pose;
            return (
              <View
                key={pose}
                style={[styles.posePill, isActive && { backgroundColor: pc.color + '20', borderColor: pc.color }]}
              >
                <Ionicons name={pc.icon as any} size={14} color={isActive ? pc.color : '#666'} />
                <Text style={[styles.posePillText, isActive && { color: pc.color, fontWeight: '700' }]}>
                  {pc.label}
                </Text>
                {isActive && (
                  <View style={[styles.activeDot, { backgroundColor: pc.color }]} />
                )}
              </View>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: 'rgba(0,0,0,0.8)',
    zIndex: 10,
  },
  headerBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: '#fff',
  },
  poseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
  },
  poseBadgeText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
  },

  // Camera Area
  cameraArea: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
    gap: SPACING.md,
  },
  loadingText: {
    fontSize: FONT_SIZES.md,
    color: '#fff',
    fontWeight: '600',
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.9)',
    paddingHorizontal: SPACING.xl,
    gap: SPACING.md,
  },
  errorOverlayText: {
    fontSize: FONT_SIZES.sm,
    color: '#ccc',
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#9b59b6',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.sm,
  },
  retryBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: '#fff',
  },

  // Overlay Guide
  overlayGuide: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  guideContainer: {
    width: '60%',
    height: '70%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bodyOutline: {
    width: '100%',
    height: '100%',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: BORDER_RADIUS.lg,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 20,
  },
  bodyOutlineSide: {
    width: '50%',
    height: '100%',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: BORDER_RADIUS.lg,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 20,
  },
  headCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  shoulderLine: {
    width: '80%',
    height: 2,
    marginTop: 10,
  },
  torsoOutline: {
    width: '60%',
    height: '40%',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 8,
    marginTop: 8,
  },
  centerLine: {
    position: 'absolute',
    width: 2,
    top: 20,
    bottom: 20,
  },
  spineGuide: {
    position: 'absolute',
    width: 2,
    top: 80,
    bottom: 40,
  },
  sideBodyLine: {
    width: 2,
    height: '50%',
    marginTop: 10,
  },
  sidePostureLine: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 8,
  },

  // Guide tip
  guideTipContainer: {
    position: 'absolute',
    top: 16,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  guideTipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
  },
  guideTipText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
  },

  // Corner brackets
  cornerBracket: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderWidth: 3,
  },
  cornerTL: {
    top: 40,
    left: 20,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 8,
  },
  cornerTR: {
    top: 40,
    right: 20,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 8,
  },
  cornerBL: {
    bottom: 20,
    left: 20,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 8,
  },
  cornerBR: {
    bottom: 20,
    right: 20,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 8,
  },

  // Countdown
  countdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  countdownCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(155,89,182,0.3)',
    borderWidth: 4,
    borderColor: '#9b59b6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  countdownNumber: {
    fontSize: 56,
    fontWeight: '900',
    color: '#fff',
  },
  countdownLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: '#fff',
    marginTop: SPACING.md,
  },

  // Flash
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
  },

  // Instructions
  instructionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  instructionText: {
    fontSize: FONT_SIZES.xs,
    color: '#ccc',
    flex: 1,
    lineHeight: 16,
  },

  // Controls
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    backgroundColor: 'rgba(0,0,0,0.9)',
  },
  controlBtn: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
  },
  controlBtnActive: {
    backgroundColor: '#9b59b6',
  },
  controlBtnLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#999',
  },
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 4,
  },
  captureBtnDisabled: {
    opacity: 0.4,
  },
  captureBtnInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureBtnCenter: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },

  // Pose Selector
  poseSelector: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    backgroundColor: 'rgba(0,0,0,0.95)',
  },
  posePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: '#333',
    position: 'relative',
  },
  posePillText: {
    fontSize: FONT_SIZES.xs,
    color: '#666',
    fontWeight: '600',
  },
  activeDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Error container (native fallback)
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    gap: SPACING.md,
  },
  errorTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: '#fff',
  },
  errorText: {
    fontSize: FONT_SIZES.sm,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
  },
  errorBtn: {
    backgroundColor: '#9b59b6',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.md,
  },
  errorBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: '#fff',
  },
});
