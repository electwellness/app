import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal,
  Image, ActivityIndicator, Platform, Alert, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES, BRAND } from '../../constants/theme';
import type { BiometricEntry } from '../../data/clientPortalData';
import type { PhotoDateGroup } from '../../lib/clientDataService';

interface ShareResultsModalProps {
  visible: boolean;
  onClose: () => void;
  clientName: string;
  firstEntry: BiometricEntry | null;
  latestEntry: BiometricEntry | null;
  photoGroups: PhotoDateGroup[];
}

type ShareMethod = 'email' | 'link' | 'image';

export default function ShareResultsModal({
  visible, onClose, clientName, firstEntry, latestEntry, photoGroups,
}: ShareResultsModalProps) {
  const [shareMethod, setShareMethod] = useState<ShareMethod | null>(null);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [sharing, setSharing] = useState(false);
  const [shareSuccess, setShareSuccess] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const summaryRef = useRef<View>(null);

  // Calculate changes
  const weightChange = firstEntry && latestEntry ? latestEntry.weight - firstEntry.weight : 0;
  const bodyFatChange = firstEntry && latestEntry ? latestEntry.bodyFat - firstEntry.bodyFat : 0;
  const muscleChange = firstEntry && latestEntry ? latestEntry.muscleMass - firstEntry.muscleMass : 0;
  const waistChange = firstEntry && latestEntry ? (latestEntry.navelWaist || 0) - (firstEntry.navelWaist || 0) : 0;
  const bpSysChange = firstEntry && latestEntry ? latestEntry.bloodPressureSys - firstEntry.bloodPressureSys : 0;

  const daysBetween = firstEntry && latestEntry
    ? Math.round(Math.abs(new Date(latestEntry.date).getTime() - new Date(firstEntry.date).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const startDate = firstEntry
    ? new Date(firstEntry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  const endDate = latestEntry
    ? new Date(latestEntry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  // Get earliest and latest photo groups
  const earliestPhotos = photoGroups.length > 0 ? photoGroups[photoGroups.length - 1] : null;
  const latestPhotos = photoGroups.length > 0 ? photoGroups[0] : null;

  const resetState = () => {
    setShareMethod(null);
    setEmailTo('');
    setEmailSubject('');
    setEmailMessage('');
    setSharing(false);
    setShareSuccess(null);
    setLinkCopied(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  // Generate summary text
  const generateSummaryText = useCallback(() => {
    const lines = [
      `${clientName}'s Wellness Progress Report`,
      `${BRAND.name} - ${BRAND.tagline}`,
      '',
      `Period: ${startDate} to ${endDate} (${daysBetween} days)`,
      '',
      'Key Results:',
    ];

    if (weightChange !== 0) {
      lines.push(`  Weight: ${weightChange > 0 ? '+' : ''}${weightChange.toFixed(1)} lbs (${firstEntry?.weight || 0} -> ${latestEntry?.weight || 0} lbs)`);
    }
    if (bodyFatChange !== 0) {
      lines.push(`  Body Fat: ${bodyFatChange > 0 ? '+' : ''}${bodyFatChange.toFixed(1)}% (${firstEntry?.bodyFat || 0}% -> ${latestEntry?.bodyFat || 0}%)`);
    }
    if (muscleChange !== 0) {
      lines.push(`  Muscle Mass: ${muscleChange > 0 ? '+' : ''}${muscleChange.toFixed(1)} lbs (${firstEntry?.muscleMass || 0} -> ${latestEntry?.muscleMass || 0} lbs)`);
    }
    if (waistChange !== 0) {
      lines.push(`  Waist: ${waistChange > 0 ? '+' : ''}${waistChange.toFixed(1)} in`);
    }
    if (bpSysChange !== 0) {
      lines.push(`  Blood Pressure: ${firstEntry?.bloodPressureSys}/${firstEntry?.bloodPressureDia} -> ${latestEntry?.bloodPressureSys}/${latestEntry?.bloodPressureDia}`);
    }

    lines.push('');
    lines.push(`Powered by ${BRAND.name}`);
    lines.push('https://electwellness.com');

    return lines.join('\n');
  }, [clientName, startDate, endDate, daysBetween, weightChange, bodyFatChange, muscleChange, waistChange, bpSysChange, firstEntry, latestEntry]);

  // Generate HTML for image download
  const generateShareHTML = useCallback(() => {
    const beforeFrontUrl = earliestPhotos?.photos?.front?.photoUrl || '';
    const afterFrontUrl = latestPhotos?.photos?.front?.photoUrl || '';

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f0f4f8; padding: 20px; }
  .card { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
  .header { background: linear-gradient(135deg, #0A3D5C, #0E8AC8); padding: 24px; text-align: center; color: white; }
  .header img { height: 40px; margin-bottom: 8px; }
  .header h1 { font-size: 20px; font-weight: 800; margin-bottom: 4px; }
  .header p { font-size: 12px; opacity: 0.8; }
  .period { text-align: center; padding: 12px; background: #f8f9fa; font-size: 13px; color: #5a7a8f; font-weight: 600; }
  .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; padding: 20px; }
  .metric { text-align: center; padding: 16px 8px; background: #f8f9fa; border-radius: 12px; }
  .metric .value { font-size: 24px; font-weight: 900; }
  .metric .label { font-size: 11px; color: #8fa4b5; font-weight: 600; margin-top: 4px; }
  .metric.good .value { color: #2ecc71; }
  .metric.bad .value { color: #e74c3c; }
  .photos { display: flex; gap: 12px; padding: 0 20px 20px; }
  .photo-col { flex: 1; text-align: center; }
  .photo-col img { width: 100%; border-radius: 12px; aspect-ratio: 0.75; object-fit: cover; }
  .photo-col .photo-label { font-size: 11px; font-weight: 700; color: #5a7a8f; margin-top: 6px; }
  .details { padding: 0 20px 20px; }
  .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #edf2f7; font-size: 13px; }
  .detail-row .label { color: #5a7a8f; }
  .detail-row .value { font-weight: 700; color: #0A3D5C; }
  .footer { background: #0A3D5C; padding: 16px; text-align: center; color: white; }
  .footer img { height: 24px; margin-bottom: 4px; }
  .footer p { font-size: 10px; opacity: 0.7; }
  .footer .tagline { font-size: 12px; font-weight: 600; opacity: 0.9; }
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <img src="${BRAND.logoFull}" alt="${BRAND.name}" />
    <h1>${clientName}'s Progress</h1>
    <p>Wellness Transformation Report</p>
  </div>
  <div class="period">${startDate} - ${endDate} (${daysBetween} days)</div>
  <div class="metrics">
    <div class="metric ${weightChange < 0 ? 'good' : 'bad'}">
      <div class="value">${weightChange > 0 ? '+' : ''}${weightChange.toFixed(1)}</div>
      <div class="label">lbs Weight</div>
    </div>
    <div class="metric ${bodyFatChange < 0 ? 'good' : 'bad'}">
      <div class="value">${bodyFatChange > 0 ? '+' : ''}${bodyFatChange.toFixed(1)}%</div>
      <div class="label">Body Fat</div>
    </div>
    <div class="metric ${muscleChange > 0 ? 'good' : 'bad'}">
      <div class="value">${muscleChange > 0 ? '+' : ''}${muscleChange.toFixed(1)}</div>
      <div class="label">lbs Muscle</div>
    </div>
  </div>
  ${(beforeFrontUrl || afterFrontUrl) ? `
  <div class="photos">
    ${beforeFrontUrl ? `<div class="photo-col"><img src="${beforeFrontUrl}" /><div class="photo-label">Before - ${earliestPhotos?.displayDate || ''}</div></div>` : ''}
    ${afterFrontUrl ? `<div class="photo-col"><img src="${afterFrontUrl}" /><div class="photo-label">After - ${latestPhotos?.displayDate || ''}</div></div>` : ''}
  </div>` : ''}
  <div class="details">
    ${firstEntry && latestEntry ? `
    <div class="detail-row"><span class="label">Weight</span><span class="value">${firstEntry.weight} -> ${latestEntry.weight} lbs</span></div>
    <div class="detail-row"><span class="label">Body Fat</span><span class="value">${firstEntry.bodyFat}% -> ${latestEntry.bodyFat}%</span></div>
    <div class="detail-row"><span class="label">Muscle Mass</span><span class="value">${firstEntry.muscleMass} -> ${latestEntry.muscleMass} lbs</span></div>
    <div class="detail-row"><span class="label">Blood Pressure</span><span class="value">${firstEntry.bloodPressureSys}/${firstEntry.bloodPressureDia} -> ${latestEntry.bloodPressureSys}/${latestEntry.bloodPressureDia}</span></div>
    <div class="detail-row"><span class="label">Heart Rate</span><span class="value">${firstEntry.heartRate} -> ${latestEntry.heartRate} bpm</span></div>

    ` : ''}
  </div>
  <div class="footer">
    <img src="${BRAND.logoFull}" alt="${BRAND.name}" />
    <p class="tagline">${BRAND.tagline}</p>
    <p>electwellness.com</p>
  </div>
</div>
</body>
</html>`;
  }, [clientName, startDate, endDate, daysBetween, weightChange, bodyFatChange, muscleChange, firstEntry, latestEntry, earliestPhotos, latestPhotos]);

  // Share via email
  const handleShareEmail = useCallback(async () => {
    if (!emailTo.trim()) {
      Alert.alert('Email Required', 'Please enter a recipient email address.');
      return;
    }
    setSharing(true);
    try {
      const subject = emailSubject.trim() || `${clientName}'s Wellness Progress - ${BRAND.name}`;
      const body = emailMessage.trim()
        ? `${emailMessage.trim()}\n\n---\n\n${generateSummaryText()}`
        : generateSummaryText();

      const mailtoUrl = `mailto:${encodeURIComponent(emailTo)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

      if (Platform.OS === 'web') {
        window.open(mailtoUrl, '_blank');
      } else {
        const { Linking } = require('react-native');
        await Linking.openURL(mailtoUrl);
      }

      setShareSuccess('Email client opened with your progress report!');
    } catch (err) {
      console.error('Email share error:', err);
      Alert.alert('Error', 'Unable to open email client.');
    } finally {
      setSharing(false);
    }
  }, [emailTo, emailSubject, emailMessage, clientName, generateSummaryText]);

  // Copy link
  const handleCopyLink = useCallback(async () => {
    setSharing(true);
    try {
      const summaryText = generateSummaryText();
      if (Platform.OS === 'web' && navigator.clipboard) {
        await navigator.clipboard.writeText(summaryText);
      } else {
        // Fallback: create a temporary textarea
        if (Platform.OS === 'web') {
          const textarea = document.createElement('textarea');
          textarea.value = summaryText;
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
        }
      }
      setLinkCopied(true);
      setShareSuccess('Progress summary copied to clipboard!');
      setTimeout(() => setLinkCopied(false), 3000);
    } catch (err) {
      console.error('Copy error:', err);
      Alert.alert('Error', 'Unable to copy to clipboard.');
    } finally {
      setSharing(false);
    }
  }, [generateSummaryText]);

  // Download as image (HTML)
  const handleDownloadImage = useCallback(async () => {
    setSharing(true);
    try {
      const html = generateShareHTML();
      if (Platform.OS === 'web') {
        const newWindow = window.open('', '_blank');
        if (newWindow) {
          newWindow.document.write(html);
          newWindow.document.close();
          // Add print instruction
          newWindow.document.title = `${clientName} Progress - ${BRAND.name}`;
        }
      }
      setShareSuccess('Progress report opened in new tab! Use Ctrl+P to save as PDF or right-click to save as image.');
    } catch (err) {
      console.error('Download error:', err);
      Alert.alert('Error', 'Unable to generate image.');
    } finally {
      setSharing(false);
    }
  }, [generateShareHTML, clientName]);

  const renderChangeCard = (label: string, value: number, unit: string, isGoodWhenNegative: boolean) => {
    const isGood = isGoodWhenNegative ? value < 0 : value > 0;
    const isNeutral = Math.abs(value) < 0.1;

    return (
      <View style={styles.changeCard}>
        <View style={[styles.changeIconBg, {
          backgroundColor: isNeutral ? COLORS.borderLight : isGood ? '#2ecc7115' : '#e74c3c15'
        }]}>
          <Ionicons
            name={isNeutral ? 'remove' : value < 0 ? 'trending-down' : 'trending-up'}
            size={20}
            color={isNeutral ? COLORS.textMuted : isGood ? '#2ecc71' : '#e74c3c'}
          />
        </View>
        <Text style={[styles.changeValue, {
          color: isNeutral ? COLORS.textMuted : isGood ? '#2ecc71' : '#e74c3c'
        }]}>
          {value > 0 ? '+' : ''}{value.toFixed(1)}{unit}
        </Text>
        <Text style={styles.changeLabel}>{label}</Text>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.headerBtn}>
            <Ionicons name="close" size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Share Results</Text>
            <Text style={styles.headerSubtitle}>Generate a shareable progress summary</Text>
          </View>
          <View style={styles.headerBtn} />
        </View>

        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Preview Card */}
          <View style={styles.previewCard} ref={summaryRef}>
            {/* Branded Header */}
            <View style={styles.brandHeader}>
              <Image source={{ uri: BRAND.logoFull }} style={styles.brandLogo} resizeMode="contain" />
              <Text style={styles.brandTitle}>{clientName}'s Progress</Text>
              <Text style={styles.brandPeriod}>{startDate} - {endDate}</Text>
              <View style={styles.daysBadge}>
                <Ionicons name="time-outline" size={12} color="#fff" />
                <Text style={styles.daysBadgeText}>{daysBetween} days</Text>
              </View>
            </View>

            {/* Key Changes */}
            <View style={styles.changesGrid}>
              {renderChangeCard('Weight', weightChange, ' lbs', true)}
              {renderChangeCard('Body Fat', bodyFatChange, '%', true)}
              {renderChangeCard('Muscle', muscleChange, ' lbs', false)}
            </View>

            {/* Before/After Photos */}
            {(earliestPhotos || latestPhotos) && (
              <View style={styles.photosSection}>
                <Text style={styles.photosSectionTitle}>Visual Progress</Text>
                <View style={styles.photosRow}>
                  {/* Before */}
                  <View style={styles.photoColumn}>
                    <Text style={styles.photoColumnLabel}>Before</Text>
                    <Text style={styles.photoColumnDate}>{earliestPhotos?.displayDate || 'N/A'}</Text>
                    <View style={styles.photoThumbs}>
                      {(['front', 'side', 'back'] as const).map(type => {
                        const photo = earliestPhotos?.photos?.[type];
                        return (
                          <View key={type} style={styles.thumbBox}>
                            {photo ? (
                              <Image source={{ uri: photo.photoUrl }} style={styles.thumbImg} resizeMode="cover" />
                            ) : (
                              <View style={styles.thumbEmpty}>
                                <Ionicons name="image-outline" size={14} color={COLORS.border} />
                              </View>
                            )}
                            <Text style={styles.thumbLabel}>{type.charAt(0).toUpperCase()}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>

                  {/* Arrow */}
                  <View style={styles.arrowContainer}>
                    <Ionicons name="arrow-forward" size={20} color="#9b59b6" />
                  </View>

                  {/* After */}
                  <View style={styles.photoColumn}>
                    <Text style={styles.photoColumnLabel}>After</Text>
                    <Text style={styles.photoColumnDate}>{latestPhotos?.displayDate || 'N/A'}</Text>
                    <View style={styles.photoThumbs}>
                      {(['front', 'side', 'back'] as const).map(type => {
                        const photo = latestPhotos?.photos?.[type];
                        return (
                          <View key={type} style={styles.thumbBox}>
                            {photo ? (
                              <Image source={{ uri: photo.photoUrl }} style={styles.thumbImg} resizeMode="cover" />
                            ) : (
                              <View style={styles.thumbEmpty}>
                                <Ionicons name="image-outline" size={14} color={COLORS.border} />
                              </View>
                            )}
                            <Text style={styles.thumbLabel}>{type.charAt(0).toUpperCase()}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* Detailed Metrics */}
            {firstEntry && latestEntry && (
              <View style={styles.detailsSection}>
                <Text style={styles.detailsSectionTitle}>Detailed Changes</Text>
                {[
                  { label: 'Weight', before: `${firstEntry.weight} lbs`, after: `${latestEntry.weight} lbs` },
                  { label: 'Body Fat', before: `${firstEntry.bodyFat}%`, after: `${latestEntry.bodyFat}%` },
                  { label: 'Muscle Mass', before: `${firstEntry.muscleMass} lbs`, after: `${latestEntry.muscleMass} lbs` },
                  { label: 'Blood Pressure', before: `${firstEntry.bloodPressureSys}/${firstEntry.bloodPressureDia}`, after: `${latestEntry.bloodPressureSys}/${latestEntry.bloodPressureDia}` },
                  { label: 'Heart Rate', before: `${firstEntry.heartRate} bpm`, after: `${latestEntry.heartRate} bpm` },


                  { label: 'Navel Waist', before: `${firstEntry.navelWaist} in`, after: `${latestEntry.navelWaist} in` },
                ].map((item, i) => (
                  <View key={i} style={[styles.detailRow, i % 2 === 0 && { backgroundColor: COLORS.background }]}>
                    <Text style={styles.detailLabel}>{item.label}</Text>
                    <Text style={styles.detailBefore}>{item.before}</Text>
                    <Ionicons name="arrow-forward" size={10} color={COLORS.textMuted} />
                    <Text style={styles.detailAfter}>{item.after}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Branded Footer */}
            <View style={styles.brandFooter}>
              <Image source={{ uri: BRAND.logoFull }} style={styles.footerLogo} resizeMode="contain" />
              <Text style={styles.footerTagline}>{BRAND.tagline}</Text>
              <Text style={styles.footerUrl}>electwellness.com</Text>
            </View>
          </View>

          {/* Share Options */}
          <View style={styles.shareSection}>
            <Text style={styles.shareSectionTitle}>Share Via</Text>

            {/* Email */}
            <TouchableOpacity
              style={[styles.shareOption, shareMethod === 'email' && styles.shareOptionActive]}
              onPress={() => setShareMethod(shareMethod === 'email' ? null : 'email')}
              activeOpacity={0.7}
            >
              <View style={[styles.shareOptionIcon, { backgroundColor: '#3498db15' }]}>
                <Ionicons name="mail-outline" size={22} color="#3498db" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.shareOptionTitle}>Email</Text>
                <Text style={styles.shareOptionSubtitle}>Send progress report via email</Text>
              </View>
              <Ionicons name={shareMethod === 'email' ? 'chevron-up' : 'chevron-forward'} size={18} color={COLORS.textMuted} />
            </TouchableOpacity>

            {shareMethod === 'email' && (
              <View style={styles.emailForm}>
                <View style={styles.emailField}>
                  <Text style={styles.emailFieldLabel}>To</Text>
                  <TextInput
                    style={styles.emailInput}
                    value={emailTo}
                    onChangeText={setEmailTo}
                    placeholder="recipient@email.com"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
                <View style={styles.emailField}>
                  <Text style={styles.emailFieldLabel}>Subject</Text>
                  <TextInput
                    style={styles.emailInput}
                    value={emailSubject}
                    onChangeText={setEmailSubject}
                    placeholder={`${clientName}'s Wellness Progress`}
                    placeholderTextColor={COLORS.textMuted}
                  />
                </View>
                <View style={styles.emailField}>
                  <Text style={styles.emailFieldLabel}>Message (optional)</Text>
                  <TextInput
                    style={[styles.emailInput, { minHeight: 60 }]}
                    value={emailMessage}
                    onChangeText={setEmailMessage}
                    placeholder="Add a personal message..."
                    placeholderTextColor={COLORS.textMuted}
                    multiline
                    textAlignVertical="top"
                  />
                </View>
                <TouchableOpacity
                  style={styles.sendBtn}
                  onPress={handleShareEmail}
                  disabled={sharing}
                  activeOpacity={0.7}
                >
                  {sharing ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="send-outline" size={18} color="#fff" />
                      <Text style={styles.sendBtnText}>Open Email Client</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Copy Link */}
            <TouchableOpacity
              style={styles.shareOption}
              onPress={handleCopyLink}
              activeOpacity={0.7}
            >
              <View style={[styles.shareOptionIcon, { backgroundColor: '#9b59b615' }]}>
                <Ionicons name={linkCopied ? 'checkmark-circle' : 'link-outline'} size={22} color={linkCopied ? '#2ecc71' : '#9b59b6'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.shareOptionTitle}>
                  {linkCopied ? 'Copied!' : 'Copy Summary'}
                </Text>
                <Text style={styles.shareOptionSubtitle}>Copy text summary to clipboard</Text>
              </View>
              {sharing ? (
                <ActivityIndicator size="small" color="#9b59b6" />
              ) : (
                <Ionicons name="copy-outline" size={18} color={COLORS.textMuted} />
              )}
            </TouchableOpacity>

            {/* Download Image */}
            <TouchableOpacity
              style={styles.shareOption}
              onPress={handleDownloadImage}
              activeOpacity={0.7}
            >
              <View style={[styles.shareOptionIcon, { backgroundColor: '#2ecc7115' }]}>
                <Ionicons name="download-outline" size={22} color="#2ecc71" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.shareOptionTitle}>Download Report</Text>
                <Text style={styles.shareOptionSubtitle}>Open branded report as printable page</Text>
              </View>
              {sharing ? (
                <ActivityIndicator size="small" color="#2ecc71" />
              ) : (
                <Ionicons name="open-outline" size={18} color={COLORS.textMuted} />
              )}
            </TouchableOpacity>
          </View>

          {/* Success Message */}
          {shareSuccess && (
            <View style={styles.successBanner}>
              <Ionicons name="checkmark-circle" size={18} color="#2ecc71" />
              <Text style={styles.successText}>{shareSuccess}</Text>
              <TouchableOpacity onPress={() => setShareSuccess(null)}>
                <Ionicons name="close" size={16} color="#2ecc71" />
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
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
  headerSubtitle: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 2 },
  scroll: { flex: 1 },

  // Preview Card
  previewCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    ...SHADOWS.md,
  },
  brandHeader: {
    backgroundColor: COLORS.primary,
    padding: SPACING.xl,
    alignItems: 'center',
  },
  brandLogo: {
    width: 140,
    height: 32,
    marginBottom: SPACING.sm,
  },
  brandTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: '#fff',
    marginTop: SPACING.sm,
  },
  brandPeriod: {
    fontSize: FONT_SIZES.xs,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  daysBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: SPACING.md,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
    marginTop: SPACING.sm,
  },
  daysBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: '#fff',
  },

  // Changes Grid
  changesGrid: {
    flexDirection: 'row',
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  changeCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
  },
  changeIconBg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  changeValue: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '900',
  },
  changeLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginTop: 2,
  },

  // Photos Section
  photosSection: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  photosSectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: SPACING.md,
  },
  photosRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  photoColumn: {
    flex: 1,
    alignItems: 'center',
  },
  photoColumnLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.primary,
  },
  photoColumnDate: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginBottom: SPACING.sm,
  },
  photoThumbs: {
    flexDirection: 'row',
    gap: 4,
  },
  thumbBox: {
    alignItems: 'center',
  },
  thumbImg: {
    width: 48,
    height: 64,
    borderRadius: 6,
    backgroundColor: COLORS.background,
  },
  thumbEmpty: {
    width: 48,
    height: 64,
    borderRadius: 6,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginTop: 2,
  },
  arrowContainer: {
    paddingHorizontal: SPACING.sm,
    paddingTop: 20,
  },

  // Details Section
  detailsSection: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  detailsSectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: SPACING.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    gap: 6,
    borderRadius: 4,
  },
  detailLabel: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  detailBefore: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: '#e74c3c',
  },
  detailAfter: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: '#2ecc71',
  },

  // Branded Footer
  brandFooter: {
    backgroundColor: COLORS.primary,
    padding: SPACING.lg,
    alignItems: 'center',
  },
  footerLogo: {
    width: 100,
    height: 24,
    marginBottom: 4,
  },
  footerTagline: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
  },
  footerUrl: {
    fontSize: FONT_SIZES.xs,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },

  // Share Section
  shareSection: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
  },
  shareSectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: SPACING.md,
  },
  shareOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  shareOptionActive: {
    borderWidth: 1.5,
    borderColor: '#3498db40',
  },
  shareOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareOptionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.primary,
  },
  shareOptionSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  // Email Form
  emailForm: {
    backgroundColor: COLORS.white,
    marginBottom: SPACING.sm,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    ...SHADOWS.sm,
  },
  emailField: {
    marginBottom: SPACING.md,
  },
  emailFieldLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  emailInput: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3498db',
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  sendBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: '#fff',
  },

  // Success Banner
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    padding: SPACING.md,
    backgroundColor: '#2ecc7110',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: '#2ecc7130',
  },
  successText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: '#2ecc71',
  },
});
