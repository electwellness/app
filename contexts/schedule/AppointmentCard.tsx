import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Linking } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES } from '../../constants/theme';
import { Appointment, appointmentTypes, formatTimeDisplay, getProgramColor } from '../../data/scheduleData';
import { openDirectionsInMaps } from '../../lib/openMaps';

interface AppointmentCardProps {
  appointment: Appointment;
  onPress: (appointment: Appointment) => void;
  onLongPress?: (appointment: Appointment) => void;
  compact?: boolean;
  gridMode?: boolean;
  heightPx?: number;
  selected?: boolean;
  multiSelectMode?: boolean;
  directionsOrigin?: string;
  clientAddress?: string;
  onBiometricPress?: (appointment: Appointment) => void;
  /**
   * When this appointment is paired with another in-session appointment
   * (e.g. a training session paired with a biometric assessment that happens
   * DURING the session), this prop carries the paired appointment. The card
   * will render a small "in-session" badge/ribbon to show the link visually.
   */
  inSessionPair?: Appointment | null;
}

export default function AppointmentCard({
  appointment, onPress, onLongPress, compact = false, gridMode = false, heightPx,
  selected = false, multiSelectMode = false,
  directionsOrigin, clientAddress,
  onBiometricPress,
  inSessionPair,
}: AppointmentCardProps) {
  const apptType = appointmentTypes.find(t => t.id === appointment.appointmentTypeId);
  const color = apptType?.color || '#999';
  const icon = apptType?.icon || 'calendar';
  const programColor = getProgramColor(appointment.clientProgram);

  const isTrainingSession = apptType?.category === 'training';
  const canShowDirections = isTrainingSession && !!clientAddress;
  const isBiometricAssessment = apptType?.category === 'assessment';
  const canShowBiometric = isBiometricAssessment && !!onBiometricPress;
  const hasVideoCall = !!appointment.videoCallLink;

  // In-session pair detection — what to show in the ribbon
  const pairType = inSessionPair ? appointmentTypes.find(t => t.id === inSessionPair.appointmentTypeId) : null;
  const hasInSessionPair = !!inSessionPair && !!pairType;
  // If this card is the TRAINING half, its pair will be a biometric (and vice versa).
  const pairRibbonLabel = hasInSessionPair
    ? (isTrainingSession ? `+ ${pairType!.shortName}` : `In ${pairType!.shortName}`)
    : '';
  const pairRibbonIcon: 'body' | 'fitness' = isTrainingSession ? 'body' : 'fitness';

  // Partner session detection
  const isPartnerSession = appointment.appointmentTypeId === 'partner-training' || !!appointment.partnerGroupId;
  const partnerNames = appointment.partnerClientNames && appointment.partnerClientNames.length > 0
    ? `with ${appointment.partnerClientNames.join(', ')}`
    : '';


  const statusColors: Record<string, string> = {
    scheduled: '#f39c12', confirmed: '#2ecc71', completed: '#3498db',
    'no-show': '#e74c3c', cancelled: '#95a5a6',
  };

  const handlePress = () => onPress(appointment);
  const handleLongPress = () => { if (onLongPress) onLongPress(appointment); };

  const handleDirectionsPress = () => {
    if (!clientAddress) { Alert.alert('No Address', 'This client does not have an address on file.'); return; }
    if (!directionsOrigin) { Alert.alert('No Origin Address', 'No starting address is available for directions.'); return; }
    openDirectionsInMaps(directionsOrigin, clientAddress);
  };

  const handleBiometricPress = () => { if (onBiometricPress) onBiometricPress(appointment); };

  const handleVideoCallPress = () => {
    if (!appointment.videoCallLink) { Alert.alert('No Video Link', 'No video call link attached.'); return; }
    Alert.alert('Join Video Call', `Open video call for ${appointment.clientName}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Join Call', onPress: () => { Linking.openURL(appointment.videoCallLink!).catch(() => Alert.alert('Error', 'Could not open link.')); } },
    ]);
  };

  // Grid mode
  if (gridMode) {
    const isSmall = (heightPx || 20) < 30;
    const isTiny = (heightPx || 20) < 15;
    return (
      <TouchableOpacity
        style={[
          styles.gridCard,
          {
            backgroundColor: selected ? COLORS.accent + '30' : color + '22',
            borderLeftColor: selected ? COLORS.accent : color,
            height: heightPx ? heightPx - 1 : undefined,
          },
          selected && styles.selectedBorderGrid,
          hasInSessionPair && styles.gridCardPaired,
        ]}
        onPress={handlePress} onLongPress={handleLongPress} delayLongPress={400} activeOpacity={0.7}
      >
        {selected && <View style={styles.gridCheckmark}><Ionicons name="checkmark-circle" size={10} color={COLORS.accent} /></View>}
        {isTiny ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Text style={[styles.gridTinyText, { color: selected ? COLORS.accent : color }]} numberOfLines={1}>{appointment.clientName.split(' ')[0]} - {apptType?.shortName}</Text>
            {hasVideoCall && <Ionicons name="videocam" size={7} color="#9b59b6" />}
            {isPartnerSession && <Ionicons name="people-circle" size={7} color="#8B5CF6" />}
            {hasInSessionPair && <Ionicons name={pairRibbonIcon} size={7} color={pairType!.color} />}
          </View>
        ) : isSmall ? (
          <View style={styles.gridSmallRow}>
            <Text style={[styles.gridSmallTime, { color: selected ? COLORS.accent : color }]} numberOfLines={1}>{formatTimeDisplay(appointment.startTime)}</Text>
            <Text style={styles.gridSmallName} numberOfLines={1}>{appointment.clientName.split(' ')[0]}</Text>
            {isPartnerSession && <Ionicons name="people-circle" size={8} color="#8B5CF6" />}
            {hasVideoCall && <Ionicons name="videocam" size={8} color={selected ? COLORS.accent : '#9b59b6'} />}
            {hasInSessionPair && <Ionicons name={pairRibbonIcon} size={8} color={pairType!.color} />}
            <View style={[styles.gridStatusDot, { backgroundColor: statusColors[appointment.status] }]} />
          </View>
        ) : (
          <>
            <View style={styles.gridTopRow}>
              <Ionicons name={icon as any} size={10} color={selected ? COLORS.accent : color} />
              <Text style={[styles.gridTypeName, { color: selected ? COLORS.accent : color }]} numberOfLines={1}>{apptType?.shortName || 'Appt'}</Text>
              {isPartnerSession && <Ionicons name="people-circle" size={9} color="#8B5CF6" />}
              {hasVideoCall && <TouchableOpacity onPress={handleVideoCallPress} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}><Ionicons name="videocam" size={10} color={selected ? COLORS.accent : '#9b59b6'} /></TouchableOpacity>}
              {isTrainingSession && clientAddress && <TouchableOpacity onPress={handleDirectionsPress} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}><Ionicons name="car" size={9} color={selected ? COLORS.accent : '#555'} /></TouchableOpacity>}
              {canShowBiometric && <TouchableOpacity onPress={handleBiometricPress} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}><MaterialCommunityIcons name="tape-measure" size={10} color={selected ? COLORS.accent : '#e74c3c'} /></TouchableOpacity>}
              {appointment.recurrenceId && <Ionicons name="repeat" size={8} color={selected ? COLORS.accent : color} style={{ opacity: 0.7 }} />}
              <View style={[styles.gridStatusDot, { backgroundColor: statusColors[appointment.status] }]} />
            </View>
            <Text style={styles.gridClientName} numberOfLines={1}>{appointment.clientName}</Text>
            <Text style={[styles.gridTime, { color: (selected ? COLORS.accent : color) + 'CC' }]} numberOfLines={1}>{formatTimeDisplay(appointment.startTime)} - {formatTimeDisplay(appointment.endTime)}</Text>
            {hasInSessionPair && (
              <View style={[styles.gridPairRibbon, { backgroundColor: pairType!.color + '25', borderColor: pairType!.color + '55' }]}>
                <Ionicons name={pairRibbonIcon} size={8} color={pairType!.color} />
                <Text style={[styles.gridPairRibbonText, { color: pairType!.color }]} numberOfLines={1}>{pairRibbonLabel}</Text>
              </View>
            )}
          </>
        )}
      </TouchableOpacity>
    );
  }


  // Compact mode
  if (compact) {
    return (
      <TouchableOpacity
        style={[styles.compactCard, { borderLeftColor: selected ? COLORS.accent : color, backgroundColor: selected ? COLORS.accent + '18' : color + '12' }, selected && styles.selectedBorderCompact]}
        onPress={handlePress} onLongPress={handleLongPress} delayLongPress={400} activeOpacity={0.7}
      >
        {selected && <View style={styles.compactCheckmark}><Ionicons name="checkmark-circle" size={12} color={COLORS.accent} /></View>}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <Text style={[styles.compactTime, { color: selected ? COLORS.accent : color }]} numberOfLines={1}>{formatTimeDisplay(appointment.startTime)}</Text>
          {hasVideoCall && <Ionicons name="videocam" size={9} color="#9b59b6" />}
          {isPartnerSession && <Ionicons name="people-circle" size={9} color="#8B5CF6" />}
          {hasInSessionPair && <Ionicons name={pairRibbonIcon} size={9} color={pairType!.color} />}
        </View>
        <Text style={styles.compactName} numberOfLines={1}>{appointment.clientName.split(' ')[0]}</Text>
        <Text style={[styles.compactType, { color: selected ? COLORS.accent : color }]} numberOfLines={1}>{apptType?.shortName || 'Appt'} · {appointment.duration}m</Text>
        {hasInSessionPair && (
          <Text style={[styles.compactPairText, { color: pairType!.color }]} numberOfLines={1}>{pairRibbonLabel}</Text>
        )}
      </TouchableOpacity>
    );
  }


  // Full card mode
  return (
    <TouchableOpacity
      style={[styles.card, { borderLeftColor: selected ? COLORS.accent : color }, selected && styles.selectedCard]}
      onPress={handlePress} onLongPress={handleLongPress} delayLongPress={400} activeOpacity={0.7}
    >
      {selected && <View style={styles.selectionOverlay}><View style={styles.checkCircle}><Ionicons name="checkmark" size={14} color={COLORS.white} /></View></View>}
      {multiSelectMode && !selected && <View style={styles.selectionOverlay}><View style={styles.emptyCircle} /></View>}

      {/* Row 1 */}
      <View style={[styles.cardHeader, (selected || multiSelectMode) && { paddingLeft: 32 }]}>
        <View style={[styles.iconWrap, { backgroundColor: (selected ? COLORS.accent : color) + '18' }]}>
          <Ionicons name={icon as any} size={14} color={selected ? COLORS.accent : color} />
        </View>
        <View style={styles.headerInfo}>
          <View style={styles.typeRow}>
            <Text style={styles.apptTypeName} numberOfLines={1}>{apptType?.name || 'Appointment'}</Text>
            <Text style={styles.durationInline}>· {appointment.duration}m</Text>
          </View>
          <Text style={styles.timeText}>{formatTimeDisplay(appointment.startTime)} - {formatTimeDisplay(appointment.endTime)}</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.headerRightTop}>
            {hasVideoCall && <TouchableOpacity onPress={handleVideoCallPress} style={[styles.actionIconBtn, styles.videoIconBtnActive]} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.6}><Ionicons name="videocam" size={13} color="#9b59b6" /></TouchableOpacity>}
            {canShowDirections && <TouchableOpacity onPress={handleDirectionsPress} style={[styles.actionIconBtn, directionsOrigin ? styles.carIconBtnActive : styles.carIconBtnDisabled]} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.6}><Ionicons name="car" size={13} color={directionsOrigin ? '#3498db' : COLORS.textMuted} /></TouchableOpacity>}
            {canShowBiometric && <TouchableOpacity onPress={handleBiometricPress} style={[styles.actionIconBtn, styles.biometricIconBtnActive]} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.6}><MaterialCommunityIcons name="tape-measure" size={14} color="#e74c3c" /></TouchableOpacity>}
            <View style={[styles.statusDot, { backgroundColor: statusColors[appointment.status] || '#999' }]} />
          </View>
          {apptType?.countsAsSession && (
            <View style={[styles.sessionBadge, { backgroundColor: programColor + '20' }]}>
              <Ionicons name="ticket" size={8} color={programColor} />
              <Text style={[styles.sessionBadgeText, { color: programColor }]}>Session</Text>
            </View>
          )}
        </View>
      </View>

      {/* Row 2 */}
      <View style={[styles.cardBody, (selected || multiSelectMode) && { paddingLeft: 32 }]}>
        <View style={styles.clientProgramRow}>
          <View style={styles.personRow}>
            <Ionicons name="person" size={12} color={COLORS.textMuted} />
            <Text style={styles.personText} numberOfLines={1}>{appointment.clientName}</Text>
          </View>
          <View style={[styles.programBadge, { backgroundColor: programColor + '15' }]}>
            <Text style={[styles.programText, { color: programColor }]} numberOfLines={1}>{appointment.clientProgram}</Text>
          </View>
        </View>
        <View style={styles.coachVideoRow}>
          <View style={styles.personRow}>
            <Ionicons name={appointment.coachType === 'trainer' ? 'fitness' : 'nutrition'} size={12} color={COLORS.textMuted} />
            <Text style={styles.personText} numberOfLines={1}>{appointment.coachName}</Text>
            {appointment.recurrenceId && <Ionicons name="repeat" size={10} color={COLORS.textMuted} style={{ marginLeft: 2, opacity: 0.6 }} />}
          </View>
          {hasVideoCall && (
            <TouchableOpacity onPress={handleVideoCallPress} style={styles.videoCallBadge} activeOpacity={0.7}>
              <Ionicons name="videocam" size={9} color="#9b59b6" />
              <Text style={styles.videoCallBadgeText}>Video Call</Text>
            </TouchableOpacity>
          )}
        </View>
        {/* Partner group names row */}
        {isPartnerSession && (
          <View style={styles.partnerRow}>
            <Ionicons name="people-circle" size={12} color="#8B5CF6" />
            <Text style={styles.partnerText} numberOfLines={1}>
              {partnerNames || (appointment.secondClientName ? `with ${appointment.secondClientName}` : 'Partner Session')}
            </Text>
            <View style={styles.partnerBadge}>
              <Text style={styles.partnerBadgeText}>Partner</Text>
            </View>
          </View>
        )}
        {/* In-session pair row — shows when a training+biometric share the same slot */}
        {hasInSessionPair && (
          <View style={[styles.inSessionRow, { backgroundColor: pairType!.color + '10', borderColor: pairType!.color + '40' }]}>
            <View style={[styles.inSessionConnector, { backgroundColor: pairType!.color + '80' }]} />
            <Ionicons name={pairRibbonIcon} size={11} color={pairType!.color} />
            <Text style={[styles.inSessionText, { color: pairType!.color }]} numberOfLines={1}>
              {isTrainingSession
                ? `In-session: ${pairType!.name} (${formatTimeDisplay(inSessionPair!.startTime)})`
                : `During ${pairType!.name} (${formatTimeDisplay(inSessionPair!.startTime)} - ${formatTimeDisplay(inSessionPair!.endTime)})`
              }
            </Text>
            <View style={[styles.inSessionBadge, { backgroundColor: pairType!.color + '18', borderColor: pairType!.color + '40' }]}>
              <Text style={[styles.inSessionBadgeText, { color: pairType!.color }]}>Linked</Text>
            </View>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}



const styles = StyleSheet.create({
  gridCard: { borderLeftWidth: 3, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2, overflow: 'hidden' },
  selectedBorderGrid: { borderWidth: 1, borderColor: COLORS.accent + '50', borderLeftWidth: 3 },
  gridCheckmark: { position: 'absolute', top: 1, right: 1, zIndex: 2 },
  gridTopRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  gridTypeName: { fontSize: 9, fontWeight: '700', flex: 1 },
  gridStatusDot: { width: 5, height: 5, borderRadius: 3 },
  gridClientName: { fontSize: 10, fontWeight: '600', color: COLORS.primary, marginTop: 1 },
  gridTime: { fontSize: 8, fontWeight: '500', marginTop: 1 },
  gridSmallRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  gridSmallTime: { fontSize: 8, fontWeight: '700' },
  gridSmallName: { fontSize: 9, fontWeight: '600', color: COLORS.primary, flex: 1 },
  gridTinyText: { fontSize: 8, fontWeight: '600' },
  card: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, borderLeftWidth: 4, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, marginBottom: SPACING.xs, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2, position: 'relative', overflow: 'hidden' },
  selectedCard: { backgroundColor: COLORS.accent + '08', borderColor: COLORS.accent + '30', borderWidth: 1, borderLeftWidth: 4, shadowOpacity: 0.12, elevation: 4 },
  selectionOverlay: { position: 'absolute', top: SPACING.sm, left: SPACING.md, zIndex: 5 },
  checkCircle: { width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center', shadowColor: COLORS.accent, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3 },
  emptyCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: COLORS.border, backgroundColor: COLORS.white },
  compactCard: { borderLeftWidth: 3, paddingHorizontal: 6, paddingVertical: 4, borderRadius: BORDER_RADIUS.sm, marginBottom: 3, position: 'relative' },
  selectedBorderCompact: { borderWidth: 1, borderColor: COLORS.accent + '40', borderLeftWidth: 3 },
  compactCheckmark: { position: 'absolute', top: 2, right: 2, zIndex: 2 },
  compactTime: { fontSize: 9, fontWeight: '700' },
  compactName: { fontSize: 10, fontWeight: '600', color: COLORS.primary },
  compactType: { fontSize: 8, fontWeight: '500' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: 4 },
  iconWrap: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  headerInfo: { flex: 1 },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerRight: { alignItems: 'flex-end', gap: 3 },
  headerRightTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  apptTypeName: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.primary, flexShrink: 1 },
  durationInline: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: COLORS.textMuted },
  timeText: { fontSize: 10, color: COLORS.textSecondary, fontWeight: '500', marginTop: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  sessionBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 5, paddingVertical: 1, borderRadius: BORDER_RADIUS.sm },
  sessionBadgeText: { fontSize: 8, fontWeight: '700' },
  actionIconBtn: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  videoIconBtnActive: { backgroundColor: '#9b59b6' + '18' },
  carIconBtnActive: { backgroundColor: '#3498db' + '15' },
  carIconBtnDisabled: { backgroundColor: COLORS.borderLight, opacity: 0.5 },
  biometricIconBtnActive: { backgroundColor: '#e74c3c' + '15' },
  cardBody: { gap: 2 },
  clientProgramRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.xs },
  coachVideoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.xs },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 },
  personText: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, fontWeight: '500', flex: 1 },
  programBadge: { paddingHorizontal: SPACING.xs, paddingVertical: 1, borderRadius: BORDER_RADIUS.sm, flexShrink: 0, maxWidth: '45%' },
  programText: { fontSize: 9, fontWeight: '600' },
  videoCallBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#9b59b6' + '14', paddingHorizontal: 6, paddingVertical: 2, borderRadius: BORDER_RADIUS.sm, borderWidth: 1, borderColor: '#9b59b6' + '25' },
  videoCallBadgeText: { fontSize: 8, fontWeight: '700', color: '#9b59b6', letterSpacing: 0.2 },
  // Partner session styles
  partnerRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  partnerText: { fontSize: FONT_SIZES.xs, color: '#8B5CF6', fontWeight: '600', flex: 1 },
  partnerBadge: { backgroundColor: '#8B5CF6' + '14', paddingHorizontal: 6, paddingVertical: 2, borderRadius: BORDER_RADIUS.sm, borderWidth: 1, borderColor: '#8B5CF6' + '25' },
  partnerBadgeText: { fontSize: 8, fontWeight: '700', color: '#8B5CF6', letterSpacing: 0.2 },

  // ── In-session pair (training + biometric sharing a slot) ──
  // Grid card
  gridCardPaired: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#e74c3c' + '60',
  },
  gridPairRibbon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 0.5,
    marginTop: 2,
    alignSelf: 'flex-start',
  },
  gridPairRibbonText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  // Compact card
  compactPairText: {
    fontSize: 8,
    fontWeight: '700',
    marginTop: 1,
  },
  // Full card row
  inSessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    position: 'relative',
  },
  inSessionConnector: {
    position: 'absolute',
    left: -4,
    top: '50%',
    width: 8,
    height: 2,
    borderRadius: 1,
    opacity: 0.7,
  },
  inSessionText: {
    flex: 1,
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
  },
  inSessionBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
  },
  inSessionBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});

