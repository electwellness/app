import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Image,
  Dimensions, FlatList, Platform, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES } from '../../constants/theme';
import type { PhotoDateGroup } from '../../lib/clientDataService';


interface PhotoGalleryModalProps {
  visible: boolean;
  onClose: () => void;
  photoGroups: PhotoDateGroup[];
  initialGroupIndex?: number;
  initialPhotoType?: 'front' | 'side' | 'back';
}

interface FlatPhoto {
  id: string;
  url: string;
  type: 'front' | 'side' | 'back';
  date: string;
  displayDate: string;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const TYPE_COLORS: Record<string, string> = { front: '#2ecc71', side: '#3498db', back: '#f39c12' };
const TYPE_LABELS: Record<string, string> = { front: 'Front View', side: 'Side View', back: 'Back View' };

export default function PhotoGalleryModal({
  visible, onClose, photoGroups, initialGroupIndex = 0, initialPhotoType,
}: PhotoGalleryModalProps) {
  // Flatten all photos into a single array for swiping
  const flatPhotos: FlatPhoto[] = React.useMemo(() => {
    const result: FlatPhoto[] = [];
    for (const group of photoGroups) {
      for (const type of ['front', 'side', 'back'] as const) {
        const photo = group.photos[type];
        if (photo) {
          result.push({
            id: photo.id,
            url: photo.photoUrl,
            type,
            date: group.date,
            displayDate: group.displayDate,
          });
        }
      }
    }
    return result;
  }, [photoGroups]);

  // Find initial index
  const initialIndex = React.useMemo(() => {
    if (initialGroupIndex >= 0 && initialGroupIndex < photoGroups.length) {
      const targetGroup = photoGroups[initialGroupIndex];
      const targetType = initialPhotoType || 'front';
      const idx = flatPhotos.findIndex(
        p => p.date === targetGroup.date && p.type === targetType
      );
      if (idx >= 0) return idx;
      // Fallback: find any photo from this group
      const groupIdx = flatPhotos.findIndex(p => p.date === targetGroup.date);
      return groupIdx >= 0 ? groupIdx : 0;
    }
    return 0;
  }, [initialGroupIndex, initialPhotoType, photoGroups, flatPhotos]);

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoomScale, setZoomScale] = useState(1);
  const flatListRef = useRef<FlatList>(null);
  const lastTap = useRef<number>(0);

  // Reset index when modal opens
  React.useEffect(() => {
    if (visible) {
      setCurrentIndex(initialIndex);
      setZoomScale(1);
      // Scroll to initial index after a short delay
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({ index: initialIndex, animated: false });
      }, 100);
    }
  }, [visible, initialIndex]);

  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index);
      setZoomScale(1);
    }
  }, []);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  const goToPrev = useCallback(() => {
    if (currentIndex > 0) {
      const newIndex = currentIndex - 1;
      flatListRef.current?.scrollToIndex({ index: newIndex, animated: true });
      setCurrentIndex(newIndex);
    }
  }, [currentIndex]);

  const goToNext = useCallback(() => {
    if (currentIndex < flatPhotos.length - 1) {
      const newIndex = currentIndex + 1;
      flatListRef.current?.scrollToIndex({ index: newIndex, animated: true });
      setCurrentIndex(newIndex);
    }
  }, [currentIndex, flatPhotos.length]);

  // Double-tap to zoom (web)
  const handleDoubleTap = useCallback(() => {
    setZoomScale(prev => prev === 1 ? 2.5 : 1);
  }, []);

  const handleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      handleDoubleTap();
    }
    lastTap.current = now;
  }, [handleDoubleTap]);

  if (flatPhotos.length === 0) return null;

  const currentPhoto = flatPhotos[currentIndex] || flatPhotos[0];

  const renderPhoto = ({ item, index }: { item: FlatPhoto; index: number }) => {
    const isActive = index === currentIndex;
    return (
      <TouchableOpacity
        activeOpacity={1}
        onPress={handleTap}
        style={styles.photoSlide}
      >
        <ScrollView
          maximumZoomScale={4}
          minimumZoomScale={1}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.zoomContainer}
          centerContent
          bouncesZoom
        >
          <Image
            source={{ uri: item.url }}
            style={styles.fullImage}
            resizeMode="contain"
          />
        </ScrollView>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <View style={[styles.typeBadge, { backgroundColor: TYPE_COLORS[currentPhoto.type] + '40' }]}>
              <Text style={[styles.typeBadgeText, { color: TYPE_COLORS[currentPhoto.type] }]}>
                {TYPE_LABELS[currentPhoto.type]}
              </Text>
            </View>
            <Text style={styles.dateText}>{currentPhoto.displayDate}</Text>
          </View>
          <View style={styles.headerBtn}>
            <Text style={styles.counterText}>
              {currentIndex + 1}/{flatPhotos.length}
            </Text>
          </View>
        </View>

        {/* Photo Viewer */}
        <View style={styles.galleryArea}>
          <FlatList
            ref={flatListRef}
            data={flatPhotos}
            renderItem={renderPhoto}
            keyExtractor={(item) => item.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            getItemLayout={(_, index) => ({
              length: SCREEN_WIDTH,
              offset: SCREEN_WIDTH * index,
              index,
            })}
            initialScrollIndex={initialIndex}
          />

          {/* Navigation Arrows */}
          {currentIndex > 0 && (
            <TouchableOpacity
              style={[styles.navArrow, styles.navArrowLeft]}
              onPress={goToPrev}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={28} color="#fff" />
            </TouchableOpacity>
          )}
          {currentIndex < flatPhotos.length - 1 && (
            <TouchableOpacity
              style={[styles.navArrow, styles.navArrowRight]}
              onPress={goToNext}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-forward" size={28} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        {/* Bottom Info Bar */}
        <View style={styles.bottomBar}>
          {/* Dot indicators */}
          <View style={styles.dotsRow}>
            {flatPhotos.length <= 20 && flatPhotos.map((p, i) => (
              <View
                key={p.id}
                style={[
                  styles.dot,
                  i === currentIndex && { backgroundColor: TYPE_COLORS[p.type], width: 16 },
                ]}
              />
            ))}
            {flatPhotos.length > 20 && (
              <Text style={styles.dotsFallback}>
                {currentIndex + 1} of {flatPhotos.length}
              </Text>
            )}
          </View>

          {/* Thumbnail strip */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.thumbStrip}
          >
            {flatPhotos.map((p, i) => (
              <TouchableOpacity
                key={p.id}
                style={[
                  styles.thumbItem,
                  i === currentIndex && { borderColor: TYPE_COLORS[p.type], borderWidth: 2 },
                ]}
                onPress={() => {
                  setCurrentIndex(i);
                  flatListRef.current?.scrollToIndex({ index: i, animated: true });
                }}
                activeOpacity={0.7}
              >
                <Image source={{ uri: p.url }} style={styles.thumbImage} resizeMode="cover" />
                <View style={[styles.thumbTypeDot, { backgroundColor: TYPE_COLORS[p.type] }]} />
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Zoom hint */}
          <View style={styles.zoomHint}>
            <Ionicons name="expand-outline" size={12} color="rgba(255,255,255,0.5)" />
            <Text style={styles.zoomHintText}>Pinch to zoom or double-tap</Text>
          </View>
        </View>
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
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: 'rgba(0,0,0,0.85)',
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
    gap: 4,
  },
  typeBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },
  typeBadgeText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
  },
  dateText: {
    fontSize: FONT_SIZES.xs,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
  },
  counterText: {
    fontSize: FONT_SIZES.sm,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '700',
  },

  // Gallery
  galleryArea: {
    flex: 1,
    position: 'relative',
  },
  photoSlide: {
    width: SCREEN_WIDTH,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: SCREEN_WIDTH,
  },
  fullImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.65,
  },

  // Navigation Arrows
  navArrow: {
    position: 'absolute',
    top: '45%',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navArrowLeft: { left: SPACING.md },
  navArrowRight: { right: SPACING.md },

  // Bottom Bar
  bottomBar: {
    backgroundColor: 'rgba(0,0,0,0.9)',
    paddingBottom: SPACING.xl,
    paddingTop: SPACING.md,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    marginBottom: SPACING.md,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  dotsFallback: {
    fontSize: FONT_SIZES.sm,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '600',
  },

  // Thumbnail Strip
  thumbStrip: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
  },
  thumbItem: {
    width: 52,
    height: 68,
    borderRadius: BORDER_RADIUS.sm,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbTypeDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.3)',
  },

  // Zoom hint
  zoomHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: SPACING.sm,
  },
  zoomHintText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '600',
  },
});
