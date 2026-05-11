import { supabase } from '@/app/lib/supabase';

// ── Types ──

export interface WebPerformanceEntry {
  id: string;
  month: string; // YYYY-MM
  page_url: string;

  // Core Web Vitals
  page_load_time: number;   // seconds
  ttfb: number;             // milliseconds
  fcp: number;              // seconds
  lcp: number;              // seconds
  cls: number;              // decimal score
  fid: number;              // milliseconds
  inp: number;              // milliseconds

  // Traffic & Engagement
  total_page_views: number;
  unique_visitors: number;
  new_users: number;
  all_users: number;
  bounce_rate: number;          // percentage
  pages_per_session: number;
  avg_session_duration: number; // seconds

  // Device Split
  mobile_traffic_pct: number;
  desktop_traffic_pct: number;
  tablet_traffic_pct: number;

  // Availability
  uptime_pct: number;

  // Notes
  notes: string;

  created_at?: string;
  updated_at?: string;
}


// ── Core Web Vitals Thresholds ──

export const CWV_THRESHOLDS = {
  lcp: { good: 2.5, needsImprovement: 4.0 },
  fid: { good: 100, needsImprovement: 300 },
  cls: { good: 0.1, needsImprovement: 0.25 },
  fcp: { good: 1.8, needsImprovement: 3.0 },
  ttfb: { good: 800, needsImprovement: 1800 },
  inp: { good: 200, needsImprovement: 500 },
};

export type CWVRating = 'good' | 'needs-improvement' | 'poor';

export function getCWVRating(metric: keyof typeof CWV_THRESHOLDS, value: number): CWVRating {
  const t = CWV_THRESHOLDS[metric];
  if (value <= t.good) return 'good';
  if (value <= t.needsImprovement) return 'needs-improvement';
  return 'poor';
}

export function getCWVColor(rating: CWVRating): string {
  switch (rating) {
    case 'good': return '#2ecc71';
    case 'needs-improvement': return '#f39c12';
    case 'poor': return '#e74c3c';
  }
}

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

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

export function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

// ── Default Page URLs ──
export const DEFAULT_PAGES = [
  'Site-Wide',
  'Homepage',
  'About',
  'Services',
  'Contact',
  'Blog',
];

// ── Normalizer ──
// Ensure numeric fields are always numbers (DB/JSON may return strings)

function normalizeEntry(raw: any): WebPerformanceEntry {
  return {
    ...raw,
    page_load_time: Number(raw.page_load_time) || 0,
    ttfb: Number(raw.ttfb) || 0,
    fcp: Number(raw.fcp) || 0,
    lcp: Number(raw.lcp) || 0,
    cls: Number(raw.cls) || 0,
    fid: Number(raw.fid) || 0,
    inp: Number(raw.inp) || 0,
    total_page_views: Number(raw.total_page_views) || 0,
    unique_visitors: Number(raw.unique_visitors) || 0,
    new_users: Number(raw.new_users) || 0,
    all_users: Number(raw.all_users) || 0,
    bounce_rate: Number(raw.bounce_rate) || 0,
    pages_per_session: Number(raw.pages_per_session) || 0,
    avg_session_duration: Number(raw.avg_session_duration) || 0,
    mobile_traffic_pct: Number(raw.mobile_traffic_pct) || 0,
    desktop_traffic_pct: Number(raw.desktop_traffic_pct) || 0,
    tablet_traffic_pct: Number(raw.tablet_traffic_pct) || 0,
    uptime_pct: Number(raw.uptime_pct) || 0,
    notes: raw.notes || '',
  };
}


// ── API Functions ──

export async function getMonthlyData(month: string): Promise<WebPerformanceEntry[]> {
  const { data, error } = await supabase.functions.invoke('manage-web-performance', {
    body: { action: 'get_monthly', month },
  });
  if (error) {
    const msg = typeof error === 'object' && error.message ? error.message : String(error);
    throw new Error(msg);
  }
  if (data && data.success === false) throw new Error(data.error || 'Failed to fetch performance data');
  const raw = data?.data || [];
  return raw.map(normalizeEntry);
}

export async function getTrendData(
  startMonth: string,
  endMonth: string,
  pageUrl?: string,
): Promise<WebPerformanceEntry[]> {
  const { data, error } = await supabase.functions.invoke('manage-web-performance', {
    body: { action: 'get_trend', start_month: startMonth, end_month: endMonth, page_url: pageUrl },
  });
  if (error) {
    const msg = typeof error === 'object' && error.message ? error.message : String(error);
    throw new Error(msg);
  }
  if (data && data.success === false) throw new Error(data.error || 'Failed to fetch trend data');
  const raw = data?.data || [];
  return raw.map(normalizeEntry);
}


export async function upsertEntry(entry: Partial<WebPerformanceEntry> & { month: string }): Promise<WebPerformanceEntry> {
  const { data, error } = await supabase.functions.invoke('manage-web-performance', {
    body: { action: 'upsert', ...entry },
  });
  if (error) {
    const msg = typeof error === 'object' && error.message ? error.message : String(error);
    throw new Error(msg);
  }
  if (data && data.success === false) throw new Error(data.error || 'Failed to save entry');
  return data?.data;
}

export async function deleteEntry(id: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('manage-web-performance', {
    body: { action: 'delete', id },
  });
  if (error) {
    const msg = typeof error === 'object' && error.message ? error.message : String(error);
    throw new Error(msg);
  }
  if (data && data.success === false) throw new Error(data.error || 'Failed to delete entry');
}

export async function getPages(): Promise<string[]> {
  const { data, error } = await supabase.functions.invoke('manage-web-performance', {
    body: { action: 'get_pages' },
  });
  if (error) {
    const msg = typeof error === 'object' && error.message ? error.message : String(error);
    throw new Error(msg);
  }
  if (data && data.success === false) throw new Error(data.error || 'Failed to fetch pages');
  return data?.data || [];
}
