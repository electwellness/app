/**
 * Fuzzy / approximate string matching utilities for channel name resolution.
 *
 * Uses a combination of Levenshtein distance and token-based similarity
 * to find near-matches like "Facebok/Instagram" → "Facebook/Instagram"
 * or "Google Ad" → "Google Ads".
 */

// ─── Levenshtein distance ────────────────────────────────────────────────────
/**
 * Classic dynamic-programming Levenshtein edit distance.
 * Returns the minimum number of single-character edits (insert, delete, replace)
 * needed to transform `a` into `b`.
 */
export function levenshtein(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;

  // Fast paths
  if (la === 0) return lb;
  if (lb === 0) return la;
  if (a === b) return 0;

  // Use a single-row DP array for O(min(la, lb)) space
  const shorter = la < lb ? a : b;
  const longer = la < lb ? b : a;
  const sl = shorter.length;
  const ll = longer.length;

  let prev = new Array(sl + 1);
  let curr = new Array(sl + 1);

  for (let i = 0; i <= sl; i++) prev[i] = i;

  for (let j = 1; j <= ll; j++) {
    curr[0] = j;
    for (let i = 1; i <= sl; i++) {
      const cost = shorter[i - 1] === longer[j - 1] ? 0 : 1;
      curr[i] = Math.min(
        curr[i - 1] + 1,      // insertion
        prev[i] + 1,           // deletion
        prev[i - 1] + cost,    // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[sl];
}

// ─── Normalised similarity (0 → no match, 1 → identical) ────────────────────
/**
 * Returns a value between 0 and 1 representing how similar two strings are,
 * based on Levenshtein distance normalised by the longer string's length.
 */
export function levenshteinSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1; // both empty
  return 1 - levenshtein(a, b) / maxLen;
}

// ─── Token-based similarity ──────────────────────────────────────────────────
/**
 * Splits strings into tokens (words), then computes the best average
 * pairwise token similarity. This helps with reordered or partially
 * matching multi-word names like "Google Ads Search" vs "Search Google Ads".
 */
function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[\/\\&+\-_.,;:!?()[\]{}]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0);
}

export function tokenSimilarity(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);

  if (tokensA.length === 0 && tokensB.length === 0) return 1;
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  // For each token in A, find the best match in B
  let totalScore = 0;
  const usedB = new Set<number>();

  for (const tA of tokensA) {
    let bestScore = 0;
    let bestIdx = -1;
    for (let j = 0; j < tokensB.length; j++) {
      if (usedB.has(j)) continue;
      const sim = levenshteinSimilarity(tA, tokensB[j]);
      if (sim > bestScore) {
        bestScore = sim;
        bestIdx = j;
      }
    }
    if (bestIdx >= 0) usedB.add(bestIdx);
    totalScore += bestScore;
  }

  // Normalise by the larger token count to penalise missing tokens
  const maxTokens = Math.max(tokensA.length, tokensB.length);
  return totalScore / maxTokens;
}

// ─── Combined similarity score ───────────────────────────────────────────────
/**
 * Blends whole-string Levenshtein similarity with token-based similarity.
 * Weights: 40% whole-string, 60% token-based (token-based is more robust
 * for multi-word channel names with slight variations).
 */
export function combinedSimilarity(a: string, b: string): number {
  const aLower = a.toLowerCase().trim();
  const bLower = b.toLowerCase().trim();

  // Exact match shortcut
  if (aLower === bLower) return 1;

  const wholeSim = levenshteinSimilarity(aLower, bLower);
  const tokenSim = tokenSimilarity(a, b);

  // Also check if one is a prefix/suffix of the other (e.g., "Google Ad" vs "Google Ads")
  let prefixBonus = 0;
  if (aLower.startsWith(bLower) || bLower.startsWith(aLower)) {
    prefixBonus = 0.1;
  }

  return Math.min(1, wholeSim * 0.4 + tokenSim * 0.6 + prefixBonus);
}

// ─── Fuzzy match candidate ───────────────────────────────────────────────────
export interface FuzzyCandidate {
  /** The canonical channel name */
  channelName: string;
  /** The channel ID */
  channelId: string;
  /** Similarity score 0–1 */
  score: number;
  /** Human-readable confidence label */
  confidence: 'high' | 'medium' | 'low';
  /** Whether this was matched via an alias (and which one) */
  matchedVia?: 'name' | 'alias';
  /** The alias string that matched, if applicable */
  matchedAlias?: string;
}

export interface FuzzyMatchConfig {
  /** Minimum similarity to consider a fuzzy match (default 0.65) */
  threshold?: number;
  /** Maximum number of candidates to return (default 3) */
  maxCandidates?: number;
}

/**
 * Given an unknown channel name and a list of known channels (with aliases),
 * returns fuzzy match candidates sorted by descending similarity.
 *
 * Only returns candidates above the threshold that are NOT exact or alias matches
 * (those should have been caught earlier in the pipeline).
 */
export function findFuzzyMatches(
  input: string,
  channels: { id: string; name: string; aliases?: { alias: string }[] }[],
  config: FuzzyMatchConfig = {},
): FuzzyCandidate[] {
  const { threshold = 0.65, maxCandidates = 3 } = config;
  const inputLower = input.toLowerCase().trim();

  if (!inputLower) return [];

  const candidates: FuzzyCandidate[] = [];
  const seen = new Set<string>(); // avoid duplicate channel entries

  for (const channel of channels) {
    const channelNameLower = channel.name.toLowerCase().trim();

    // Skip exact matches (these should already be handled)
    if (channelNameLower === inputLower) continue;

    let bestScore = combinedSimilarity(inputLower, channelNameLower);
    let matchedVia: 'name' | 'alias' = 'name';
    let matchedAlias: string | undefined;

    // Also check aliases
    if (channel.aliases && Array.isArray(channel.aliases)) {
      for (const alias of channel.aliases) {
        const aliasLower = alias.alias.toLowerCase().trim();
        // Skip exact alias matches
        if (aliasLower === inputLower) {
          bestScore = -1; // signal to skip entirely
          break;
        }
        const aliasSim = combinedSimilarity(inputLower, aliasLower);
        if (aliasSim > bestScore) {
          bestScore = aliasSim;
          matchedVia = 'alias';
          matchedAlias = alias.alias;
        }
      }
    }

    // If we hit an exact alias match, skip this channel
    if (bestScore < 0) continue;

    if (bestScore >= threshold && !seen.has(channel.id)) {
      seen.add(channel.id);
      candidates.push({
        channelName: channel.name,
        channelId: channel.id,
        score: Math.round(bestScore * 100) / 100,
        confidence: bestScore >= 0.85 ? 'high' : bestScore >= 0.75 ? 'medium' : 'low',
        matchedVia,
        matchedAlias: matchedVia === 'alias' ? matchedAlias : undefined,
      });
    }
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  return candidates.slice(0, maxCandidates);
}

/**
 * Format a similarity score as a percentage string.
 */
export function formatScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}

/**
 * Get a color for a confidence level.
 */
export function getConfidenceColor(confidence: 'high' | 'medium' | 'low'): string {
  switch (confidence) {
    case 'high': return '#2ecc71';
    case 'medium': return '#f39c12';
    case 'low': return '#e74c3c';
  }
}
