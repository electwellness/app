import { supabase } from './supabase';
import type { ClientReview, ReviewPlatform } from '../data/mockData';

interface ListParams {
  clientId?: string;
  franchise?: string;
  platform?: ReviewPlatform;
  limit?: number;
  offset?: number;
}

interface AddParams {
  clientId: string;
  platform: ReviewPlatform;
  reviewLink: string;
  starRating?: number | null;
  reviewDate: string;
  reviewText?: string;
  creditedTrainer?: string;
  creditedDietitian?: string;
  franchise: string;
}

interface UpdateParams {
  id: string;
  platform?: ReviewPlatform;
  review_link?: string;
  star_rating?: number | null;
  review_date?: string;
  review_text?: string;
  credited_trainer?: string;
  credited_dietitian?: string;
  franchise?: string;
}

// Normalize date strings (DB may return ISO timestamps)
function normalizeDate(d: string | null | undefined): string {
  if (!d) return '';
  return d.split('T')[0];
}

function mapRowToReview(row: any): ClientReview & { franchise?: string } {
  return {
    id: row.id,
    clientId: row.clientId || row.client_id,
    platform: row.platform,
    reviewLink: row.reviewLink || row.review_link,
    starRating: row.starRating ?? row.star_rating ?? undefined,
    reviewDate: normalizeDate(row.reviewDate || row.review_date),
    reviewText: row.reviewText || row.review_text || undefined,
    creditedTrainer: row.creditedTrainer || row.credited_trainer || undefined,
    creditedDietitian: row.creditedDietitian || row.credited_dietitian || undefined,
    addedDate: normalizeDate(row.addedDate || row.added_date),
    franchise: row.franchise || undefined,
  };
}


export async function fetchClientReviews(params: ListParams): Promise<{ success: boolean; reviews: ClientReview[]; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('manage-client-reviews', {
      body: {
        action: 'list',
        client_id: params.clientId,
        franchise: params.franchise,
        platform: params.platform,
        limit: params.limit || 100,
        offset: params.offset || 0,
      },
    });

    if (error) return { success: false, reviews: [], error: error.message };
    if (!data?.success) return { success: false, reviews: [], error: data?.error || 'Unknown error' };

    const reviews = (data.reviews || []).map(mapRowToReview);
    return { success: true, reviews };
  } catch (err) {
    return { success: false, reviews: [], error: err instanceof Error ? err.message : 'Network error' };
  }
}

export async function addClientReview(params: AddParams): Promise<{ success: boolean; review?: ClientReview; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('manage-client-reviews', {
      body: {
        action: 'add',
        client_id: params.clientId,
        platform: params.platform,
        review_link: params.reviewLink,
        star_rating: params.starRating ?? null,
        review_date: params.reviewDate,
        review_text: params.reviewText || null,
        credited_trainer: params.creditedTrainer || null,
        credited_dietitian: params.creditedDietitian || null,
        franchise: params.franchise,
      },
    });

    if (error) return { success: false, error: error.message };
    if (!data?.success) return { success: false, error: data?.error || 'Failed to add review' };

    return { success: true, review: mapRowToReview(data.review) };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

export async function updateClientReview(params: UpdateParams): Promise<{ success: boolean; review?: ClientReview; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('manage-client-reviews', {
      body: { action: 'update', ...params },
    });

    if (error) return { success: false, error: error.message };
    if (!data?.success) return { success: false, error: data?.error || 'Failed to update review' };

    return { success: true, review: mapRowToReview(data.review) };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

export async function deleteClientReview(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('manage-client-reviews', {
      body: { action: 'delete', id },
    });

    if (error) return { success: false, error: error.message };
    if (!data?.success) return { success: false, error: data?.error || 'Failed to delete review' };

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}
