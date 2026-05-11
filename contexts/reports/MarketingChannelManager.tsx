import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import { MarketingChannel, ChannelAlias } from '../../lib/marketingService';

interface MarketingChannelManagerProps {
  visible: boolean;
  onClose: () => void;
  channels: MarketingChannel[];
  onAddChannel: (name: string) => Promise<void>;
  onUpdateChannel: (id: string, updates: Partial<MarketingChannel>) => Promise<void>;
  onDeleteChannel: (id: string) => Promise<void>;
  onAddAlias: (channelId: string, alias: string) => Promise<void>;
  onDeleteAlias: (aliasId: string) => Promise<void>;
}

export default function MarketingChannelManager({
  visible, onClose, channels, onAddChannel, onUpdateChannel, onDeleteChannel,
  onAddAlias, onDeleteAlias,
}: MarketingChannelManagerProps) {
  const [newChannelName, setNewChannelName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Alias management state
  const [expandedChannelId, setExpandedChannelId] = useState<string | null>(null);
  const [newAliasText, setNewAliasText] = useState('');
  const [aliasLoading, setAliasLoading] = useState(false);

  const handleAdd = async () => {
    const name = newChannelName.trim();
    if (!name) return;
    if (channels.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      setError('Channel already exists');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await onAddChannel(name);
      setNewChannelName('');
    } catch (err: any) {
      setError(err.message || 'Failed to add channel');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (channel: MarketingChannel) => {
    try {
      await onUpdateChannel(channel.id, { is_active: !channel.is_active });
    } catch (err: any) {
      setError(err.message || 'Failed to update channel');
    }
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    try {
      await onUpdateChannel(editingId, { name: editName.trim() });
      setEditingId(null);
      setEditName('');
    } catch (err: any) {
      setError(err.message || 'Failed to rename channel');
    }
  };

  const handleDelete = (channel: MarketingChannel) => {
    const doDelete = async () => {
      try {
        await onDeleteChannel(channel.id);
      } catch (err: any) {
        setError(err.message || 'Failed to delete channel');
      }
    };

    if (Platform.OS === 'web') {
      if (confirm(`Delete "${channel.name}"? This will also delete all associated marketing data.`)) {
        doDelete();
      }
    } else {
      Alert.alert(
        'Delete Channel',
        `Delete "${channel.name}"? This will also delete all associated marketing data.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete },
        ]
      );
    }
  };

  const startEdit = (channel: MarketingChannel) => {
    setEditingId(channel.id);
    setEditName(channel.name);
  };

  const toggleExpand = (channelId: string) => {
    if (expandedChannelId === channelId) {
      setExpandedChannelId(null);
      setNewAliasText('');
    } else {
      setExpandedChannelId(channelId);
      setNewAliasText('');
    }
  };

  const handleAddAlias = async (channelId: string) => {
    const alias = newAliasText.trim();
    if (!alias) return;

    // Check if alias conflicts with existing channel name
    if (channels.some(c => c.name.toLowerCase() === alias.toLowerCase())) {
      setError(`"${alias}" is already a channel name. Aliases must be different from existing channel names.`);
      return;
    }

    // Check if alias already exists on any channel
    for (const ch of channels) {
      if (ch.aliases?.some(a => a.alias.toLowerCase() === alias.toLowerCase())) {
        setError(`"${alias}" is already an alias for "${ch.name}".`);
        return;
      }
    }

    setAliasLoading(true);
    setError('');
    try {
      await onAddAlias(channelId, alias);
      setNewAliasText('');
    } catch (err: any) {
      setError(err.userMessage || err.message || 'Failed to add alias');
    } finally {
      setAliasLoading(false);
    }
  };

  const handleDeleteAlias = (alias: ChannelAlias) => {
    const doDelete = async () => {
      setAliasLoading(true);
      try {
        await onDeleteAlias(alias.id);
      } catch (err: any) {
        setError(err.userMessage || err.message || 'Failed to delete alias');
      } finally {
        setAliasLoading(false);
      }
    };

    if (Platform.OS === 'web') {
      if (confirm(`Remove alias "${alias.alias}"?`)) {
        doDelete();
      }
    } else {
      Alert.alert('Remove Alias', `Remove alias "${alias.alias}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const activeChannels = channels.filter(c => c.is_active);
  const inactiveChannels = channels.filter(c => !c.is_active);

  const totalAliases = channels.reduce((sum, c) => sum + (c.aliases?.length || 0), 0);

  const renderChannelRow = (channel: MarketingChannel, isActive: boolean) => {
    const isExpanded = expandedChannelId === channel.id;
    const aliases = channel.aliases || [];

    return (
      <View key={channel.id}>
        <View style={[styles.channelRow, !isActive && styles.channelRowInactive]}>
          {editingId === channel.id ? (
            <View style={styles.editRow}>
              <TextInput
                style={styles.editInput}
                value={editName}
                onChangeText={setEditName}
                autoFocus
                onSubmitEditing={handleSaveEdit}
              />
              <TouchableOpacity style={styles.editSaveBtn} onPress={handleSaveEdit}>
                <Ionicons name="checkmark" size={18} color={COLORS.success} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.editCancelBtn} onPress={() => setEditingId(null)}>
                <Ionicons name="close" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TouchableOpacity style={styles.channelInfo} onPress={() => toggleExpand(channel.id)} activeOpacity={0.7}>
                <View style={[styles.statusDot, { backgroundColor: isActive ? COLORS.success : COLORS.textMuted }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.channelName, !isActive && styles.channelNameInactive]}>{channel.name}</Text>
                  {aliases.length > 0 && (
                    <Text style={styles.aliasCount}>
                      {aliases.length} alias{aliases.length !== 1 ? 'es' : ''}
                    </Text>
                  )}
                </View>
                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={COLORS.textMuted}
                  style={{ marginRight: 4 }}
                />
              </TouchableOpacity>
              {isActive && (
                <View style={styles.channelActions}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => startEdit(channel)}>
                    <Ionicons name="pencil" size={15} color={COLORS.accent} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => handleToggleActive(channel)}>
                    <Ionicons name="eye-off" size={15} color={COLORS.warning} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(channel)}>
                    <Ionicons name="trash" size={15} color={COLORS.danger} />
                  </TouchableOpacity>
                </View>
              )}
              {!isActive && (
                <View style={styles.channelActions}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => handleToggleActive(channel)}>
                    <Ionicons name="eye" size={15} color={COLORS.success} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(channel)}>
                    <Ionicons name="trash" size={15} color={COLORS.danger} />
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>

        {/* Expanded Alias Section */}
        {isExpanded && (
          <View style={styles.aliasSection}>
            <View style={styles.aliasSectionHeader}>
              <Ionicons name="git-branch-outline" size={14} color={COLORS.accent} />
              <Text style={styles.aliasSectionTitle}>Aliases for "{channel.name}"</Text>
            </View>
            <Text style={styles.aliasSectionHint}>
              Aliases are alternative names that automatically resolve to this channel during mass import.
            </Text>

            {/* Existing aliases */}
            {aliases.length > 0 ? (
              <View style={styles.aliasChipContainer}>
                {aliases.map((alias) => (
                  <View key={alias.id} style={styles.aliasChip}>
                    <Text style={styles.aliasChipText}>{alias.alias}</Text>
                    <TouchableOpacity
                      onPress={() => handleDeleteAlias(alias)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      style={styles.aliasChipRemove}
                    >
                      <Ionicons name="close-circle" size={16} color={COLORS.danger + '80'} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.noAliasesRow}>
                <Ionicons name="information-circle-outline" size={14} color={COLORS.textMuted} />
                <Text style={styles.noAliasesText}>No aliases defined yet</Text>
              </View>
            )}

            {/* Add new alias */}
            <View style={styles.addAliasRow}>
              <TextInput
                style={styles.addAliasInput}
                value={newAliasText}
                onChangeText={setNewAliasText}
                placeholder="Add alias (e.g., FB/IG, Facebook Ads)..."
                placeholderTextColor={COLORS.textMuted}
                onSubmitEditing={() => handleAddAlias(channel.id)}
              />
              <TouchableOpacity
                style={[styles.addAliasBtn, (!newAliasText.trim() || aliasLoading) && styles.addAliasBtnDisabled]}
                onPress={() => handleAddAlias(channel.id)}
                disabled={!newAliasText.trim() || aliasLoading}
              >
                {aliasLoading ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <Ionicons name="add" size={18} color={COLORS.white} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIcon}>
                <Ionicons name="settings" size={20} color={COLORS.white} />
              </View>
              <View>
                <Text style={styles.headerTitle}>Manage Channels</Text>
                <Text style={styles.headerSubtitle}>
                  {channels.length} channel{channels.length !== 1 ? 's' : ''}
                  {totalAliases > 0 ? ` · ${totalAliases} alias${totalAliases !== 1 ? 'es' : ''}` : ''}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          {error ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={16} color={COLORS.danger} />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={() => setError('')}>
                <Ionicons name="close-circle" size={16} color={COLORS.danger} />
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Add New Channel */}
          <View style={styles.addSection}>
            <Text style={styles.addLabel}>Add New Channel</Text>
            <View style={styles.addRow}>
              <TextInput
                style={styles.addInput}
                value={newChannelName}
                onChangeText={setNewChannelName}
                placeholder="Channel name..."
                placeholderTextColor={COLORS.textMuted}
                onSubmitEditing={handleAdd}
              />
              <TouchableOpacity
                style={[styles.addBtn, (!newChannelName.trim() || loading) && styles.addBtnDisabled]}
                onPress={handleAdd}
                disabled={!newChannelName.trim() || loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <Ionicons name="add" size={20} color={COLORS.white} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Alias Info Banner */}
          <View style={styles.aliasInfoBanner}>
            <Ionicons name="git-branch-outline" size={16} color={COLORS.accent} />
            <Text style={styles.aliasInfoText}>
              Tap a channel to manage its <Text style={{ fontWeight: '700' }}>aliases</Text> — alternative names that auto-resolve during mass import.
            </Text>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Active Channels */}
            <Text style={styles.sectionLabel}>
              Active Channels ({activeChannels.length})
            </Text>
            {activeChannels.map((channel) => renderChannelRow(channel, true))}

            {/* Inactive Channels */}
            {inactiveChannels.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: SPACING.lg }]}>
                  Inactive Channels ({inactiveChannels.length})
                </Text>
                {inactiveChannels.map((channel) => renderChannelRow(channel, false))}
              </>
            )}

            <View style={{ height: 30 }} />
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.primary,
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.dangerLight,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  errorText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.danger,
    fontWeight: '600',
    flex: 1,
  },
  addSection: {
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  addLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  addRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  addInput: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  addBtn: {
    width: 42,
    height: 42,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnDisabled: {
    opacity: 0.5,
  },
  // Alias info banner
  aliasInfoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accent + '10',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  aliasInfoText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    flex: 1,
    lineHeight: 18,
  },
  body: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  sectionLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: 4,
    ...SHADOWS.sm,
  },
  channelRowInactive: {
    opacity: 0.7,
    backgroundColor: COLORS.borderLight,
  },
  channelInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  channelName: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.text,
  },
  channelNameInactive: {
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  aliasCount: {
    fontSize: 10,
    color: COLORS.accent,
    fontWeight: '600',
    marginTop: 1,
  },
  channelActions: {
    flexDirection: 'row',
    gap: 4,
  },
  actionBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
  },
  editInput: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: '600',
    borderBottomWidth: 2,
    borderBottomColor: COLORS.accent,
    paddingVertical: 4,
  },
  editSaveBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.successLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editCancelBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Alias Section (expanded)
  aliasSection: {
    backgroundColor: COLORS.white,
    marginTop: -2,
    marginBottom: 4,
    marginLeft: SPACING.md,
    marginRight: 0,
    borderRadius: BORDER_RADIUS.md,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    padding: SPACING.md,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
    ...SHADOWS.sm,
  },
  aliasSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  aliasSectionTitle: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.primary,
  },
  aliasSectionHint: {
    fontSize: 10,
    color: COLORS.textMuted,
    lineHeight: 14,
    marginBottom: SPACING.sm,
  },
  aliasChipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: SPACING.sm,
  },
  aliasChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accent + '12',
    borderRadius: BORDER_RADIUS.full,
    paddingLeft: SPACING.md,
    paddingRight: 6,
    paddingVertical: 4,
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.accent + '25',
  },
  aliasChipText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.accent,
  },
  aliasChipRemove: {
    padding: 2,
  },
  noAliasesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: SPACING.sm,
  },
  noAliasesText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  addAliasRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  addAliasInput: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    fontSize: FONT_SIZES.xs,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  addAliasBtn: {
    width: 32,
    height: 32,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addAliasBtnDisabled: {
    opacity: 0.5,
  },
  footer: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  doneBtn: {
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  doneBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.white,
  },
});
