// Food Photo Journal Data - For dietitian review workflow
// Photos are submitted by clients and reviewed by their assigned dietitian

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type ReviewStatus = 'pending' | 'reviewed' | 'flagged'; // 'flagged' kept for backward compat with existing DB data


export interface FoodPhotoEntry {
  id: string;
  clientId: string;
  clientName: string;
  dietitianName: string;
  franchise: string;
  photoUri: string;
  meal: MealType;
  date: string;          // YYYY-MM-DD
  time: string;          // e.g. "7:30 AM"
  description: string;   // Client's optional description
  reviewStatus: ReviewStatus;
  reviewedAt?: string;
  dietitianFeedback?: string;
  createdAt: string;
}

export interface FoodPhotoDayGroup {
  date: string;
  displayDate: string;
  meals: {
    breakfast: FoodPhotoEntry[];
    lunch: FoodPhotoEntry[];
    dinner: FoodPhotoEntry[];
    snack: FoodPhotoEntry[];
  };
  totalPhotos: number;
  reviewedCount: number;
}

// Meal display config
export const MEAL_CONFIG: Record<MealType, { label: string; icon: string; color: string; order: number }> = {
  breakfast: { label: 'Breakfast', icon: 'sunny-outline', color: '#f39c12', order: 0 },
  lunch:     { label: 'Lunch',     icon: 'restaurant-outline', color: '#2ecc71', order: 1 },
  dinner:    { label: 'Dinner',    icon: 'moon-outline', color: '#3498db', order: 2 },
  snack:     { label: 'Snack',     icon: 'cafe-outline', color: '#9b59b6', order: 3 },
};

export const REVIEW_STATUS_CONFIG: Record<ReviewStatus, { label: string; color: string; bgColor: string; icon: string }> = {
  pending:  { label: 'Pending Review', color: '#f39c12', bgColor: '#f39c1212', icon: 'time-outline' },
  reviewed: { label: 'Reviewed',       color: '#2ecc71', bgColor: '#2ecc7112', icon: 'checkmark-circle-outline' },
  flagged:  { label: 'Needs Attention', color: '#e74c3c', bgColor: '#e74c3c12', icon: 'alert-circle-outline' },
};

// Placeholder food images for mock data
const FOOD_PHOTOS = [
  'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1484723091739-30a097e8f929?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1432139509613-5c4255a78e03?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1482049016688-2d3e1b311543?w=400&h=300&fit=crop',
];

const DESCRIPTIONS = [
  'Grilled chicken with steamed vegetables',
  'Overnight oats with berries and honey',
  'Salmon bowl with quinoa and avocado',
  'Mixed green salad with grilled shrimp',
  'Turkey wrap with hummus and spinach',
  'Protein smoothie with banana and peanut butter',
  'Egg white omelette with mushrooms',
  'Stir fry with tofu and brown rice',
  'Greek yogurt parfait',
  'Lean steak with sweet potato',
  'Chicken Caesar salad',
  'Tuna poke bowl',
  '',
  'Post-workout meal',
  '',
  'Meal prep for the week',
];

const FEEDBACK_EXAMPLES = [
  'Great protein choice! Consider adding more leafy greens for fiber.',
  'Excellent balanced meal. Keep up the good work!',
  'Portion size looks appropriate. Nice variety of vegetables.',
  'This looks like a solid post-workout meal. Good protein-to-carb ratio.',
  'I notice the sodium might be high here. Try using herbs instead of salt next time.',
  'Love seeing the colorful vegetables! Great micronutrient variety.',
  'Consider swapping the white rice for brown rice or quinoa for more fiber.',
  'Hydration reminder: make sure you\'re drinking water with this meal.',
  'The protein portion looks a bit small. Try adding an extra ounce or two.',
  'Perfect snack choice! This will keep you fueled until your next meal.',
];

// Generate mock food photo entries for a set of clients
export function generateMockFoodPhotos(
  clients: Array<{ id: string; name: string; dietitian: string; franchise: string }>
): FoodPhotoEntry[] {
  const entries: FoodPhotoEntry[] = [];
  const now = new Date();
  const meals: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
  const times: Record<MealType, string[]> = {
    breakfast: ['6:30 AM', '7:00 AM', '7:30 AM', '8:00 AM'],
    lunch: ['11:30 AM', '12:00 PM', '12:30 PM', '1:00 PM'],
    dinner: ['6:00 PM', '6:30 PM', '7:00 PM', '7:30 PM'],
    snack: ['9:30 AM', '3:00 PM', '3:30 PM', '4:00 PM'],
  };

  let idCounter = 1;

  // Generate entries for the past 7 days for each client
  for (const client of clients) {
    if (client.dietitian === 'None') continue;

    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const date = new Date(now);
      date.setDate(date.getDate() - dayOffset);
      const dateStr = date.toISOString().split('T')[0];

      // Each day has 2-4 meal photos
      const mealsToday = meals.slice(0, 2 + ((idCounter + dayOffset) % 3));

      for (const meal of mealsToday) {
        const photoIdx = (idCounter * 3 + dayOffset * 5 + meals.indexOf(meal)) % FOOD_PHOTOS.length;
        const descIdx = (idCounter * 7 + dayOffset) % DESCRIPTIONS.length;
        const timeIdx = (idCounter + dayOffset) % times[meal].length;

        // Older entries more likely to be reviewed (no more flagged status)
        const isReviewed = dayOffset > 1 || (dayOffset === 1 && Math.random() > 0.3);
        const status: ReviewStatus = isReviewed ? 'reviewed' : 'pending';


        const feedbackIdx = (idCounter * 11 + dayOffset * 3) % FEEDBACK_EXAMPLES.length;

        entries.push({
          id: `fp-${idCounter++}`,
          clientId: client.id,
          clientName: client.name,
          dietitianName: client.dietitian,
          franchise: client.franchise,
          photoUri: FOOD_PHOTOS[photoIdx],
          meal,
          date: dateStr,
          time: times[meal][timeIdx],
          description: DESCRIPTIONS[descIdx],
          reviewStatus: status,
          reviewedAt: status !== 'pending' ? new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString() : undefined,
          dietitianFeedback: status !== 'pending' ? FEEDBACK_EXAMPLES[feedbackIdx] : undefined,
          createdAt: new Date(date.getTime() + meals.indexOf(meal) * 4 * 60 * 60 * 1000).toISOString(),
        });
      }
    }
  }

  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Group food photos by date
export function groupPhotosByDate(photos: FoodPhotoEntry[]): FoodPhotoDayGroup[] {
  const groupMap = new Map<string, FoodPhotoDayGroup>();

  for (const photo of photos) {
    if (!groupMap.has(photo.date)) {
      const d = new Date(photo.date + 'T12:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const photoDate = new Date(photo.date + 'T00:00:00');
      const diffDays = Math.round((today.getTime() - photoDate.getTime()) / (1000 * 60 * 60 * 24));

      let displayDate: string;
      if (diffDays === 0) displayDate = 'Today';
      else if (diffDays === 1) displayDate = 'Yesterday';
      else displayDate = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

      groupMap.set(photo.date, {
        date: photo.date,
        displayDate,
        meals: { breakfast: [], lunch: [], dinner: [], snack: [] },
        totalPhotos: 0,
        reviewedCount: 0,
      });
    }

    const group = groupMap.get(photo.date)!;
    group.meals[photo.meal].push(photo);
    group.totalPhotos++;
    if (photo.reviewStatus !== 'pending') group.reviewedCount++;
  }

  return Array.from(groupMap.values()).sort((a, b) => b.date.localeCompare(a.date));
}

// Filter photos for a specific dietitian
export function getPhotosForDietitian(
  allPhotos: FoodPhotoEntry[],
  dietitianName: string
): FoodPhotoEntry[] {
  return allPhotos.filter(p => p.dietitianName === dietitianName);
}

// Filter photos for a specific client
export function getPhotosForClient(
  allPhotos: FoodPhotoEntry[],
  clientId: string
): FoodPhotoEntry[] {
  return allPhotos.filter(p => p.clientId === clientId);
}

// Get pending review count
export function getPendingCount(photos: FoodPhotoEntry[]): number {
  return photos.filter(p => p.reviewStatus === 'pending').length;
}

// Get unique client list from photos
export function getUniqueClients(photos: FoodPhotoEntry[]): Array<{ id: string; name: string; pendingCount: number }> {
  const clientMap = new Map<string, { id: string; name: string; pendingCount: number }>();
  for (const p of photos) {
    if (!clientMap.has(p.clientId)) {
      clientMap.set(p.clientId, { id: p.clientId, name: p.clientName, pendingCount: 0 });
    }
    if (p.reviewStatus === 'pending') {
      clientMap.get(p.clientId)!.pendingCount++;
    }
  }
  return Array.from(clientMap.values()).sort((a, b) => b.pendingCount - a.pendingCount);
}
