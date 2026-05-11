import { supabase } from './supabase';

export interface ZipKeywordConfigRow {
  id: string;
  franchise_id: string;
  franchise_name: string;
  zipcode: string;
  keyword: string;
  is_active: boolean;
}

export interface ZipKeywordRankingRow {
  id: string;
  franchise_id: string;
  franchise_name: string;
  zipcode: string;
  keyword: string;
  month: string; // YYYY-MM
  position: number | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface FranchiseWithConfig {
  franchise_id: string;
  franchise_name: string;
  count: number;
}

export const DEFAULT_ZIP_KEYWORDS = ['Personal Trainer', 'In Home Personal Trainer'];

export function getCurrentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function getMonthLabel(month: string): string {
  const [y, m] = month.split('-');
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${names[parseInt(m, 10) - 1]} ${y}`;
}

export function getLast12Months(): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 11; i >= 0; i--) {
    const dt = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

async function invoke(body: Record<string, any>) {
  const { data, error } = await supabase.functions.invoke('manage-zip-keyword-rankings', { body });
  if (error) {
    // Try to surface the edge function's JSON error body when possible.
    // FunctionsHttpError stores the Response on error.context; attempt to read it.
    let serverMsg = '';
    try {
      const ctx: any = (error as any).context;
      if (ctx && typeof ctx.json === 'function') {
        const parsed = await ctx.json().catch(() => null);
        if (parsed?.error) serverMsg = String(parsed.error);
      } else if (ctx && typeof ctx.text === 'function') {
        const t = await ctx.text().catch(() => '');
        if (t) serverMsg = t.slice(0, 300);
      }
    } catch { /* ignore */ }
    // Also check parsed data payload (some supabase-js versions return parsed body there)
    if (!serverMsg && (data as any)?.error) serverMsg = String((data as any).error);
    const base = error.message || 'Edge function error';
    throw new Error(serverMsg ? `${base}: ${serverMsg}` : base);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}


export async function listFranchisesWithConfig(): Promise<FranchiseWithConfig[]> {
  const data = await invoke({ action: 'list_franchises_with_config' });
  return (data?.data || []) as FranchiseWithConfig[];
}

export async function listConfig(franchise_id?: string, franchise_name?: string): Promise<ZipKeywordConfigRow[]> {
  const data = await invoke({ action: 'list_config', franchise_id, franchise_name });
  return (data?.data || []) as ZipKeywordConfigRow[];
}

export async function listRankings(month: string, franchise_id?: string, franchise_name?: string): Promise<ZipKeywordRankingRow[]> {
  const data = await invoke({ action: 'list_rankings', month, franchise_id, franchise_name });
  return (data?.data || []) as ZipKeywordRankingRow[];
}

export async function upsertRanking(entry: {
  franchise_id: string;
  franchise_name: string;
  zipcode: string;
  keyword: string;
  month: string;
  position: number | null;
  notes?: string | null;
  user_id?: string;
}): Promise<ZipKeywordRankingRow> {
  const data = await invoke({ action: 'upsert_ranking', ...entry });
  return data?.data as ZipKeywordRankingRow;
}

export async function bulkUpsertRankings(entries: {
  franchise_id: string;
  franchise_name: string;
  zipcode: string;
  keyword: string;
  month: string;
  position: number | null;
}[]): Promise<{ count: number }> {
  const data = await invoke({ action: 'bulk_upsert', entries });
  return { count: data?.count || 0 };
}

export async function deleteRanking(id: string): Promise<void> {
  await invoke({ action: 'delete_ranking', id });
}

export async function getTrend(params: {
  franchise_id?: string;
  franchise_name?: string;
  start_month: string;
  end_month: string;
  zipcode?: string;
  keyword?: string;
}): Promise<ZipKeywordRankingRow[]> {
  const data = await invoke({ action: 'get_trend', ...params });
  return (data?.data || []) as ZipKeywordRankingRow[];
}

export async function addConfig(params: {
  franchise_id: string;
  franchise_name: string;
  zipcodes: string[];
  keywords: string[];
}): Promise<{ inserted: number }> {
  const data = await invoke({ action: 'add_config', ...params });
  return { inserted: data?.inserted || 0 };
}

export async function removeConfig(id: string): Promise<void> {
  await invoke({ action: 'remove_config', id });
}

// Helper: given config + rankings, build a grid: one row per (zip, keyword) with position
export interface RankingGridRow {
  zipcode: string;
  keyword: string;
  position: number | null;
  rankingId?: string;
  /**
   * True if a ranking row was actually submitted for this (zip, keyword),
   * regardless of whether position is a number or null ("Not Ranked").
   * Use this to distinguish "user recorded a result" from "never touched".
   */
  submitted: boolean;
}

export function buildGrid(config: ZipKeywordConfigRow[], rankings: ZipKeywordRankingRow[]): RankingGridRow[] {
  const map = new Map<string, ZipKeywordRankingRow>();
  for (const r of rankings) {
    map.set(`${r.zipcode}__${r.keyword}`, r);
  }
  return config.map(c => {
    const r = map.get(`${c.zipcode}__${c.keyword}`);
    return {
      zipcode: c.zipcode,
      keyword: c.keyword,
      position: r ? r.position : null,
      rankingId: r?.id,
      submitted: !!r,
    };
  });
}


// Position → color (lower = better)
export function positionColor(pos: number | null | undefined): string {
  if (pos === null || pos === undefined) return '#95a5a6';
  if (pos <= 3) return '#2ecc71';
  if (pos <= 10) return '#27ae60';
  if (pos <= 20) return '#f39c12';
  if (pos <= 50) return '#e67e22';
  return '#e74c3c';
}

export function positionLabel(pos: number | null | undefined): string {
  if (pos === null || pos === undefined) return 'Not Ranked';
  if (pos <= 3) return 'Top 3';
  if (pos <= 10) return 'Page 1';
  if (pos <= 20) return 'Page 2';
  if (pos <= 50) return 'Top 50';
  return 'Below 50';
}
