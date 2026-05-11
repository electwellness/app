import React from 'react';
import { Modal, View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import type { StoredPosturalAssessment } from '../../lib/clientDataService';

interface Props {
  visible: boolean;
  onClose: () => void;
  assessment: StoredPosturalAssessment | null;
  // Previous assessment, if any. Used to compute:
  // - score delta (improvement vs regression)
  // - resolved findings (present last time but absent in current)
  previousAssessment?: StoredPosturalAssessment | null;
}

// Build a stable, case-insensitive key for a finding so we can compare across
// assessments and flag "resolved" items. Falls back to observation text if area
// is missing.
function findingKey(f: { area?: string; observation?: string }): string {
  return (f.area || f.observation || '').trim().toLowerCase();
}

const severityColor = (sev?: string) =>
  sev === 'significant' ? '#e74c3c' : sev === 'moderate' ? '#f39c12' : '#2ecc71';
const priorityColor = (p?: string) =>
  p === 'high' ? '#e74c3c' : p === 'medium' ? '#f39c12' : '#2ecc71';

const scoreColor = (s: number) =>
  s >= 80 ? '#2ecc71' : s >= 60 ? '#f39c12' : '#e74c3c';

export default function PosturalAssessmentDetailModal({
  visible, onClose, assessment, previousAssessment,
}: Props) {
  if (!assessment) return null;

  const currentKeys = new Set(assessment.findings.map(findingKey));
  // Resolved findings = present in previous but absent in this one.
  // These get the green "Resolved" badge requested in the feature spec.
  const resolvedFindings = (previousAssessment?.findings || [])
    .filter(f => !currentKeys.has(findingKey(f)));

  const prevScore = previousAssessment?.overallScore;
  const scoreDelta = typeof prevScore === 'number' ? assessment.overallScore - prevScore : null;

  const date = assessment.measuredAt || assessment.createdAt.split('T')[0];
  const displayDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const photoWidth = Math.max(90, (Dimensions.get('window').width - SPACING.lg * 2 - SPACING.sm * 2) / 3 - 8);
  const poses: Array<'front' | 'side' | 'back'> = ['front', 'side', 'back'];
  const hasAnyPhoto = poses.some(p => assessment.photoUrls?.[p]);
  const hasAnyPrevPhoto = poses.some(p => previousAssessment?.photoUrls?.[p]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <Ionicons name="close" size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Postural Assessment</Text>
            <Text style={styles.headerDate}>{displayDate}</Text>
          </View>
          <View style={styles.headerBtn} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Score Card w/ delta vs previous */}
          <View style={styles.scoreCard}>
            <View style={[styles.scoreCircle, { borderColor: scoreColor(assessment.overallScore) }]}>
              <Text style={[styles.scoreNumber, { color: scoreColor(assessment.overallScore) }]}>
                {assessment.overallScore}
              </Text>
              <Text style={styles.scoreLabel}>/ 100</Text>
            </View>
            {scoreDelta !== null && (
              <View
                style={[
                  styles.deltaPill,
                  { backgroundColor: scoreDelta >= 0 ? '#2ecc7115' : '#e74c3c15' },
                ]}
              >
                <Ionicons
                  name={scoreDelta >= 0 ? 'trending-up' : 'trending-down'}
                  size={14}
                  color={scoreDelta >= 0 ? '#2ecc71' : '#e74c3c'}
                />
                <Text style={[styles.deltaText, { color: scoreDelta >= 0 ? '#2ecc71' : '#e74c3c' }]}>
                  {scoreDelta > 0 ? '+' : ''}{scoreDelta} pts vs previous
                </Text>
              </View>
            )}
            {assessment.summary ? (
              <Text style={styles.summary}>{assessment.summary}</Text>
            ) : null}
          </View>

          {/* Before / After photo thumbnails — side by side per pose */}
          {(hasAnyPhoto || hasAnyPrevPhoto) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Photos</Text>
              <Text style={styles.sectionSubtitle}>
                {hasAnyPrevPhoto ? 'Before (previous) vs After (this assessment)' : 'This assessment'}
              </Text>
              <View style={styles.photoRow}>
                {poses.map(pose => {
                  const prevUrl = previousAssessment?.photoUrls?.[pose] || null;
                  const curUrl = assessment.photoUrls?.[pose] || null;
                  if (!prevUrl && !curUrl) return null;
                  return (
                    <View key={pose} style={styles.photoCol}>
                      <Text style={styles.photoPoseLabel}>{pose.toUpperCase()}</Text>
                      <View style={styles.photoPair}>
                        <View style={styles.photoBox}>
                          {prevUrl ? (
                            <Image source={{ uri: prevUrl }} style={[styles.photoThumb, { width: photoWidth }]} />
                          ) : (
                            <View style={[styles.photoEmpty, { width: photoWidth }]}>
                              <Ionicons name="image-outline" size={22} color={COLORS.textMuted} />
                            </View>
                          )}
                          <Text style={styles.photoCaption}>Before</Text>
                        </View>
                        <View style={styles.photoBox}>
                          {curUrl ? (
                            <Image source={{ uri: curUrl }} style={[styles.photoThumb, { width: photoWidth }]} />
                          ) : (
                            <View style={[styles.photoEmpty, { width: photoWidth }]}>
                              <Ionicons name="image-outline" size={22} color={COLORS.textMuted} />
                            </View>
                          )}
                          <Text style={styles.photoCaption}>After</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Resolved Findings — from previous assessment but not this one */}
          {resolvedFindings.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Resolved Since Last Assessment</Text>
              {resolvedFindings.map((f, i) => (
                <View key={`resolved-${i}`} style={styles.resolvedCard}>
                  <View style={styles.resolvedIcon}>
                    <Ionicons name="checkmark-circle" size={20} color="#2ecc71" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.resolvedHeaderRow}>
                      <Text style={styles.findingArea}>{f.area || 'Finding'}</Text>
                      <View style={styles.resolvedBadge}>
                        <Text style={styles.resolvedBadgeText}>RESOLVED</Text>
                      </View>
                    </View>
                    {f.observation ? (
                      <Text style={styles.findingText}>{f.observation}</Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Current Findings */}
          {assessment.findings.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Key Findings</Text>
              {assessment.findings.map((f, i) => {
                const color = severityColor(f.severity);
                return (
                  <View key={i} style={styles.findingCard}>
                    <View style={[styles.findingIcon, { backgroundColor: color + '15' }]}>
                      <Ionicons name={(f.icon || 'alert-circle-outline') as any} size={18} color={color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.findingArea}>{f.area}</Text>
                      {f.observation ? <Text style={styles.findingText}>{f.observation}</Text> : null}
                      {f.severity ? (
                        <View style={[styles.sevBadge, { backgroundColor: color + '15' }]}>
                          <Text style={[styles.sevText, { color }]}>{f.severity}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Recommendations */}
          {assessment.recommendations.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recommendations</Text>
              {assessment.recommendations.map((r, i) => {
                const color = priorityColor(r.priority);
                return (
                  <View key={i} style={styles.recCard}>
                    <View style={styles.recHeader}>
                      <View style={[styles.priorityDot, { backgroundColor: color }]} />
                      <Text style={styles.recTitle}>{r.title}</Text>
                      {r.priority ? (
                        <View style={[styles.priBadge, { backgroundColor: color + '15' }]}>
                          <Text style={[styles.priText, { color }]}>{r.priority}</Text>
                        </View>
                      ) : null}
                    </View>
                    {r.description ? <Text style={styles.recDesc}>{r.description}</Text> : null}
                    {r.exercises && r.exercises.length > 0 && (
                      <View style={styles.exerciseList}>
                        {r.exercises.map((ex, j) => (
                          <View key={j} style={styles.exerciseItem}>
                            <Ionicons name="fitness-outline" size={12} color="#9b59b6" />
                            <Text style={styles.exerciseText}>{ex}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* Symmetry */}
          {assessment.symmetryAnalysis && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Symmetry Analysis</Text>
              <View style={styles.symmetryCard}>
                {[
                  { label: 'Upper Body', text: assessment.symmetryAnalysis.upperBody, icon: 'body-outline', color: '#3498db' },
                  { label: 'Lower Body', text: assessment.symmetryAnalysis.lowerBody, icon: 'walk-outline', color: '#2ecc71' },
                  { label: 'Overall', text: assessment.symmetryAnalysis.overall, icon: 'analytics-outline', color: '#9b59b6' },
                ].map((row, i, arr) => (
                  <View key={row.label}>
                    <View style={styles.symmetryRow}>
                      <Ionicons name={row.icon as any} size={16} color={row.color} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.symmetryLabel}>{row.label}</Text>
                        <Text style={styles.symmetryText}>{row.text}</Text>
                      </View>
                    </View>
                    {i < arr.length - 1 && <View style={styles.divider} />}
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Muscle Imbalances */}
          {assessment.muscleImbalances && assessment.muscleImbalances.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Muscle Imbalances</Text>
              {assessment.muscleImbalances.map((mi, i) => (
                <View key={i} style={styles.recCard}>
                  <Text style={styles.recTitle}>{mi.area}</Text>
                  {mi.description ? <Text style={styles.recDesc}>{mi.description}</Text> : null}
                  {mi.correction ? (
                    <View style={styles.correctionRow}>
                      <Ionicons name="medkit-outline" size={12} color="#9b59b6" />
                      <Text style={styles.correctionText}>{mi.correction}</Text>
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerBtn: { width: 40, alignItems: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: FONT_SIZES.lg, fontWeight: '800', color: COLORS.primary },
  headerDate: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 2 },

  scoreCard: {
    backgroundColor: COLORS.white, marginHorizontal: SPACING.lg, marginTop: SPACING.lg,
    padding: SPACING.xl, borderRadius: BORDER_RADIUS.lg, alignItems: 'center', ...SHADOWS.md,
  },
  scoreCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#9b59b608', borderWidth: 4, borderColor: '#9b59b6',
    justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.md,
  },
  scoreNumber: { fontSize: 32, fontWeight: '900' },
  scoreLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '600' },
  deltaPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: SPACING.md, paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full, marginBottom: SPACING.sm,
  },
  deltaText: { fontSize: FONT_SIZES.xs, fontWeight: '700' },
  summary: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 },

  section: { marginHorizontal: SPACING.lg, marginTop: SPACING.lg },
  sectionTitle: { fontSize: FONT_SIZES.lg, fontWeight: '800', color: COLORS.primary, marginBottom: 4 },
  sectionSubtitle: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginBottom: SPACING.md },

  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md },
  photoCol: { alignItems: 'center' },
  photoPoseLabel: { fontSize: 10, fontWeight: '800', color: COLORS.textMuted, letterSpacing: 1, marginBottom: 4 },
  photoPair: { flexDirection: 'row', gap: 4 },
  photoBox: { alignItems: 'center' },
  photoThumb: { height: 110, borderRadius: BORDER_RADIUS.sm, backgroundColor: COLORS.borderLight },
  photoEmpty: {
    height: 110, borderRadius: BORDER_RADIUS.sm, backgroundColor: COLORS.background,
    borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  photoCaption: { fontSize: 9, fontWeight: '700', color: COLORS.textMuted, marginTop: 2 },

  resolvedCard: {
    flexDirection: 'row', backgroundColor: '#2ecc7108',
    borderWidth: 1, borderColor: '#2ecc7140',
    borderRadius: BORDER_RADIUS.md, padding: SPACING.md,
    marginBottom: SPACING.sm, gap: SPACING.md,
  },
  resolvedIcon: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#2ecc7120',
    alignItems: 'center', justifyContent: 'center',
  },
  resolvedHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flexWrap: 'wrap' },
  resolvedBadge: {
    backgroundColor: '#2ecc71', paddingHorizontal: 8, paddingVertical: 2, borderRadius: BORDER_RADIUS.full,
  },
  resolvedBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },

  findingCard: {
    flexDirection: 'row', backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md, padding: SPACING.md,
    marginBottom: SPACING.sm, gap: SPACING.md, ...SHADOWS.sm,
  },
  findingIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  findingArea: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.primary },
  findingText: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, marginTop: 2, lineHeight: 16 },
  sevBadge: {
    alignSelf: 'flex-start', paddingHorizontal: SPACING.sm, paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full, marginTop: 4,
  },
  sevText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase' },

  recCard: {
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, marginBottom: SPACING.sm, ...SHADOWS.sm,
  },
  recHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  priorityDot: { width: 8, height: 8, borderRadius: 4 },
  recTitle: { flex: 1, fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.primary },
  priBadge: { paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: BORDER_RADIUS.full },
  priText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase' },
  recDesc: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, marginTop: SPACING.sm, lineHeight: 16 },
  exerciseList: { marginTop: SPACING.sm, gap: 4 },
  exerciseItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  exerciseText: { fontSize: FONT_SIZES.xs, color: '#9b59b6', fontWeight: '600' },

  symmetryCard: {
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg, ...SHADOWS.sm,
  },
  symmetryRow: { flexDirection: 'row', gap: SPACING.md, alignItems: 'flex-start' },
  symmetryLabel: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.primary },
  symmetryText: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, marginTop: 2, lineHeight: 16 },
  divider: { height: 1, backgroundColor: COLORS.borderLight, marginVertical: SPACING.md },

  correctionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.sm },
  correctionText: { fontSize: FONT_SIZES.xs, color: '#9b59b6', fontWeight: '600', flex: 1 },
});
