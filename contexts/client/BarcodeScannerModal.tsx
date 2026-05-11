import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator,
  Dimensions, Platform, TextInput, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';

// Conditionally import expo-camera (may not be available on web)
let CameraView: any = null;
let useCameraPermissions: any = null;

try {
  const cameraModule = require('expo-camera');
  CameraView = cameraModule.CameraView;
  useCameraPermissions = cameraModule.useCameraPermissions;
} catch (e) {
  // expo-camera not available (e.g., web environment)
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SCAN_AREA_SIZE = Math.min(SCREEN_WIDTH * 0.7, 280);

interface BarcodeScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onBarcodeScanned: (barcode: string) => void;
}

// Wrapper component that handles the case where expo-camera is not available
function CameraPermissionGate({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  if (!useCameraPermissions) {
    // Camera not available - show manual entry
    return null;
  }

  const [permission, requestPermission] = useCameraPermissions();

  if (!permission) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={styles.loadingText}>Checking camera permissions...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centeredContainer}>
        <View style={styles.permissionCard}>
          <View style={styles.permissionIcon}>
            <Ionicons name="camera-outline" size={48} color={COLORS.accent} />
          </View>
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionText}>
            We need access to your camera to scan product barcodes. Your camera is only used for barcode scanning and no images are stored.
          </Text>
          <TouchableOpacity style={styles.grantBtn} onPress={requestPermission}>
            <Ionicons name="shield-checkmark-outline" size={18} color={COLORS.white} />
            <Text style={styles.grantBtnText}>Grant Camera Access</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelPermBtn} onPress={onClose}>
            <Text style={styles.cancelPermBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return <>{children}</>;
}

export default function BarcodeScannerModal({ visible, onClose, onBarcodeScanned }: BarcodeScannerModalProps) {
  const [scanned, setScanned] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [showManualEntry, setShowManualEntry] = useState(!CameraView);
  const [lastScannedCode, setLastScannedCode] = useState('');
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const cooldownRef = useRef(false);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setScanned(false);
      setTorchOn(false);
      setManualBarcode('');
      setLastScannedCode('');
      cooldownRef.current = false;
      if (!CameraView) {
        setShowManualEntry(true);
      } else {
        setShowManualEntry(false);
      }
    }
  }, [visible]);

  // Animate scan line
  useEffect(() => {
    if (visible && !showManualEntry && !scanned) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(scanLineAnim, {
            toValue: 0,
            duration: 2000,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    }
  }, [visible, showManualEntry, scanned]);

  const handleBarCodeScanned = useCallback(({ type, data }: { type: string; data: string }) => {
    // Prevent multiple rapid scans
    if (cooldownRef.current || scanned) return;
    if (data === lastScannedCode) return;

    cooldownRef.current = true;
    setScanned(true);
    setLastScannedCode(data);

    // Trigger haptic feedback if available
    try {
      const Haptics = require('expo-haptics');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      // Haptics not available
    }

    onBarcodeScanned(data);

    // Reset cooldown after delay
    setTimeout(() => {
      cooldownRef.current = false;
    }, 2000);
  }, [scanned, lastScannedCode, onBarcodeScanned]);

  const handleManualSubmit = () => {
    const trimmed = manualBarcode.trim();
    if (trimmed.length >= 8) {
      setScanned(true);
      onBarcodeScanned(trimmed);
    }
  };

  const handleRescan = () => {
    setScanned(false);
    setLastScannedCode('');
    cooldownRef.current = false;
  };

  const scanLineTranslateY = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-SCAN_AREA_SIZE / 2 + 4, SCAN_AREA_SIZE / 2 - 4],
  });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <Ionicons name="close" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Ionicons name="barcode-outline" size={20} color={COLORS.white} />
            <Text style={styles.headerTitle}>Scan Barcode</Text>
          </View>
          <View style={styles.headerRight}>
            {CameraView && !showManualEntry && (
              <TouchableOpacity
                onPress={() => setTorchOn(!torchOn)}
                style={[styles.headerBtn, torchOn && styles.headerBtnActive]}
              >
                <Ionicons
                  name={torchOn ? 'flash' : 'flash-outline'}
                  size={20}
                  color={torchOn ? '#f39c12' : COLORS.white}
                />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Camera or Manual Entry */}
        {showManualEntry ? (
          <View style={styles.manualContainer}>
            <View style={styles.manualCard}>
              <View style={styles.manualIconContainer}>
                <Ionicons name="keypad-outline" size={40} color={COLORS.accent} />
              </View>
              <Text style={styles.manualTitle}>Enter Barcode Manually</Text>
              <Text style={styles.manualSubtext}>
                {CameraView
                  ? 'Type the barcode number printed below the barcode lines'
                  : 'Camera is not available. Enter the barcode number manually.'}
              </Text>

              <View style={styles.manualInputContainer}>
                <Ionicons name="barcode-outline" size={18} color={COLORS.textMuted} />
                <TextInput
                  style={styles.manualInput}
                  value={manualBarcode}
                  onChangeText={setManualBarcode}
                  placeholder="e.g., 049000042566"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="number-pad"
                  maxLength={14}
                  autoFocus
                />
                {manualBarcode.length > 0 && (
                  <TouchableOpacity onPress={() => setManualBarcode('')}>
                    <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
                  </TouchableOpacity>
                )}
              </View>

              <Text style={styles.manualHint}>
                UPC codes are 12 digits, EAN codes are 13 digits
              </Text>

              <TouchableOpacity
                style={[styles.manualSubmitBtn, manualBarcode.trim().length < 8 && styles.manualSubmitBtnDisabled]}
                onPress={handleManualSubmit}
                disabled={manualBarcode.trim().length < 8}
              >
                <Ionicons name="search-outline" size={18} color={COLORS.white} />
                <Text style={styles.manualSubmitBtnText}>Look Up Product</Text>
              </TouchableOpacity>

              {CameraView && (
                <TouchableOpacity
                  style={styles.switchModeBtn}
                  onPress={() => setShowManualEntry(false)}
                >
                  <Ionicons name="camera-outline" size={16} color={COLORS.accent} />
                  <Text style={styles.switchModeBtnText}>Use Camera Instead</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.cameraContainer}>
            <CameraPermissionGate onClose={onClose}>
              {CameraView && (
                <CameraView
                  style={StyleSheet.absoluteFillObject}
                  facing="back"
                  enableTorch={torchOn}
                  barcodeScannerSettings={{
                    barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'],
                  }}
                  onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                />
              )}
            </CameraPermissionGate>

            {/* Scan Overlay */}
            <View style={styles.overlay}>
              {/* Top dark area */}
              <View style={styles.overlayTop} />

              {/* Middle row with scan area */}
              <View style={styles.overlayMiddle}>
                <View style={styles.overlaySide} />
                <View style={styles.scanArea}>
                  {/* Corner brackets */}
                  <View style={[styles.corner, styles.cornerTL]} />
                  <View style={[styles.corner, styles.cornerTR]} />
                  <View style={[styles.corner, styles.cornerBL]} />
                  <View style={[styles.corner, styles.cornerBR]} />

                  {/* Animated scan line */}
                  {!scanned && (
                    <Animated.View
                      style={[
                        styles.scanLine,
                        { transform: [{ translateY: scanLineTranslateY }] },
                      ]}
                    />
                  )}

                  {/* Scanned indicator */}
                  {scanned && (
                    <View style={styles.scannedOverlay}>
                      <View style={styles.scannedIconCircle}>
                        <Ionicons name="checkmark-circle" size={48} color="#2ecc71" />
                      </View>
                      <Text style={styles.scannedText}>Barcode Detected!</Text>
                    </View>
                  )}
                </View>
                <View style={styles.overlaySide} />
              </View>

              {/* Bottom dark area with instructions */}
              <View style={styles.overlayBottom}>
                <Text style={styles.instructionText}>
                  {scanned
                    ? 'Looking up product...'
                    : 'Align the barcode within the frame'}
                </Text>
                <Text style={styles.instructionSubtext}>
                  {scanned
                    ? lastScannedCode
                    : 'Supports UPC, EAN, Code 128, and Code 39'}
                </Text>

                {scanned && (
                  <TouchableOpacity style={styles.rescanButton} onPress={handleRescan}>
                    <Ionicons name="refresh-outline" size={16} color={COLORS.white} />
                    <Text style={styles.rescanButtonText}>Scan Again</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.manualEntryBtn}
                  onPress={() => setShowManualEntry(true)}
                >
                  <Ionicons name="keypad-outline" size={14} color="rgba(255,255,255,0.8)" />
                  <Text style={styles.manualEntryBtnText}>Enter Barcode Manually</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: Platform.OS === 'ios' ? 56 : SPACING.xl,
    paddingBottom: SPACING.md,
    backgroundColor: 'rgba(0,0,0,0.7)',
    zIndex: 10,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  headerBtnActive: {
    backgroundColor: 'rgba(243, 156, 18, 0.25)',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.white,
  },
  headerRight: {
    width: 40,
    alignItems: 'flex-end',
  },

  // Camera
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },

  // Overlay
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
  },
  overlayTop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  overlayMiddle: {
    flexDirection: 'row',
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  scanArea: {
    width: SCAN_AREA_SIZE,
    height: SCAN_AREA_SIZE,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayBottom: {
    flex: 1.2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    paddingTop: SPACING.xxl,
  },

  // Corner brackets
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: COLORS.accent,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 4,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 4,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 4,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 4,
  },

  // Scan line
  scanLine: {
    width: SCAN_AREA_SIZE - 20,
    height: 2,
    backgroundColor: COLORS.accent,
    opacity: 0.8,
    borderRadius: 1,
    ...SHADOWS.sm,
  },

  // Scanned overlay
  scannedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(46, 204, 113, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 2,
  },
  scannedIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  scannedText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.white,
  },

  // Instructions
  instructionText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.white,
    textAlign: 'center',
  },
  instructionSubtext: {
    fontSize: FONT_SIZES.xs,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginTop: 4,
  },
  rescanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.full,
    marginTop: SPACING.lg,
  },
  rescanButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.white,
  },
  manualEntryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  manualEntryBtnText: {
    fontSize: FONT_SIZES.sm,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
  },

  // Permission
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xxxl,
  },
  loadingText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.white,
    marginTop: SPACING.lg,
  },
  permissionCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xxxl,
    alignItems: 'center',
    maxWidth: 340,
    ...SHADOWS.lg,
  },
  permissionIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.accent + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  permissionTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: SPACING.xl,
  },
  grantBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.xxl,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    ...SHADOWS.md,
  },
  grantBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  cancelPermBtn: {
    marginTop: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  cancelPermBtnText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    fontWeight: '600',
  },

  // Manual Entry
  manualContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
    backgroundColor: COLORS.background,
  },
  manualCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xxl,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    ...SHADOWS.lg,
  },
  manualIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.accent + '12',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  manualTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  manualSubtext: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: SPACING.xl,
  },
  manualInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    height: 50,
    gap: SPACING.sm,
    width: '100%',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.sm,
  },
  manualInput: {
    flex: 1,
    fontSize: FONT_SIZES.lg,
    color: COLORS.text,
    fontFamily: 'monospace',
    letterSpacing: 1,
    height: '100%',
  },
  manualHint: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginBottom: SPACING.xl,
    fontStyle: 'italic',
  },
  manualSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accent,
    paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    width: '100%',
    ...SHADOWS.md,
  },
  manualSubmitBtnDisabled: {
    opacity: 0.5,
  },
  manualSubmitBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  switchModeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  switchModeBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.accent,
  },
});
