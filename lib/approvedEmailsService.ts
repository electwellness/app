import { supabase } from '@/app/lib/supabase';

export interface ApprovedEmail {
  id: string;
  email: string;
  role: string;
  full_name: string | null;
  franchise: string | null;
  approved_by: string | null;
  created_at: string;
  claimed: boolean;
  claimed_at: string | null;
  address: string | null;
  phone: string | null;
  invite_sent?: boolean | null;
  invite_count?: number | null;
  invite_sent_at?: string | null;
}

export interface AddEmailParams {
  email: string;
  role: string;
  full_name?: string;
  franchise?: string;
  approved_by?: string;
  address?: string;
  phone?: string;
}


export async function listApprovedEmails(
  search?: string,
  filter?: 'all' | 'claimed' | 'unclaimed',
  franchise?: string
): Promise<{ data: ApprovedEmail[] | null; error: string | null }> {
  const maxRetries = 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      let query = supabase
        .from('approved_emails')
        .select('id, email, role, full_name, franchise, approved_by, created_at, claimed, claimed_at, address, phone, invite_sent, invite_count, invite_sent_at')
        .order('created_at', { ascending: false });

      if (filter === 'claimed') {
        query = query.eq('claimed', true);
      } else if (filter === 'unclaimed') {
        query = query.eq('claimed', false);
      }

      // Franchise-scoped filtering for franchise managers
      if (franchise) {
        query = query.eq('franchise', franchise);
      }

      if (search) {
        const q = search.trim().toLowerCase();
        query = query.or(`email.ilike.%${q}%,full_name.ilike.%${q}%,franchise.ilike.%${q}%`);
      }

      const { data, error } = await query;

      if (error) {
        // Check for retryable XX000 / query_failed errors
        const errorStr = JSON.stringify(error);
        const isRetryable = error.code === 'XX000' || errorStr.includes('query_failed') || errorStr.includes('Query execution failed');

        if (isRetryable && attempt < maxRetries) {
          const delay = (attempt + 1) * 500;
          console.warn(`listApprovedEmails: retryable DB error (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`, error);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        console.error('List approved emails error:', error);
        return { data: null, error: error.message || 'Failed to fetch approved emails' };
      }

      return { data: data as ApprovedEmail[] || [], error: null };
    } catch (err: any) {
      if (attempt < maxRetries) {
        const delay = (attempt + 1) * 500;
        console.warn(`listApprovedEmails: exception (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`, err);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      console.error('List approved emails exception:', err);
      return { data: null, error: err.message || 'An unexpected error occurred' };
    }
  }

  // Should not reach here
  return { data: null, error: 'All retry attempts failed' };
}



/**
 * Fetch a client's address by looking up their email in approved_emails first,
 * then falling back to user_profiles. Returns the address string or null.
 */
export async function fetchClientAddress(email: string): Promise<string | null> {
  if (!email) return null;
  const normalizedEmail = email.trim().toLowerCase();

  try {
    // 1. Try approved_emails first (where the 42 addresses were stored)
    const { data: aeData, error: aeError } = await supabase
      .from('approved_emails')
      .select('address')
      .eq('email', normalizedEmail)
      .limit(1)
      .maybeSingle();

    if (!aeError && aeData?.address) {
      return aeData.address;
    }

    // 2. Fall back to user_profiles
    const { data: upData, error: upError } = await supabase
      .from('user_profiles')
      .select('address')
      .eq('email', normalizedEmail)
      .limit(1)
      .maybeSingle();

    if (!upError && upData?.address) {
      return upData.address;
    }

    return null;
  } catch (err) {
    console.error('fetchClientAddress error:', err);
    return null;
  }
}



/**
 * Persist an updated address for a client by email.
 * Updates approved_emails first, then also updates user_profiles if a matching row exists.
 * Returns { success, error }.
 */
export async function updateClientAddress(
  email: string,
  address: string | null
): Promise<{ success: boolean; error: string | null }> {
  if (!email) return { success: false, error: 'No email provided' };
  const normalizedEmail = email.trim().toLowerCase();
  const trimmedAddress = address?.trim() || null;

  try {
    // 1. Update approved_emails
    const { error: aeError } = await supabase
      .from('approved_emails')
      .update({ address: trimmedAddress })
      .eq('email', normalizedEmail);

    if (aeError) {
      console.error('updateClientAddress approved_emails error:', aeError);
      return { success: false, error: aeError.message || 'Failed to update address in approved_emails' };
    }

    // 2. Also update user_profiles if a row exists (best-effort, don't fail if no row)
    const { error: upError } = await supabase
      .from('user_profiles')
      .update({ address: trimmedAddress })
      .eq('email', normalizedEmail);

    if (upError) {
      // Log but don't fail — approved_emails is the primary source
      console.warn('updateClientAddress user_profiles warning:', upError.message);
    }

    return { success: true, error: null };
  } catch (err: any) {
    console.error('updateClientAddress exception:', err);
    return { success: false, error: err.message || 'An unexpected error occurred' };
  }
}


/**
 * Fetch a client's phone by looking up their email in approved_emails first,
 * then falling back to user_profiles. Returns the phone string or null.
 */
export async function fetchClientPhone(email: string): Promise<string | null> {
  if (!email) return null;
  const normalizedEmail = email.trim().toLowerCase();

  try {
    // 1. Try approved_emails first
    const { data: aeData, error: aeError } = await supabase
      .from('approved_emails')
      .select('phone')
      .eq('email', normalizedEmail)
      .limit(1)
      .maybeSingle();

    if (!aeError && aeData?.phone) {
      return aeData.phone;
    }

    // 2. Fall back to user_profiles
    const { data: upData, error: upError } = await supabase
      .from('user_profiles')
      .select('phone')
      .eq('email', normalizedEmail)
      .limit(1)
      .maybeSingle();

    if (!upError && upData?.phone) {
      return upData.phone;
    }

    return null;
  } catch (err) {
    console.error('fetchClientPhone error:', err);
    return null;
  }
}


/**
 * Persist an updated phone number for a client by email.
 * Updates approved_emails first, then also updates user_profiles if a matching row exists.
 * Returns { success, error }.
 */
export async function updateClientPhone(
  email: string,
  phone: string | null
): Promise<{ success: boolean; error: string | null }> {
  if (!email) return { success: false, error: 'No email provided' };
  const normalizedEmail = email.trim().toLowerCase();
  const trimmedPhone = phone?.trim() || null;

  try {
    // 1. Update approved_emails
    const { error: aeError } = await supabase
      .from('approved_emails')
      .update({ phone: trimmedPhone })
      .eq('email', normalizedEmail);

    if (aeError) {
      console.error('updateClientPhone approved_emails error:', aeError);
      return { success: false, error: aeError.message || 'Failed to update phone in approved_emails' };
    }

    // 2. Also update user_profiles if a row exists (best-effort, don't fail if no row)
    const { error: upError } = await supabase
      .from('user_profiles')
      .update({ phone: trimmedPhone })
      .eq('email', normalizedEmail);

    if (upError) {
      // Log but don't fail — approved_emails is the primary source
      console.warn('updateClientPhone user_profiles warning:', upError.message);
    }

    return { success: true, error: null };
  } catch (err: any) {
    console.error('updateClientPhone exception:', err);
    return { success: false, error: err.message || 'An unexpected error occurred' };
  }
}




export async function addApprovedEmail(
  params: AddEmailParams
): Promise<{ data: ApprovedEmail | null; error: string | null }> {
  try {
    const normalizedEmail = params.email.trim().toLowerCase();

    // Use the manage-approved-emails edge function which has service_role access
    // This bypasses RLS policies that may block direct client-side INSERT
    // The edge function is idempotent: returns 200 even if email already exists
    const { data, error } = await supabase.functions.invoke('manage-approved-emails', {
      body: {
        action: 'add',
        email: normalizedEmail,
        role: params.role || 'client',
        full_name: params.full_name?.trim() || undefined,
        franchise: params.franchise?.trim() || undefined,
        approved_by: params.approved_by || undefined,
        address: params.address?.trim() || undefined,
        phone: params.phone?.trim() || undefined,
      },
    });

    if (error) {
      // Try multiple approaches to extract the actual error message
      let errorMsg = 'Failed to add approved email';

      // Approach 1: Check if data was also returned (some Supabase JS versions populate both)
      if (data?.error) {
        errorMsg = data.error;
      } else {
        // Approach 2: Try to parse error.message as JSON
        try {
          const parsed = JSON.parse(error.message);
          if (parsed?.error) errorMsg = parsed.error;
        } catch {
          // Approach 3: Try to read from error.context (FunctionsHttpError in newer versions)
          try {
            const ctx = (error as any).context;
            if (ctx && typeof ctx === 'object' && typeof ctx.json === 'function') {
              const ctxData = await ctx.json();
              if (ctxData?.error) errorMsg = ctxData.error;
            } else if (typeof ctx === 'string') {
              const parsed2 = JSON.parse(ctx);
              if (parsed2?.error) errorMsg = parsed2.error;
            }
          } catch {
            // Use raw message if it's not the generic one
            if (error.message && error.message !== 'Edge Function returned a non-2xx status code') {
              errorMsg = error.message;
            }
          }
        }
      }

      // If it's a duplicate/already-approved, treat as success (idempotent)
      if (errorMsg.toLowerCase().includes('already been approved') || errorMsg.toLowerCase().includes('duplicate')) {
        console.log('addApprovedEmail: email already approved, treating as success');
        return { data: null, error: null };
      }

      console.error('addApprovedEmail edge function error:', errorMsg);
      return { data: null, error: errorMsg };
    }

    // Edge function returns { success: true, data: {...} } on success
    // or { success: true, already_existed: true, data: {...} } if email was already there
    if (data?.error) {
      const msg = data.error;
      if (msg.toLowerCase().includes('already been approved') || msg.toLowerCase().includes('duplicate')) {
        console.log('addApprovedEmail: email already approved (from data.error), treating as success');
        return { data: null, error: null };
      }
      return { data: null, error: msg };
    }

    if (data?.already_existed) {
      console.log('addApprovedEmail: email already existed, updated fields');
    }

    // Success
    const approvedEmail = data?.data || null;
    return { data: approvedEmail as ApprovedEmail, error: null };
  } catch (err: any) {
    console.error('addApprovedEmail exception:', err);
    return { data: null, error: err.message || 'An unexpected error occurred' };
  }
}




export async function deleteApprovedEmail(
  id: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!id) {
      return { success: false, error: 'No ID provided for deletion' };
    }

    // Use the edge function which has service_role access to bypass RLS
    const { data, error } = await supabase.functions.invoke('manage-approved-emails', {
      body: { action: 'delete', id },
    });

    if (error) {
      console.error('Delete approved email edge function error:', error);
      // Try to extract a meaningful error message from the response
      let errorMessage = 'Failed to delete approved email';
      try {
        // error.message may contain the JSON response body for non-2xx responses
        const parsed = JSON.parse(error.message);
        if (parsed?.error) {
          errorMessage = parsed.error;
        }
      } catch {
        // If parsing fails, use the raw error message if available
        if (error.message && error.message !== 'Edge Function returned a non-2xx status code') {
          errorMessage = error.message;
        }
      }
      return { success: false, error: errorMessage };
    }

    // The edge function returns { success: true } on success or { error: '...' } on failure
    if (data?.error) {
      console.error('Delete approved email server error:', data.error);
      return { success: false, error: data.error };
    }

    if (data?.success) {
      return { success: true, error: null };
    }

    // Fallback - if we got here, something unexpected happened
    console.warn('Delete approved email: unexpected response', data);
    return { success: true, error: null };
  } catch (err: any) {
    console.error('Delete approved email exception:', err);
    return { success: false, error: err.message || 'An unexpected error occurred' };
  }
}
