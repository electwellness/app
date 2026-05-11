import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import { biometricMeta } from '../../data/clientPortalData';
import type { BiometricEntry } from '../../data/clientPortalData';
import type { DateRange } from './DateRangeSelector';
import {
  generateCSV,
  downloadCSV,
  generatePDFHTML,
  openPDFInNewWindow,
} from '../../lib/biometricExportService';

interface ExportPanelProps {
  data: BiometricEntry[];
  clientName: string;
  dateRange: DateRange | null;
  selectedMetrics: string[];
  onMetricsChange: (metrics: string[]) => void;
}

const ALL_METRIC_KEYS = Object.keys(biometricMeta);

const METRIC_CATEGORIES = [
  { label: 'Cardiovascular', keys: ['bloodPressureSys', 'bloodPressureDia', 'heartRate'] },

  { label: 'Body Composition', keys: ['weight', 'bodyFat', 'bmi', 'muscleMassPct', 'leanMusclePct', 'fatMass', 'leanMuscleMass', 'muscleMass', 'massPerMuscleLb', 'visceralFat'] },

  { label: 'Measurements', keys: ['navelWaist', 'widestWaist', 'narrowestWaist', 'shoulders', 'bicep', 'sideHip', 'rearHip', 'calf'] },
  { label: 'Performance', keys: ['flexibility', 'gripStrength'] },
];



export default function ExportPanel({
  data,
  clientName,
  dateRange,
  selectedMetrics,
  onMetricsChange,
}: ExportPanelProps) {
  const [showModal, setShowModal] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'csv' | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  const filteredData = dateRange
    ? data.filter(e => e.date >= dateRange.start && e.date <= dateRange.end)
    : data;

  const handleExportCSV = async () => {
    setExporting('csv');
    setExportSuccess(null);

    try {
      // Small delay for UX
      await new Promise(r => setTimeout(r, 300));

      const csv = generateCSV(
        data,
        clientName,
        dateRange ? { start: dateRange.start, end: dateRange.end } : undefined
      );

      const filename = `biometrics_${clientName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
      downloadCSV(csv, filename);
      setExportSuccess('CSV downloaded successfully!');
    } catch (err) {
      console.error('CSV export error:', err);
      setExportSuccess('Export failed. Please try again.');
    } finally {
      setExporting(null);
    }
  };

  const handleExportPDF = async () => {
    setExporting('pdf');
    setExportSuccess(null);

    try {
      await new Promise(r => setTimeout(r, 300));

      const html = generatePDFHTML({
        clientName,
        dateRange: dateRange ? { start: dateRange.start, end: dateRange.end } : undefined,
        selectedMetrics,
        data,
      });

      openPDFInNewWindow(html);
      setExportSuccess('PDF report opened in new tab!');
    } catch (err) {
      console.error('PDF export error:', err);
      setExportSuccess('Export failed. Please try again.');
    } finally {
      setExporting(null);
    }
  };

  const toggleMetric = (key: string) => {
    if (selectedMetrics.includes(key)) {
      if (selectedMetrics.length > 1) {
        onMetricsChange(selectedMetrics.filter(k => k !== key));
      }
    } else {
      onMetricsChange([...selectedMetrics, key]);
    }
  };

  const selectCategory = (keys: string[]) => {
    const allSelected = keys.every(k => selectedMetrics.includes(k));
    if (allSelected) {
      const remaining = selectedMetrics.filter(k => !keys.includes(k));
      onMetricsChange(remaining.length > 0 ? remaining : [keys[0]]);
    } else {
      const merged = [...new Set([...selectedMetrics, ...keys])];
      onMetricsChange(merged);
    }
  };

  return (
    <View style={styles.container}>
      {/* Quick Export Buttons */}
      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={styles.exportBtn}
          onPress={handleExportPDF}
          activeOpacity={0.7}
          disabled={exporting !== null}
        >
          {exporting === 'pdf' ? (
            <ActivityIndicator size="small" color={COLORS.accent} />
          ) : (
            <Ionicons name="document-text-outline" size={18} color={COLORS.accent} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.exportBtnTitle}>Download Report</Text>
            <Text style={styles.exportBtnSubtitle}>PDF with charts & summary</Text>
          </View>
          <Ionicons name="download-outline" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.exportBtn}
          onPress={handleExportCSV}
          activeOpacity={0.7}
          disabled={exporting !== null}
        >
          {exporting === 'csv' ? (
            <ActivityIndicator size="small" color="#2ecc71" />
          ) : (
            <Ionicons name="grid-outline" size={18} color="#2ecc71" />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.exportBtnTitle}>Export Raw Data</Text>
            <Text style={styles.exportBtnSubtitle}>CSV for Excel / Sheets</Text>
          </View>
          <Ionicons name="download-outline" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Success message */}
      {exportSuccess && (
        <View style={styles.successBanner}>
          <Ionicons
            name={exportSuccess.includes('failed') ? 'alert-circle' : 'checkmark-circle'}
            size={16}
            color={exportSuccess.includes('failed') ? '#e74c3c' : '#2ecc71'}
          />
          <Text
            style={[
              styles.successText,
              { color: exportSuccess.includes('failed') ? '#e74c3c' : '#2ecc71' },
            ]}
          >
            {exportSuccess}
          </Text>
        </View>
      )}

      {/* Metric Selection Button */}
      <TouchableOpacity
        style={styles.metricSelectBtn}
        onPress={() => setShowModal(true)}
        activeOpacity={0.7}
      >
        <Ionicons name="options-outline" size={16} color={COLORS.accent} />
        <Text style={styles.metricSelectText}>
          {selectedMetrics.length} metrics selected for charts & export
        </Text>
        <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
      </TouchableOpacity>

      {/* Data info */}
      <View style={styles.dataInfo}>
        <Ionicons name="information-circle-outline" size={14} color={COLORS.textMuted} />
        <Text style={styles.dataInfoText}>
          {filteredData.length} measurements
          {dateRange ? ` (${dateRange.label})` : ' (all time)'}
          {' '}&bull; Exports reflect current filters
        </Text>
      </View>

      {/* Metric Selection Modal */}
      <Modal visible={showModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Metrics</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Choose which metrics to display in charts and include in exports.
            </Text>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {METRIC_CATEGORIES.map(cat => {
                const allSelected = cat.keys.every(k => selectedMetrics.includes(k));
                return (
                  <View key={cat.label} style={styles.categorySection}>
                    <TouchableOpacity
                      style={styles.categoryHeader}
                      onPress={() => selectCategory(cat.keys)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.checkbox, allSelected && styles.checkboxActive]}>
                        {allSelected && <Ionicons name="checkmark" size={12} color="#fff" />}
                      </View>
                      <Text style={styles.categoryLabel}>{cat.label}</Text>
                      <Text style={styles.categoryCount}>
                        {cat.keys.filter(k => selectedMetrics.includes(k)).length}/{cat.keys.length}
                      </Text>
                    </TouchableOpacity>

                    <View style={styles.metricList}>
                      {cat.keys.map(key => {
                        const meta = biometricMeta[key];
                        if (!meta) return null;
                        const isSelected = selectedMetrics.includes(key);
                        return (
                          <TouchableOpacity
                            key={key}
                            style={[styles.metricItem, isSelected && styles.metricItemActive]}
                            onPress={() => toggleMetric(key)}
                            activeOpacity={0.7}
                          >
                            <View style={[styles.metricDot, { backgroundColor: meta.color }]} />
                            <Text
                              style={[
                                styles.metricItemText,
                                isSelected && { color: COLORS.text, fontWeight: '700' },
                              ]}
                            >
                              {meta.label}
                            </Text>
                            {isSelected && (
                              <Ionicons name="checkmark-circle" size={16} color={COLORS.accent} />
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
              <View style={{ height: 20 }} />
            </ScrollView>

            <TouchableOpacity
              style={styles.doneBtn}
              onPress={() => setShowModal(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.doneBtnText}>Done ({selectedMetrics.length} selected)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  buttonRow: {
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    ...SHADOWS.sm,
  },
  exportBtnTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.text,
  },
  exportBtnSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2ecc7110',
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
  },
  successText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
  },
  metricSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.accent + '08',
    padding: SPACING.sm + 2,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.accent + '20',
    marginBottom: SPACING.sm,
  },
  metricSelectText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.accent,
    fontWeight: '600',
  },
  dataInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dataInfoText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 61, 92, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: BORDER_RADIUS.xxl,
    borderTopRightRadius: BORDER_RADIUS.xxl,
    maxHeight: '80%',
    paddingTop: SPACING.xl,
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  modalTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: COLORS.text,
  },
  modalSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    marginBottom: SPACING.lg,
  },
  modalScroll: {
    flex: 1,
  },
  categorySection: {
    marginBottom: SPACING.lg,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  categoryLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
  },
  categoryCount: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  metricList: {
    gap: 2,
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
  },
  metricItemActive: {
    backgroundColor: COLORS.accent + '08',
  },
  metricDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  metricItemText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  doneBtn: {
    backgroundColor: COLORS.accent,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  doneBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: '#fff',
  },
});
