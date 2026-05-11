import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
  Pressable, Switch, SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import {
  MarketingChannel, BulkImportEntry, BulkImportResult, BulkImportSummary,
  bulkUpsertEntries, getMonthLabel, addChannelAlias,
} from '../../lib/marketingService';
import {
  FuzzyCandidate, findFuzzyMatches, formatScore, getConfidenceColor,
} from '../../lib/fuzzyMatch';

// ============ TYPES ============

interface ParsedRow {
  rowNum: number;
  channel: string;
  month: string;
  investment: number;
  leads: number;
  clients: number;
  revenue: number;
  notes: string;
  isValid: boolean;
  errors: string[];
  channelMatch: 'exact' | 'alias' | 'fuzzy' | 'new' | 'none';
  aliasResolvedTo?: string;
  fuzzyMatches?: FuzzyCandidate[];
}

interface ParseResult {
  rows: ParsedRow[];
  totalParsed: number;
  validCount: number;
  errorCount: number;
  newChannels: string[];
  matchedChannels: string[];
  aliasMatchedChannels: { alias: string; channelName: string }[];
  fuzzyMatchedChannels: { input: string; candidates: FuzzyCandidate[] }[];
}

/** Tracks the user's decision for each fuzzy-matched channel name */
interface FuzzyResolution {
  /** The raw channel name from the CSV */
  input: string;
  /** 'accept' = map to a specific channel, 'reject' = treat as new, null = unresolved */
  decision: 'accept' | 'reject' | null;
  /** The channel the user chose to map to (when decision === 'accept') */
  acceptedChannel?: { id: string; name: string };
  /** Whether to save this mapping as a permanent alias */
  saveAsAlias: boolean;
}

type Step = 'input' | 'preview' | 'importing' | 'results';

interface Props {
  visible: boolean;
  onClose: () => void;
  onComplete: () => void;
  channels: MarketingChannel[];
  isAdmin: boolean;
}

// ============ CSV PARSING ============

const MONTH_REGEX = /^\d{4}-\d{2}$/;

/**
 * RFC 4180-compliant CSV line parser.
 * Handles quoted fields so that channel names like "Facebook/Instagram"
 * or "Employee Referrals" are never split or mangled.
 */
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
      if (ch === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (ch === delimiter) {
        fields.push(current.trim());
        current = '';
        i++;
        continue;
      }
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
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }

  return best;
}

function isHeaderRow(row: string[]): boolean {
  const headerPatterns = [
    /^(channel|source|campaign|marketing\s*channel)s?$/i,
    /^(month|date|period|time)s?$/i,
    /^(investment|spend|cost|budget|invested|ad\s*spend)s?$/i,
    /^(leads?|lead\s*count|num\s*leads)$/i,
    /^(clients?|conversions?|customers?|client\s*count)$/i,
    /^(revenue|income|sales|earnings?)$/i,
    /^(notes?|comments?|memo|description)s?$/i,
  ];

  let matchCount = 0;
  for (const cell of row) {
    const trimmed = cell.trim();
    if (!trimmed) continue;
    if (headerPatterns.some(p => p.test(trimmed))) {
      matchCount++;
    }
  }

  const nonEmpty = row.filter(c => c.trim()).length;
  return matchCount >= 3 && (matchCount / Math.max(nonEmpty, 1)) >= 0.4;
}

function detectColumns(row: string[]): Record<string, number> {
  const map: Record<string, number> = {
    channel: -1, month: -1, investment: -1,
    leads: -1, clients: -1, revenue: -1, notes: -1,
  };

  const patterns: [string, RegExp][] = [
    ['channel',    /^(channel|source|campaign|marketing\s*channel)s?$/i],
    ['month',      /^(month|date|period|time)s?$/i],
    ['investment', /^(investment|spend|cost|budget|invested|ad\s*spend)s?$/i],
    ['leads',      /^(leads?|lead\s*count|num\s*leads)$/i],
    ['clients',    /^(clients?|conversions?|customers?|client\s*count)$/i],
    ['revenue',    /^(revenue|income|sales|earnings?)$/i],
    ['notes',      /^(notes?|comments?|memo|description)s?$/i],
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

function parseCSVData(text: string, channels: MarketingChannel[]): ParseResult {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return { rows: [], totalParsed: 0, validCount: 0, errorCount: 0, newChannels: [], matchedChannels: [], aliasMatchedChannels: [], fuzzyMatchedChannels: [] };

  const delimiter = detectDelimiter(text);
  const allRows = lines.map(l => parseCSVLine(l, delimiter));

  let hasHeader = false;
  let colMap: Record<string, number> = { channel: 0, month: 1, investment: 2, leads: 3, clients: 4, revenue: 5, notes: 6 };

  if (allRows.length > 0 && isHeaderRow(allRows[0])) {
    hasHeader = true;
    colMap = detectColumns(allRows[0]);
    if (colMap.channel === -1) colMap.channel = 0;
    if (colMap.month === -1) colMap.month = 1;
    if (colMap.investment === -1) colMap.investment = 2;
    if (colMap.leads === -1) colMap.leads = 3;
    if (colMap.clients === -1) colMap.clients = 4;
    if (colMap.revenue === -1) colMap.revenue = 5;
  }

  const dataRows = hasHeader ? allRows.slice(1) : allRows;

  // Build channel name lookup
  const channelNameMap: Record<string, MarketingChannel> = {};
  channels.forEach(c => { channelNameMap[c.name.toLowerCase().trim()] = c; });

  // Build alias lookup
  const aliasMap: Record<string, MarketingChannel> = {};
  channels.forEach(c => {
    if (c.aliases && Array.isArray(c.aliases)) {
      c.aliases.forEach(a => {
        aliasMap[a.alias.toLowerCase().trim()] = c;
      });
    }
  });

  const newChannelSet = new Set<string>();
  const matchedChannelSet = new Set<string>();
  const aliasMatchedSet = new Map<string, string>();
  const fuzzyMatchedMap = new Map<string, FuzzyCandidate[]>();
  const parsedRows: ParsedRow[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const errors: string[] = [];

    const getVal = (key: string) => {
      const idx = colMap[key];
      return (idx >= 0 && idx < row.length) ? row[idx].trim() : '';
    };

    const channelRaw = getVal('channel');
    const monthRaw = getVal('month');
    const investmentRaw = getVal('investment');
    const leadsRaw = getVal('leads');
    const clientsRaw = getVal('clients');
    const revenueRaw = getVal('revenue');
    const notesRaw = getVal('notes');

    if (!channelRaw) errors.push('Channel name is missing');

    const month = parseMonthValue(monthRaw);
    if (!month || !MONTH_REGEX.test(month)) {
      errors.push(`Invalid month: "${monthRaw}"`);
    } else {
      const [y, m] = month.split('-').map(Number);
      if (m < 1 || m > 12) errors.push(`Invalid month number: ${m}`);
      if (y < 2000 || y > 2100) errors.push(`Year out of range: ${y}`);
    }

    const investment = parseNumber(investmentRaw);
    const leads = Math.round(parseNumber(leadsRaw));
    const clients = Math.round(parseNumber(clientsRaw));
    const revenue = parseNumber(revenueRaw);

    // Channel matching: exact name -> alias -> fuzzy -> new
    let channelMatch: 'exact' | 'alias' | 'fuzzy' | 'new' | 'none' = 'none';
    let aliasResolvedTo: string | undefined;
    let fuzzyMatches: FuzzyCandidate[] | undefined;

    if (channelRaw) {
      const lowerName = channelRaw.toLowerCase().trim();
      const exactMatch = channelNameMap[lowerName];
      if (exactMatch) {
        channelMatch = 'exact';
        matchedChannelSet.add(exactMatch.name);
      } else {
        const aliasMatch = aliasMap[lowerName];
        if (aliasMatch) {
          channelMatch = 'alias';
          aliasResolvedTo = aliasMatch.name;
          matchedChannelSet.add(aliasMatch.name);
          aliasMatchedSet.set(channelRaw, aliasMatch.name);
        } else {
          // Step 3: Fuzzy matching
          const candidates = findFuzzyMatches(channelRaw, channels, {
            threshold: 0.65,
            maxCandidates: 3,
          });

          if (candidates.length > 0) {
            channelMatch = 'fuzzy';
            fuzzyMatches = candidates;
            // Track unique fuzzy matches by input name
            if (!fuzzyMatchedMap.has(channelRaw)) {
              fuzzyMatchedMap.set(channelRaw, candidates);
            }
          } else {
            channelMatch = 'new';
            newChannelSet.add(channelRaw);
          }
        }
      }
    }

    parsedRows.push({
      rowNum: i + 1,
      channel: channelRaw,
      month,
      investment,
      leads,
      clients,
      revenue,
      notes: notesRaw,
      isValid: errors.length === 0,
      errors,
      channelMatch,
      aliasResolvedTo,
      fuzzyMatches,
    });
  }

  return {
    rows: parsedRows,
    totalParsed: parsedRows.length,
    validCount: parsedRows.filter(r => r.isValid).length,
    errorCount: parsedRows.filter(r => !r.isValid).length,
    newChannels: Array.from(newChannelSet),
    matchedChannels: Array.from(matchedChannelSet),
    aliasMatchedChannels: Array.from(aliasMatchedSet.entries()).map(([alias, channelName]) => ({ alias, channelName })),
    fuzzyMatchedChannels: Array.from(fuzzyMatchedMap.entries()).map(([input, candidates]) => ({ input, candidates })),
  };
}


// ============ TEMPLATE ============

const CSV_TEMPLATE = `Channel,Month,Investment,Leads,Clients,Revenue,Notes
Facebook/Instagram,2025-01,1500.00,45,8,4800.00,Q1 social campaign
Google Ads,2025-01,2200.00,62,12,7200.00,Search + display
Employee Referrals,2025-01,200.00,18,12,7200.00,Staff incentive program
Client Referrals,2025-01,0,15,10,6000.00,Word of mouth
Direct Mail,2025-01,900.00,22,4,2400.00,Postcard campaign
Facebook/Instagram,2025-02,1600.00,52,9,5400.00,Valentine promo
Google Ads,2025-02,2000.00,58,11,6600.00,
Employee Referrals,2025-02,200.00,14,9,5400.00,
Client Referrals,2025-02,0,20,13,7800.00,Referral program boost`;

// ============ COMPONENT ============

export default function MarketingMassImportModal({ visible, onClose, onComplete, channels, isAdmin }: Props) {
  const [step, setStep] = useState<Step>('input');
  const [csvText, setCsvText] = useState('');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [autoCreateChannels, setAutoCreateChannels] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState<{ results: BulkImportResult[]; summary: BulkImportSummary } | null>(null);
  const [error, setError] = useState('');
  const [showOnlyErrors, setShowOnlyErrors] = useState(false);

  // Fuzzy resolution state: keyed by the raw channel name from CSV
  const [fuzzyResolutions, setFuzzyResolutions] = useState<Record<string, FuzzyResolution>>({});
  const [savingAliases, setSavingAliases] = useState(false);

  useEffect(() => {
    if (visible) {
      setStep('input');
      setCsvText('');
      setParseResult(null);
      setAutoCreateChannels(true);
      setImporting(false);
      setImportProgress(0);
      setImportResults(null);
      setError('');
      setShowOnlyErrors(false);
      setFuzzyResolutions({});
      setSavingAliases(false);
    }
  }, [visible]);

  // Initialise fuzzy resolutions when parse result changes
  useEffect(() => {
    if (parseResult && parseResult.fuzzyMatchedChannels.length > 0) {
      const resolutions: Record<string, FuzzyResolution> = {};
      for (const fm of parseResult.fuzzyMatchedChannels) {
        // Pre-select the top candidate if confidence is high
        const topCandidate = fm.candidates[0];
        resolutions[fm.input] = {
          input: fm.input,
          decision: topCandidate && topCandidate.confidence === 'high' ? 'accept' : null,
          acceptedChannel: topCandidate && topCandidate.confidence === 'high'
            ? { id: topCandidate.channelId, name: topCandidate.channelName }
            : undefined,
          saveAsAlias: false,
        };
      }
      setFuzzyResolutions(resolutions);
    } else {
      setFuzzyResolutions({});
    }
  }, [parseResult]);

  // Count unresolved fuzzy matches
  const unresolvedFuzzyCount = useMemo(() => {
    return Object.values(fuzzyResolutions).filter(r => r.decision === null).length;
  }, [fuzzyResolutions]);

  const hasFuzzyMatches = useMemo(() => {
    return parseResult ? parseResult.fuzzyMatchedChannels.length > 0 : false;
  }, [parseResult]);

  const handleParse = useCallback(() => {
    if (!csvText.trim()) {
      setError('Please paste or type CSV data');
      return;
    }
    setError('');
    const result = parseCSVData(csvText, channels);
    if (result.rows.length === 0) {
      setError('No data rows found. Check your CSV format.');
      return;
    }
    setParseResult(result);
    setStep('preview');
  }, [csvText, channels]);

  const handleFuzzyAccept = useCallback((input: string, candidate: FuzzyCandidate) => {
    setFuzzyResolutions(prev => ({
      ...prev,
      [input]: {
        ...prev[input],
        decision: 'accept',
        acceptedChannel: { id: candidate.channelId, name: candidate.channelName },
        saveAsAlias: prev[input]?.saveAsAlias ?? false,
      },
    }));
  }, []);

  const handleFuzzyReject = useCallback((input: string) => {
    setFuzzyResolutions(prev => ({
      ...prev,
      [input]: {
        ...prev[input],
        decision: 'reject',
        acceptedChannel: undefined,
        saveAsAlias: false,
      },
    }));
  }, []);

  const handleFuzzyReset = useCallback((input: string) => {
    setFuzzyResolutions(prev => ({
      ...prev,
      [input]: {
        ...prev[input],
        decision: null,
        acceptedChannel: undefined,
        saveAsAlias: false,
      },
    }));
  }, []);

  const handleToggleSaveAlias = useCallback((input: string) => {
    setFuzzyResolutions(prev => ({
      ...prev,
      [input]: {
        ...prev[input],
        saveAsAlias: !prev[input]?.saveAsAlias,
      },
    }));
  }, []);

  const handleImport = useCallback(async () => {
    if (!parseResult) return;

    const validRows = parseResult.rows.filter(r => r.isValid);
    if (validRows.length === 0) {
      setError('No valid rows to import');
      return;
    }

    // Check for unresolved fuzzy matches
    if (unresolvedFuzzyCount > 0) {
      setError(`Please resolve all ${unresolvedFuzzyCount} fuzzy match${unresolvedFuzzyCount !== 1 ? 'es' : ''} before importing.`);
      return;
    }

    setStep('importing');
    setImporting(true);
    setError('');
    setImportProgress(0);

    try {
      // First, save any aliases the user opted to create
      const aliasesToSave = Object.values(fuzzyResolutions).filter(
        r => r.decision === 'accept' && r.saveAsAlias && r.acceptedChannel
      );

      if (aliasesToSave.length > 0) {
        setSavingAliases(true);
        for (const res of aliasesToSave) {
          try {
            await addChannelAlias(res.acceptedChannel!.id, res.input);
          } catch (err: any) {
            // Non-fatal: alias might already exist or conflict
            console.warn(`Failed to save alias "${res.input}": ${err.message}`);
          }
        }
        setSavingAliases(false);
      }

      // Build entries, applying fuzzy resolutions
      const entries: BulkImportEntry[] = validRows.map(r => {
        let channelName = r.channel;
        let channelId: string | undefined;

        // If this row was a fuzzy match and user accepted, use the resolved channel
        if (r.channelMatch === 'fuzzy') {
          const resolution = fuzzyResolutions[r.channel];
          if (resolution?.decision === 'accept' && resolution.acceptedChannel) {
            channelName = resolution.acceptedChannel.name;
            channelId = resolution.acceptedChannel.id;
          }
          // If rejected, channelName stays as-is (will be auto-created or fail)
        }

        return {
          channel_name: channelName,
          channel_id: channelId,
          month: r.month,
          investment: r.investment,
          leads: r.leads,
          clients: r.clients,
          revenue: r.revenue,
          notes: r.notes || undefined,
        };
      });

      const progressInterval = setInterval(() => {
        setImportProgress(prev => Math.min(prev + 5, 90));
      }, 300);

      // Build fuzzy resolved map for server-side: { "misspelled name": "channel-uuid" }
      const fuzzyResolvedMap: Record<string, string> = {};
      for (const [input, res] of Object.entries(fuzzyResolutions)) {
        if (res.decision === 'accept' && res.acceptedChannel) {
          fuzzyResolvedMap[input] = res.acceptedChannel.id;
        }
      }

      const result = await bulkUpsertEntries(entries, {
        autoCreateChannels: autoCreateChannels,
        skipFuzzyCheck: true, // client already resolved fuzzy matches in preview
        fuzzyResolvedMap,
      });


      clearInterval(progressInterval);
      setImportProgress(100);
      setImportResults(result);
      setStep('results');
    } catch (err: any) {
      setError(err.message || 'Import failed');
      setStep('preview');
    } finally {
      setImporting(false);
      setSavingAliases(false);
    }
  }, [parseResult, autoCreateChannels, fuzzyResolutions, unresolvedFuzzyCount]);

  const handleDownloadTemplate = useCallback(() => {
    if (Platform.OS === 'web') {
      const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'marketing-import-template.csv';
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

  /** Get the effective channel match type for a row, considering fuzzy resolutions */
  const getEffectiveMatch = useCallback((row: ParsedRow): { type: string; resolvedName?: string } => {
    if (row.channelMatch !== 'fuzzy') {
      return { type: row.channelMatch, resolvedName: row.aliasResolvedTo };
    }
    const resolution = fuzzyResolutions[row.channel];
    if (!resolution || resolution.decision === null) {
      return { type: 'fuzzy-unresolved' };
    }
    if (resolution.decision === 'accept' && resolution.acceptedChannel) {
      return { type: 'fuzzy-accepted', resolvedName: resolution.acceptedChannel.name };
    }
    return { type: 'fuzzy-rejected' };
  }, [fuzzyResolutions]);

  // ============ RENDER: FUZZY MATCH RESOLUTION PANEL ============
  const renderFuzzyResolutionPanel = () => {
    if (!parseResult || parseResult.fuzzyMatchedChannels.length === 0) return null;

    return (
      <View style={s.fuzzyPanel}>
        <View style={s.fuzzyPanelHeader}>
          <View style={s.fuzzyPanelIconWrap}>
            <Ionicons name="search" size={16} color={COLORS.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.fuzzyPanelTitle}>
              Fuzzy Matches Found ({parseResult.fuzzyMatchedChannels.length})
            </Text>
            <Text style={s.fuzzyPanelSubtitle}>
              These channel names are close to existing channels. Please confirm or reject each match.
            </Text>
          </View>
          {unresolvedFuzzyCount > 0 && (
            <View style={s.unresolvedBadge}>
              <Text style={s.unresolvedBadgeText}>{unresolvedFuzzyCount}</Text>
            </View>
          )}
        </View>

        {parseResult.fuzzyMatchedChannels.map((fm) => {
          const resolution = fuzzyResolutions[fm.input];
          const isResolved = resolution?.decision !== null && resolution?.decision !== undefined;
          const isAccepted = resolution?.decision === 'accept';
          const isRejected = resolution?.decision === 'reject';

          return (
            <View
              key={fm.input}
              style={[
                s.fuzzyItem,
                isAccepted && s.fuzzyItemAccepted,
                isRejected && s.fuzzyItemRejected,
                !isResolved && s.fuzzyItemUnresolved,
              ]}
            >
              {/* Input channel name */}
              <View style={s.fuzzyItemHeader}>
                <View style={s.fuzzyInputNameWrap}>
                  <Ionicons
                    name={isAccepted ? 'checkmark-circle' : isRejected ? 'close-circle' : 'help-circle'}
                    size={18}
                    color={isAccepted ? COLORS.success : isRejected ? COLORS.textMuted : '#e67e22'}
                  />
                  <Text style={s.fuzzyInputName} numberOfLines={1}>"{fm.input}"</Text>
                </View>
                {isResolved && (
                  <TouchableOpacity
                    onPress={() => handleFuzzyReset(fm.input)}
                    style={s.fuzzyResetBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="refresh-outline" size={14} color={COLORS.textMuted} />
                    <Text style={s.fuzzyResetText}>Reset</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Resolution status */}
              {isAccepted && resolution?.acceptedChannel && (
                <View style={s.fuzzyAcceptedBanner}>
                  <Ionicons name="arrow-forward" size={12} color={COLORS.success} />
                  <Text style={s.fuzzyAcceptedText}>
                    Will map to <Text style={{ fontWeight: '700' }}>{resolution.acceptedChannel.name}</Text>
                  </Text>
                  {isAdmin && (
                    <TouchableOpacity
                      onPress={() => handleToggleSaveAlias(fm.input)}
                      style={[s.saveAliasToggle, resolution.saveAsAlias && s.saveAliasToggleActive]}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Ionicons
                        name={resolution.saveAsAlias ? 'bookmark' : 'bookmark-outline'}
                        size={12}
                        color={resolution.saveAsAlias ? COLORS.accent : COLORS.textMuted}
                      />
                      <Text style={[s.saveAliasText, resolution.saveAsAlias && s.saveAliasTextActive]}>
                        {resolution.saveAsAlias ? 'Alias saved' : 'Save as alias'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {isRejected && (
                <View style={s.fuzzyRejectedBanner}>
                  <Ionicons name="add-circle-outline" size={12} color={COLORS.warning} />
                  <Text style={s.fuzzyRejectedText}>
                    Will be treated as a new channel
                  </Text>
                </View>
              )}

              {/* Candidates list (shown when unresolved, or collapsed when resolved) */}
              {!isResolved && (
                <View style={s.fuzzyCandidatesList}>
                  <Text style={s.fuzzyCandidatesLabel}>Did you mean:</Text>
                  {fm.candidates.map((candidate, idx) => (
                    <TouchableOpacity
                      key={candidate.channelId}
                      style={s.fuzzyCandidateRow}
                      onPress={() => handleFuzzyAccept(fm.input, candidate)}
                      activeOpacity={0.7}
                    >
                      <View style={s.fuzzyCandidateLeft}>
                        <View style={[s.fuzzyCandidateRank, idx === 0 && s.fuzzyCandidateRankTop]}>
                          <Text style={[s.fuzzyCandidateRankText, idx === 0 && s.fuzzyCandidateRankTextTop]}>
                            {idx + 1}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.fuzzyCandidateName} numberOfLines={1}>{candidate.channelName}</Text>
                          {candidate.matchedVia === 'alias' && candidate.matchedAlias && (
                            <Text style={s.fuzzyCandidateAliasNote} numberOfLines={1}>
                              via alias "{candidate.matchedAlias}"
                            </Text>
                          )}
                        </View>
                      </View>
                      <View style={s.fuzzyCandidateRight}>
                        <View style={[s.confidenceBadge, { backgroundColor: getConfidenceColor(candidate.confidence) + '20' }]}>
                          <View style={[s.confidenceDot, { backgroundColor: getConfidenceColor(candidate.confidence) }]} />
                          <Text style={[s.confidenceText, { color: getConfidenceColor(candidate.confidence) }]}>
                            {formatScore(candidate.score)}
                          </Text>
                        </View>
                        <Ionicons name="checkmark-circle-outline" size={20} color={COLORS.success} />
                      </View>
                    </TouchableOpacity>
                  ))}

                  {/* Reject option */}
                  <TouchableOpacity
                    style={s.fuzzyRejectRow}
                    onPress={() => handleFuzzyReject(fm.input)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close-circle-outline" size={18} color={COLORS.textMuted} />
                    <Text style={s.fuzzyRejectText}>None of these — create as new channel</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  // ============ RENDER STEP: INPUT ============
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
          Paste CSV data with columns for Channel, Month, Investment, Leads, Clients, Revenue, and optionally Notes.
        </Text>
        <View style={s.formatExamples}>
          <Text style={s.formatLabel}>Supported month formats:</Text>
          <Text style={s.formatExample}>2025-01, 01/2025, Jan 2025, January 2025</Text>
        </View>
        <View style={s.formatExamples}>
          <Text style={s.formatLabel}>Supported delimiters:</Text>
          <Text style={s.formatExample}>Comma, Tab, Semicolon, Pipe</Text>
        </View>
        <View style={[s.formatExamples, { marginTop: 8 }]}>
          <Text style={s.formatLabel}>Smart matching:</Text>
          <Text style={s.formatExample}>Exact name, aliases, and fuzzy/approximate matching</Text>
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
        placeholder={`Channel,Month,Investment,Leads,Clients,Revenue,Notes\nFacebook Ads,2025-01,1500,45,8,4800,Q1 campaign\nGoogle Ads,2025-01,2200,62,12,7200,`}
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

  // ============ RENDER STEP: PREVIEW ============
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
            <Text style={[s.summaryValue, { color: parseResult.errorCount > 0 ? COLORS.danger : COLORS.textMuted }]}>{parseResult.errorCount}</Text>
            <Text style={s.summaryLabel}>Errors</Text>
          </View>
        </View>
      )}

      {/* Channel matching info */}
      {parseResult && (parseResult.matchedChannels.length > 0 || parseResult.aliasMatchedChannels.length > 0 || parseResult.fuzzyMatchedChannels.length > 0 || parseResult.newChannels.length > 0) && (
        <View style={s.channelInfoCard}>
          {parseResult.matchedChannels.length > 0 && (
            <View style={s.channelInfoRow}>
              <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
              <Text style={s.channelInfoText}>
                <Text style={{ fontWeight: '700' }}>{parseResult.matchedChannels.length}</Text> existing channel{parseResult.matchedChannels.length !== 1 ? 's' : ''} matched
              </Text>
            </View>
          )}
          {parseResult.aliasMatchedChannels.length > 0 && (
            <View style={s.channelInfoRow}>
              <Ionicons name="git-branch-outline" size={16} color={COLORS.info} />
              <Text style={s.channelInfoText}>
                <Text style={{ fontWeight: '700' }}>{parseResult.aliasMatchedChannels.length}</Text> alias{parseResult.aliasMatchedChannels.length !== 1 ? 'es' : ''} resolved:{' '}
                {parseResult.aliasMatchedChannels.map((m, idx) => (
                  <Text key={idx}>
                    {idx > 0 ? ', ' : ''}
                    <Text style={{ fontWeight: '600', color: COLORS.info }}>"{m.alias}"</Text>
                    <Text style={{ color: COLORS.textMuted }}>{' -> '}</Text>
                    <Text style={{ fontWeight: '600' }}>{m.channelName}</Text>
                  </Text>
                ))}
              </Text>
            </View>
          )}
          {parseResult.fuzzyMatchedChannels.length > 0 && (
            <View style={s.channelInfoRow}>
              <Ionicons name="search" size={16} color="#e67e22" />
              <Text style={s.channelInfoText}>
                <Text style={{ fontWeight: '700' }}>{parseResult.fuzzyMatchedChannels.length}</Text> approximate match{parseResult.fuzzyMatchedChannels.length !== 1 ? 'es' : ''} need review
                {unresolvedFuzzyCount > 0 && (
                  <Text style={{ fontWeight: '700', color: '#e67e22' }}> ({unresolvedFuzzyCount} unresolved)</Text>
                )}
              </Text>
            </View>
          )}
          {parseResult.newChannels.length > 0 && (
            <View style={s.channelInfoRow}>
              <Ionicons name="add-circle" size={16} color={COLORS.warning} />
              <Text style={s.channelInfoText}>
                <Text style={{ fontWeight: '700' }}>{parseResult.newChannels.length}</Text> new channel{parseResult.newChannels.length !== 1 ? 's' : ''} will be created:{' '}
                <Text style={{ fontWeight: '600', color: COLORS.warning }}>{parseResult.newChannels.join(', ')}</Text>
              </Text>
            </View>
          )}
        </View>
      )}

      {/* ── FUZZY MATCH RESOLUTION PANEL ── */}
      {renderFuzzyResolutionPanel()}

      {/* Auto-create toggle */}
      {parseResult && (parseResult.newChannels.length > 0 || Object.values(fuzzyResolutions).some(r => r.decision === 'reject')) && isAdmin && (
        <View style={s.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.toggleLabel}>Auto-create new channels</Text>
            <Text style={s.toggleHint}>Automatically create channels that don't exist yet</Text>
          </View>
          <Switch
            value={autoCreateChannels}
            onValueChange={setAutoCreateChannels}
            trackColor={{ false: COLORS.border, true: COLORS.accent + '60' }}
            thumbColor={autoCreateChannels ? COLORS.accent : COLORS.textMuted}
          />
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
          <Text style={[s.th, { flex: 1.5 }]}>Channel</Text>
          <Text style={[s.th, { flex: 1 }]}>Month</Text>
          <Text style={[s.th, { flex: 0.8, textAlign: 'right' }]}>Invest</Text>
          <Text style={[s.th, { flex: 0.5, textAlign: 'right' }]}>Leads</Text>
          <Text style={[s.th, { flex: 0.5, textAlign: 'right' }]}>Clients</Text>
          <Text style={[s.th, { flex: 0.8, textAlign: 'right' }]}>Revenue</Text>
          <View style={{ width: 24 }} />
        </View>

        {displayRows.map((row) => {
          const effective = getEffectiveMatch(row);
          const isFuzzyUnresolved = effective.type === 'fuzzy-unresolved';
          const isFuzzyAccepted = effective.type === 'fuzzy-accepted';
          const isFuzzyRejected = effective.type === 'fuzzy-rejected';

          return (
            <View
              key={row.rowNum}
              style={[
                s.tableRow,
                !row.isValid && s.tableRowError,
                row.channelMatch === 'new' && row.isValid && s.tableRowNew,
                isFuzzyUnresolved && s.tableRowFuzzy,
                isFuzzyAccepted && s.tableRowFuzzyAccepted,
                isFuzzyRejected && s.tableRowNew,
              ]}
            >
              <Text style={[s.td, { width: 28, color: COLORS.textMuted }]}>{row.rowNum}</Text>
              {effective.type === 'exact' && (
                <Ionicons name="checkmark-circle" size={12} color={COLORS.success} />
              )}
              {effective.type === 'alias' && (
                <Ionicons name="git-branch-outline" size={12} color={COLORS.info} />
              )}
              {isFuzzyUnresolved && (
                <Ionicons name="help-circle" size={12} color="#e67e22" />
              )}
              {isFuzzyAccepted && (
                <Ionicons name="search" size={12} color={COLORS.success} />
              )}
              {isFuzzyRejected && (
                <Ionicons name="add-circle" size={12} color={COLORS.warning} />
              )}
              {effective.type === 'new' && (
                <Ionicons name="add-circle" size={12} color={COLORS.warning} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={[s.td]} numberOfLines={1}>{row.channel}</Text>
                {effective.type === 'alias' && row.aliasResolvedTo && (
                  <Text style={{ fontSize: 9, color: COLORS.info, fontWeight: '500' }} numberOfLines={1}>
                    {'-> '}{row.aliasResolvedTo}
                  </Text>
                )}
                {isFuzzyAccepted && effective.resolvedName && (
                  <Text style={{ fontSize: 9, color: COLORS.success, fontWeight: '500' }} numberOfLines={1}>
                    {'~> '}{effective.resolvedName}
                  </Text>
                )}
                {isFuzzyUnresolved && (
                  <Text style={{ fontSize: 9, color: '#e67e22', fontWeight: '500' }} numberOfLines={1}>
                    Needs review
                  </Text>
                )}
              </View>

              <Text style={[s.td, { flex: 1 }]}>{row.month && MONTH_REGEX.test(row.month) ? getMonthLabel(row.month) : row.month}</Text>
              <Text style={[s.td, { flex: 0.8, textAlign: 'right' }]}>${row.investment.toLocaleString()}</Text>
              <Text style={[s.td, { flex: 0.5, textAlign: 'right' }]}>{row.leads}</Text>
              <Text style={[s.td, { flex: 0.5, textAlign: 'right' }]}>{row.clients}</Text>
              <Text style={[s.td, { flex: 0.8, textAlign: 'right' }]}>${row.revenue.toLocaleString()}</Text>
              <View style={{ width: 24, alignItems: 'center' }}>
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
          );
        })}
      </View>

      <View style={{ height: 20 }} />
    </ScrollView>
  );

  // ============ RENDER STEP: IMPORTING ============
  const renderImportingStep = () => (
    <View style={[s.body, { justifyContent: 'center', alignItems: 'center', paddingVertical: 60 }]}>
      <View style={s.importingIcon}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
      <Text style={s.importingTitle}>
        {savingAliases ? 'Saving Aliases...' : 'Importing Data...'}
      </Text>
      <Text style={s.importingSubtitle}>
        {savingAliases
          ? 'Creating permanent aliases for fuzzy matches'
          : `Processing ${parseResult?.validCount || 0} entries`
        }
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

  // ============ RENDER STEP: RESULTS ============
  const renderResultsStep = () => {
    const summary = importResults?.summary;
    const failedResults = importResults?.results.filter(r => !r.success) || [];
    const aliasesSaved = Object.values(fuzzyResolutions).filter(
      r => r.decision === 'accept' && r.saveAsAlias
    );

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

        {/* Aliases saved */}
        {aliasesSaved.length > 0 && (
          <View style={s.aliasesSavedCard}>
            <View style={s.aliasesSavedHeader}>
              <Ionicons name="bookmark" size={16} color={COLORS.accent} />
              <Text style={s.aliasesSavedTitle}>Aliases Saved</Text>
            </View>
            <Text style={s.aliasesSavedDesc}>
              The following fuzzy matches were saved as permanent aliases for future imports:
            </Text>
            {aliasesSaved.map((res, i) => (
              <View key={i} style={s.aliasesSavedRow}>
                <Text style={s.aliasesSavedAlias}>"{res.input}"</Text>
                <Ionicons name="arrow-forward" size={12} color={COLORS.textMuted} />
                <Text style={s.aliasesSavedChannel}>{res.acceptedChannel?.name}</Text>
              </View>
            ))}
          </View>
        )}

        {summary && summary.new_channels.length > 0 && (
          <View style={s.newChannelsCard}>
            <View style={s.newChannelsHeader}>
              <Ionicons name="pricetag-outline" size={16} color={COLORS.accent} />
              <Text style={s.newChannelsTitle}>New Channels Created</Text>
            </View>
            <View style={s.newChannelsList}>
              {summary.new_channels.map((name, i) => (
                <View key={i} style={s.newChannelChip}>
                  <Text style={s.newChannelChipText}>{name}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {failedResults.length > 0 && (
          <View style={s.failedSection}>
            <Text style={s.failedTitle}>Failed Entries</Text>
            {failedResults.map((r, i) => (
              <View key={i} style={s.failedRow}>
                <View style={s.failedRowHeader}>
                  <Text style={s.failedRowNum}>Row {r.index + 1}</Text>
                  {r.channel_name && <Text style={s.failedRowChannel}>{r.channel_name}</Text>}
                  {r.month && <Text style={s.failedRowMonth}>{r.month}</Text>}
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

  // ============ FOOTER BUTTONS ============
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
              style={[
                s.importBtn,
                (!parseResult || parseResult.validCount === 0 || unresolvedFuzzyCount > 0) && s.btnDisabled,
              ]}
              onPress={handleImport}
              disabled={!parseResult || parseResult.validCount === 0 || unresolvedFuzzyCount > 0}
            >
              <Ionicons name="cloud-upload-outline" size={18} color={COLORS.white} />
              <Text style={s.primaryBtnText}>
                {unresolvedFuzzyCount > 0
                  ? `Resolve ${unresolvedFuzzyCount} Match${unresolvedFuzzyCount !== 1 ? 'es' : ''}`
                  : `Import ${parseResult?.validCount || 0} Entries`
                }
              </Text>
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

  // ============ STEP INDICATOR ============
  const renderStepIndicator = () => {
    const steps: { key: Step; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
      { key: 'input', label: 'Paste Data', icon: 'clipboard-outline' },
      { key: 'preview', label: 'Preview', icon: 'eye-outline' },
      { key: 'importing', label: 'Import', icon: 'cloud-upload-outline' },
      { key: 'results', label: 'Results', icon: 'checkmark-circle-outline' },
    ];
    const currentIdx = steps.findIndex(s => s.key === step);

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
              <View style={[s.stepDot, isActive && s.stepDotActive, isCompleted && s.stepDotCompleted]}>
                <Ionicons
                  name={isCompleted ? 'checkmark' : st.icon}
                  size={12}
                  color={isActive || isCompleted ? COLORS.white : COLORS.textMuted}
                />
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
                <Text style={s.headerTitle}>Mass Import</Text>
                <Text style={s.headerSubtitle}>Upload historical marketing data</Text>
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

// ============ STYLES ============

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'transparent', justifyContent: 'flex-end' },
  overlayBg: { ...StyleSheet.absoluteFillObject, backgroundColor: COLORS.overlay },
  container: { backgroundColor: COLORS.background, borderTopLeftRadius: BORDER_RADIUS.xl, borderTopRightRadius: BORDER_RADIUS.xl, maxHeight: '94%', minHeight: '60%' },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.white, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderTopLeftRadius: BORDER_RADIUS.xl, borderTopRightRadius: BORDER_RADIUS.xl, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  headerIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.primary },
  headerSubtitle: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 1 },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.borderLight, alignItems: 'center', justifyContent: 'center' },

  // Step Indicator
  stepIndicator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.md, paddingHorizontal: SPACING.xl, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  stepDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.borderLight, alignItems: 'center', justifyContent: 'center' },
  stepDotActive: { backgroundColor: COLORS.accent },
  stepDotCompleted: { backgroundColor: COLORS.success },
  stepLine: { flex: 1, height: 2, backgroundColor: COLORS.borderLight, marginHorizontal: 4 },
  stepLineCompleted: { backgroundColor: COLORS.success },

  // Body
  body: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, flex: 1 },

  // Error
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.dangerLight, padding: SPACING.md, borderRadius: BORDER_RADIUS.md, marginBottom: SPACING.md },
  errorText: { fontSize: FONT_SIZES.sm, color: COLORS.danger, fontWeight: '600', flex: 1 },

  // Info Card
  infoCard: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md, borderLeftWidth: 3, borderLeftColor: COLORS.accent, ...SHADOWS.sm },
  infoCardHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  infoCardTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.primary },
  infoCardText: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, lineHeight: 20, marginBottom: SPACING.sm },
  formatExamples: { marginTop: 4 },
  formatLabel: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.3 },
  formatExample: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginTop: 2 },

  // Template
  templateRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  templateBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.accent + '40', backgroundColor: COLORS.white },
  templateBtnText: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.accent },

  // CSV Input
  label: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  csvInput: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, fontSize: FONT_SIZES.sm, color: COLORS.text, minHeight: 200, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', textAlignVertical: 'top', lineHeight: 20 },
  rowCountBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: SPACING.sm, paddingHorizontal: SPACING.sm },
  rowCountText: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, fontWeight: '500' },

  // Summary Cards
  summaryRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  summaryCard: { flex: 1, backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, alignItems: 'center', borderLeftWidth: 3, ...SHADOWS.sm },
  summaryValue: { fontSize: FONT_SIZES.xxl, fontWeight: '800', color: COLORS.primary },
  summaryLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '600', marginTop: 2 },

  // Channel Info
  channelInfoCard: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md, gap: SPACING.sm, ...SHADOWS.sm },
  channelInfoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  channelInfoText: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, flex: 1, lineHeight: 20 },

  // Toggle
  toggleRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md, ...SHADOWS.sm },
  toggleLabel: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.text },
  toggleHint: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 2 },

  // Filter toggle
  filterToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: SPACING.sm, paddingHorizontal: SPACING.sm },
  filterToggleText: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: COLORS.textMuted },

  // Preview Table
  previewTable: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, overflow: 'hidden', ...SHADOWS.sm },
  tableHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primary, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm },
  th: { fontSize: 9, fontWeight: '700', color: COLORS.white, textTransform: 'uppercase', letterSpacing: 0.3 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight, flexWrap: 'wrap' },
  tableRowError: { backgroundColor: COLORS.dangerLight + '40' },
  tableRowNew: { backgroundColor: COLORS.warningLight + '40' },
  tableRowFuzzy: { backgroundColor: '#fef3e2' },
  tableRowFuzzyAccepted: { backgroundColor: '#e8f8f0' },
  td: { fontSize: FONT_SIZES.xs, color: COLORS.text, fontWeight: '500' },
  rowErrorContainer: { width: '100%', paddingLeft: 28, paddingTop: 4 },
  rowErrorText: { fontSize: 9, color: COLORS.danger, fontWeight: '500', lineHeight: 14 },

  // ── Fuzzy Resolution Panel ──
  fuzzyPanel: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg, marginBottom: SPACING.md, overflow: 'hidden', borderWidth: 1, borderColor: '#e67e22' + '40', ...SHADOWS.md },
  fuzzyPanelHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, padding: SPACING.md, backgroundColor: '#fef3e2', borderBottomWidth: 1, borderBottomColor: '#e67e22' + '30' },
  fuzzyPanelIconWrap: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#e67e22', alignItems: 'center', justifyContent: 'center' },
  fuzzyPanelTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.primary },
  fuzzyPanelSubtitle: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, marginTop: 1, lineHeight: 16 },
  unresolvedBadge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: '#e67e22', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  unresolvedBadgeText: { fontSize: 11, fontWeight: '800', color: COLORS.white },

  fuzzyItem: { padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  fuzzyItemAccepted: { backgroundColor: '#f0faf5' },
  fuzzyItemRejected: { backgroundColor: '#fafafa' },
  fuzzyItemUnresolved: { backgroundColor: '#fffcf5' },

  fuzzyItemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm },
  fuzzyInputNameWrap: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flex: 1 },
  fuzzyInputName: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.primary, flex: 1 },
  fuzzyResetBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: BORDER_RADIUS.sm, backgroundColor: COLORS.borderLight },
  fuzzyResetText: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '600' },

  fuzzyAcceptedBanner: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.successLight, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.sm },
  fuzzyAcceptedText: { fontSize: FONT_SIZES.sm, color: COLORS.text, flex: 1 },
  fuzzyRejectedBanner: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.warningLight, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.sm },
  fuzzyRejectedText: { fontSize: FONT_SIZES.sm, color: COLORS.text },

  saveAliasToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: BORDER_RADIUS.sm, borderWidth: 1, borderColor: COLORS.border },
  saveAliasToggleActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accent + '10' },
  saveAliasText: { fontSize: 10, fontWeight: '600', color: COLORS.textMuted },
  saveAliasTextActive: { color: COLORS.accent },

  fuzzyCandidatesList: { marginTop: 4 },
  fuzzyCandidatesLabel: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: SPACING.sm },

  fuzzyCandidateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: SPACING.sm, paddingHorizontal: SPACING.sm, marginBottom: 4, borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.borderLight },
  fuzzyCandidateLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flex: 1 },
  fuzzyCandidateRank: { width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.borderLight, alignItems: 'center', justifyContent: 'center' },
  fuzzyCandidateRankTop: { backgroundColor: COLORS.accent + '20' },
  fuzzyCandidateRankText: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted },
  fuzzyCandidateRankTextTop: { color: COLORS.accent },
  fuzzyCandidateName: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.primary },
  fuzzyCandidateAliasNote: { fontSize: 9, color: COLORS.textMuted, fontStyle: 'italic', marginTop: 1 },
  fuzzyCandidateRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },

  confidenceBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: BORDER_RADIUS.full },
  confidenceDot: { width: 6, height: 6, borderRadius: 3 },
  confidenceText: { fontSize: 10, fontWeight: '700' },

  fuzzyRejectRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.sm, marginTop: 2, borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.borderLight, borderStyle: 'dashed' },
  fuzzyRejectText: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted, fontWeight: '500' },

  // Importing
  importingIcon: { marginBottom: SPACING.lg },
  importingTitle: { fontSize: FONT_SIZES.xl, fontWeight: '700', color: COLORS.primary, marginBottom: SPACING.sm },
  importingSubtitle: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, marginBottom: SPACING.xl },
  progressBarOuter: { width: '80%', height: 8, backgroundColor: COLORS.borderLight, borderRadius: 4, overflow: 'hidden', marginBottom: SPACING.sm },
  progressBarInner: { height: '100%', backgroundColor: COLORS.accent, borderRadius: 4 },
  progressText: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.accent },
  importingHint: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: SPACING.lg, fontStyle: 'italic' },

  // Results
  resultHeader: { alignItems: 'center', padding: SPACING.xl, borderRadius: BORDER_RADIUS.lg, marginBottom: SPACING.md },
  resultHeaderSuccess: { backgroundColor: COLORS.successLight },
  resultHeaderMixed: { backgroundColor: COLORS.warningLight },
  resultIconCircle: { marginBottom: SPACING.sm },
  resultTitle: { fontSize: FONT_SIZES.xl, fontWeight: '800', color: COLORS.primary, textAlign: 'center' },
  resultSubtitle: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, marginTop: 4, textAlign: 'center' },

  resultStatsGrid: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  resultStatCard: { flex: 1, backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, alignItems: 'center', gap: 4, ...SHADOWS.sm },
  resultStatValue: { fontSize: FONT_SIZES.xxl, fontWeight: '800', color: COLORS.primary },
  resultStatLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '600' },

  // Aliases saved card
  aliasesSavedCard: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md, borderLeftWidth: 3, borderLeftColor: COLORS.accent, ...SHADOWS.sm },
  aliasesSavedHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  aliasesSavedTitle: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.primary },
  aliasesSavedDesc: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, marginBottom: SPACING.sm, lineHeight: 16 },
  aliasesSavedRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: 4 },
  aliasesSavedAlias: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.accent },
  aliasesSavedChannel: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.primary },

  newChannelsCard: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md, ...SHADOWS.sm },
  newChannelsHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  newChannelsTitle: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.primary },
  newChannelsList: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  newChannelChip: { backgroundColor: COLORS.accent + '15', paddingHorizontal: SPACING.md, paddingVertical: 4, borderRadius: BORDER_RADIUS.full },
  newChannelChipText: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: COLORS.accent },

  failedSection: { marginBottom: SPACING.md },
  failedTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.danger, marginBottom: SPACING.sm },
  failedRow: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm, borderLeftWidth: 3, borderLeftColor: COLORS.danger, ...SHADOWS.sm },
  failedRowHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: 4 },
  failedRowNum: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.textMuted },
  failedRowChannel: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: COLORS.text },
  failedRowMonth: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted },
  failedRowError: { fontSize: FONT_SIZES.xs, color: COLORS.danger, fontWeight: '500' },

  // Footer
  footer: { flexDirection: 'row', gap: SPACING.sm, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  cancelBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.borderLight },
  cancelBtnText: { fontSize: FONT_SIZES.md, fontWeight: '600', color: COLORS.textSecondary },
  primaryBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.accent },
  importBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.success },
  doneBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.accent },
  primaryBtnText: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.white },
  btnDisabled: { opacity: 0.5 },
});
