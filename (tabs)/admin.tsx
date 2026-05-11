import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../constants/theme';
import Header from '../components/Header';
import AuthModal from '../components/AuthModal';
import ApprovedEmailForm from '../components/admin/ApprovedEmailForm';
import ApprovedEmailListItem from '../components/admin/ApprovedEmailListItem';
import DatabaseHealthPanel from '../components/admin/DatabaseHealthPanel';
import OrphanedAccountCleanup from '../components/admin/OrphanedAccountCleanup';
import SessionRecordSyncPanel from '../components/admin/SessionRecordSyncPanel';
import EdgeFunctionDiagnosticsPanel from '../components/admin/EdgeFunctionDiagnosticsPanel';



import CreateStaffContactModal from '../components/CreateStaffContactModal';
import { useAuth } from '../contexts/AuthContext';

import {
  ApprovedEmail,
  listApprovedEmails,
  addApprovedEmail,
  deleteApprovedEmail,
} from '../lib/approvedEmailsService';

type FilterType = 'all' | 'unclaimed' | 'claimed';

const FILTER_OPTIONS: { label: string; value: FilterType; icon: string }[] = [
  { label: 'All', value: 'all', icon: 'list' },
  { label: 'Pending', value: 'unclaimed', icon: 'time-outline' },
  { label: 'Claimed', value: 'claimed', icon: 'checkmark-circle-outline' },
];

export default function AdminScreen() {
  const { profile, showAuthModal, setShowAuthModal } = useAuth();

  const isAdmin = profile?.role === 'admin';
  const isFranchiseManager = profile?.role === 'franchise_manager';
  const canAccess = isAdmin || isFranchiseManager;

  const [emails, setEmails] = useState<ApprovedEmail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showCreateStaff, setShowCreateStaff] = useState(false);

  // Franchise managers only see emails for their franchise
  const franchiseScope = isFranchiseManager ? (profile?.franchise || undefined) : undefined;


  const fetchEmails = useCallback(async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    setError('');

    const { data, error: fetchError } = await listApprovedEmails(
      search || undefined,
      filter,
      franchiseScope
    );

    if (fetchError) {
      setError(fetchError);
    } else {
      setEmails(data || []);
    }

    setIsLoading(false);
    setIsRefreshing(false);
  }, [search, filter, franchiseScope]);


  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchEmails();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleAddEmail = async (data: {
    email: string;
    role: string;
    full_name?: string;
    franchise?: string;
  }) => {
    setIsSubmitting(true);
    setError('');
    setSuccessMessage('');

    const { error: addError } = await addApprovedEmail({
      ...data,
      approved_by: profile?.id,
    });

    setIsSubmitting(false);

    if (addError) {
      throw new Error(addError);
    }

    setSuccessMessage(`Successfully approved ${data.email}`);
    setTimeout(() => setSuccessMessage(''), 5000);
    fetchEmails();
  };

  const handleDeleteEmail = async (id: string) => {
    const { success, error: deleteError } = await deleteApprovedEmail(id);

    if (!success || deleteError) {
      Alert.alert('Error', deleteError || 'Failed to delete approved email. Please try again.');
      throw new Error(deleteError || 'Delete failed');
    }

    setEmails((prev) => prev.filter((e) => e.id !== id));
    setSuccessMessage('Email removed successfully');
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const totalCount = emails.length;
  const claimedCount = emails.filter((e) => e.claimed).length;
  const pendingCount = emails.filter((e) => !e.claimed).length;


  if (!canAccess) {
    return (
      <View style={styles.container}>
        <Header title="Admin" subtitle="Access Management" />
        <View style={styles.noAccess}>
          <View style={styles.noAccessIcon}>
            <Ionicons name="lock-closed" size={48} color={COLORS.textMuted} />
          </View>
          <Text style={styles.noAccessTitle}>Access Required</Text>
          <Text style={styles.noAccessSubtitle}>
            This section is only available to administrators and franchise managers.
          </Text>
        </View>
        <AuthModal visible={showAuthModal} onClose={() => setShowAuthModal(false)} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Admin" subtitle={isFranchiseManager ? 'Contact Management' : 'Access Management'} />

      <FlatList
        data={emails}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => fetchEmails(true)}
            tintColor={COLORS.accent}
          />
        }
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Ionicons name="people" size={20} color={COLORS.accent} />
                <Text style={styles.statValue}>{totalCount}</Text>
                <Text style={styles.statLabel}>Total</Text>
              </View>
              <View style={styles.statCard}>
                <Ionicons name="time-outline" size={20} color={COLORS.warning} />
                <Text style={styles.statValue}>{pendingCount}</Text>
                <Text style={styles.statLabel}>Pending</Text>
              </View>
              <View style={styles.statCard}>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                <Text style={styles.statValue}>{claimedCount}</Text>
                <Text style={styles.statLabel}>Claimed</Text>
              </View>
            </View>

            {/* Database Health Panel - Admin only */}
            {isAdmin && <DatabaseHealthPanel />}
            {isAdmin && <OrphanedAccountCleanup />}
            {/* Session Record Sync - Admin and Franchise Managers */}
            {canAccess && <SessionRecordSyncPanel />}

            {/* Edge Function Diagnostics - Admin only */}
            {isAdmin && <EdgeFunctionDiagnosticsPanel />}



            {successMessage ? (
              <View style={styles.successBanner}>
                <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
                <Text style={styles.successText}>{successMessage}</Text>
                <TouchableOpacity onPress={() => setSuccessMessage('')}>
                  <Ionicons name="close" size={16} color={COLORS.success} />
                </TouchableOpacity>
              </View>
            ) : null}

            {error ? (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={18} color={COLORS.danger} />
                <Text style={styles.errorBannerText}>{error}</Text>
                <TouchableOpacity onPress={() => setError('')}>
                  <Ionicons name="close" size={16} color={COLORS.danger} />
                </TouchableOpacity>
              </View>
            ) : null}

            {/* Create Staff Contact Button */}
            <TouchableOpacity
              style={styles.createStaffBtn}
              onPress={() => setShowCreateStaff(true)}
              activeOpacity={0.8}
            >
              <View style={styles.createStaffBtnIcon}>
                <Ionicons name="people-circle" size={22} color={COLORS.white} />
              </View>
              <View style={styles.createStaffBtnTextWrap}>
                <Text style={styles.createStaffBtnTitle}>Create Staff Contact</Text>
                <Text style={styles.createStaffBtnSubtitle}>Add trainer, dietitian, or admin with full profile</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.white} />
            </TouchableOpacity>

            <ApprovedEmailForm onSubmit={handleAddEmail} isSubmitting={isSubmitting} userRole={profile?.role} userFranchise={profile?.franchise} />


            <View style={styles.searchSection}>
              <Text style={styles.sectionTitle}>Approved Emails</Text>

              <View style={styles.searchRow}>
                <View style={styles.searchInput}>
                  <Ionicons name="search" size={18} color={COLORS.textMuted} />
                  <TextInput
                    style={styles.searchTextInput}
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search by email, name, or franchise..."
                    placeholderTextColor={COLORS.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {search ? (
                    <TouchableOpacity onPress={() => setSearch('')}>
                      <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              <View style={styles.filterRow}>
                {FILTER_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.filterChip, filter === opt.value && styles.filterChipActive]}
                    onPress={() => setFilter(opt.value)}
                  >
                    <Ionicons
                      name={opt.icon as any}
                      size={14}
                      color={filter === opt.value ? COLORS.white : COLORS.textSecondary}
                    />
                    <Text
                      style={[
                        styles.filterChipText,
                        filter === opt.value && styles.filterChipTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.listItem}>
            <ApprovedEmailListItem
              item={item}
              onDelete={handleDeleteEmail}
              onInviteSent={() => fetchEmails()}
            />
          </View>
        )}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color={COLORS.accent} />
              <Text style={styles.loadingText}>Loading approved emails...</Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="mail-unread-outline" size={48} color={COLORS.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>
                {search || filter !== 'all' ? 'No matching emails found' : 'No approved emails yet'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {search || filter !== 'all'
                  ? 'Try adjusting your search or filters'
                  : 'Add email addresses above to pre-approve users for app access'}
              </Text>
            </View>
          )
        }
        ListFooterComponent={<View style={{ height: 40 }} />}
      />

      {/* Staff Contact Creation Modal */}
      <CreateStaffContactModal
        visible={showCreateStaff}
        onClose={() => setShowCreateStaff(false)}
        onSuccess={() => {
          fetchEmails();
          setSuccessMessage('Staff contact created successfully');
          setTimeout(() => setSuccessMessage(''), 5000);
        }}
        adminId={profile?.id}
      />

      <AuthModal visible={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  listContent: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },
  statsRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  statCard: { flex: 1, backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, padding: SPACING.sm, alignItems: 'center', gap: 2, ...SHADOWS.sm },
  statValue: { fontSize: FONT_SIZES.xl, fontWeight: '800', color: COLORS.primary },
  statLabel: { fontSize: 9, fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  successBanner: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.successLight, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md },
  successText: { flex: 1, fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.success },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.dangerLight, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md },
  errorBannerText: { flex: 1, fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.danger },
  // Create Staff Button
  createStaffBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    gap: SPACING.md,
    ...SHADOWS.md,
  },
  createStaffBtnIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  createStaffBtnTextWrap: { flex: 1 },
  createStaffBtnTitle: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.white },
  createStaffBtnSubtitle: { fontSize: FONT_SIZES.xs, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  searchSection: { marginTop: SPACING.lg, marginBottom: SPACING.md },
  sectionTitle: { fontSize: FONT_SIZES.xl, fontWeight: '800', color: COLORS.primary, marginBottom: SPACING.md },
  searchRow: { marginBottom: SPACING.sm },
  searchInput: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md, height: 42, gap: SPACING.sm, ...SHADOWS.sm },
  searchTextInput: { flex: 1, fontSize: FONT_SIZES.md, color: COLORS.text, height: 42 },
  filterRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border },
  filterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterChipText: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.textSecondary },
  filterChipTextActive: { color: COLORS.white },
  listItem: { marginBottom: SPACING.sm },
  loadingState: { alignItems: 'center', paddingVertical: 60, gap: SPACING.md },
  loadingText: { fontSize: FONT_SIZES.md, color: COLORS.textMuted },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.borderLight, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.lg },
  emptyTitle: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.primary, marginBottom: SPACING.xs },
  emptySubtitle: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted, textAlign: 'center', maxWidth: 280 },
  noAccess: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: SPACING.xxxl },
  noAccessIcon: { width: 96, height: 96, borderRadius: 48, backgroundColor: COLORS.borderLight, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.xl },
  noAccessTitle: { fontSize: FONT_SIZES.xxl, fontWeight: '800', color: COLORS.primary, marginBottom: SPACING.sm },
  noAccessSubtitle: { fontSize: FONT_SIZES.md, color: COLORS.textMuted, textAlign: 'center' },
});

