import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
  Alert, Linking, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import type { ClientReview, ReviewPlatform, Client } from '../../data/mockData';

import { fetchClientReviews, addClientReview, updateClientReview, deleteClientReview } from '../../lib/clientReviewService';
import { supabase } from '../../lib/supabase';
import { usePlatformAlert } from '../../lib/platformAlert';


// ── Platform config ──
const PLATFORM_CONFIG: Record<ReviewPlatform, { label: string; color: string; icon: string; bgColor: string }> = {
  google: { label: 'Google', color: '#4285F4', icon: 'logo-google', bgColor: '#4285F415' },
  facebook: { label: 'Facebook', color: '#1877F2', icon: 'logo-facebook', bgColor: '#1877F215' },
  yelp: { label: 'Yelp', color: '#D32323', icon: 'star', bgColor: '#D3232315' },
  thumbtack: { label: 'Thumbtack', color: '#009FD9', icon: 'thumbs-up', bgColor: '#009FD915' },
  nextdoor: { label: 'Nextdoor', color: '#8ED500', icon: 'home', bgColor: '#8ED50015' },
};

const PLATFORMS: ReviewPlatform[] = ['google', 'facebook', 'yelp', 'thumbtack', 'nextdoor'];

interface Props {
  client: Client;
  reviews: ClientReview[];
  onAddReview: (review: ClientReview) => void;
  onDeleteReview?: (reviewId: string) => void;
  onUpdateReview?: (review: ClientReview) => void;
  onReviewsLoaded?: (reviews: ClientReview[]) => void;
}

export default function ClientReviewsPanel({ client, reviews, onAddReview, onDeleteReview, onUpdateReview, onReviewsLoaded }: Props) {
  const { platformAlert } = usePlatformAlert();
  const [showAddForm, setShowAddForm] = useState(false);
  const [filterPlatform, setFilterPlatform] = useState<ReviewPlatform | 'all'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [dbLoaded, setDbLoaded] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'synced' | 'error'>('idle');


  // Add form state
  const [formPlatform, setFormPlatform] = useState<ReviewPlatform>('google');
  const [formLink, setFormLink] = useState('');
  const [formStarRating, setFormStarRating] = useState<number | undefined>(5);
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formText, setFormText] = useState('');
  const [formTrainer, setFormTrainer] = useState<string>(client.trainer !== 'None' ? client.trainer : '');
  const [formDietitian, setFormDietitian] = useState<string>(client.dietitian !== 'None' ? client.dietitian : '');

  // ── Edit state ──
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [isEditSaving, setIsEditSaving] = useState(false);
  const [editPlatform, setEditPlatform] = useState<ReviewPlatform>('google');
  const [editLink, setEditLink] = useState('');
  const [editStarRating, setEditStarRating] = useState<number | undefined>(5);
  const [editDate, setEditDate] = useState('');
  const [editText, setEditText] = useState('');
  const [editTrainer, setEditTrainer] = useState('');
  const [editDietitian, setEditDietitian] = useState('');

  // ── Staff lists fetched from DB ──
  const [franchiseTrainers, setFranchiseTrainers] = useState<string[]>([]);
  const [franchiseDietitians, setFranchiseDietitians] = useState<string[]>([]);
  const [staffLoaded, setStaffLoaded] = useState(false);

  // Fetch staff from DB on mount
  useEffect(() => {
    if (staffLoaded) return;
    supabase
      .from('user_profiles')
      .select('full_name, role')
      .in('role', ['trainer', 'dietitian'])
      .order('full_name', { ascending: true })
      .then(({ data: staffRows, error: staffError }) => {
        if (staffError) {
          console.error('ClientReviewsPanel: Failed to fetch staff:', staffError.message);
        }
        const trainers: string[] = [];
        const dietitians: string[] = [];
        if (staffRows && staffRows.length > 0) {
          for (const row of staffRows) {
            if (row.full_name) {
              if (row.role === 'trainer') trainers.push(row.full_name);
              else if (row.role === 'dietitian') dietitians.push(row.full_name);
            }
          }
        }
        setFranchiseTrainers(trainers);
        setFranchiseDietitians(dietitians);
        setStaffLoaded(true);
      });
  }, [staffLoaded]);

  // ── Fetch reviews from DB on mount ──
  // This is critical: without this, reviews saved to the DB are never loaded back
  // into the UI. The `reviews` prop from the parent starts as `client.reviews || []`
  // which is typically empty for DB-backed clients.
  const loadReviewsFromDb = useCallback(async () => {
    if (!client?.id) return;
    setIsLoading(true);
    setDbError(null);
    try {
      const result = await fetchClientReviews({ clientId: client.id });
      if (result.success && result.reviews.length > 0) {
        // Push DB reviews to parent so they become the source of truth
        onReviewsLoaded?.(result.reviews);
        setSyncStatus('synced');
      } else if (result.success) {
        // No reviews in DB — that's fine, just mark as synced
        // Still call onReviewsLoaded with empty array so parent knows DB was checked
        onReviewsLoaded?.(result.reviews);
        setSyncStatus('synced');
      } else {
        console.warn('ClientReviewsPanel: Failed to fetch reviews from DB:', result.error);
        setDbError(result.error || 'Failed to load reviews');
        setSyncStatus('error');
      }
    } catch (err) {
      console.error('ClientReviewsPanel: Exception fetching reviews:', err);
      setDbError(err instanceof Error ? err.message : 'Unknown error');
      setSyncStatus('error');
    } finally {
      setIsLoading(false);
      setDbLoaded(true);
    }
  }, [client?.id, onReviewsLoaded]);

  useEffect(() => {
    if (!dbLoaded && client?.id) {
      loadReviewsFromDb();
    }
  }, [dbLoaded, client?.id, loadReviewsFromDb]);


  // Computed stats
  const platformCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    PLATFORMS.forEach(p => { counts[p] = 0; });
    reviews.forEach(r => { counts[r.platform] = (counts[r.platform] || 0) + 1; });
    return counts;
  }, [reviews]);

  const avgRating = useMemo(() => {
    const rated = reviews.filter(r => r.starRating != null);
    if (rated.length === 0) return 0;
    return rated.reduce((sum, r) => sum + (r.starRating || 0), 0) / rated.length;
  }, [reviews]);

  const filteredReviews = useMemo(() => {
    const filtered = filterPlatform === 'all' ? reviews : reviews.filter(r => r.platform === filterPlatform);
    return [...filtered].sort((a, b) => b.reviewDate.localeCompare(a.reviewDate));
  }, [reviews, filterPlatform]);

  // Format date
  const formatDate = (dateStr: string) => {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const [y, m, d] = dateStr.split('-').map(Number);
    return `${months[m - 1]} ${d}, ${y}`;
  };

  // Handle date input with auto-dashes
  const handleDateChange = (text: string, setter: (v: string) => void, currentValue: string) => {
    const cleaned = text.replace(/[^\d-]/g, '');
    let formatted = cleaned;
    if (cleaned.length === 4 && !cleaned.includes('-') && currentValue.length < text.length) {
      formatted = cleaned + '-';
    } else if (cleaned.length === 7 && cleaned.split('-').length === 2 && currentValue.length < text.length) {
      formatted = cleaned + '-';
    }
    if (formatted.length <= 10) {
      setter(formatted);
    }
  };

  // ── Start editing a review ──
  const startEditing = (review: ClientReview) => {
    setEditingReviewId(review.id);
    setEditPlatform(review.platform);
    setEditLink(review.reviewLink);
    setEditStarRating(review.starRating);
    setEditDate(review.reviewDate);
    setEditText(review.reviewText || '');
    setEditTrainer(review.creditedTrainer || '');
    setEditDietitian(review.creditedDietitian || '');
    // Close add form if open
    setShowAddForm(false);
  };

  // ── Cancel editing ──
  const cancelEditing = () => {
    setEditingReviewId(null);
    setIsEditSaving(false);
  };

  // ── Save edited review ──
  const handleSaveEdit = async () => {
    if (!editingReviewId) return;

    if (!editLink.trim()) {
      platformAlert('Missing Field', 'Please enter the review link.');
      return;
    }
    if (!editDate || !/^\d{4}-\d{2}-\d{2}$/.test(editDate)) {
      platformAlert('Invalid Date', 'Please enter a valid date in YYYY-MM-DD format.');
      return;
    }

    setIsEditSaving(true);

    try {
      const result = await updateClientReview({
        id: editingReviewId,
        platform: editPlatform,
        review_link: editLink.trim(),
        star_rating: editStarRating ?? null,
        review_date: editDate,
        review_text: editText.trim() || null,
        credited_trainer: editTrainer || null,
        credited_dietitian: editDietitian || null,
      });

      if (result.success && result.review) {
        onUpdateReview?.(result.review);
        setEditingReviewId(null);
        platformAlert('Review Updated', 'The review has been updated in the database.');
      } else {
        // Fallback: update locally even if DB fails
        const localUpdated: ClientReview = {
          id: editingReviewId,
          clientId: client.id,
          platform: editPlatform,
          reviewLink: editLink.trim(),
          starRating: editStarRating,
          reviewDate: editDate,
          reviewText: editText.trim() || undefined,
          creditedTrainer: editTrainer || undefined,
          creditedDietitian: editDietitian || undefined,
          addedDate: reviews.find(r => r.id === editingReviewId)?.addedDate || new Date().toISOString().split('T')[0],
        };
        onUpdateReview?.(localUpdated);
        setEditingReviewId(null);
        platformAlert('Updated Locally', `Saved locally but could not sync to database: ${result.error || 'Unknown error'}`);
      }
    } catch (err) {
      platformAlert('Error', err instanceof Error ? err.message : 'Failed to update review');
    } finally {
      setIsEditSaving(false);
    }
  };

  // Submit new review - persist to DB
  const handleSubmit = async () => {
    if (!formLink.trim()) {
      platformAlert('Missing Field', 'Please enter the review link.');
      return;
    }
    if (!formDate || !/^\d{4}-\d{2}-\d{2}$/.test(formDate)) {
      platformAlert('Invalid Date', 'Please enter a valid date in YYYY-MM-DD format.');
      return;
    }

    setIsSaving(true);

    try {
      const result = await addClientReview({
        clientId: client.id,
        platform: formPlatform,
        reviewLink: formLink.trim(),
        starRating: formStarRating ?? null,
        reviewDate: formDate,
        reviewText: formText.trim() || undefined,
        creditedTrainer: formTrainer || undefined,
        creditedDietitian: formDietitian || undefined,
        franchise: client.franchise,
      });

      if (result.success && result.review) {
        onAddReview(result.review);
        resetAddForm();
        setShowAddForm(false);
        platformAlert('Review Saved', 'The client review has been saved to the database.');
      } else {
        // Fallback: save locally if DB fails
        const localReview: ClientReview = {
          id: `review-local-${Date.now()}`,
          clientId: client.id,
          platform: formPlatform,
          reviewLink: formLink.trim(),
          starRating: formStarRating,
          reviewDate: formDate,
          reviewText: formText.trim() || undefined,
          creditedTrainer: formTrainer || undefined,
          creditedDietitian: formDietitian || undefined,
          addedDate: new Date().toISOString().split('T')[0],
        };
        onAddReview(localReview);
        resetAddForm();
        setShowAddForm(false);
        platformAlert('Review Added Locally', `Saved locally but could not sync to database: ${result.error || 'Unknown error'}`);
      }
    } catch (err) {
      platformAlert('Error', err instanceof Error ? err.message : 'Failed to save review');
    } finally {
      setIsSaving(false);
    }
  };

  const resetAddForm = () => {
    setFormPlatform('google');
    setFormLink('');
    setFormStarRating(5);
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormText('');
    setFormTrainer(client.trainer !== 'None' ? client.trainer : '');
    setFormDietitian(client.dietitian !== 'None' ? client.dietitian : '');
  };

  // Delete review - remove from DB
  // Uses platformAlert instead of Alert.alert so the confirmation dialog
  // works on web (Alert.alert with buttons is silently ignored on web).
  const handleDeleteReview = (reviewId: string) => {
    platformAlert(
      'Delete Review',
      'Are you sure you want to remove this review? This will also delete it from the database.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteClientReview(reviewId);
            if (result.success) {
              onDeleteReview?.(reviewId);
              // If we were editing this review, cancel the edit
              if (editingReviewId === reviewId) {
                setEditingReviewId(null);
              }
            } else {
              // Still remove locally even if DB delete failed
              onDeleteReview?.(reviewId);
              if (editingReviewId === reviewId) {
                setEditingReviewId(null);
              }
              platformAlert('Warning', `Removed locally but database delete may have failed: ${result.error}`);
            }
          },
        },
      ],
      { icon: 'trash', iconColor: '#e74c3c' },
    );
  };

  const handleOpenLink = (url: string) => {
    Linking.openURL(url).catch(() => {
      platformAlert('Cannot Open Link', url);
    });
  };


  // ── Render star rating display ──
  const renderStars = (rating: number | undefined, size: number = 14) => {
    if (rating == null) return <Text style={s.noRating}>N/A</Text>;
    return (
      <View style={s.starsRow}>
        {[1, 2, 3, 4, 5].map(i => (
          <Ionicons
            key={i}
            name={i <= rating ? 'star' : 'star-outline'}
            size={size}
            color={i <= rating ? '#f39c12' : COLORS.borderLight}
          />
        ))}
      </View>
    );
  };

  // ── Render star rating selector (generic) ──
  const renderStarSelectorGeneric = (
    currentRating: number | undefined,
    onSelect: (val: number | undefined) => void,
  ) => (
    <View style={s.starSelector}>
      {[1, 2, 3, 4, 5].map(i => (
        <TouchableOpacity
          key={i}
          onPress={() => onSelect(i)}
          activeOpacity={0.6}
          style={s.starBtn}
        >
          <Ionicons
            name={currentRating != null && i <= currentRating ? 'star' : 'star-outline'}
            size={28}
            color={currentRating != null && i <= currentRating ? '#f39c12' : COLORS.border}
          />
        </TouchableOpacity>
      ))}
      <TouchableOpacity
        onPress={() => onSelect(undefined)}
        style={[s.naBtn, currentRating == null && s.naBtnActive]}
        activeOpacity={0.7}
      >
        <Text style={[s.naBtnText, currentRating == null && s.naBtnTextActive]}>N/A</Text>
      </TouchableOpacity>
    </View>
  );

  // ── Render platform selector (generic) ──
  const renderPlatformSelector = (
    currentPlatform: ReviewPlatform,
    onSelect: (p: ReviewPlatform) => void,
  ) => (
    <View style={s.platformSelector}>
      {PLATFORMS.map(p => {
        const config = PLATFORM_CONFIG[p];
        const isSelected = currentPlatform === p;
        return (
          <TouchableOpacity
            key={p}
            style={[s.platformOption, isSelected && { backgroundColor: config.color, borderColor: config.color }]}
            onPress={() => onSelect(p)}
            activeOpacity={0.7}
          >
            <Ionicons name={config.icon as any} size={14} color={isSelected ? '#fff' : config.color} />
            <Text style={[s.platformOptionText, isSelected && { color: '#fff' }]}>{config.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  // ── Render staff chip row (generic) ──
  const renderStaffChips = (
    staffList: string[],
    currentValue: string,
    onSelect: (name: string) => void,
  ) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACING.md }}>
      <View style={s.staffChipRow}>
        <TouchableOpacity
          style={[s.staffChip, !currentValue && s.staffChipActive]}
          onPress={() => onSelect('')}
          activeOpacity={0.7}
        >
          <Text style={[s.staffChipText, !currentValue && s.staffChipTextActive]}>None</Text>
        </TouchableOpacity>
        {staffList.map(name => (
          <TouchableOpacity
            key={name}
            style={[s.staffChip, currentValue === name && s.staffChipActive]}
            onPress={() => onSelect(name)}
            activeOpacity={0.7}
          >
            <Text style={[s.staffChipText, currentValue === name && s.staffChipTextActive]}>{name}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );

  // ── Render the inline edit form for a review ──
  const renderEditForm = (review: ClientReview) => {
    const config = PLATFORM_CONFIG[editPlatform];
    return (
      <View key={review.id} style={s.editFormCard}>
        {/* Edit Header */}
        <View style={s.editFormHeader}>
          <View style={[s.editFormHeaderIcon, { backgroundColor: COLORS.accent + '15' }]}>
            <Ionicons name="create" size={16} color={COLORS.accent} />
          </View>
          <Text style={s.editFormHeaderTitle}>Edit Review</Text>
          <TouchableOpacity
            onPress={cancelEditing}
            style={s.editFormCancelX}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Platform selector */}
        <Text style={s.fieldLabel}>Platform</Text>
        {renderPlatformSelector(editPlatform, setEditPlatform)}

        {/* Review Link */}
        <Text style={s.fieldLabel}>Review Link</Text>
        <View style={s.inputWrapper}>
          <Ionicons name="link-outline" size={16} color={COLORS.textMuted} style={s.inputIcon} />
          <TextInput
            style={s.input}
            value={editLink}
            onChangeText={setEditLink}
            placeholder="https://..."
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="none"
            keyboardType="url"
          />
        </View>

        {/* Star Rating */}
        <Text style={s.fieldLabel}>Star Rating (if applicable)</Text>
        {renderStarSelectorGeneric(editStarRating, setEditStarRating)}

        {/* Review Date */}
        <Text style={s.fieldLabel}>Review Date</Text>
        <View style={s.inputWrapper}>
          <Ionicons name="calendar-outline" size={16} color={COLORS.textMuted} style={s.inputIcon} />
          <TextInput
            style={s.input}
            value={editDate}
            onChangeText={(text) => handleDateChange(text, setEditDate, editDate)}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="number-pad"
            maxLength={10}
          />
        </View>

        {/* Review Text (optional) */}
        <Text style={s.fieldLabel}>Review Text <Text style={s.optionalTag}>(optional)</Text></Text>
        <View style={[s.inputWrapper, { height: 80, alignItems: 'flex-start', paddingTop: SPACING.sm }]}>
          <TextInput
            style={[s.input, { height: 70, textAlignVertical: 'top' }]}
            value={editText}
            onChangeText={setEditText}
            placeholder="Paste or type the review text..."
            placeholderTextColor={COLORS.textMuted}
            multiline
          />
        </View>

        {/* Credited Trainer */}
        <Text style={s.fieldLabel}>Credited Trainer <Text style={s.optionalTag}>(optional)</Text></Text>
        {renderStaffChips(franchiseTrainers, editTrainer, setEditTrainer)}

        {/* Credited Dietitian */}
        <Text style={s.fieldLabel}>Credited Dietitian <Text style={s.optionalTag}>(optional)</Text></Text>
        {renderStaffChips(franchiseDietitians, editDietitian, setEditDietitian)}

        {/* Save / Cancel Buttons */}
        <View style={s.editFormActions}>
          <TouchableOpacity
            style={s.editCancelBtn}
            onPress={cancelEditing}
            activeOpacity={0.7}
            disabled={isEditSaving}
          >
            <Ionicons name="close-circle-outline" size={16} color={COLORS.textSecondary} />
            <Text style={s.editCancelBtnText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.editSaveBtn, isEditSaving && { opacity: 0.6 }]}
            onPress={handleSaveEdit}
            activeOpacity={0.7}
            disabled={isEditSaving}
          >
            {isEditSaving ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={16} color={COLORS.white} />
                <Text style={s.editSaveBtnText}>Save Changes</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={s.container}>
      {/* ── Summary Header ── */}
      <View style={s.summaryCard}>
        <View style={s.summaryTop}>
          <View style={s.summaryLeft}>
            <Text style={s.totalCount}>{reviews.length}</Text>
            <Text style={s.totalLabel}>Total Reviews</Text>
          </View>
          {avgRating > 0 && (
            <View style={s.summaryRight}>
              <View style={s.avgRatingRow}>
                <Ionicons name="star" size={20} color="#f39c12" />
                <Text style={s.avgRatingValue}>{avgRating.toFixed(1)}</Text>
              </View>
              <Text style={s.avgRatingLabel}>Avg Rating</Text>
            </View>
          )}
        </View>

        {/* Platform breakdown chips */}
        <View style={s.platformRow}>
          {PLATFORMS.map(p => {
            const config = PLATFORM_CONFIG[p];
            const count = platformCounts[p] || 0;
            if (count === 0) return null;
            return (
              <View key={p} style={[s.platformChip, { backgroundColor: config.bgColor, borderColor: config.color + '30' }]}>
                <Ionicons name={config.icon as any} size={12} color={config.color} />
                <Text style={[s.platformChipText, { color: config.color }]}>{count}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* ── Add Review Button ── */}
      <TouchableOpacity
        style={s.addBtn}
        onPress={() => {
          setShowAddForm(!showAddForm);
          // Close any active edit when opening add form
          if (!showAddForm) setEditingReviewId(null);
        }}
        activeOpacity={0.7}
      >
        <Ionicons name={showAddForm ? 'close-circle' : 'add-circle'} size={18} color={COLORS.white} />
        <Text style={s.addBtnText}>{showAddForm ? 'Cancel' : 'Add Review'}</Text>
      </TouchableOpacity>

      {/* ── Add Review Form ── */}
      {showAddForm && (
        <View style={s.formCard}>
          <View style={s.formHeader}>
            <View style={[s.formHeaderIcon, { backgroundColor: '#f39c1215' }]}>
              <Ionicons name="create" size={16} color="#f39c12" />
            </View>
            <Text style={s.formHeaderTitle}>Add New Review</Text>
          </View>

          {/* Platform selector */}
          <Text style={s.fieldLabel}>Platform</Text>
          {renderPlatformSelector(formPlatform, setFormPlatform)}

          {/* Review Link */}
          <Text style={s.fieldLabel}>Review Link</Text>
          <View style={s.inputWrapper}>
            <Ionicons name="link-outline" size={16} color={COLORS.textMuted} style={s.inputIcon} />
            <TextInput
              style={s.input}
              value={formLink}
              onChangeText={setFormLink}
              placeholder="https://..."
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="none"
              keyboardType="url"
            />
          </View>

          {/* Star Rating */}
          <Text style={s.fieldLabel}>Star Rating (if applicable)</Text>
          {renderStarSelectorGeneric(formStarRating, setFormStarRating)}

          {/* Review Date */}
          <Text style={s.fieldLabel}>Review Date</Text>
          <View style={s.inputWrapper}>
            <Ionicons name="calendar-outline" size={16} color={COLORS.textMuted} style={s.inputIcon} />
            <TextInput
              style={s.input}
              value={formDate}
              onChangeText={(text) => handleDateChange(text, setFormDate, formDate)}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="number-pad"
              maxLength={10}
            />
          </View>

          {/* Review Text (optional) */}
          <Text style={s.fieldLabel}>Review Text <Text style={s.optionalTag}>(optional)</Text></Text>
          <View style={[s.inputWrapper, { height: 80, alignItems: 'flex-start', paddingTop: SPACING.sm }]}>
            <TextInput
              style={[s.input, { height: 70, textAlignVertical: 'top' }]}
              value={formText}
              onChangeText={setFormText}
              placeholder="Paste or type the review text..."
              placeholderTextColor={COLORS.textMuted}
              multiline
            />
          </View>

          {/* Credited Trainer */}
          <Text style={s.fieldLabel}>Credited Trainer <Text style={s.optionalTag}>(optional)</Text></Text>
          {renderStaffChips(franchiseTrainers, formTrainer, setFormTrainer)}

          {/* Credited Dietitian */}
          <Text style={s.fieldLabel}>Credited Dietitian <Text style={s.optionalTag}>(optional)</Text></Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACING.lg }}>
            <View style={s.staffChipRow}>
              <TouchableOpacity
                style={[s.staffChip, !formDietitian && s.staffChipActive]}
                onPress={() => setFormDietitian('')}
                activeOpacity={0.7}
              >
                <Text style={[s.staffChipText, !formDietitian && s.staffChipTextActive]}>None</Text>
              </TouchableOpacity>
              {franchiseDietitians.map(name => (
                <TouchableOpacity
                  key={name}
                  style={[s.staffChip, formDietitian === name && s.staffChipActive]}
                  onPress={() => setFormDietitian(name)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.staffChipText, formDietitian === name && s.staffChipTextActive]}>{name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Submit */}
          <TouchableOpacity
            style={[s.submitBtn, isSaving && { opacity: 0.6 }]}
            onPress={handleSubmit}
            activeOpacity={0.7}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={18} color={COLORS.white} />
                <Text style={s.submitBtnText}>Save Review</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* ── Filter Chips ── */}
      {reviews.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll}>
          <View style={s.filterRow}>
            <TouchableOpacity
              style={[s.filterChip, filterPlatform === 'all' && s.filterChipActive]}
              onPress={() => setFilterPlatform('all')}
              activeOpacity={0.7}
            >
              <Text style={[s.filterChipText, filterPlatform === 'all' && s.filterChipTextActive]}>
                All ({reviews.length})
              </Text>
            </TouchableOpacity>
            {PLATFORMS.map(p => {
              const count = platformCounts[p] || 0;
              if (count === 0) return null;
              const config = PLATFORM_CONFIG[p];
              const isActive = filterPlatform === p;
              return (
                <TouchableOpacity
                  key={p}
                  style={[s.filterChip, isActive && { backgroundColor: config.color, borderColor: config.color }]}
                  onPress={() => setFilterPlatform(p)}
                  activeOpacity={0.7}
                >
                  <Ionicons name={config.icon as any} size={12} color={isActive ? '#fff' : config.color} />
                  <Text style={[s.filterChipText, isActive && { color: '#fff' }]}>
                    {config.label} ({count})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* ── Review Cards ── */}
      {filteredReviews.length === 0 ? (
        <View style={s.emptyState}>
          <Ionicons name="chatbubbles-outline" size={40} color={COLORS.textMuted} />
          <Text style={s.emptyTitle}>
            {reviews.length === 0 ? 'No Reviews Yet' : 'No Reviews for This Platform'}
          </Text>
          <Text style={s.emptyText}>
            {reviews.length === 0
              ? 'Add a review when this client leaves feedback on Google, Facebook, Yelp, Thumbtack, or Nextdoor.'
              : 'Try selecting a different platform filter.'}
          </Text>
        </View>
      ) : (
        filteredReviews.map(review => {
          // If this review is being edited, show inline edit form
          if (editingReviewId === review.id) {
            return renderEditForm(review);
          }

          const config = PLATFORM_CONFIG[review.platform];
          return (
            <View key={review.id} style={s.reviewCard}>
              {/* Review Header */}
              <View style={s.reviewHeader}>
                <View style={[s.reviewPlatformBadge, { backgroundColor: config.bgColor, borderColor: config.color + '30' }]}>
                  <Ionicons name={config.icon as any} size={16} color={config.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.reviewPlatformName, { color: config.color }]}>{config.label}</Text>
                  <Text style={s.reviewDate}>{formatDate(review.reviewDate)}</Text>
                </View>
                {renderStars(review.starRating, 14)}
              </View>

              {/* Review Text */}
              {review.reviewText && (
                <Text style={s.reviewText} numberOfLines={3}>
                  "{review.reviewText}"
                </Text>
              )}

              {/* Credited Staff */}
              {(review.creditedTrainer || review.creditedDietitian) && (
                <View style={s.creditRow}>
                  {review.creditedTrainer && (
                    <View style={s.creditBadge}>
                      <Ionicons name="fitness-outline" size={11} color={COLORS.accent} />
                      <Text style={s.creditText}>{review.creditedTrainer}</Text>
                    </View>
                  )}
                  {review.creditedDietitian && (
                    <View style={[s.creditBadge, { backgroundColor: '#e67e2210', borderColor: '#e67e2225' }]}>
                      <Ionicons name="nutrition-outline" size={11} color="#e67e22" />
                      <Text style={[s.creditText, { color: '#e67e22' }]}>{review.creditedDietitian}</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Actions */}
              <View style={s.reviewActions}>
                <TouchableOpacity
                  style={s.linkBtn}
                  onPress={() => handleOpenLink(review.reviewLink)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="open-outline" size={13} color={COLORS.accent} />
                  <Text style={s.linkBtnText}>View Review</Text>
                </TouchableOpacity>

                {/* Edit Button */}
                {onUpdateReview && (
                  <TouchableOpacity
                    style={s.editReviewBtn}
                    onPress={() => startEditing(review)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="create-outline" size={13} color="#9b59b6" />
                  </TouchableOpacity>
                )}

                {/* Delete Button */}
                {onDeleteReview && (
                  <TouchableOpacity
                    style={s.deleteBtn}
                    onPress={() => handleDeleteReview(review.id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={13} color={COLORS.danger} />
                  </TouchableOpacity>
                )}

                <Text style={s.addedDate}>Added {formatDate(review.addedDate)}</Text>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, marginTop: SPACING.md },

  // Summary
  summaryCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  summaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  summaryLeft: { alignItems: 'flex-start' },
  totalCount: { fontSize: 36, fontWeight: '800', color: COLORS.primary },
  totalLabel: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: COLORS.textMuted, marginTop: 2 },
  summaryRight: { alignItems: 'flex-end' },
  avgRatingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  avgRatingValue: { fontSize: FONT_SIZES.xxl, fontWeight: '800', color: COLORS.primary },
  avgRatingLabel: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: COLORS.textMuted, marginTop: 2 },
  platformRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  platformChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
  },
  platformChipText: { fontSize: FONT_SIZES.xs, fontWeight: '700' },

  // Add button
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accent,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.md,
  },
  addBtnText: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.white },

  // Form (shared between add and edit)
  formCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1.5,
    borderColor: COLORS.accent + '30',
    ...SHADOWS.md,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  formHeaderIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formHeaderTitle: { fontSize: FONT_SIZES.lg, fontWeight: '800', color: COLORS.text },
  fieldLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  optionalTag: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '500',
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.borderLight,
    paddingHorizontal: SPACING.md,
    height: 48,
    marginBottom: SPACING.md,
  },
  inputIcon: { marginRight: SPACING.sm },
  input: { flex: 1, fontSize: FONT_SIZES.md, color: COLORS.text, fontWeight: '600' },

  // Platform selector
  platformSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  platformOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1.5,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.background,
  },
  platformOptionText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },

  // Star selector
  starSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  starBtn: { padding: 2 },
  naBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1.5,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.background,
    marginLeft: SPACING.sm,
  },
  naBtnActive: { backgroundColor: COLORS.textMuted, borderColor: COLORS.textMuted },
  naBtnText: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.textMuted },
  naBtnTextActive: { color: COLORS.white },

  // Staff chips
  staffChipRow: { flexDirection: 'row', gap: SPACING.sm },
  staffChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1.5,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.background,
  },
  staffChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  staffChipText: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.textSecondary },
  staffChipTextActive: { color: COLORS.white },

  // Submit
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.success,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
  },
  submitBtnText: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.white },

  // Filter
  filterScroll: { marginBottom: SPACING.md },
  filterRow: { flexDirection: 'row', gap: SPACING.sm },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1.5,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.white,
  },
  filterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterChipText: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.textSecondary },
  filterChipTextActive: { color: COLORS.white },

  // Stars
  starsRow: { flexDirection: 'row', gap: 1 },
  noRating: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: COLORS.textMuted, fontStyle: 'italic' },

  // Review card
  reviewCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  reviewPlatformBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  reviewPlatformName: { fontSize: FONT_SIZES.sm, fontWeight: '700' },
  reviewDate: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 1 },
  reviewText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    lineHeight: 20,
    marginBottom: SPACING.sm,
    paddingLeft: SPACING.sm,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.borderLight,
  },
  creditRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  creditBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.accent + '10',
    borderWidth: 1,
    borderColor: COLORS.accent + '25',
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },
  creditText: { fontSize: 10, fontWeight: '700', color: COLORS.accent },
  reviewActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingTop: SPACING.sm,
    marginTop: SPACING.xs,
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: 5,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.accent + '10',
    borderWidth: 1,
    borderColor: COLORS.accent + '25',
  },
  linkBtnText: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.accent },

  // Edit review button
  editReviewBtn: {
    padding: 5,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: '#9b59b610',
    borderWidth: 1,
    borderColor: '#9b59b620',
  },

  deleteBtn: {
    padding: 5,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.danger + '10',
    borderWidth: 1,
    borderColor: COLORS.danger + '20',
  },
  addedDate: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: '600',
    marginLeft: 'auto',
  },

  // ── Edit form card (inline) ──
  editFormCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.sm,
    borderWidth: 1.5,
    borderColor: '#9b59b640',
    ...SHADOWS.md,
  },
  editFormHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  editFormHeaderIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editFormHeaderTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.text,
    flex: 1,
  },
  editFormCancelX: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editFormActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  editCancelBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    borderWidth: 1.5,
    borderColor: COLORS.borderLight,
  },
  editCancelBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  editSaveBtn: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.success,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
  },
  editSaveBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.white,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: SPACING.xxxl,
    gap: SPACING.sm,
  },
  emptyTitle: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.textSecondary },
  emptyText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingHorizontal: SPACING.xl,
    lineHeight: 20,
  },
});
