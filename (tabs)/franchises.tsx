import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../constants/theme';
import Header from '../components/Header';
import type { SummaryStat } from '../components/Header';
import SearchBar from '../components/SearchBar';
import FranchiseCard from '../components/FranchiseCard';
import AuthModal from '../components/AuthModal';
import CreateFranchiseModal from '../components/CreateFranchiseModal';
import EditFranchiseModal from '../components/EditFranchiseModal';
import FranchiseDetailModal from '../components/FranchiseDetailModal';
import MoveContactsModal from '../components/MoveContactsModal';
import { Franchise } from '../data/mockData';
import { useAuth } from '../contexts/AuthContext';
import { useImpersonation } from '../contexts/ImpersonationContext';
import { filterFranchises } from '../lib/dataFilters';
import { supabase } from '@/app/lib/supabase';


// Check if an ID looks like a UUID (DB-created)
function isDbId(id: string): boolean {
  return id.length > 10 && id.includes('-');
}

// Real contact counts per franchise
interface FranchiseCounts {
  totalContacts: number;
  activeClients: number;
  staff: number;
  trainers: number;
  dietitians: number;
}


export default function FranchisesScreen() {
  const { profile, showAuthModal, setShowAuthModal } = useAuth();
  const { effectiveProfile, canImpersonate, isImpersonating, startImpersonatingFranchise } = useImpersonation();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'contacts' | 'clients' | 'staff'>('name');
  const [selectedFranchise, setSelectedFranchise] = useState<Franchise | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFranchise, setEditFranchise] = useState<Franchise | null>(null);
  const [dbFranchises, setDbFranchises] = useState<Franchise[]>([]);
  const [assignedManagers, setAssignedManagers] = useState<Map<string, string>>(new Map());
  const [loadingDb, setLoadingDb] = useState(false);

  // Real contact counts from user_profiles
  const [franchiseCounts, setFranchiseCounts] = useState<Map<string, FranchiseCounts>>(new Map());

  // Move contacts modal
  const [showMoveContacts, setShowMoveContacts] = useState(false);
  const [moveContactsFranchise, setMoveContactsFranchise] = useState<Franchise | null>(null);

  // Delete flow state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [franchiseToDelete, setFranchiseToDelete] = useState<Franchise | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteFeedback, setDeleteFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);


  // Toggle active feedback
  const [toggleFeedback, setToggleFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const isAdmin = profile?.role === 'admin';
  const isStaff = profile?.role === 'admin' || profile?.role === 'franchise_manager' || profile?.role === 'trainer' || profile?.role === 'dietitian';
  // Determine the type of the currently selected franchise (all are DB now)
  const selectedFranchiseType = useMemo(() => {
    if (!selectedFranchise) return 'none';
    return isDbId(selectedFranchise.id) ? 'db' : 'unknown';
  }, [selectedFranchise]);


  // Auto-dismiss feedback toasts
  useEffect(() => {
    if (deleteFeedback) {
      const timer = setTimeout(() => setDeleteFeedback(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [deleteFeedback]);

  useEffect(() => {
    if (toggleFeedback) {
      const timer = setTimeout(() => setToggleFeedback(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toggleFeedback]);

  // Helper to extract error messages from edge function responses
  const extractError = async (fnError: any, fallbackMsg: string): Promise<string> => {
    if (fnError?.message) {
      try { const parsed = JSON.parse(fnError.message); if (parsed?.error) return parsed.error; } catch {}
    }
    if (fnError?.context && typeof fnError.context.json === 'function') {
      try { const body = await fnError.context.json(); if (body?.error) return body.error; } catch {}
    }
    return fnError?.message || fallbackMsg;
  };

  // Handle franchise deletion (only for inactive franchises) — uses edge function
  const handleDeleteFranchise = async () => {
    if (!franchiseToDelete) return;

    // Resolve the DB ID — prefer UUID from the franchise object, fallback to dbFranchises lookup
    let dbId = isDbId(franchiseToDelete.id) ? franchiseToDelete.id : null;
    if (!dbId) {
      const match = dbFranchises.find(f => f.name.toLowerCase() === franchiseToDelete.name.toLowerCase());
      if (match && isDbId(match.id)) dbId = match.id;
    }

    if (!dbId) {
      setShowDeleteConfirm(false);
      setFranchiseToDelete(null);
      setDeleteFeedback({ type: 'error', message: 'This franchise does not exist in the database and cannot be deleted.' });
      return;
    }

    setDeleteLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-franchises', {
        body: { action: 'delete', data: { id: dbId } },
      });

      if (error) throw new Error(await extractError(error, 'Failed to delete franchise'));
      if (data?.error) throw new Error(data.error);

      const deletedContacts = data?.deleted_contacts || 0;
      const franchiseName = franchiseToDelete.name;

      setShowDeleteConfirm(false);
      setFranchiseToDelete(null);
      setSelectedFranchise(null);
      await fetchDbFranchises();
      await fetchRealCounts();

      setDeleteFeedback({
        type: 'success',
        message: `"${franchiseName}" has been permanently deleted${deletedContacts > 0 ? ` along with ${deletedContacts} associated contact record${deletedContacts !== 1 ? 's' : ''}` : ''}.`,
      });
    } catch (err: any) {
      console.error('Delete franchise error:', err);
      setShowDeleteConfirm(false);
      setFranchiseToDelete(null);
      setDeleteFeedback({
        type: 'error',
        message: err.message || 'An unexpected error occurred while deleting.',
      });
    } finally {
      setDeleteLoading(false);
    }
  };


  // Handle toggle active/inactive — uses edge function
  const handleToggleActive = async (franchise: Franchise, newIsActive: boolean) => {
    // Resolve the DB ID
    let dbId = isDbId(franchise.id) ? franchise.id : null;
    if (!dbId) {
      const match = dbFranchises.find(f => f.name.toLowerCase() === franchise.name.toLowerCase());
      if (match && isDbId(match.id)) dbId = match.id;
    }

    if (!dbId) {
      setToggleFeedback({ type: 'error', message: 'This franchise does not exist in the database yet. Edit it first to save it to the database.' });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('manage-franchises', {
        body: { action: 'toggle-active', data: { id: dbId, is_active: newIsActive } },
      });

      if (error) throw new Error(await extractError(error, 'Failed to update franchise status'));
      if (data?.error) throw new Error(data.error);

      await fetchDbFranchises();

      // Update the selected franchise's isActive state
      if (selectedFranchise && (selectedFranchise.id === franchise.id || selectedFranchise.name.toLowerCase() === franchise.name.toLowerCase())) {
        setSelectedFranchise({ ...selectedFranchise, isActive: newIsActive });
      }

      setToggleFeedback({
        type: 'success',
        message: `"${franchise.name}" has been ${newIsActive ? 'reactivated' : 'deactivated'}.`,
      });
    } catch (err: any) {
      console.error('Toggle active error:', err);
      setToggleFeedback({
        type: 'error',
        message: err.message || 'Failed to update franchise status.',
      });
    }
  };


  // Fetch real contact counts from the edge function (server-side, using service role key)
  // This is now done inside fetchDbFranchises to avoid a separate query
  const fetchRealCounts = useCallback(async () => {
    // No-op: counts are now fetched as part of fetchDbFranchises
    // This function is kept for backward compatibility with callers
  }, []);





  // Fetch franchises from database + franchise manager assignments from user_profiles
  // Also extracts server-computed contact counts from the edge function response
  const fetchDbFranchises = useCallback(async () => {
    if (!isStaff) return;
    setLoadingDb(true);
    try {
      const [franchiseResult, managerResult] = await Promise.all([
        supabase.functions.invoke('manage-franchises', {
          body: { action: 'list' },
        }),
        supabase
          .from('user_profiles')
          .select('full_name, franchise')
          .eq('role', 'franchise_manager')
          .not('franchise', 'is', null),
      ]);

      const { data, error } = franchiseResult;
      if (error) {
        console.log('Franchise list error:', JSON.stringify(error));
      }
      if (!error && data?.data) {
        const converted: Franchise[] = data.data.map((dbf: any) => ({
          id: dbf.id,
          name: dbf.name,
          city: dbf.city,
          state: dbf.state,
          manager: dbf.manager_name || 'Unassigned',
          managerAvatar: 'https://d64gsuwffb70l.cloudfront.net/698cf5ddf668ea6c9d214f89_1770845766651_5d2978e7.png',
          activeClients: 0,
          totalTrainers: 0,
          status: 'good' as const,
          isActive: dbf.is_active !== false, // default true if null/undefined
        }));

        setDbFranchises(converted);

        // Extract server-computed contact counts (keyed by lowercase franchise name)
        if (data.contactCounts && typeof data.contactCounts === 'object') {
          const countsMap = new Map<string, FranchiseCounts>();
          for (const [key, value] of Object.entries(data.contactCounts)) {
            const v = value as any;
            countsMap.set(key, {
              totalContacts: v.totalContacts || 0,
              activeClients: v.activeClients || 0,
              staff: v.staff || 0,
              trainers: v.trainers || 0,
              dietitians: v.dietitians || 0,
            });
          }
          setFranchiseCounts(countsMap);
          console.log('Franchise counts loaded from server:', countsMap.size, 'franchises');
        }
      }

      if (managerResult.data) {
        const managerMap = new Map<string, string>();
        for (const mgr of managerResult.data) {
          if (mgr.franchise && mgr.full_name) {
            managerMap.set(mgr.franchise.toLowerCase(), mgr.full_name);
          }
        }
        setAssignedManagers(managerMap);
      }
    } catch (err) {
      console.log('Error fetching DB franchises:', err);
    } finally {
      setLoadingDb(false);
    }
  }, [isStaff]);



  useEffect(() => {
    fetchDbFranchises();
    fetchRealCounts();
  }, [fetchDbFranchises, fetchRealCounts]);

  // Use DB franchises directly (no more mock merge), apply manager assignments
  const allFranchises = useMemo(() => {
    return dbFranchises.map(f => {
      const assignedManager = assignedManagers.get(f.name.toLowerCase());
      return assignedManager ? { ...f, manager: assignedManager } : f;
    });
  }, [dbFranchises, assignedManagers]);


  // Helper to get real counts for a franchise
  const getCountsForFranchise = useCallback((franchiseName: string): FranchiseCounts => {
    return franchiseCounts.get(franchiseName.toLowerCase()) || {
      totalContacts: 0,
      activeClients: 0,
      staff: 0,
      trainers: 0,
      dietitians: 0,
    };
  }, [franchiseCounts]);


  const filterProfile = effectiveProfile;
  const roleFilteredFranchises = useMemo(() => filterFranchises(allFranchises, filterProfile), [filterProfile, allFranchises]);


  const sortedFranchises = useMemo(() => {
    let result = [...roleFilteredFranchises];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(f =>
        f.name.toLowerCase().includes(q) ||
        f.city.toLowerCase().includes(q) ||
        f.state.toLowerCase().includes(q) ||
        f.manager.toLowerCase().includes(q)
      );
    }

    // Sort inactive franchises to the bottom
    result.sort((a, b) => {
      const aInactive = a.isActive === false ? 1 : 0;
      const bInactive = b.isActive === false ? 1 : 0;
      if (aInactive !== bInactive) return aInactive - bInactive;

      const aCounts = getCountsForFranchise(a.name);
      const bCounts = getCountsForFranchise(b.name);

      switch (sortBy) {
        case 'contacts': return bCounts.totalContacts - aCounts.totalContacts;
        case 'clients': return bCounts.activeClients - aCounts.activeClients;
        case 'staff': return bCounts.staff - aCounts.staff;
        default: return a.name.localeCompare(b.name);
      }
    });

    return result;
  }, [search, sortBy, roleFilteredFranchises, getCountsForFranchise]);

  // Compute real totals for header stats
  const totalContacts = useMemo(() => {
    let total = 0;
    for (const f of roleFilteredFranchises) {
      total += getCountsForFranchise(f.name).totalContacts;
    }
    return total;
  }, [roleFilteredFranchises, getCountsForFranchise]);

  const totalActiveClients = useMemo(() => {
    let total = 0;
    for (const f of roleFilteredFranchises) {
      total += getCountsForFranchise(f.name).activeClients;
    }
    return total;
  }, [roleFilteredFranchises, getCountsForFranchise]);

  const totalStaff = useMemo(() => {
    let total = 0;
    for (const f of roleFilteredFranchises) {
      total += getCountsForFranchise(f.name).staff;
    }
    return total;
  }, [roleFilteredFranchises, getCountsForFranchise]);

  const headerStats: SummaryStat[] = useMemo(() => [
    { label: 'Locations', value: `${roleFilteredFranchises.length}`, color: COLORS.accentLight },
    { label: 'Contacts', value: totalContacts.toLocaleString(), color: '#85c1e9' },
    { label: 'Clients', value: totalActiveClients.toLocaleString(), color: '#58d68d' },
    { label: 'Staff', value: totalStaff.toLocaleString(), color: '#f5b041' },
  ], [roleFilteredFranchises.length, totalContacts, totalActiveClients, totalStaff]);

  // Real counts for the selected franchise detail modal
  const selectedFranchiseCounts = useMemo(() => {
    if (!selectedFranchise) return undefined;
    return getCountsForFranchise(selectedFranchise.name);
  }, [selectedFranchise, getCountsForFranchise]);


  return (
    <View style={styles.container}>
      <Header
        title="Franchises"
        subtitle={`${roleFilteredFranchises.length} location${roleFilteredFranchises.length !== 1 ? 's' : ''}`}
        summaryStats={headerStats}
      />

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {/* Admin: Create Franchise Button */}
          {isAdmin && (
            <TouchableOpacity
              style={styles.createBtn}
              onPress={() => setShowCreateModal(true)}
              activeOpacity={0.8}
            >
              <View style={styles.createBtnIconCircle}>
                <Ionicons name="add" size={20} color={COLORS.white} />
              </View>
              <View style={styles.createBtnTextWrap}>
                <Text style={styles.createBtnTitle}>Create New Franchise</Text>
                <Text style={styles.createBtnSubtitle}>Add a new franchise location to the system</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.accent} />
            </TouchableOpacity>
          )}

          <SearchBar value={search} onChangeText={setSearch} placeholder="Search franchises, cities, managers..." />

          <View style={styles.sortRow}>
            <Text style={styles.sortLabel}>Sort by:</Text>
            {([
              { label: 'Name', value: 'name' },
              { label: 'Contacts', value: 'contacts' },
              { label: 'Clients', value: 'clients' },
              { label: 'Staff', value: 'staff' },
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

          {loadingDb && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={COLORS.accent} />
              <Text style={styles.loadingText}>Loading franchises...</Text>
            </View>
          )}

          {sortedFranchises.map((f, i) => (
            <FranchiseCard
              key={f.id}
              franchise={f}
              onPress={setSelectedFranchise}
              rank={i + 1}
              realCounts={getCountsForFranchise(f.name)}
            />
          ))}

          {sortedFranchises.length === 0 && !loadingDb && (
            <View style={styles.emptyState}>
              <Ionicons name="business-outline" size={40} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No franchises found</Text>
              <Text style={styles.emptySubtitle}>Try adjusting your search</Text>
            </View>
          )}

          <View style={{ height: 80 }} />
        </View>
      </ScrollView>

      {/* Floating Action Button for Admin */}
      {isAdmin && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setShowCreateModal(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={28} color={COLORS.white} />
        </TouchableOpacity>
      )}

      {/* Franchise Detail Modal */}
      <FranchiseDetailModal
        visible={!!selectedFranchise}
        franchise={selectedFranchise}
        isAdmin={isAdmin}
        canImpersonate={canImpersonate}
        isImpersonating={isImpersonating}
        onClose={() => setSelectedFranchise(null)}
        onEdit={(f) => {
          setEditFranchise(f);
          setShowEditModal(true);
        }}
        onDelete={(f) => {
          setFranchiseToDelete(f);
          setSelectedFranchise(null); // Close detail modal first to avoid nested modal issues
          setTimeout(() => setShowDeleteConfirm(true), 350); // Wait for detail modal close animation
        }}

        onImpersonate={(f) => {
          startImpersonatingFranchise(f);
          setSelectedFranchise(null);
        }}
        onToggleActive={handleToggleActive}
        onMoveContacts={(f) => {
          setMoveContactsFranchise(f);
          setShowMoveContacts(true);
        }}
        realCounts={selectedFranchiseCounts}
      />

      {/* Delete Confirmation Modal - Enhanced with contact warning */}
      <Modal visible={showDeleteConfirm} animationType="fade" transparent statusBarTranslucent>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            {deleteLoading ? (
              <View style={styles.confirmLoadingWrap}>
                <ActivityIndicator size="large" color={COLORS.danger} />
                <Text style={styles.confirmLoadingTitle}>Deleting...</Text>
                <Text style={styles.confirmLoadingSubtitle}>
                  Removing "{franchiseToDelete?.name}" and all associated contacts...
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.confirmIconCircle}>
                  <Ionicons name="warning" size={32} color={COLORS.white} />
                </View>
                <Text style={styles.confirmTitle}>Delete Franchise?</Text>
                <Text style={styles.confirmMessage}>
                  WARNING: Every contact that has not been moved out of this franchise to another will be permanently deleted when this franchise is deleted. Are you sure you want to proceed?
                </Text>

                {franchiseToDelete && (
                  <View style={styles.confirmInfoCard}>
                    <View style={styles.confirmInfoRow}>
                      <Ionicons name="business-outline" size={14} color={COLORS.textSecondary} />
                      <Text style={styles.confirmInfoText}>{franchiseToDelete.name}</Text>
                    </View>
                    <View style={styles.confirmInfoRow}>
                      <Ionicons name="location-outline" size={14} color={COLORS.textSecondary} />
                      <Text style={styles.confirmInfoText}>{franchiseToDelete.city}, {franchiseToDelete.state}</Text>
                    </View>
                    <View style={styles.confirmInfoRow}>
                      <Ionicons name="alert-circle-outline" size={14} color={COLORS.danger} />
                      <Text style={[styles.confirmInfoText, { color: COLORS.danger, fontWeight: '600' }]}>
                        All remaining contacts will be permanently deleted
                      </Text>
                    </View>
                    <View style={styles.confirmInfoRow}>
                      <Ionicons name="information-circle-outline" size={14} color={COLORS.warning} />
                      <Text style={[styles.confirmInfoText, { color: '#92400E', fontWeight: '500' }]}>
                        Use "Move Contacts" to relocate contacts before deleting
                      </Text>
                    </View>
                  </View>
                )}

                <View style={styles.confirmBtnRow}>
                  <TouchableOpacity
                    style={styles.confirmCancelBtn}
                    onPress={() => {
                      setShowDeleteConfirm(false);
                      setFranchiseToDelete(null);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.confirmCancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.confirmDeleteBtn}
                    onPress={handleDeleteFranchise}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="trash" size={16} color={COLORS.white} />
                    <Text style={styles.confirmDeleteBtnText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>


      {/* Move Contacts Modal */}
      <MoveContactsModal
        visible={showMoveContacts}
        franchise={moveContactsFranchise}
        allFranchises={allFranchises}
        onClose={() => {
          setShowMoveContacts(false);
          setMoveContactsFranchise(null);
        }}
        onSuccess={() => {
          fetchDbFranchises();
          fetchRealCounts();
        }}
      />

      {/* Delete Feedback Toast */}
      {deleteFeedback && (
        <View style={[
          styles.feedbackToast,
          deleteFeedback.type === 'success' ? styles.feedbackToastSuccess : styles.feedbackToastError,
        ]}>
          <Ionicons
            name={deleteFeedback.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
            size={20}
            color={COLORS.white}
          />
          <Text style={styles.feedbackToastText}>{deleteFeedback.message}</Text>
          <TouchableOpacity onPress={() => setDeleteFeedback(null)} activeOpacity={0.7}>
            <Ionicons name="close" size={18} color={COLORS.white} />
          </TouchableOpacity>
        </View>
      )}

      {/* Toggle Active Feedback Toast */}
      {toggleFeedback && (
        <View style={[
          styles.feedbackToast,
          toggleFeedback.type === 'success' ? styles.feedbackToastSuccess : styles.feedbackToastError,
        ]}>
          <Ionicons
            name={toggleFeedback.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
            size={20}
            color={COLORS.white}
          />
          <Text style={styles.feedbackToastText}>{toggleFeedback.message}</Text>
          <TouchableOpacity onPress={() => setToggleFeedback(null)} activeOpacity={0.7}>
            <Ionicons name="close" size={18} color={COLORS.white} />
          </TouchableOpacity>
        </View>
      )}


      {/* Create Franchise Modal */}
      <CreateFranchiseModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => {
          fetchDbFranchises();
          fetchRealCounts();
        }}
      />

      {/* Edit Franchise Modal */}
      <EditFranchiseModal
        visible={showEditModal}
        franchise={editFranchise}
        onClose={() => {
          setShowEditModal(false);
          setEditFranchise(null);
        }}
        onSuccess={() => {
          fetchDbFranchises();
          fetchRealCounts();
          setSelectedFranchise(null);
        }}
      />

      <AuthModal visible={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  content: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1.5,
    borderColor: COLORS.accent + '30',
    borderStyle: 'dashed',
    gap: SPACING.md,
    ...SHADOWS.sm,
  },
  createBtnIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createBtnTextWrap: { flex: 1 },
  createBtnTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.primary },
  createBtnSubtitle: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 1 },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginVertical: SPACING.md, flexWrap: 'wrap' },
  sortLabel: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.textSecondary },
  sortChip: { paddingHorizontal: SPACING.md, paddingVertical: 5, borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border },
  sortChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  sortChipText: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.textSecondary },
  sortChipTextActive: { color: COLORS.white },
  loadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, paddingVertical: SPACING.md },
  loadingText: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted, fontWeight: '500' },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: SPACING.sm },
  emptyTitle: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.primary },
  emptySubtitle: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.lg,
  },
  // Delete confirmation modal styles
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 61, 92, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  confirmCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.xxl,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    ...SHADOWS.lg,
  },
  confirmIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.danger,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  confirmTitle: { fontSize: FONT_SIZES.xxl, fontWeight: '800', color: COLORS.primary, marginBottom: SPACING.sm, textAlign: 'center' },
  confirmMessage: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: SPACING.lg },
  confirmInfoCard: { backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, width: '100%', gap: SPACING.sm, marginBottom: SPACING.xl },
  confirmInfoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  confirmInfoText: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, fontWeight: '500', flex: 1 },
  confirmBtnRow: { flexDirection: 'row', gap: SPACING.md, width: '100%' },
  confirmCancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  confirmCancelBtnText: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.textSecondary },
  confirmDeleteBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.danger, ...SHADOWS.md },
  confirmDeleteBtnText: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.white },
  confirmLoadingWrap: { alignItems: 'center', paddingVertical: SPACING.xl, gap: SPACING.md },
  confirmLoadingTitle: { fontSize: FONT_SIZES.xl, fontWeight: '700', color: COLORS.primary },
  confirmLoadingSubtitle: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted, textAlign: 'center' },
  // Feedback toast
  feedbackToast: {
    position: 'absolute',
    bottom: 90,
    left: SPACING.lg,
    right: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    ...SHADOWS.lg,
  },
  feedbackToastSuccess: { backgroundColor: COLORS.success },
  feedbackToastError: { backgroundColor: COLORS.danger },
  feedbackToastText: { flex: 1, fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.white, lineHeight: 18 },
});
