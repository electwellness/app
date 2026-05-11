import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal,
  Image, ActivityIndicator, Dimensions, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import { fetchBiometricEntryByDate } from '../../lib/clientDataService';
import type { PhotoDateGroup } from '../../lib/clientDataService';
import type { BiometricEntry } from '../../data/clientPortalData';
import { biometricMeta } from '../../data/clientPortalData';

interface PhotoComparisonModalProps {
  visible: boolean;
  onClose: () => void;
  photoGroups: PhotoDateGroup[];
  userId: string;
  initialBeforeDate?: string;
  initialAfterDate?: string;
}

// Key metrics to show in comparison overlay
const COMPARISON_METRICS: Array<{ key: keyof BiometricEntry; label: string; unit: string }> = [
  { key: 'weight', label: 'Weight', unit: 'lbs' },
  { key: 'bodyFat', label: 'Body Fat', unit: '%' },
  { key: 'muscleMass', label: 'Muscle', unit: 'lbs' },
  { key: 'waist', label: 'Waist', unit: 'in' },
  { key: 'shoulders', label: 'Shoulders', unit: 'in' },
  { key: 'bicep', label: 'Bicep', unit: 'in' },
  { key: 'sideHip', label: 'Side Hip', unit: 'in' },
  { key: 'rearHip', label: 'Rear Hip', unit: 'in' },
  { key: 'navelWaist', label: 'Navel Waist', unit: 'in' },
];


const PHOTO_TYPES = ['front', 'side', 'back'] as const;
type PhotoType = typeof PHOTO_TYPES[number];

const WIDE_BREAKPOINT = 768;

export default function PhotoComparisonModal({
  visible, onClose, photoGroups, userId, initialBeforeDate, initialAfterDate,
}: PhotoComparisonModalProps) {
  const { width: screenWidth } = useWindowDimensions();
  const isWide = screenWidth >= WIDE_BREAKPOINT;

  const [beforeIdx, setBeforeIdx] = useState(0);
  const [afterIdx, setAfterIdx] = useState(0);
  const [beforeEntry, setBeforeEntry] = useState<BiometricEntry | null>(null);
  const [afterEntry, setAfterEntry] = useState<BiometricEntry | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState<'before' | 'after' | null>(null);

  // Initialize indices from props
  useEffect(() => {
    if (photoGroups.length < 2) return;
    if (initialBeforeDate) {
      const idx = photoGroups.findIndex(g => g.date === initialBeforeDate);
      if (idx >= 0) setBeforeIdx(idx);
      else setBeforeIdx(photoGroups.length - 1);
    } else {
      setBeforeIdx(photoGroups.length - 1);
    }
    if (initialAfterDate) {
      const idx = photoGroups.findIndex(g => g.date === initialAfterDate);
      if (idx >= 0) setAfterIdx(idx);
      else setAfterIdx(0);
    } else {
      setAfterIdx(0);
    }
  }, [photoGroups, initialBeforeDate, initialAfterDate]);

  // Fetch biometric data for both dates
  useEffect(() => {
    if (!visible || photoGroups.length < 2) return;
    const loadMetrics = async () => {
      setLoadingMetrics(true);
      try {
        const [bEntry, aEntry] = await Promise.all([
          fetchBiometricEntryByDate(userId, photoGroups[beforeIdx]?.date || ''),
          fetchBiometricEntryByDate(userId, photoGroups[afterIdx]?.date || ''),
        ]);
        setBeforeEntry(bEntry);
        setAfterEntry(aEntry);
      } catch (err) {
        console.error('Error loading comparison metrics:', err);
      } finally {
        setLoadingMetrics(false);
      }
    };
    loadMetrics();
  }, [visible, beforeIdx, afterIdx, photoGroups, userId]);

  if (photoGroups.length < 2) return null;

  const beforeGroup = photoGroups[beforeIdx];
  const afterGroup = photoGroups[afterIdx];

  // Ensure before is earlier, after is later
  const earlyGroup = beforeGroup?.date <= afterGroup?.date ? beforeGroup : afterGroup;
  const laterGroup = beforeGroup?.date <= afterGroup?.date ? afterGroup : beforeGroup;
  const earlyEntry = beforeGroup?.date <= afterGroup?.date ? beforeEntry : afterEntry;
  const laterEntry = beforeGroup?.date <= afterGroup?.date ? afterEntry : beforeEntry;

  // Calculate days between
  const daysBetween = Math.abs(Math.round(
    (new Date(afterGroup?.date || '').getTime() - new Date(beforeGroup?.date || '').getTime()) / (1000 * 60 * 60 * 24)
  ));

  // Photo dimensions
  const photoWidth = isWide
    ? Math.floor((screenWidth - SPACING.lg * 5) / 3)
    : Math.floor((screenWidth - SPACING.lg * 4) / 2);

  const renderDateSelector = (type: 'before' | 'after') => {
    const currentIdx = type === 'before' ? beforeIdx : afterIdx;
    const setIdx = type === 'before' ? setBeforeIdx : setAfterIdx;
    const group = photoGroups[currentIdx];

    return (
      <View style={styles.dateSelectorContainer}>
        <Text style={styles.dateSelectorLabel}>
          {type === 'before' ? 'EARLIER DATE' : 'LATER DATE'}
        </Text>
        <TouchableOpacity
          style={styles.dateSelector}
          onPress={() => setShowDatePicker(showDatePicker === type ? null : type)}
          activeOpacity={0.7}
        >
          <Ionicons name="calendar-outline" size={14} color="#9b59b6" />
          <Text style={styles.dateSelectorText}>{group?.displayDate || 'Select'}</Text>
          <Ionicons name="chevron-down" size={14} color={COLORS.textMuted} />
        </TouchableOpacity>

        {showDatePicker === type && (
          <View style={styles.dateDropdown}>
            <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
              {photoGroups.map((g, i) => {
                const isDisabled = type === 'before'
                  ? g.date >= (photoGroups[afterIdx]?.date || '')
                  : g.date <= (photoGroups[beforeIdx]?.date || '');
                return (
                  <TouchableOpacity
                    key={g.date}
                    style={[
                      styles.dateOption,
                      currentIdx === i && styles.dateOptionActive,
                      isDisabled && styles.dateOptionDisabled,
                    ]}
                    onPress={() => {
                      if (!isDisabled) {
                        setIdx(i);
                        setShowDatePicker(null);
                      }
                    }}
                    disabled={isDisabled}
                  >
                    <Text style={[
                      styles.dateOptionText,
                      currentIdx === i && styles.dateOptionTextActive,
                      isDisabled && styles.dateOptionTextDisabled,
                    ]}>
                      {g.displayDate}
                    </Text>
                    <View style={styles.datePhotoIcons}>
                      {g.photos.front && <View style={[styles.miniDot, { backgroundColor: '#2ecc71' }]} />}
                      {g.photos.side && <View style={[styles.miniDot, { backgroundColor: '#3498db' }]} />}
                      {g.photos.back && <View style={[styles.miniDot, { backgroundColor: '#f39c12' }]} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
      </View>
    );
  };

  const renderSinglePhoto = (
    group: PhotoDateGroup | undefined,
    type: PhotoType,
    label: string,
    width: number
  ) => {
    const photo = group?.photos[type];
    const typeColors: Record<PhotoType, string> = { front: '#2ecc71', side: '#3498db', back: '#f39c12' };
    const typeLabels: Record<PhotoType, string> = { front: 'Front', side: 'Side', back: 'Back' };

    return (
      <View style={[styles.singlePhotoContainer, { width }]}>
        {photo ? (
          <View style={styles.photoWrapper}>
            <Image source={{ uri: photo.photoUrl }} style={styles.comparisonPhoto} resizeMode="cover" />
            <View style={[styles.photoTypeBadge, { backgroundColor: typeColors[type] }]}>
              <Text style={styles.photoTypeBadgeText}>{typeLabels[type]}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.noPhotoPlaceholder}>
            <Ionicons name="image-outline" size={28} color={COLORS.border} />
            <Text style={styles.noPhotoText}>No {typeLabels[type]}</Text>
          </View>
        )}
        {!isWide && (
          <Text style={styles.photoDateLabel} numberOfLines={1}>{label}</Text>
        )}
      </View>
    );
  };

  const renderMetricChange = (metric: typeof COMPARISON_METRICS[0]) => {
    if (!earlyEntry || !laterEntry) return null;
    const beforeVal = Number((earlyEntry as any)[metric.key]) || 0;
    const afterVal = Number((laterEntry as any)[metric.key]) || 0;
    if (beforeVal === 0 && afterVal === 0) return null;

    const change = afterVal - beforeVal;
    const meta = biometricMeta[metric.key as string];
    const isGood = meta?.goodDirection === 'down' ? change < 0 : change > 0;
    const isNeutral = Math.abs(change) < 0.1;

    return (
      <View key={metric.key as string} style={styles.metricRow}>
        <Text style={styles.metricRowLabel}>{metric.label}</Text>
        <View style={styles.metricValues}>
          <Text style={styles.metricBefore}>{beforeVal.toFixed(1)}</Text>
          <Ionicons name="arrow-forward" size={10} color={COLORS.textMuted} />
          <Text style={styles.metricAfter}>{afterVal.toFixed(1)}</Text>
        </View>
        <View style={[
          styles.changePill,
          {
            backgroundColor: isNeutral ? COLORS.borderLight :
              isGood ? '#2ecc7115' : '#e74c3c15',
          },
        ]}>
          {!isNeutral && (
            <Ionicons
              name={change > 0 ? 'arrow-up' : 'arrow-down'}
              size={10}
              color={isGood ? '#2ecc71' : '#e74c3c'}
            />
          )}
          <Text style={[
            styles.changeValue,
            {
              color: isNeutral ? COLORS.textMuted :
                isGood ? '#2ecc71' : '#e74c3c',
            },
          ]}>
            {isNeutral ? '--' : `${change > 0 ? '+' : ''}${change.toFixed(1)} ${metric.unit}`}
          </Text>
        </View>
      </View>
    );
  };

  // ============================================================
  // WIDE LAYOUT: Early date on top, later date on bottom
  // Each row has Front | Side | Back
  // ============================================================
  const renderWideLayout = () => {
    const pw = Math.floor((screenWidth - SPACING.lg * 2 - SPACING.md * 2) / 3);
    return (
      <View style={styles.widePhotosContainer}>
        {/* Early Date Row */}
        <View style={styles.dateRowHeader}>
          <View style={[styles.dateRowDot, { backgroundColor: '#e74c3c' }]} />
          <Text style={styles.dateRowTitle}>
            {earlyGroup?.displayDate || 'Earlier'}
          </Text>
          <View style={styles.dateRowBadge}>
            <Text style={styles.dateRowBadgeText}>Before</Text>
          </View>
        </View>
        <View style={styles.widePhotoRow}>
          {PHOTO_TYPES.map(type => (
            <View key={`early-${type}`} style={{ flex: 1 }}>
              {renderSinglePhoto(earlyGroup, type, earlyGroup?.displayDate || '', pw)}
            </View>
          ))}
        </View>

        {/* Divider */}
        <View style={styles.rowDivider}>
          <View style={styles.rowDividerLine} />
          <View style={styles.rowDividerBadge}>
            <Ionicons name="swap-vertical" size={16} color="#9b59b6" />
            <Text style={styles.rowDividerText}>{daysBetween} days</Text>
          </View>
          <View style={styles.rowDividerLine} />
        </View>

        {/* Later Date Row */}
        <View style={styles.dateRowHeader}>
          <View style={[styles.dateRowDot, { backgroundColor: '#2ecc71' }]} />
          <Text style={styles.dateRowTitle}>
            {laterGroup?.displayDate || 'Later'}
          </Text>
          <View style={[styles.dateRowBadge, { backgroundColor: '#2ecc7115' }]}>
            <Text style={[styles.dateRowBadgeText, { color: '#2ecc71' }]}>After</Text>
          </View>
        </View>
        <View style={styles.widePhotoRow}>
          {PHOTO_TYPES.map(type => (
            <View key={`later-${type}`} style={{ flex: 1 }}>
              {renderSinglePhoto(laterGroup, type, laterGroup?.displayDate || '', pw)}
            </View>
          ))}
        </View>
      </View>
    );
  };

  // ============================================================
  // NARROW LAYOUT: Early date on left, later date on right
  // Each row is a view type: Front, Side, Back
  // ============================================================
  const renderNarrowLayout = () => {
    const pw = Math.floor((screenWidth - SPACING.lg * 2 - SPACING.md) / 2);
    return (
      <View style={styles.narrowPhotosContainer}>
        {/* Column headers */}
        <View style={styles.narrowColumnHeaders}>
          <View style={[styles.narrowColumnHeader, { width: pw }]}>
            <View style={[styles.dateRowDot, { backgroundColor: '#e74c3c' }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.narrowColumnTitle} numberOfLines={1}>
                {earlyGroup?.displayDate || 'Earlier'}
              </Text>
              <Text style={styles.narrowColumnSubtitle}>Before</Text>
            </View>
          </View>
          <View style={[styles.narrowColumnHeader, { width: pw }]}>
            <View style={[styles.dateRowDot, { backgroundColor: '#2ecc71' }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.narrowColumnTitle} numberOfLines={1}>
                {laterGroup?.displayDate || 'Later'}
              </Text>
              <Text style={styles.narrowColumnSubtitle}>After</Text>
            </View>
          </View>
        </View>

        {/* Photo rows - one per view type */}
        {PHOTO_TYPES.map(type => {
          const typeLabels: Record<PhotoType, string> = { front: 'Front View', side: 'Side View', back: 'Back View' };
          const typeIcons: Record<PhotoType, string> = { front: 'person-outline', side: 'body-outline', back: 'accessibility-outline' };
          const typeColors: Record<PhotoType, string> = { front: '#2ecc71', side: '#3498db', back: '#f39c12' };

          return (
            <View key={type} style={styles.narrowViewSection}>
              {/* View type label */}
              <View style={styles.viewTypeHeader}>
                <View style={[styles.viewTypeIconBg, { backgroundColor: typeColors[type] + '15' }]}>
                  <Ionicons name={typeIcons[type] as any} size={14} color={typeColors[type]} />
                </View>
                <Text style={styles.viewTypeLabel}>{typeLabels[type]}</Text>
              </View>
              {/* Side by side photos */}
              <View style={styles.narrowPhotoRow}>
                {renderSinglePhoto(earlyGroup, type, earlyGroup?.displayDate || '', pw)}
                {renderSinglePhoto(laterGroup, type, laterGroup?.displayDate || '', pw)}
              </View>
            </View>
          );
        })}

        {/* Days apart badge */}
        <View style={styles.daysApartBadge}>
          <Ionicons name="time-outline" size={14} color="#9b59b6" />
          <Text style={styles.daysApartText}>{daysBetween} days apart</Text>
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <Ionicons name="close" size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Compare Progress</Text>
            {daysBetween > 0 && (
              <Text style={styles.headerSubtitle}>
                {daysBetween} days apart {isWide ? '(Desktop View)' : '(Mobile View)'}
              </Text>
            )}
          </View>
          <View style={styles.headerBtn} />
        </View>

        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Date Selectors */}
          <View style={styles.dateSelectorsRow}>
            {renderDateSelector('before')}
            <View style={styles.vsCircle}>
              <Ionicons name="swap-horizontal" size={16} color="#9b59b6" />
            </View>
            {renderDateSelector('after')}
          </View>

          {/* Layout info banner */}
          <View style={styles.layoutInfoBanner}>
            <Ionicons
              name={isWide ? 'laptop-outline' : 'phone-portrait-outline'}
              size={14}
              color={COLORS.accent}
            />
            <Text style={styles.layoutInfoText}>
              {isWide
                ? 'Desktop layout: Earlier date on top, later date on bottom'
                : 'Mobile layout: Earlier date on left, later date on right'}
            </Text>
          </View>

          {/* Photo Comparison - Responsive Layout */}
          {isWide ? renderWideLayout() : renderNarrowLayout()}

          {/* Measurement Overlay / Changes */}
          <View style={styles.metricsSection}>
            <View style={styles.metricsSectionHeader}>
              <Ionicons name="analytics-outline" size={20} color="#9b59b6" />
              <Text style={styles.metricsSectionTitle}>Measurement Changes</Text>
            </View>

            {loadingMetrics ? (
              <View style={styles.metricsLoading}>
                <ActivityIndicator size="small" color="#9b59b6" />
                <Text style={styles.metricsLoadingText}>Loading measurements...</Text>
              </View>
            ) : earlyEntry && laterEntry ? (
              <View style={styles.metricsTable}>
                {/* Table Header */}
                <View style={styles.metricsTableHeader}>
                  <Text style={[styles.tableHeaderText, { flex: 1.2 }]}>Metric</Text>
                  <Text style={[styles.tableHeaderText, { flex: 1.5, textAlign: 'center' }]}>Before / After</Text>
                  <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'right' }]}>Change</Text>
                </View>
                {COMPARISON_METRICS.map(m => renderMetricChange(m))}

                {/* Summary Card */}
                <View style={styles.summaryCard}>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Weight Change</Text>
                    <Text style={[styles.summaryValue, {
                      color: (laterEntry.weight - earlyEntry.weight) < 0 ? '#2ecc71' : '#e74c3c'
                    }]}>
                      {(laterEntry.weight - earlyEntry.weight) > 0 ? '+' : ''}
                      {(laterEntry.weight - earlyEntry.weight).toFixed(1)} lbs
                    </Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Body Fat Change</Text>
                    <Text style={[styles.summaryValue, {
                      color: (laterEntry.bodyFat - earlyEntry.bodyFat) < 0 ? '#2ecc71' : '#e74c3c'
                    }]}>
                      {(laterEntry.bodyFat - earlyEntry.bodyFat) > 0 ? '+' : ''}
                      {(laterEntry.bodyFat - earlyEntry.bodyFat).toFixed(1)}%
                    </Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Muscle Change</Text>
                    <Text style={[styles.summaryValue, {
                      color: (laterEntry.muscleMass - earlyEntry.muscleMass) > 0 ? '#2ecc71' : '#e74c3c'
                    }]}>
                      {(laterEntry.muscleMass - earlyEntry.muscleMass) > 0 ? '+' : ''}
                      {(laterEntry.muscleMass - earlyEntry.muscleMass).toFixed(1)} lbs
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.metricsLoading}>
                <Ionicons name="information-circle-outline" size={24} color={COLORS.textMuted} />
                <Text style={styles.metricsLoadingText}>
                  No biometric measurements found for these dates.
                </Text>
              </View>
            )}
          </View>

          {/* Progress Timeline Bar */}
          {earlyEntry && laterEntry && (
            <View style={styles.timelineBar}>
              <Text style={styles.timelineTitle}>Progress Timeline</Text>
              <View style={styles.timelineTrack}>
                <View style={[styles.timelineDot, { left: 0 }]}>
                  <View style={[styles.timelineDotInner, { backgroundColor: '#e74c3c' }]} />
                </View>
                <View style={styles.timelineLine} />
                <View style={[styles.timelineDot, { right: 0 }]}>
                  <View style={[styles.timelineDotInner, { backgroundColor: '#2ecc71' }]} />
                </View>
              </View>
              <View style={styles.timelineLabels}>
                <Text style={styles.timelineDateLabel}>{earlyGroup?.displayDate}</Text>
                <View style={styles.timelineDaysLabel}>
                  <Ionicons name="time-outline" size={12} color="#9b59b6" />
                  <Text style={styles.timelineDaysText}>{daysBetween} days</Text>
                </View>
                <Text style={styles.timelineDateLabel}>{laterGroup?.displayDate}</Text>
              </View>
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
  headerSubtitle: { fontSize: FONT_SIZES.xs, color: '#9b59b6', fontWeight: '600', marginTop: 2 },
  scroll: { flex: 1 },

  // Date Selectors
  dateSelectorsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    gap: SPACING.sm,
  },
  dateSelectorContainer: {
    flex: 1,
    zIndex: 10,
  },
  dateSelectorLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 1,
    marginBottom: 4,
    textAlign: 'center',
  },
  dateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.sm,
  },
  dateSelectorText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.primary,
    flex: 1,
    textAlign: 'center',
  },
  vsCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#9b59b615',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 18,
  },
  dateDropdown: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    zIndex: 100,
    ...SHADOWS.lg,
  },
  dateOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  dateOptionActive: {
    backgroundColor: '#9b59b608',
  },
  dateOptionDisabled: {
    opacity: 0.35,
  },
  dateOptionText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: '600',
  },
  dateOptionTextActive: {
    color: '#9b59b6',
    fontWeight: '700',
  },
  dateOptionTextDisabled: {
    color: COLORS.textMuted,
  },
  datePhotoIcons: {
    flexDirection: 'row',
    gap: 4,
  },
  miniDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  // Layout info banner
  layoutInfoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.accent + '08',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.accent + '20',
  },
  layoutInfoText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.accent,
    fontWeight: '600',
    flex: 1,
  },

  // ============================================================
  // WIDE LAYOUT STYLES (Desktop)
  // ============================================================
  widePhotosContainer: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
  },
  dateRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  dateRowDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dateRowTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: COLORS.primary,
    flex: 1,
  },
  dateRowBadge: {
    backgroundColor: '#e74c3c15',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },
  dateRowBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: '#e74c3c',
  },
  widePhotoRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  rowDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: SPACING.md,
    gap: SPACING.sm,
  },
  rowDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  rowDividerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#9b59b610',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
  },
  rowDividerText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: '#9b59b6',
  },

  // ============================================================
  // NARROW LAYOUT STYLES (Mobile)
  // ============================================================
  narrowPhotosContainer: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
  },
  narrowColumnHeaders: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  narrowColumnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.white,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    ...SHADOWS.sm,
  },
  narrowColumnTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.primary,
  },
  narrowColumnSubtitle: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginTop: 1,
  },
  narrowViewSection: {
    marginBottom: SPACING.md,
  },
  viewTypeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  viewTypeIconBg: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewTypeLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  narrowPhotoRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  daysApartBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#9b59b610',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.full,
    alignSelf: 'center',
    marginTop: SPACING.sm,
  },
  daysApartText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: '#9b59b6',
  },

  // ============================================================
  // SHARED PHOTO STYLES
  // ============================================================
  singlePhotoContainer: {
    flex: 1,
  },
  photoWrapper: {
    aspectRatio: 0.7,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: COLORS.white,
    ...SHADOWS.md,
  },
  comparisonPhoto: {
    width: '100%',
    height: '100%',
  },
  photoTypeBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },
  photoTypeBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
  },
  noPhotoPlaceholder: {
    aspectRatio: 0.7,
    borderRadius: BORDER_RADIUS.lg,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    gap: SPACING.sm,
  },
  noPhotoText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  photoDateLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },

  // ============================================================
  // METRICS SECTION
  // ============================================================
  metricsSection: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  metricsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  metricsSectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: COLORS.primary,
  },
  metricsLoading: {
    alignItems: 'center',
    padding: SPACING.xl,
    gap: SPACING.sm,
  },
  metricsLoadingText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  metricsTable: {
    padding: 0,
  },
  metricsTableHeader: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.primary,
  },
  tableHeaderText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.white,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  metricRowLabel: {
    flex: 1.2,
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  metricValues: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  metricBefore: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: '#e74c3c',
  },
  metricAfter: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: '#2ecc71',
  },
  changePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },
  changeValue: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
  },

  // Summary Card
  summaryCard: {
    flexDirection: 'row',
    margin: SPACING.md,
    padding: SPACING.md,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    gap: 0,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: COLORS.border,
  },

  // Timeline Bar
  timelineBar: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  timelineTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  timelineTrack: {
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    marginHorizontal: SPACING.xl,
    position: 'relative',
  },
  timelineLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: '#9b59b640',
    borderRadius: 2,
  },
  timelineDot: {
    position: 'absolute',
    top: -6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  timelineLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  timelineDateLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  timelineDaysLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#9b59b610',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },
  timelineDaysText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: '#9b59b6',
  },
});
