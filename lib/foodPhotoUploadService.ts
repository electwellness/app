// Food Photo Upload Service
// Handles uploading food photos to Supabase storage and creating review records
import { supabase } from './supabase';
import { Platform } from 'react-native';
import type { MealType, ReviewStatus } from '../data/foodPhotoData';

export interface SubmittedFoodPhoto {
  id: string;
  photoId: string;
  photoUri: string;
  meal: MealType;
  description: string;
  date: string;
  time: string;
  status: ReviewStatus;
  dietitianFeedback?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface UploadResult {
  success: boolean;
  photoUrl?: string;
  photoId?: string;
  error?: string;
}

// Convert a data URI (base64) to a Blob for upload
function dataUriToBlob(dataUri: string): { blob: Blob; mimeType: string } {
  const parts = dataUri.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const byteString = atob(parts[1]);
  const arrayBuffer = new ArrayBuffer(byteString.length);
  const uint8Array = new Uint8Array(arrayBuffer);
  for (let i = 0; i < byteString.length; i++) {
    uint8Array[i] = byteString.charCodeAt(i);
  }
  return { blob: new Blob([uint8Array], { type: mimeType }), mimeType };
}

// Generate a unique photo ID
function generatePhotoId(clientId: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `fp-${clientId.substring(0, 8)}-${timestamp}-${random}`;
}

// Get file extension from mime type
function getExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
  };
  return map[mimeType] || 'jpg';
}

/**
 * Upload a food photo to Supabase storage and create a pending review record.
 * 
 * @param photoUri - The photo data URI (base64) or file URI
 * @param meal - The meal type (breakfast, lunch, dinner, snack)
 * @param description - Optional description of the meal
 * @param clientInfo - Client information for the review record
 * @returns UploadResult with the public URL and photo ID
 */
export async function uploadFoodPhoto(
  photoUri: string,
  meal: MealType,
  description: string,
  clientInfo: {
    clientId: string;
    clientName: string;
    dietitianName: string;
    franchise: string;
  }
): Promise<UploadResult> {
  const photoId = generatePhotoId(clientInfo.clientId);
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  try {
    // Step 1: Upload photo to Supabase storage
    let publicUrl: string;

    if (photoUri.startsWith('data:')) {
      // Web: data URI → Blob upload
      const { blob, mimeType } = dataUriToBlob(photoUri);
      const ext = getExtension(mimeType);
      const storagePath = `food-photos/${clientInfo.clientId}/${dateStr}/${photoId}.${ext}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('biometric-photos')
        .upload(storagePath, blob, {
          contentType: mimeType,
          upsert: true,
        });

      if (uploadError) {
        console.error('[foodPhotoUpload] Storage upload error:', uploadError);
        return { success: false, error: `Upload failed: ${uploadError.message}` };
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('biometric-photos')
        .getPublicUrl(storagePath);

      publicUrl = urlData.publicUrl;
    } else if (photoUri.startsWith('file://') || photoUri.startsWith('content://')) {
      // Native: fetch the file and upload as blob
      const response = await fetch(photoUri);
      const blob = await response.blob();
      const ext = photoUri.split('.').pop()?.toLowerCase() || 'jpg';
      const mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      const storagePath = `food-photos/${clientInfo.clientId}/${dateStr}/${photoId}.${ext}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('biometric-photos')
        .upload(storagePath, blob, {
          contentType: mimeType,
          upsert: true,
        });

      if (uploadError) {
        console.error('[foodPhotoUpload] Native upload error:', uploadError);
        return { success: false, error: `Upload failed: ${uploadError.message}` };
      }

      const { data: urlData } = supabase.storage
        .from('biometric-photos')
        .getPublicUrl(storagePath);

      publicUrl = urlData.publicUrl;
    } else {
      // Already a URL (shouldn't happen in normal flow, but handle gracefully)
      publicUrl = photoUri;
    }

    // Step 2: Create food_photo_reviews record via edge function
    const { data, error } = await supabase.functions.invoke('manage-food-reviews', {
      body: {
        action: 'create-submission',
        photoId,
        clientId: clientInfo.clientId,
        clientName: clientInfo.clientName,
        dietitianName: clientInfo.dietitianName,
        franchise: clientInfo.franchise,
        photoUri: publicUrl,
        meal,
        photoDate: dateStr,
        photoTime: timeStr,
        description: description.trim(),
      },
    });

    if (error) {
      console.error('[foodPhotoUpload] Edge function error:', error);
      // Photo was uploaded but DB record failed - still return the URL
      return {
        success: false,
        photoUrl: publicUrl,
        photoId,
        error: `Photo uploaded but record creation failed: ${error.message}`,
      };
    }

    if (data && data.success === false) {
      return {
        success: false,
        photoUrl: publicUrl,
        photoId,
        error: data.error || 'Failed to create review record',
      };
    }

    console.log(`[foodPhotoUpload] Success: ${photoId} → ${publicUrl}`);
    return { success: true, photoUrl: publicUrl, photoId };

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[foodPhotoUpload] Exception:', msg);
    return { success: false, error: msg };
  }
}

/**
 * Fetch submitted food photos for a client from the database.
 * Returns them sorted by date descending.
 */
export async function fetchClientSubmittedPhotos(
  clientId: string
): Promise<{ success: boolean; photos: SubmittedFoodPhoto[]; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('manage-food-reviews', {
      body: { action: 'get-reviews', clientId, limit: 50 },
    });

    if (error) {
      console.error('[foodPhotoUpload] Fetch error:', error);
      return { success: false, photos: [], error: error.message };
    }

    if (data && data.success === false) {
      return { success: false, photos: [], error: data.error };
    }

    const reviews = data?.reviews || [];
    const photos: SubmittedFoodPhoto[] = reviews.map((r: any) => ({
      id: r.id?.toString() || r.photo_id,
      photoId: r.photo_id,
      photoUri: r.photo_uri,
      meal: r.meal as MealType,
      description: r.description || '',
      date: r.photo_date,
      time: r.photo_time,
      status: r.review_status as ReviewStatus,
      dietitianFeedback: r.dietitian_feedback || undefined,
      reviewedAt: r.reviewed_at || undefined,
      createdAt: r.created_at || r.updated_at || '',
    }));

    return { success: true, photos };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[foodPhotoUpload] Fetch exception:', msg);
    return { success: false, photos: [], error: msg };
  }
}
