import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../../constants/theme';
import { commonFoods, FoodEntry } from '../../data/clientPortalData';
import {
  searchFoods,
  flattenResults,
  addToRecentFoods,
  getRecentFoods,
  getSourceInfo,
  getConfidenceColor,
  lookupBarcode,
  barcodeProductToSuggestion,
  type FoodSuggestion,
  type FoodSearchResponse,
  type BarcodeProduct,
} from '../../lib/foodSearchService';
import BarcodeScannerModal from './BarcodeScannerModal';
import BarcodeResultCard from './BarcodeResultCard';

interface AddFoodModalProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (entry: Omit<FoodEntry, 'id'>) => void;
  selectedMeal: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  selectedDate?: string; // YYYY-MM-DD - defaults to today if not provided
}

export default function AddFoodModal({ visible, onClose, onAdd, selectedMeal, selectedDate }: AddFoodModalProps) {
  const getEntryDate = () => selectedDate || new Date().toISOString().split('T')[0];

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'search' | 'custom'>('search');
  const [customName, setCustomName] = useState('');
  const [customCalories, setCustomCalories] = useState('');
  const [customProtein, setCustomProtein] = useState('');
  const [customCarbs, setCustomCarbs] = useState('');
  const [customFat, setCustomFat] = useState('');
  const [customFiber, setCustomFiber] = useState('');
  const [customServing, setCustomServing] = useState('');
  const [servings, setServings] = useState<Record<string, number>>({});

  // API search state
  const [searching, setSearching] = useState(false);
  const [searchResponse, setSearchResponse] = useState<FoodSearchResponse | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [recentFoods, setRecentFoods] = useState<FoodSuggestion[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastQueryRef = useRef('');

  // Barcode scanner state
  const [showScanner, setShowScanner] = useState(false);
  const [barcodeProduct, setBarcodeProduct] = useState<BarcodeProduct | null>(null);
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);

  // Recent food expanded preview state
  const [selectedRecentFood, setSelectedRecentFood] = useState<FoodSuggestion | null>(null);
  const [recentAddedId, setRecentAddedId] = useState<string | null>(null);
  const recentAddedAnim = useRef(new Animated.Value(0)).current;

  // Load recent foods on mount
  useEffect(() => {
    if (visible) {
      getRecentFoods().then(setRecentFoods);
      // Reset barcode state when modal opens
      setBarcodeProduct(null);
      setBarcodeLoading(false);
      setBarcodeError(null);
      setSelectedRecentFood(null);
      setRecentAddedId(null);
    }
  }, [visible]);

  // Debounced search
  const handleSearchChange = useCallback((text: string) => {
    setSearch(text);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    const trimmed = text.trim();
    if (trimmed.length < 2) {
      setSearchResponse(null);
      setSearchError(null);
      setSearching(false);
      lastQueryRef.current = '';
      return;
    }

    setSearching(true);
    setSearchError(null);

    debounceRef.current = setTimeout(async () => {
      if (trimmed === lastQueryRef.current) {
        setSearching(false);
        return;
      }
      lastQueryRef.current = trimmed;

      try {
        const response = await searchFoods(trimmed);
        // Only update if this is still the current query
        if (trimmed === lastQueryRef.current) {
          setSearchResponse(response);
          setSearchError(response.error || null);
          setSearching(false);
        }
      } catch (err: any) {
        if (trimmed === lastQueryRef.current) {
          setSearchError(err.message || 'Search failed');
          setSearching(false);
        }
      }
    }, 400);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Filtered local foods for quick-add (when no API search)
  const filteredLocalFoods = useMemo(() => {
    if (!search.trim()) return commonFoods;
    const q = search.toLowerCase();
    return commonFoods.filter(f => f.name.toLowerCase().includes(q));
  }, [search]);

  // Flattened API results
  const apiResults = useMemo(() => {
    if (!searchResponse) return [];
    return flattenResults(searchResponse);
  }, [searchResponse]);

  const hasApiResults = apiResults.some(r => r.suggestions.length > 0);

  const getMealIcon = (meal: string) => {
    switch (meal) {
      case 'breakfast': return 'sunny-outline';
      case 'lunch': return 'restaurant-outline';
      case 'dinner': return 'moon-outline';
      case 'snack': return 'cafe-outline';
      default: return 'nutrition-outline';
    }
  };

  // Convert a local common food to FoodSuggestion for recent foods storage
  const localFoodToSuggestion = (food: typeof commonFoods[0]): FoodSuggestion => ({
    id: `local_${food.name.toLowerCase().replace(/\s+/g, '_')}`,
    name: food.name,
    brand: null,
    source: 'USDA' as const,
    servingSize: food.servingSize,
    servingWeight: null,
    calories: food.calories,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
    fiber: food.fiber,
    sugar: food.sugar,
    sodium: food.sodium,
    confidence: 1.0,
  });

  // Handle adding a recent food with one tap
  const handleAddRecentFood = useCallback((food: FoodSuggestion) => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    onAdd({
      date: getEntryDate(),
      time: timeStr,
      meal: selectedMeal,
      name: food.brand ? `${food.name} (${food.brand})` : food.name,
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
      fiber: food.fiber,
      sugar: food.sugar,
      sodium: food.sodium,
      servingSize: food.servingSize,
    });

    // Move to top of recent foods
    addToRecentFoods(food);

    // Show added animation
    setRecentAddedId(food.id);
    recentAddedAnim.setValue(1);
    Animated.timing(recentAddedAnim, {
      toValue: 0,
      duration: 1200,
      useNativeDriver: true,
    }).start(() => {
      setRecentAddedId(null);
    });

    // Close modal after brief delay for feedback
    setTimeout(() => {
      setSearch('');
      setSearchResponse(null);
      setServings({});
      setSelectedRecentFood(null);
      onClose();
    }, 400);
  }, [selectedMeal, onAdd, onClose, recentAddedAnim]);

  // Handle tapping a recent food chip - show expanded preview
  const handleRecentChipTap = useCallback((food: FoodSuggestion) => {
    if (selectedRecentFood?.id === food.id) {
      // Already selected - add it immediately
      handleAddRecentFood(food);
    } else {
      setSelectedRecentFood(food);
    }
  }, [selectedRecentFood, handleAddRecentFood]);

  // Handle barcode scanned from camera
  const handleBarcodeScanned = useCallback(async (barcode: string) => {
    setShowScanner(false);
    setBarcodeLoading(true);
    setBarcodeError(null);
    setBarcodeProduct(null);

    try {
      const product = await lookupBarcode(barcode);
      setBarcodeProduct(product);
    } catch (err: any) {
      setBarcodeError(err.message || 'Failed to look up barcode');
    } finally {
      setBarcodeLoading(false);
    }
  }, []);

  // Handle adding barcode product
  const handleAddBarcodeProduct = useCallback((servingsCount: number) => {
    if (!barcodeProduct || !barcodeProduct.found) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    onAdd({
      date: getEntryDate(),
      time: timeStr,
      meal: selectedMeal,
      name: barcodeProduct.brand
        ? `${barcodeProduct.name} (${barcodeProduct.brand})`
        : barcodeProduct.name,
      calories: Math.round(barcodeProduct.calories * servingsCount),
      protein: Math.round(barcodeProduct.protein * servingsCount),
      carbs: Math.round(barcodeProduct.carbs * servingsCount),
      fat: Math.round(barcodeProduct.fat * servingsCount),
      fiber: Math.round(barcodeProduct.fiber * servingsCount),
      sugar: Math.round(barcodeProduct.sugar * servingsCount),
      sodium: Math.round(barcodeProduct.sodium * servingsCount),
      servingSize: servingsCount === 1
        ? barcodeProduct.servingSize
        : `${servingsCount}x ${barcodeProduct.servingSize}`,
    });

    // Also save to recent foods
    addToRecentFoods(barcodeProductToSuggestion(barcodeProduct));

    setBarcodeProduct(null);
    setSearch('');
    setSearchResponse(null);
    setServings({});
    onClose();
  }, [barcodeProduct, selectedMeal, onAdd, onClose]);

  const handleAddApiFood = (food: FoodSuggestion) => {
    const qty = servings[food.id] || 1;
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    onAdd({
      date: getEntryDate(),
      time: timeStr,
      meal: selectedMeal,
      name: food.brand ? `${food.name} (${food.brand})` : food.name,
      calories: Math.round(food.calories * qty),
      protein: Math.round(food.protein * qty),
      carbs: Math.round(food.carbs * qty),
      fat: Math.round(food.fat * qty),
      fiber: Math.round(food.fiber * qty),
      sugar: Math.round(food.sugar * qty),
      sodium: Math.round(food.sodium * qty),
      servingSize: qty === 1 ? food.servingSize : `${qty}x ${food.servingSize}`,
    });

    // Save to recent foods
    addToRecentFoods(food);

    setSearch('');
    setSearchResponse(null);
    setServings({});
    onClose();
  };

  const handleQuickAdd = (food: typeof commonFoods[0]) => {
    const qty = servings[food.name] || 1;
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    onAdd({
      date: getEntryDate(),
      time: timeStr,
      meal: selectedMeal,
      name: food.name,
      calories: Math.round(food.calories * qty),
      protein: Math.round(food.protein * qty),
      carbs: Math.round(food.carbs * qty),
      fat: Math.round(food.fat * qty),
      fiber: Math.round(food.fiber * qty),
      sugar: Math.round(food.sugar * qty),
      sodium: Math.round(food.sodium * qty),
      servingSize: qty === 1 ? food.servingSize : `${qty}x ${food.servingSize}`,
    });

    // Save to recent foods
    addToRecentFoods(localFoodToSuggestion(food));

    setSearch('');
    setServings({});
    onClose();
  };

  const handleCustomAdd = () => {
    if (!customName.trim() || !customCalories) return;
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    const customFood: FoodSuggestion = {
      id: `custom_${Date.now()}`,
      name: customName.trim(),
      brand: null,
      source: 'USDA',
      servingSize: customServing || '1 serving',
      servingWeight: null,
      calories: parseInt(customCalories) || 0,
      protein: parseInt(customProtein) || 0,
      carbs: parseInt(customCarbs) || 0,
      fat: parseInt(customFat) || 0,
      fiber: parseInt(customFiber) || 0,
      sugar: 0,
      sodium: 0,
      confidence: 1.0,
    };

    onAdd({
      date: getEntryDate(),
      time: timeStr,
      meal: selectedMeal,
      name: customFood.name,
      calories: customFood.calories,
      protein: customFood.protein,
      carbs: customFood.carbs,
      fat: customFood.fat,
      fiber: customFood.fiber,
      sugar: 0,
      sodium: 0,
      servingSize: customFood.servingSize,
    });

    // Save custom food to recent foods
    addToRecentFoods(customFood);

    resetCustom();
    onClose();
  };

  const resetCustom = () => {
    setCustomName('');
    setCustomCalories('');
    setCustomProtein('');
    setCustomCarbs('');
    setCustomFat('');
    setCustomFiber('');
    setCustomServing('');
  };

  const updateServings = (key: string, delta: number) => {
    setServings(prev => {
      const current = prev[key] || 1;
      const next = Math.max(0.5, Math.min(10, current + delta));
      return { ...prev, [key]: next };
    });
  };

  const renderSourceBadge = (source: 'USDA' | 'Open Food Facts') => {
    const info = getSourceInfo(source);
    return (
      <View style={[styles.sourceBadge, { backgroundColor: info.bgColor }]}>
        <Ionicons name={info.icon as any} size={9} color={info.color} />
        <Text style={[styles.sourceBadgeText, { color: info.color }]}>{info.label}</Text>
      </View>
    );
  };

  const renderConfidenceDot = (confidence: number) => {
    const color = getConfidenceColor(confidence);
    const pct = Math.round(confidence * 100);
    return (
      <View style={styles.confidenceContainer}>
        <View style={[styles.confidenceDot, { backgroundColor: color }]} />
        <Text style={[styles.confidenceText, { color }]}>{pct}%</Text>
      </View>
    );
  };

  const renderFoodSuggestion = (food: FoodSuggestion) => {
    const qty = servings[food.id] || 1;
    return (
      <View key={food.id} style={styles.foodItem}>
        <View style={styles.foodInfo}>
          <View style={styles.foodNameRow}>
            <Text style={styles.foodName} numberOfLines={1}>{food.name}</Text>
            {renderConfidenceDot(food.confidence)}
          </View>
          {food.brand && (
            <Text style={styles.foodBrand} numberOfLines={1}>{food.brand}</Text>
          )}
          <View style={styles.foodMetaRow}>
            {renderSourceBadge(food.source)}
            <Text style={styles.foodServing}>{food.servingSize}</Text>
          </View>
          <View style={styles.macroRow}>
            <Text style={[styles.macroTag, { backgroundColor: '#ff6b6b15', color: '#ff6b6b' }]}>
              {Math.round(food.calories * qty)} cal
            </Text>
            <Text style={[styles.macroTag, { backgroundColor: '#3498db15', color: '#3498db' }]}>
              P: {Math.round(food.protein * qty)}g
            </Text>
            <Text style={[styles.macroTag, { backgroundColor: '#2ecc7115', color: '#2ecc71' }]}>
              C: {Math.round(food.carbs * qty)}g
            </Text>
            <Text style={[styles.macroTag, { backgroundColor: '#f39c1215', color: '#f39c12' }]}>
              F: {Math.round(food.fat * qty)}g
            </Text>
          </View>
        </View>
        <View style={styles.foodActions}>
          <View style={styles.qtyControl}>
            <TouchableOpacity onPress={() => updateServings(food.id, -0.5)} style={styles.qtyBtn}>
              <Ionicons name="remove" size={14} color={COLORS.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.qtyText}>{qty}</Text>
            <TouchableOpacity onPress={() => updateServings(food.id, 0.5)} style={styles.qtyBtn}>
              <Ionicons name="add" size={14} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={() => handleAddApiFood(food)}>
            <Ionicons name="add-circle" size={20} color={COLORS.white} />
            <Text style={styles.addBtnText}>Add</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // Render recent foods chips section
  const renderRecentFoodsChips = () => {
    if (recentFoods.length === 0) return null;

    return (
      <View style={styles.recentSection}>
        <View style={styles.recentHeader}>
          <Ionicons name="time-outline" size={15} color={COLORS.accent} />
          <Text style={styles.recentTitle}>Recent Foods</Text>
          <Text style={styles.recentSubtitle}>Tap to log again</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.recentChipsContainer}
          keyboardShouldPersistTaps="handled"
        >
          {recentFoods.slice(0, 15).map((food) => {
            const isSelected = selectedRecentFood?.id === food.id;
            const justAdded = recentAddedId === food.id;
            return (
              <TouchableOpacity
                key={food.id}
                style={[
                  styles.recentChip,
                  isSelected && styles.recentChipSelected,
                  justAdded && styles.recentChipAdded,
                ]}
                onPress={() => handleRecentChipTap(food)}
                activeOpacity={0.7}
              >
                {justAdded ? (
                  <Animated.View style={[styles.recentChipContent, { opacity: recentAddedAnim }]}>
                    <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
                    <Text style={[styles.recentChipName, { color: COLORS.success }]}>Added!</Text>
                  </Animated.View>
                ) : (
                  <View style={styles.recentChipContent}>
                    <Text style={[
                      styles.recentChipName,
                      isSelected && styles.recentChipNameSelected,
                    ]} numberOfLines={1}>
                      {food.name}
                    </Text>
                    <Text style={[
                      styles.recentChipCal,
                      isSelected && styles.recentChipCalSelected,
                    ]}>
                      {food.calories} cal
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Expanded preview card for selected recent food */}
        {selectedRecentFood && (
          <View style={styles.recentPreview}>
            <View style={styles.recentPreviewHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.recentPreviewName} numberOfLines={1}>
                  {selectedRecentFood.name}
                </Text>
                {selectedRecentFood.brand && (
                  <Text style={styles.recentPreviewBrand}>{selectedRecentFood.brand}</Text>
                )}
                <Text style={styles.recentPreviewServing}>{selectedRecentFood.servingSize}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedRecentFood(null)}
                style={styles.recentPreviewClose}
              >
                <Ionicons name="close" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={styles.recentPreviewMacros}>
              <View style={[styles.recentPreviewMacro, { backgroundColor: '#ff6b6b12' }]}>
                <Text style={[styles.recentPreviewMacroValue, { color: '#ff6b6b' }]}>
                  {selectedRecentFood.calories}
                </Text>
                <Text style={[styles.recentPreviewMacroLabel, { color: '#ff6b6b' }]}>cal</Text>
              </View>
              <View style={[styles.recentPreviewMacro, { backgroundColor: '#3498db12' }]}>
                <Text style={[styles.recentPreviewMacroValue, { color: '#3498db' }]}>
                  {selectedRecentFood.protein}g
                </Text>
                <Text style={[styles.recentPreviewMacroLabel, { color: '#3498db' }]}>protein</Text>
              </View>
              <View style={[styles.recentPreviewMacro, { backgroundColor: '#2ecc7112' }]}>
                <Text style={[styles.recentPreviewMacroValue, { color: '#2ecc71' }]}>
                  {selectedRecentFood.carbs}g
                </Text>
                <Text style={[styles.recentPreviewMacroLabel, { color: '#2ecc71' }]}>carbs</Text>
              </View>
              <View style={[styles.recentPreviewMacro, { backgroundColor: '#f39c1212' }]}>
                <Text style={[styles.recentPreviewMacroValue, { color: '#f39c12' }]}>
                  {selectedRecentFood.fat}g
                </Text>
                <Text style={[styles.recentPreviewMacroLabel, { color: '#f39c12' }]}>fat</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.recentPreviewAddBtn}
              onPress={() => handleAddRecentFood(selectedRecentFood)}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle" size={18} color={COLORS.white} />
              <Text style={styles.recentPreviewAddText}>
                Log to {selectedMeal.charAt(0).toUpperCase() + selectedMeal.slice(1)}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  // Determine if we're showing barcode results
  const showBarcodeResults = barcodeProduct !== null || barcodeLoading || barcodeError;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => {
            if (showBarcodeResults) {
              setBarcodeProduct(null);
              setBarcodeLoading(false);
              setBarcodeError(null);
            } else {
              onClose();
            }
          }} style={styles.closeBtn}>
            <Ionicons
              name={showBarcodeResults ? 'arrow-back' : 'close'}
              size={24}
              color={COLORS.primary}
            />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Ionicons name={getMealIcon(selectedMeal) as any} size={18} color={COLORS.accent} />
            <Text style={styles.headerTitle}>
              {showBarcodeResults
                ? 'Scanned Product'
                : `Add to ${selectedMeal.charAt(0).toUpperCase() + selectedMeal.slice(1)}`}
            </Text>
          </View>
          {!showBarcodeResults ? (
            <TouchableOpacity
              onPress={() => setShowScanner(true)}
              style={styles.barcodeHeaderBtn}
            >
              <Ionicons name="barcode-outline" size={22} color={COLORS.accent} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 24 }} />
          )}
        </View>

        {/* Barcode Loading State */}
        {barcodeLoading && (
          <View style={styles.barcodeLoadingContainer}>
            <View style={styles.barcodeLoadingCard}>
              <ActivityIndicator size="large" color={COLORS.accent} />
              <Text style={styles.barcodeLoadingTitle}>Looking Up Product</Text>
              <Text style={styles.barcodeLoadingSubtext}>
                Searching Open Food Facts database...
              </Text>
            </View>
          </View>
        )}

        {/* Barcode Error State */}
        {barcodeError && !barcodeLoading && (
          <View style={styles.barcodeLoadingContainer}>
            <View style={styles.barcodeErrorCard}>
              <Ionicons name="alert-circle-outline" size={48} color={COLORS.danger} />
              <Text style={styles.barcodeErrorTitle}>Lookup Failed</Text>
              <Text style={styles.barcodeErrorText}>{barcodeError}</Text>
              <View style={styles.barcodeErrorActions}>
                <TouchableOpacity
                  style={styles.barcodeRetryBtn}
                  onPress={() => { setBarcodeError(null); setShowScanner(true); }}
                >
                  <Ionicons name="scan-outline" size={16} color={COLORS.accent} />
                  <Text style={styles.barcodeRetryBtnText}>Try Again</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.barcodeBackBtn}
                  onPress={() => { setBarcodeError(null); }}
                >
                  <Text style={styles.barcodeBackBtnText}>Back to Search</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Barcode Product Result */}
        {barcodeProduct && !barcodeLoading && (
          <BarcodeResultCard
            product={barcodeProduct}
            onAdd={handleAddBarcodeProduct}
            onRescan={() => {
              setBarcodeProduct(null);
              setShowScanner(true);
            }}
            onClose={() => setBarcodeProduct(null)}
          />
        )}

        {/* Normal Search/Custom UI (hidden when showing barcode results) */}
        {!showBarcodeResults && (
          <>
            {/* Tabs */}
            <View style={styles.tabs}>
              <TouchableOpacity
                style={[styles.tab, tab === 'search' && styles.tabActive]}
                onPress={() => setTab('search')}
              >
                <Ionicons name="search" size={16} color={tab === 'search' ? COLORS.accent : COLORS.textMuted} />
                <Text style={[styles.tabText, tab === 'search' && styles.tabTextActive]}>Food Database</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, tab === 'custom' && styles.tabActive]}
                onPress={() => setTab('custom')}
              >
                <Ionicons name="create-outline" size={16} color={tab === 'custom' ? COLORS.accent : COLORS.textMuted} />
                <Text style={[styles.tabText, tab === 'custom' && styles.tabTextActive]}>Custom Entry</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {tab === 'search' ? (
                <>
                  {/* Recent Foods Chips - ABOVE search bar */}
                  {renderRecentFoodsChips()}

                  {/* Search Bar with Barcode Button */}
                  <View style={styles.searchRow}>
                    <View style={styles.searchContainer}>
                      <Ionicons name="search" size={18} color={COLORS.textMuted} />
                      <TextInput
                        style={styles.searchInput}
                        value={search}
                        onChangeText={handleSearchChange}
                        placeholder="Search foods, meals, or brands..."
                        placeholderTextColor={COLORS.textMuted}
                        autoCorrect={false}
                      />
                      {searching && (
                        <ActivityIndicator size="small" color={COLORS.accent} />
                      )}
                      {search.length > 0 && !searching && (
                        <TouchableOpacity onPress={() => { setSearch(''); setSearchResponse(null); setSearchError(null); lastQueryRef.current = ''; }}>
                          <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
                        </TouchableOpacity>
                      )}
                    </View>
                    <TouchableOpacity
                      style={styles.barcodeScanBtn}
                      onPress={() => setShowScanner(true)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="barcode-outline" size={22} color={COLORS.white} />
                    </TouchableOpacity>
                  </View>

                  {/* Search Hint */}
                  {!search.trim() && (
                    <View style={styles.searchHintContainer}>
                      <View style={styles.searchHintRow}>
                        <Ionicons name="bulb-outline" size={14} color={COLORS.accent} />
                        <Text style={styles.searchHintText}>
                          Try: "chicken breast", "chipotle bowl", or "banana and yogurt"
                        </Text>
                      </View>
                      <View style={styles.sourceInfoRow}>
                        <View style={[styles.sourceInfoBadge, { backgroundColor: '#e8f5e9' }]}>
                          <Ionicons name="leaf-outline" size={10} color="#1a7a3a" />
                          <Text style={[styles.sourceInfoText, { color: '#1a7a3a' }]}>USDA FoodData Central</Text>
                        </View>
                        <View style={[styles.sourceInfoBadge, { backgroundColor: '#fef3e2' }]}>
                          <Ionicons name="barcode-outline" size={10} color="#e67e22" />
                          <Text style={[styles.sourceInfoText, { color: '#e67e22' }]}>Open Food Facts</Text>
                        </View>
                      </View>

                      {/* Barcode Scan CTA */}
                      <TouchableOpacity
                        style={styles.barcodeCTA}
                        onPress={() => setShowScanner(true)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.barcodeCTAIcon}>
                          <Ionicons name="scan-outline" size={24} color={COLORS.accent} />
                        </View>
                        <View style={styles.barcodeCTAContent}>
                          <Text style={styles.barcodeCTATitle}>Scan a Barcode</Text>
                          <Text style={styles.barcodeCTASubtext}>
                            Fastest way to log packaged foods
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Meal Split Indicator */}
                  {searchResponse && searchResponse.components.length > 1 && (
                    <View style={styles.splitIndicator}>
                      <Ionicons name="git-branch-outline" size={14} color={COLORS.accent} />
                      <Text style={styles.splitText}>
                        Detected {searchResponse.components.length} items:{' '}
                        {searchResponse.components.map((c, i) => (
                          <Text key={i} style={styles.splitItem}>
                            {c}{i < searchResponse.components.length - 1 ? ', ' : ''}
                          </Text>
                        ))}
                      </Text>
                    </View>
                  )}

                  {/* Search Error */}
                  {searchError && (
                    <View style={styles.errorContainer}>
                      <Ionicons name="alert-circle-outline" size={16} color={COLORS.danger} />
                      <Text style={styles.errorText}>{searchError}</Text>
                    </View>
                  )}

                  {/* API Results */}
                  {hasApiResults && apiResults.map(({ component, suggestions }) => {
                    if (suggestions.length === 0) return null;
                    return (
                      <View key={component}>
                        {searchResponse && searchResponse.components.length > 1 && (
                          <View style={styles.componentHeader}>
                            <View style={styles.componentDot} />
                            <Text style={styles.componentLabel}>
                              {component.charAt(0).toUpperCase() + component.slice(1)}
                            </Text>
                            <Text style={styles.componentCount}>{suggestions.length} results</Text>
                          </View>
                        )}
                        {suggestions.map(food => renderFoodSuggestion(food))}
                      </View>
                    );
                  })}

                  {/* Searching state */}
                  {searching && search.trim().length >= 2 && (
                    <View style={styles.searchingState}>
                      <ActivityIndicator size="large" color={COLORS.accent} />
                      <Text style={styles.searchingText}>Searching USDA & Open Food Facts...</Text>
                      <Text style={styles.searchingSubtext}>Analyzing: "{search.trim()}"</Text>
                    </View>
                  )}

                  {/* No API results but done searching */}
                  {!searching && search.trim().length >= 2 && searchResponse && !hasApiResults && (
                    <View style={styles.noApiResults}>
                      <Ionicons name="cloud-offline-outline" size={24} color={COLORS.textMuted} />
                      <Text style={styles.noApiResultsText}>No results from food databases</Text>
                      <Text style={styles.noApiResultsSubtext}>Showing local matches below, or try a different search</Text>
                    </View>
                  )}

                  {/* Local Quick-Add Foods */}
                  {(!hasApiResults || !search.trim()) && (
                    <View style={styles.sectionContainer}>
                      <View style={styles.sectionHeader}>
                        <Ionicons name="flash-outline" size={14} color={COLORS.accent} />
                        <Text style={styles.sectionTitle}>
                          {search.trim() ? 'Local Matches' : 'Quick Add'}
                        </Text>
                        <View style={styles.localBadge}>
                          <Text style={styles.localBadgeText}>Offline</Text>
                        </View>
                      </View>
                      {filteredLocalFoods.map((food, i) => {
                        const qty = servings[food.name] || 1;
                        return (
                          <View key={i} style={styles.foodItem}>
                            <View style={styles.foodInfo}>
                              <Text style={styles.foodName}>{food.name}</Text>
                              <Text style={styles.foodServing}>{food.servingSize}</Text>
                              <View style={styles.macroRow}>
                                <Text style={[styles.macroTag, { backgroundColor: '#ff6b6b15', color: '#ff6b6b' }]}>
                                  {Math.round(food.calories * qty)} cal
                                </Text>
                                <Text style={[styles.macroTag, { backgroundColor: '#3498db15', color: '#3498db' }]}>
                                  P: {Math.round(food.protein * qty)}g
                                </Text>
                                <Text style={[styles.macroTag, { backgroundColor: '#2ecc7115', color: '#2ecc71' }]}>
                                  C: {Math.round(food.carbs * qty)}g
                                </Text>
                                <Text style={[styles.macroTag, { backgroundColor: '#f39c1215', color: '#f39c12' }]}>
                                  F: {Math.round(food.fat * qty)}g
                                </Text>
                              </View>
                            </View>
                            <View style={styles.foodActions}>
                              <View style={styles.qtyControl}>
                                <TouchableOpacity onPress={() => updateServings(food.name, -0.5)} style={styles.qtyBtn}>
                                  <Ionicons name="remove" size={14} color={COLORS.textSecondary} />
                                </TouchableOpacity>
                                <Text style={styles.qtyText}>{qty}</Text>
                                <TouchableOpacity onPress={() => updateServings(food.name, 0.5)} style={styles.qtyBtn}>
                                  <Ionicons name="add" size={14} color={COLORS.textSecondary} />
                                </TouchableOpacity>
                              </View>
                              <TouchableOpacity style={styles.addBtn} onPress={() => handleQuickAdd(food)}>
                                <Ionicons name="add-circle" size={20} color={COLORS.white} />
                                <Text style={styles.addBtnText}>Add</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })}
                      {filteredLocalFoods.length === 0 && search.trim() && (
                        <View style={styles.emptyState}>
                          <Ionicons name="search-outline" size={32} color={COLORS.textMuted} />
                          <Text style={styles.emptyText}>No local matches</Text>
                          <Text style={styles.emptySubtext}>Try the custom entry tab to add manually</Text>
                        </View>
                      )}
                    </View>
                  )}
                </>
              ) : (
                /* Custom Entry Form */
                <View style={styles.customForm}>
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Food Name *</Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={customName}
                      onChangeText={setCustomName}
                      placeholder="e.g., Grilled Chicken Salad"
                      placeholderTextColor={COLORS.textMuted}
                    />
                  </View>
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Serving Size</Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={customServing}
                      onChangeText={setCustomServing}
                      placeholder="e.g., 1 cup, 4 oz"
                      placeholderTextColor={COLORS.textMuted}
                    />
                  </View>
                  <View style={styles.fieldRow}>
                    <View style={[styles.fieldGroup, { flex: 1 }]}>
                      <Text style={styles.fieldLabel}>Calories *</Text>
                      <TextInput
                        style={styles.fieldInput}
                        value={customCalories}
                        onChangeText={setCustomCalories}
                        placeholder="0"
                        placeholderTextColor={COLORS.textMuted}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={[styles.fieldGroup, { flex: 1 }]}>
                      <Text style={styles.fieldLabel}>Protein (g)</Text>
                      <TextInput
                        style={styles.fieldInput}
                        value={customProtein}
                        onChangeText={setCustomProtein}
                        placeholder="0"
                        placeholderTextColor={COLORS.textMuted}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                  <View style={styles.fieldRow}>
                    <View style={[styles.fieldGroup, { flex: 1 }]}>
                      <Text style={styles.fieldLabel}>Carbs (g)</Text>
                      <TextInput
                        style={styles.fieldInput}
                        value={customCarbs}
                        onChangeText={setCustomCarbs}
                        placeholder="0"
                        placeholderTextColor={COLORS.textMuted}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={[styles.fieldGroup, { flex: 1 }]}>
                      <Text style={styles.fieldLabel}>Fat (g)</Text>
                      <TextInput
                        style={styles.fieldInput}
                        value={customFat}
                        onChangeText={setCustomFat}
                        placeholder="0"
                        placeholderTextColor={COLORS.textMuted}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Fiber (g)</Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={customFiber}
                      onChangeText={setCustomFiber}
                      placeholder="0"
                      placeholderTextColor={COLORS.textMuted}
                      keyboardType="numeric"
                    />
                  </View>
                  <TouchableOpacity
                    style={[styles.submitBtn, (!customName.trim() || !customCalories) && styles.submitBtnDisabled]}
                    onPress={handleCustomAdd}
                    disabled={!customName.trim() || !customCalories}
                  >
                    <Ionicons name="add-circle" size={20} color={COLORS.white} />
                    <Text style={styles.submitBtnText}>Add Food Entry</Text>
                  </TouchableOpacity>
                </View>
              )}
              <View style={{ height: 40 }} />
            </ScrollView>
          </>
        )}
      </KeyboardAvoidingView>

      {/* Barcode Scanner Modal */}
      <BarcodeScannerModal
        visible={showScanner}
        onClose={() => setShowScanner(false)}
        onBarcodeScanned={handleBarcodeScanned}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  closeBtn: { padding: SPACING.xs },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  headerTitle: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.primary },
  barcodeHeaderBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.accent + '12',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACING.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: COLORS.accent },
  tabText: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.textMuted },
  tabTextActive: { color: COLORS.accent, fontWeight: '700' },
  scroll: { flex: 1 },

  // ==========================================
  // Recent Foods Chips Section
  // ==========================================
  recentSection: {
    backgroundColor: COLORS.white,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  recentTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.text,
  },
  recentSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginLeft: 'auto',
    fontStyle: 'italic',
  },
  recentChipsContainer: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  recentChip: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    minWidth: 80,
    maxWidth: 180,
  },
  recentChipSelected: {
    backgroundColor: COLORS.accent + '12',
    borderColor: COLORS.accent,
  },
  recentChipAdded: {
    backgroundColor: COLORS.successLight,
    borderColor: COLORS.success,
  },
  recentChipContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recentChipName: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.text,
    flexShrink: 1,
  },
  recentChipNameSelected: {
    color: COLORS.accent,
    fontWeight: '700',
  },
  recentChipCal: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textMuted,
    backgroundColor: COLORS.white,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  recentChipCalSelected: {
    color: COLORS.accent,
    backgroundColor: COLORS.accent + '15',
  },

  // Recent Food Preview Card
  recentPreview: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.xs,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.accent + '30',
  },
  recentPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
  },
  recentPreviewName: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.text,
  },
  recentPreviewBrand: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.accent,
    fontWeight: '600',
    marginTop: 1,
  },
  recentPreviewServing: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  recentPreviewClose: {
    padding: 4,
    marginLeft: SPACING.sm,
  },
  recentPreviewMacros: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  recentPreviewMacro: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
  },
  recentPreviewMacroValue: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
  },
  recentPreviewMacroLabel: {
    fontSize: 8,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginTop: 1,
  },
  recentPreviewAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
    ...SHADOWS.sm,
  },
  recentPreviewAddText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.white,
  },

  // ==========================================
  // Search Row with Barcode Button
  // ==========================================
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: SPACING.lg,
    gap: SPACING.sm,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 46,
    gap: SPACING.sm,
    ...SHADOWS.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    height: '100%',
  },
  barcodeScanBtn: {
    width: 46,
    height: 46,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.md,
  },

  // Barcode CTA
  barcodeCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.accent + '25',
    ...SHADOWS.sm,
  },
  barcodeCTAIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.accent + '12',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  barcodeCTAContent: { flex: 1 },
  barcodeCTATitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.text,
  },
  barcodeCTASubtext: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 1,
  },

  // Barcode Loading
  barcodeLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xxxl,
  },
  barcodeLoadingCard: {
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xxxl,
    width: '100%',
    maxWidth: 320,
    ...SHADOWS.lg,
  },
  barcodeLoadingTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: SPACING.lg,
  },
  barcodeLoadingSubtext: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },

  // Barcode Error
  barcodeErrorCard: {
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xxxl,
    width: '100%',
    maxWidth: 320,
    ...SHADOWS.lg,
  },
  barcodeErrorTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.danger,
    marginTop: SPACING.md,
  },
  barcodeErrorText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  barcodeErrorActions: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  barcodeRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.accent + '15',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
  },
  barcodeRetryBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.accent,
  },
  barcodeBackBtn: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.background,
  },
  barcodeBackBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },

  // Search Hints
  searchHintContainer: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  searchHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  searchHintText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    flex: 1,
  },
  sourceInfoRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  sourceInfoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },
  sourceInfoText: {
    fontSize: 9,
    fontWeight: '700',
  },
  // Split Indicator
  splitIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.accent + '08',
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.accent + '20',
  },
  splitText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    flex: 1,
  },
  splitItem: {
    fontWeight: '700',
    color: COLORS.accent,
  },
  // Error
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: '#e74c3c08',
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderColor: '#e74c3c20',
  },
  errorText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.danger,
    flex: 1,
  },
  // Component Header (for multi-food splits)
  componentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
    paddingBottom: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  componentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.accent,
  },
  componentLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
  },
  componentCount: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  // Searching state
  searchingState: {
    alignItems: 'center',
    paddingVertical: SPACING.xxxl * 2,
    gap: SPACING.md,
  },
  searchingText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  searchingSubtext: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  // No API results
  noApiResults: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    gap: SPACING.sm,
    marginHorizontal: SPACING.lg,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  noApiResultsText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  noApiResultsSubtext: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
  },
  // Section
  sectionContainer: {
    marginBottom: SPACING.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
  },
  localBadge: {
    backgroundColor: COLORS.borderLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },
  localBadgeText: {
    fontSize: 8,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
  },
  // Food Item
  foodItem: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.sm,
  },
  foodInfo: { flex: 1 },
  foodNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  foodName: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.text, flex: 1 },
  foodBrand: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.accent,
    fontWeight: '600',
    marginTop: 1,
  },
  foodMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  foodServing: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted },
  macroRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: SPACING.sm },
  macroTag: {
    fontSize: 9,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  foodActions: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginLeft: SPACING.sm,
  },
  qtyControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  qtyBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  qtyText: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.text, minWidth: 20, textAlign: 'center' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.sm,
  },
  addBtnText: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.white },
  // Source Badge
  sourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },
  sourceBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  // Confidence
  confidenceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  confidenceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  confidenceText: {
    fontSize: 9,
    fontWeight: '700',
  },
  // Empty
  emptyState: {
    alignItems: 'center',
    paddingVertical: SPACING.xxxl,
    gap: SPACING.sm,
  },
  emptyText: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.textSecondary },
  emptySubtext: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted },
  // Custom Form
  customForm: { padding: SPACING.lg },
  fieldGroup: { marginBottom: SPACING.lg },
  fieldLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldInput: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    height: 46,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.sm,
  },
  fieldRow: { flexDirection: 'row', gap: SPACING.md },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.lg,
    gap: SPACING.sm,
    ...SHADOWS.md,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.white },
});
