import { supabase } from '@/app/lib/supabase';

// ── Types ──

export interface SEOKeywordEntry {
  id: string;
  keyword: string;
  month: string; // YYYY-MM
  queries: number;
  impressions: number;
  position: number;
  clicks: number;
  ctr: number;
  created_at?: string;
  updated_at?: string;
}

export interface SEOTrendPoint {
  month: string;
  keyword: string;
  position: number;
  queries: number;
  impressions: number;
  clicks: number;
  ctr: number;
}

// ── Default Keywords ──
export const DEFAULT_KEYWORDS = [
  'Trainer',
  'Trainers',
  'Training',
  'Nutrition Coach',
  'Dietitian',
  'Nutritionist',
];

// ── Helpers ──

export function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function getMonthLabel(month: string): string {
  const [y, m] = month.split('-');
  const names = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return `${names[parseInt(m) - 1]} ${y}`;
}

export function getMonthsForYear(year: number): string[] {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const maxMonth = year === currentYear ? currentMonth : 12;
  const months: string[] = [];
  for (let m = maxMonth; m >= 1; m--) {
    months.push(`${year}-${String(m).padStart(2, '0')}`);
  }
  return months;
}

export function getAvailableYears(): number[] {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = currentYear; y >= currentYear - 10; y--) {
    years.push(y);
  }
  return years;
}

// ── Normalizers ──
// Ensure numeric fields are always numbers (DB/JSON may return strings)

function normalizeEntry(raw: any): SEOKeywordEntry {
  return {
    ...raw,
    queries: Number(raw.queries) || 0,
    impressions: Number(raw.impressions) || 0,
    position: Number(raw.position) || 0,
    clicks: Number(raw.clicks) || 0,
    ctr: Number(raw.ctr) || 0,
  };
}

function normalizeTrendPoint(raw: any): SEOTrendPoint {
  return {
    ...raw,
    position: Number(raw.position) || 0,
    queries: Number(raw.queries) || 0,
    impressions: Number(raw.impressions) || 0,
    clicks: Number(raw.clicks) || 0,
    ctr: Number(raw.ctr) || 0,
  };
}

// ── API Functions ──

export async function getMonthlyData(month: string): Promise<SEOKeywordEntry[]> {
  const { data, error } = await supabase.functions.invoke('manage-seo-data', {
    body: { action: 'get_monthly', month },
  });
  if (error) {
    const msg = typeof error === 'object' && error.message ? error.message : String(error);
    throw new Error(msg);
  }
  if (data && data.success === false) throw new Error(data.error || 'Failed to fetch SEO data');
  const raw = data?.data || [];
  return raw.map(normalizeEntry);
}


export async function upsertEntry(entry: {
  keyword: string;
  month: string;
  queries?: number;
  impressions?: number;
  position?: number;
  clicks?: number;
  ctr?: number;
}): Promise<SEOKeywordEntry> {
  const { data, error } = await supabase.functions.invoke('manage-seo-data', {
    body: { action: 'upsert_entry', ...entry },
  });
  if (error) {
    const msg = typeof error === 'object' && error.message ? error.message : String(error);
    throw new Error(msg);
  }
  if (data && data.success === false) throw new Error(data.error || 'Failed to save SEO entry');
  return data?.data;
}

export interface BulkUpsertResult {
  results: Array<{
    index: number;
    success: boolean;
    action?: string;
    error?: string;
  }>;
  summary: {
    total: number;
    success: number;
    failed: number;
    created: number;
    updated: number;
  };
}

export async function bulkUpsert(entries: Array<{
  keyword: string;
  month: string;
  queries?: number;
  impressions?: number;
  position?: number;
  clicks?: number;
  ctr?: number;
}>): Promise<BulkUpsertResult> {
  const { data, error } = await supabase.functions.invoke('manage-seo-data', {
    body: { action: 'bulk_upsert', entries },
  });
  if (error) {
    const msg = typeof error === 'object' && error.message ? error.message : String(error);
    throw new Error(msg);
  }
  if (data && data.success === false) throw new Error(data.error || 'Failed to bulk save SEO entries');
  const result = data?.data || {};
  return {
    results: result.results || [],
    summary: {
      total: result.summary?.total || entries.length,
      success: result.summary?.success || 0,
      failed: result.summary?.failed || 0,
      created: result.summary?.created || 0,
      updated: result.summary?.updated || 0,
    },
  };
}


export async function deleteEntry(id: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('manage-seo-data', {
    body: { action: 'delete_entry', id },
  });
  if (error) {
    const msg = typeof error === 'object' && error.message ? error.message : String(error);
    throw new Error(msg);
  }
  if (data && data.success === false) throw new Error(data.error || 'Failed to delete SEO entry');
}

export async function getTrendData(
  startMonth: string,
  endMonth: string,
  keywords?: string[]
): Promise<SEOTrendPoint[]> {
  const { data, error } = await supabase.functions.invoke('manage-seo-data', {
    body: {
      action: 'get_trend_data',
      start_month: startMonth,
      end_month: endMonth,
      keywords,
    },
  });
  if (error) {
    const msg = typeof error === 'object' && error.message ? error.message : String(error);
    throw new Error(msg);
  }
  if (data && data.success === false) throw new Error(data.error || 'Failed to fetch SEO trend data');
  const raw = data?.data || [];
  return raw.map(normalizeTrendPoint);
}


export async function getAllKeywords(): Promise<string[]> {
  const { data, error } = await supabase.functions.invoke('manage-seo-data', {
    body: { action: 'get_keywords' },
  });
  if (error) {
    const msg = typeof error === 'object' && error.message ? error.message : String(error);
    throw new Error(msg);
  }
  if (data && data.success === false) throw new Error(data.error || 'Failed to fetch keywords');
  return data?.data || [];
}

/**
 * Fetch monthly data for every month in a range and build trend points locally.
 * This is a fallback when the get_trend_data edge function action returns empty.
 */
export async function buildTrendDataFromMonthly(
  startMonth: string,
  endMonth: string,
): Promise<SEOTrendPoint[]> {
  // Generate all months in the range
  const months: string[] = [];
  const [startY, startM] = startMonth.split('-').map(Number);
  const [endY, endM] = endMonth.split('-').map(Number);

  let y = startY;
  let m = startM;
  while (y < endY || (y === endY && m <= endM)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }

  // Fetch all months in parallel
  const results = await Promise.allSettled(
    months.map(month => getMonthlyData(month))
  );

  const trendPoints: SEOTrendPoint[] = [];
  results.forEach((result, i) => {
    if (result.status === 'fulfilled' && result.value.length > 0) {
      for (const entry of result.value) {
        trendPoints.push({
          month: months[i],
          keyword: entry.keyword,
          position: Number(entry.position) || 0,
          queries: Number(entry.queries) || 0,
          impressions: Number(entry.impressions) || 0,
          clicks: Number(entry.clicks) || 0,
          ctr: Number(entry.ctr) || 0,
        });
      }
    }
  });

  return trendPoints;
}
