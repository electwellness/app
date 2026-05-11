// Food Photo Review Service - API calls to manage-food-reviews edge function
import { supabase } from './supabase';
import type { FoodPhotoEntry, ReviewStatus, MealType } from '../data/foodPhotoData';

export interface ReviewUpdatePayload {
  photoId: string;
  reviewStatus: ReviewStatus;
  dietitianFeedback?: string;
  reviewedAt?: string;
  photoData?: {
    client_id: string;
    client_name: string;
    dietitian_name: string;
    franchise: string;
    photo_uri: string;
    meal: string;
    photo_date: string;
    photo_time: string;
    description: string;
  };
}

// Shape of a review record as stored in the database
export interface PersistedReview {
  id?: number;
  photo_id: string;
  client_id: string;
  client_name: string;
  dietitian_name: string;
  franchise: string;
  photo_uri: string;
  meal: string;
  photo_date: string;
  photo_time: string;
  description: string;
  review_status: ReviewStatus;
  reviewed_at: string | null;
  dietitian_feedback: string | null;
  created_at?: string;
  updated_at?: string;
}

// Update a food photo review status + feedback via edge function
export async function updateFoodPhotoReview(payload: ReviewUpdatePayload): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('manage-food-reviews', {
      body: {
        action: 'update-review',
        photoId: payload.photoId,
        reviewStatus: payload.reviewStatus,
        dietitianFeedback: payload.dietitianFeedback,
        reviewedAt: payload.reviewedAt,
        photoData: payload.photoData,
      },
    });

    if (error) {
      console.error('[foodReviewService] Edge function error:', error);
      return { success: false, error: error.message || 'Network error' };
    }

    if (data && data.success === false) {
      return { success: false, error: data.error || 'Unknown API error' };
    }

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[foodReviewService] Exception:', msg);
    return { success: false, error: msg };
  }
}

// Convert a FoodPhotoEntry to the photoData format the API expects
export function toPhotoData(photo: FoodPhotoEntry) {
  return {
    client_id: photo.clientId,
    client_name: photo.clientName,
    dietitian_name: photo.dietitianName,
    franchise: photo.franchise,
    photo_uri: photo.photoUri,
    meal: photo.meal,
    photo_date: photo.date,
    photo_time: photo.time,
    description: photo.description,
  };
}

// Flexible fetch: supports optional clientId, dietitianName, status, limit
export interface FetchReviewsOptions {
  clientId?: string;
  dietitianName?: string;
  status?: ReviewStatus | 'all';
  limit?: number;
}

export async function fetchPersistedReviews(
  options: FetchReviewsOptions = {}
): Promise<{ success: boolean; reviews: PersistedReview[]; error?: string }> {
  try {
    const body: Record<string, unknown> = { action: 'get-reviews' };
    if (options.clientId) body.clientId = options.clientId;
    if (options.dietitianName) body.dietitianName = options.dietitianName;
    if (options.status && options.status !== 'all') body.status = options.status;
    if (options.limit) body.limit = options.limit;

    const { data, error } = await supabase.functions.invoke('manage-food-reviews', { body });

    if (error) {
      console.error('[foodReviewService] fetchPersistedReviews error:', error);
      return { success: false, reviews: [], error: error.message || 'Network error' };
    }

    if (data && data.success === false) {
      return { success: false, reviews: [], error: data.error || 'Unknown API error' };
    }

    return { success: true, reviews: (data?.reviews as PersistedReview[]) || [] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[foodReviewService] fetchPersistedReviews exception:', msg);
    return { success: false, reviews: [], error: msg };
  }
}

// Legacy alias - fetch reviews for a single client
export async function fetchFoodPhotoReviews(clientId: string): Promise<{ success: boolean; reviews?: PersistedReview[]; error?: string }> {
  return fetchPersistedReviews({ clientId });
}

/**
 * Merge persisted DB reviews into an array of mock/local FoodPhotoEntry objects.
 */
export function mergePersistedReviews(
  photos: FoodPhotoEntry[],
  dbReviews: PersistedReview[]
): FoodPhotoEntry[] {
  if (!dbReviews || dbReviews.length === 0) return photos;

  const dbMap = new Map<string, PersistedReview>();
  for (const r of dbReviews) {
    dbMap.set(r.photo_id, r);
  }

  const matchedIds = new Set<string>();

  const merged = photos.map((photo) => {
    const dbReview = dbMap.get(photo.id);
    if (!dbReview) return photo;

    matchedIds.add(dbReview.photo_id);

    return {
      ...photo,
      reviewStatus: dbReview.review_status as ReviewStatus,
      dietitianFeedback: dbReview.dietitian_feedback || undefined,
      reviewedAt: dbReview.reviewed_at || undefined,
      photoUri: dbReview.photo_uri && dbReview.photo_uri !== photo.photoUri
        ? dbReview.photo_uri
        : photo.photoUri,
    };
  });

  for (const r of dbReviews) {
    if (matchedIds.has(r.photo_id)) continue;

    merged.push({
      id: r.photo_id,
      clientId: r.client_id,
      clientName: r.client_name,
      dietitianName: r.dietitian_name,
      franchise: r.franchise,
      photoUri: r.photo_uri,
      meal: (r.meal as MealType) || 'snack',
      date: r.photo_date,
      time: r.photo_time,
      description: r.description || '',
      reviewStatus: r.review_status as ReviewStatus,
      reviewedAt: r.reviewed_at || undefined,
      dietitianFeedback: r.dietitian_feedback || undefined,
      createdAt: r.created_at || r.updated_at || new Date().toISOString(),
    });
  }

  return merged.sort((a, b) => {
    const dateCmp = b.date.localeCompare(a.date);
    if (dateCmp !== 0) return dateCmp;
    return b.createdAt.localeCompare(a.createdAt);
  });
}


// ── BULK UPDATE (used for day-level reviews) ──
export interface BulkUpdatePayload {
  photoIds: string[];
  reviewStatus: ReviewStatus;
  dietitianFeedback?: string;
  photoDataMap?: Record<string, ReturnType<typeof toPhotoData>>;
}

export interface BulkUpdateResult {
  success: boolean;
  partialSuccess?: boolean;
  results?: {
    updated: number;
    created: number;
    failed: number;
    errors: string[];
  };
  error?: string;
}

export async function bulkUpdateFoodPhotoReviews(
  payload: BulkUpdatePayload
): Promise<BulkUpdateResult> {
  try {
    const { data, error } = await supabase.functions.invoke('manage-food-reviews', {
      body: {
        action: 'bulk-update-reviews',
        photoIds: payload.photoIds,
        reviewStatus: payload.reviewStatus,
        dietitianFeedback: payload.dietitianFeedback,
        photoDataMap: payload.photoDataMap,
      },
    });

    if (error) {
      console.error('[foodReviewService] bulkUpdate error:', error);
      return { success: false, error: error.message || 'Network error' };
    }

    if (data && data.success === false && !data.partialSuccess) {
      return { success: false, error: data.error || 'Unknown API error', results: data.results };
    }

    return {
      success: data?.success ?? false,
      partialSuccess: data?.partialSuccess ?? false,
      results: data?.results,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[foodReviewService] bulkUpdate exception:', msg);
    return { success: false, error: msg };
  }
}
/**
 * Review all photos in a day with shared feedback.
 * Marks all provided photos as 'reviewed' with the same feedback text.
 */
export async function reviewDayPhotos(
  photos: FoodPhotoEntry[],
  feedback?: string
): Promise<BulkUpdateResult> {
  const photoIds = photos.map(p => p.id);
  const photoDataMap: Record<string, ReturnType<typeof toPhotoData>> = {};
  for (const photo of photos) {
    photoDataMap[photo.id] = toPhotoData(photo);
  }

  return bulkUpdateFoodPhotoReviews({
    photoIds,
    reviewStatus: 'reviewed',
    dietitianFeedback: feedback,
    photoDataMap,
  });
}



// ── QUEUE-AWARE REVIEW FUNCTIONS ──
// These integrate with the offline queue for optimistic UI + rollback + offline support

import { offlineReviewQueue } from './offlineReviewQueue';

export interface OptimisticReviewResult {
  /** Whether the optimistic update was applied */
  optimisticApplied: boolean;
  /** Whether the review was queued (true) or sent directly (false) */
  queued: boolean;
  /** Photo IDs that were updated */
  photoIds: string[];
  /** Rollback function to revert optimistic changes */
  rollback: () => void;
}

/** Generic state setter type (compatible with React.Dispatch<SetStateAction<T>>) */
type PhotoStateSetter = (updater: (prev: FoodPhotoEntry[]) => FoodPhotoEntry[]) => void;

/**
 * Queue-aware day review with optimistic updates.
 * 
 * 1. Immediately applies optimistic UI update via setPhotos callback
 * 2. Enqueues the review batch in the offline queue
 * 3. The queue processes the batch (immediately if online, later if offline)
 * 4. Returns a rollback function in case the caller needs to revert
 * 
 * @param photos - Photos to review
 * @param feedback - Optional shared feedback text
 * @param setPhotos - State setter to apply optimistic update
 * @param onUpdatePhoto - Parent callback to sync individual photo updates
 * @returns OptimisticReviewResult with rollback capability
 */
export function queuedReviewDayPhotos(
  photos: FoodPhotoEntry[],
  feedback: string | undefined,
  setPhotos: PhotoStateSetter,
  onUpdatePhoto?: (photoId: string, updates: Partial<FoodPhotoEntry>) => void,
): OptimisticReviewResult {
  if (photos.length === 0) {
    return { optimisticApplied: false, queued: false, photoIds: [], rollback: () => {} };
  }

  const reviewedAt = new Date().toISOString();
  const photoIds = photos.map(p => p.id);
  const photoIdSet = new Set(photoIds);

  // Capture previous state for rollback
  let previousPhotos: FoodPhotoEntry[] = [];
  setPhotos(prev => {
    previousPhotos = [...prev];
    return prev.map(p => {
      if (!photoIdSet.has(p.id)) return p;
      return {
        ...p,
        reviewStatus: 'reviewed' as ReviewStatus,
        dietitianFeedback: feedback || p.dietitianFeedback,
        reviewedAt,
      };
    });
  });

  // Sync parent state
  if (onUpdatePhoto) {
    for (const photo of photos) {
      onUpdatePhoto(photo.id, {
        reviewStatus: 'reviewed',
        dietitianFeedback: feedback,
        reviewedAt,
      });
    }
  }

  // Enqueue in offline queue (will auto-process if online)
  offlineReviewQueue.enqueueBatch(photos, 'reviewed', feedback);

  // Return rollback function
  const rollback = () => {
    setPhotos(() => previousPhotos);
    // Dequeue the items
    offlineReviewQueue.dequeueBatch(photoIds);
    // Rollback parent state
    if (onUpdatePhoto) {
      for (const prev of previousPhotos) {
        if (photoIdSet.has(prev.id)) {
          onUpdatePhoto(prev.id, {
            reviewStatus: prev.reviewStatus,
            dietitianFeedback: prev.dietitianFeedback,
            reviewedAt: prev.reviewedAt,
          });
        }
      }
    }
  };

  return {
    optimisticApplied: true,
    queued: true,
    photoIds,
    rollback,
  };
}

/**
 * Queue-aware single photo review with optimistic update.
 */
export function queuedUpdateReview(
  photo: FoodPhotoEntry,
  reviewStatus: ReviewStatus,
  feedback: string | undefined,
  setPhotos: PhotoStateSetter,
  onUpdatePhoto?: (photoId: string, updates: Partial<FoodPhotoEntry>) => void,
): OptimisticReviewResult {
  return queuedReviewDayPhotos(
    [photo],
    feedback,
    setPhotos,
    onUpdatePhoto,
  );
}
