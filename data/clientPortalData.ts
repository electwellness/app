// Client Portal Data - Membership, Biometrics, Sessions, Food Journal

export interface MembershipInfo {
  plan: string;
  status: 'active' | 'paused' | 'expired';
  startDate: string;
  renewalDate: string;
  monthlyRate: number;
  franchise: string;
  trainer: string;
  trainerAvatar: string;
  sessionsPerMonth: number;
  nutritionCoaching: boolean;
  healthEducation: boolean;
  memberSince: string;
  totalInvested: number;
}

export interface SessionRecord {
  id: string;
  date: string;
  time: string;
  type: 'training' | 'nutrition' | 'education';
  trainer: string;
  duration: number; // minutes
  status: 'completed' | 'upcoming' | 'cancelled' | 'no-show';
  notes?: string;
  rating?: number;
}

export interface BiometricEntry {
  date: string;
  height: number;
  weight: number;
  bodyFat: number;
  muscleMassPct: number;
  muscleMass: number;
  bmi: number;
  leanMusclePct: number;
  fatMass: number;
  leanMuscleMass: number;
  massPerMuscleLb: number;
  visceralFat: number;
  navelWaist: number;
  widestWaist: number;
  narrowestWaist: number;
  shoulders: number;
  sideHip: number;
  rearHip: number;
  bicep: number;
  calf: number;
  waist: number;
  chest: number;
  hips: number;
  arms: number;
  thighs: number;
  restingHR: number;
  bloodPressureSys: number;
  bloodPressureDia: number;
  heartRate: number;
  bodyAge: number;

  flexibility: number;
  gripStrength: number;
  notes?: string;
}



// Helper to compute derived body composition fields
// muscleMassPct is a manual input; if provided, muscleMass = weight * (muscleMassPct / 100)
export function computeBodyCompFields(weight: number, bodyFat: number, muscleMassPct?: number): {
  leanMusclePct: number;
  fatMass: number;
  leanMuscleMass: number;
  muscleMass: number;
  massPerMuscleLb: number;
  bmi?: undefined; // BMI needs height, computed separately
} {
  if (!weight || !bodyFat) {
    return { leanMusclePct: 0, fatMass: 0, leanMuscleMass: 0, muscleMass: 0, massPerMuscleLb: 0 };
  }
  const leanMusclePct = parseFloat((100 - bodyFat).toFixed(1));
  const fatMass = parseFloat((weight * (bodyFat / 100)).toFixed(1));
  const leanMuscleMass = parseFloat((weight - fatMass).toFixed(1));
  // Muscle Mass = Total Weight × Muscle Mass %
  const muscleMass = (muscleMassPct && muscleMassPct > 0)
    ? parseFloat((weight * (muscleMassPct / 100)).toFixed(1))
    : 0;
  const massPerMuscleLb = muscleMass > 0 ? parseFloat((weight / muscleMass).toFixed(2)) : 0;
  return { leanMusclePct, fatMass, leanMuscleMass, muscleMass, massPerMuscleLb };
}





export interface FoodEntry {
  id: string;
  date: string;
  time: string;
  meal: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  servingSize: string;
}

export interface DailyNutritionGoal {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  water: number; // glasses
}

export const membershipInfo: MembershipInfo = {
  plan: 'Premium Personal Training',
  status: 'active',
  startDate: '2025-06-15',
  renewalDate: '2026-06-15',
  monthlyRate: 349,
  franchise: 'Collin County',

  trainer: 'Marcus Rivera',
  trainerAvatar: 'https://d64gsuwffb70l.cloudfront.net/698cf5ddf668ea6c9d214f89_1770845766651_5d2978e7.png',
  sessionsPerMonth: 12,
  nutritionCoaching: true,
  healthEducation: true,
  memberSince: '2025-06-15',
  totalInvested: 2792,
};

export const sessionRecords: SessionRecord[] = [
  { id: 's1', date: '2026-02-11', time: '7:00 AM', type: 'training', trainer: 'Marcus Rivera', duration: 60, status: 'completed', notes: 'Upper body focus - increased bench press by 10lbs', rating: 5 },
  { id: 's2', date: '2026-02-10', time: '6:30 AM', type: 'training', trainer: 'Marcus Rivera', duration: 60, status: 'completed', notes: 'Leg day - PR on squats at 225lbs', rating: 5 },
  { id: 's3', date: '2026-02-09', time: '10:00 AM', type: 'nutrition', trainer: 'Marcus Rivera', duration: 30, status: 'completed', notes: 'Meal plan review - adjusted macros for cutting phase' },
  { id: 's4', date: '2026-02-07', time: '7:00 AM', type: 'training', trainer: 'Marcus Rivera', duration: 60, status: 'completed', notes: 'Full body circuit training', rating: 4 },
  { id: 's5', date: '2026-02-06', time: '6:30 AM', type: 'training', trainer: 'Marcus Rivera', duration: 60, status: 'completed', notes: 'Core and cardio session', rating: 4 },
  { id: 's6', date: '2026-02-05', time: '2:00 PM', type: 'education', trainer: 'Marcus Rivera', duration: 45, status: 'completed', notes: 'Sleep optimization and recovery strategies' },
  { id: 's7', date: '2026-02-04', time: '7:00 AM', type: 'training', trainer: 'Marcus Rivera', duration: 60, status: 'cancelled', notes: 'Client cancelled - rescheduled' },
  { id: 's8', date: '2026-02-03', time: '6:30 AM', type: 'training', trainer: 'Marcus Rivera', duration: 60, status: 'completed', notes: 'Push/Pull split - great form improvement', rating: 5 },
  { id: 's9', date: '2026-02-13', time: '7:00 AM', type: 'training', trainer: 'Marcus Rivera', duration: 60, status: 'upcoming', notes: 'Upper body - progressive overload' },
  { id: 's10', date: '2026-02-14', time: '6:30 AM', type: 'training', trainer: 'Marcus Rivera', duration: 60, status: 'upcoming' },
  { id: 's11', date: '2026-02-15', time: '10:00 AM', type: 'nutrition', trainer: 'Marcus Rivera', duration: 30, status: 'upcoming', notes: 'Weekly check-in' },
  { id: 's12', date: '2026-02-17', time: '7:00 AM', type: 'training', trainer: 'Marcus Rivera', duration: 60, status: 'upcoming' },
  { id: 's13', date: '2026-02-18', time: '6:30 AM', type: 'training', trainer: 'Marcus Rivera', duration: 60, status: 'upcoming' },
  { id: 's14', date: '2026-02-20', time: '7:00 AM', type: 'training', trainer: 'Marcus Rivera', duration: 60, status: 'upcoming' },
  { id: 's15', date: '2026-01-28', time: '7:00 AM', type: 'training', trainer: 'Marcus Rivera', duration: 60, status: 'completed', rating: 4 },
  { id: 's16', date: '2026-01-27', time: '6:30 AM', type: 'training', trainer: 'Marcus Rivera', duration: 60, status: 'completed', rating: 5 },
  { id: 's17', date: '2026-01-25', time: '10:00 AM', type: 'education', trainer: 'Marcus Rivera', duration: 45, status: 'completed', notes: 'Stress management techniques' },
  { id: 's18', date: '2026-01-24', time: '7:00 AM', type: 'training', trainer: 'Marcus Rivera', duration: 60, status: 'completed', rating: 4 },
  { id: 's19', date: '2026-01-22', time: '7:00 AM', type: 'training', trainer: 'Marcus Rivera', duration: 60, status: 'no-show' },
  { id: 's20', date: '2026-01-20', time: '6:30 AM', type: 'training', trainer: 'Marcus Rivera', duration: 60, status: 'completed', rating: 5 },
];

// Raw mock data - computed fields are auto-populated via computeBodyCompFields
// muscleMassPct is a manual input field representing the muscle mass percentage from body composition scan
const rawBiometricHistory = [
  { date: '2025-06-15', height: 72, weight: 218, bodyFat: 28.5, muscleMassPct: 42.0, visceralFat: 14, navelWaist: 39, widestWaist: 40, narrowestWaist: 36, shoulders: 48, sideHip: 43, rearHip: 44, bicep: 13.5, calf: 15, waist: 38, chest: 44, hips: 42, arms: 14.5, thighs: 24, restingHR: 78, bloodPressureSys: 138, bloodPressureDia: 88, heartRate: 82, flexibility: 12, gripStrength: 85 },
  { date: '2025-07-15', height: 72, weight: 214, bodyFat: 27.2, muscleMassPct: 42.5, visceralFat: 13, navelWaist: 38.5, widestWaist: 39.5, narrowestWaist: 35.5, shoulders: 48, sideHip: 42.5, rearHip: 43.5, bicep: 13.5, calf: 15, waist: 37.5, chest: 44, hips: 41.5, arms: 14.5, thighs: 24, restingHR: 76, bloodPressureSys: 135, bloodPressureDia: 86, heartRate: 80, flexibility: 13, gripStrength: 88 },
  { date: '2025-08-15', height: 72, weight: 210, bodyFat: 25.8, muscleMassPct: 43.2, visceralFat: 12, navelWaist: 38, widestWaist: 39, narrowestWaist: 35, shoulders: 48.2, sideHip: 42, rearHip: 43, bicep: 13.8, calf: 15.2, waist: 37, chest: 43.5, hips: 41, arms: 14.8, thighs: 24.2, restingHR: 74, bloodPressureSys: 132, bloodPressureDia: 84, heartRate: 78, flexibility: 14, gripStrength: 92 },
  { date: '2025-09-15', height: 72, weight: 206, bodyFat: 24.1, muscleMassPct: 43.8, visceralFat: 11, navelWaist: 37, widestWaist: 38, narrowestWaist: 34, shoulders: 48.5, sideHip: 41.5, rearHip: 42, bicep: 14, calf: 15.3, waist: 36, chest: 43, hips: 40.5, arms: 15, thighs: 24.5, restingHR: 72, bloodPressureSys: 128, bloodPressureDia: 82, heartRate: 76, flexibility: 15, gripStrength: 95 },
  { date: '2025-10-15', height: 72, weight: 203, bodyFat: 22.8, muscleMassPct: 44.5, visceralFat: 10, navelWaist: 36.5, widestWaist: 37.5, narrowestWaist: 33.5, shoulders: 48.8, sideHip: 41, rearHip: 41.5, bicep: 14.2, calf: 15.5, waist: 35.5, chest: 43, hips: 40, arms: 15.2, thighs: 24.8, restingHR: 70, bloodPressureSys: 126, bloodPressureDia: 80, heartRate: 74, flexibility: 16, gripStrength: 98 },
  { date: '2025-11-15', height: 72, weight: 200, bodyFat: 21.5, muscleMassPct: 45.2, visceralFat: 9, navelWaist: 36, widestWaist: 37, narrowestWaist: 33, shoulders: 49, sideHip: 40.5, rearHip: 41, bicep: 14.5, calf: 15.6, waist: 35, chest: 42.5, hips: 39.5, arms: 15.5, thighs: 25, restingHR: 68, bloodPressureSys: 124, bloodPressureDia: 78, heartRate: 72, flexibility: 17, gripStrength: 100 },
  { date: '2025-12-15', height: 72, weight: 197, bodyFat: 20.3, muscleMassPct: 45.8, visceralFat: 8, navelWaist: 35.5, widestWaist: 36.5, narrowestWaist: 32.5, shoulders: 49.2, sideHip: 40, rearHip: 40.5, bicep: 14.8, calf: 15.8, waist: 34.5, chest: 42.5, hips: 39, arms: 15.5, thighs: 25.2, restingHR: 66, bloodPressureSys: 122, bloodPressureDia: 76, heartRate: 70, flexibility: 18, gripStrength: 102 },
  { date: '2026-01-15', height: 72, weight: 194, bodyFat: 19.2, muscleMassPct: 46.5, visceralFat: 7, navelWaist: 35, widestWaist: 36, narrowestWaist: 32, shoulders: 49.5, sideHip: 39.5, rearHip: 40, bicep: 15, calf: 16, waist: 34, chest: 42, hips: 38.5, arms: 15.8, thighs: 25.5, restingHR: 64, bloodPressureSys: 120, bloodPressureDia: 76, heartRate: 68, flexibility: 19, gripStrength: 105 },
  { date: '2026-02-11', height: 72, weight: 191, bodyFat: 18.1, muscleMassPct: 47.0, visceralFat: 6, navelWaist: 34.5, widestWaist: 35.5, narrowestWaist: 31.5, shoulders: 49.8, sideHip: 39, rearHip: 39.5, bicep: 15.2, calf: 16.2, waist: 33.5, chest: 42, hips: 38, arms: 16, thighs: 25.8, restingHR: 62, bloodPressureSys: 118, bloodPressureDia: 74, heartRate: 66, flexibility: 20, gripStrength: 108 },

];

// Auto-compute BMI and body composition derived fields for mock data
function calculateBMIMock(weight: number, height: number): number {
  if (!weight || !height) return 0;
  return parseFloat(((weight / (height * height)) * 703).toFixed(1));
}

export const biometricHistory: BiometricEntry[] = rawBiometricHistory.map(entry => {
  const comp = computeBodyCompFields(entry.weight, entry.bodyFat, entry.muscleMassPct);
  return {
    ...entry,
    bmi: calculateBMIMock(entry.weight, entry.height),
    muscleMass: comp.muscleMass,
    leanMusclePct: comp.leanMusclePct,
    fatMass: comp.fatMass,
    leanMuscleMass: comp.leanMuscleMass,
    massPerMuscleLb: comp.massPerMuscleLb,
  };
});





export const todaysFoodLog: FoodEntry[] = [
  { id: 'f1', date: '2026-02-11', time: '6:30 AM', meal: 'breakfast', name: 'Egg White Omelette w/ Spinach', calories: 280, protein: 32, carbs: 8, fat: 12, fiber: 3, sugar: 2, sodium: 380, servingSize: '3 eggs + veggies' },
  { id: 'f2', date: '2026-02-11', time: '6:30 AM', meal: 'breakfast', name: 'Whole Grain Toast', calories: 130, protein: 5, carbs: 24, fat: 2, fiber: 4, sugar: 3, sodium: 180, servingSize: '2 slices' },
  { id: 'f3', date: '2026-02-11', time: '6:30 AM', meal: 'breakfast', name: 'Black Coffee', calories: 5, protein: 0, carbs: 1, fat: 0, fiber: 0, sugar: 0, sodium: 5, servingSize: '12 oz' },
  { id: 'f4', date: '2026-02-11', time: '9:30 AM', meal: 'snack', name: 'Greek Yogurt w/ Berries', calories: 180, protein: 18, carbs: 22, fat: 4, fiber: 2, sugar: 14, sodium: 65, servingSize: '1 cup' },
  { id: 'f5', date: '2026-02-11', time: '9:30 AM', meal: 'snack', name: 'Almonds', calories: 160, protein: 6, carbs: 6, fat: 14, fiber: 3, sugar: 1, sodium: 0, servingSize: '1 oz (23 almonds)' },
  { id: 'f6', date: '2026-02-11', time: '12:30 PM', meal: 'lunch', name: 'Grilled Chicken Breast', calories: 320, protein: 48, carbs: 0, fat: 12, fiber: 0, sugar: 0, sodium: 280, servingSize: '8 oz' },
  { id: 'f7', date: '2026-02-11', time: '12:30 PM', meal: 'lunch', name: 'Brown Rice', calories: 215, protein: 5, carbs: 45, fat: 2, fiber: 3, sugar: 0, sodium: 10, servingSize: '1 cup cooked' },
  { id: 'f8', date: '2026-02-11', time: '12:30 PM', meal: 'lunch', name: 'Mixed Green Salad', calories: 85, protein: 3, carbs: 12, fat: 4, fiber: 4, sugar: 3, sodium: 120, servingSize: '2 cups w/ dressing' },
  { id: 'f9', date: '2026-02-11', time: '3:30 PM', meal: 'snack', name: 'Protein Shake', calories: 240, protein: 30, carbs: 18, fat: 5, fiber: 2, sugar: 6, sodium: 200, servingSize: '1 scoop + milk' },
  { id: 'f10', date: '2026-02-11', time: '6:30 PM', meal: 'dinner', name: 'Baked Salmon', calories: 350, protein: 40, carbs: 0, fat: 20, fiber: 0, sugar: 0, sodium: 320, servingSize: '6 oz fillet' },
  { id: 'f11', date: '2026-02-11', time: '6:30 PM', meal: 'dinner', name: 'Sweet Potato', calories: 180, protein: 4, carbs: 41, fat: 0, fiber: 6, sugar: 12, sodium: 70, servingSize: '1 medium' },
  { id: 'f12', date: '2026-02-11', time: '6:30 PM', meal: 'dinner', name: 'Steamed Broccoli', calories: 55, protein: 4, carbs: 10, fat: 1, fiber: 5, sugar: 2, sodium: 30, servingSize: '1.5 cups' },
];

export const weeklyFoodLog: FoodEntry[] = [
  // Yesterday
  { id: 'fy1', date: '2026-02-10', time: '7:00 AM', meal: 'breakfast', name: 'Protein Pancakes', calories: 340, protein: 28, carbs: 38, fat: 8, fiber: 4, sugar: 8, sodium: 420, servingSize: '3 pancakes' },
  { id: 'fy2', date: '2026-02-10', time: '10:00 AM', meal: 'snack', name: 'Apple + Peanut Butter', calories: 260, protein: 8, carbs: 30, fat: 14, fiber: 5, sugar: 18, sodium: 120, servingSize: '1 apple + 2 tbsp' },
  { id: 'fy3', date: '2026-02-10', time: '1:00 PM', meal: 'lunch', name: 'Turkey Wrap', calories: 420, protein: 35, carbs: 42, fat: 14, fiber: 6, sugar: 4, sodium: 680, servingSize: '1 large wrap' },
  { id: 'fy4', date: '2026-02-10', time: '4:00 PM', meal: 'snack', name: 'Cottage Cheese + Pineapple', calories: 200, protein: 22, carbs: 18, fat: 4, fiber: 1, sugar: 14, sodium: 380, servingSize: '1 cup' },
  { id: 'fy5', date: '2026-02-10', time: '7:00 PM', meal: 'dinner', name: 'Lean Beef Stir Fry', calories: 480, protein: 42, carbs: 35, fat: 18, fiber: 6, sugar: 8, sodium: 720, servingSize: '2 cups' },
  // 2 days ago
  { id: 'fd1', date: '2026-02-09', time: '6:30 AM', meal: 'breakfast', name: 'Overnight Oats', calories: 380, protein: 18, carbs: 52, fat: 12, fiber: 8, sugar: 16, sodium: 180, servingSize: '1.5 cups' },
  { id: 'fd2', date: '2026-02-09', time: '12:00 PM', meal: 'lunch', name: 'Tuna Salad Bowl', calories: 390, protein: 38, carbs: 28, fat: 16, fiber: 5, sugar: 4, sodium: 580, servingSize: '1 large bowl' },
  { id: 'fd3', date: '2026-02-09', time: '3:00 PM', meal: 'snack', name: 'Protein Bar', calories: 210, protein: 20, carbs: 24, fat: 8, fiber: 3, sugar: 6, sodium: 200, servingSize: '1 bar' },
  { id: 'fd4', date: '2026-02-09', time: '6:30 PM', meal: 'dinner', name: 'Grilled Shrimp + Quinoa', calories: 440, protein: 36, carbs: 42, fat: 14, fiber: 5, sugar: 2, sodium: 520, servingSize: '1 plate' },
];

export const dailyNutritionGoals: DailyNutritionGoal = {
  calories: 2400,
  protein: 200,
  carbs: 250,
  fat: 80,
  fiber: 35,
  water: 10,
};

// Weekly calorie history for chart
export const weeklyCalories = [
  { day: 'Mon', calories: 2280, goal: 2400 },
  { day: 'Tue', calories: 2350, goal: 2400 },
  { day: 'Wed', calories: 2520, goal: 2400 },
  { day: 'Thu', calories: 2180, goal: 2400 },
  { day: 'Fri', calories: 2420, goal: 2400 },
  { day: 'Sat', calories: 2650, goal: 2400 },
  { day: 'Sun', calories: 2200, goal: 2400 },
];

// Common food database for quick add
export const commonFoods: Omit<FoodEntry, 'id' | 'date' | 'time' | 'meal'>[] = [
  { name: 'Chicken Breast (grilled)', calories: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0, sugar: 0, sodium: 74, servingSize: '4 oz' },
  { name: 'Brown Rice (cooked)', calories: 215, protein: 5, carbs: 45, fat: 1.8, fiber: 3.5, sugar: 0, sodium: 10, servingSize: '1 cup' },
  { name: 'Salmon (baked)', calories: 233, protein: 25, carbs: 0, fat: 14, fiber: 0, sugar: 0, sodium: 59, servingSize: '4 oz' },
  { name: 'Egg (whole, large)', calories: 72, protein: 6, carbs: 0.4, fat: 5, fiber: 0, sugar: 0.2, sodium: 71, servingSize: '1 egg' },
  { name: 'Greek Yogurt (plain)', calories: 130, protein: 17, carbs: 8, fat: 4, fiber: 0, sugar: 7, sodium: 65, servingSize: '1 cup' },
  { name: 'Sweet Potato (baked)', calories: 103, protein: 2.3, carbs: 24, fat: 0.1, fiber: 3.8, sugar: 7.4, sodium: 41, servingSize: '1 medium' },
  { name: 'Broccoli (steamed)', calories: 55, protein: 3.7, carbs: 11, fat: 0.6, fiber: 5.1, sugar: 2.2, sodium: 64, servingSize: '1 cup' },
  { name: 'Almonds (raw)', calories: 164, protein: 6, carbs: 6, fat: 14, fiber: 3.5, sugar: 1.2, sodium: 0, servingSize: '1 oz' },
  { name: 'Banana', calories: 105, protein: 1.3, carbs: 27, fat: 0.4, fiber: 3.1, sugar: 14, sodium: 1, servingSize: '1 medium' },
  { name: 'Oatmeal (cooked)', calories: 154, protein: 5.4, carbs: 27, fat: 2.6, fiber: 4, sugar: 0.6, sodium: 115, servingSize: '1 cup' },
  { name: 'Whey Protein Shake', calories: 120, protein: 24, carbs: 3, fat: 1, fiber: 0, sugar: 1, sodium: 130, servingSize: '1 scoop' },
  { name: 'Avocado', calories: 234, protein: 2.9, carbs: 12, fat: 21, fiber: 10, sugar: 1, sodium: 10, servingSize: '1 whole' },
  { name: 'Tuna (canned in water)', calories: 120, protein: 28, carbs: 0, fat: 1, fiber: 0, sugar: 0, sodium: 300, servingSize: '1 can (5oz)' },
  { name: 'Quinoa (cooked)', calories: 222, protein: 8, carbs: 39, fat: 3.6, fiber: 5, sugar: 0, sodium: 13, servingSize: '1 cup' },
  { name: 'Cottage Cheese (low-fat)', calories: 163, protein: 28, carbs: 6, fat: 2.3, fiber: 0, sugar: 6, sodium: 918, servingSize: '1 cup' },
  { name: 'Turkey Breast (deli)', calories: 60, protein: 12, carbs: 2, fat: 0.5, fiber: 0, sugar: 1, sodium: 480, servingSize: '3 oz' },
];

export const biometricMeta: Record<string, { label: string; unit: string; icon: string; color: string; goodDirection: 'up' | 'down' }> = {
  height: { label: 'Height', unit: 'in', icon: 'arrow-up-outline', color: '#34495e', goodDirection: 'up' },
  weight: { label: 'Weight', unit: 'lbs', icon: 'scale-outline', color: '#ff6b6b', goodDirection: 'down' },
  bodyFat: { label: 'Body Fat', unit: '%', icon: 'body-outline', color: '#f39c12', goodDirection: 'down' },
  muscleMassPct: { label: 'Muscle Mass %', unit: '%', icon: 'speedometer-outline', color: '#1abc9c', goodDirection: 'up' },
  bmi: { label: 'BMI', unit: '', icon: 'analytics-outline', color: '#3498db', goodDirection: 'down' },
  leanMusclePct: { label: 'Lean Muscle %', unit: '%', icon: 'trending-up-outline', color: '#27ae60', goodDirection: 'up' },
  fatMass: { label: 'Fat Mass', unit: 'lbs', icon: 'flame-outline', color: '#e74c3c', goodDirection: 'down' },
  leanMuscleMass: { label: 'Lean Muscle Mass', unit: 'lbs', icon: 'barbell-outline', color: '#2ecc71', goodDirection: 'up' },
  muscleMass: { label: 'Muscle Mass', unit: 'lbs', icon: 'fitness-outline', color: '#16a085', goodDirection: 'up' },
  massPerMuscleLb: { label: 'Mass / Muscle Lb', unit: '', icon: 'calculator-outline', color: '#8e44ad', goodDirection: 'down' },
  visceralFat: { label: 'Visceral Fat', unit: '', icon: 'warning-outline', color: '#e67e22', goodDirection: 'down' },

  navelWaist: { label: 'Navel Waist', unit: 'in', icon: 'resize-outline', color: '#e74c3c', goodDirection: 'down' },
  widestWaist: { label: 'Widest Waist', unit: 'in', icon: 'resize-outline', color: '#c0392b', goodDirection: 'down' },
  narrowestWaist: { label: 'Narrowest Waist', unit: 'in', icon: 'resize-outline', color: '#d35400', goodDirection: 'down' },
  shoulders: { label: 'Shoulders', unit: 'in', icon: 'expand-outline', color: '#2980b9', goodDirection: 'up' },
  sideHip: { label: 'Side Hip', unit: 'in', icon: 'resize-outline', color: '#1abc9c', goodDirection: 'down' },
  rearHip: { label: 'Rear Hip', unit: 'in', icon: 'resize-outline', color: '#16a085', goodDirection: 'down' },
  bicep: { label: 'Bicep', unit: 'in', icon: 'barbell-outline', color: '#e67e22', goodDirection: 'up' },
  calf: { label: 'Calf', unit: 'in', icon: 'walk-outline', color: '#2980b9', goodDirection: 'up' },
  waist: { label: 'Waist', unit: 'in', icon: 'resize-outline', color: '#e74c3c', goodDirection: 'down' },
  chest: { label: 'Chest', unit: 'in', icon: 'expand-outline', color: '#9b59b6', goodDirection: 'up' },
  hips: { label: 'Hips', unit: 'in', icon: 'resize-outline', color: '#1abc9c', goodDirection: 'down' },
  arms: { label: 'Arms', unit: 'in', icon: 'barbell-outline', color: '#e67e22', goodDirection: 'up' },
  thighs: { label: 'Thighs', unit: 'in', icon: 'walk-outline', color: '#2980b9', goodDirection: 'up' },
  restingHR: { label: 'Resting HR', unit: 'bpm', icon: 'heart-outline', color: '#e74c3c', goodDirection: 'down' },
  bloodPressureSys: { label: 'BP Systolic', unit: 'mmHg', icon: 'pulse-outline', color: '#c0392b', goodDirection: 'down' },
  bloodPressureDia: { label: 'BP Diastolic', unit: 'mmHg', icon: 'pulse-outline', color: '#e74c3c', goodDirection: 'down' },
  heartRate: { label: 'Heart Rate', unit: 'bpm', icon: 'heart-outline', color: '#e74c3c', goodDirection: 'down' },
  bodyAge: { label: 'Body Age', unit: 'yrs', icon: 'hourglass-outline', color: '#8e44ad', goodDirection: 'down' },

  // Flexibility (sit-and-reach) is measured in inches. A HIGHER value = better
  // (more forward reach past the toes). `goodDirection: 'up'` means any
  // positive change in the value is progress — e.g. -3 → 0 → +2 all register
  // as improvement (change > 0). Zero and negative readings are legitimate
  // measurements, not "no data", and must be rendered throughout the UI.
  flexibility: { label: 'Flexibility', unit: 'in', icon: 'body-outline', color: '#8e44ad', goodDirection: 'up' },
  gripStrength: { label: 'Grip Strength', unit: 'lbs', icon: 'hand-left-outline', color: '#d35400', goodDirection: 'up' },
};

// ============================================================================
// ZERO / NEGATIVE-ALLOWED METRICS
// ============================================================================
// Most metrics (weight, BP, waist, etc.) are strictly positive — a value of 0
// means "not recorded". These metrics, however, can legitimately be zero or
// negative, and the UI must render and chart them with the correct sign
// instead of hiding them as "missing data".
//
// Currently only flexibility (sit-and-reach) qualifies:
//   •  +2  → fingertips 2 in past the toes
//   •   0  → fingertips at the toes
//   •  -3  → fingertips 3 in short of the toes
export const ZERO_ALLOWED_METRICS: ReadonlySet<string> = new Set(['flexibility']);

export function isZeroAllowedMetric(key: string): boolean {
  return ZERO_ALLOWED_METRICS.has(key);
}

/**
 * A value should be treated as "entered" (not missing) if it has a legitimate
 * numeric reading. For most metrics that means `val > 0`; for
 * `ZERO_ALLOWED_METRICS` any finite number — including 0 and negatives — counts.
 */
export function hasMetricValue(key: string, val: number | null | undefined): boolean {
  if (val === null || val === undefined || !Number.isFinite(val)) return false;
  if (isZeroAllowedMetric(key)) return true; // 0 and negatives are valid data
  return val > 0;
}

/**
 * Human-readable flexibility label, e.g.:
 *   formatFlexibility(2)   → "2 in past toes"
 *   formatFlexibility(0)   → "at toes"
 *   formatFlexibility(-3)  → "3 in short of toes"
 * Accepts decimals (-1.5 → "1.5 in short of toes"). Returns '—' for null/NaN.
 */
export function formatFlexibility(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  // Trim a trailing .0 for whole numbers so "2.0" displays as "2"
  const abs = Math.abs(val);
  const pretty = Number.isInteger(abs) ? abs.toFixed(0) : abs.toFixed(1);
  if (val > 0) return `${pretty} in past toes`;
  if (val < 0) return `${pretty} in short of toes`;
  return 'at toes';
}

/**
 * Compact signed display for tables / tooltips, e.g.:
 *   formatFlexibilityShort(2)   → "+2 in"
 *   formatFlexibilityShort(0)   → "0 in"
 *   formatFlexibilityShort(-3)  → "-3 in"
 */
export function formatFlexibilityShort(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  const pretty = Number.isInteger(val) ? val.toFixed(0) : val.toFixed(1);
  return val > 0 ? `+${pretty} in` : `${pretty} in`;
}
