import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  Image,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import {
  fetchPartnerGroup,
  createPartnerGroup,
  addPartnerGroupMember,
  removePartnerGroupMember,
  setPartnerGroupPrimary,
  deletePartnerGroup,
  searchPartnerCandidates,
  PartnerGroupMember,
  PartnerGroup,
  PartnerSearchResult,
} from '../../lib/partnerGroupService';
import { isValidUUID } from '../../lib/clientDataService';

interface PartnerGroupPanelProps {
  clientId: string;
  clientName: string;
  clientFranchise?: string;
  editable?: boolean;
  onGroupChanged?: () => void;
}

const ACCENT_PARTNER = '#8B5CF6'; // Purple accent for partner groups

export default function PartnerGroupPanel({
  clientId,
  clientName,
  clientFranchise,
  editable = false,
  onGroupChanged,
}: PartnerGroupPanelProps) {
  const [group, setGroup] = useState<PartnerGroup | null>(null);
  const [members, setMembers] = useState<PartnerGroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PartnerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Action loading states
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadedForRef = useRef<string | null>(null);

  const loadGroup = useCallback(async () => {
    if (!isValidUUID(clientId)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPartnerGroup(clientId);
      setGroup(data.group);
      setMembers(data.members);
    } catch (err) {
      setError('Failed to load partner group');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    if (clientId && loadedForRef.current !== clientId) {
      loadedForRef.current = clientId;
      loadGroup();
    }
  }, [clientId, loadGroup]);

  // Debounced search
  useEffect(() => {
    if (!showSearch || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      const results = await searchPartnerCandidates(searchQuery, clientFranchise, clientId);
      setSearchResults(results);
      setSearching(false);
    }, 300);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery, showSearch, clientFranchise, clientId]);

  const platformAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleCreateGroup = async (partnerId: string) => {
    setActionLoading(partnerId);
    const result = await createPartnerGroup(clientId, [partnerId]);
    if (result.success) {
      await loadGroup();
      setShowSearch(false);
      setSearchQuery('');
      setSearchResults([]);
      onGroupChanged?.();
    } else {
      platformAlert('Error', result.error || 'Failed to create partner group');
    }
    setActionLoading(null);
  };

  const handleAddMember = async (partnerId: string) => {
    if (!group) return;
    setActionLoading(partnerId);
    const result = await addPartnerGroupMember(group.id, partnerId);
    if (result.success) {
      await loadGroup();
      setShowSearch(false);
      setSearchQuery('');
      setSearchResults([]);
      onGroupChanged?.();
    } else {
      platformAlert('Error', result.error || 'Failed to add partner');
    }
    setActionLoading(null);
  };

  const handleRemoveMember = async (userId: string, name: string) => {
    if (!group) return;
    const doRemove = async () => {
      setActionLoading(userId);
      const result = await removePartnerGroupMember(group.id, userId);
      if (result.success) {
        await loadGroup();
        onGroupChanged?.();
      } else {
        platformAlert('Error', result.error || 'Failed to remove partner');
      }
      setActionLoading(null);
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Remove ${name} from the partner group?`)) {
        await doRemove();
      }
    } else {
      Alert.alert('Remove Partner', `Remove ${name} from the partner group?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: doRemove },
      ]);
    }
  };

  const handleSetPrimary = async (userId: string) => {
    if (!group) return;
    setActionLoading(`primary-${userId}`);
    const result = await setPartnerGroupPrimary(group.id, userId);
    if (result.success) {
      await loadGroup();
      onGroupChanged?.();
    } else {
      platformAlert('Error', result.error || 'Failed to set primary partner');
    }
    setActionLoading(null);
  };

  const handleDeleteGroup = async () => {
    if (!group) return;
    const doDelete = async () => {
      setActionLoading('delete-group');
      const result = await deletePartnerGroup(group.id);
      if (result.success) {
        setGroup(null);
        setMembers([]);
        onGroupChanged?.();
      } else {
        platformAlert('Error', result.error || 'Failed to delete partner group');
      }
      setActionLoading(null);
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Dissolve this partner group? All members will be ungrouped.')) {
        await doDelete();
      }
    } else {
      Alert.alert('Dissolve Group', 'Dissolve this partner group? All members will be ungrouped.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Dissolve', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const getAvatarUrl = (member: PartnerGroupMember) => {
    if (member.photo_url) return member.photo_url;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(member.full_name || 'U')}&background=8B5CF6&color=fff&size=80`;
  };

  const getSearchAvatarUrl = (result: PartnerSearchResult) => {
    if (result.photo_url) return result.photo_url;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(result.full_name || 'U')}&background=8B5CF6&color=fff&size=80`;
  };

  if (!isValidUUID(clientId)) {
    return null;
  }

  // ── Loading State ──
  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionIconBg, { backgroundColor: ACCENT_PARTNER + '15' }]}>
            <Ionicons name="people" size={16} color={ACCENT_PARTNER} />
          </View>
          <Text style={styles.sectionTitle}>Partner Group</Text>
        </View>
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={ACCENT_PARTNER} />
          <Text style={styles.loadingText}>Loading partner group...</Text>
        </View>
      </View>
    );
  }

  // ── No Group (View Mode) ──
  if (!group && !editable) {
    return (
      <View style={styles.container}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionIconBg, { backgroundColor: ACCENT_PARTNER + '15' }]}>
            <Ionicons name="people" size={16} color={ACCENT_PARTNER} />
          </View>
          <Text style={styles.sectionTitle}>Partner Group</Text>
        </View>
        <View style={styles.emptyCard}>
          <Ionicons name="people-outline" size={28} color={COLORS.textMuted} />
          <Text style={styles.emptyText}>Not in a partner group</Text>
          <Text style={styles.emptySubtext}>
            {clientName.split(' ')[0]} is not currently grouped with a partner
          </Text>
        </View>
      </View>
    );
  }

  // ── No Group (Edit Mode) — show create option ──
  if (!group && editable) {
    return (
      <View style={styles.container}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionIconBg, { backgroundColor: ACCENT_PARTNER + '15' }]}>
            <Ionicons name="people" size={16} color={ACCENT_PARTNER} />
          </View>
          <Text style={styles.sectionTitle}>Partner Group</Text>
        </View>

        {!showSearch ? (
          <TouchableOpacity
            style={styles.createGroupBtn}
            onPress={() => setShowSearch(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle" size={20} color={ACCENT_PARTNER} />
            <View style={{ flex: 1 }}>
              <Text style={styles.createGroupBtnTitle}>Create Partner Group</Text>
              <Text style={styles.createGroupBtnSub}>
                Search for a partner to group with {clientName.split(' ')[0]}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={ACCENT_PARTNER} />
          </TouchableOpacity>
        ) : (
          renderSearchPanel(true)
        )}

        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={14} color={COLORS.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </View>
    );
  }

  // ── Render search panel ──
  function renderSearchPanel(isCreate: boolean) {
    return (
      <View style={styles.searchPanel}>
        <View style={styles.searchHeader}>
          <Text style={styles.searchTitle}>
            {isCreate ? 'Find a Partner' : 'Add Partner'}
          </Text>
          <TouchableOpacity
            onPress={() => {
              setShowSearch(false);
              setSearchQuery('');
              setSearchResults([]);
            }}
            style={styles.searchCloseBtn}
          >
            <Ionicons name="close" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={styles.searchInputWrapper}>
          <Ionicons name="search" size={16} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by name or email..."
            placeholderTextColor={COLORS.textMuted}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {searching && (
          <View style={styles.searchingRow}>
            <ActivityIndicator size="small" color={ACCENT_PARTNER} />
            <Text style={styles.searchingText}>Searching...</Text>
          </View>
        )}

        {!searching && searchQuery.length >= 2 && searchResults.length === 0 && (
          <View style={styles.noResultsRow}>
            <Ionicons name="search-outline" size={20} color={COLORS.textMuted} />
            <Text style={styles.noResultsText}>No clients found</Text>
          </View>
        )}

        {searchResults.length > 0 && (
          <ScrollView
            style={styles.searchResultsList}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            {searchResults.map((result) => {
              const isLoading = actionLoading === result.id;
              return (
                <View key={result.id} style={styles.searchResultItem}>
                  <Image
                    source={{ uri: getSearchAvatarUrl(result) }}
                    style={styles.searchResultAvatar}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.searchResultName}>{result.full_name}</Text>
                    <Text style={styles.searchResultEmail} numberOfLines={1}>
                      {result.email}
                    </Text>
                    {result.program && (
                      <Text style={styles.searchResultProgram}>{result.program}</Text>
                    )}
                  </View>
                  {result.in_partner_group ? (
                    <View style={styles.inGroupBadge}>
                      <Ionicons name="people" size={10} color={COLORS.textMuted} />
                      <Text style={styles.inGroupBadgeText}>In group</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.addPartnerBtn, isLoading && { opacity: 0.5 }]}
                      onPress={() => isCreate ? handleCreateGroup(result.id) : handleAddMember(result.id)}
                      disabled={isLoading}
                      activeOpacity={0.7}
                    >
                      {isLoading ? (
                        <ActivityIndicator size="small" color={COLORS.white} />
                      ) : (
                        <>
                          <Ionicons name="add" size={14} color={COLORS.white} />
                          <Text style={styles.addPartnerBtnText}>Add</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
    );
  }

  // ── Group Exists — show members ──
  const primaryMember = members.find(m => m.is_primary);
  const otherMembers = members.filter(m => !m.is_primary);
  const currentUserMember = members.find(m => m.user_id === clientId);
  const isCurrentUserPrimary = currentUserMember?.is_primary || false;

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIconBg, { backgroundColor: ACCENT_PARTNER + '15' }]}>
          <Ionicons name="people" size={16} color={ACCENT_PARTNER} />
        </View>
        <Text style={styles.sectionTitle}>Partner Group</Text>
        <View style={styles.memberCountBadge}>
          <Text style={styles.memberCountText}>{members.length} members</Text>
        </View>
      </View>

      {/* Primary Partner */}
      {primaryMember && (
        <View style={styles.primaryCard}>
          <View style={styles.primaryBadgeRow}>
            <View style={styles.primaryBadge}>
              <Ionicons name="star" size={10} color={ACCENT_PARTNER} />
              <Text style={styles.primaryBadgeText}>Primary Partner</Text>
            </View>
          </View>
          <View style={styles.memberRow}>
            <Image
              source={{ uri: getAvatarUrl(primaryMember) }}
              style={styles.memberAvatar}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.memberName}>
                {primaryMember.full_name}
                {primaryMember.user_id === clientId && (
                  <Text style={styles.youLabel}> (this client)</Text>
                )}
              </Text>
              <Text style={styles.memberEmail} numberOfLines={1}>{primaryMember.email}</Text>
              {primaryMember.program && (
                <View style={styles.programBadge}>
                  <Ionicons name="barbell-outline" size={10} color={ACCENT_PARTNER} />
                  <Text style={styles.programBadgeText}>{primaryMember.program}</Text>
                  {primaryMember.program_status === 'active' && (
                    <View style={styles.activeDot} />
                  )}
                </View>
              )}
            </View>
            {editable && primaryMember.user_id !== clientId && (
              <TouchableOpacity
                style={styles.removeMemberBtn}
                onPress={() => handleRemoveMember(primaryMember.user_id, primaryMember.full_name)}
                disabled={actionLoading === primaryMember.user_id}
                activeOpacity={0.7}
              >
                {actionLoading === primaryMember.user_id ? (
                  <ActivityIndicator size="small" color={COLORS.danger} />
                ) : (
                  <Ionicons name="close-circle" size={20} color={COLORS.danger} />
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Other Members */}
      {otherMembers.map((member) => (
        <View key={member.user_id} style={styles.memberCard}>
          <View style={styles.memberRow}>
            <Image
              source={{ uri: getAvatarUrl(member) }}
              style={styles.memberAvatar}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.memberName}>
                {member.full_name}
                {member.user_id === clientId && (
                  <Text style={styles.youLabel}> (this client)</Text>
                )}
              </Text>
              <Text style={styles.memberEmail} numberOfLines={1}>{member.email}</Text>
              {member.program && (
                <View style={styles.programBadge}>
                  <Ionicons name="barbell-outline" size={10} color={ACCENT_PARTNER} />
                  <Text style={styles.programBadgeText}>{member.program}</Text>
                  {member.program_status === 'active' && (
                    <View style={styles.activeDot} />
                  )}
                </View>
              )}
            </View>
            {editable && (
              <View style={styles.memberActions}>
                {/* Make Primary button */}
                <TouchableOpacity
                  style={styles.makePrimaryBtn}
                  onPress={() => handleSetPrimary(member.user_id)}
                  disabled={actionLoading === `primary-${member.user_id}`}
                  activeOpacity={0.7}
                >
                  {actionLoading === `primary-${member.user_id}` ? (
                    <ActivityIndicator size="small" color={ACCENT_PARTNER} />
                  ) : (
                    <>
                      <Ionicons name="star-outline" size={12} color={ACCENT_PARTNER} />
                      <Text style={styles.makePrimaryBtnText}>Primary</Text>
                    </>
                  )}
                </TouchableOpacity>
                {/* Remove button */}
                <TouchableOpacity
                  style={styles.removeMemberBtn}
                  onPress={() => handleRemoveMember(member.user_id, member.full_name)}
                  disabled={actionLoading === member.user_id}
                  activeOpacity={0.7}
                >
                  {actionLoading === member.user_id ? (
                    <ActivityIndicator size="small" color={COLORS.danger} />
                  ) : (
                    <Ionicons name="close-circle" size={20} color={COLORS.danger} />
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      ))}

      {/* Shared Program Info */}
      {primaryMember?.program && (
        <View style={styles.sharedProgramCard}>
          <Ionicons name="link-outline" size={14} color={ACCENT_PARTNER} />
          <Text style={styles.sharedProgramText}>
            Shared Program: <Text style={{ fontWeight: '800' }}>{primaryMember.program}</Text>
          </Text>
        </View>
      )}

      {/* Edit Mode Actions */}
      {editable && (
        <View style={styles.editActions}>
          {/* Add Partner Button */}
          {!showSearch ? (
            <TouchableOpacity
              style={styles.addAnotherBtn}
              onPress={() => setShowSearch(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="person-add" size={16} color={ACCENT_PARTNER} />
              <Text style={styles.addAnotherBtnText}>Add Partner</Text>
            </TouchableOpacity>
          ) : (
            renderSearchPanel(false)
          )}

          {/* Dissolve Group Button */}
          <TouchableOpacity
            style={styles.dissolveBtn}
            onPress={handleDeleteGroup}
            disabled={actionLoading === 'delete-group'}
            activeOpacity={0.7}
          >
            {actionLoading === 'delete-group' ? (
              <ActivityIndicator size="small" color={COLORS.danger} />
            ) : (
              <>
                <Ionicons name="unlink-outline" size={14} color={COLORS.danger} />
                <Text style={styles.dissolveBtnText}>Dissolve Group</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={14} color={COLORS.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  sectionIconBg: {
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: COLORS.text,
    flex: 1,
  },
  memberCountBadge: {
    backgroundColor: ACCENT_PARTNER + '15',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },
  memberCountText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: ACCENT_PARTNER,
  },

  // Loading
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.lg,
  },
  loadingText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    fontWeight: '600',
  },

  // Empty state
  emptyCard: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    gap: SPACING.sm,
  },
  emptyText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  emptySubtext: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    textAlign: 'center',
  },

  // Create group button
  createGroupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: ACCENT_PARTNER + '08',
    borderWidth: 1.5,
    borderColor: ACCENT_PARTNER + '25',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg,
    borderStyle: 'dashed' as any,
  },
  createGroupBtnTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: ACCENT_PARTNER,
  },
  createGroupBtnSub: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  // Primary card
  primaryCard: {
    backgroundColor: ACCENT_PARTNER + '06',
    borderWidth: 1.5,
    borderColor: ACCENT_PARTNER + '20',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  primaryBadgeRow: {
    marginBottom: SPACING.sm,
  },
  primaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: ACCENT_PARTNER + '15',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
    alignSelf: 'flex-start',
  },
  primaryBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: ACCENT_PARTNER,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Member card
  memberCard: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: ACCENT_PARTNER + '30',
  },
  memberName: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.text,
  },
  youLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  memberEmail: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  programBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  programBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: ACCENT_PARTNER,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.success,
  },

  // Member actions
  memberActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  makePrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: ACCENT_PARTNER + '12',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: ACCENT_PARTNER + '25',
  },
  makePrimaryBtnText: {
    fontSize: 9,
    fontWeight: '700',
    color: ACCENT_PARTNER,
  },
  removeMemberBtn: {
    padding: 2,
  },

  // Shared program card
  sharedProgramCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: ACCENT_PARTNER + '08',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: ACCENT_PARTNER + '15',
  },
  sharedProgramText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: ACCENT_PARTNER,
  },

  // Edit actions
  editActions: {
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  addAnotherBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: ACCENT_PARTNER + '10',
    borderWidth: 1,
    borderColor: ACCENT_PARTNER + '25',
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
  },
  addAnotherBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: ACCENT_PARTNER,
  },
  dissolveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.danger + '08',
    borderWidth: 1,
    borderColor: COLORS.danger + '20',
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
  },
  dissolveBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.danger,
  },

  // Search panel
  searchPanel: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: SPACING.md,
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  searchTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.text,
  },
  searchCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    paddingHorizontal: SPACING.md,
    height: 40,
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: '500',
  },
  searchingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  searchingText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
  },
  noResultsRow: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    gap: SPACING.sm,
  },
  noResultsText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  searchResultsList: {
    maxHeight: 200,
    marginTop: SPACING.sm,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    marginBottom: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  searchResultAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  searchResultName: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.text,
  },
  searchResultEmail: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
  },
  searchResultProgram: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: ACCENT_PARTNER,
    marginTop: 1,
  },
  inGroupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: COLORS.textMuted + '15',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },
  inGroupBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  addPartnerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: ACCENT_PARTNER,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
  },
  addPartnerBtnText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.white,
  },

  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.danger + '08',
    borderWidth: 1,
    borderColor: COLORS.danger + '20',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.md,
  },
  errorText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.danger,
    flex: 1,
  },
});
