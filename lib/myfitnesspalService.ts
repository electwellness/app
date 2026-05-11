// ============================================================
// MyFitnessPal API Integration Service
// ============================================================
// This service handles the connection to MyFitnessPal's API,
// including OAuth authentication, food diary sync, and
// nutrition data import into the Elect Wellness platform.
//
// MFP API endpoints (simulated with realistic data structures):
// - OAuth: /oauth2/authorize, /oauth2/token
// - Diary: /v2/diary/{date}
// - Nutrition: /v2/nutrition-summary/{date}
// - Foods: /v2/foods/search
// ============================================================

// Simple cross-platform storage helper (works on web + native)
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
  async removeItem(key: string): Promise<void> {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch (e) { /* ignore */ }
    delete _memoryStore[key];
  },
};
const _memoryStore: Record<string, string> = {};

const MFP_STORAGE_KEY = '@mfp_connection';
const MFP_DIARY_CACHE_KEY = '@mfp_diary_cache';

//

// ============================================================

export interface MFPConnection {
  connected: boolean;
  username: string;
  displayName: string;
  profileImageUrl: string;
  connectedAt: string;
  lastSyncAt: string | null;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: string;
  syncEnabled: boolean;
  autoSync: boolean;
  syncFrequency: 'realtime' | 'hourly' | 'daily';
}

export interface MFPDiaryEntry {
  id: string;
  name: string;
  brand: string | null;
  meal: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  servingSize: string;
  servings: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  cholesterol: number;
  saturatedFat: number;
  transFat: number;
  potassium: number;
  vitaminA: number;
  vitaminC: number;
  calcium: number;
  iron: number;
  verified: boolean;
}

export interface MFPDailySummary {
  date: string;
  entries: MFPDiaryEntry[];
  totals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    sugar: number;
    sodium: number;
  };
  goals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  exerciseCalories: number;
  netCalories: number;
  waterGlasses: number;
  streakDays: number;
}

export interface MFPFoodSearchResult {
  id: string;
  name: string;
  brand: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  servingSize: string;
  verified: boolean;
}

export interface MFPWeeklySummary {
  days: Array<{
    date: string;
    dayName: string;
    calories: number;
    calorieGoal: number;
    protein: number;
    carbs: number;
    fat: number;
    entryCount: number;
    synced: boolean;
  }>;
  averages: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  adherenceScore: number;
  streakDays: number;
}

// ============================================================
// MOCK DATA GENERATORS
// ============================================================

function generateMFPDiary(date: string): MFPDailySummary {
  const breakfastItems: MFPDiaryEntry[] = [
    {
      id: `mfp-${date}-b1`,
      name: 'Egg Whites',
      brand: 'Kirkland Signature',
      meal: 'breakfast',
      servingSize: '3 tbsp (46g)',
      servings: 4,
      calories: 100,
      protein: 20,
      carbs: 0,
      fat: 0,
      fiber: 0,
      sugar: 0,
      sodium: 320,
      cholesterol: 0,
      saturatedFat: 0,
      transFat: 0,
      potassium: 0,
      vitaminA: 0,
      vitaminC: 0,
      calcium: 0,
      iron: 0,
      verified: true,
    },
    {
      id: `mfp-${date}-b2`,
      name: 'Ezekiel 4:9 Sprouted Bread',
      brand: 'Food For Life',
      meal: 'breakfast',
      servingSize: '1 slice (34g)',
      servings: 2,
      calories: 160,
      protein: 8,
      carbs: 30,
      fat: 1,
      fiber: 6,
      sugar: 0,
      sodium: 150,
      cholesterol: 0,
      saturatedFat: 0,
      transFat: 0,
      potassium: 0,
      vitaminA: 0,
      vitaminC: 0,
      calcium: 0,
      iron: 8,
      verified: true,
    },
    {
      id: `mfp-${date}-b3`,
      name: 'Avocado',
      brand: null,
      meal: 'breakfast',
      servingSize: '1/3 medium (50g)',
      servings: 1,
      calories: 80,
      protein: 1,
      carbs: 4,
      fat: 7,
      fiber: 3,
      sugar: 0,
      sodium: 4,
      cholesterol: 0,
      saturatedFat: 1,
      transFat: 0,
      potassium: 250,
      vitaminA: 0,
      vitaminC: 6,
      calcium: 0,
      iron: 2,
      verified: true,
    },
  ];

  const lunchItems: MFPDiaryEntry[] = [
    {
      id: `mfp-${date}-l1`,
      name: 'Grilled Chicken Breast',
      brand: null,
      meal: 'lunch',
      servingSize: '6 oz (170g)',
      servings: 1,
      calories: 280,
      protein: 53,
      carbs: 0,
      fat: 6,
      fiber: 0,
      sugar: 0,
      sodium: 120,
      cholesterol: 130,
      saturatedFat: 2,
      transFat: 0,
      potassium: 450,
      vitaminA: 0,
      vitaminC: 0,
      calcium: 2,
      iron: 6,
      verified: true,
    },
    {
      id: `mfp-${date}-l2`,
      name: 'Jasmine Rice',
      brand: 'Mahatma',
      meal: 'lunch',
      servingSize: '1 cup cooked (186g)',
      servings: 1,
      calories: 210,
      protein: 4,
      carbs: 46,
      fat: 0.5,
      fiber: 1,
      sugar: 0,
      sodium: 0,
      cholesterol: 0,
      saturatedFat: 0,
      transFat: 0,
      potassium: 55,
      vitaminA: 0,
      vitaminC: 0,
      calcium: 2,
      iron: 15,
      verified: true,
    },
    {
      id: `mfp-${date}-l3`,
      name: 'Steamed Broccoli',
      brand: null,
      meal: 'lunch',
      servingSize: '1 cup (156g)',
      servings: 1.5,
      calories: 52,
      protein: 5,
      carbs: 10,
      fat: 0.5,
      fiber: 5,
      sugar: 3,
      sodium: 48,
      cholesterol: 0,
      saturatedFat: 0,
      transFat: 0,
      potassium: 460,
      vitaminA: 12,
      vitaminC: 135,
      calcium: 6,
      iron: 6,
      verified: true,
    },
  ];

  const dinnerItems: MFPDiaryEntry[] = [
    {
      id: `mfp-${date}-d1`,
      name: 'Atlantic Salmon Fillet',
      brand: 'Wild Caught',
      meal: 'dinner',
      servingSize: '6 oz (170g)',
      servings: 1,
      calories: 350,
      protein: 39,
      carbs: 0,
      fat: 20,
      fiber: 0,
      sugar: 0,
      sodium: 75,
      cholesterol: 94,
      saturatedFat: 4,
      transFat: 0,
      potassium: 628,
      vitaminA: 0,
      vitaminC: 0,
      calcium: 2,
      iron: 4,
      verified: true,
    },
    {
      id: `mfp-${date}-d2`,
      name: 'Sweet Potato',
      brand: null,
      meal: 'dinner',
      servingSize: '1 medium (130g)',
      servings: 1,
      calories: 112,
      protein: 2,
      carbs: 26,
      fat: 0,
      fiber: 4,
      sugar: 5,
      sodium: 72,
      cholesterol: 0,
      saturatedFat: 0,
      transFat: 0,
      potassium: 438,
      vitaminA: 120,
      vitaminC: 22,
      calcium: 4,
      iron: 4,
      verified: true,
    },
    {
      id: `mfp-${date}-d3`,
      name: 'Mixed Green Salad w/ Olive Oil',
      brand: null,
      meal: 'dinner',
      servingSize: '2 cups + 1 tbsp oil',
      servings: 1,
      calories: 145,
      protein: 2,
      carbs: 6,
      fat: 14,
      fiber: 3,
      sugar: 2,
      sodium: 25,
      cholesterol: 0,
      saturatedFat: 2,
      transFat: 0,
      potassium: 200,
      vitaminA: 45,
      vitaminC: 15,
      calcium: 4,
      iron: 6,
      verified: false,
    },
  ];

  const snackItems: MFPDiaryEntry[] = [
    {
      id: `mfp-${date}-s1`,
      name: 'Gold Standard 100% Whey',
      brand: 'Optimum Nutrition',
      meal: 'snack',
      servingSize: '1 scoop (31g)',
      servings: 1,
      calories: 120,
      protein: 24,
      carbs: 3,
      fat: 1.5,
      fiber: 0,
      sugar: 1,
      sodium: 130,
      cholesterol: 35,
      saturatedFat: 0.5,
      transFat: 0,
      potassium: 160,
      vitaminA: 0,
      vitaminC: 0,
      calcium: 10,
      iron: 0,
      verified: true,
    },
    {
      id: `mfp-${date}-s2`,
      name: 'Raw Almonds',
      brand: 'Blue Diamond',
      meal: 'snack',
      servingSize: '1 oz (28g)',
      servings: 1,
      calories: 170,
      protein: 6,
      carbs: 6,
      fat: 15,
      fiber: 4,
      sugar: 1,
      sodium: 0,
      cholesterol: 0,
      saturatedFat: 1,
      transFat: 0,
      potassium: 200,
      vitaminA: 0,
      vitaminC: 0,
      calcium: 8,
      iron: 6,
      verified: true,
    },
    {
      id: `mfp-${date}-s3`,
      name: 'Greek Yogurt, Plain Nonfat',
      brand: 'Fage',
      meal: 'snack',
      servingSize: '1 container (170g)',
      servings: 1,
      calories: 90,
      protein: 18,
      carbs: 5,
      fat: 0,
      fiber: 0,
      sugar: 5,
      sodium: 65,
      cholesterol: 10,
      saturatedFat: 0,
      transFat: 0,
      potassium: 240,
      vitaminA: 0,
      vitaminC: 0,
      calcium: 15,
      iron: 0,
      verified: true,
    },
  ];

  const allEntries = [...breakfastItems, ...lunchItems, ...dinnerItems, ...snackItems];

  const totals = allEntries.reduce(
    (acc, e) => ({
      calories: acc.calories + e.calories,
      protein: acc.protein + e.protein,
      carbs: acc.carbs + e.carbs,
      fat: acc.fat + e.fat,
      fiber: acc.fiber + e.fiber,
      sugar: acc.sugar + e.sugar,
      sodium: acc.sodium + e.sodium,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 }
  );

  return {
    date,
    entries: allEntries,
    totals,
    goals: {
      calories: 2400,
      protein: 200,
      carbs: 250,
      fat: 80,
    },
    exerciseCalories: 320,
    netCalories: totals.calories - 320,
    waterGlasses: 8,
    streakDays: 14,
  };
}

function generateWeeklySummary(): MFPWeeklySummary {
  const days: MFPWeeklySummary['days'] = [];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const baseCals = 1800 + Math.floor(Math.random() * 600);
    const protein = 150 + Math.floor(Math.random() * 60);
    const carbs = 180 + Math.floor(Math.random() * 80);
    const fat = 55 + Math.floor(Math.random() * 30);

    days.push({
      date: dateStr,
      dayName: dayNames[d.getDay()],
      calories: baseCals,
      calorieGoal: 2400,
      protein,
      carbs,
      fat,
      entryCount: 8 + Math.floor(Math.random() * 6),
      synced: i > 0, // today not yet synced
    });
  }

  const avgCals = Math.round(days.reduce((s, d) => s + d.calories, 0) / days.length);
  const avgProtein = Math.round(days.reduce((s, d) => s + d.protein, 0) / days.length);
  const avgCarbs = Math.round(days.reduce((s, d) => s + d.carbs, 0) / days.length);
  const avgFat = Math.round(days.reduce((s, d) => s + d.fat, 0) / days.length);

  return {
    days,
    averages: { calories: avgCals, protein: avgProtein, carbs: avgCarbs, fat: avgFat },
    adherenceScore: 85 + Math.floor(Math.random() * 12),
    streakDays: 14,
  };
}

// ============================================================
// CONNECTION MANAGEMENT
// ============================================================

const DEFAULT_CONNECTION: MFPConnection | null = null;

let _cachedConnection: MFPConnection | null | undefined = undefined;

export async function getMFPConnection(): Promise<MFPConnection | null> {
  if (_cachedConnection !== undefined) return _cachedConnection;

  try {
    const stored = await storage.getItem(MFP_STORAGE_KEY);
    if (stored) {
      _cachedConnection = JSON.parse(stored);
      return _cachedConnection!;
    }
  } catch (e) {
    console.warn('Error reading MFP connection:', e);
  }
  _cachedConnection = null;
  return null;
}


export async function connectMFP(username: string): Promise<{
  connection: MFPConnection | null;
  error: string | null;
}> {
  // Simulate OAuth flow delay
  await new Promise(resolve => setTimeout(resolve, 1500));

  if (!username.trim()) {
    return { connection: null, error: 'Please enter your MyFitnessPal username' };
  }

  const connection: MFPConnection = {
    connected: true,
    username: username.trim(),
    displayName: username.trim().charAt(0).toUpperCase() + username.trim().slice(1),
    profileImageUrl: 'https://d64gsuwffb70l.cloudfront.net/698cf5ddf668ea6c9d214f89_1771888233321_84060e3e.jpg',
    connectedAt: new Date().toISOString(),
    lastSyncAt: null,
    accessToken: 'mfp_' + Math.random().toString(36).substring(2, 15),
    refreshToken: 'mfp_ref_' + Math.random().toString(36).substring(2, 15),
    tokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    syncEnabled: true,
    autoSync: true,
    syncFrequency: 'hourly',
  };

  try {
    await storage.setItem(MFP_STORAGE_KEY, JSON.stringify(connection));
    _cachedConnection = connection;
  } catch (e) {
    console.warn('Error saving MFP connection:', e);
  }

  return { connection, error: null };
}


export async function disconnectMFP(): Promise<void> {
  try {
    await storage.removeItem(MFP_STORAGE_KEY);
    await storage.removeItem(MFP_DIARY_CACHE_KEY);
    _cachedConnection = null;
  } catch (e) {
    console.warn('Error removing MFP connection:', e);
  }
}

export async function updateMFPSyncSettings(
  settings: Partial<Pick<MFPConnection, 'autoSync' | 'syncFrequency' | 'syncEnabled'>>
): Promise<MFPConnection | null> {
  const conn = await getMFPConnection();
  if (!conn) return null;

  const updated = { ...conn, ...settings };
  try {
    await storage.setItem(MFP_STORAGE_KEY, JSON.stringify(updated));
    _cachedConnection = updated;
  } catch (e) {
    console.warn('Error updating MFP settings:', e);
  }
  return updated;
}


// ============================================================
// DATA FETCHING (Simulated API calls)
// ============================================================

export async function fetchMFPDiary(date: string): Promise<{
  data: MFPDailySummary | null;
  error: string | null;
}> {
  const conn = await getMFPConnection();
  if (!conn?.connected) {
    return { data: null, error: 'Not connected to MyFitnessPal' };
  }

  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 800));

  const diary = generateMFPDiary(date);
  return { data: diary, error: null };
}

export async function fetchMFPWeeklySummary(): Promise<{
  data: MFPWeeklySummary | null;
  error: string | null;
}> {
  const conn = await getMFPConnection();
  if (!conn?.connected) {
    return { data: null, error: 'Not connected to MyFitnessPal' };
  }

  await new Promise(resolve => setTimeout(resolve, 600));

  const summary = generateWeeklySummary();
  return { data: summary, error: null };
}

export async function searchMFPFoods(query: string): Promise<{
  data: MFPFoodSearchResult[];
  error: string | null;
}> {
  const conn = await getMFPConnection();
  if (!conn?.connected) {
    return { data: [], error: 'Not connected to MyFitnessPal' };
  }

  await new Promise(resolve => setTimeout(resolve, 500));

  // Simulate search results based on query
  const allFoods: MFPFoodSearchResult[] = [
    { id: 'mfp-f1', name: 'Chicken Breast, Grilled', brand: null, calories: 165, protein: 31, carbs: 0, fat: 3.6, servingSize: '4 oz (113g)', verified: true },
    { id: 'mfp-f2', name: 'Brown Rice, Cooked', brand: 'Uncle Ben\'s', calories: 215, protein: 5, carbs: 45, fat: 1.8, servingSize: '1 cup (195g)', verified: true },
    { id: 'mfp-f3', name: 'Salmon, Atlantic Wild', brand: null, calories: 233, protein: 25, carbs: 0, fat: 14, servingSize: '4 oz (113g)', verified: true },
    { id: 'mfp-f4', name: 'Greek Yogurt, Plain 0%', brand: 'Fage', calories: 90, protein: 18, carbs: 5, fat: 0, servingSize: '170g', verified: true },
    { id: 'mfp-f5', name: 'Banana', brand: null, calories: 105, protein: 1.3, carbs: 27, fat: 0.4, servingSize: '1 medium (118g)', verified: true },
    { id: 'mfp-f6', name: 'Whey Protein Isolate', brand: 'Optimum Nutrition', calories: 120, protein: 24, carbs: 3, fat: 1.5, servingSize: '1 scoop (31g)', verified: true },
    { id: 'mfp-f7', name: 'Oatmeal, Rolled Oats', brand: 'Quaker', calories: 150, protein: 5, carbs: 27, fat: 3, servingSize: '1/2 cup dry (40g)', verified: true },
    { id: 'mfp-f8', name: 'Avocado', brand: null, calories: 234, protein: 2.9, carbs: 12, fat: 21, servingSize: '1 whole (150g)', verified: true },
    { id: 'mfp-f9', name: 'Sweet Potato, Baked', brand: null, calories: 103, protein: 2.3, carbs: 24, fat: 0.1, servingSize: '1 medium (130g)', verified: true },
    { id: 'mfp-f10', name: 'Almonds, Raw', brand: 'Blue Diamond', calories: 170, protein: 6, carbs: 6, fat: 15, servingSize: '1 oz (28g)', verified: true },
    { id: 'mfp-f11', name: 'Egg, Whole Large', brand: null, calories: 72, protein: 6, carbs: 0.4, fat: 5, servingSize: '1 large (50g)', verified: true },
    { id: 'mfp-f12', name: 'Broccoli, Steamed', brand: null, calories: 55, protein: 3.7, carbs: 11, fat: 0.6, servingSize: '1 cup (156g)', verified: true },
  ];

  if (!query.trim()) return { data: allFoods, error: null };

  const q = query.toLowerCase();
  const filtered = allFoods.filter(
    f => f.name.toLowerCase().includes(q) || (f.brand && f.brand.toLowerCase().includes(q))
  );

  return { data: filtered, error: null };
}

export async function syncMFPToJournal(
  date: string
): Promise<{
  imported: number;
  error: string | null;
}> {
  const conn = await getMFPConnection();
  if (!conn?.connected) {
    return { imported: 0, error: 'Not connected to MyFitnessPal' };
  }

  // Simulate sync delay
  await new Promise(resolve => setTimeout(resolve, 1200));

  // Update last sync time
  const updated = { ...conn, lastSyncAt: new Date().toISOString() };
  try {
    await storage.setItem(MFP_STORAGE_KEY, JSON.stringify(updated));
    _cachedConnection = updated;
  } catch (e) {
    console.warn('Error updating sync time:', e);
  }

  // Return count of simulated imported entries
  return { imported: 12, error: null };
}

// ============================================================
// UTILITY
// ============================================================

export function formatMFPSyncTime(isoString: string | null): string {
  if (!isoString) return 'Never';
  const d = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const MFP_BRAND = {
  color: '#0070C0',
  colorLight: '#E6F2FA',
  colorDark: '#005A9E',
  name: 'MyFitnessPal',
  icon: 'https://d64gsuwffb70l.cloudfront.net/698cf5ddf668ea6c9d214f89_1771888233321_84060e3e.jpg',
};
