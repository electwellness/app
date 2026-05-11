import { Platform } from 'react-native';
import type { BiometricEntry } from '../data/clientPortalData';
import { biometricMeta } from '../data/clientPortalData';
import { BRAND } from '../constants/theme';

// ============================================================
// CSV EXPORT
// ============================================================

const CSV_HEADERS: { key: keyof BiometricEntry; label: string }[] = [
  { key: 'date', label: 'Date' },
  { key: 'bloodPressureSys', label: 'BP Systolic (mmHg)' },
  { key: 'bloodPressureDia', label: 'BP Diastolic (mmHg)' },
  { key: 'heartRate', label: 'Heart Rate (bpm)' },

  { key: 'height', label: 'Height (in)' },
  { key: 'weight', label: 'Weight (lbs)' },
  { key: 'bmi', label: 'BMI' },
  { key: 'bodyFat', label: 'Body Fat (%)' },
  { key: 'muscleMassPct', label: 'Muscle Mass (%)' },

  { key: 'leanMusclePct', label: 'Lean Muscle (%)' },
  { key: 'fatMass', label: 'Fat Mass (lbs)' },
  { key: 'leanMuscleMass', label: 'Lean Muscle Mass (lbs)' },
  { key: 'muscleMass', label: 'Muscle Mass (lbs)' },
  { key: 'massPerMuscleLb', label: 'Mass / Muscle Lb' },
  { key: 'visceralFat', label: 'Visceral Fat' },
  { key: 'navelWaist', label: 'Navel Waist (in)' },
  { key: 'widestWaist', label: 'Widest Waist (in)' },
  { key: 'narrowestWaist', label: 'Narrowest Waist (in)' },
  { key: 'shoulders', label: 'Shoulders (in)' },
  { key: 'bicep', label: 'Bicep (in)' },
  { key: 'sideHip', label: 'Side Hip (in)' },
  { key: 'rearHip', label: 'Rear Hip (in)' },
  { key: 'calf', label: 'Calf (in)' },
  { key: 'flexibility', label: 'Flexibility (in)' },
  { key: 'gripStrength', label: 'Grip Strength (lbs)' },
];



export function generateCSV(
  data: BiometricEntry[],
  clientName: string,
  dateRange?: { start: string; end: string }
): string {
  const filtered = dateRange
    ? data.filter(e => e.date >= dateRange.start && e.date <= dateRange.end)
    : data;

  const headerRow = CSV_HEADERS.map(h => `"${h.label}"`).join(',');
  const dataRows = filtered.map(entry =>
    CSV_HEADERS.map(h => {
      const val = entry[h.key];
      if (val === null || val === undefined) return '';
      return typeof val === 'string' ? `"${val}"` : val;
    }).join(',')
  );

  const meta = [
    `"Client","${clientName}"`,
    `"Export Date","${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}"`,
    dateRange ? `"Date Range","${dateRange.start} to ${dateRange.end}"` : `"Date Range","All Time"`,
    `"Total Entries","${filtered.length}"`,
    '',
  ];

  return [...meta, headerRow, ...dataRows].join('\n');
}

export function downloadCSV(csvContent: string, filename: string): void {
  if (Platform.OS !== 'web') return;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ============================================================
// PDF EXPORT (HTML-based for web)
// ============================================================

export interface PDFExportOptions {
  clientName: string;
  dateRange?: { start: string; end: string };
  selectedMetrics: string[];
  data: BiometricEntry[];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getMetricSummary(
  data: BiometricEntry[],
  metricKey: string
): { start: number; current: number; change: number; pctChange: number } | null {
  if (data.length < 1) return null;
  const first = data[0];
  const last = data[data.length - 1];
  const startVal = (first[metricKey as keyof BiometricEntry] as number) || 0;
  const currentVal = (last[metricKey as keyof BiometricEntry] as number) || 0;
  if (startVal === 0 && currentVal === 0) return null;
  const change = currentVal - startVal;
  const pctChange = startVal !== 0 ? (change / startVal) * 100 : 0;
  return { start: startVal, current: currentVal, change, pctChange };
}

function generateSVGChart(
  data: BiometricEntry[],
  metricKey: string,
  color: string,
  width: number = 600,
  height: number = 200
): string {
  const values = data.map(e => (e[metricKey as keyof BiometricEntry] as number) || 0);
  if (values.length === 0) return '';

  const padding = { top: 20, right: 20, bottom: 40, left: 60 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const minVal = Math.min(...values) * 0.95;
  const maxVal = Math.max(...values) * 1.05;
  const range = maxVal - minVal || 1;

  const points = values.map((v, i) => {
    const x = padding.left + (i / Math.max(values.length - 1, 1)) * chartW;
    const y = padding.top + chartH - ((v - minVal) / range) * chartH;
    return { x, y, value: v, date: data[i].date };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

  // Area fill
  const areaD = pathD + ` L ${points[points.length - 1].x.toFixed(1)} ${(padding.top + chartH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padding.top + chartH).toFixed(1)} Z`;

  // Grid lines
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(pct => {
    const y = padding.top + chartH - pct * chartH;
    const val = (minVal + pct * range).toFixed(1);
    return `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="4,4"/>
            <text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" fill="#8fa4b5" font-size="10" font-family="system-ui">${val}</text>`;
  }).join('\n');

  // Date labels
  const labelIndices = values.length <= 6
    ? values.map((_, i) => i)
    : [0, Math.floor(values.length / 4), Math.floor(values.length / 2), Math.floor(3 * values.length / 4), values.length - 1];

  const dateLabels = labelIndices.map(i => {
    const p = points[i];
    if (!p) return '';
    return `<text x="${p.x}" y="${padding.top + chartH + 20}" text-anchor="middle" fill="#8fa4b5" font-size="10" font-family="system-ui">${formatDate(p.date)}</text>`;
  }).join('\n');

  // Data point dots
  const dots = points.map(p =>
    `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="${color}" stroke="white" stroke-width="2"/>`
  ).join('\n');

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="grad_${metricKey}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.2"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0.02"/>
      </linearGradient>
    </defs>
    ${gridLines}
    <path d="${areaD}" fill="url(#grad_${metricKey})"/>
    <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}
    ${dateLabels}
  </svg>`;
}

export function generatePDFHTML(options: PDFExportOptions): string {
  const { clientName, dateRange, selectedMetrics, data } = options;

  const filtered = dateRange
    ? data.filter(e => e.date >= dateRange.start && e.date <= dateRange.end)
    : data;

  if (filtered.length === 0) {
    return '<html><body><h1>No data available for the selected range</h1></body></html>';
  }

  const dateRangeStr = dateRange
    ? `${formatDate(dateRange.start)} - ${formatDate(dateRange.end)}`
    : `${formatDate(filtered[0].date)} - ${formatDate(filtered[filtered.length - 1].date)}`;

  // Generate summary cards
  const summaryCards = selectedMetrics.map(key => {
    const meta = biometricMeta[key];
    if (!meta) return '';
    const summary = getMetricSummary(filtered, key);
    if (!summary) return '';

    const isGood = meta.goodDirection === 'down' ? summary.change < 0 : summary.change > 0;
    const changeColor = isGood ? '#2ecc71' : '#e74c3c';
    const arrow = summary.change > 0 ? '&#9650;' : summary.change < 0 ? '&#9660;' : '&#8212;';

    return `
      <div style="background:#fff;border-radius:12px;padding:20px;border:1px solid #e2e8f0;flex:1;min-width:200px;">
        <div style="font-size:11px;color:#8fa4b5;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin-bottom:8px;">${meta.label}</div>
        <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:12px;">
          <div>
            <div style="font-size:10px;color:#8fa4b5;">Start</div>
            <div style="font-size:20px;font-weight:800;color:#0A3D5C;">${summary.start}${meta.unit ? ' ' + meta.unit : ''}</div>
          </div>
          <div style="font-size:20px;color:#8fa4b5;">&#8594;</div>
          <div>
            <div style="font-size:10px;color:#8fa4b5;">Current</div>
            <div style="font-size:20px;font-weight:800;color:#0A3D5C;">${summary.current}${meta.unit ? ' ' + meta.unit : ''}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <span style="color:${changeColor};font-weight:700;font-size:14px;">${arrow} ${summary.change > 0 ? '+' : ''}${summary.change.toFixed(1)}${meta.unit ? ' ' + meta.unit : ''}</span>
          <span style="background:${changeColor}15;color:${changeColor};padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;">${summary.pctChange > 0 ? '+' : ''}${summary.pctChange.toFixed(1)}%</span>
        </div>
      </div>`;
  }).filter(Boolean);

  // Generate charts
  const charts = selectedMetrics.map(key => {
    const meta = biometricMeta[key];
    if (!meta) return '';
    const svg = generateSVGChart(filtered, key, meta.color);
    return `
      <div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #e2e8f0;margin-bottom:20px;page-break-inside:avoid;">
        <div style="font-size:16px;font-weight:700;color:#0A3D5C;margin-bottom:4px;">${meta.label} Trend</div>
        <div style="font-size:11px;color:#8fa4b5;margin-bottom:16px;">${filtered.length} measurements &bull; ${dateRangeStr}</div>
        ${svg}
      </div>`;
  }).filter(Boolean);

  // Generate data table
  const tableHeaders = ['Date', ...selectedMetrics.map(k => biometricMeta[k]?.label || k)];
  const tableRows = filtered.map(entry => {
    const cells = [
      formatDate(entry.date),
      ...selectedMetrics.map(k => {
        const val = entry[k as keyof BiometricEntry];
        const meta = biometricMeta[k];
        if (val === null || val === undefined || val === 0) return '-';
        return `${val}${meta?.unit ? ' ' + meta.unit : ''}`;
      })
    ];
    return `<tr>${cells.map(c => `<td style="padding:8px 12px;border-bottom:1px solid #edf2f7;font-size:12px;color:#0A3D5C;">${c}</td>`).join('')}</tr>`;
  });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Biometrics Report - ${clientName}</title>
  <style>
    @media print {
      body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      .no-print { display: none !important; }
      .page-break { page-break-before: always; }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f0f4f8; color: #0A3D5C; }
    .container { max-width: 800px; margin: 0 auto; padding: 40px 24px; }
    .header { background: linear-gradient(135deg, #0A3D5C, #0E8AC8); border-radius: 16px; padding: 32px; color: white; margin-bottom: 24px; }
    .header h1 { font-size: 24px; font-weight: 800; margin-bottom: 4px; }
    .header p { font-size: 13px; opacity: 0.85; }
    .meta-row { display: flex; gap: 24px; margin-top: 16px; }
    .meta-item { font-size: 12px; }
    .meta-item strong { font-weight: 700; }
    .summary-grid { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 24px; }
    .section-title { font-size: 18px; font-weight: 800; color: #0A3D5C; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; }
    th { background: #0A3D5C; color: white; padding: 10px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; text-align: left; }
    tr:nth-child(even) td { background: #f8fafc; }
    .footer { text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #8fa4b5; }
    .print-btn { position: fixed; top: 20px; right: 20px; background: #0E8AC8; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; z-index: 100; }
    .print-btn:hover { background: #0B6FA0; }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">Print / Save PDF</button>
  <div class="container">
    <div class="header">
      <h1>Biometrics Report</h1>
      <p>${clientName}</p>
      <div class="meta-row">
        <div class="meta-item"><strong>Date Range:</strong> ${dateRangeStr}</div>
        <div class="meta-item"><strong>Measurements:</strong> ${filtered.length}</div>
        <div class="meta-item"><strong>Generated:</strong> ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
      </div>
    </div>

    <div class="section-title">Progress Summary</div>
    <div class="summary-grid">
      ${summaryCards.join('\n')}
    </div>

    <div class="section-title">Trends</div>
    ${charts.join('\n')}

    <div class="page-break"></div>
    <div class="section-title">Detailed Data</div>
    <table>
      <thead>
        <tr>${tableHeaders.map(h => `<th>${h}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${tableRows.join('\n')}
      </tbody>
    </table>

    <div class="footer">
      <p>${BRAND.name} &bull; ${BRAND.tagline} &bull; Generated ${new Date().toLocaleDateString()}</p>
      <p style="margin-top:4px;">This report contains confidential health information.</p>
    </div>
  </div>
</body>
</html>`;
}

export function openPDFInNewWindow(html: string): void {
  if (Platform.OS !== 'web') return;

  const newWindow = window.open('', '_blank');
  if (newWindow) {
    newWindow.document.write(html);
    newWindow.document.close();
  }
}

// ============================================================
// ADMIN: Fetch biometrics for any client
// ============================================================

import { supabase } from './supabase';
import { dbBiometricToLocal } from './clientDataService';

export async function fetchBiometricsForClient(userId: string): Promise<BiometricEntry[]> {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(userId)) return [];

  const { data, error } = await supabase
    .from('client_biometrics')
    .select('*')
    .eq('user_id', userId)
    .order('measured_at', { ascending: true });

  if (error) {
    console.error('Error fetching biometrics for client:', error);
    return [];
  }

  return (data || []).map(dbBiometricToLocal);
}
