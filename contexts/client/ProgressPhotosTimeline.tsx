import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
  ActivityIndicator, RefreshControl, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import { fetchBiometricPhotosGrouped } from '../../lib/clientDataService';
import type { PhotoDateGroup } from '../../lib/clientDataService';
import PhotoComparisonModal from './PhotoComparisonModal';
import PhotoUploadModal from './PhotoUploadModal';
import PhotoGalleryModal from './PhotoGalleryModal';

interface ProgressPhotosTimelineProps {
  userId: string;
  onOpenEntryForm?: () => void;
}

type FilterType = 'all' | 'front' | 'side' | 'back';
type ViewMode = 'timeline' | 'grid';


export default function ProgressPhotosTimeline({ userId, onOpenEntryForm }: ProgressPhotosTimelineProps) {
  const [photoGroups, setPhotoGroups] = useState<PhotoDateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [showComparison, setShowComparison] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [galleryGroupIndex, setGalleryGroupIndex] = useState(0);
  const [galleryPhotoType, setGalleryPhotoType] = useState<'front' | 'side' | 'back'>('front');
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');

  const loadPhotos = useCallback(async () => {
    try {
      const groups = await fetchBiometricPhotosGrouped(userId);
      setPhotoGroups(groups);

      // Auto-select first (oldest) and most recent (newest) for default comparison
      // photoGroups are sorted newest-first: index 0 = most recent, last index = oldest
      if (groups.length >= 2) {
        const oldest = groups[groups.length - 1].date;
        const newest = groups[0].date;
        setSelectedDates([oldest, newest]);
        // Auto-expand both the first and most recent groups
        setExpandedGroups(new Set([oldest, newest]));
      } else if (groups.length === 1) {
        setExpandedGroups(new Set([groups[0].date]));
      }
    } catch (err) {
      console.error('Error loading photos:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadPhotos();
  }, [loadPhotos]);

  const handleUploadComplete = useCallback(() => {
    loadPhotos();
  }, [loadPhotos]);

  const toggleDateSelection = (date: string) => {
    setSelectedDates(prev => {
      if (prev.includes(date)) {
        return prev.filter(d => d !== date);
      }
      if (prev.length >= 2) {
        return [prev[1], date];
      }
      return [...prev, date];
    });
  };

  const toggleGroupExpansion = (date: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  };

  const handleCompare = () => {
    if (selectedDates.length === 2) {
      setShowComparison(true);
    }
  };

  const openGallery = (groupIndex: number, photoType: 'front' | 'side' | 'back') => {
    setGalleryGroupIndex(groupIndex);
    setGalleryPhotoType(photoType);
    setShowGallery(true);
  };

  const filteredGroups = photoGroups.filter(g => {
    if (filter === 'all') return true;
    return g.photos[filter] !== undefined;
  });

  const photoCount = photoGroups.reduce((sum, g) => {
    return sum + (g.photos.front ? 1 : 0) + (g.photos.side ? 1 : 0) + (g.photos.back ? 1 : 0);
  }, 0);

  // Get the first (oldest) and most recent (newest) groups
  const newestGroup = photoGroups.length > 0 ? photoGroups[0] : null;
  const oldestGroup = photoGroups.length >= 2 ? photoGroups[photoGroups.length - 1] : null;
  const daysBetweenFirstLast = oldestGroup && newestGroup
    ? Math.round(
        (new Date(newestGroup.date).getTime() - new Date(oldestGroup.date).getTime()) / (1000 * 60 * 60 * 24)
      )
    : 0;

  // Loading state
  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#9b59b6" />
        <Text style={styles.loadingText}>Loading progress photos...</Text>
      </View>
    );
  }

  // Empty state
  if (photoGroups.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={styles.emptyContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#9b59b6" />}
      >
        <View style={styles.emptyIconContainer}>
          <Ionicons name="images-outline" size={56} color={COLORS.textMuted} />
        </View>
        <Text style={styles.emptyTitle}>No Progress Photos Yet</Text>
        <Text style={styles.emptyText}>
          Start documenting your transformation by uploading front, side, and back photos.
        </Text>
        <TouchableOpacity
          style={styles.emptyBtn}
          onPress={() => setShowUploadModal(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
          <Text style={styles.emptyBtnText}>Upload Progress Photos</Text>
        </TouchableOpacity>
        {onOpenEntryForm && (
          <TouchableOpacity
            style={[styles.emptyBtn, { backgroundColor: COLORS.accent, marginTop: SPACING.sm }]}
            onPress={onOpenEntryForm}
            activeOpacity={0.8}
          >
            <Ionicons name="camera-outline" size={20} color="#fff" />
            <Text style={styles.emptyBtnText}>Take Progress Photos</Text>
          </TouchableOpacity>
        )}
        <View style={styles.emptyTips}>
          <Text style={styles.emptyTipsTitle}>Tips for Great Progress Photos</Text>
          <View style={styles.tipItem}>
            <View style={[styles.tipIcon, { backgroundColor: '#3498db15' }]}>
              <Ionicons name="sunny-outline" size={14} color="#3498db" />
            </View>
            <Text style={styles.tipText}>Same lighting and location each time</Text>
          </View>
          <View style={styles.tipItem}>
            <View style={[styles.tipIcon, { backgroundColor: '#2ecc7115' }]}>
              <Ionicons name="time-outline" size={14} color="#2ecc71" />
            </View>
            <Text style={styles.tipText}>Take photos at the same time of day</Text>
          </View>
          <View style={styles.tipItem}>
            <View style={[styles.tipIcon, { backgroundColor: '#f39c1215' }]}>
              <Ionicons name="shirt-outline" size={14} color="#f39c12" />
            </View>
            <Text style={styles.tipText}>Wear similar fitted clothing</Text>
          </View>
          <View style={styles.tipItem}>
            <View style={[styles.tipIcon, { backgroundColor: '#9b59b615' }]}>
              <Ionicons name="body-outline" size={14} color="#9b59b6" />
            </View>
            <Text style={styles.tipText}>Stand naturally with arms relaxed</Text>
          </View>
        </View>

        {/* Upload Modal */}
        <PhotoUploadModal
          visible={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          userId={userId}
          onUploadComplete={handleUploadComplete}
        />
      </ScrollView>
    );
  }

  // Render a single photo thumbnail for the hero section
  const renderHeroPhoto = (
    group: PhotoDateGroup | null,
    type: 'front' | 'side' | 'back',
    label: string,
  ) => {
    if (!group) return null;
    const photo = group.photos[type];
    const typeColors = { front: '#2ecc71', side: '#3498db', back: '#f39c12' };

    if (!photo) {
      return (
        <View style={styles.heroPhotoEmpty}>
          <Ionicons name="image-outline" size={20} color={COLORS.border} />
          <Text style={styles.heroPhotoEmptyText}>No {type}</Text>
        </View>
      );
    }

    return (
      <TouchableOpacity
        style={styles.heroPhotoWrapper}
        onPress={() => {
          const idx = photoGroups.findIndex(g => g.date === group.date);
          if (idx >= 0) openGallery(idx, type);
        }}
        activeOpacity={0.8}
      >
        <Image source={{ uri: photo.photoUrl }} style={styles.heroPhotoImage} resizeMode="cover" />
        <View style={[styles.heroPhotoBadge, { backgroundColor: typeColors[type] }]}>
          <Text style={styles.heroPhotoBadgeText}>{type.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.heroPhotoExpandIcon}>
          <Ionicons name="expand-outline" size={10} color="#fff" />
        </View>
      </TouchableOpacity>
    );
  };

  // Render the Before & After hero section
  const renderBeforeAfterHero = () => {
    if (!oldestGroup || !newestGroup) return null;

    // Determine which photo types are available in both sets
    const availableTypes = (['front', 'side', 'back'] as const).filter(
      type => oldestGroup.photos[type] || newestGroup.photos[type]
    );

    return (
      <View style={styles.heroSection}>
        {/* Hero Header */}
        <View style={styles.heroHeader}>
          <View style={styles.heroTitleRow}>
            <View style={styles.heroIconCircle}>
              <Ionicons name="git-compare" size={20} color="#9b59b6" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>Your Transformation</Text>
              <Text style={styles.heroSubtitle}>
                {daysBetweenFirstLast} days of progress
              </Text>
            </View>
            <TouchableOpacity
              style={styles.heroCompareBtn}
              onPress={() => {
                if (oldestGroup && newestGroup) {
                  setSelectedDates([oldestGroup.date, newestGroup.date]);
                  setShowComparison(true);
                }
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="swap-horizontal" size={14} color="#fff" />
              <Text style={styles.heroCompareBtnText}>Full Compare</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Before & After Photo Rows */}
        {availableTypes.map(type => {
          const typeLabels = { front: 'Front View', side: 'Side View', back: 'Back View' };
          const typeColors = { front: '#2ecc71', side: '#3498db', back: '#f39c12' };
          const typeIcons: Record<string, string> = { front: 'person-outline', side: 'body-outline', back: 'accessibility-outline' };

          return (
            <View key={type} style={styles.heroViewRow}>
              {/* View type label */}
              <View style={styles.heroViewLabel}>
                <View style={[styles.heroViewLabelIcon, { backgroundColor: typeColors[type] + '15' }]}>
                  <Ionicons name={typeIcons[type] as any} size={12} color={typeColors[type]} />
                </View>
                <Text style={styles.heroViewLabelText}>{typeLabels[type]}</Text>
              </View>

              {/* Side by side photos */}
              <View style={styles.heroPhotoRow}>
                {/* Before (oldest/first) */}
                <View style={styles.heroPhotoColumn}>
                  {renderHeroPhoto(oldestGroup, type, 'Before')}
                </View>

                {/* Arrow divider */}
                <View style={styles.heroArrowContainer}>
                  <View style={styles.heroArrowLine} />
                  <View style={styles.heroArrowCircle}>
                    <Ionicons name="arrow-forward" size={12} color="#9b59b6" />
                  </View>
                  <View style={styles.heroArrowLine} />
                </View>

                {/* After (newest/most recent) */}
                <View style={styles.heroPhotoColumn}>
                  {renderHeroPhoto(newestGroup, type, 'After')}
                </View>
              </View>
            </View>
          );
        })}

        {/* Date labels */}
        <View style={styles.heroDateRow}>
          <View style={styles.heroDatePill}>
            <View style={[styles.heroDateDot, { backgroundColor: '#e74c3c' }]} />
            <Text style={styles.heroDateText}>{oldestGroup.displayDate}</Text>
            <Text style={styles.heroDateLabel}>First</Text>
          </View>
          <View style={styles.heroDaysBadge}>
            <Ionicons name="time-outline" size={12} color="#9b59b6" />
            <Text style={styles.heroDaysText}>{daysBetweenFirstLast}d</Text>
          </View>
          <View style={styles.heroDatePill}>
            <View style={[styles.heroDateDot, { backgroundColor: '#2ecc71' }]} />
            <Text style={styles.heroDateText}>{newestGroup.displayDate}</Text>
            <Text style={styles.heroDateLabel}>Latest</Text>
          </View>
        </View>
      </View>
    );
  };

  // Render photo thumbnail for timeline cards
  const renderPhotoThumb = (group: PhotoDateGroup, type: 'front' | 'side' | 'back', groupIndex: number) => {
    const photo = group.photos[type];
    const typeColors = { front: '#2ecc71', side: '#3498db', back: '#f39c12' };
    const isSelected = selectedDates.includes(group.date);

    return (
      <TouchableOpacity
        style={styles.thumbContainer}
        key={type}
        onPress={() => {
          if (photo) {
            openGallery(groupIndex, type);
          }
        }}
        activeOpacity={photo ? 0.7 : 1}
      >
        {photo ? (
          <View style={[styles.thumbWrapper, isSelected && { borderColor: '#9b59b6', borderWidth: 2 }]}>
            <Image source={{ uri: photo.photoUrl }} style={styles.thumbImage} resizeMode="cover" />
            <View style={[styles.thumbBadge, { backgroundColor: typeColors[type] }]}>
              <Text style={styles.thumbBadgeText}>{type.charAt(0).toUpperCase()}</Text>
            </View>
            {/* Tap to view indicator */}
            <View style={styles.thumbViewIcon}>
              <Ionicons name="expand-outline" size={12} color="#fff" />
            </View>
          </View>
        ) : (
          <View style={styles.thumbEmpty}>
            <Ionicons name="image-outline" size={16} color={COLORS.border} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // Grid view render
  const renderGridView = () => {
    const allPhotos: Array<{ group: PhotoDateGroup; type: 'front' | 'side' | 'back'; groupIndex: number }> = [];
    filteredGroups.forEach((group, gIdx) => {
      const types = filter === 'all' ? (['front', 'side', 'back'] as const) : [filter as 'front' | 'side' | 'back'];
      types.forEach(type => {
        if (group.photos[type]) {
          allPhotos.push({ group, type, groupIndex: gIdx });
        }
      });
    });

    return (
      <View style={styles.gridContainer}>
        {allPhotos.map((item, idx) => {
          const photo = item.group.photos[item.type]!;
          const typeColors = { front: '#2ecc71', side: '#3498db', back: '#f39c12' };
          return (
            <TouchableOpacity
              key={`${item.group.date}-${item.type}`}
              style={styles.gridItem}
              onPress={() => openGallery(item.groupIndex, item.type)}
              activeOpacity={0.7}
            >
              <Image source={{ uri: photo.photoUrl }} style={styles.gridImage} resizeMode="cover" />
              <View style={styles.gridOverlay}>
                <View style={[styles.gridTypeBadge, { backgroundColor: typeColors[item.type] }]}>
                  <Text style={styles.gridTypeBadgeText}>{item.type.charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={styles.gridDateText} numberOfLines={1}>
                  {item.group.displayDate}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#9b59b6" />}
      >
        {/* Stats Bar */}
        <View style={styles.statsBar}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{photoGroups.length}</Text>
            <Text style={styles.statLabel}>Sessions</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{photoCount}</Text>
            <Text style={styles.statLabel}>Photos</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{daysBetweenFirstLast}</Text>
            <Text style={styles.statLabel}>Days Tracked</Text>
          </View>
        </View>

        {/* ============================================================ */}
        {/* DEFAULT: Before & After Hero Section (first + most recent)   */}
        {/* ============================================================ */}
        {renderBeforeAfterHero()}

        {/* Upload CTA */}
        <TouchableOpacity
          style={styles.uploadCta}
          onPress={() => setShowUploadModal(true)}
          activeOpacity={0.8}
        >
          <View style={styles.uploadCtaIcon}>
            <Ionicons name="cloud-upload" size={18} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.uploadCtaTitle}>Upload New Photos</Text>
            <Text style={styles.uploadCtaSubtitle}>Camera or photo library with auto-compression</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#9b59b6" />
        </TouchableOpacity>

        {/* Compare Mode Bar */}
        <View style={styles.compareBar}>
          <View style={styles.compareInfo}>
            <Ionicons name="git-compare-outline" size={18} color="#9b59b6" />
            <View>
              <Text style={styles.compareTitle}>Custom Compare</Text>
              <Text style={styles.compareSubtitle}>
                {selectedDates.length === 0
                  ? 'Select 2 dates to compare side-by-side'
                  : selectedDates.length === 1
                    ? '1 selected - pick another date'
                    : '2 dates selected - ready to compare!'}
              </Text>
            </View>
          </View>
          {selectedDates.length === 2 ? (
            <TouchableOpacity style={styles.compareBtn} onPress={handleCompare} activeOpacity={0.8}>
              <Ionicons name="swap-horizontal" size={16} color="#fff" />
              <Text style={styles.compareBtnText}>Compare</Text>
            </TouchableOpacity>
          ) : selectedDates.length > 0 ? (
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={() => setSelectedDates([])}
              activeOpacity={0.7}
            >
              <Text style={styles.clearBtnText}>Clear</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* View Mode & Filter Row */}
        <View style={styles.controlsRow}>
          {/* View Mode Toggle */}
          <View style={styles.viewModeToggle}>
            <TouchableOpacity
              style={[styles.viewModeBtn, viewMode === 'timeline' && styles.viewModeBtnActive]}
              onPress={() => setViewMode('timeline')}
            >
              <Ionicons name="list" size={14} color={viewMode === 'timeline' ? '#fff' : COLORS.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.viewModeBtn, viewMode === 'grid' && styles.viewModeBtnActive]}
              onPress={() => setViewMode('grid')}
            >
              <Ionicons name="grid" size={14} color={viewMode === 'grid' ? '#fff' : COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Filter Tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
            {(['all', 'front', 'side', 'back'] as FilterType[]).map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.filterTab, filter === f && styles.filterTabActive]}
                onPress={() => setFilter(f)}
              >
                <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                  {f === 'all' ? 'All Views' : `${f.charAt(0).toUpperCase() + f.slice(1)}`}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Section Label */}
        <View style={styles.allSessionsHeader}>
          <Text style={styles.allSessionsTitle}>All Sessions</Text>
          <Text style={styles.allSessionsSubtitle}>{filteredGroups.length} photo sessions</Text>
        </View>

        {/* Grid View */}
        {viewMode === 'grid' && renderGridView()}

        {/* Timeline View */}
        {viewMode === 'timeline' && (
          <View style={styles.timeline}>
            {filteredGroups.map((group, idx) => {
              const isSelected = selectedDates.includes(group.date);
              const isExpanded = expandedGroups.has(group.date);
              const isFirst = idx === filteredGroups.length - 1;
              const isLatest = idx === 0;
              const photoTypes = (['front', 'side', 'back'] as const).filter(t =>
                filter === 'all' || filter === t
              );
              const availablePhotos = photoTypes.filter(t => group.photos[t]);

              return (
                <View key={group.date} style={styles.timelineItem}>
                  {/* Timeline connector */}
                  <View style={styles.timelineConnector}>
                    <View style={[
                      styles.timelineDot,
                      isSelected && { backgroundColor: '#9b59b6', borderColor: '#9b59b6' },
                      isFirst && !isSelected && { borderColor: '#e74c3c', backgroundColor: '#e74c3c15' },
                      isLatest && !isSelected && { borderColor: '#2ecc71', backgroundColor: '#2ecc7115' },
                    ]}>
                      {isSelected && <Ionicons name="checkmark" size={10} color="#fff" />}
                      {isFirst && !isSelected && <Text style={{ fontSize: 7, fontWeight: '900', color: '#e74c3c' }}>1</Text>}
                      {isLatest && !isFirst && !isSelected && <Ionicons name="star" size={8} color="#2ecc71" />}
                    </View>
                    {idx < filteredGroups.length - 1 && <View style={styles.timelineLine} />}
                  </View>

                  {/* Content Card */}
                  <TouchableOpacity
                    style={[
                      styles.timelineCard,
                      isSelected && styles.timelineCardSelected,
                      (isFirst || isLatest) && styles.timelineCardHighlighted,
                    ]}
                    onPress={() => toggleDateSelection(group.date)}
                    onLongPress={() => toggleGroupExpansion(group.date)}
                    activeOpacity={0.7}
                  >
                    {/* Card Header */}
                    <View style={styles.cardHeader}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                          <Text style={styles.cardDate}>{group.displayDate}</Text>
                          {isFirst && (
                            <View style={[styles.epochBadge, { backgroundColor: '#e74c3c15' }]}>
                              <Text style={[styles.epochBadgeText, { color: '#e74c3c' }]}>First</Text>
                            </View>
                          )}
                          {isLatest && !isFirst && (
                            <View style={[styles.epochBadge, { backgroundColor: '#2ecc7115' }]}>
                              <Text style={[styles.epochBadgeText, { color: '#2ecc71' }]}>Latest</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.cardPhotoCount}>
                          {availablePhotos.length} photo{availablePhotos.length !== 1 ? 's' : ''}
                          {' '}{availablePhotos.map(t => t.charAt(0).toUpperCase()).join(' / ')}
                        </Text>
                      </View>
                      {isSelected && (
                        <View style={styles.selectedBadge}>
                          <Ionicons name="checkmark-circle" size={14} color="#9b59b6" />
                          <Text style={styles.selectedBadgeText}>
                            {selectedDates.indexOf(group.date) === 0 ? 'Before' : 'After'}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Photo Thumbnails */}
                    <View style={styles.thumbRow}>
                      {photoTypes.map(type => renderPhotoThumb(group, type, idx))}
                    </View>

                    {/* Expanded View - Larger Photos */}
                    {isExpanded && (
                      <View style={styles.expandedPhotos}>
                        {photoTypes.map(type => {
                          const photo = group.photos[type];
                          if (!photo) return null;
                          return (
                            <TouchableOpacity
                              key={type}
                              style={styles.expandedPhotoCard}
                              onPress={() => openGallery(idx, type)}
                              activeOpacity={0.8}
                            >
                              <Image
                                source={{ uri: photo.photoUrl }}
                                style={styles.expandedPhoto}
                                resizeMode="cover"
                              />
                              <View style={styles.expandedPhotoLabel}>
                                <Text style={styles.expandedPhotoLabelText}>
                                  {type.charAt(0).toUpperCase() + type.slice(1)} View
                                </Text>
                                <View style={styles.expandViewBtn}>
                                  <Ionicons name="expand" size={12} color="#fff" />
                                  <Text style={styles.expandViewBtnText}>View Full</Text>
                                </View>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}

                    {/* Tap hint */}
                    <View style={styles.cardFooter}>
                      <Text style={styles.cardFooterText}>
                        {isExpanded ? 'Tap to select for comparison' : 'Long press to expand'}
                      </Text>
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={12}
                        color={COLORS.textMuted}
                      />
                    </View>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* Comparison Modal */}
      <PhotoComparisonModal
        visible={showComparison}
        onClose={() => {
          setShowComparison(false);
        }}
        photoGroups={photoGroups}
        userId={userId}
        initialBeforeDate={selectedDates.length === 2 ? (selectedDates[0] < selectedDates[1] ? selectedDates[0] : selectedDates[1]) : undefined}
        initialAfterDate={selectedDates.length === 2 ? (selectedDates[0] > selectedDates[1] ? selectedDates[0] : selectedDates[1]) : undefined}
      />

      {/* Upload Modal */}
      <PhotoUploadModal
        visible={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        userId={userId}
        onUploadComplete={handleUploadComplete}
      />

      {/* Gallery Modal */}
      <PhotoGalleryModal
        visible={showGallery}
        onClose={() => setShowGallery(false)}
        photoGroups={photoGroups}
        initialGroupIndex={galleryGroupIndex}
        initialPhotoType={galleryPhotoType}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.xl,
  },
  loadingText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textMuted,
    fontWeight: '600',
  },

  // Empty State
  emptyContainer: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: 40,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
  },
  emptyTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: SPACING.sm,
  },
  emptyText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: SPACING.lg,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#9b59b6',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.sm,
    ...SHADOWS.md,
  },
  emptyBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: '#fff',
  },
  emptyTips: {
    width: '100%',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginTop: SPACING.xl,
    ...SHADOWS.sm,
  },
  emptyTipsTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: SPACING.md,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  tipIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tipText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },

  // Stats Bar
  statsBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '900',
    color: '#9b59b6',
  },
  statLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: COLORS.border,
  },

  // ============================================================
  // BEFORE & AFTER HERO SECTION
  // ============================================================
  heroSection: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#9b59b620',
    ...SHADOWS.md,
  },
  heroHeader: {
    padding: SPACING.md,
    backgroundColor: '#9b59b608',
    borderBottomWidth: 1,
    borderBottomColor: '#9b59b615',
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  heroIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#9b59b615',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.primary,
  },
  heroSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
    marginTop: 1,
  },
  heroCompareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#9b59b6',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    gap: 4,
  },
  heroCompareBtnText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: '#fff',
  },
  heroViewRow: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
  },
  heroViewLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  heroViewLabelIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroViewLabelText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroPhotoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroPhotoColumn: {
    flex: 1,
  },
  heroArrowContainer: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
  },
  heroArrowLine: {
    width: 1,
    height: 12,
    backgroundColor: '#9b59b630',
  },
  heroArrowCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#9b59b615',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 2,
  },
  heroPhotoWrapper: {
    aspectRatio: 0.75,
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: COLORS.background,
  },
  heroPhotoImage: {
    width: '100%',
    height: '100%',
  },
  heroPhotoBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroPhotoBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#fff',
  },
  heroPhotoExpandIcon: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroPhotoEmpty: {
    aspectRatio: 0.75,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  heroPhotoEmptyText: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  heroDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
    paddingTop: SPACING.lg,
  },
  heroDatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.background,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.full,
    flex: 1,
  },
  heroDateDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  heroDateText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.primary,
    flex: 1,
  },
  heroDateLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
  },
  heroDaysBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
  },
  heroDaysText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '800',
    color: '#9b59b6',
  },

  // Upload CTA
  uploadCta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.md,
    borderWidth: 1.5,
    borderColor: '#9b59b620',
    ...SHADOWS.sm,
  },
  uploadCtaIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#9b59b6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadCtaTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.primary,
  },
  uploadCtaSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 1,
  },

  // Compare Bar
  compareBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: '#9b59b620',
    ...SHADOWS.sm,
  },
  compareInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
  },
  compareTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.primary,
  },
  compareSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  compareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#9b59b6',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    gap: 6,
  },
  compareBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: '#fff',
  },
  clearBtn: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  clearBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textMuted,
  },

  // Controls Row
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  viewModeToggle: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  viewModeBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  viewModeBtnActive: {
    backgroundColor: '#9b59b6',
  },
  filterContent: {
    gap: SPACING.sm,
  },
  filterTab: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterTabActive: {
    backgroundColor: '#9b59b6',
    borderColor: '#9b59b6',
  },
  filterText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  filterTextActive: {
    color: '#fff',
  },

  // All Sessions Header
  allSessionsHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    marginBottom: SPACING.xs,
  },
  allSessionsTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: COLORS.primary,
  },
  allSessionsSubtitle: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textMuted,
  },

  // Grid View
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    gap: SPACING.sm,
  },
  gridItem: {
    width: '31%',
    flexGrow: 1,
    aspectRatio: 0.75,
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    position: 'relative',
    ...SHADOWS.sm,
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  gridOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingVertical: 4,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  gridTypeBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridTypeBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#fff',
  },
  gridDateText: {
    fontSize: 8,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
  },

  // Timeline
  timeline: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 0,
  },
  timelineConnector: {
    width: 24,
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  timelineDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: COLORS.border,
    marginTop: -2,
  },
  timelineCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
    ...SHADOWS.sm,
  },
  timelineCardSelected: {
    borderColor: '#9b59b6',
    backgroundColor: '#9b59b605',
  },
  timelineCardHighlighted: {
    borderColor: '#9b59b620',
  },

  // Epoch Badge (First / Latest)
  epochBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },
  epochBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Card Header
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
  },
  cardDate: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: COLORS.primary,
  },
  cardPhotoCount: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
    marginTop: 2,
  },
  selectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#9b59b610',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },
  selectedBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: '#9b59b6',
  },

  // Thumbnails
  thumbRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  thumbContainer: {
    flex: 1,
  },
  thumbWrapper: {
    aspectRatio: 0.75,
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: COLORS.background,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
  },
  thumbViewIcon: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbEmpty: {
    aspectRatio: 0.75,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Expanded Photos
  expandedPhotos: {
    marginTop: SPACING.sm,
    gap: SPACING.sm,
  },
  expandedPhotoCard: {
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    position: 'relative',
  },
  expandedPhoto: {
    width: '100%',
    aspectRatio: 0.75,
  },
  expandedPhotoLabel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  expandedPhotoLabelText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: '#fff',
  },
  expandViewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },
  expandViewBtnText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: '#fff',
  },

  // Card Footer
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  cardFooterText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
});
