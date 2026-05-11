import { invokeEdgeFunction } from './edgeFunctionHelper';
import { isValidUUID } from './clientDataService';
import { supabase } from './supabase';

// ── Types ──

export interface PartnerGroupMember {
  id: string;
  user_id: string;
  is_primary: boolean;
  joined_at: string;
  full_name: string;
  email: string;
  program: string | null;
  program_start_date: string | null;
  program_stop_date: string | null;
  program_status: string | null;
  photo_url: string | null;
}

export interface PartnerGroup {
  id: string;
  primary_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface PartnerGroupData {
  group: PartnerGroup | null;
  members: PartnerGroupMember[];
}

export interface PartnerSearchResult {
  id: string;
  full_name: string;
  email: string;
  program: string | null;
  photo_url: string | null;
  franchise_name: string | null;
  contact_status: string | null;
  in_partner_group: boolean;
}

// ── Helpers ──

async function invoke<T = any>(body: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  return invokeEdgeFunction<T>('manage-partner-groups', body, {
    maxRetries: 1,
    retryDelay: 1500,
  });
}

// ── Fetch partner group for a user ──

export async function fetchPartnerGroup(userId: string): Promise<PartnerGroupData> {
  if (!isValidUUID(userId)) {
    return { group: null, members: [] };
  }

  try {
    const { data, error } = await invoke<{ group: PartnerGroup | null; members: PartnerGroupMember[] }>({
      action: 'fetch',
      user_id: userId,
    });

    if (error) {
      console.error('fetchPartnerGroup error:', error);
      return { group: null, members: [] };
    }

    return {
      group: data?.group || null,
      members: data?.members || [],
    };
  } catch (err) {
    console.error('fetchPartnerGroup exception:', err);
    return { group: null, members: [] };
  }
}

// ── Create a new partner group ──

export async function createPartnerGroup(
  primaryUserId: string,
  memberUserIds: string[] = []
): Promise<{ success: boolean; error?: string; group?: PartnerGroup }> {
  if (!isValidUUID(primaryUserId)) {
    return { success: false, error: 'Invalid primary user ID' };
  }

  try {
    const { data, error } = await invoke<{ group?: PartnerGroup; error?: string }>({
      action: 'create',
      primary_user_id: primaryUserId,
      member_user_ids: memberUserIds,
    });

    if (error) {
      return { success: false, error };
    }

    if (data?.error) {
      return { success: false, error: data.error };
    }

    return { success: true, group: data?.group };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: msg };
  }
}

// ── Add a member to an existing group ──

export async function addPartnerGroupMember(
  groupId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  if (!isValidUUID(groupId) || !isValidUUID(userId)) {
    return { success: false, error: 'Invalid IDs' };
  }

  try {
    const { data, error } = await invoke<{ member?: any; error?: string }>({
      action: 'add_member',
      group_id: groupId,
      user_id: userId,
    });

    if (error) {
      return { success: false, error };
    }

    if (data?.error) {
      return { success: false, error: data.error };
    }

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: msg };
  }
}

// ── Remove a member from a group ──

export async function removePartnerGroupMember(
  groupId: string,
  userId: string
): Promise<{ success: boolean; groupDeleted?: boolean; error?: string }> {
  if (!isValidUUID(groupId) || !isValidUUID(userId)) {
    return { success: false, error: 'Invalid IDs' };
  }

  try {
    const { data, error } = await invoke<{ removed?: boolean; group_deleted?: boolean; error?: string }>({
      action: 'remove_member',
      group_id: groupId,
      user_id: userId,
    });

    if (error) {
      return { success: false, error };
    }

    if (data?.error) {
      return { success: false, error: data.error };
    }

    return { success: true, groupDeleted: data?.group_deleted || false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: msg };
  }
}

// ── Set a member as primary ──

export async function setPartnerGroupPrimary(
  groupId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  if (!isValidUUID(groupId) || !isValidUUID(userId)) {
    return { success: false, error: 'Invalid IDs' };
  }

  try {
    const { data, error } = await invoke<{ success?: boolean; error?: string }>({
      action: 'set_primary',
      group_id: groupId,
      user_id: userId,
    });

    if (error) {
      return { success: false, error };
    }

    if (data?.error) {
      return { success: false, error: data.error };
    }

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: msg };
  }
}

// ── Delete an entire partner group ──

export async function deletePartnerGroup(
  groupId: string
): Promise<{ success: boolean; error?: string }> {
  if (!isValidUUID(groupId)) {
    return { success: false, error: 'Invalid group ID' };
  }

  try {
    const { data, error } = await invoke<{ deleted?: boolean; error?: string }>({
      action: 'delete',
      group_id: groupId,
    });

    if (error) {
      return { success: false, error };
    }

    if (data?.error) {
      return { success: false, error: data.error };
    }

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: msg };
  }
}

// ── Search for potential partners ──
// Uses direct Supabase query against user_profiles as primary method,
// with edge function as fallback. This bypasses edge function auth issues
// and provides reliable search results.

export async function searchPartnerCandidates(
  query: string,
  franchise?: string,
  excludeUserId?: string
): Promise<PartnerSearchResult[]> {
  if (!query || query.length < 2) return [];

  // ── Primary: Direct DB query against user_profiles ──
  try {
    const searchPattern = `%${query}%`;

    let dbQuery = supabase
      .from('user_profiles')
      .select('id, full_name, email, program, photo_url, franchise, contact_status')
      .or(`full_name.ilike.${searchPattern},email.ilike.${searchPattern}`)
      .limit(20);

    // Optionally filter by franchise
    if (franchise) {
      dbQuery = dbQuery.eq('franchise', franchise);
    }

    // Exclude the current user
    if (excludeUserId && isValidUUID(excludeUserId)) {
      dbQuery = dbQuery.neq('id', excludeUserId);
    }

    const { data: profiles, error: dbError } = await dbQuery;

    if (!dbError && profiles && profiles.length > 0) {
      // Check which users are already in a partner group
      const userIds = profiles.map((p: any) => p.id);
      let inGroupSet = new Set<string>();

      try {
        const { data: memberRows } = await supabase
          .from('partner_group_members')
          .select('user_id')
          .in('user_id', userIds);

        if (memberRows && Array.isArray(memberRows)) {
          for (const row of memberRows) {
            if (row.user_id) inGroupSet.add(row.user_id);
          }
        }
      } catch {
        // partner_group_members table may not exist or query may fail — that's OK
        // We'll just mark everyone as not in a group
      }

      return profiles.map((p: any) => ({
        id: p.id,
        full_name: p.full_name || p.email?.split('@')[0] || 'Unknown',
        email: p.email || '',
        program: p.program || null,
        photo_url: p.photo_url || null,
        franchise_name: p.franchise || null,
        contact_status: p.contact_status || null,
        in_partner_group: inGroupSet.has(p.id),
      }));
    }

    // If direct query returned nothing or errored, log and try edge function fallback
    if (dbError) {
      console.log('Direct DB partner search failed, trying edge function:', dbError.message);
    }
  } catch (directErr) {
    console.log('Direct DB partner search exception, trying edge function:', directErr);
  }

  // ── Fallback: Edge function ──
  try {
    const { data, error } = await invoke<{ results: PartnerSearchResult[] }>({
      action: 'search',
      query,
      franchise: franchise || undefined,
      exclude_user_id: excludeUserId || undefined,
    });

    if (error) {
      console.error('searchPartnerCandidates edge function error:', error);
      return [];
    }

    return data?.results || [];
  } catch (err) {
    console.error('searchPartnerCandidates exception:', err);
    return [];
  }
}
