import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
  Modal,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../../constants/theme';
import { ApprovedEmail } from '../../lib/approvedEmailsService';
import { supabase } from '../../lib/supabase';

const ROLE_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  client: { label: 'Client', icon: 'person', color: COLORS.accent },
  trainer: { label: 'Trainer', icon: 'fitness', color: COLORS.success },
  dietitian: { label: 'Dietitian', icon: 'nutrition', color: '#9b59b6' },
  franchise_manager: { label: 'Franchise Mgr', icon: 'business', color: COLORS.warning },
  admin: { label: 'Admin', icon: 'shield', color: COLORS.danger },
};

interface ApprovedEmailListItemProps {
  item: ApprovedEmail;
  onDelete: (id: string) => Promise<void>;
  onInviteSent?: (id: string) => void;
}

export default function ApprovedEmailListItem({ item, onDelete, onInviteSent }: ApprovedEmailListItemProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;

  // Local state to optimistically reflect invite status without waiting for parent refresh
  const [localInviteSent, setLocalInviteSent] = useState<boolean>(!!item.invite_sent);
  const [localInviteCount, setLocalInviteCount] = useState<number>(item.invite_count || 0);

  // Sync from props when parent updates
  useEffect(() => {
    setLocalInviteSent(!!item.invite_sent);
    setLocalInviteCount(item.invite_count || 0);
  }, [item.invite_sent, item.invite_count]);

  const roleConfig = ROLE_CONFIG[item.role] || ROLE_CONFIG.client;

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    Animated.timing(toastOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
    setTimeout(() => {
      Animated.timing(toastOpacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start(() => setToast(null));
    }, 3500);
  };

  const handleSendInvite = async () => {
    if (isSendingInvite) return;
    setIsSendingInvite(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-invite-email', {
        body: { action: 'send-invite', email_id: item.id },
      });

      if (error) {
        // Try to extract a meaningful error message
        let errorMessage = 'Failed to send invite email';
        try {
          const ctx = (error as any).context;
          if (ctx && typeof ctx === 'object' && typeof ctx.json === 'function') {
            const ctxData = await ctx.json();
            if (ctxData?.error) errorMessage = ctxData.error;
          } else if (error.message) {
            try {
              const parsed = JSON.parse(error.message);
              if (parsed?.error) errorMessage = parsed.error;
            } catch {
              if (error.message !== 'Edge Function returned a non-2xx status code') {
                errorMessage = error.message;
              }
            }
          }
        } catch {
          // fall through to default
        }

        if (Platform.OS === 'web') {
          showToast('error', errorMessage);
        } else {
          Alert.alert('Invite Failed', errorMessage);
        }
        return;
      }

      if (data?.error) {
        const msg = data.error;
        if (Platform.OS === 'web') {
          showToast('error', msg);
        } else {
          Alert.alert('Invite Failed', msg);
        }
        return;
      }

      // Success — optimistically update local state
      setLocalInviteSent(true);
      setLocalInviteCount((prev) => prev + 1);
      showToast('success', `Invite email sent to ${item.email}`);

      // Notify parent so it can refresh the full list (gets server-truth invite_count, etc.)
      if (onInviteSent) {
        onInviteSent(item.id);
      }
    } catch (err: any) {
      const msg = err?.message || 'An unexpected error occurred';
      if (Platform.OS === 'web') {
        showToast('error', msg);
      } else {
        Alert.alert('Invite Failed', msg);
      }
    } finally {
      setIsSendingInvite(false);
    }
  };

  const handleDelete = () => {
    if (Platform.OS === 'web') {
      // On web, use a custom modal confirmation since Alert.alert doesn't work
      setShowConfirm(true);
    } else {
      // On native, use Alert.alert
      const title = item.claimed ? 'Already Claimed' : 'Remove Approved Email';
      const message = item.claimed
        ? 'This email has already been used to create an account. Removing it will not affect the existing account, but the email cannot be re-added later without first being removed.'
        : `Are you sure you want to remove ${item.email}? They will no longer be able to sign up.`;
      const destructiveLabel = item.claimed ? 'Remove Anyway' : 'Remove';

      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel' },
        { text: destructiveLabel, style: 'destructive', onPress: performDelete },
      ]);
    }
  };

  const performDelete = async () => {
    setShowConfirm(false);
    setIsDeleting(true);
    try {
      await onDelete(item.id);
    } catch {
      // Error handled by parent
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const confirmTitle = item.claimed ? 'Already Claimed' : 'Remove Approved Email';
  const confirmMessage = item.claimed
    ? 'This email has already been used to create an account. Removing it will not affect the existing account, but the email cannot be re-added later without first being removed.'
    : `Are you sure you want to remove "${item.email}"? They will no longer be able to sign up.`;
  const confirmActionLabel = item.claimed ? 'Remove Anyway' : 'Remove';

  return (
    <>
      <View style={[styles.container, item.claimed && styles.containerClaimed]}>
        <View style={styles.topRow}>
          {/* Role Icon */}
          <View style={[styles.roleIcon, { backgroundColor: roleConfig.color + '15' }]}>
            <Ionicons name={roleConfig.icon as any} size={16} color={roleConfig.color} />
          </View>

          {/* Email & Name */}
          <View style={styles.infoCol}>
            <Text style={styles.email} numberOfLines={1}>{item.email}</Text>
            {item.full_name ? (
              <Text style={styles.name} numberOfLines={1}>{item.full_name}</Text>
            ) : null}
          </View>

          {/* Status Badge */}
          <View style={[styles.statusBadge, item.claimed ? styles.statusClaimed : styles.statusUnclaimed]}>
            <Ionicons
              name={item.claimed ? 'checkmark-circle' : 'time-outline'}
              size={12}
              color={item.claimed ? COLORS.success : COLORS.warning}
            />
            <Text style={[styles.statusText, { color: item.claimed ? COLORS.success : COLORS.warning }]}>
              {item.claimed ? 'Claimed' : 'Pending'}
            </Text>
          </View>
        </View>

        <View style={styles.bottomRow}>
          {/* Meta Info */}
          <View style={styles.metaRow}>
            <View style={[styles.roleBadge, { backgroundColor: roleConfig.color + '15' }]}>
              <Text style={[styles.roleBadgeText, { color: roleConfig.color }]}>{roleConfig.label}</Text>
            </View>
            {item.franchise ? (
              <View style={styles.metaItem}>
                <Ionicons name="location-outline" size={11} color={COLORS.textMuted} />
                <Text style={styles.metaText}>{item.franchise}</Text>
              </View>
            ) : null}
            <View style={styles.metaItem}>
              <Ionicons name="calendar-outline" size={11} color={COLORS.textMuted} />
              <Text style={styles.metaText}>{formatDate(item.created_at)}</Text>
            </View>
            {/* Invited badge */}
            {localInviteSent ? (
              <View style={styles.invitedBadge}>
                <Ionicons name="paper-plane" size={10} color={COLORS.accent} />
                <Text style={styles.invitedBadgeText}>
                  Invited{localInviteCount > 1 ? ` ×${localInviteCount}` : ''}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Action Buttons */}
          <View style={styles.actionsRow}>
            {/* Send Invite Button - only show for unclaimed emails */}
            {!item.claimed ? (
              <TouchableOpacity
                style={[styles.inviteBtn, isSendingInvite && styles.inviteBtnDisabled]}
                onPress={handleSendInvite}
                disabled={isSendingInvite || isDeleting}
                activeOpacity={0.8}
              >
                {isSendingInvite ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <>
                    <Ionicons
                      name={localInviteSent ? 'refresh' : 'paper-plane'}
                      size={13}
                      color={COLORS.white}
                    />
                    <Text style={styles.inviteBtnText}>
                      {localInviteSent ? 'Resend' : 'Send Invite'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            ) : null}

            {/* Delete Button */}
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={handleDelete}
              disabled={isDeleting || isSendingInvite}
              activeOpacity={0.7}
            >
              {isDeleting ? (
                <ActivityIndicator size="small" color={COLORS.danger} />
              ) : (
                <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {item.claimed && item.claimed_at ? (
          <View style={styles.claimedInfo}>
            <Ionicons name="checkmark-done" size={12} color={COLORS.success} />
            <Text style={styles.claimedText}>
              Account created on {formatDate(item.claimed_at)}
            </Text>
          </View>
        ) : null}

        {/* Inline toast for web (Alert.alert doesn't work on web) */}
        {toast ? (
          <Animated.View
            style={[
              styles.toast,
              toast.type === 'success' ? styles.toastSuccess : styles.toastError,
              { opacity: toastOpacity },
            ]}
          >
            <Ionicons
              name={toast.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
              size={14}
              color={toast.type === 'success' ? COLORS.success : COLORS.danger}
            />
            <Text
              style={[
                styles.toastText,
                { color: toast.type === 'success' ? COLORS.success : COLORS.danger },
              ]}
              numberOfLines={2}
            >
              {toast.message}
            </Text>
          </Animated.View>
        ) : null}
      </View>

      {/* Web Confirmation Modal */}
      <Modal
        visible={showConfirm}
        animationType="fade"
        transparent
        onRequestClose={() => setShowConfirm(false)}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <View style={styles.confirmIconCircle}>
              <Ionicons name="trash" size={28} color={COLORS.white} />
            </View>
            <Text style={styles.confirmTitle}>{confirmTitle}</Text>
            <Text style={styles.confirmMessage}>{confirmMessage}</Text>

            {/* Email info summary */}
            <View style={styles.confirmInfoCard}>
              <View style={styles.confirmInfoRow}>
                <Ionicons name="mail-outline" size={14} color={COLORS.textSecondary} />
                <Text style={styles.confirmInfoText}>{item.email}</Text>
              </View>
              <View style={styles.confirmInfoRow}>
                <Ionicons name={roleConfig.icon as any} size={14} color={roleConfig.color} />
                <Text style={[styles.confirmInfoText, { color: roleConfig.color, fontWeight: '600' }]}>
                  {roleConfig.label}
                </Text>
              </View>
              {item.franchise ? (
                <View style={styles.confirmInfoRow}>
                  <Ionicons name="location-outline" size={14} color={COLORS.textSecondary} />
                  <Text style={styles.confirmInfoText}>{item.franchise}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.confirmBtnRow}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                onPress={() => setShowConfirm(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.confirmCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmDeleteBtn}
                onPress={performDelete}
                activeOpacity={0.8}
              >
                <Ionicons name="trash" size={16} color={COLORS.white} />
                <Text style={styles.confirmDeleteBtnText}>{confirmActionLabel}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    ...SHADOWS.sm,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
  },
  containerClaimed: {
    borderLeftColor: COLORS.success,
    opacity: 0.85,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  roleIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoCol: {
    flex: 1,
  },
  email: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.primary,
  },
  name: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },
  statusClaimed: {
    backgroundColor: COLORS.successLight,
  },
  statusUnclaimed: {
    backgroundColor: COLORS.warningLight,
  },
  statusText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
    flexWrap: 'wrap',
  },
  roleBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },
  roleBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  invitedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.accent + '18',
  },
  invitedBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.accent,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginLeft: SPACING.sm,
  },
  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: 7,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.accent,
    minWidth: 96,
    justifyContent: 'center',
    ...SHADOWS.sm,
  },
  inviteBtnDisabled: {
    opacity: 0.7,
  },
  inviteBtnText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.white,
  },
  deleteBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.dangerLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  claimedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: SPACING.sm,
    paddingTop: SPACING.xs,
  },
  claimedText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.success,
    fontWeight: '500',
  },

  // Toast
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
  },
  toastSuccess: {
    backgroundColor: COLORS.successLight,
    borderColor: COLORS.success + '40',
  },
  toastError: {
    backgroundColor: COLORS.dangerLight,
    borderColor: COLORS.danger + '40',
  },
  toastText: {
    flex: 1,
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
  },

  // Confirmation Modal Styles
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 61, 92, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  confirmCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xxl || 20,
    padding: SPACING.xxl || 28,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    ...SHADOWS.lg,
  },
  confirmIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.danger,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  confirmTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  confirmMessage: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: SPACING.lg,
  },
  confirmInfoCard: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    width: '100%',
    gap: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  confirmInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  confirmInfoText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  confirmBtnRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    width: '100%',
  },
  confirmCancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  confirmCancelBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  confirmDeleteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.danger,
    ...SHADOWS.md,
  },
  confirmDeleteBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.white,
  },
});
