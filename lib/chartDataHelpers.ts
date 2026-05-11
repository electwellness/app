/**
 * Helpers for computing chart data from real database records.
 * Used by Dashboard and Reports screens to derive program distribution
 * from live client data.
 */



// ── Program distribution ──

/** Color palette for known program name patterns */
const PROGRAM_COLOR_MAP: Record<string, string> = {
  // Individual tiers
  'platinum individual': '#8B5CF6',
  'plat ind': '#8B5CF6',
  'platinum ind': '#8B5CF6',
  'gold individual': '#F59E0B',
  'gold ind': '#F59E0B',
  'silver individual': '#94A3B8',
  'silver ind': '#94A3B8',
  'bronze individual': '#B45309',
  'bronze ind': '#B45309',
  // Shared / group tiers
  'platinum shared': '#7C3AED',
  'plat shared': '#7C3AED',
  'platinum group': '#7C3AED',
  'gold shared': '#D97706',
  'gold group': '#D97706',
  'silver shared': '#64748B',
  'silver group': '#64748B',
  'bronze shared': '#92400E',
  'bronze group': '#92400E',
  // Other common programs
  'jumpstart': '#e67e22',
  'trial': '#3498db',
  'maintenance': '#1abc9c',
  'nutrition only': '#9b59b6',
  'nutrition': '#9b59b6',
};

/** Fallback colors for programs not in the map */
const FALLBACK_COLORS = [
  '#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6',
  '#1abc9c', '#e67e22', '#34495e', '#16a085', '#c0392b',
  '#2980b9', '#8e44ad', '#27ae60', '#d35400', '#7f8c8d',
];

/**
 * Compute program enrollment distribution from a list of contacts/clients.
 * Each contact should have a `program` field (string or null).
 *
 * Returns data suitable for the DonutChart component:
 *   { name: string; value: number; color: string }[]
 *
 * Values are percentages (rounded to nearest integer, summing to ~100).
 */
export function computeProgramDistribution(
  contacts: { program?: string | null }[],
): { name: string; value: number; color: string }[] {
  if (contacts.length === 0) return [];

  // Count by program
  const counts: Record<string, number> = {};
  let totalWithProgram = 0;

  for (const c of contacts) {
    const program = (c.program || '').trim();
    if (!program) continue;
    counts[program] = (counts[program] || 0) + 1;
    totalWithProgram++;
  }

  if (totalWithProgram === 0) return [];

  // Sort by count descending
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  // Assign colors
  let fallbackIdx = 0;
  const result = sorted.map(([name, count]) => {
    const pct = Math.round((count / totalWithProgram) * 100);
    const lowerName = name.toLowerCase();

    // Try to match a known color
    let color = PROGRAM_COLOR_MAP[lowerName];
    if (!color) {
      // Try partial match
      for (const [pattern, c] of Object.entries(PROGRAM_COLOR_MAP)) {
        if (lowerName.includes(pattern) || pattern.includes(lowerName)) {
          color = c;
          break;
        }
      }
    }
    if (!color) {
      color = FALLBACK_COLORS[fallbackIdx % FALLBACK_COLORS.length];
      fallbackIdx++;
    }

    return { name, value: Math.max(1, pct), color };
  });

  return result;
}

/**
 * Shorten a program name for chart labels (max ~12 chars).
 */
export function shortenProgramName(name: string): string {
  if (name.length <= 14) return name;

  // Common abbreviations
  const abbrevs: Record<string, string> = {
    'Platinum': 'Plat',
    'Individual': 'Ind',
    'Shared': 'Shrd',
    'Group': 'Grp',
    'Maintenance': 'Maint',
    'Nutrition': 'Nutr',
  };

  let shortened = name;
  for (const [full, abbr] of Object.entries(abbrevs)) {
    shortened = shortened.replace(new RegExp(full, 'gi'), abbr);
  }

  return shortened.length <= 14 ? shortened : shortened.slice(0, 12) + '...';
}
