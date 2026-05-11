import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import {
  SevenStrategiesInput,
  parseStrategiesCSV,
  generateEntriesCSVTemplate,
  ParsedStrategyRow,
  StrategyCSVParseResult,
  upsertEntry,
  formatCurrency,
  getMonthLabel,
} from '../../lib/sevenStrategiesService';

interface Franchise {
  id: string;
  name: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  franchises: Franchise[];
  selectedMonth: string;
  userFranchiseId?: string | null;
  userFranchiseName?: string | null;
}

type Step = 'input' | 'review' | 'importing' | 'results';

interface ImportResult {
  totalSubmitted: number;
  successCount: number;
  errorCount: number;
  errors: string[];
}

export default function SevenStrategiesCSVUploadModal({
  visible, onClose, onSuccess, franchises, selectedMonth,
  userFranchiseId, userFranchiseName,
}: Props) {
  const [step, setStep] = useState<Step>('input');
  const [csvText, setCsvText] = useState('');
  const [parseResult, setParseResult] = useState<StrategyCSVParseResult | null>(null);
  const [editedRows, setEditedRows] = useState<ParsedStrategyRow[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [error, setError] = useState('');
  const [showTemplate, setShowTemplate] = useState(false);

  const franchiseLookup = new Map<string, string>();
  franchises.forEach(f => franchiseLookup.set(f.name.toLowerCase(), f.id));

  const resetModal = () => {
    setStep('input');
    setCsvText('');
    setParseResult(null);
    setEditedRows([]);
    setImportResult(null);
    setImportProgress(0);
    setError('');
    setShowTemplate(false);
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  const handleParse = () => {
    if (!csvText.trim()) {
      setError('Please paste or enter your CSV data.');
      return;
    }
    setError('');

    const result = parseStrategiesCSV(
      csvText,
      franchiseLookup,
      userFranchiseId || undefined,
      userFranchiseName || undefined,
      selectedMonth,
    );

    if (result.rows.length === 0) {
      setError('No data rows found. Please check your format.');
      return;
    }

    setParseResult(result);
    setEditedRows([...result.rows]);
    setStep('review');
  };

  const removeRow = (idx: number) => {
    setEditedRows(prev => prev.filter((_, i) => i !== idx));
  };

  const handleImport = async () => {
    const validRows = editedRows.filter(r => r.isValid);
    if (validRows.length === 0) {
      setError('No valid rows to import.');
      return;
    }

    setStep('importing');
    setImportProgress(0);
    setError('');

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      setImportProgress(Math.round(((i + 1) / validRows.length) * 100));

      // Resolve franchise_id
      let franchise_id = franchiseLookup.get(row.franchise_name.toLowerCase()) || '';
      let franchise_name = row.franchise_name;

      // If user is franchise-scoped, use their franchise
      if (userFranchiseId && !franchise_id) {
        franchise_id = userFranchiseId;
        franchise_name = userFranchiseName || franchise_name;
      }

      if (!franchise_id) {
        errorCount++;
        errors.push(`Row ${row.rowIndex}: Could not resolve franchise "${row.franchise_name}"`);
        continue;
      }

      const input: SevenStrategiesInput = {
        franchise_id,
        franchise_name,
        month: row.month,
        lead_count: row.lead_count,
        call_count: row.call_count,
        jumpstart_count: row.jumpstart_count,
        new_client_count: row.new_client_count,
        total_client_count: row.total_client_count,
        clients_lost: row.clients_lost,
        total_revenue: row.total_revenue,
        total_expenses: row.total_expenses,
      };

      try {
        await upsertEntry(input);
        successCount++;
      } catch (err: any) {
        errorCount++;
        errors.push(`Row ${row.rowIndex} (${franchise_name}): ${err?.message || 'Failed'}`);
      }
    }

    setImportResult({
      totalSubmitted: validRows.length,
      successCount,
      errorCount,
      errors,
    });
    setStep('results');

    if (successCount > 0) {
      onSuccess();
    }
  };

  // ─── Step 1: Input ───
  const renderInput = () => (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Instructions */}
      <View style={styles.instructionCard}>
        <View style={styles.instructionHeader}>
          <Ionicons name="information-circle" size={20} color={COLORS.accent} />
          <Text style={styles.instructionTitle}>CSV Upload for 7 Strategies</Text>
        </View>
        <Text style={styles.instructionText}>
          Paste your entry data below. Each row should contain the raw numbers for one franchise/month combination. The system will upsert (insert or update) each entry.
        </Text>
        <View style={styles.instructionColumns}>
          {['Franchise', 'Month (YYYY-MM)', 'Leads', 'Conversations', 'Jumpstarts', 'New Clients', 'Total Clients', 'Clients Lost', 'Total Revenue', 'Total Expenses'].map((col, i) => (
            <View key={i} style={styles.instructionColumn}>
              <Ionicons
                name={i < 2 ? 'checkmark-circle' : 'remove-circle'}
                size={14}
                color={i < 2 ? COLORS.success : COLORS.textMuted}
              />
              <Text style={styles.instructionColumnText}>
                {col} {i < 2 ? '(required)' : '(numeric)'}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Template */}
      <TouchableOpacity
        style={styles.templateToggle}
        onPress={() => setShowTemplate(!showTemplate)}
        activeOpacity={0.7}
      >
        <Ionicons name="code-slash" size={16} color={COLORS.accent} />
        <Text style={styles.templateToggleText}>
          {showTemplate ? 'Hide Template' : 'Show CSV Template'}
        </Text>
        <Ionicons name={showTemplate ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.accent} />
      </TouchableOpacity>

      {showTemplate && (
        <View style={styles.templateBox}>
          <Text style={styles.templateCode}>{generateEntriesCSVTemplate()}</Text>
          <TouchableOpacity
            style={styles.useTemplateBtn}
            onPress={() => { setCsvText(generateEntriesCSVTemplate()); setShowTemplate(false); }}
          >
            <Ionicons name="copy-outline" size={14} color={COLORS.accent} />
            <Text style={styles.useTemplateBtnText}>Use Template</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* CSV Input */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>
          Paste Data <Text style={styles.required}>*</Text>
        </Text>
        <View style={styles.csvInputContainer}>
          <TextInput
            style={styles.csvInput}
            value={csvText}
            onChangeText={(text) => { setCsvText(text); setError(''); }}
            placeholder={'Franchise,Month,Leads,Conversations,Jumpstarts,New Clients,Total Clients,Clients Lost,Total Revenue,Total Expenses\nCollin County,2026-03,120,80,40,25,200,5,50000,20000'}
            placeholderTextColor={COLORS.textMuted}
            multiline
            numberOfLines={10}
            textAlignVertical="top"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {csvText.length > 0 && (
            <View style={styles.csvInputFooter}>
              <Text style={styles.csvLineCount}>
                {csvText.split('\n').filter(l => l.trim()).length} line(s)
              </Text>
              <TouchableOpacity onPress={() => setCsvText('')} style={styles.clearBtn}>
                <Ionicons name="trash-outline" size={14} color={COLORS.danger} />
                <Text style={styles.clearBtnText}>Clear</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* Error */}
      {error ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={16} color={COLORS.danger} />
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      ) : null}

      {/* Parse Button */}
      <TouchableOpacity style={styles.primaryBtn} onPress={handleParse} activeOpacity={0.8}>
        <Ionicons name="scan-outline" size={20} color={COLORS.white} />
        <Text style={styles.primaryBtnText}>Parse & Review</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );

  // ─── Step 2: Review ───
  const renderReview = () => {
    const validRows = editedRows.filter(r => r.isValid);
    const errorRows = editedRows.filter(r => !r.isValid);

    return (
      <View style={{ flex: 1 }}>
        {/* Summary Bar */}
        <View style={styles.summaryBar}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{editedRows.length}</Text>
            <Text style={styles.summaryLabel}>Total</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: COLORS.success }]}>{validRows.length}</Text>
            <Text style={styles.summaryLabel}>Valid</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: COLORS.danger }]}>{errorRows.length}</Text>
            <Text style={styles.summaryLabel}>Errors</Text>
          </View>
        </View>

        {error ? (
          <View style={[styles.errorBanner, { marginHorizontal: SPACING.lg, marginTop: SPACING.sm }]}>
            <Ionicons name="alert-circle" size={16} color={COLORS.danger} />
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        ) : null}

        {/* Row List */}
        <FlatList
          data={editedRows}
          keyExtractor={(_, i) => `row-${i}`}
          contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: 120 }}
          renderItem={({ item, index }) => (
            <View style={[styles.rowCard, !item.isValid && styles.rowCardError]}>
              <View style={styles.rowCardHeader}>
                <View style={styles.rowCardLeft}>
                  <View style={[
                    styles.rowNumberBadge,
                    !item.isValid && styles.rowNumberBadgeError,
                  ]}>
                    <Text style={[styles.rowNumberText, !item.isValid && { color: COLORS.danger }]}>
                      {item.rowIndex}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {item.franchise_name || '(No franchise)'}
                    </Text>
                    <Text style={styles.rowMonth}>
                      {item.month ? getMonthLabel(item.month) : '(No month)'}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => removeRow(index)} style={styles.removeRowBtn}>
                  <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Data summary */}
              <View style={styles.rowDataGrid}>
                <View style={styles.rowDataItem}>
                  <Text style={styles.rowDataLabel}>Leads</Text>
                  <Text style={styles.rowDataValue}>{item.lead_count}</Text>
                </View>
                <View style={styles.rowDataItem}>
                  <Text style={styles.rowDataLabel}>Conv.</Text>
                  <Text style={styles.rowDataValue}>{item.call_count}</Text>
                </View>
                <View style={styles.rowDataItem}>
                  <Text style={styles.rowDataLabel}>JS</Text>
                  <Text style={styles.rowDataValue}>{item.jumpstart_count}</Text>
                </View>
                <View style={styles.rowDataItem}>
                  <Text style={styles.rowDataLabel}>New</Text>
                  <Text style={styles.rowDataValue}>{item.new_client_count}</Text>
                </View>
                <View style={styles.rowDataItem}>
                  <Text style={styles.rowDataLabel}>Total</Text>
                  <Text style={styles.rowDataValue}>{item.total_client_count}</Text>
                </View>
                <View style={styles.rowDataItem}>
                  <Text style={styles.rowDataLabel}>Lost</Text>
                  <Text style={[styles.rowDataValue, { color: COLORS.danger }]}>{item.clients_lost}</Text>
                </View>
                <View style={styles.rowDataItem}>
                  <Text style={styles.rowDataLabel}>Rev</Text>
                  <Text style={[styles.rowDataValue, { color: COLORS.success }]}>{formatCurrency(item.total_revenue)}</Text>
                </View>
                <View style={styles.rowDataItem}>
                  <Text style={styles.rowDataLabel}>Exp</Text>
                  <Text style={[styles.rowDataValue, { color: COLORS.danger }]}>{formatCurrency(item.total_expenses)}</Text>
                </View>
              </View>

              {/* Errors */}
              {item.errors.length > 0 && (
                <View style={styles.rowErrors}>
                  {item.errors.map((err, ei) => (
                    <View key={ei} style={styles.rowErrorItem}>
                      <Ionicons name="alert-circle" size={12} color={COLORS.danger} />
                      <Text style={styles.rowErrorText}>{err}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No rows to display</Text>
            </View>
          }
        />

        {/* Bottom Action Bar */}
        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => setStep('input')}>
            <Ionicons name="arrow-back" size={18} color={COLORS.textSecondary} />
            <Text style={styles.backBtnText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.importBtn, validRows.length === 0 && styles.importBtnDisabled]}
            onPress={handleImport}
            disabled={validRows.length === 0}
            activeOpacity={0.8}
          >
            <Ionicons name="cloud-upload" size={18} color={COLORS.white} />
            <Text style={styles.importBtnText}>
              Import {validRows.length} {validRows.length === 1 ? 'Entry' : 'Entries'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ─── Step 3: Importing ───
  const renderImporting = () => (
    <View style={styles.centerContent}>
      <ActivityIndicator size="large" color={COLORS.accent} />
      <Text style={styles.importingTitle}>Importing Entries...</Text>
      <Text style={styles.importingSubtitle}>
        Please wait while we process your data
      </Text>
      <View style={styles.progressBarContainer}>
        <View style={[styles.progressBar, { width: `${importProgress}%` }]} />
      </View>
      <Text style={styles.progressText}>{importProgress}%</Text>
    </View>
  );

  // ─── Step 4: Results ───
  const renderResults = () => {
    if (!importResult) return null;
    const allSuccess = importResult.successCount === importResult.totalSubmitted;

    return (
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.resultIconContainer}>
          <View style={[styles.resultIconCircle, allSuccess ? styles.resultIconSuccess : styles.resultIconWarning]}>
            <Ionicons
              name={allSuccess ? 'checkmark' : 'alert'}
              size={48}
              color={COLORS.white}
            />
          </View>
        </View>

        <Text style={styles.resultTitle}>
          {allSuccess ? 'Import Complete!' : 'Import Completed with Issues'}
        </Text>
        <Text style={styles.resultSubtitle}>
          {importResult.successCount} of {importResult.totalSubmitted} entries were successfully imported
        </Text>

        {/* Result Stats */}
        <View style={styles.resultStats}>
          <View style={styles.resultStatRow}>
            <View style={[styles.resultStatDot, { backgroundColor: COLORS.success }]} />
            <Text style={styles.resultStatLabel}>Successfully imported</Text>
            <Text style={styles.resultStatValue}>{importResult.successCount}</Text>
          </View>
          {importResult.errorCount > 0 && (
            <View style={styles.resultStatRow}>
              <View style={[styles.resultStatDot, { backgroundColor: COLORS.danger }]} />
              <Text style={styles.resultStatLabel}>Failed</Text>
              <Text style={styles.resultStatValue}>{importResult.errorCount}</Text>
            </View>
          )}
        </View>

        {/* Error Details */}
        {importResult.errors.length > 0 && (
          <View style={styles.errorDetails}>
            <Text style={styles.errorDetailsTitle}>Error Details</Text>
            {importResult.errors.map((err, i) => (
              <View key={i} style={styles.errorDetailRow}>
                <Ionicons name="alert-circle" size={14} color={COLORS.danger} />
                <Text style={styles.errorDetailText}>{err}</Text>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity style={styles.primaryBtn} onPress={handleClose} activeOpacity={0.8}>
          <Ionicons name="checkmark-circle" size={20} color={COLORS.white} />
          <Text style={styles.primaryBtnText}>Done</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.importAnotherBtn}
          onPress={resetModal}
          activeOpacity={0.7}
        >
          <Ionicons name="add-circle-outline" size={18} color={COLORS.accent} />
          <Text style={styles.importAnotherBtnText}>Import Another Batch</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    );
  };

  const getStepTitle = () => {
    switch (step) {
      case 'input': return 'Paste Your Data';
      case 'review': return 'Review & Confirm';
      case 'importing': return 'Importing...';
      case 'results': return 'Import Results';
    }
  };

  const getStepSubtitle = () => {
    switch (step) {
      case 'input': return 'Step 1 of 3';
      case 'review': return 'Step 2 of 3';
      case 'importing': return 'Step 3 of 3';
      case 'results': return 'Complete';
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardView}
        >
          <View style={styles.modalContainer}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <View style={styles.headerIconCircle}>
                  <Ionicons name="cloud-upload" size={20} color={COLORS.white} />
                </View>
                <View>
                  <Text style={styles.modalTitle}>CSV Upload</Text>
                  <Text style={styles.modalSubtitle}>{getStepSubtitle()} — {getStepTitle()}</Text>
                </View>
              </View>
              {step !== 'importing' && (
                <TouchableOpacity style={styles.closeBtn} onPress={handleClose} activeOpacity={0.7}>
                  <Ionicons name="close" size={22} color={COLORS.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Step Indicator */}
            <View style={styles.stepIndicator}>
              <View style={[styles.stepDot, (step === 'input' || step === 'review' || step === 'importing' || step === 'results') && styles.stepDotActive]} />
              <View style={[styles.stepLine, (step === 'review' || step === 'importing' || step === 'results') && styles.stepLineActive]} />
              <View style={[styles.stepDot, (step === 'review' || step === 'importing' || step === 'results') && styles.stepDotActive]} />
              <View style={[styles.stepLine, (step === 'importing' || step === 'results') && styles.stepLineActive]} />
              <View style={[styles.stepDot, (step === 'results') && styles.stepDotActive]} />
            </View>

            {/* Content */}
            {step === 'input' && renderInput()}
            {step === 'review' && renderReview()}
            {step === 'importing' && renderImporting()}
            {step === 'results' && renderResults()}
          </View>
        </KeyboardAvoidingView>
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
  keyboardView: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: BORDER_RADIUS.xxl,
    borderTopRightRadius: BORDER_RADIUS.xxl,
    maxHeight: '94%',
    minHeight: '60%',
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  headerIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: COLORS.primary,
  },
  modalSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Step indicator
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.borderLight,
  },
  stepDotActive: {
    backgroundColor: COLORS.accent,
  },
  stepLine: {
    width: 40,
    height: 2,
    backgroundColor: COLORS.borderLight,
  },
  stepLineActive: {
    backgroundColor: COLORS.accent,
  },
  // Scroll
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.md },
  // Instructions
  instructionCard: {
    backgroundColor: COLORS.brandBlueLight,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  instructionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  instructionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.primary,
  },
  instructionText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: SPACING.md,
  },
  instructionColumns: {
    gap: SPACING.xs,
  },
  instructionColumn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  instructionColumnText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  // Template
  templateToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  templateToggleText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.accent,
    flex: 1,
  },
  templateBox: {
    backgroundColor: '#1a1a2e',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  templateCode: {
    fontSize: FONT_SIZES.xs,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#e0e0e0',
    lineHeight: 18,
  },
  useTemplateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.md,
    alignSelf: 'flex-end',
  },
  useTemplateBtnText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.accent,
  },
  // Fields
  fieldGroup: {
    marginBottom: SPACING.md,
  },
  label: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
    marginLeft: 2,
  },
  required: {
    color: COLORS.danger,
  },
  // CSV Input
  csvInputContainer: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  csvInput: {
    fontSize: FONT_SIZES.sm,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: COLORS.text,
    padding: SPACING.md,
    minHeight: 180,
    maxHeight: 300,
  },
  csvInputFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    backgroundColor: COLORS.white,
  },
  csvLineCount: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  clearBtnText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.danger,
    fontWeight: '600',
  },
  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.dangerLight,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  errorBannerText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.danger,
  },
  // Buttons
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accent,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.lg,
    marginTop: SPACING.md,
    ...SHADOWS.md,
  },
  primaryBtnText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.white,
  },
  // Summary bar
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: COLORS.white,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: COLORS.primary,
  },
  summaryLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryDivider: {
    width: 1,
    height: 28,
    backgroundColor: COLORS.borderLight,
  },
  // Row cards
  rowCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...SHADOWS.sm,
  },
  rowCardError: {
    borderColor: COLORS.danger,
    backgroundColor: '#fff5f5',
  },
  rowCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
  },
  rowNumberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.brandBlueLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowNumberBadgeError: {
    backgroundColor: COLORS.dangerLight,
  },
  rowNumberText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.accent,
  },
  rowName: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.primary,
  },
  rowMonth: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  removeRowBtn: {
    padding: 2,
  },
  // Data grid
  rowDataGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  rowDataItem: {
    minWidth: 50,
    alignItems: 'center',
  },
  rowDataLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  rowDataValue: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 1,
  },
  // Row errors
  rowErrors: {
    marginTop: SPACING.sm,
    gap: 4,
  },
  rowErrorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rowErrorText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.danger,
    fontWeight: '500',
  },
  // Bottom bar
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    backgroundColor: COLORS.white,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  backBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  importBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.success,
    ...SHADOWS.md,
  },
  importBtnDisabled: {
    backgroundColor: COLORS.textMuted,
    opacity: 0.6,
  },
  importBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  // Importing
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xxxl,
  },
  importingTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: SPACING.xl,
    textAlign: 'center',
  },
  importingSubtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
  progressBarContainer: {
    width: '80%',
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.borderLight,
    marginTop: SPACING.xl,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: COLORS.accent,
  },
  progressText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
  },
  // Results
  resultIconContainer: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
    marginTop: SPACING.lg,
  },
  resultIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultIconSuccess: {
    backgroundColor: COLORS.success,
  },
  resultIconWarning: {
    backgroundColor: COLORS.warning,
  },
  resultTitle: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '800',
    color: COLORS.primary,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  resultSubtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  resultStats: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  resultStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  resultStatDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  resultStatLabel: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  resultStatValue: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.primary,
  },
  errorDetails: {
    backgroundColor: '#fff5f5',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.dangerLight,
  },
  errorDetailsTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.danger,
    marginBottom: SPACING.sm,
  },
  errorDetailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  errorDetailText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.danger,
    lineHeight: 18,
  },
  importAnotherBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    marginTop: SPACING.sm,
  },
  importAnotherBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.accent,
  },
  // Empty
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
});
