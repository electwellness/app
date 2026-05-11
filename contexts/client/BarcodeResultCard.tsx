import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import { type BarcodeProduct } from '../../lib/foodSearchService';

interface BarcodeResultCardProps {
  product: BarcodeProduct;
  onAdd: (servings: number) => void;
  onRescan: () => void;
  onClose: () => void;
}

export default function BarcodeResultCard({ product, onAdd, onRescan, onClose }: BarcodeResultCardProps) {
  const [servings, setServings] = useState(1);
  const [showIngredients, setShowIngredients] = useState(false);

  const updateServings = (delta: number) => {
    setServings(prev => Math.max(0.5, Math.min(20, prev + delta)));
  };

  const getNutriscoreColor = (grade: string | null) => {
    if (!grade) return COLORS.textMuted;
    switch (grade.toLowerCase()) {
      case 'a': return '#1e8f4e';
      case 'b': return '#85bb2f';
      case 'c': return '#fecb02';
      case 'd': return '#ee8100';
      case 'e': return '#e63e11';
      default: return COLORS.textMuted;
    }
  };

  const getNovaLabel = (group: number | null) => {
    if (!group) return null;
    switch (group) {
      case 1: return 'Unprocessed';
      case 2: return 'Processed Ingredients';
      case 3: return 'Processed';
      case 4: return 'Ultra-processed';
      default: return null;
    }
  };

  const getNovaColor = (group: number | null) => {
    if (!group) return COLORS.textMuted;
    switch (group) {
      case 1: return '#1e8f4e';
      case 2: return '#85bb2f';
      case 3: return '#ee8100';
      case 4: return '#e63e11';
      default: return COLORS.textMuted;
    }
  };

  if (!product.found) {
    return (
      <View style={styles.container}>
        <View style={styles.notFoundCard}>
          <View style={styles.notFoundIcon}>
            <Ionicons name="alert-circle-outline" size={48} color={COLORS.warning} />
          </View>
          <Text style={styles.notFoundTitle}>Product Not Found</Text>
          <Text style={styles.notFoundSubtext}>
            Barcode {product.barcode} was not found in the Open Food Facts database.
          </Text>
          <Text style={styles.notFoundHint}>
            Try scanning again or search for the product by name.
          </Text>
          <View style={styles.notFoundActions}>
            <TouchableOpacity style={styles.rescanBtn} onPress={onRescan}>
              <Ionicons name="scan-outline" size={18} color={COLORS.accent} />
              <Text style={styles.rescanBtnText}>Scan Again</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.backBtn} onPress={onClose}>
              <Ionicons name="search-outline" size={18} color={COLORS.textSecondary} />
              <Text style={styles.backBtnText}>Search Instead</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Product Header */}
      <View style={styles.productCard}>
        <View style={styles.productHeader}>
          {product.imageUrl ? (
            <Image source={{ uri: product.imageUrl }} style={styles.productImage} resizeMode="contain" />
          ) : (
            <View style={styles.productImagePlaceholder}>
              <Ionicons name="cube-outline" size={32} color={COLORS.textMuted} />
            </View>
          )}
          <View style={styles.productInfo}>
            <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
            {product.brand && (
              <Text style={styles.productBrand}>{product.brand}</Text>
            )}
            <View style={styles.barcodeRow}>
              <Ionicons name="barcode-outline" size={12} color={COLORS.textMuted} />
              <Text style={styles.barcodeText}>{product.barcode}</Text>
            </View>
            {product.categories && (
              <Text style={styles.categoryText} numberOfLines={1}>{product.categories}</Text>
            )}
          </View>
        </View>

        {/* Badges Row */}
        <View style={styles.badgesRow}>
          <View style={[styles.sourceBadge, { backgroundColor: '#fef3e2' }]}>
            <Ionicons name="globe-outline" size={10} color="#e67e22" />
            <Text style={[styles.sourceBadgeText, { color: '#e67e22' }]}>Open Food Facts</Text>
          </View>
          {product.nutriscoreGrade && (
            <View style={[styles.scoreBadge, { backgroundColor: getNutriscoreColor(product.nutriscoreGrade) + '18' }]}>
              <Text style={[styles.scoreBadgeLabel, { color: getNutriscoreColor(product.nutriscoreGrade) }]}>
                Nutri-Score
              </Text>
              <Text style={[styles.scoreBadgeValue, { color: getNutriscoreColor(product.nutriscoreGrade) }]}>
                {product.nutriscoreGrade.toUpperCase()}
              </Text>
            </View>
          )}
          {product.novaGroup && (
            <View style={[styles.scoreBadge, { backgroundColor: getNovaColor(product.novaGroup) + '18' }]}>
              <Text style={[styles.scoreBadgeLabel, { color: getNovaColor(product.novaGroup) }]}>
                NOVA {product.novaGroup}
              </Text>
            </View>
          )}
        </View>

        {/* Serving Size */}
        <View style={styles.servingRow}>
          <Text style={styles.servingLabel}>Serving Size:</Text>
          <Text style={styles.servingValue}>{product.servingSize}</Text>
          {product.servingWeight && (
            <Text style={styles.servingWeight}>({product.servingWeight}g)</Text>
          )}
        </View>
      </View>

      {/* Nutrition Facts */}
      <View style={styles.nutritionCard}>
        <Text style={styles.nutritionTitle}>Nutrition Facts</Text>
        <Text style={styles.nutritionSubtitle}>Per {servings === 1 ? 'serving' : `${servings} servings`}</Text>

        {/* Calories Highlight */}
        <View style={styles.caloriesRow}>
          <View style={styles.caloriesCircle}>
            <Text style={styles.caloriesValue}>{Math.round(product.calories * servings)}</Text>
            <Text style={styles.caloriesUnit}>cal</Text>
          </View>
        </View>

        {/* Macro Grid */}
        <View style={styles.macroGrid}>
          <View style={[styles.macroCell, { borderColor: '#3498db30' }]}>
            <View style={[styles.macroDot, { backgroundColor: '#3498db' }]} />
            <Text style={styles.macroLabel}>Protein</Text>
            <Text style={[styles.macroValue, { color: '#3498db' }]}>
              {Math.round(product.protein * servings)}g
            </Text>
          </View>
          <View style={[styles.macroCell, { borderColor: '#2ecc7130' }]}>
            <View style={[styles.macroDot, { backgroundColor: '#2ecc71' }]} />
            <Text style={styles.macroLabel}>Carbs</Text>
            <Text style={[styles.macroValue, { color: '#2ecc71' }]}>
              {Math.round(product.carbs * servings)}g
            </Text>
          </View>
          <View style={[styles.macroCell, { borderColor: '#f39c1230' }]}>
            <View style={[styles.macroDot, { backgroundColor: '#f39c12' }]} />
            <Text style={styles.macroLabel}>Fat</Text>
            <Text style={[styles.macroValue, { color: '#f39c12' }]}>
              {Math.round(product.fat * servings)}g
            </Text>
          </View>
        </View>

        {/* Additional Nutrients */}
        <View style={styles.nutrientList}>
          <View style={styles.nutrientRow}>
            <Text style={styles.nutrientLabel}>Fiber</Text>
            <Text style={styles.nutrientValue}>{Math.round(product.fiber * servings)}g</Text>
          </View>
          <View style={styles.nutrientDivider} />
          <View style={styles.nutrientRow}>
            <Text style={styles.nutrientLabel}>Sugar</Text>
            <Text style={styles.nutrientValue}>{Math.round(product.sugar * servings)}g</Text>
          </View>
          <View style={styles.nutrientDivider} />
          <View style={styles.nutrientRow}>
            <Text style={styles.nutrientLabel}>Sodium</Text>
            <Text style={styles.nutrientValue}>{Math.round(product.sodium * servings)}mg</Text>
          </View>
        </View>
      </View>

      {/* Ingredients (collapsible) */}
      {product.ingredients && (
        <TouchableOpacity
          style={styles.ingredientsCard}
          onPress={() => setShowIngredients(!showIngredients)}
          activeOpacity={0.7}
        >
          <View style={styles.ingredientsHeader}>
            <Ionicons name="list-outline" size={16} color={COLORS.textSecondary} />
            <Text style={styles.ingredientsTitle}>Ingredients</Text>
            <Ionicons
              name={showIngredients ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={COLORS.textMuted}
            />
          </View>
          {showIngredients && (
            <Text style={styles.ingredientsText}>{product.ingredients}</Text>
          )}
        </TouchableOpacity>
      )}

      {/* NOVA Group Info */}
      {product.novaGroup && (
        <View style={styles.novaCard}>
          <View style={[styles.novaIndicator, { backgroundColor: getNovaColor(product.novaGroup) }]} />
          <View style={styles.novaInfo}>
            <Text style={styles.novaTitle}>NOVA Group {product.novaGroup}</Text>
            <Text style={styles.novaDescription}>{getNovaLabel(product.novaGroup)}</Text>
          </View>
        </View>
      )}

      {/* Servings Control + Add Button */}
      <View style={styles.actionCard}>
        <View style={styles.servingsControl}>
          <Text style={styles.servingsLabel}>Servings</Text>
          <View style={styles.servingsStepper}>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => updateServings(-0.5)}
            >
              <Ionicons name="remove" size={18} color={COLORS.accent} />
            </TouchableOpacity>
            <Text style={styles.stepperValue}>{servings}</Text>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => updateServings(0.5)}
            >
              <Ionicons name="add" size={18} color={COLORS.accent} />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={styles.addButton}
          onPress={() => onAdd(servings)}
          activeOpacity={0.8}
        >
          <Ionicons name="add-circle" size={22} color={COLORS.white} />
          <Text style={styles.addButtonText}>
            Log {Math.round(product.calories * servings)} cal
          </Text>
        </TouchableOpacity>

        <View style={styles.bottomActions}>
          <TouchableOpacity style={styles.secondaryAction} onPress={onRescan}>
            <Ionicons name="scan-outline" size={16} color={COLORS.accent} />
            <Text style={styles.secondaryActionText}>Scan Another</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryAction} onPress={onClose}>
            <Ionicons name="arrow-back-outline" size={16} color={COLORS.textSecondary} />
            <Text style={[styles.secondaryActionText, { color: COLORS.textSecondary }]}>Back to Search</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Not Found
  notFoundCard: {
    alignItems: 'center',
    padding: SPACING.xxxl,
    margin: SPACING.lg,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    ...SHADOWS.md,
  },
  notFoundIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.warningLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  notFoundTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  notFoundSubtext: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.sm,
    lineHeight: 20,
  },
  notFoundHint: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: SPACING.xl,
  },
  notFoundActions: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  rescanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.accent + '15',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.accent + '30',
  },
  rescanBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.accent,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  backBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },

  // Product Card
  productCard: {
    margin: SPACING.lg,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.md,
  },
  productHeader: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  productImage: {
    width: 80,
    height: 80,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.background,
  },
  productImagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  productInfo: { flex: 1 },
  productName: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 2,
  },
  productBrand: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.accent,
    marginBottom: 4,
  },
  barcodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  barcodeText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontFamily: 'monospace',
  },
  categoryText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  sourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },
  sourceBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  scoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },
  scoreBadgeLabel: {
    fontSize: 9,
    fontWeight: '700',
  },
  scoreBadgeValue: {
    fontSize: 10,
    fontWeight: '900',
  },
  servingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  servingLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  servingValue: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.text,
  },
  servingWeight: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
  },

  // Nutrition Card
  nutritionCard: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.md,
  },
  nutritionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.text,
  },
  nutritionSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginBottom: SPACING.md,
  },
  caloriesRow: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  caloriesCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#ff6b6b10',
    borderWidth: 3,
    borderColor: '#ff6b6b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  caloriesValue: {
    fontSize: 28,
    fontWeight: '900',
    color: '#ff6b6b',
  },
  caloriesUnit: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: '#ff6b6b',
    marginTop: -4,
  },
  macroGrid: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  macroCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.background,
    borderWidth: 1,
  },
  macroDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 4,
  },
  macroLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
    marginBottom: 2,
  },
  macroValue: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
  },
  nutrientList: {
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingTop: SPACING.md,
  },
  nutrientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
  },
  nutrientLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  nutrientValue: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.text,
  },
  nutrientDivider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
  },

  // Ingredients
  ingredientsCard: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  ingredientsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  ingredientsTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
  },
  ingredientsText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },

  // NOVA
  novaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  novaIndicator: {
    width: 4,
    height: 36,
    borderRadius: 2,
    marginRight: SPACING.md,
  },
  novaInfo: { flex: 1 },
  novaTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.text,
  },
  novaDescription: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
  },

  // Action Card
  actionCard: {
    margin: SPACING.lg,
    marginTop: SPACING.sm,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.md,
  },
  servingsControl: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
  },
  servingsLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.text,
  },
  servingsStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.xs,
  },
  stepperBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.accent + '40',
    ...SHADOWS.sm,
  },
  stepperValue: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: COLORS.text,
    minWidth: 36,
    textAlign: 'center',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accent,
    paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    ...SHADOWS.md,
  },
  addButtonText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.white,
  },
  bottomActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.xl,
    marginTop: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  secondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: SPACING.sm,
  },
  secondaryActionText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.accent,
  },
});
