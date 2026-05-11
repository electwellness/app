// ============================================================
// Food Search Service
// ============================================================
// Connects to the food-search edge function which queries
// USDA FoodData Central and Open Food Facts APIs.
// Provides debounced search, caching, and recent foods tracking.
// ============================================================

import { supabase } from './supabase';

export interface FoodSuggestion {
  id: string;
  name: string;
  brand: string | null;
  source: 'USDA' | 'Open Food Facts';
  servingSize: string;
  servingWeight: number | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  confidence: number;
}

export interface BarcodeProduct {
  barcode: string;
  found: boolean;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  servingSize: string;
  servingWeight: number | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  ingredients: string | null;
  nutriscoreGrade: string | null;
  novaGroup: number | null;
  categories: string | null;
  source: 'Open Food Facts';
}

export interface FoodSearchResponse {
  query: string;
  components: string[];
  results: Record<string, FoodSuggestion[]>;
  totalResults: number;
  error?: string;
}

// Simple in-memory cache for search results
const searchCache = new Map<string, { data: FoodSearchResponse; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Recent foods storage
const RECENT_FOODS_KEY = '@recent_foods';
const MAX_RECENT_FOODS = 15;


// Storage helper
const storage = {
  async getItem(key: string): Promise<string | null> {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch (e) { /* ignore */ }
    return _memoryStore[key] || null;
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch (e) { /* ignore */ }
    _memoryStore[key] = value;
  },
};
const _memoryStore: Record<string, string> = {};

/**
 * Search for foods using USDA and Open Food Facts
 * Supports single foods, meals, partial phrases, and voice-like input
 */
export async function searchFoods(query: string): Promise<FoodSearchResponse> {
  const trimmed = query.trim();
  
  if (!trimmed || trimmed.length < 2) {
    return { query: trimmed, components: [], results: {}, totalResults: 0 };
  }

  // Check cache
  const cacheKey = trimmed.toLowerCase();
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const { data, error } = await supabase.functions.invoke('food-search', {
      body: { query: trimmed, action: 'search' },
    });

    if (error) {
      console.error('Food search error:', error);
      return { query: trimmed, components: [trimmed], results: {}, totalResults: 0, error: error.message };
    }

    const response: FoodSearchResponse = {
      query: data.query || trimmed,
      components: data.components || [trimmed],
      results: data.results || {},
      totalResults: data.totalResults || 0,
    };

    // Cache the result
    searchCache.set(cacheKey, { data: response, timestamp: Date.now() });

    return response;
  } catch (err: any) {
    console.error('Food search failed:', err);
    return { query: trimmed, components: [trimmed], results: {}, totalResults: 0, error: err.message };
  }
}

// Barcode lookup cache
const barcodeCache = new Map<string, { data: BarcodeProduct; timestamp: number }>();

/**
 * Look up a product by barcode (UPC/EAN) using Open Food Facts
 * Calls the food-search edge function with action: 'barcode'
 */
export async function lookupBarcode(barcode: string): Promise<BarcodeProduct> {
  const trimmed = barcode.trim();

  // Check cache
  const cached = barcodeCache.get(trimmed);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const { data, error } = await supabase.functions.invoke('food-search', {
      body: { barcode: trimmed, action: 'barcode' },
    });

    if (error) {
      console.error('Barcode lookup error:', error);
      return {
        barcode: trimmed,
        found: false,
        name: 'Unknown Product',
        brand: null,
        imageUrl: null,
        servingSize: '1 serving',
        servingWeight: null,
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fiber: 0,
        sugar: 0,
        sodium: 0,
        ingredients: null,
        nutriscoreGrade: null,
        novaGroup: null,
        categories: null,
        source: 'Open Food Facts',
      };
    }

    const product: BarcodeProduct = {
      barcode: data.barcode || trimmed,
      found: data.found ?? false,
      name: data.name || 'Unknown Product',
      brand: data.brand || null,
      imageUrl: data.imageUrl || null,
      servingSize: data.servingSize || '1 serving',
      servingWeight: data.servingWeight || null,
      calories: data.calories || 0,
      protein: data.protein || 0,
      carbs: data.carbs || 0,
      fat: data.fat || 0,
      fiber: data.fiber || 0,
      sugar: data.sugar || 0,
      sodium: data.sodium || 0,
      ingredients: data.ingredients || null,
      nutriscoreGrade: data.nutriscoreGrade || null,
      novaGroup: data.novaGroup || null,
      categories: data.categories || null,
      source: 'Open Food Facts',
    };

    // Cache the result
    barcodeCache.set(trimmed, { data: product, timestamp: Date.now() });

    return product;
  } catch (err: any) {
    console.error('Barcode lookup failed:', err);
    return {
      barcode: trimmed,
      found: false,
      name: 'Lookup Failed',
      brand: null,
      imageUrl: null,
      servingSize: '1 serving',
      servingWeight: null,
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
      sugar: 0,
      sodium: 0,
      ingredients: null,
      nutriscoreGrade: null,
      novaGroup: null,
      categories: null,
      source: 'Open Food Facts',
    };
  }
}

/**
 * Convert a BarcodeProduct to a FoodSuggestion for unified handling
 */
export function barcodeProductToSuggestion(product: BarcodeProduct): FoodSuggestion {
  return {
    id: `barcode_${product.barcode}`,
    name: product.name,
    brand: product.brand,
    source: 'Open Food Facts',
    servingSize: product.servingSize,
    servingWeight: product.servingWeight,
    calories: product.calories,
    protein: product.protein,
    carbs: product.carbs,
    fat: product.fat,
    fiber: product.fiber,
    sugar: product.sugar,
    sodium: product.sodium,
    confidence: product.found ? 1.0 : 0,
  };
}

/**
 * Get flat array of all suggestions from a search response
 */
export function flattenResults(response: FoodSearchResponse): { component: string; suggestions: FoodSuggestion[] }[] {
  return response.components.map(component => ({
    component,
    suggestions: response.results[component] || [],
  }));
}

/**
 * Save a food to recent foods list
 */
export async function addToRecentFoods(food: FoodSuggestion): Promise<void> {
  try {
    const stored = await storage.getItem(RECENT_FOODS_KEY);
    let recents: FoodSuggestion[] = stored ? JSON.parse(stored) : [];
    
    // Remove if already exists
    recents = recents.filter(f => f.id !== food.id);
    
    // Add to front
    recents.unshift(food);
    
    // Trim to max
    if (recents.length > MAX_RECENT_FOODS) {
      recents = recents.slice(0, MAX_RECENT_FOODS);
    }
    
    await storage.setItem(RECENT_FOODS_KEY, JSON.stringify(recents));
  } catch (e) {
    console.warn('Error saving recent food:', e);
  }
}

/**
 * Get recent foods
 */
export async function getRecentFoods(): Promise<FoodSuggestion[]> {
  try {
    const stored = await storage.getItem(RECENT_FOODS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.warn('Error loading recent foods:', e);
    return [];
  }
}

/**
 * Clear search cache
 */
export function clearSearchCache(): void {
  searchCache.clear();
}

/**
 * Get source display info
 */
export function getSourceInfo(source: 'USDA' | 'Open Food Facts'): {
  label: string;
  color: string;
  bgColor: string;
  icon: string;
} {
  if (source === 'USDA') {
    return {
      label: 'USDA',
      color: '#1a7a3a',
      bgColor: '#e8f5e9',
      icon: 'leaf-outline',
    };
  }
  return {
    label: 'OFF',
    color: '#e67e22',
    bgColor: '#fef3e2',
    icon: 'barcode-outline',
  };
}

/**
 * Format confidence score as percentage string
 */
export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

/**
 * Get confidence color
 */
export function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) return '#2ecc71';
  if (confidence >= 0.5) return '#f39c12';
  return '#e74c3c';
}
