import { supabase } from '@/app/lib/supabase';

export interface ChannelAlias {
  id: string;
  channel_id: string;
  alias: string;
  created_at: string;
  created_by: string | null;
}

export interface MarketingChannel {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  aliases: ChannelAlias[];
}


export interface MarketingEntry {
  id: string;
  channel_id: string;
  channel_name: string;
  month: string;
  franchise_id: string | null;
  investment: number;
  leads: number;
  clients: number;
  revenue: number;
  notes: string | null;
  lead_cost: number;
  conversion_rate: number;
  cost_per_client: number;
  revenue_per_client: number;
  profit: number;
  roi: number;
  marketing_channels?: { name: string; is_active: boolean };
}

export interface MonthlyTotals {
  investment: number;
  leads: number;
  clients: number;
  revenue: number;
  profit: number;
  roi: number;
  lead_cost: number;
  conversion_rate: number;
  cost_per_client: number;
  revenue_per_client: number;
}

export interface TrendDataPoint {
  month: string;
  investment: number;
  leads: number;
  clients: number;
  revenue: number;
  profit: number;
  roi: number;
  cost_per_client: number;
  lead_cost: number;
  conversion_rate: number;
  channels: Record<string, { investment: number; leads: number; clients: number; revenue: number }>;
}

// ============ ATTRIBUTION TYPES ============
export interface RevenueEvent {
  id: string;
  client_id: string;
  amount: number;
  description: string | null;
  event_date: string;
  event_type: 'payment' | 'package' | 'renewal' | 'refund' | 'other';
  created_by: string | null;
  created_at: string;
}

export interface ClientJourney {
  id: string;
  full_name: string;
  email: string;
  franchise: string | null;
  lead_source_channel_id: string;
  lead_source_date: string | null;
  conversion_date: string | null;
  created_at: string;
  status: string | null;
  program: string | null;
  channel_name: string;
  ltv: number;
  revenue_events: RevenueEvent[];
}

export interface ChannelAttribution {
  channel_id: string;
  channel_name: string;
  total_spend: number;
  reported_leads: number;
  reported_clients: number;
  reported_revenue: number;
  attributed_clients: number;
  attributed_ltv: number;
  attributed_avg_ltv: number;
  attributed_revenue_events: number;
  attribution_roi: number;
  cost_per_attributed_client: number;
  clients: {
    id: string;
    full_name: string;
    email: string;
    franchise: string | null;
    lead_source_date: string | null;
    conversion_date: string | null;
    created_at: string;
    status: string | null;
    program: string | null;
    ltv: number;
    revenue_events: number;
  }[];
}

export interface AttributionTotals {
  total_spend: number;
  attributed_clients: number;
  attributed_ltv: number;
  reported_leads: number;
  overall_roi: number;
  avg_ltv: number;
  cost_per_client: number;
}

export interface UnattributedClient {
  id: string;
  full_name: string;
  email: string;
  franchise: string | null;
  created_at: string;
  status: string | null;
  program: string | null;
}

// Custom error class that carries HTTP status and user-friendly message
export class MarketingServiceError extends Error {
  status: number;
  userMessage: string;

  constructor(message: string, status: number, userMessage: string) {
    super(message);
    this.name = 'MarketingServiceError';
    this.status = status;
    this.userMessage = userMessage;
  }
}

function getUserFriendlyMessage(status: number, serverMessage?: string): string {
  switch (status) {
    case 401:
      return 'Please sign in to view marketing data.';
    case 403:
      return 'You do not have permission to view marketing data.';
    case 404:
      return 'The marketing data service is not available. Please contact support.';
    case 429:
      return 'Too many requests. Please wait a moment and try again.';
    case 500:
    case 502:
    case 503:
      return 'The server encountered an error. Please try again in a few moments.';
    default:
      return serverMessage || 'An unexpected error occurred while loading marketing data.';
  }
}

async function invokeMarketing(body: any, retries = 2): Promise<any> {
  let lastError: any = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { data, error } = await supabase.functions.invoke('manage-marketing-data', { body });

      if (error) {
        let status = 0;
        let serverMessage = '';

        // Try to parse the actual error response body
        try {
          const context = (error as any).context;
          if (context && typeof context.json === 'function') {
            status = context.status || 0;
            const responseBody = await context.json();
            serverMessage = responseBody?.error || responseBody?.message || '';
          } else if (context && typeof context.status === 'number') {
            status = context.status;
          }
        } catch {
          // If parsing fails, fall through to generic handling
        }

        // If we still don't have a status, try to infer from the error message
        if (!status) {
          const msg = error.message || '';
          if (msg.includes('401') || msg.toLowerCase().includes('unauthorized')) status = 401;
          else if (msg.includes('403') || msg.toLowerCase().includes('forbidden') || msg.toLowerCase().includes('permission')) status = 403;
          else if (msg.includes('non-2xx')) status = 500;
        }

        // Check for circuit_breaker_open or transient errors - retry these
        const errorMsg = (error.message || serverMessage || '').toLowerCase();
        const isTransient = errorMsg.includes('circuit_breaker') || 
                           errorMsg.includes('circuit breaker') ||
                           status === 503 || status === 502 || status === 500;

        if (isTransient && attempt < retries) {
          // Wait with exponential backoff: 1s, 2s, 4s...
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`[marketingService] Transient error (attempt ${attempt + 1}/${retries + 1}), retrying in ${delay}ms...`, errorMsg);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        const userMessage = getUserFriendlyMessage(status, serverMessage);
        throw new MarketingServiceError(
          serverMessage || error.message || 'Network error',
          status,
          userMessage
        );
      }

      if (!data?.success) {
        const serverMsg = data?.error || 'Unknown error';
        
        // Check for circuit breaker in response data too
        const isTransient = serverMsg.toLowerCase().includes('circuit_breaker') || 
                           serverMsg.toLowerCase().includes('circuit breaker');
        if (isTransient && attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`[marketingService] Circuit breaker detected in response (attempt ${attempt + 1}/${retries + 1}), retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        throw new MarketingServiceError(
          serverMsg,
          400,
          serverMsg
        );
      }

      return data;
    } catch (err: any) {
      lastError = err;
      
      // If it's already a MarketingServiceError, don't retry unless it's transient
      if (err instanceof MarketingServiceError) {
        const isTransient = err.message.toLowerCase().includes('circuit_breaker') ||
                           err.message.toLowerCase().includes('circuit breaker') ||
                           err.status === 503 || err.status === 502;
        if (isTransient && attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`[marketingService] Retrying after MarketingServiceError (attempt ${attempt + 1}/${retries + 1}), waiting ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw err;
      }

      // For unexpected errors, retry if we have attempts left
      if (attempt < retries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`[marketingService] Unexpected error (attempt ${attempt + 1}/${retries + 1}), retrying in ${delay}ms...`, err.message);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }

  // Should not reach here, but just in case
  throw lastError || new MarketingServiceError('Failed after retries', 500, 'The service is temporarily unavailable. Please try again in a moment.');
}




// ============ CHANNELS ============
export async function getChannels(): Promise<MarketingChannel[]> {
  const result = await invokeMarketing({ action: 'get_channels' });
  return result.data || [];
}

export async function addChannel(name: string): Promise<MarketingChannel> {
  const result = await invokeMarketing({ action: 'add_channel', name });
  return result.data;
}

export async function updateChannel(id: string, updates: Partial<MarketingChannel>): Promise<MarketingChannel> {
  const result = await invokeMarketing({ action: 'update_channel', id, ...updates });
  return result.data;
}

export async function deleteChannel(id: string): Promise<void> {
  await invokeMarketing({ action: 'delete_channel', id });
}

// ============ ENTRIES ============
export async function getEntries(params: {
  month?: string;
  franchise_id?: string;
  start_month?: string;
  end_month?: string;
}): Promise<MarketingEntry[]> {
  const result = await invokeMarketing({ action: 'get_entries', ...params });
  return result.data || [];
}

export async function upsertEntry(entry: {
  channel_id: string;
  month: string;
  investment: number;
  leads: number;
  clients: number;
  revenue: number;
  notes?: string;
  franchise_id?: string;
}): Promise<MarketingEntry> {
  const result = await invokeMarketing({ action: 'upsert_entry', ...entry });
  return result.data;
}

export async function deleteEntry(id: string): Promise<void> {
  await invokeMarketing({ action: 'delete_entry', id });
}

// ============ BULK IMPORT ============
export interface BulkImportEntry {
  channel_name: string;
  channel_id?: string;
  month: string;
  investment: number;
  leads: number;
  clients: number;
  revenue: number;
  notes?: string;
  franchise_id?: string;
}

export interface BulkImportResult {
  index: number;
  success: boolean;
  error?: string;
  action?: string;
  channel_name?: string;
  month?: string;
  resolved_via?: string;
  fuzzy_pending?: boolean;
}

export interface ServerFuzzyCandidate {
  channel_id: string;
  channel_name: string;
  score: number;
  confidence: 'high' | 'medium' | 'low';
  matched_via: 'name' | 'alias';
  matched_alias?: string;
}

export interface FuzzyPendingEntry {
  index: number;
  channel_name: string;
  month: string;
  candidates: ServerFuzzyCandidate[];
}

export interface BulkImportSummary {
  total: number;
  success: number;
  failed: number;
  created: number;
  updated: number;
  new_channels: string[];
  alias_resolved?: number;
  alias_matches?: { alias: string; channel_name: string }[];
  fuzzy_pre_resolved?: number;
  fuzzy_pending?: number;
  fuzzy_threshold?: number;
}

export interface BulkImportResponse {
  results: BulkImportResult[];
  summary: BulkImportSummary;
  /** True when the server found fuzzy matches that need user confirmation */
  requires_fuzzy_resolution?: boolean;
  /** Entries with fuzzy candidates, present when requires_fuzzy_resolution is true */
  fuzzy_candidates?: FuzzyPendingEntry[];
}

export interface BulkImportOptions {
  autoCreateChannels?: boolean;
  /**
   * Minimum similarity score (0–1) for fuzzy matching. Default 0.65.
   * Lower values return more candidates but with lower confidence.
   * Higher values are stricter and may miss near-matches.
   */
  fuzzyThreshold?: number;
  /**
   * Skip server-side fuzzy checking. Use when the client has already
   * resolved fuzzy matches in the preview step.
   */
  skipFuzzyCheck?: boolean;
  /**
   * Pre-resolved fuzzy map: { "misspelled name": "channel-uuid" }.
   * Entries whose channel_name matches a key will use the mapped channel ID.
   */
  fuzzyResolvedMap?: Record<string, string>;
}

export async function bulkUpsertEntries(
  entries: BulkImportEntry[],
  options: BulkImportOptions | boolean = false,
): Promise<BulkImportResponse> {
  // Backwards compatibility: if a boolean is passed, treat it as autoCreateChannels
  const opts: BulkImportOptions = typeof options === 'boolean'
    ? { autoCreateChannels: options }
    : options;

  const result = await invokeMarketing({
    action: 'bulk_upsert_entries',
    entries,
    auto_create_channels: opts.autoCreateChannels ?? false,
    fuzzy_threshold: opts.fuzzyThreshold,
    skip_fuzzy_check: opts.skipFuzzyCheck,
    fuzzy_resolved_map: opts.fuzzyResolvedMap,
  });
  return result.data;
}


// ============ CHANNEL ALIASES ============
export async function getChannelAliases(channelId?: string): Promise<ChannelAlias[]> {
  const result = await invokeMarketing({
    action: 'get_channel_aliases',
    ...(channelId ? { channel_id: channelId } : {}),
  });
  return result.data || [];
}

export async function addChannelAlias(channelId: string, alias: string): Promise<ChannelAlias> {
  const result = await invokeMarketing({
    action: 'add_channel_alias',
    channel_id: channelId,
    alias,
  });
  return result.data;
}

export async function deleteChannelAlias(aliasId: string): Promise<void> {
  await invokeMarketing({ action: 'delete_channel_alias', alias_id: aliasId });
}




// ============ REPORTS ============
export async function getMonthlySummary(month: string, franchise_id?: string): Promise<{
  entries: MarketingEntry[];
  totals: MonthlyTotals;
}> {
  const result = await invokeMarketing({ action: 'get_monthly_summary', month, franchise_id });
  return result.data;
}

export async function getTrendData(start_month: string, end_month: string, franchise_id?: string): Promise<TrendDataPoint[]> {
  const result = await invokeMarketing({ action: 'get_trend_data', start_month, end_month, franchise_id });
  return result.data || [];
}

// ============ ATTRIBUTION ============
export async function setClientAttribution(params: {
  client_id: string;
  channel_id: string | null;
  lead_source_date?: string | null;
  conversion_date?: string | null;
}): Promise<any> {
  const result = await invokeMarketing({ action: 'set_client_attribution', ...params });
  return result.data;
}

export async function getAttributionReport(params?: {
  franchise_id?: string;
  start_month?: string;
  end_month?: string;
}): Promise<{ channels: ChannelAttribution[]; totals: AttributionTotals }> {
  const result = await invokeMarketing({ action: 'get_attribution_report', ...(params || {}) });
  return result.data;
}

export async function getClientJourneys(params?: {
  franchise_id?: string;
  channel_id?: string;
  limit?: number;
  offset?: number;
}): Promise<ClientJourney[]> {
  const result = await invokeMarketing({ action: 'get_client_journeys', ...(params || {}) });
  return result.data || [];
}

export async function getClientJourneyDetail(client_id: string): Promise<ClientJourney> {
  const result = await invokeMarketing({ action: 'get_client_journey_detail', client_id });
  return result.data;
}

export async function getUnattributedClients(): Promise<UnattributedClient[]> {
  const result = await invokeMarketing({ action: 'get_unattributed_clients' });
  return result.data || [];
}

// ============ REVENUE EVENTS ============
export async function addRevenueEvent(params: {
  client_id: string;
  amount: number;
  description?: string;
  event_date?: string;
  event_type?: string;
}): Promise<RevenueEvent> {
  const result = await invokeMarketing({ action: 'add_revenue_event', ...params });
  return result.data;
}

export async function updateRevenueEvent(params: {
  id: string;
  amount?: number;
  description?: string;
  event_date?: string;
  event_type?: string;
}): Promise<RevenueEvent> {
  const result = await invokeMarketing({ action: 'update_revenue_event', ...params });
  return result.data;
}

export async function deleteRevenueEvent(id: string): Promise<void> {
  await invokeMarketing({ action: 'delete_revenue_event', id });
}

// ============ HELPERS ============
export function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export function formatCurrencyFull(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function getMonthLabel(monthStr: string): string {
  const [year, month] = monthStr.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function getPreviousMonths(count: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

/**
 * Returns all 12 months for a given year, in descending order (Dec → Jan).
 * If the year is the current year, only returns months up to the current month.
 * If the year is in the future, returns an empty array.
 */
export function getMonthsForYear(year: number): string[] {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-based

  if (year > currentYear) return [];

  const maxMonth = year === currentYear ? currentMonth : 11; // 0-based
  const months: string[] = [];
  for (let m = maxMonth; m >= 0; m--) {
    months.push(`${year}-${String(m + 1).padStart(2, '0')}`);
  }
  return months;
}

/**
 * Returns the earliest year that should be available for selection.
 * Defaults to 5 years before the current year, but can be overridden.
 */
export function getAvailableYears(startYear?: number): number[] {
  const now = new Date();
  const currentYear = now.getFullYear();
  const start = startYear ?? (currentYear - 10);
  const years: number[] = [];
  for (let y = currentYear; y >= start; y--) {
    years.push(y);
  }
  return years;
}


export function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function daysBetween(date1: string | null, date2: string | null): number | null {
  if (!date1 || !date2) return null;
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return Math.round(Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

export function generateCSV(entries: MarketingEntry[], totals: MonthlyTotals, month: string): string {
  const headers = [
    'Channel', 'Investment', 'Leads', 'Clients', 'Revenue',
    'Lead Cost', 'Conversion Rate', 'Cost/Client', 'Revenue/Client', 'Profit', 'ROI'
  ];
  
  const rows = entries.map(e => [
    e.channel_name,
    e.investment.toFixed(2),
    e.leads,
    e.clients,
    Number(e.revenue).toFixed(2),
    e.lead_cost.toFixed(2),
    `${e.conversion_rate.toFixed(1)}%`,
    e.cost_per_client.toFixed(2),
    e.revenue_per_client.toFixed(2),
    e.profit.toFixed(2),
    `${e.roi.toFixed(1)}%`,
  ]);

  rows.push([
    'TOTALS',
    totals.investment.toFixed(2),
    totals.leads.toString(),
    totals.clients.toString(),
    totals.revenue.toFixed(2),
    totals.lead_cost.toFixed(2),
    `${totals.conversion_rate.toFixed(1)}%`,
    totals.cost_per_client.toFixed(2),
    totals.revenue_per_client.toFixed(2),
    totals.profit.toFixed(2),
    `${totals.roi.toFixed(1)}%`,
  ]);

  return [
    `Marketing Report - ${getMonthLabel(month)}`,
    '',
    headers.join(','),
    ...rows.map(r => r.join(',')),
  ].join('\n');
}

export function generateAttributionCSV(channels: ChannelAttribution[], totals: AttributionTotals): string {
  const headers = [
    'Channel', 'Total Spend', 'Reported Leads', 'Reported Clients', 'Attributed Clients',
    'Total LTV', 'Avg LTV', 'Cost/Client', 'Attribution ROI'
  ];
  
  const rows = channels.map(ch => [
    ch.channel_name,
    ch.total_spend.toFixed(2),
    ch.reported_leads,
    ch.reported_clients,
    ch.attributed_clients,
    ch.attributed_ltv.toFixed(2),
    ch.attributed_avg_ltv.toFixed(2),
    ch.cost_per_attributed_client.toFixed(2),
    `${ch.attribution_roi.toFixed(1)}%`,
  ]);

  rows.push([
    'TOTALS',
    totals.total_spend.toFixed(2),
    totals.reported_leads.toString(),
    '-',
    totals.attributed_clients.toString(),
    totals.attributed_ltv.toFixed(2),
    totals.avg_ltv.toFixed(2),
    totals.cost_per_client.toFixed(2),
    `${totals.overall_roi.toFixed(1)}%`,
  ]);

  return [
    'Lead Source Attribution Report',
    `Generated: ${new Date().toLocaleDateString()}`,
    '',
    headers.join(','),
    ...rows.map(r => r.join(',')),
  ].join('\n');
}
