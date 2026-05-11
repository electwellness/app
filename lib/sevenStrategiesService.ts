import { supabase } from '@/app/lib/supabase';

// ============ TYPES ============

export interface SevenStrategiesEntry {
  id: string;
  franchise_id: string;
  franchise_name: string;
  month: string; // YYYY-MM
  lead_count: number;
  call_count: number;
  jumpstart_count: number;
  new_client_count: number;
  total_client_count: number;
  clients_lost: number;
  total_revenue: number;
  total_expenses: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface SevenStrategiesInput {
  franchise_id: string;
  franchise_name: string;
  month: string;
  lead_count: number;
  call_count: number;
  jumpstart_count: number;
  new_client_count: number;
  total_client_count: number;
  clients_lost: number;
  total_revenue: number;
  total_expenses: number;
}

export interface ComputedStrategies {
  leadsGenerated: number;
  leadsToConversations: number; // call_count / lead_count
  conversationsToJumpstarts: number; // jumpstart_count / call_count
  jumpstartsToNewClients: number; // new_client_count / jumpstart_count
  retention: number; // (prev_total_clients - clients_lost) / prev_total_clients
  avgMonthlyInvestment: number; // revenue / total_client_count
  expenseRatio: number; // expenses / revenue
  // Whether we have prev month data for retention calc
  hasPrevMonthData: boolean;
  prevMonthTotalClients: number;
}

export interface SevenStrategiesServiceError {
  message: string;
  status: number;
}

// ============ HELPERS ============

/** Safely coerce any value to a finite number (handles strings from Postgres numeric columns) */
function toNum(v: any): number {
  if (typeof v === 'number' && isFinite(v)) return v;
  const n = Number(v);
  return isFinite(n) ? n : 0;
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

/** Generate an array of month strings from earliestMonth (YYYY-MM) to the current month, ordered newest first */
export function getMonthsFromEarliest(earliestMonth: string): string[] {
  const [earlyYear, earlyMon] = earliestMonth.split('-').map(Number);
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMon = now.getMonth() + 1; // 1-based

  const months: string[] = [];
  let y = currentYear;
  let m = currentMon;

  while (y > earlyYear || (y === earlyYear && m >= earlyMon)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m--;
    if (m < 1) {
      m = 12;
      y--;
    }
  }

  return months;
}


export function getPreviousMonth(monthStr: string): string {
  const [year, month] = monthStr.split('-').map(Number);
  const d = new Date(year, month - 2, 1); // month-1 for 0-based, -1 more for previous
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function formatCurrency(value: any): string {
  const v = toNum(value);
  if (Math.abs(v) >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

export function formatCurrencyFull(value: any): string {
  const v = toNum(value);
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPercent(value: any): string {
  const v = toNum(value);
  if (!isFinite(v) || isNaN(v)) return '0.0%';
  return `${(v * 100).toFixed(1)}%`;
}

/** Safely convert all numeric fields on an entry to actual numbers */
export function sanitizeEntry<T extends Record<string, any>>(entry: T): T {
  const numericFields = [
    'lead_count', 'call_count', 'jumpstart_count', 'new_client_count',
    'total_client_count', 'clients_lost', 'total_revenue', 'total_expenses',
  ];
  const result = { ...entry };
  for (const field of numericFields) {
    if (field in result) {
      (result as any)[field] = toNum(result[field]);
    }
  }
  return result;
}


// ============ COMPUTATIONS ============

export function computeStrategies(
  entry: SevenStrategiesEntry | SevenStrategiesInput,
  prevMonthEntry?: SevenStrategiesEntry | SevenStrategiesInput | null
): ComputedStrategies {
  // Sanitize all numeric fields to handle strings from Postgres
  const lead_count = toNum(entry.lead_count);
  const call_count = toNum(entry.call_count);
  const jumpstart_count = toNum(entry.jumpstart_count);
  const new_client_count = toNum(entry.new_client_count);
  const total_client_count = toNum(entry.total_client_count);
  const clients_lost = toNum(entry.clients_lost);
  const total_revenue = toNum(entry.total_revenue);
  const total_expenses = toNum(entry.total_expenses);

  // 1. Leads Generated
  const leadsGenerated = lead_count;

  // 2. Leads > Conversations = call_count / lead_count
  const leadsToConversations = lead_count > 0 ? call_count / lead_count : 0;

  // 3. Conversations > Jumpstarts = jumpstart_count / call_count
  const conversationsToJumpstarts = call_count > 0 ? jumpstart_count / call_count : 0;

  // 4. Jumpstarts > New Clients = new_client_count / jumpstart_count
  const jumpstartsToNewClients = jumpstart_count > 0 ? new_client_count / jumpstart_count : 0;

  // 5. Retention = (prev_total_clients - clients_lost) / prev_total_clients
  const hasPrevMonthData = !!prevMonthEntry;
  const prevMonthTotalClients = toNum(prevMonthEntry?.total_client_count);
  const retention = prevMonthTotalClients > 0
    ? (prevMonthTotalClients - clients_lost) / prevMonthTotalClients
    : 0;

  // 6. Average Monthly Investment = revenue / total_client_count
  const avgMonthlyInvestment = total_client_count > 0 ? total_revenue / total_client_count : 0;

  // 7. Expense Ratio = expenses / revenue
  const expenseRatio = total_revenue > 0 ? total_expenses / total_revenue : 0;

  return {
    leadsGenerated,
    leadsToConversations,
    conversationsToJumpstarts,
    jumpstartsToNewClients,
    retention,
    avgMonthlyInvestment,
    expenseRatio,
    hasPrevMonthData,
    prevMonthTotalClients,
  };
}


// ============ API CALLS ============

async function invokeSevenStrategies(body: any): Promise<any> {
  try {
    const { data, error } = await supabase.functions.invoke('manage-seven-strategies', { body });

    if (error) {
      let status = 0;
      let serverMessage = '';

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
        // Fall through
      }

      if (!status) {
        const msg = error.message || '';
        if (msg.includes('401') || msg.toLowerCase().includes('unauthorized')) status = 401;
        else if (msg.includes('403') || msg.toLowerCase().includes('forbidden')) status = 403;
        else if (msg.includes('non-2xx')) status = 500;
      }

      throw { message: serverMessage || error.message || 'Network error', status } as SevenStrategiesServiceError;
    }

    if (!data?.success) {
      throw { message: data?.error || 'Unknown error', status: 400 } as SevenStrategiesServiceError;
    }

    return data;
  } catch (err: any) {
    if (err.status) throw err;
    throw { message: err?.message || 'Unexpected error', status: 0 } as SevenStrategiesServiceError;
  }
}

export async function getEntries(month: string, franchise_id?: string): Promise<SevenStrategiesEntry[]> {
  try {
    const result = await invokeSevenStrategies({
      action: 'list',
      month,
      franchise_id,
    });
    return result.data || [];
  } catch (err: any) {
    console.log('[sevenStrategies] getEntries error:', err.message);
    return [];
  }
}

export async function getEntry(month: string, franchise_id: string): Promise<SevenStrategiesEntry | null> {
  try {
    const result = await invokeSevenStrategies({
      action: 'get',
      month,
      franchise_id,
    });
    return result.data || null;
  } catch (err: any) {
    console.log('[sevenStrategies] getEntry error:', err.message);
    return null;
  }
}

export async function upsertEntry(entry: SevenStrategiesInput): Promise<SevenStrategiesEntry | null> {
  try {
    const result = await invokeSevenStrategies({
      action: 'upsert',
      ...entry,
    });
    return result.data || null;
  } catch (err: any) {
    console.log('[sevenStrategies] upsertEntry error:', err.message);
    throw err;
  }
}

export async function deleteEntry(id: string): Promise<void> {
  try {
    await invokeSevenStrategies({ action: 'delete', id });
  } catch (err: any) {
    console.log('[sevenStrategies] deleteEntry error:', err.message);
    throw err;
  }
}
export async function getEntriesForMonths(months: string[], franchise_id?: string): Promise<SevenStrategiesEntry[]> {
  try {
    const result = await invokeSevenStrategies({
      action: 'list_range',
      months,
      franchise_id,
    });
    return result.data || [];
  } catch (err: any) {
    console.log('[sevenStrategies] getEntriesForMonths error:', err.message);
    return [];
  }
}

/** Fetch the earliest month that has any seven_strategies data (respects franchise scoping on the server) */
export async function getEarliestMonth(): Promise<string | null> {
  try {
    const result = await invokeSevenStrategies({
      action: 'get_earliest_month',
    });
    return result.data || null;
  } catch (err: any) {
    console.log('[sevenStrategies] getEarliestMonth error:', err.message);
    return null;
  }
}


// ============ CSV EXPORT ============

export function generateCSV(
  entries: SevenStrategiesEntry[],
  prevMonthEntries: Map<string, SevenStrategiesEntry>
): string {
  const headers = [
    'Franchise', 'Month',
    'Leads', 'Conversations', 'Jumpstarts', 'New Clients',

    'Total Clients', 'Clients Lost', 'Total Revenue', 'Total Expenses',
    '1. Leads Generated', '2. Leads>Conversations', '3. Conversations>Jumpstarts',
    '4. Jumpstarts>New Clients', '5. Retention', '6. Avg Monthly Investment',
    '7. Expense Ratio',
  ];


  const rows = entries.map(entry => {
    const safe = sanitizeEntry(entry);
    const prevEntry = prevMonthEntries.get(entry.franchise_id);
    const computed = computeStrategies(safe, prevEntry ? sanitizeEntry(prevEntry) : null);
    return [
      entry.franchise_name,
      getMonthLabel(entry.month),
      safe.lead_count,
      safe.call_count,
      safe.jumpstart_count,
      safe.new_client_count,
      safe.total_client_count,
      safe.clients_lost,
      safe.total_revenue.toFixed(2),
      safe.total_expenses.toFixed(2),
      computed.leadsGenerated,
      formatPercent(computed.leadsToConversations),
      formatPercent(computed.conversationsToJumpstarts),
      formatPercent(computed.jumpstartsToNewClients),
      formatPercent(computed.retention),
      formatCurrencyFull(computed.avgMonthlyInvestment),
      formatPercent(computed.expenseRatio),
    ].join(',');
  });


  return [
    '7 Strategies Report',
    `Generated: ${new Date().toLocaleDateString()}`,
    '',
    headers.join(','),
    ...rows,
  ].join('\n');
}

// ============ ENTRIES-ONLY CSV EXPORT ============

export function generateEntriesOnlyCSV(entries: SevenStrategiesEntry[]): string {
  const headers = [
    'Franchise', 'Month',
    'Leads', 'Conversations', 'Jumpstarts', 'New Clients',
    'Total Clients', 'Clients Lost', 'Total Revenue', 'Total Expenses',
  ];

  const rows = entries.map(entry => {
    const safe = sanitizeEntry(entry);
    return [
      `"${safe.franchise_name}"`,
      safe.month,
      safe.lead_count,
      safe.call_count,
      safe.jumpstart_count,
      safe.new_client_count,
      safe.total_client_count,
      safe.clients_lost,
      safe.total_revenue.toFixed(2),
      safe.total_expenses.toFixed(2),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

// ============ ENTRIES-ONLY CSV TEMPLATE ============

export function generateEntriesCSVTemplate(): string {
  return `Franchise,Month,Leads,Conversations,Jumpstarts,New Clients,Total Clients,Clients Lost,Total Revenue,Total Expenses
Collin County,2026-03,120,80,40,25,200,5,50000.00,20000.00
Park Cities,2026-03,95,60,30,18,150,3,38000.00,15000.00`;
}

// ============ CSV IMPORT PARSER ============

export interface ParsedStrategyRow {
  franchise_name: string;
  month: string;
  lead_count: number;
  call_count: number;
  jumpstart_count: number;
  new_client_count: number;
  total_client_count: number;
  clients_lost: number;
  total_revenue: number;
  total_expenses: number;
  isValid: boolean;
  errors: string[];
  rowIndex: number;
}

export interface StrategyCSVParseResult {
  rows: ParsedStrategyRow[];
  totalParsed: number;
  validCount: number;
  errorCount: number;
}

function cleanCSVValue(val: string): string {
  return val.replace(/^["']+|["']+$/g, '').trim();
}

function detectCSVDelimiter(text: string): string {
  const firstLine = text.split('\n')[0] || '';
  const delimiters = ['\t', ',', ';', '|'];
  let bestDelimiter = ',';
  let maxCount = 0;
  for (const d of delimiters) {
    const count = (firstLine.match(new RegExp(d === '|' ? '\\|' : d, 'g')) || []).length;
    if (count > maxCount) {
      maxCount = count;
      bestDelimiter = d;
    }
  }
  return bestDelimiter;
}

function isStrategyHeaderRow(row: string[]): boolean {
  const headerKeywords = ['franchise', 'month', 'leads', 'conversations', 'jumpstarts', 'new clients', 'total clients', 'clients lost', 'revenue', 'expenses'];
  const lowerRow = row.map(v => v.toLowerCase().trim());
  return lowerRow.some(v => headerKeywords.some(kw => v.includes(kw)));
}

/** Validate a YYYY-MM month string */
function isValidMonth(val: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(val.trim());
}

export function parseStrategiesCSV(
  text: string,
  franchiseLookup: Map<string, string>, // name (lowercase) -> franchise_id
  defaultFranchiseId?: string,
  defaultFranchiseName?: string,
  defaultMonth?: string,
): StrategyCSVParseResult {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);

  if (lines.length === 0) {
    return { rows: [], totalParsed: 0, validCount: 0, errorCount: 0 };
  }

  const delimiter = detectCSVDelimiter(text);
  const allRows = lines.map(line => line.split(delimiter).map(cleanCSVValue));

  let hasHeader = false;
  if (allRows.length > 0 && isStrategyHeaderRow(allRows[0])) {
    hasHeader = true;
  }

  const dataRows = hasHeader ? allRows.slice(1) : allRows;
  const parsedRows: ParsedStrategyRow[] = [];

  // Detect column mapping from header
  let colMap = {
    franchise: 0, month: 1, leads: 2, conversations: 3,
    jumpstarts: 4, newClients: 5, totalClients: 6,
    clientsLost: 7, revenue: 8, expenses: 9,
  };

  if (hasHeader) {
    const header = allRows[0].map(h => h.toLowerCase().trim());
    for (let i = 0; i < header.length; i++) {
      const h = header[i];
      if (h.includes('franchise') || h.includes('location')) colMap.franchise = i;
      else if (h.includes('month') || h.includes('date') || h.includes('period')) colMap.month = i;
      else if (h.includes('lead')) colMap.leads = i;
      else if (h.includes('conversation') || h.includes('conv') || h.includes('call')) colMap.conversations = i;
      else if (h.includes('jumpstart') || h.includes('js')) colMap.jumpstarts = i;
      else if (h.includes('new client') || h.includes('new_client')) colMap.newClients = i;
      else if (h.includes('total client') || h.includes('total_client')) colMap.totalClients = i;
      else if (h.includes('lost') || h.includes('clients_lost')) colMap.clientsLost = i;
      else if (h.includes('revenue') || h.includes('rev')) colMap.revenue = i;
      else if (h.includes('expense') || h.includes('exp')) colMap.expenses = i;
    }
  }

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const errors: string[] = [];

    const getVal = (idx: number) => (idx >= 0 && idx < row.length) ? row[idx].trim() : '';

    const franchiseName = getVal(colMap.franchise) || defaultFranchiseName || '';
    const month = getVal(colMap.month) || defaultMonth || '';
    const leadsStr = getVal(colMap.leads);
    const conversationsStr = getVal(colMap.conversations);
    const jumpstartsStr = getVal(colMap.jumpstarts);
    const newClientsStr = getVal(colMap.newClients);
    const totalClientsStr = getVal(colMap.totalClients);
    const clientsLostStr = getVal(colMap.clientsLost);
    const revenueStr = getVal(colMap.revenue);
    const expensesStr = getVal(colMap.expenses);

    // Validate
    if (!franchiseName) errors.push('Franchise name is missing');
    if (!month) {
      errors.push('Month is missing');
    } else if (!isValidMonth(month)) {
      errors.push(`Invalid month format "${month}" (expected YYYY-MM)`);
    }

    // Parse numbers
    const lead_count = parseInt(leadsStr) || 0;
    const call_count = parseInt(conversationsStr) || 0;
    const jumpstart_count = parseInt(jumpstartsStr) || 0;
    const new_client_count = parseInt(newClientsStr) || 0;
    const total_client_count = parseInt(totalClientsStr) || 0;
    const clients_lost = parseInt(clientsLostStr) || 0;
    const total_revenue = parseFloat(revenueStr.replace(/[$,]/g, '')) || 0;
    const total_expenses = parseFloat(expensesStr.replace(/[$,]/g, '')) || 0;

    // Check franchise exists in lookup
    if (franchiseName && !franchiseLookup.has(franchiseName.toLowerCase()) && !defaultFranchiseId) {
      errors.push(`Unknown franchise "${franchiseName}"`);
    }

    parsedRows.push({
      franchise_name: franchiseName,
      month,
      lead_count,
      call_count,
      jumpstart_count,
      new_client_count,
      total_client_count,
      clients_lost,
      total_revenue,
      total_expenses,
      isValid: errors.length === 0,
      errors,
      rowIndex: i + 1,
    });
  }

  const validCount = parsedRows.filter(r => r.isValid).length;
  const errorCount = parsedRows.filter(r => !r.isValid).length;

  return { rows: parsedRows, totalParsed: parsedRows.length, validCount, errorCount };
}
