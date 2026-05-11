import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../../constants/theme';
const ALL_ROLE_OPTIONS = [
  { label: 'Client', value: 'client', icon: 'person' as const, color: COLORS.accent },
  { label: 'Trainer', value: 'trainer', icon: 'fitness' as const, color: COLORS.success },
  { label: 'Dietitian', value: 'dietitian', icon: 'nutrition' as const, color: '#9b59b6' },
  { label: 'Franchise Manager', value: 'franchise_manager', icon: 'business' as const, color: COLORS.warning },
];

// Franchise managers can only add clients, trainers, and dietitians (not admins or other franchise managers)
const FM_ROLE_OPTIONS = ALL_ROLE_OPTIONS.filter(r => r.value === 'client' || r.value === 'trainer' || r.value === 'dietitian');

const FRANCHISE_OPTIONS = [
  'Collin County', 'Grayson County', 'Park Cities', 'Lake Cities',
];


interface ApprovedEmailFormProps {
  onSubmit: (data: {
    email: string;
    role: string;
    full_name?: string;
    franchise?: string;
  }) => Promise<void>;
  isSubmitting: boolean;
  userRole?: string;
  userFranchise?: string | null;
}

export default function ApprovedEmailForm({ onSubmit, isSubmitting, userRole, userFranchise }: ApprovedEmailFormProps) {
  const isFranchiseManager = userRole === 'franchise_manager';
  const ROLE_OPTIONS = isFranchiseManager ? FM_ROLE_OPTIONS : ALL_ROLE_OPTIONS;

  const [email, setEmail] = useState('');
  const [role, setRole] = useState('client');
  const [fullName, setFullName] = useState('');
  // For franchise managers, auto-set franchise to their own and lock it
  const [franchise, setFranchise] = useState(isFranchiseManager && userFranchise ? userFranchise : '');
  const [showFranchisePicker, setShowFranchisePicker] = useState(false);
  const [error, setError] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);


  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleSubmit = async () => {
    setError('');

    if (!email.trim()) {
      setError('Email address is required');
      return;
    }

    if (!validateEmail(email.trim())) {
      setError('Please enter a valid email address');
      return;
    }

    try {
      // For franchise managers, always use their franchise
      const submitFranchise = isFranchiseManager && userFranchise ? userFranchise : (franchise || undefined);

      await onSubmit({
        email: email.trim().toLowerCase(),
        role,
        full_name: fullName.trim() || undefined,
        franchise: submitFranchise,
      });

      // Reset form on success (but keep franchise for franchise managers)
      setEmail('');
      setFullName('');
      if (!isFranchiseManager) setFranchise('');
      setRole('client');
      setIsExpanded(false);
    } catch (err: any) {
      setError(err.message || 'Failed to add email');
    }
  };

  // For franchise managers, lock the franchise field
  const franchiseLocked = isFranchiseManager && !!userFranchise;

  return (

    <View style={styles.container}>
      <TouchableOpacity
        style={styles.headerRow}
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <View style={styles.iconCircle}>
            <Ionicons name="person-add" size={18} color={COLORS.white} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Add Approved Email</Text>
            <Text style={styles.headerSubtitle}>Pre-approve users for app access</Text>
          </View>
        </View>
        <Ionicons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={COLORS.textMuted}
        />
      </TouchableOpacity>

      {isExpanded && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.formBody}>
            {/* Email Field */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email Address *</Text>
              <View style={styles.inputRow}>
                <Ionicons name="mail-outline" size={18} color={COLORS.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={(text) => { setEmail(text); setError(''); }}
                  placeholder="user@example.com"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isSubmitting}
                />
              </View>
            </View>

            {/* Role Selection */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Role *</Text>
              <View style={styles.roleRow}>
                {ROLE_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.roleChip,
                      role === opt.value && { backgroundColor: opt.color + '15', borderColor: opt.color },
                    ]}
                    onPress={() => setRole(opt.value)}
                    disabled={isSubmitting}
                  >
                    <Ionicons
                      name={opt.icon}
                      size={14}
                      color={role === opt.value ? opt.color : COLORS.textMuted}
                    />
                    <Text
                      style={[
                        styles.roleChipText,
                        role === opt.value && { color: opt.color, fontWeight: '700' },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Full Name Field */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Full Name</Text>
              <View style={styles.inputRow}>
                <Ionicons name="person-outline" size={18} color={COLORS.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="John Doe (optional)"
                  placeholderTextColor={COLORS.textMuted}
                  autoCapitalize="words"
                  editable={!isSubmitting}
                />
              </View>
            </View>

            {/* Franchise Field */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Franchise Location</Text>
              <TouchableOpacity
                style={styles.inputRow}
                onPress={() => setShowFranchisePicker(!showFranchisePicker)}
                disabled={isSubmitting}
              >
                <Ionicons name="business-outline" size={18} color={COLORS.textMuted} style={styles.inputIcon} />
                <Text style={[styles.pickerText, !franchise && { color: COLORS.textMuted }]}>
                  {franchise || 'Select franchise (optional)'}
                </Text>
                <Ionicons
                  name={showFranchisePicker ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={COLORS.textMuted}
                />
              </TouchableOpacity>
              {showFranchisePicker && (
                <View style={styles.franchiseList}>
                  <TouchableOpacity
                    style={[styles.franchiseOption, !franchise && styles.franchiseOptionActive]}
                    onPress={() => { setFranchise(''); setShowFranchisePicker(false); }}
                  >
                    <Text style={[styles.franchiseOptionText, !franchise && styles.franchiseOptionTextActive]}>
                      None
                    </Text>
                  </TouchableOpacity>
                  {FRANCHISE_OPTIONS.map((f) => (
                    <TouchableOpacity
                      key={f}
                      style={[styles.franchiseOption, franchise === f && styles.franchiseOptionActive]}
                      onPress={() => { setFranchise(f); setShowFranchisePicker(false); }}
                    >
                      <Text style={[styles.franchiseOptionText, franchise === f && styles.franchiseOptionTextActive]}>
                        {f}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Error Message */}
            {error ? (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle" size={16} color={COLORS.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={isSubmitting}
              activeOpacity={0.8}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <>
                  <Ionicons name="add-circle" size={18} color={COLORS.white} />
                  <Text style={styles.submitBtnText}>Add Approved Email</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    ...SHADOWS.md,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.lg,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.primary,
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  formBody: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    gap: SPACING.md,
  },
  fieldGroup: {
    gap: SPACING.xs,
  },
  label: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginLeft: 2,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    height: 44,
  },
  inputIcon: {
    marginRight: SPACING.sm,
  },
  input: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    height: 44,
  },
  pickerText: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },
  roleRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  roleChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  roleChipText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  franchiseList: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: SPACING.xs,
    maxHeight: 200,
    overflow: 'hidden',
  },
  franchiseOption: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  franchiseOptionActive: {
    backgroundColor: COLORS.brandBlueLight,
  },
  franchiseOptionText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
  },
  franchiseOptionTextActive: {
    color: COLORS.accent,
    fontWeight: '700',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.dangerLight,
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
  },
  errorText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.danger,
    fontWeight: '500',
    flex: 1,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accent,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    marginTop: SPACING.xs,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.white,
  },
});
