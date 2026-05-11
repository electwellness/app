// CSV Parser utility for mass client/alumni import

export interface ParsedRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  type: 'client' | 'alumni';
  franchise: string;
  isValid: boolean;
  errors: string[];
}

export interface ParseResult {
  rows: ParsedRow[];
  totalParsed: number;
  validCount: number;
  errorCount: number;
  duplicateEmails: string[];
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanValue(val: string): string {
  return val.replace(/^["']+|["']+$/g, '').trim();
}

function normalizeType(val: string): 'client' | 'alumni' {
  const lower = val.toLowerCase().trim();
  if (lower === 'alumni' || lower === 'alum' || lower === 'former' || lower === 'inactive') {
    return 'alumni';
  }
  return 'client';
}

function normalizePhone(val: string): string {
  // Remove all non-digit characters
  const digits = val.replace(/\D/g, '');
  if (digits.length === 0) return '';
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return val.trim();
}

/**
 * Detect delimiter: comma, tab, semicolon, or pipe
 */
function detectDelimiter(text: string): string {
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

/**
 * Detect if the first row is a header row
 */
function isHeaderRow(row: string[]): boolean {
  const headerKeywords = ['name', 'email', 'phone', 'type', 'status', 'first', 'last', 'full', 'contact', 'franchise', 'location'];
  const lowerRow = row.map(v => v.toLowerCase().trim());
  return lowerRow.some(v => headerKeywords.includes(v));
}

/**
 * Detect column mapping from header or data patterns
 */
function detectColumns(row: string[]): { nameIdx: number; emailIdx: number; phoneIdx: number; typeIdx: number; franchiseIdx: number } {
  let nameIdx = -1;
  let emailIdx = -1;
  let phoneIdx = -1;
  let typeIdx = -1;
  let franchiseIdx = -1;

  // Try to match by header names
  for (let i = 0; i < row.length; i++) {
    const lower = row[i].toLowerCase().trim();
    if (lower.includes('email') || lower.includes('e-mail')) {
      emailIdx = i;
    } else if (lower.includes('name') || lower.includes('full') || lower.includes('contact')) {
      if (nameIdx === -1) nameIdx = i;
    } else if (lower.includes('phone') || lower.includes('tel') || lower.includes('mobile') || lower.includes('cell')) {
      phoneIdx = i;
    } else if (lower.includes('type') || lower.includes('status') || lower.includes('category')) {
      typeIdx = i;
    } else if (lower.includes('franchise') || lower.includes('location') || lower.includes('branch')) {
      franchiseIdx = i;
    }
  }

  return { nameIdx, emailIdx, phoneIdx, typeIdx, franchiseIdx };
}

/**
 * Try to detect columns from data patterns (no header)
 */
function detectColumnsFromData(rows: string[][]): { nameIdx: number; emailIdx: number; phoneIdx: number; typeIdx: number; franchiseIdx: number } {
  // Look at first few rows to find email column
  let emailIdx = -1;
  let phoneIdx = -1;

  for (const row of rows.slice(0, 5)) {
    for (let i = 0; i < row.length; i++) {
      const val = row[i].trim();
      if (EMAIL_REGEX.test(val) && emailIdx === -1) {
        emailIdx = i;
      }
      if (/^\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/.test(val.replace(/\D/g, '').length === 10 ? val : '') && phoneIdx === -1) {
        phoneIdx = i;
      }
    }
  }

  // Assume name is first column if email isn't first
  const nameIdx = emailIdx === 0 ? 1 : 0;

  return { nameIdx, emailIdx, phoneIdx, typeIdx: -1, franchiseIdx: -1 };
}

/**
 * Parse CSV/TSV text into structured rows
 */
export function parseCSV(text: string, defaultFranchise: string = '', defaultType: 'client' | 'alumni' = 'client'): ParseResult {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);

  if (lines.length === 0) {
    return { rows: [], totalParsed: 0, validCount: 0, errorCount: 0, duplicateEmails: [] };
  }

  const delimiter = detectDelimiter(text);
  const allRows = lines.map(line => line.split(delimiter).map(cleanValue));

  let hasHeader = false;
  let colMap = { nameIdx: 0, emailIdx: 1, phoneIdx: 2, typeIdx: -1, franchiseIdx: -1 };

  // Check if first row is a header
  if (allRows.length > 0 && isHeaderRow(allRows[0])) {
    hasHeader = true;
    colMap = detectColumns(allRows[0]);
    
    // Fill in missing indices with defaults
    if (colMap.emailIdx === -1) colMap.emailIdx = 1;
    if (colMap.nameIdx === -1) colMap.nameIdx = 0;
  } else if (allRows.length > 0) {
    // Try to detect from data patterns
    colMap = detectColumnsFromData(allRows);
    if (colMap.emailIdx === -1) colMap.emailIdx = 1;
    if (colMap.nameIdx === -1) colMap.nameIdx = 0;
  }

  const dataRows = hasHeader ? allRows.slice(1) : allRows;
  const seenEmails = new Set<string>();
  const duplicateEmails: string[] = [];
  const parsedRows: ParsedRow[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const errors: string[] = [];

    const name = (colMap.nameIdx >= 0 && colMap.nameIdx < row.length) ? row[colMap.nameIdx].trim() : '';
    const email = (colMap.emailIdx >= 0 && colMap.emailIdx < row.length) ? row[colMap.emailIdx].trim().toLowerCase() : '';
    const phone = (colMap.phoneIdx >= 0 && colMap.phoneIdx < row.length) ? normalizePhone(row[colMap.phoneIdx]) : '';
    const typeRaw = (colMap.typeIdx >= 0 && colMap.typeIdx < row.length) ? row[colMap.typeIdx] : '';
    const franchiseRaw = (colMap.franchiseIdx >= 0 && colMap.franchiseIdx < row.length) ? row[colMap.franchiseIdx] : '';

    const type = typeRaw ? normalizeType(typeRaw) : defaultType;
    const franchise = franchiseRaw || defaultFranchise;

    // Validation
    if (!name) errors.push('Name is missing');
    if (!email) {
      errors.push('Email is missing');
    } else if (!EMAIL_REGEX.test(email)) {
      errors.push('Invalid email format');
    }

    // Check for duplicates within the import
    if (email && seenEmails.has(email)) {
      errors.push('Duplicate email in import');
      duplicateEmails.push(email);
    }
    if (email) seenEmails.add(email);

    parsedRows.push({
      id: `row-${i}`,
      name,
      email,
      phone,
      type,
      franchise,
      isValid: errors.length === 0,
      errors,
    });
  }

  const validCount = parsedRows.filter(r => r.isValid).length;
  const errorCount = parsedRows.filter(r => !r.isValid).length;

  return {
    rows: parsedRows,
    totalParsed: parsedRows.length,
    validCount,
    errorCount,
    duplicateEmails,
  };
}

/**
 * Generate a CSV template string
 */
export function generateTemplate(): string {
  return `Name,Email,Phone,Type
John Smith,john.smith@email.com,(555) 123-4567,client
Jane Doe,jane.doe@email.com,(555) 987-6543,alumni
Bob Johnson,bob.j@email.com,,client`;
}
