import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../../constants/theme';
import { supabase } from '../../lib/supabase';

// ── Types ────────────────────────────────────────────────────────────────────

interface ReferralClient {
  id: string;
  full_name: string | null;
  email: string | null;
  photo_url: string | null;
  contact_status: string | null;
  franchise: string | null;
  program: string | null;
  created_at: string | null;
  /** Which credit column matched: 'trainer' or 'dietitian' */
  creditType: 'trainer' | 'dietitian';
}

interface ReturnRecord {
  id: string;
  client_id: string;
  return_date: string | null;
  credited_trainer: string | null;
  credited_dietitian: string | null;
  notes: string | null;
  franchise: string | null;
  credit_type: 'trainer' | 'dietitian';
  created_at: string | null;
  // Resolved client info
  client_name: string | null;
  client_photo_url: string | null;
  client_contact_status: string | null;
}

interface Props {
  staffId: string;
  staffName: string;
  coachType: 'trainer' | 'dietitian';
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  'active-client': { label: 'Active Client', color: '#2ecc71', icon: 'person' },
  'former-client': { label: 'Former Client', color: '#8B5CF6', icon: 'person-outline' },
  'active-jumpstart': { label: 'Active Jumpstart', color: '#f39c12', icon: 'flash' },
  'failed-jumpstart': { label: 'Failed Jumpstart', color: '#e74c3c', icon: 'flash-off' },
  'referring-partner': { label: 'Referring Partner', color: '#9b59b6', icon: 'people' },
  'active-staff': { label: 'Active Staff', color: '#0E8AC8', icon: 'briefcase' },
  'former-staff': { label: 'Former Staff', color: '#8fa4b5', icon: 'briefcase-outline' },
};

const ACTIVE_STATUSES = ['active-client', 'active-jumpstart'];

const RETURN_BADGE_COLOR = '#16a085'; // Teal for returns

// ── Component ────────────────────────────────────────────────────────────────

export default function StaffReferralsPanel({ staffId, staffName, coachType }: Props) {
  const [referrals, setReferrals] = useState<ReferralClient[]>([]);
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [returnsLoading, setReturnsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch Referrals (only credited referrals) ──

  const fetchReferrals = useCallback(async () => {
    if (!staffName) return;
    setLoading(true);
    setError(null);

    try {
      const seenIds = new Set<string>();
      const results: ReferralClient[] = [];

      // Fetch clients credited to this staff member via referral_credit_trainer
      const { data: trainerCreditData, error: trainerCreditError } = await supabase
        .from('user_profiles')
        .select('id, full_name, email, photo_url, contact_status, franchise, program, created_at')
        .eq('referral_credit_trainer', staffName);

      if (trainerCreditError) {
        console.warn('Error fetching trainer referral credits:', trainerCreditError.message);
      }

      if (trainerCreditData && Array.isArray(trainerCreditData)) {
        for (const row of trainerCreditData) {
          if (!seenIds.has(row.id)) {
            seenIds.add(row.id);
            results.push({
              id: row.id,
              full_name: row.full_name,
              email: row.email,
              photo_url: row.photo_url,
              contact_status: row.contact_status,
              franchise: row.franchise,
              program: row.program,
              created_at: row.created_at,
              creditType: 'trainer',
            });
          }
        }
      }

      // Fetch clients credited to this staff member via referral_credit_dietitian
      const { data: dietitianCreditData, error: dietitianCreditError } = await supabase
        .from('user_profiles')
        .select('id, full_name, email, photo_url, contact_status, franchise, program, created_at')
        .eq('referral_credit_dietitian', staffName);

      if (dietitianCreditError) {
        console.warn('Error fetching dietitian referral credits:', dietitianCreditError.message);
      }

      if (dietitianCreditData && Array.isArray(dietitianCreditData)) {
        for (const row of dietitianCreditData) {
          if (!seenIds.has(row.id)) {
            seenIds.add(row.id);
            results.push({
              id: row.id,
              full_name: row.full_name,
              email: row.email,
              photo_url: row.photo_url,
              contact_status: row.contact_status,
              franchise: row.franchise,
              program: row.program,
              created_at: row.created_at,
              creditType: 'dietitian',
            });
          } else {
            // Already seen via trainer credit — mark as both (keep as trainer, it's the same person)
          }
        }
      }

      // Sort by created_at descending (newest first)
      results.sort((a, b) => {
        const da = a.created_at ? new Date(a.created_at).getTime() : 0;
        const db = b.created_at ? new Date(b.created_at).getTime() : 0;
        return db - da;
      });

      setReferrals(results);
    } catch (err: any) {
      console.error('Error fetching staff referrals:', err);
      setError(err.message || 'Failed to load referrals');
    } finally {
      setLoading(false);
    }
  }, [staffName]);

  // ── Fetch Returns (credited returns) ──

  const fetchReturns = useCallback(async () => {
    if (!staffName) {
      setReturnsLoading(false);
      return;
    }
    setReturnsLoading(true);

    try {
      const { data: returnData, error: returnError } = await supabase.functions.invoke('manage-client-data', {
        body: { action: 'list_staff_returns', staff_name: staffName },
      });

      if (returnError) {
        console.warn('Error fetching staff returns:', returnError.message);
        setReturnsLoading(false);
        return;
      }

      const rawReturns: any[] = returnData?.data || [];

      if (rawReturns.length === 0) {
        setReturns([]);
        setReturnsLoading(false);
        return;
      }

      // Resolve client names from user_profiles
      const clientIds = [...new Set(rawReturns.map((r: any) => r.client_id).filter(Boolean))];
      const clientMap = new Map<string, { full_name: string | null; photo_url: string | null; contact_status: string | null }>();

      if (clientIds.length > 0) {
        // Fetch in batches of 50 to avoid query limits
        const batchSize = 50;
        for (let i = 0; i < clientIds.length; i += batchSize) {
          const batch = clientIds.slice(i, i + batchSize);
          const { data: profiles } = await supabase
            .from('user_profiles')
            .select('id, full_name, photo_url, contact_status')
            .in('id', batch);

          if (profiles && Array.isArray(profiles)) {
            for (const p of profiles) {
              clientMap.set(p.id, {
                full_name: p.full_name,
                photo_url: p.photo_url,
                contact_status: p.contact_status,
              });
            }
          }
        }
      }

      // Map return records with resolved client info
      const resolvedReturns: ReturnRecord[] = rawReturns.map((r: any) => {
        const clientInfo = clientMap.get(r.client_id);
        return {
          id: r.id,
          client_id: r.client_id,
          return_date: r.return_date,
          credited_trainer: r.credited_trainer,
          credited_dietitian: r.credited_dietitian,
          notes: r.notes,
          franchise: r.franchise,
          credit_type: r.credit_type || 'trainer',
          created_at: r.created_at,
          client_name: clientInfo?.full_name || null,
          client_photo_url: clientInfo?.photo_url || null,
          client_contact_status: clientInfo?.contact_status || null,
        };
      });

      setReturns(resolvedReturns);
    } catch (err: any) {
      console.warn('Error fetching staff returns:', err);
    } finally {
      setReturnsLoading(false);
    }
  }, [staffName]);

  useEffect(() => {
    fetchReferrals();
    fetchReturns();
  }, [fetchReferrals, fetchReturns]);

  // ── Helpers ──

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr.split('T')[0] || '';
    }
  };

  const firstName = staffName.split(' ')[0];

  // Stats
  const trainerCreditReferrals = referrals.filter(r => r.creditType === 'trainer');
  const dietitianCreditReferrals = referrals.filter(r => r.creditType === 'dietitian');
  const activeReferrals = referrals.filter(r => ACTIVE_STATUSES.includes(r.contact_status || ''));
  const totalReturns = returns.length;

  const isFullyLoading = loading && returnsLoading;
  const hasAnyData = referrals.length > 0 || returns.length > 0;

  // ── Loading ──

  if (isFullyLoading) {
    return (
      <View style={s.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={s.loadingText}>Loading credited referrals & returns...</Text>
      </View>
    );
  }

  // ── Error ──

  if (error && !loading) {
    return (
      <View style={s.centerContainer}>
        <View style={s.errorIcon}>
          <Ionicons name="cloud-offline-outline" size={32} color="#e74c3c" />
        </View>
        <Text style={s.errorTitle}>Could not load referrals</Text>
        <Text style={s.errorText}>{error}</Text>
        <TouchableOpacity style={s.retryBtn} onPress={() => { fetchReferrals(); fetchReturns(); }} activeOpacity={0.7}>
          <Ionicons name="refresh-outline" size={16} color={COLORS.white} />
          <Text style={s.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Render ──

  return (
    <View style={s.container}>
      {/* Summary Header */}
      <View style={s.header}>
        <View style={s.headerIcon}>
          <Ionicons name="ribbon-outline" size={20} color={COLORS.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Credited to {firstName}</Text>
          <Text style={s.headerSubtitle}>
            {!hasAnyData
              ? 'No credited referrals or returns yet'
              : `${referrals.length} ${referrals.length === 1 ? 'referral' : 'referrals'}, ${totalReturns} ${totalReturns === 1 ? 'return' : 'returns'}`}
          </Text>
        </View>
        <View style={s.countBadge}>
          <Text style={s.countBadgeText}>{referrals.length + totalReturns}</Text>
        </View>
      </View>

      {/* Stats Row */}
      {hasAnyData && (
        <View style={s.statsRow}>
          <View style={[s.statCard, { borderLeftColor: COLORS.accent }]}>
            <Text style={s.statValue}>{referrals.length}</Text>
            <Text style={s.statLabel}>Referral{referrals.length !== 1 ? 's' : ''}</Text>
          </View>
          <View style={[s.statCard, { borderLeftColor: RETURN_BADGE_COLOR }]}>
            <Text style={s.statValue}>{totalReturns}</Text>
            <Text style={s.statLabel}>Return{totalReturns !== 1 ? 's' : ''}</Text>
          </View>
          <View style={[s.statCard, { borderLeftColor: COLORS.success }]}>
            <Text style={s.statValue}>{activeReferrals.length}</Text>
            <Text style={s.statLabel}>Active</Text>
          </View>
        </View>
      )}

      {/* Empty State */}
      {!hasAnyData ? (
        <View style={s.emptyState}>
          <View style={s.emptyIcon}>
            <Ionicons name="ribbon-outline" size={48} color={COLORS.borderLight} />
          </View>
          <Text style={s.emptyTitle}>No Credited Referrals or Returns</Text>
          <Text style={s.emptyText}>
            When clients have {firstName} listed as their referral credit (trainer or dietitian) or when returns are credited to {firstName}, they will appear here.
          </Text>
        </View>
      ) : (
        <>
          {/* ── Referrals Section ── */}
          {referrals.length > 0 && (
            <>
              <View style={s.sectionHeader}>
                <Ionicons name="git-branch-outline" size={16} color={COLORS.accent} />
                <Text style={s.sectionTitle}>Referral Credits</Text>
                <View style={[s.sectionCountBadge, { backgroundColor: COLORS.accent + '15' }]}>
                  <Text style={[s.sectionCountText, { color: COLORS.accent }]}>{referrals.length}</Text>
                </View>
              </View>
              <View style={s.listContainer}>
                {referrals.map((referral, index) => {
                  const statusInfo = STATUS_CONFIG[referral.contact_status || ''] || {
                    label: referral.contact_status || 'Contact',
                    color: COLORS.textMuted,
                    icon: 'person-outline',
                  };

                  return (
                    <View
                      key={referral.id}
                      style={[s.referralCard, index === referrals.length - 1 && { marginBottom: 0 }]}
                    >
                      <View style={s.referralRow}>
                        {/* Avatar */}
                        {referral.photo_url ? (
                          <Image source={{ uri: referral.photo_url }} style={s.avatar} />
                        ) : (
                          <View style={[s.avatarPlaceholder, { backgroundColor: statusInfo.color + '15' }]}>
                            <Text style={[s.avatarInitial, { color: statusInfo.color }]}>
                              {(referral.full_name || referral.email || '?')[0].toUpperCase()}
                            </Text>
                          </View>
                        )}

                        {/* Info */}
                        <View style={{ flex: 1 }}>
                          <Text style={s.referralName}>{referral.full_name || referral.email || 'Unknown'}</Text>
                          {referral.email && referral.full_name && (
                            <Text style={s.referralEmail}>{referral.email}</Text>
                          )}
                          <View style={s.referralMeta}>
                            {/* Status badge */}
                            <View style={[s.statusChip, { backgroundColor: statusInfo.color + '12', borderColor: statusInfo.color + '30' }]}>
                              <Ionicons name={statusInfo.icon as any} size={10} color={statusInfo.color} />
                              <Text style={[s.statusChipText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
                            </View>
                            {/* Credit type badge (trainer or dietitian) */}
                            <View style={[s.typeChip, {
                              backgroundColor: referral.creditType === 'trainer' ? COLORS.accent + '12' : '#9b59b612',
                              borderColor: referral.creditType === 'trainer' ? COLORS.accent + '30' : '#9b59b630',
                            }]}>
                              <Ionicons
                                name={referral.creditType === 'trainer' ? 'fitness-outline' : 'nutrition-outline'}
                                size={10}
                                color={referral.creditType === 'trainer' ? COLORS.accent : '#9b59b6'}
                              />
                              <Text style={[s.typeChipText, {
                                color: referral.creditType === 'trainer' ? COLORS.accent : '#9b59b6',
                              }]}>
                                {referral.creditType === 'trainer' ? 'Trainer Credit' : 'Dietitian Credit'}
                              </Text>
                            </View>
                            {/* Program badge */}
                            {referral.program && (
                              <View style={s.programChip}>
                                <Ionicons name="barbell-outline" size={10} color={COLORS.textMuted} />
                                <Text style={s.programChipText}>{referral.program}</Text>
                              </View>
                            )}
                          </View>
                        </View>

                        {/* Date */}
                        {referral.created_at && (
                          <View style={s.dateCol}>
                            <Ionicons name="calendar-outline" size={12} color={COLORS.textMuted} />
                            <Text style={s.dateText}>{formatDate(referral.created_at)}</Text>
                          </View>
                        )}
                      </View>

                      {/* Timeline connector */}
                      {index < referrals.length - 1 && (
                        <View style={s.timelineConnector}>
                          <View style={s.timelineLine} />
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </>
          )}

          {/* ── Returns Section ── */}
          {returnsLoading ? (
            <View style={s.returnsSectionLoading}>
              <ActivityIndicator size="small" color={RETURN_BADGE_COLOR} />
              <Text style={s.loadingText}>Loading returns...</Text>
            </View>
          ) : returns.length > 0 ? (
            <>
              <View style={[s.sectionHeader, { marginTop: referrals.length > 0 ? SPACING.xl : 0 }]}>
                <Ionicons name="refresh-outline" size={16} color={RETURN_BADGE_COLOR} />
                <Text style={s.sectionTitle}>Return Credits</Text>
                <View style={[s.sectionCountBadge, { backgroundColor: RETURN_BADGE_COLOR + '15' }]}>
                  <Text style={[s.sectionCountText, { color: RETURN_BADGE_COLOR }]}>{returns.length}</Text>
                </View>
              </View>
              <View style={s.listContainer}>
                {returns.map((ret, index) => {
                  const clientStatusInfo = STATUS_CONFIG[ret.client_contact_status || ''] || {
                    label: ret.client_contact_status || 'Contact',
                    color: COLORS.textMuted,
                    icon: 'person-outline',
                  };
                  const displayName = ret.client_name || 'Unknown Client';

                  return (
                    <View
                      key={ret.id}
                      style={[s.referralCard, index === returns.length - 1 && { marginBottom: 0 }]}
                    >
                      <View style={s.referralRow}>
                        {/* Avatar */}
                        {ret.client_photo_url ? (
                          <Image source={{ uri: ret.client_photo_url }} style={s.avatar} />
                        ) : (
                          <View style={[s.avatarPlaceholder, { backgroundColor: RETURN_BADGE_COLOR + '15' }]}>
                            <Text style={[s.avatarInitial, { color: RETURN_BADGE_COLOR }]}>
                              {displayName[0].toUpperCase()}
                            </Text>
                          </View>
                        )}

                        {/* Info */}
                        <View style={{ flex: 1 }}>
                          <Text style={s.referralName}>{displayName}</Text>
                          {ret.notes ? (
                            <Text style={s.referralEmail} numberOfLines={1}>{ret.notes}</Text>
                          ) : null}
                          <View style={s.referralMeta}>
                            {/* Status badge */}
                            {ret.client_contact_status && (
                              <View style={[s.statusChip, { backgroundColor: clientStatusInfo.color + '12', borderColor: clientStatusInfo.color + '30' }]}>
                                <Ionicons name={clientStatusInfo.icon as any} size={10} color={clientStatusInfo.color} />
                                <Text style={[s.statusChipText, { color: clientStatusInfo.color }]}>{clientStatusInfo.label}</Text>
                              </View>
                            )}
                            {/* Return credit type badge */}
                            <View style={[s.typeChip, {
                              backgroundColor: RETURN_BADGE_COLOR + '12',
                              borderColor: RETURN_BADGE_COLOR + '30',
                            }]}>
                              <Ionicons name="refresh-outline" size={10} color={RETURN_BADGE_COLOR} />
                              <Text style={[s.typeChipText, { color: RETURN_BADGE_COLOR }]}>Return Credit</Text>
                            </View>
                            {/* Credit type (trainer/dietitian) */}
                            <View style={s.programChip}>
                              <Ionicons
                                name={ret.credit_type === 'trainer' ? 'fitness-outline' : 'nutrition-outline'}
                                size={10}
                                color={COLORS.textMuted}
                              />
                              <Text style={s.programChipText}>
                                {ret.credit_type === 'trainer' ? 'Trainer Credit' : 'Dietitian Credit'}
                              </Text>
                            </View>
                          </View>
                        </View>

                        {/* Date */}
                        {ret.return_date && (
                          <View style={s.dateCol}>
                            <Ionicons name="calendar-outline" size={12} color={COLORS.textMuted} />
                            <Text style={s.dateText}>{formatDate(ret.return_date)}</Text>
                          </View>
                        )}
                      </View>

                      {/* Timeline connector */}
                      {index < returns.length - 1 && (
                        <View style={s.timelineConnector}>
                          <View style={[s.timelineLine, { backgroundColor: RETURN_BADGE_COLOR + '30' }]} />
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </>
          ) : null}
        </>
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: SPACING.md,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: SPACING.xxxl,
    gap: SPACING.md,
  },
  loadingText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
  },
  errorIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#e74c3c10',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.primary,
  },
  errorText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingHorizontal: SPACING.xl,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
  },
  retryBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
    borderWidth: 1,
    borderColor: COLORS.accent + '20',
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.accent + '12',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: COLORS.primary,
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  countBadge: {
    backgroundColor: COLORS.accent,
    borderRadius: BORDER_RADIUS.full,
    minWidth: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
  },
  countBadgeText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: COLORS.white,
  },
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    borderLeftWidth: 3,
    ...SHADOWS.sm,
  },
  statValue: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: COLORS.primary,
  },
  statLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '500',
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.xs,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.primary,
    flex: 1,
  },
  sectionCountBadge: {
    borderRadius: BORDER_RADIUS.full,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
  },
  sectionCountText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '800',
  },
  returnsSectionLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xl,
    marginTop: SPACING.lg,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: SPACING.xxxl,
    gap: SPACING.md,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  emptyTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.primary,
  },
  emptyText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: SPACING.xl,
  },
  listContainer: {
    gap: 0,
  },
  referralCard: {
    marginBottom: 0,
  },
  referralRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    ...SHADOWS.sm,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
  },
  referralName: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.primary,
  },
  referralEmail: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  referralMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
    flexWrap: 'wrap',
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
  },
  statusChipText: {
    fontSize: 9,
    fontWeight: '700',
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
  },
  typeChipText: {
    fontSize: 9,
    fontWeight: '700',
  },
  programChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.background,
  },
  programChipText: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  dateCol: {
    alignItems: 'center',
    gap: 2,
  },
  dateText: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  timelineConnector: {
    alignItems: 'center',
    height: 16,
  },
  timelineLine: {
    width: 2,
    height: 16,
    backgroundColor: COLORS.accent + '30',
  },
});
