import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import { DEFAULT_KEYWORDS, getMonthLabel, bulkUpsert, BulkUpsertResult } from '../../lib/seoService';


// ── Types ──

interface ParsedRow {
  rowNum: number;
  keyword: string;
  month: string;
  position: number;
  impressions: number;
  clicks: number;
  queries: number;
  ctr: number;
  isValid: boolean;
  errors: string[];
  isDefaultKeyword: boolean;
}

interface ParseResult {
  rows: ParsedRow[];
  totalParsed: number;
  validCount: number;
  errorCount: number;
  uniqueKeywords: string[];
  uniqueMonths: string[];
  defaultKeywordCount: number;
  customKeywordCount: number;
}

type Step = 'input' | 'preview' | 'importing' | 'results';

interface ImportSummary {
  total: number;
  success: number;
  failed: number;
  created: number;
  updated: number;
}

interface ImportResult {
  index: number;
  success: boolean;
  action?: string;
  error?: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onComplete: () => void;
}

// ── CSV Parsing ──

const MONTH_REGEX = /^\d{4}-\d{2}$/;

function parseCSVLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      current += ch;
      i++;
    } else {
      if (ch === '"') { inQuotes = true; i++; continue; }
      if (ch === delimiter) { fields.push(current.trim()); current = ''; i++; continue; }
      current += ch;
      i++;
    }
  }
  fields.push(current.trim());
  return fields;
}

function detectDelimiter(text: string): string {
  const lines = text.split('\n').slice(0, 5).filter(l => l.trim().length > 0);
  if (lines.length === 0) return ',';

  const delimiters = ['\t', ',', ';', '|'];
  let best = ',';
  let bestScore = -1;

  for (const d of delimiters) {
    const fieldCounts = lines.map(l => parseCSVLine(l, d).length);
    const consistent = fieldCounts.every(c => c === fieldCounts[0]);
    const avgFields = fieldCounts.reduce((a, b) => a + b, 0) / fieldCounts.length;
    if (avgFields <= 1) continue;
    const score = (consistent ? 100 : 0) + avgFields;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

function isHeaderRow(row: string[]): boolean {
  const headerPatterns = [
    /^(keyword|term|search\s*term|query|key\s*phrase)s?$/i,
    /^(month|date|period|time)s?$/i,
    /^(position|rank|ranking|avg\.?\s*position|average\s*position)$/i,
    /^(impressions?|impr\.?|views?)$/i,
    /^(clicks?|click\s*count)$/i,
    /^(quer(?:y|ies)|search(?:es)?|search\s*volume|volume)$/i,
    /^(ctr|click[\s-]*through[\s-]*rate|click\s*rate)$/i,
  ];

  let matchCount = 0;
  for (const cell of row) {
    const trimmed = cell.trim();
    if (!trimmed) continue;
    if (headerPatterns.some(p => p.test(trimmed))) matchCount++;
  }
  const nonEmpty = row.filter(c => c.trim()).length;
  return matchCount >= 2 && (matchCount / Math.max(nonEmpty, 1)) >= 0.3;
}

function detectColumns(row: string[]): Record<string, number> {
  const map: Record<string, number> = {
    keyword: -1, month: -1, position: -1,
    impressions: -1, clicks: -1, queries: -1, ctr: -1,
  };

  const patterns: [string, RegExp][] = [
    ['keyword',     /^(keyword|term|search\s*term|query|key\s*phrase)s?$/i],
    ['month',       /^(month|date|period|time)s?$/i],
    ['position',    /^(position|rank|ranking|avg\.?\s*position|average\s*position)$/i],
    ['impressions', /^(impressions?|impr\.?|views?)$/i],
    ['clicks',      /^(clicks?|click\s*count)$/i],
    ['queries',     /^(quer(?:y|ies)|search(?:es)?|search\s*volume|volume)$/i],
    ['ctr',         /^(ctr|click[\s-]*through[\s-]*rate|click\s*rate)$/i],
  ];

  for (let i = 0; i < row.length; i++) {
    const cell = row[i].trim();
    for (const [key, pattern] of patterns) {
      if (pattern.test(cell) && map[key] === -1) {
        map[key] = i;
        break;
      }
    }
  }
  return map;
}

function parseMonthValue(val: string): string {
  const trimmed = val.trim();
  if (MONTH_REGEX.test(trimmed)) return trimmed;

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{4})$/);
  if (slashMatch) return `${slashMatch[2]}-${slashMatch[1].padStart(2, '0')}`;

  const slashMatch2 = trimmed.match(/^(\d{4})\/(\d{1,2})$/);
  if (slashMatch2) return `${slashMatch2[1]}-${slashMatch2[2].padStart(2, '0')}`;

  const monthNames: Record<string, string> = {
    jan: '01', january: '01', feb: '02', february: '02', mar: '03', march: '03',
    apr: '04', april: '04', may: '05', jun: '06', june: '06',
    jul: '07', july: '07', aug: '08', august: '08', sep: '09', september: '09',
    oct: '10', october: '10', nov: '11', november: '11', dec: '12', december: '12',
  };

  const nameMatch = trimmed.match(/^([a-zA-Z]+)\s*[,\s]\s*(\d{4})$/);
  if (nameMatch) {
    const mn = monthNames[nameMatch[1].toLowerCase()];
    if (mn) return `${nameMatch[2]}-${mn}`;
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-\d{2}/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}`;

  const dashMatch = trimmed.match(/^(\d{1,2})-(\d{4})$/);
  if (dashMatch) return `${dashMatch[2]}-${dashMatch[1].padStart(2, '0')}`;

  return trimmed;
}

function parseNumber(val: string): number {
  const cleaned = val.replace(/[$,\s%]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseCSVData(text: string): ParseResult {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) {
    return { rows: [], totalParsed: 0, validCount: 0, errorCount: 0, uniqueKeywords: [], uniqueMonths: [], defaultKeywordCount: 0, customKeywordCount: 0 };
  }

  const delimiter = detectDelimiter(text);
  const allRows = lines.map(l => parseCSVLine(l, delimiter));

  let hasHeader = false;
  let colMap: Record<string, number> = {
    keyword: 0, month: 1, position: 2, impressions: 3, clicks: 4, queries: 5, ctr: 6,
  };

  if (allRows.length > 0 && isHeaderRow(allRows[0])) {
    hasHeader = true;
    colMap = detectColumns(allRows[0]);
    // Fill defaults for unmapped columns
    if (colMap.keyword === -1) colMap.keyword = 0;
    if (colMap.month === -1) colMap.month = 1;
    if (colMap.position === -1) colMap.position = 2;
    if (colMap.impressions === -1) colMap.impressions = 3;
    if (colMap.clicks === -1) colMap.clicks = 4;
    if (colMap.queries === -1) colMap.queries = 5;
    if (colMap.ctr === -1) colMap.ctr = 6;
  }

  const dataRows = hasHeader ? allRows.slice(1) : allRows;
  const keywordSet = new Set<string>();
  const monthSet = new Set<string>();
  const defaultKwLower = DEFAULT_KEYWORDS.map(k => k.toLowerCase());
  let defaultKwCount = 0;
  let customKwCount = 0;
  const parsedRows: ParsedRow[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const errors: string[] = [];

    const getVal = (key: string) => {
      const idx = colMap[key];
      return (idx >= 0 && idx < row.length) ? row[idx].trim() : '';
    };

    const keywordRaw = getVal('keyword');
    const monthRaw = getVal('month');
    const positionRaw = getVal('position');
    const impressionsRaw = getVal('impressions');
    const clicksRaw = getVal('clicks');
    const queriesRaw = getVal('queries');
    const ctrRaw = getVal('ctr');

    if (!keywordRaw) errors.push('Keyword is missing');

    const month = parseMonthValue(monthRaw);
    if (!month || !MONTH_REGEX.test(month)) {
      errors.push(`Invalid month: "${monthRaw}"`);
    } else {
      const [y, m] = month.split('-').map(Number);
      if (m < 1 || m > 12) errors.push(`Invalid month number: ${m}`);
      if (y < 2000 || y > 2100) errors.push(`Year out of range: ${y}`);
    }

    const position = parseNumber(positionRaw);
    const impressions = Math.round(parseNumber(impressionsRaw));
    const clicks = Math.round(parseNumber(clicksRaw));
    const queries = Math.round(parseNumber(queriesRaw));

    // Auto-calculate CTR if not provided but clicks and impressions are
    let ctr = parseNumber(ctrRaw);
    if (!ctrRaw && impressions > 0 && clicks >= 0) {
      ctr = (clicks / impressions) * 100;
      ctr = Math.round(ctr * 100) / 100;
    }

    const isDefaultKeyword = keywordRaw ? defaultKwLower.includes(keywordRaw.toLowerCase()) : false;

    if (keywordRaw) keywordSet.add(keywordRaw);
    if (month && MONTH_REGEX.test(month)) monthSet.add(month);

    if (isDefaultKeyword) defaultKwCount++;
    else if (keywordRaw) customKwCount++;

    parsedRows.push({
      rowNum: i + 1,
      keyword: keywordRaw,
      month,
      position,
      impressions,
      clicks,
      queries,
      ctr,
      isValid: errors.length === 0,
      errors,
      isDefaultKeyword,
    });
  }

  return {
    rows: parsedRows,
    totalParsed: parsedRows.length,
    validCount: parsedRows.filter(r => r.isValid).length,
    errorCount: parsedRows.filter(r => !r.isValid).length,
    uniqueKeywords: Array.from(keywordSet),
    uniqueMonths: Array.from(monthSet).sort(),
    defaultKeywordCount: defaultKwCount,
    customKeywordCount: customKwCount,
  };
}

// ── Template ──

const CSV_TEMPLATE = `Keyword,Month,Position,Impressions,Clicks,Queries,CTR
Trainer,2025-01,8.3,2400,120,1800,5.00
Trainers,2025-01,12.1,1800,65,1200,3.61
Training,2025-01,15.7,3200,95,2500,2.97
Nutrition Coach,2025-01,6.2,1100,88,900,8.00
Dietitian,2025-01,9.8,950,42,750,4.42
Nutritionist,2025-01,11.4,1600,58,1100,3.63
Trainer,2025-02,7.9,2600,135,1900,5.19
Trainers,2025-02,11.5,1950,72,1300,3.69
Training,2025-02,14.2,3400,110,2700,3.24
Nutrition Coach,2025-02,5.8,1200,95,950,7.92
Dietitian,2025-02,9.1,1000,48,800,4.80
Nutritionist,2025-02,10.8,1700,65,1150,3.82
Trainer,2025-03,7.2,2800,150,2000,5.36
Trainers,2025-03,10.9,2100,80,1400,3.81
Training,2025-03,13.5,3600,125,2900,3.47
Nutrition Coach,2025-03,5.4,1350,105,1000,7.78
Dietitian,2025-03,8.5,1100,55,850,5.00
Nutritionist,2025-03,10.2,1800,72,1200,4.00`;

// ── Component ──

export default function SEOMassImportModal({ visible, onClose, onComplete }: Props) {
  const [step, setStep] = useState<Step>('input');
  const [csvText, setCsvText] = useState('');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState<{ results: ImportResult[]; summary: ImportSummary } | null>(null);
  const [error, setError] = useState('');
  const [showOnlyErrors, setShowOnlyErrors] = useState(false);

  useEffect(() => {
    if (visible) {
      setStep('input');
      setCsvText('');
      setParseResult(null);
      setImporting(false);
      setImportProgress(0);
      setImportResults(null);
      setError('');
      setShowOnlyErrors(false);
    }
  }, [visible]);

  const handleParse = useCallback(() => {
    if (!csvText.trim()) {
      setError('Please paste or type CSV data');
      return;
    }
    setError('');
    const result = parseCSVData(csvText);
    if (result.rows.length === 0) {
      setError('No data rows found. Check your CSV format.');
      return;
    }
    setParseResult(result);
    setStep('preview');
  }, [csvText]);

  const handleImport = useCallback(async () => {
    if (!parseResult) return;
    const validRows = parseResult.rows.filter(r => r.isValid);
    if (validRows.length === 0) {
      setError('No valid rows to import');
      return;
    }

    setStep('importing');
    setImporting(true);
    setError('');
    setImportProgress(0);

    try {
      const entries = validRows.map(r => ({
        keyword: r.keyword.trim(),
        month: r.month,
        position: r.position,
        impressions: r.impressions,
        clicks: r.clicks,
        queries: r.queries,
        ctr: r.ctr,
      }));

      const progressInterval = setInterval(() => {
        setImportProgress(prev => Math.min(prev + 5, 90));
      }, 300);

      const result = await bulkUpsert(entries);

      clearInterval(progressInterval);
      setImportProgress(100);

      setImportResults({
        results: result.results,
        summary: result.summary,
      });
      setStep('results');

    } catch (err: any) {
      setError(err.message || 'Import failed');
      setStep('preview');
    } finally {
      setImporting(false);
    }
  }, [parseResult]);

  const handleDownloadTemplate = useCallback(() => {
    if (Platform.OS === 'web') {
      const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'seo-import-template.csv';
      a.click();
      URL.revokeObjectURL(url);
    } else {
      setCsvText(CSV_TEMPLATE);
    }
  }, []);

  const handleLoadTemplate = useCallback(() => {
    setCsvText(CSV_TEMPLATE);
  }, []);

  const handleClose = useCallback(() => {
    if (step === 'results' && importResults && importResults.summary.success > 0) {
      onComplete();
    }
    onClose();
  }, [step, importResults, onComplete, onClose]);

  const displayRows = useMemo(() => {
    if (!parseResult) return [];
    if (showOnlyErrors) return parseResult.rows.filter(r => !r.isValid);
    return parseResult.rows;
  }, [parseResult, showOnlyErrors]);

  // ── Render: Input Step ──
  const renderInputStep = () => (
    <ScrollView style={s.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {error ? (
        <View style={s.errorBanner}>
          <Ionicons name="alert-circle" size={16} color={COLORS.danger} />
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={s.infoCard}>
        <View style={s.infoCardHeader}>
          <Ionicons name="information-circle" size={20} color={COLORS.accent} />
          <Text style={s.infoCardTitle}>CSV Format</Text>
        </View>
        <Text style={s.infoCardText}>
          Paste CSV data with columns for Keyword, Month, Position, Impressions, Clicks, Queries, and optionally CTR.
        </Text>
        <View style={s.formatExamples}>
          <Text style={s.formatLabel}>Required columns:</Text>
          <Text style={s.formatExample}>Keyword, Month (at minimum)</Text>
        </View>
        <View style={s.formatExamples}>
          <Text style={s.formatLabel}>Supported month formats:</Text>
          <Text style={s.formatExample}>2025-01, 01/2025, Jan 2025, January 2025</Text>
        </View>
        <View style={s.formatExamples}>
          <Text style={s.formatLabel}>Supported delimiters:</Text>
          <Text style={s.formatExample}>Comma, Tab, Semicolon, Pipe</Text>
        </View>
        <View style={s.formatExamples}>
          <Text style={s.formatLabel}>CTR auto-calculation:</Text>
          <Text style={s.formatExample}>If CTR is blank, it's computed from clicks/impressions</Text>
        </View>
      </View>

      {/* Default keywords reference */}
      <View style={s.keywordsRefCard}>
        <View style={s.keywordsRefHeader}>
          <Ionicons name="key-outline" size={16} color={COLORS.accent} />
          <Text style={s.keywordsRefTitle}>Tracked Keywords</Text>
        </View>
        <Text style={s.keywordsRefDesc}>
          These are the default keywords tracked in the SEO report. You can import data for any keyword.
        </Text>
        <View style={s.keywordsRefChips}>
          {DEFAULT_KEYWORDS.map(kw => (
            <View key={kw} style={s.keywordRefChip}>
              <Text style={s.keywordRefChipText}>{kw}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={s.templateRow}>
        <TouchableOpacity style={s.templateBtn} onPress={handleDownloadTemplate}>
          <Ionicons name="download-outline" size={16} color={COLORS.accent} />
          <Text style={s.templateBtnText}>Download Template</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.templateBtn} onPress={handleLoadTemplate}>
          <Ionicons name="copy-outline" size={16} color={COLORS.accent} />
          <Text style={s.templateBtnText}>Load Example</Text>
        </TouchableOpacity>
      </View>

      <Text style={s.label}>PASTE CSV DATA</Text>
      <TextInput
        style={s.csvInput}
        value={csvText}
        onChangeText={setCsvText}
        placeholder={`Keyword,Month,Position,Impressions,Clicks,Queries,CTR\nTrainer,2025-01,8.3,2400,120,1800,5.00\nTrainers,2025-01,12.1,1800,65,1200,3.61`}
        placeholderTextColor={COLORS.textMuted}
        multiline
        numberOfLines={12}
        textAlignVertical="top"
        autoCapitalize="none"
        autoCorrect={false}
      />

      {csvText.trim().length > 0 && (
        <View style={s.rowCountBadge}>
          <Ionicons name="document-text-outline" size={14} color={COLORS.textSecondary} />
          <Text style={s.rowCountText}>
            ~{csvText.split(/\r?\n/).filter(l => l.trim()).length} lines detected
          </Text>
        </View>
      )}

      <View style={{ height: 20 }} />
    </ScrollView>
  );

  // ── Render: Preview Step ──
  const renderPreviewStep = () => (
    <ScrollView style={s.body} showsVerticalScrollIndicator={false}>
      {error ? (
        <View style={s.errorBanner}>
          <Ionicons name="alert-circle" size={16} color={COLORS.danger} />
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Summary Cards */}
      {parseResult && (
        <View style={s.summaryRow}>
          <View style={[s.summaryCard, { borderLeftColor: COLORS.accent }]}>
            <Text style={s.summaryValue}>{parseResult.totalParsed}</Text>
            <Text style={s.summaryLabel}>Total Rows</Text>
          </View>
          <View style={[s.summaryCard, { borderLeftColor: COLORS.success }]}>
            <Text style={[s.summaryValue, { color: COLORS.success }]}>{parseResult.validCount}</Text>
            <Text style={s.summaryLabel}>Valid</Text>
          </View>
          <View style={[s.summaryCard, { borderLeftColor: COLORS.danger }]}>
            <Text style={[s.summaryValue, { color: parseResult.errorCount > 0 ? COLORS.danger : COLORS.textMuted }]}>
              {parseResult.errorCount}
            </Text>
            <Text style={s.summaryLabel}>Errors</Text>
          </View>
        </View>
      )}

      {/* Data overview */}
      {parseResult && (
        <View style={s.overviewCard}>
          <View style={s.overviewRow}>
            <Ionicons name="key-outline" size={16} color={COLORS.accent} />
            <Text style={s.overviewText}>
              <Text style={{ fontWeight: '700' }}>{parseResult.uniqueKeywords.length}</Text> unique keyword{parseResult.uniqueKeywords.length !== 1 ? 's' : ''}
              {parseResult.defaultKeywordCount > 0 && (
                <Text style={{ color: COLORS.success }}> ({parseResult.defaultKeywordCount} tracked)</Text>
              )}
              {parseResult.customKeywordCount > 0 && (
                <Text style={{ color: COLORS.warning }}> ({parseResult.customKeywordCount} custom)</Text>
              )}
            </Text>
          </View>
          <View style={s.overviewRow}>
            <Ionicons name="calendar-outline" size={16} color={COLORS.accent} />
            <Text style={s.overviewText}>
              <Text style={{ fontWeight: '700' }}>{parseResult.uniqueMonths.length}</Text> month{parseResult.uniqueMonths.length !== 1 ? 's' : ''} of data
              {parseResult.uniqueMonths.length > 0 && (
                <Text style={{ color: COLORS.textMuted }}>
                  {' '}({parseResult.uniqueMonths.length <= 4
                    ? parseResult.uniqueMonths.map(m => getMonthLabel(m).split(' ')[0] + ' ' + m.split('-')[0]).join(', ')
                    : `${getMonthLabel(parseResult.uniqueMonths[0])} to ${getMonthLabel(parseResult.uniqueMonths[parseResult.uniqueMonths.length - 1])}`
                  })
                </Text>
              )}
            </Text>
          </View>
          <View style={s.overviewRow}>
            <Ionicons name="git-merge-outline" size={16} color={COLORS.info} />
            <Text style={s.overviewText}>
              Existing entries for the same keyword + month will be <Text style={{ fontWeight: '700', color: COLORS.info }}>updated</Text>
            </Text>
          </View>
        </View>
      )}

      {/* Keyword chips */}
      {parseResult && parseResult.uniqueKeywords.length > 0 && (
        <View style={s.keywordsPreviewCard}>
          <Text style={s.keywordsPreviewTitle}>Keywords in Import</Text>
          <View style={s.keywordsPreviewChips}>
            {parseResult.uniqueKeywords.map(kw => {
              const isDefault = DEFAULT_KEYWORDS.map(k => k.toLowerCase()).includes(kw.toLowerCase());
              return (
                <View key={kw} style={[s.kwChip, isDefault ? s.kwChipDefault : s.kwChipCustom]}>
                  <Ionicons
                    name={isDefault ? 'checkmark-circle' : 'add-circle-outline'}
                    size={12}
                    color={isDefault ? COLORS.success : COLORS.warning}
                  />
                  <Text style={[s.kwChipText, isDefault ? s.kwChipTextDefault : s.kwChipTextCustom]}>
                    {kw}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Error filter toggle */}
      {parseResult && parseResult.errorCount > 0 && (
        <TouchableOpacity
          style={s.filterToggle}
          onPress={() => setShowOnlyErrors(!showOnlyErrors)}
        >
          <Ionicons
            name={showOnlyErrors ? 'funnel' : 'funnel-outline'}
            size={14}
            color={showOnlyErrors ? COLORS.danger : COLORS.textMuted}
          />
          <Text style={[s.filterToggleText, showOnlyErrors && { color: COLORS.danger }]}>
            {showOnlyErrors ? 'Showing errors only' : 'Show errors only'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Preview Table */}
      <View style={s.previewTable}>
        <View style={s.tableHeader}>
          <Text style={[s.th, { width: 28 }]}>#</Text>
          <Text style={[s.th, { flex: 1.2 }]}>Keyword</Text>
          <Text style={[s.th, { flex: 0.8 }]}>Month</Text>
          <Text style={[s.th, { flex: 0.6, textAlign: 'right' }]}>Pos</Text>
          <Text style={[s.th, { flex: 0.7, textAlign: 'right' }]}>Impr</Text>
          <Text style={[s.th, { flex: 0.5, textAlign: 'right' }]}>Clicks</Text>
          <Text style={[s.th, { flex: 0.6, textAlign: 'right' }]}>Queries</Text>
          <Text style={[s.th, { flex: 0.5, textAlign: 'right' }]}>CTR</Text>
          <View style={{ width: 22 }} />
        </View>

        {displayRows.map((row) => (
          <View
            key={row.rowNum}
            style={[
              s.tableRow,
              !row.isValid && s.tableRowError,
              row.isValid && row.isDefaultKeyword && s.tableRowDefault,
            ]}
          >
            <Text style={[s.td, { width: 28, color: COLORS.textMuted }]}>{row.rowNum}</Text>
            <View style={{ flex: 1.2, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              {row.isDefaultKeyword && (
                <Ionicons name="checkmark-circle" size={10} color={COLORS.success} />
              )}
              <Text style={s.td} numberOfLines={1}>{row.keyword}</Text>
            </View>
            <Text style={[s.td, { flex: 0.8 }]}>
              {row.month && MONTH_REGEX.test(row.month)
                ? getMonthLabel(row.month).split(' ')[0].substring(0, 3) + ' ' + row.month.split('-')[0]
                : row.month}
            </Text>
            <Text style={[s.td, { flex: 0.6, textAlign: 'right', fontWeight: '700', color: row.position <= 10 ? COLORS.success : row.position <= 30 ? COLORS.warning : COLORS.danger }]}>
              {row.position > 0 ? row.position.toFixed(1) : '--'}
            </Text>
            <Text style={[s.td, { flex: 0.7, textAlign: 'right' }]}>{row.impressions.toLocaleString()}</Text>
            <Text style={[s.td, { flex: 0.5, textAlign: 'right' }]}>{row.clicks}</Text>
            <Text style={[s.td, { flex: 0.6, textAlign: 'right' }]}>{row.queries.toLocaleString()}</Text>
            <Text style={[s.td, { flex: 0.5, textAlign: 'right' }]}>{row.ctr > 0 ? row.ctr.toFixed(1) + '%' : '--'}</Text>
            <View style={{ width: 22, alignItems: 'center' }}>
              {row.isValid ? (
                <Ionicons name="checkmark" size={14} color={COLORS.success} />
              ) : (
                <Ionicons name="alert-circle" size={14} color={COLORS.danger} />
              )}
            </View>
            {!row.isValid && row.errors.length > 0 && (
              <View style={s.rowErrorContainer}>
                {row.errors.map((err, idx) => (
                  <Text key={idx} style={s.rowErrorText}>{err}</Text>
                ))}
              </View>
            )}
          </View>
        ))}
      </View>

      <View style={{ height: 20 }} />
    </ScrollView>
  );

  // ── Render: Importing Step ──
  const renderImportingStep = () => (
    <View style={[s.body, { justifyContent: 'center', alignItems: 'center', paddingVertical: 60 }]}>
      <View style={s.importingIcon}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
      <Text style={s.importingTitle}>Importing SEO Data...</Text>
      <Text style={s.importingSubtitle}>
        Processing {parseResult?.validCount || 0} keyword entries
      </Text>
      <View style={s.progressBarOuter}>
        <View style={[s.progressBarInner, { width: `${importProgress}%` }]} />
      </View>
      <Text style={s.progressText}>{importProgress}%</Text>
      <Text style={s.importingHint}>
        This may take a moment for large datasets...
      </Text>
    </View>
  );

  // ── Render: Results Step ──
  const renderResultsStep = () => {
    const summary = importResults?.summary;
    const failedResults = importResults?.results.filter(r => !r.success) || [];

    return (
      <ScrollView style={s.body} showsVerticalScrollIndicator={false}>
        <View style={[s.resultHeader, summary && summary.failed === 0 ? s.resultHeaderSuccess : s.resultHeaderMixed]}>
          <View style={s.resultIconCircle}>
            <Ionicons
              name={summary && summary.failed === 0 ? 'checkmark-circle' : 'alert-circle'}
              size={36}
              color={summary && summary.failed === 0 ? COLORS.success : COLORS.warning}
            />
          </View>
          <Text style={s.resultTitle}>
            {summary && summary.failed === 0 ? 'Import Complete!' : 'Import Finished with Issues'}
          </Text>
          <Text style={s.resultSubtitle}>
            {summary?.success || 0} of {summary?.total || 0} entries processed successfully
          </Text>
        </View>

        <View style={s.resultStatsGrid}>
          <View style={s.resultStatCard}>
            <Ionicons name="add-circle-outline" size={20} color={COLORS.success} />
            <Text style={s.resultStatValue}>{summary?.created || 0}</Text>
            <Text style={s.resultStatLabel}>Created</Text>
          </View>
          <View style={s.resultStatCard}>
            <Ionicons name="refresh-outline" size={20} color={COLORS.info} />
            <Text style={s.resultStatValue}>{summary?.updated || 0}</Text>
            <Text style={s.resultStatLabel}>Updated</Text>
          </View>
          <View style={s.resultStatCard}>
            <Ionicons name="close-circle-outline" size={20} color={COLORS.danger} />
            <Text style={s.resultStatValue}>{summary?.failed || 0}</Text>
            <Text style={s.resultStatLabel}>Failed</Text>
          </View>
        </View>

        {/* Keywords and months summary */}
        {parseResult && (
          <View style={s.resultDetailsCard}>
            <View style={s.resultDetailRow}>
              <Ionicons name="key-outline" size={16} color={COLORS.accent} />
              <Text style={s.resultDetailText}>
                <Text style={{ fontWeight: '700' }}>{parseResult.uniqueKeywords.length}</Text> keywords across{' '}
                <Text style={{ fontWeight: '700' }}>{parseResult.uniqueMonths.length}</Text> months
              </Text>
            </View>
            {parseResult.uniqueMonths.length > 0 && (
              <View style={s.resultDetailRow}>
                <Ionicons name="calendar-outline" size={16} color={COLORS.accent} />
                <Text style={s.resultDetailText}>
                  {parseResult.uniqueMonths.length <= 6
                    ? parseResult.uniqueMonths.map(m => {
                        const parts = getMonthLabel(m).split(' ');
                        return parts[0].substring(0, 3) + ' ' + parts[1];
                      }).join(', ')
                    : `${getMonthLabel(parseResult.uniqueMonths[0])} to ${getMonthLabel(parseResult.uniqueMonths[parseResult.uniqueMonths.length - 1])}`
                  }
                </Text>
              </View>
            )}
          </View>
        )}

        {failedResults.length > 0 && (
          <View style={s.failedSection}>
            <Text style={s.failedTitle}>Failed Entries</Text>
            {failedResults.map((r, i) => (
              <View key={i} style={s.failedRow}>
                <View style={s.failedRowHeader}>
                  <Text style={s.failedRowNum}>Row {r.index + 1}</Text>
                </View>
                <Text style={s.failedRowError}>{r.error}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    );
  };

  // ── Footer ──
  const renderFooter = () => {
    switch (step) {
      case 'input':
        return (
          <View style={s.footer}>
            <TouchableOpacity style={s.cancelBtn} onPress={handleClose}>
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.primaryBtn, !csvText.trim() && s.btnDisabled]}
              onPress={handleParse}
              disabled={!csvText.trim()}
            >
              <Ionicons name="eye-outline" size={18} color={COLORS.white} />
              <Text style={s.primaryBtnText}>Preview Data</Text>
            </TouchableOpacity>
          </View>
        );
      case 'preview':
        return (
          <View style={s.footer}>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setStep('input')}>
              <Ionicons name="arrow-back" size={16} color={COLORS.textSecondary} />
              <Text style={s.cancelBtnText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.importBtn, (!parseResult || parseResult.validCount === 0) && s.btnDisabled]}
              onPress={handleImport}
              disabled={!parseResult || parseResult.validCount === 0}
            >
              <Ionicons name="cloud-upload-outline" size={18} color={COLORS.white} />
              <Text style={s.primaryBtnText}>Import {parseResult?.validCount || 0} Entries</Text>
            </TouchableOpacity>
          </View>
        );
      case 'importing':
        return null;
      case 'results':
        return (
          <View style={s.footer}>
            <TouchableOpacity style={s.doneBtn} onPress={handleClose}>
              <Ionicons name="checkmark" size={18} color={COLORS.white} />
              <Text style={s.primaryBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        );
    }
  };

  // ── Step Indicator ──
  const renderStepIndicator = () => {
    const steps: { key: Step; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
      { key: 'input', label: 'Paste Data', icon: 'clipboard-outline' },
      { key: 'preview', label: 'Preview', icon: 'eye-outline' },
      { key: 'importing', label: 'Import', icon: 'cloud-upload-outline' },
      { key: 'results', label: 'Results', icon: 'checkmark-circle-outline' },
    ];
    const currentIdx = steps.findIndex(st => st.key === step);

    return (
      <View style={s.stepIndicator}>
        {steps.map((st, i) => {
          const isActive = i === currentIdx;
          const isCompleted = i < currentIdx;
          return (
            <React.Fragment key={st.key}>
              {i > 0 && (
                <View style={[s.stepLine, isCompleted && s.stepLineCompleted]} />
              )}
              <View style={s.stepItemWrap}>
                <View style={[s.stepDot, isActive && s.stepDotActive, isCompleted && s.stepDotCompleted]}>
                  <Ionicons
                    name={isCompleted ? 'checkmark' : st.icon}
                    size={12}
                    color={isActive || isCompleted ? COLORS.white : COLORS.textMuted}
                  />
                </View>
                <Text style={[s.stepLabel, isActive && s.stepLabelActive, isCompleted && s.stepLabelCompleted]}>
                  {st.label}
                </Text>
              </View>
            </React.Fragment>
          );
        })}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={s.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={s.overlayBg} onPress={step !== 'importing' ? handleClose : undefined} />
        <View style={s.container}>
          <View style={s.header}>
            <View style={s.headerLeft}>
              <View style={s.headerIcon}>
                <Ionicons name="cloud-upload" size={20} color={COLORS.white} />
              </View>
              <View>
                <Text style={s.headerTitle}>SEO Mass Import</Text>
                <Text style={s.headerSubtitle}>Upload historical keyword data</Text>
              </View>
            </View>
            {step !== 'importing' && (
              <TouchableOpacity onPress={handleClose} style={s.closeBtn}>
                <Ionicons name="close" size={22} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {renderStepIndicator()}

          {step === 'input' && renderInputStep()}
          {step === 'preview' && renderPreviewStep()}
          {step === 'importing' && renderImportingStep()}
          {step === 'results' && renderResultsStep()}

          {renderFooter()}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Styles ──

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'transparent', justifyContent: 'flex-end' },
  overlayBg: { ...StyleSheet.absoluteFillObject, backgroundColor: COLORS.overlay },
  container: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    maxHeight: '94%',
    minHeight: '60%',
  },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.white, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    borderTopLeftRadius: BORDER_RADIUS.xl, borderTopRightRadius: BORDER_RADIUS.xl,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  headerIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.primary },
  headerSubtitle: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 1 },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: COLORS.borderLight, alignItems: 'center', justifyContent: 'center',
  },

  // Step Indicator
  stepIndicator: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center',
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  stepItemWrap: { alignItems: 'center', gap: 3 },
  stepDot: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: COLORS.borderLight, alignItems: 'center', justifyContent: 'center',
  },
  stepDotActive: { backgroundColor: COLORS.accent },
  stepDotCompleted: { backgroundColor: COLORS.success },
  stepLabel: { fontSize: 9, fontWeight: '600', color: COLORS.textMuted },
  stepLabelActive: { color: COLORS.accent, fontWeight: '700' },
  stepLabelCompleted: { color: COLORS.success },
  stepLine: { flex: 1, height: 2, backgroundColor: COLORS.borderLight, marginHorizontal: 4, marginTop: 12 },
  stepLineCompleted: { backgroundColor: COLORS.success },

  // Body
  body: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, flex: 1 },

  // Error
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.dangerLight, padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md, marginBottom: SPACING.md,
  },
  errorText: { fontSize: FONT_SIZES.sm, color: COLORS.danger, fontWeight: '600', flex: 1 },

  // Info Card
  infoCard: {
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, marginBottom: SPACING.md,
    borderLeftWidth: 3, borderLeftColor: COLORS.accent, ...SHADOWS.sm,
  },
  infoCardHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  infoCardTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.primary },
  infoCardText: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, lineHeight: 20, marginBottom: SPACING.sm },
  formatExamples: { marginTop: 4 },
  formatLabel: {
    fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.3,
  },
  formatExample: {
    fontSize: FONT_SIZES.xs, color: COLORS.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginTop: 2,
  },

  // Keywords Reference
  keywordsRefCard: {
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, marginBottom: SPACING.md, ...SHADOWS.sm,
  },
  keywordsRefHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  keywordsRefTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.primary },
  keywordsRefDesc: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginBottom: SPACING.sm, lineHeight: 16 },
  keywordsRefChips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  keywordRefChip: {
    paddingHorizontal: SPACING.md, paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.accent + '12', borderWidth: 1, borderColor: COLORS.accent + '25',
  },
  keywordRefChipText: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: COLORS.accent },

  // Template
  templateRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  templateBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1, borderColor: COLORS.accent + '40', backgroundColor: COLORS.white,
  },
  templateBtnText: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.accent },

  // CSV Input
  label: {
    fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.textSecondary,
    marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  csvInput: {
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
    fontSize: FONT_SIZES.sm, color: COLORS.text, minHeight: 180,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textAlignVertical: 'top', lineHeight: 20,
  },
  rowCountBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: SPACING.sm, paddingHorizontal: SPACING.sm,
  },
  rowCountText: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, fontWeight: '500' },

  // Summary Cards
  summaryRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  summaryCard: {
    flex: 1, backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, alignItems: 'center', borderLeftWidth: 3, ...SHADOWS.sm,
  },
  summaryValue: { fontSize: FONT_SIZES.xxl, fontWeight: '800', color: COLORS.primary },
  summaryLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '600', marginTop: 2 },

  // Overview Card
  overviewCard: {
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, marginBottom: SPACING.md, gap: SPACING.sm, ...SHADOWS.sm,
  },
  overviewRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  overviewText: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, flex: 1, lineHeight: 20 },

  // Keywords Preview
  keywordsPreviewCard: {
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, marginBottom: SPACING.md, ...SHADOWS.sm,
  },
  keywordsPreviewTitle: {
    fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: SPACING.sm,
  },
  keywordsPreviewChips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  kwChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: SPACING.md, paddingVertical: 4, borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
  },
  kwChipDefault: { backgroundColor: COLORS.successLight, borderColor: COLORS.success + '30' },
  kwChipCustom: { backgroundColor: COLORS.warningLight, borderColor: COLORS.warning + '30' },
  kwChipText: { fontSize: FONT_SIZES.xs, fontWeight: '600' },
  kwChipTextDefault: { color: COLORS.success },
  kwChipTextCustom: { color: COLORS.warning },

  // Filter toggle
  filterToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginBottom: SPACING.sm, paddingHorizontal: SPACING.sm,
  },
  filterToggleText: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: COLORS.textMuted },

  // Preview Table
  previewTable: {
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden', ...SHADOWS.sm,
  },
  tableHeader: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm,
  },
  th: {
    fontSize: 8, fontWeight: '700', color: COLORS.white,
    textTransform: 'uppercase', letterSpacing: 0.3,
  },
  tableRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight, flexWrap: 'wrap',
  },
  tableRowError: { backgroundColor: COLORS.dangerLight + '40' },
  tableRowDefault: { backgroundColor: COLORS.successLight + '20' },
  td: { fontSize: FONT_SIZES.xs, color: COLORS.text, fontWeight: '500' },
  rowErrorContainer: { width: '100%', paddingLeft: 28, paddingTop: 4 },
  rowErrorText: { fontSize: 9, color: COLORS.danger, fontWeight: '500', lineHeight: 14 },

  // Importing
  importingIcon: { marginBottom: SPACING.lg },
  importingTitle: { fontSize: FONT_SIZES.xl, fontWeight: '700', color: COLORS.primary, marginBottom: SPACING.sm },
  importingSubtitle: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, marginBottom: SPACING.xl },
  progressBarOuter: {
    width: '80%', height: 8, backgroundColor: COLORS.borderLight,
    borderRadius: 4, overflow: 'hidden', marginBottom: SPACING.sm,
  },
  progressBarInner: { height: '100%', backgroundColor: COLORS.accent, borderRadius: 4 },
  progressText: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.accent },
  importingHint: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: SPACING.lg, fontStyle: 'italic' },

  // Results
  resultHeader: {
    alignItems: 'center', padding: SPACING.xl,
    borderRadius: BORDER_RADIUS.lg, marginBottom: SPACING.md,
  },
  resultHeaderSuccess: { backgroundColor: COLORS.successLight },
  resultHeaderMixed: { backgroundColor: COLORS.warningLight },
  resultIconCircle: { marginBottom: SPACING.sm },
  resultTitle: { fontSize: FONT_SIZES.xl, fontWeight: '800', color: COLORS.primary, textAlign: 'center' },
  resultSubtitle: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, marginTop: 4, textAlign: 'center' },

  resultStatsGrid: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  resultStatCard: {
    flex: 1, backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, alignItems: 'center', gap: 4, ...SHADOWS.sm,
  },
  resultStatValue: { fontSize: FONT_SIZES.xxl, fontWeight: '800', color: COLORS.primary },
  resultStatLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '600' },

  // Result details
  resultDetailsCard: {
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, marginBottom: SPACING.md, gap: SPACING.sm, ...SHADOWS.sm,
  },
  resultDetailRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  resultDetailText: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, flex: 1 },

  // Failed
  failedSection: { marginBottom: SPACING.md },
  failedTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.danger, marginBottom: SPACING.sm },
  failedRow: {
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, marginBottom: SPACING.sm,
    borderLeftWidth: 3, borderLeftColor: COLORS.danger, ...SHADOWS.sm,
  },
  failedRowHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: 4 },
  failedRowNum: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.textMuted },
  failedRowError: { fontSize: FONT_SIZES.xs, color: COLORS.danger, fontWeight: '500' },

  // Footer
  footer: {
    flexDirection: 'row', gap: SPACING.sm,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: COLORS.borderLight,
  },
  cancelBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.borderLight,
  },
  cancelBtnText: { fontSize: FONT_SIZES.md, fontWeight: '600', color: COLORS.textSecondary },
  primaryBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.accent,
  },
  importBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.success,
  },
  doneBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.accent,
  },
  primaryBtnText: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.white },
  btnDisabled: { opacity: 0.5 },
});
