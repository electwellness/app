import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../constants/theme';
import Header from '../components/Header';
import type { SummaryStat } from '../components/Header';
import SearchBar from '../components/SearchBar';
import CoachCard from '../components/CoachCard';
import type { CoachItem } from '../components/CoachCard';
import AuthModal from '../components/AuthModal';
import StaffProfileModal from '../components/StaffProfileModal';
import type { SaveResult } from '../components/StaffProfileModal';
import type { Trainer, Dietitian, CertificationWithExpiry } from '../data/mockData';


import { useAuth } from '../contexts/AuthContext';
import { useImpersonation } from '../contexts/ImpersonationContext';
import { filterTrainers, filterDietitians } from '../lib/dataFilters';
import { supabase } from '../lib/supabase';
import { fetchClientReviews } from '../lib/clientReviewService';

type CoachTypeFilter = 'all' | 'trainers' | 'dietitians';
type SortOption = 'rating' | 'clients' | 'experience' | 'name';

// ── DB → Trainer/Dietitian mapping helpers ───────────────────────────────────

/** Map a staff_contacts row to a Trainer object */
function staffContactToTrainer(row: any): Trainer {
  return {
    id: row.id,
    name: row.name || '',
    avatar: row.avatar || '',
    franchise: row.franchise || 'Unassigned',
    specialties: Array.isArray(row.specialties) ? row.specialties : [],
    certifications: Array.isArray(row.certifications)
      ? row.certifications.map((c: any) => ({
          name: c.name || c,
          expirationDate: c.expirationDate || c.expiration_date || '2099-12-31',
        }))
      : [],
    activeClients: row.active_clients ?? 0,
    maxClients: row.max_clients ?? 20,
    rating: parseFloat(row.rating) || 0,
    totalReviews: row.total_reviews ?? 0,
    sessionsThisMonth: row.sessions_this_month ?? 0,
    revenueGenerated: parseFloat(row.revenue_generated) || 0,
    yearsExperience: row.years_experience ?? 0,
    bonusEarned: parseFloat(row.bonus_earned) || 0,
    status: row.status === 'inactive' ? 'inactive' : 'active',
    hireDate: row.hire_date || row.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
    email: row.email || '',
    address: row.address || '',
    phone: row.phone || '',
    birthday: row.birthday ? row.birthday.split('T')[0] : '',

    inFacebookGroup: row.in_facebook_group ?? false,
    reviewCredits: row.review_credits ?? 0,
    referralCredits: row.referral_credits ?? 0,
    returnCredits: row.return_credits ?? 0,
  };
}

/** Map a staff_contacts row to a Dietitian object */
function staffContactToDietitian(row: any): Dietitian {
  return {
    id: row.id,
    name: row.name || '',
    avatar: row.avatar || '',
    franchise: row.franchise || 'Unassigned',
    specialties: Array.isArray(row.specialties) ? row.specialties : [],
    certifications: Array.isArray(row.certifications)
      ? row.certifications.map((c: any) => ({
          name: c.name || c,
          expirationDate: c.expirationDate || c.expiration_date || '2099-12-31',
        }))
      : [],
    activeClients: row.active_clients ?? 0,
    maxClients: row.max_clients ?? 20,
    rating: parseFloat(row.rating) || 0,
    totalReviews: row.total_reviews ?? 0,
    yearsExperience: row.years_experience ?? 0,
    status: row.status === 'inactive' ? 'inactive' : 'active',
    hireDate: row.hire_date || row.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
    email: row.email || '',
    address: row.address || '',
    phone: row.phone || '',
    birthday: row.birthday ? row.birthday.split('T')[0] : '',

    inFacebookGroup: row.in_facebook_group ?? false,
    reviewCredits: row.review_credits ?? 0,
    referralCredits: row.referral_credits ?? 0,
    returnCredits: row.return_credits ?? 0,
  };
}

/** Map a user_profiles row (fallback) to a Trainer object */
function userProfileToTrainer(row: any): Trainer {
  return {
    id: row.id,
    name: row.full_name || row.email?.split('@')[0] || 'Unknown',
    avatar: row.photo_url || '',
    franchise: row.franchise || 'Unassigned',
    specialties: [],
    certifications: [],
    activeClients: 0,
    maxClients: 20,
    rating: 0,
    totalReviews: 0,
    sessionsThisMonth: 0,
    revenueGenerated: 0,
    yearsExperience: 0,
    bonusEarned: 0,
    status: (row.contact_status === 'former-staff') ? 'inactive' : 'active',
    hireDate: row.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
    email: row.email || '',
    address: row.address || '',
    phone: row.phone || '',
    birthday: row.birthdate ? row.birthdate.split('T')[0] : '',

    inFacebookGroup: row.in_facebook_group ?? false,
    reviewCredits: 0,
    referralCredits: 0,
    returnCredits: 0,
  };
}

/** Map a user_profiles row (fallback) to a Dietitian object */
function userProfileToDietitian(row: any): Dietitian {
  return {
    id: row.id,
    name: row.full_name || row.email?.split('@')[0] || 'Unknown',
    avatar: row.photo_url || '',
    franchise: row.franchise || 'Unassigned',
    specialties: [],
    certifications: [],
    activeClients: 0,
    maxClients: 20,
    rating: 0,
    totalReviews: 0,
    yearsExperience: 0,
    status: (row.contact_status === 'former-staff') ? 'inactive' : 'active',
    hireDate: row.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
    email: row.email || '',
    address: row.address || '',
    phone: row.phone || '',
    birthday: row.birthdate ? row.birthdate.split('T')[0] : '',

    inFacebookGroup: row.in_facebook_group ?? false,
    reviewCredits: 0,
    referralCredits: 0,
    returnCredits: 0,
  };
}

export default function CoachesScreen() {
  const { profile, showAuthModal, setShowAuthModal } = useAuth();
  const { effectiveProfile, canImpersonate, isImpersonating, startImpersonatingCoach } = useImpersonation();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<CoachTypeFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('rating');
  const [selectedCoach, setSelectedCoach] = useState<CoachItem | null>(null);

  // Local mutable copies of data for editing
  const [trainerData, setTrainerData] = useState<Trainer[]>([]);
  const [dietitianData, setDietitianData] = useState<Dietitian[]>([]);

  // Loading and error states
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // ── Fetch coaches from database ──────────────────────────────────────────
  const fetchCoaches = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);

    try {
      // 1. Fetch from staff_contacts (primary source — has full coach data)
      const { data: staffRows, error: staffError } = await supabase
        .from('staff_contacts')
        .select('*')
        .in('role', ['trainer', 'dietitian'])
        .order('name', { ascending: true });

      if (staffError) {
        console.log('staff_contacts query error:', staffError.message);
      }

      const staffTrainers: Trainer[] = [];
      const staffDietitians: Dietitian[] = [];
      const staffUserIds = new Set<string>();

      if (staffRows && Array.isArray(staffRows)) {
        for (const row of staffRows) {
          if (row.user_id) staffUserIds.add(row.user_id);
          if (row.role === 'trainer') {
            staffTrainers.push(staffContactToTrainer(row));
          } else if (row.role === 'dietitian') {
            staffDietitians.push(staffContactToDietitian(row));
          }
        }
      }

      // 2. Fetch from user_profiles as fallback (for staff without staff_contacts records)
      const { data: profileRows, error: profileError } = await supabase
        .from('user_profiles')
        .select('id, email, full_name, role, franchise, phone, address, birthdate, in_facebook_group, photo_url, contact_status, created_at')
        .in('role', ['trainer', 'dietitian'])
        .order('full_name', { ascending: true });

      if (profileError) {
        console.log('user_profiles query error:', profileError.message);
      }

      // Only add user_profiles records that don't already have a staff_contacts entry
      const fallbackTrainers: Trainer[] = [];
      const fallbackDietitians: Dietitian[] = [];

      if (profileRows && Array.isArray(profileRows)) {
        for (const row of profileRows) {
          // Skip if this user already has a staff_contacts record
          if (staffUserIds.has(row.id)) continue;

          if (row.role === 'trainer') {
            fallbackTrainers.push(userProfileToTrainer(row));
          } else if (row.role === 'dietitian') {
            fallbackDietitians.push(userProfileToDietitian(row));
          }
        }
      }

      // 3. Merge: staff_contacts first, then fallback user_profiles
      let allTrainers = [...staffTrainers, ...fallbackTrainers];
      let allDietitians = [...staffDietitians, ...fallbackDietitians];

      // 4. Fetch all client reviews to compute per-coach rating & review count
      //    Reviews are linked to coaches by name via creditedTrainer / creditedDietitian fields
      try {
        const reviewResult = await fetchClientReviews({ limit: 2000 });
        if (reviewResult.success && reviewResult.reviews.length > 0) {
          // Build per-coach stats: { coachName -> { totalRating, ratedCount, totalCount } }
          const trainerStats: Record<string, { totalRating: number; ratedCount: number; totalCount: number }> = {};
          const dietitianStats: Record<string, { totalRating: number; ratedCount: number; totalCount: number }> = {};

          for (const review of reviewResult.reviews) {
            if (review.creditedTrainer) {
              const name = review.creditedTrainer;
              if (!trainerStats[name]) trainerStats[name] = { totalRating: 0, ratedCount: 0, totalCount: 0 };
              trainerStats[name].totalCount += 1;
              if (review.starRating != null && review.starRating > 0) {
                trainerStats[name].totalRating += review.starRating;
                trainerStats[name].ratedCount += 1;
              }
            }
            if (review.creditedDietitian) {
              const name = review.creditedDietitian;
              if (!dietitianStats[name]) dietitianStats[name] = { totalRating: 0, ratedCount: 0, totalCount: 0 };
              dietitianStats[name].totalCount += 1;
              if (review.starRating != null && review.starRating > 0) {
                dietitianStats[name].totalRating += review.starRating;
                dietitianStats[name].ratedCount += 1;
              }
            }
          }

          // Apply computed stats to trainers
          allTrainers = allTrainers.map(t => {
            const stats = trainerStats[t.name];
            if (stats) {
              return {
                ...t,
                totalReviews: stats.totalCount,
                rating: stats.ratedCount > 0
                  ? parseFloat((stats.totalRating / stats.ratedCount).toFixed(1))
                  : t.rating,
              };
            }
            return t;
          });

          // Apply computed stats to dietitians
          allDietitians = allDietitians.map(d => {
            const stats = dietitianStats[d.name];
            if (stats) {
              return {
                ...d,
                totalReviews: stats.totalCount,
                rating: stats.ratedCount > 0
                  ? parseFloat((stats.totalRating / stats.ratedCount).toFixed(1))
                  : d.rating,
              };
            }
            return d;
          });

          console.log(`Review stats applied: ${Object.keys(trainerStats).length} trainers, ${Object.keys(dietitianStats).length} dietitians with reviews`);
        }
      } catch (reviewErr) {
        console.log('Non-fatal: failed to fetch reviews for coach stats:', reviewErr);
        // Reviews are supplementary — don't block coach loading if this fails
      }

      setTrainerData(allTrainers);
      setDietitianData(allDietitians);

      // If both queries failed, show error
      if (staffError && profileError) {
        setFetchError('Unable to load coaches. Please check your connection and try again.');
      }

      console.log(`Coaches loaded: ${allTrainers.length} trainers, ${allDietitians.length} dietitians (${staffTrainers.length + staffDietitians.length} from staff_contacts, ${fallbackTrainers.length + fallbackDietitians.length} from user_profiles)`);

    } catch (err: any) {
      console.log('Exception fetching coaches:', err);
      setFetchError(err.message || 'An unexpected error occurred while loading coaches.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCoaches();
  }, [fetchCoaches]);

  // Use effective profile for data filtering (impersonated or real)
  const filterProfile = effectiveProfile;
  const roleFilteredTrainers = useMemo(() => filterTrainers(trainerData, filterProfile), [filterProfile, trainerData]);
  const roleFilteredDietitians = useMemo(() => filterDietitians(dietitianData, filterProfile), [filterProfile, dietitianData]);



  // Combine into unified coach list
  const allCoaches: CoachItem[] = useMemo(() => {
    const trainerItems: CoachItem[] = roleFilteredTrainers.map(t => ({ coachType: 'trainer', data: t }));
    const dietitianItems: CoachItem[] = roleFilteredDietitians.map(d => ({ coachType: 'dietitian', data: d }));
    return [...trainerItems, ...dietitianItems];
  }, [roleFilteredTrainers, roleFilteredDietitians]);

  const filteredCoaches = useMemo(() => {
    let result = [...allCoaches];

    // Type filter
    if (typeFilter === 'trainers') {
      result = result.filter(c => c.coachType === 'trainer');
    } else if (typeFilter === 'dietitians') {
      result = result.filter(c => c.coachType === 'dietitian');
    }

    // Search
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        c.data.name.toLowerCase().includes(q) ||
        c.data.franchise.toLowerCase().includes(q) ||
        c.data.specialties.some(s => s.toLowerCase().includes(q)) ||
        c.data.certifications.some(cert => cert.name.toLowerCase().includes(q)) ||
        c.data.email.toLowerCase().includes(q) ||
        c.coachType.toLowerCase().includes(q)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(c => c.data.status === statusFilter);
    }

    // Sort
    switch (sortBy) {
      case 'clients':
        result.sort((a, b) => b.data.activeClients - a.data.activeClients);
        break;
      case 'experience':
        result.sort((a, b) => b.data.yearsExperience - a.data.yearsExperience);
        break;
      case 'name':
        result.sort((a, b) => a.data.name.localeCompare(b.data.name));
        break;
      default:
        result.sort((a, b) => b.data.rating - a.data.rating);
    }

    return result;
  }, [search, statusFilter, typeFilter, sortBy, allCoaches]);

  // Summary stats
  const trainerCount = roleFilteredTrainers.length;
  const dietitianCount = roleFilteredDietitians.length;
  const totalCoaches = trainerCount + dietitianCount;
  const avgRating = totalCoaches > 0
    ? (allCoaches.reduce((s, c) => s + c.data.rating, 0) / totalCoaches).toFixed(1)
    : '0';
  const totalClients = allCoaches.reduce((s, c) => s + c.data.activeClients, 0);

  // Summary stats for header bar
  const headerStats: SummaryStat[] = useMemo(() => [
    { label: 'Trainers', value: `${trainerCount}`, color: COLORS.accentLight },
    { label: 'Dietitians', value: `${dietitianCount}`, color: '#c39bd3' },
    { label: 'Avg Rating', value: avgRating, color: '#f5b041' },
    { label: 'Clients', value: `${totalClients}`, color: '#58d68d' },
  ], [trainerCount, dietitianCount, avgRating, totalClients]);

  const handleOpenProfile = (coach: CoachItem) => {
    setSelectedCoach(coach);
  };

  const handleCloseProfile = () => {
    setSelectedCoach(null);
  };

  // ── Save handler: persist to staff_contacts DB, update local state, refresh ──
  const handleSaveProfile = useCallback(async (
    coachType: 'trainer' | 'dietitian',
    id: string,
    updatedFields: Partial<Trainer & Dietitian> & { _newRole?: 'trainer' | 'dietitian' },
  ): Promise<SaveResult> => {
    try {
      // Detect role change: _newRole is set by StaffProfileModal when role was changed
      const newRole = updatedFields._newRole || coachType;
      const roleChanged = !!updatedFields._newRole;

      // Clean up the _newRole field before saving to DB
      const { _newRole, ...cleanFields } = updatedFields;

      // Map camelCase Trainer/Dietitian fields → snake_case staff_contacts columns
      const dbPayload: Record<string, any> = {
        name: cleanFields.name,
        email: cleanFields.email,
        phone: cleanFields.phone || null,
        address: cleanFields.address || null,
        birthday: cleanFields.birthday || null,
        status: cleanFields.status,
        in_facebook_group: cleanFields.inFacebookGroup ?? false,
        certifications: cleanFields.certifications
          ? cleanFields.certifications.map(c => ({
              name: c.name,
              expirationDate: c.expirationDate,
            }))
          : [],
        review_credits: cleanFields.reviewCredits ?? 0,
        referral_credits: cleanFields.referralCredits ?? 0,
        return_credits: cleanFields.returnCredits ?? 0,
        updated_at: new Date().toISOString(),
      };

      // Include role in the payload if it changed
      if (roleChanged) {
        dbPayload.role = newRole;
      }

      console.log(`Saving coach profile (${coachType}${roleChanged ? ` → ${newRole}` : ''}) id=${id}`, dbPayload);

      // 1. Try to UPDATE the existing staff_contacts row by id
      const { data: updateData, error: updateError } = await supabase
        .from('staff_contacts')
        .update(dbPayload)
        .eq('id', id)
        .select('id');

      if (updateError) {
        console.error('staff_contacts update error:', updateError.message);
        // If the error is because the row doesn't exist (e.g. coach came from user_profiles fallback),
        // try to INSERT a new staff_contacts row instead
        if (updateError.code === 'PGRST116' || updateError.message.includes('0 rows')) {
          // Fall through to insert logic below
        } else {
          return { success: false, error: `Database error: ${updateError.message}` };
        }
      }

      // 2. If update returned no rows (coach was from user_profiles fallback), INSERT a new record
      const updatedRows = updateData?.length ?? 0;
      if (updatedRows === 0 && !updateError) {
        console.log('No staff_contacts row matched — inserting new record with user_id =', id);
        const insertPayload = {
          ...dbPayload,
          user_id: id,
          role: newRole,
        };
        const { error: insertError } = await supabase
          .from('staff_contacts')
          .insert(insertPayload);

        if (insertError) {
          console.error('staff_contacts insert error:', insertError.message);
          return { success: false, error: `Failed to create staff record: ${insertError.message}` };
        }
      }

      // 2b. If role changed, also update user_profiles.role
      if (roleChanged) {
        const { error: profileUpdateError } = await supabase
          .from('user_profiles')
          .update({ role: newRole })
          .eq('id', id);

        if (profileUpdateError) {
          console.warn('user_profiles role update warning:', profileUpdateError.message);
          // Non-fatal: the staff_contacts role is the primary source of truth
        }
      }

      // 3. Update local state optimistically so the UI reflects changes immediately
      if (roleChanged) {
        // Role changed: remove from the old array and add to the new one
        const originalRole = coachType === newRole
          ? (newRole === 'trainer' ? 'dietitian' : 'trainer') // shouldn't happen, but fallback
          : (newRole === 'trainer' ? 'dietitian' : 'trainer'); // the original role is the opposite of newRole

        // Find the coach in BOTH arrays (it could be in either)
        const existingTrainer = trainerData.find(t => t.id === id);
        const existingDietitian = dietitianData.find(d => d.id === id);
        const existingData = existingTrainer || existingDietitian;

        if (existingData) {
          const mergedData = { ...existingData, ...cleanFields };

          if (newRole === 'trainer') {
            // Remove from dietitians, add to trainers
            setDietitianData(prev => prev.filter(d => d.id !== id));
            setTrainerData(prev => {
              const withoutOld = prev.filter(t => t.id !== id);
              return [...withoutOld, mergedData as Trainer];
            });
            setSelectedCoach({ coachType: 'trainer', data: mergedData as Trainer });
          } else {
            // Remove from trainers, add to dietitians
            setTrainerData(prev => prev.filter(t => t.id !== id));
            setDietitianData(prev => {
              const withoutOld = prev.filter(d => d.id !== id);
              return [...withoutOld, mergedData as Dietitian];
            });
            setSelectedCoach({ coachType: 'dietitian', data: mergedData as Dietitian });
          }
        }
      } else {
        // No role change: update in the same array as before
        if (coachType === 'trainer') {
          setTrainerData(prev => {
            const updated = prev.map(t => t.id === id ? { ...t, ...cleanFields } : t);
            const updatedCoach = updated.find(t => t.id === id);
            if (updatedCoach) {
              setSelectedCoach({ coachType: 'trainer', data: updatedCoach });
            }
            return updated;
          });
        } else {
          setDietitianData(prev => {
            const updated = prev.map(d => d.id === id ? { ...d, ...cleanFields } : d);
            const updatedCoach = updated.find(d => d.id === id);
            if (updatedCoach) {
              setSelectedCoach({ coachType: 'dietitian', data: updatedCoach });
            }
            return updated;
          });
        }
      }

      // 4. Refresh the full coaches list in the background to pick up any server-side changes
      setTimeout(() => fetchCoaches(), 500);

      console.log(`Coach profile saved successfully (${coachType}${roleChanged ? ` → role changed to ${newRole}` : ''}) id=${id}`);
      return { success: true };
    } catch (err: any) {
      console.error('handleSaveProfile exception:', err);
      return { success: false, error: err.message || 'An unexpected error occurred while saving.' };
    }
  }, [fetchCoaches, trainerData, dietitianData]);



  return (
    <View style={styles.container}>
      <Header
        title="Coaches"
        subtitle={`${totalCoaches} team member${totalCoaches !== 1 ? 's' : ''}`}
        summaryStats={headerStats}
      />

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <SearchBar value={search} onChangeText={setSearch} placeholder="Search coaches, specialties, email..." />

          {/* Type Filter Toggle */}
          <View style={styles.typeToggleRow}>
            {([
              { label: 'All', value: 'all', icon: 'people' },
              { label: 'Trainers', value: 'trainers', icon: 'fitness' },
              { label: 'Dietitians', value: 'dietitians', icon: 'nutrition' },
            ] as const).map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.typeToggle, typeFilter === opt.value && styles.typeToggleActive]}
                onPress={() => setTypeFilter(opt.value)}
              >
                <Ionicons
                  name={opt.icon as any}
                  size={14}
                  color={typeFilter === opt.value ? COLORS.white : COLORS.textSecondary}
                />
                <Text style={[styles.typeToggleText, typeFilter === opt.value && styles.typeToggleTextActive]}>
                  {opt.label}
                </Text>
                <View style={[styles.typeCount, typeFilter === opt.value && styles.typeCountActive]}>
                  <Text style={[styles.typeCountText, typeFilter === opt.value && styles.typeCountTextActive]}>
                    {opt.value === 'all' ? totalCoaches : opt.value === 'trainers' ? trainerCount : dietitianCount}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* Status Filter */}
          <View style={styles.filterRow}>
            <View style={styles.filterGroup}>
              {[
                { label: 'All', value: 'all' },
                { label: 'Active', value: 'active' },
                { label: 'Inactive', value: 'inactive' },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.chip, statusFilter === opt.value && styles.chipActive]}
                  onPress={() => setStatusFilter(opt.value)}
                >
                  <Text style={[styles.chipText, statusFilter === opt.value && styles.chipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Sort */}
          <View style={styles.sortRow}>
            <Text style={styles.sortLabel}>Sort:</Text>
            {([
              { label: 'Rating', value: 'rating' },
              { label: 'Clients', value: 'clients' },
              { label: 'Experience', value: 'experience' },
              { label: 'Name', value: 'name' },
            ] as const).map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.sortChip, sortBy === opt.value && styles.sortChipActive]}
                onPress={() => setSortBy(opt.value)}
              >
                <Text style={[styles.sortChipText, sortBy === opt.value && styles.sortChipTextActive]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {/* Loading State */}
          {isLoading && (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color={COLORS.accent} />
              <Text style={styles.loadingText}>Loading coaches...</Text>
            </View>
          )}

          {/* Error State */}
          {!isLoading && fetchError && (
            <View style={styles.errorState}>
              <View style={styles.errorIconWrap}>
                <Ionicons name="cloud-offline-outline" size={40} color={COLORS.danger} />
              </View>
              <Text style={styles.errorTitle}>Failed to Load Coaches</Text>
              <Text style={styles.errorMessage}>{fetchError}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={fetchCoaches} activeOpacity={0.7}>
                <Ionicons name="refresh-outline" size={16} color={COLORS.white} />
                <Text style={styles.retryBtnText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Results count */}
          {!isLoading && !fetchError && (
            <Text style={styles.resultsText}>
              {filteredCoaches.length} coach{filteredCoaches.length !== 1 ? 'es' : ''} found
            </Text>
          )}

          {/* Coach Cards */}
          {!isLoading && !fetchError && filteredCoaches.map((c) => (
            <CoachCard key={`${c.coachType}-${c.data.id}`} coach={c} onPress={handleOpenProfile} />
          ))}

          {!isLoading && !fetchError && filteredCoaches.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={40} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No coaches found</Text>
              <Text style={styles.emptySubtitle}>
                {totalCoaches === 0
                  ? 'No trainers or dietitians have been added yet'
                  : 'Try adjusting your search or filters'}
              </Text>
              {totalCoaches > 0 && (search || statusFilter !== 'all' || typeFilter !== 'all') && (
                <TouchableOpacity
                  style={styles.resetFiltersBtn}
                  onPress={() => { setSearch(''); setStatusFilter('all'); setTypeFilter('all'); }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="refresh-outline" size={14} color={COLORS.white} />
                  <Text style={styles.resetFiltersBtnText}>Reset Filters</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <View style={{ height: 20 }} />

        </View>
      </ScrollView>

      {/* Staff Profile Modal with Edit Support */}
      <StaffProfileModal
        visible={!!selectedCoach}
        coach={selectedCoach}
        onClose={handleCloseProfile}
        onSave={handleSaveProfile}
      />

      <AuthModal visible={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  content: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },
  typeToggleRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  typeToggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  typeToggleActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  typeToggleText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  typeToggleTextActive: {
    color: COLORS.white,
  },
  typeCount: {
    backgroundColor: COLORS.borderLight,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 20,
    alignItems: 'center',
  },
  typeCountActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  typeCountText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textMuted,
  },
  typeCountTextActive: {
    color: COLORS.white,
  },
  filterRow: { marginTop: SPACING.sm },
  filterGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.textSecondary },
  chipTextActive: { color: COLORS.white },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginVertical: SPACING.md,
    flexWrap: 'wrap',
  },
  sortLabel: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.textSecondary },
  sortChip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: COLORS.background,
  },
  sortChipActive: { backgroundColor: COLORS.accent + '18' },
  sortChipText: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: COLORS.textMuted },
  sortChipTextActive: { color: COLORS.accent },
  resultsText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '500',
    marginBottom: SPACING.md,
  },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: SPACING.sm },
  emptyTitle: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.primary },
  emptySubtitle: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted, textAlign: 'center', paddingHorizontal: SPACING.xl },
  resetFiltersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.accent,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.md,
  },
  resetFiltersBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.white,
  },
  loadingState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: SPACING.md,
  },
  loadingText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  errorState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: SPACING.sm,
  },
  errorIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.dangerLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  errorTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.danger,
  },
  errorMessage: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingHorizontal: SPACING.xxl,
    lineHeight: 18,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.accent,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.md,
    ...SHADOWS.sm,
  },
  retryBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.white,
  },
});
