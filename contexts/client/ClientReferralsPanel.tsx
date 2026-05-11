import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../../constants/theme';
import { supabase } from '../../lib/supabase';

interface Referral {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  contact_status: string | null;
  photo_url: string | null;
  program: string | null;
  created_at: string;
}

interface Props {
  clientId: string;
  clientName: string;
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

export default function ClientReferralsPanel({ clientId, clientName }: Props) {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReferrals = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('manage-client-data', {
        body: { action: 'get_referrals', referrer_id: clientId },
      });

      if (fnError) {
        throw new Error(fnError.message || 'Failed to fetch referrals');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      setReferrals(data?.data || []);
    } catch (err: any) {
      console.error('Error fetching referrals:', err);
      setError(err.message || 'Failed to load referrals');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchReferrals();
  }, [fetchReferrals]);

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr.split('T')[0] || '';
    }
  };

  const firstName = clientName.split(' ')[0];

  if (loading) {
    return (
      <View style={s.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={s.loadingText}>Loading referrals...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={s.centerContainer}>
        <View style={s.errorIcon}>
          <Ionicons name="cloud-offline-outline" size={32} color="#e74c3c" />
        </View>
        <Text style={s.errorTitle}>Could not load referrals</Text>
        <Text style={s.errorText}>{error}</Text>
        <TouchableOpacity style={s.retryBtn} onPress={fetchReferrals} activeOpacity={0.7}>
          <Ionicons name="refresh-outline" size={16} color={COLORS.white} />
          <Text style={s.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerIcon}>
          <Ionicons name="git-network-outline" size={20} color={COLORS.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Referrals by {firstName}</Text>
          <Text style={s.headerSubtitle}>
            {referrals.length === 0
              ? 'No referrals yet'
              : `${referrals.length} ${referrals.length === 1 ? 'person' : 'people'} referred`}
          </Text>
        </View>
        <View style={s.countBadge}>
          <Text style={s.countBadgeText}>{referrals.length}</Text>
        </View>
      </View>

      {referrals.length === 0 ? (
        <View style={s.emptyState}>
          <View style={s.emptyIcon}>
            <Ionicons name="people-outline" size={48} color={COLORS.borderLight} />
          </View>
          <Text style={s.emptyTitle}>No Referrals Yet</Text>
          <Text style={s.emptyText}>
            When {firstName} refers someone to the business and they are added as a contact with {firstName} as the referral source, they will appear here.
          </Text>
        </View>
      ) : (
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
                        {(referral.full_name || '?')[0].toUpperCase()}
                      </Text>
                    </View>
                  )}

                  {/* Info */}
                  <View style={{ flex: 1 }}>
                    <Text style={s.referralName}>{referral.full_name || referral.email}</Text>
                    <Text style={s.referralEmail}>{referral.email}</Text>
                    <View style={s.referralMeta}>
                      <View style={[s.statusChip, { backgroundColor: statusInfo.color + '12', borderColor: statusInfo.color + '30' }]}>
                        <Ionicons name={statusInfo.icon as any} size={10} color={statusInfo.color} />
                        <Text style={[s.statusChipText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
                      </View>
                      {referral.program && (
                        <View style={s.programChip}>
                          <Ionicons name="barbell-outline" size={10} color={COLORS.textMuted} />
                          <Text style={s.programChipText}>{referral.program}</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Date */}
                  <View style={s.dateCol}>
                    <Ionicons name="calendar-outline" size={12} color={COLORS.textMuted} />
                    <Text style={s.dateText}>{formatDate(referral.created_at)}</Text>
                  </View>
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
      )}
    </View>
  );
}

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
