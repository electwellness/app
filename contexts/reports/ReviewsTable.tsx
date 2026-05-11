import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';

export interface ReviewRow {
  id: string;
  clientId: string;
  clientName?: string;
  platform: string;
  reviewLink: string;
  starRating?: number;
  reviewDate: string;
  reviewText?: string;
  creditedTrainer?: string;
  creditedDietitian?: string;
  franchise?: string;
  addedDate?: string;
}

type SortField = 'reviewDate' | 'platform' | 'starRating' | 'franchise';
type SortDir = 'asc' | 'desc';

interface ReviewsTableProps {
  reviews: ReviewRow[];
  franchises: string[];
  platforms: string[];
}

const PLATFORM_LABELS: Record<string, string> = {
  google: 'Google',
  facebook: 'Facebook',
  yelp: 'Yelp',
  thumbtack: 'Thumbtack',
  nextdoor: 'Nextdoor',
};

function formatDate(d: string): string {
  if (!d) return '—';
  const parts = d.split('T')[0].split('-');
  if (parts.length < 3) return d;
  return `${parts[1]}/${parts[2]}/${parts[0].slice(2)}`;
}

function renderStars(rating?: number): string {
  if (!rating) return '—';
  return Array.from({ length: 5 }, (_, i) => (i < rating ? '\u2605' : '\u2606')).join('');
}

export default function ReviewsTable({ reviews, franchises, platforms }: ReviewsTableProps) {
  const [filterFranchise, setFilterFranchise] = useState<string>('all');
  const [filterPlatform, setFilterPlatform] = useState<string>('all');
  const [filterRating, setFilterRating] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('reviewDate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 15;

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
    setPage(0);
  }, [sortField]);

  const filtered = useMemo(() => {
    let result = [...reviews];
    if (filterFranchise !== 'all') {
      result = result.filter(r => r.franchise === filterFranchise);
    }
    if (filterPlatform !== 'all') {
      result = result.filter(r => r.platform === filterPlatform);
    }
    if (filterRating !== 'all') {
      const ratingNum = parseInt(filterRating);
      result = result.filter(r => r.starRating === ratingNum);
    }
    return result;
  }, [reviews, filterFranchise, filterPlatform, filterRating]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'reviewDate':
          cmp = (a.reviewDate || '').localeCompare(b.reviewDate || '');
          break;
        case 'platform':
          cmp = (a.platform || '').localeCompare(b.platform || '');
          break;
        case 'starRating':
          cmp = (a.starRating || 0) - (b.starRating || 0);
          break;
        case 'franchise':
          cmp = (a.franchise || '').localeCompare(b.franchise || '');
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortField, sortDir]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const generateCSV = useCallback(() => {
    const headers = ['Date', 'Platform', 'Rating', 'Franchise', 'Client', 'Trainer', 'Dietitian', 'Review Text', 'Link'];
    const rows = filtered.map(r => [
      r.reviewDate || '',
      PLATFORM_LABELS[r.platform] || r.platform,
      r.starRating ? String(r.starRating) : '',
      r.franchise || '',
      r.clientName || r.clientId,
      r.creditedTrainer || '',
      r.creditedDietitian || '',
      `"${(r.reviewText || '').replace(/"/g, '""')}"`,
      r.reviewLink || '',
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    return csvContent;
  }, [filtered]);

  const handleExportCSV = useCallback(async () => {
    const csv = generateCSV();
    if (Platform.OS === 'web') {
      try {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `reviews_report_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(url);
      } catch {
        // fallback
      }
    } else {
      try {
        await Share.share({
          message: csv,
          title: 'Reviews Report CSV',
        });
      } catch {
        // user cancelled
      }
    }
  }, [generateCSV]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <Ionicons name="swap-vertical-outline" size={10} color={COLORS.textMuted} />;
    return <Ionicons name={sortDir === 'asc' ? 'arrow-up' : 'arrow-down'} size={10} color={COLORS.white} />;
  };

  return (
    <View>
      {/* Filters Row */}
      <View style={styles.filtersRow}>
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>Franchise</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <TouchableOpacity
              style={[styles.filterChip, filterFranchise === 'all' && styles.filterChipActive]}
              onPress={() => { setFilterFranchise('all'); setPage(0); }}
            >
              <Text style={[styles.filterChipText, filterFranchise === 'all' && styles.filterChipTextActive]}>All</Text>
            </TouchableOpacity>
            {franchises.map(f => (
              <TouchableOpacity
                key={f}
                style={[styles.filterChip, filterFranchise === f && styles.filterChipActive]}
                onPress={() => { setFilterFranchise(f); setPage(0); }}
              >
                <Text style={[styles.filterChipText, filterFranchise === f && styles.filterChipTextActive]}>{f}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.filterRow2}>
          <View style={styles.filterGroup2}>
            <Text style={styles.filterLabel}>Platform</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              <TouchableOpacity
                style={[styles.filterChip, filterPlatform === 'all' && styles.filterChipActive]}
                onPress={() => { setFilterPlatform('all'); setPage(0); }}
              >
                <Text style={[styles.filterChipText, filterPlatform === 'all' && styles.filterChipTextActive]}>All</Text>
              </TouchableOpacity>
              {platforms.map(p => (
                <TouchableOpacity
                  key={p}
                  style={[styles.filterChip, filterPlatform === p && styles.filterChipActive]}
                  onPress={() => { setFilterPlatform(p); setPage(0); }}
                >
                  <Text style={[styles.filterChipText, filterPlatform === p && styles.filterChipTextActive]}>
                    {PLATFORM_LABELS[p] || p}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={styles.filterGroup2}>
            <Text style={styles.filterLabel}>Rating</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              <TouchableOpacity
                style={[styles.filterChip, filterRating === 'all' && styles.filterChipActive]}
                onPress={() => { setFilterRating('all'); setPage(0); }}
              >
                <Text style={[styles.filterChipText, filterRating === 'all' && styles.filterChipTextActive]}>All</Text>
              </TouchableOpacity>
              {[5, 4, 3, 2, 1].map(r => (
                <TouchableOpacity
                  key={r}
                  style={[styles.filterChip, filterRating === String(r) && styles.filterChipActive]}
                  onPress={() => { setFilterRating(String(r)); setPage(0); }}
                >
                  <Text style={[styles.filterChipText, filterRating === String(r) && styles.filterChipTextActive]}>
                    {r} {'\u2605'}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </View>

      {/* Results count + Export */}
      <View style={styles.resultsRow}>
        <Text style={styles.resultsText}>
          {filtered.length} review{filtered.length !== 1 ? 's' : ''} found
        </Text>
        <TouchableOpacity style={styles.csvBtn} onPress={handleExportCSV}>
          <Ionicons name="download-outline" size={14} color={COLORS.accent} />
          <Text style={styles.csvBtnText}>Export CSV</Text>
        </TouchableOpacity>
      </View>

      {/* Table */}
      <View style={styles.tableCard}>
        <ScrollView horizontal showsHorizontalScrollIndicator={true}>
          <View style={{ minWidth: 700 }}>
            {/* Table Header */}
            <View style={styles.tableHeader}>
              <TouchableOpacity style={[styles.thCell, { width: 90 }]} onPress={() => handleSort('reviewDate')}>
                <Text style={styles.thText}>Date</Text>
                <SortIcon field="reviewDate" />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.thCell, { width: 90 }]} onPress={() => handleSort('platform')}>
                <Text style={styles.thText}>Platform</Text>
                <SortIcon field="platform" />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.thCell, { width: 70 }]} onPress={() => handleSort('starRating')}>
                <Text style={styles.thText}>Rating</Text>
                <SortIcon field="starRating" />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.thCell, { width: 100 }]} onPress={() => handleSort('franchise')}>
                <Text style={styles.thText}>Franchise</Text>
                <SortIcon field="franchise" />
              </TouchableOpacity>
              <View style={[styles.thCell, { width: 100 }]}>
                <Text style={styles.thText}>Client</Text>
              </View>
              <View style={[styles.thCell, { width: 100 }]}>
                <Text style={styles.thText}>Trainer</Text>
              </View>
              <View style={[styles.thCell, { flex: 1, minWidth: 150 }]}>
                <Text style={styles.thText}>Review</Text>
              </View>
            </View>

            {/* Table Rows */}
            {paged.length === 0 ? (
              <View style={styles.emptyRow}>
                <Ionicons name="document-text-outline" size={24} color={COLORS.textMuted} />
                <Text style={styles.emptyText}>No reviews match the current filters</Text>
              </View>
            ) : (
              paged.map((r, i) => (
                <View key={r.id} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
                  <View style={[styles.tdCell, { width: 90 }]}>
                    <Text style={styles.tdText}>{formatDate(r.reviewDate)}</Text>
                  </View>
                  <View style={[styles.tdCell, { width: 90 }]}>
                    <View style={[styles.platformBadge, { backgroundColor: getPlatformColor(r.platform) + '20' }]}>
                      <Text style={[styles.platformBadgeText, { color: getPlatformColor(r.platform) }]}>
                        {PLATFORM_LABELS[r.platform] || r.platform}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.tdCell, { width: 70 }]}>
                    <Text style={[styles.tdText, { color: getStarColor(r.starRating) }]}>
                      {r.starRating ? `${r.starRating} \u2605` : '—'}
                    </Text>
                  </View>
                  <View style={[styles.tdCell, { width: 100 }]}>
                    <Text style={styles.tdText} numberOfLines={1}>{r.franchise || '—'}</Text>
                  </View>
                  <View style={[styles.tdCell, { width: 100 }]}>
                    <Text style={styles.tdText} numberOfLines={1}>{r.clientName || r.clientId}</Text>
                  </View>
                  <View style={[styles.tdCell, { width: 100 }]}>
                    <Text style={styles.tdText} numberOfLines={1}>{r.creditedTrainer || '—'}</Text>
                  </View>
                  <View style={[styles.tdCell, { flex: 1, minWidth: 150 }]}>
                    <Text style={styles.tdText} numberOfLines={2}>{r.reviewText || '—'}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>

        {/* Pagination */}
        {totalPages > 1 && (
          <View style={styles.pagination}>
            <TouchableOpacity
              style={[styles.pageBtn, page === 0 && styles.pageBtnDisabled]}
              onPress={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <Ionicons name="chevron-back" size={14} color={page === 0 ? COLORS.textMuted : COLORS.accent} />
            </TouchableOpacity>
            <Text style={styles.pageText}>
              Page {page + 1} of {totalPages}
            </Text>
            <TouchableOpacity
              style={[styles.pageBtn, page >= totalPages - 1 && styles.pageBtnDisabled]}
              onPress={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              <Ionicons name="chevron-forward" size={14} color={page >= totalPages - 1 ? COLORS.textMuted : COLORS.accent} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

function getPlatformColor(platform: string): string {
  switch (platform) {
    case 'google': return '#4285F4';
    case 'facebook': return '#1877F2';
    case 'yelp': return '#D32323';
    case 'thumbtack': return '#009FD9';
    case 'nextdoor': return '#8ED500';
    default: return COLORS.textMuted;
  }
}

function getStarColor(rating?: number): string {
  if (!rating) return COLORS.textMuted;
  if (rating >= 5) return '#F59E0B';
  if (rating >= 4) return '#84CC16';
  if (rating >= 3) return COLORS.warning;
  return COLORS.danger;
}

const styles = StyleSheet.create({
  filtersRow: {
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  filterRow2: {
    flexDirection: 'row',
    gap: SPACING.lg,
    flexWrap: 'wrap',
  },
  filterGroup: {
    gap: 4,
  },
  filterGroup2: {
    gap: 4,
    flex: 1,
    minWidth: 150,
  },
  filterLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
  },
  filterChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 5,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterChipText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  filterChipTextActive: {
    color: COLORS.white,
  },
  resultsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  resultsText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  csvBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.accent + '40',
    backgroundColor: COLORS.coral50,
  },
  csvBtnText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.accent,
  },
  tableCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    ...SHADOWS.md,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
  },
  thCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 4,
  },
  thText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.white,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    alignItems: 'center',
  },
  tableRowAlt: {
    backgroundColor: COLORS.navy50 + '40',
  },
  tdCell: {
    paddingHorizontal: 4,
    justifyContent: 'center',
  },
  tdText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.text,
  },
  platformBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
    alignSelf: 'flex-start',
  },
  platformBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  emptyRow: {
    padding: SPACING.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  emptyText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  pageBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.coral50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageBtnDisabled: {
    backgroundColor: COLORS.borderLight,
  },
  pageText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
});
