import { supabase } from './supabase';
import type { FoodEntry, BiometricEntry, SessionRecord, DailyNutritionGoal } from '../data/clientPortalData';
import { computeBodyCompFields } from '../data/clientPortalData';

// ============================================================
// UUID VALIDATION HELPER
// ============================================================
// The database uses UUID columns for user_id. Mock data uses IDs like "client-35"
// which are not valid UUIDs and cause PostgreSQL errors. This helper prevents
// invalid queries from being sent to the database.
// For write operations, we return mock success responses so the UI flow works
// correctly even for demo/mock users.

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

// Generate a random UUID v4 for mock responses
function generateMockUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ============================================================
// BIOMETRICS
// ============================================================


export interface DBBiometricEntry {
  id: string;
  user_id: string;
  measured_at: string;
  height: number | null;
  weight: number | null;
  body_fat: number | null;
  muscle_mass: number | null;
  muscle_mass_pct: number | null;
  bmi: number | null;
  visceral_fat: number | null;
  navel_waist: number | null;
  widest_waist: number | null;
  narrowest_waist: number | null;
  shoulders: number | null;
  side_hip: number | null;
  rear_hip: number | null;
  bicep: number | null;
  calf: number | null;
  waist: number | null;
  chest: number | null;
  hips: number | null;
  arms: number | null;
  thighs: number | null;
  resting_hr: number | null;
  blood_pressure_sys: number | null;
  blood_pressure_dia: number | null;
  heart_rate: number | null;
  body_age: number | null;
  vo2_max: number | null; // deprecated - no longer tracked but kept for DB compat

  flexibility: number | null;
  grip_strength: number | null;
  notes: string | null;
}

export function dbBiometricToLocal(db: DBBiometricEntry): BiometricEntry {
  const weight = Number(db.weight) || 0;
  const bodyFat = Number(db.body_fat) || 0;
  const height = Number(db.height) || 0;
  const muscleMassPct = Number(db.muscle_mass_pct) || 0;

  // Auto-compute derived body composition fields
  const comp = computeBodyCompFields(weight, bodyFat, muscleMassPct);
  const bmiCalc = (weight && height) ? parseFloat(((weight / (height * height)) * 703).toFixed(1)) : (Number(db.bmi) || 0);

  return {
    date: db.measured_at.split('T')[0],
    height,
    weight,
    bodyFat,
    muscleMassPct,
    muscleMass: comp.muscleMass || Number(db.muscle_mass) || 0,
    bmi: bmiCalc,
    leanMusclePct: comp.leanMusclePct,
    fatMass: comp.fatMass,
    leanMuscleMass: comp.leanMuscleMass,
    massPerMuscleLb: comp.massPerMuscleLb,
    visceralFat: Number(db.visceral_fat) || 0,
    navelWaist: Number(db.navel_waist) || 0,
    widestWaist: Number(db.widest_waist) || 0,
    narrowestWaist: Number(db.narrowest_waist) || 0,
    shoulders: Number(db.shoulders) || 0,
    sideHip: Number(db.side_hip) || 0,
    rearHip: Number(db.rear_hip) || 0,
    bicep: Number(db.bicep) || 0,
    calf: Number(db.calf) || 0,
    waist: Number(db.waist) || 0,
    chest: Number(db.chest) || 0,
    hips: Number(db.hips) || 0,
    arms: Number(db.arms) || 0,
    thighs: Number(db.thighs) || 0,
    restingHR: Number(db.resting_hr) || 0,
    bloodPressureSys: Number(db.blood_pressure_sys) || 0,
    bloodPressureDia: Number(db.blood_pressure_dia) || 0,
    heartRate: Number(db.heart_rate) || 0,
    bodyAge: Number(db.body_age) || 0,
    flexibility: Number(db.flexibility) || 0,
    gripStrength: Number(db.grip_strength) || 0,
    notes: db.notes || undefined,
  };
}





export async function fetchBiometrics(userId: string): Promise<BiometricEntry[]> {
  if (!isValidUUID(userId)) {
    console.warn('fetchBiometrics: skipping query for non-UUID userId:', userId);
    return [];
  }

  const { data, error } = await supabase
    .from('client_biometrics')
    .select('*')
    .eq('user_id', userId)
    .order('measured_at', { ascending: true });

  if (error) {
    console.error('Error fetching biometrics:', error);
    return [];
  }

  return (data || []).map(dbBiometricToLocal);
}


export async function addBiometricEntry(
  userId: string,
  entry: Partial<BiometricEntry> & { date?: string }
): Promise<{ data: any; error: any }> {
  if (!isValidUUID(userId)) {
    // Return mock success for non-UUID IDs (e.g., mock client data like "client-35")
    // This allows the UI flow to continue normally for demo/mock users
    console.info('addBiometricEntry: returning mock success for non-UUID userId:', userId);
    const mockId = generateMockUUID();
    return {
      data: {
        id: mockId,
        user_id: userId,
        measured_at: entry.date ? new Date(entry.date + 'T12:00:00').toISOString() : new Date().toISOString(),
        ...entry,
      },
      error: null,
    };
  }

  const row: any = {
    user_id: userId,
    measured_at: entry.date ? new Date(entry.date + 'T12:00:00').toISOString() : new Date().toISOString(),
  };

  if (entry.height !== undefined) row.height = entry.height;
  if (entry.weight !== undefined) row.weight = entry.weight;
  if (entry.bodyFat !== undefined) row.body_fat = entry.bodyFat;
  if (entry.muscleMass !== undefined) row.muscle_mass = entry.muscleMass;
  if (entry.bmi !== undefined) row.bmi = entry.bmi;
  if (entry.visceralFat !== undefined) row.visceral_fat = entry.visceralFat;
  if (entry.navelWaist !== undefined) row.navel_waist = entry.navelWaist;
  if (entry.widestWaist !== undefined) row.widest_waist = entry.widestWaist;
  if (entry.narrowestWaist !== undefined) row.narrowest_waist = entry.narrowestWaist;
  if (entry.shoulders !== undefined) row.shoulders = entry.shoulders;
  if (entry.sideHip !== undefined) row.side_hip = entry.sideHip;
  if (entry.rearHip !== undefined) row.rear_hip = entry.rearHip;
  if (entry.muscleMassPct !== undefined) row.muscle_mass_pct = entry.muscleMassPct;
  if (entry.muscleMass !== undefined) row.muscle_mass = entry.muscleMass;

  if (entry.calf !== undefined) row.calf = entry.calf;
  if (entry.waist !== undefined) row.waist = entry.waist;
  if (entry.chest !== undefined) row.chest = entry.chest;
  if (entry.hips !== undefined) row.hips = entry.hips;
  if (entry.arms !== undefined) row.arms = entry.arms;
  if (entry.thighs !== undefined) row.thighs = entry.thighs;
  if (entry.restingHR !== undefined) row.resting_hr = entry.restingHR;
  if (entry.bloodPressureSys !== undefined) row.blood_pressure_sys = entry.bloodPressureSys;
  if (entry.bloodPressureDia !== undefined) row.blood_pressure_dia = entry.bloodPressureDia;
  if (entry.heartRate !== undefined) row.heart_rate = entry.heartRate;
  if (entry.bodyAge !== undefined) row.body_age = entry.bodyAge;

  if (entry.vo2Max !== undefined) row.vo2_max = entry.vo2Max;
  if (entry.flexibility !== undefined) row.flexibility = entry.flexibility;
  if (entry.gripStrength !== undefined) row.grip_strength = entry.gripStrength;
  if (entry.notes !== undefined) row.notes = entry.notes;


  return supabase.from('client_biometrics').insert(row).select().single();
}



// ============================================================
// BIOMETRIC PHOTOS
// ============================================================

export interface BiometricPhoto {
  id: string;
  userId: string;
  biometricEntryId: string | null;
  photoType: 'front' | 'side' | 'back';
  photoUrl: string;
  createdAt: string;
}

export async function uploadBiometricPhoto(
  userId: string,
  photoUri: string,
  photoType: 'front' | 'side' | 'back',
  biometricEntryId?: string
): Promise<{ url: string | null; error: any }> {
  if (!isValidUUID(userId)) {
    // Return mock success for non-UUID IDs - photo won't be stored but UI flow continues
    console.info('uploadBiometricPhoto: returning mock success for non-UUID userId:', userId);
    return { url: photoUri, error: null };
  }


  try {
    const fileName = `${userId}/${Date.now()}_${photoType}.jpg`;
    
    // Fetch the image as a blob
    const response = await fetch(photoUri);
    const blob = await response.blob();
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('biometric-photos')
      .upload(fileName, blob, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return { url: null, error: uploadError };
    }

    const { data: urlData } = supabase.storage
      .from('biometric-photos')
      .getPublicUrl(fileName);

    const photoUrl = urlData.publicUrl;

    // Save reference in DB
    const { error: dbError } = await supabase.from('biometric_photos').insert({
      user_id: userId,
      biometric_entry_id: biometricEntryId || null,
      photo_type: photoType,
      photo_url: photoUrl,
    });

    if (dbError) {
      console.error('DB error saving photo ref:', dbError);
    }

    return { url: photoUrl, error: null };
  } catch (err) {
    return { url: null, error: err };
  }
}

export async function fetchBiometricPhotos(
  userId: string,
  biometricEntryId?: string
): Promise<BiometricPhoto[]> {
  if (!isValidUUID(userId)) {
    console.warn('fetchBiometricPhotos: skipping query for non-UUID userId:', userId);
    return [];
  }

  let query = supabase
    .from('biometric_photos')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (biometricEntryId) {
    query = query.eq('biometric_entry_id', biometricEntryId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching photos:', error);
    return [];
  }

  return (data || []).map((p: any) => ({
    id: p.id,
    userId: p.user_id,
    biometricEntryId: p.biometric_entry_id,
    photoType: p.photo_type,
    photoUrl: p.photo_url,
    createdAt: p.created_at,
  }));
}


// Grouped photos by date for timeline view
export interface PhotoDateGroup {
  date: string;
  displayDate: string;
  biometricEntryId: string | null;
  photos: {
    front?: BiometricPhoto;
    side?: BiometricPhoto;
    back?: BiometricPhoto;
  };
}

export async function fetchBiometricPhotosGrouped(
  userId: string
): Promise<PhotoDateGroup[]> {
  const photos = await fetchBiometricPhotos(userId);
  
  // Group photos by date (YYYY-MM-DD from createdAt)
  const groupMap = new Map<string, PhotoDateGroup>();
  
  for (const photo of photos) {
    const dateKey = photo.createdAt.split('T')[0];
    if (!groupMap.has(dateKey)) {
      const d = new Date(dateKey + 'T12:00:00');
      groupMap.set(dateKey, {
        date: dateKey,
        displayDate: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        biometricEntryId: photo.biometricEntryId,
        photos: {},
      });
    }
    const group = groupMap.get(dateKey)!;
    group.photos[photo.photoType] = photo;
    if (photo.biometricEntryId && !group.biometricEntryId) {
      group.biometricEntryId = photo.biometricEntryId;
    }
  }
  
  // Sort by date descending (newest first)
  return Array.from(groupMap.values()).sort((a, b) => b.date.localeCompare(a.date));
}

// Fetch a single biometric entry by its ID
export async function fetchBiometricEntryById(
  entryId: string
): Promise<BiometricEntry | null> {
  if (!isValidUUID(entryId)) {
    console.warn('fetchBiometricEntryById: skipping for non-UUID entryId:', entryId);
    return null;
  }

  const { data, error } = await supabase
    .from('client_biometrics')
    .select('*')
    .eq('id', entryId)
    .single();

  if (error || !data) return null;
  return dbBiometricToLocal(data);
}

// Fetch biometric entry closest to a given date for a user
export async function fetchBiometricEntryByDate(
  userId: string,
  date: string
): Promise<BiometricEntry | null> {
  if (!isValidUUID(userId)) {
    console.warn('fetchBiometricEntryByDate: skipping for non-UUID userId:', userId);
    return null;
  }

  // Try exact date match first
  const { data: exact } = await supabase
    .from('client_biometrics')
    .select('*')
    .eq('user_id', userId)
    .gte('measured_at', date + 'T00:00:00')
    .lte('measured_at', date + 'T23:59:59')
    .order('measured_at', { ascending: false })
    .limit(1);

  if (exact && exact.length > 0) {
    return dbBiometricToLocal(exact[0]);
  }

  // Find closest entry before this date
  const { data: before } = await supabase
    .from('client_biometrics')
    .select('*')
    .eq('user_id', userId)
    .lte('measured_at', date + 'T23:59:59')
    .order('measured_at', { ascending: false })
    .limit(1);

  if (before && before.length > 0) {
    return dbBiometricToLocal(before[0]);
  }

  // Find closest entry after this date
  const { data: after } = await supabase
    .from('client_biometrics')
    .select('*')
    .eq('user_id', userId)
    .gte('measured_at', date + 'T00:00:00')
    .order('measured_at', { ascending: true })
    .limit(1);

  if (after && after.length > 0) {
    return dbBiometricToLocal(after[0]);
  }

  return null;
}




// ============================================================
// POSTURAL ASSESSMENT
// ============================================================

export interface PosturalAssessment {
  overallScore: number;
  summary: string;
  findings: Array<{
    area: string;
    observation: string;
    severity: string;
    icon: string;
  }>;
  recommendations: Array<{
    title: string;
    description: string;
    priority: string;
    exercises: string[];
  }>;
  symmetryAnalysis?: {
    upperBody: string;
    lowerBody: string;
    overall: string;
  };
  muscleImbalances?: Array<{
    area: string;
    description: string;
    correction: string;
  }>;
}

export async function requestPosturalAssessment(
  photoUrls: { front?: string; side?: string; back?: string },
  biometricData: Partial<BiometricEntry>
): Promise<{ assessment: PosturalAssessment | null; error: any }> {
  try {
    const { data, error } = await supabase.functions.invoke('postural-assessment', {
      body: { photoUrls, biometricData },
    });

    if (error) {
      return { assessment: null, error };
    }

    return { assessment: data.assessment, error: null };
  } catch (err) {
    return { assessment: null, error: err };
  }
}

export async function savePosturalAssessment(
  userId: string,
  biometricEntryId: string,
  assessment: PosturalAssessment,
  photoUrls?: { front?: string | null; side?: string | null; back?: string | null }
): Promise<{ error: any }> {
  if (!isValidUUID(userId) || !isValidUUID(biometricEntryId)) {
    // Return mock success for non-UUID IDs - assessment won't be persisted but UI flow continues
    console.info('savePosturalAssessment: returning mock success for non-UUID IDs');
    return { error: null };
  }


  return supabase.from('postural_assessments').insert({
    user_id: userId,
    biometric_entry_id: biometricEntryId,
    assessment_text: assessment.summary,
    findings: assessment.findings,
    recommendations: assessment.recommendations,
    symmetry_analysis: assessment.symmetryAnalysis ?? null,
    muscle_imbalances: assessment.muscleImbalances ?? null,
    photo_urls: photoUrls ?? null,
    overall_score: assessment.overallScore,
  });
}

// ============================================================
// POSTURAL ASSESSMENT HISTORY
// ============================================================

// A saved postural assessment from the database, joined with its date
// (from the associated biometric entry) so we can render chronologically.
export interface StoredPosturalAssessment extends PosturalAssessment {
  id: string;
  createdAt: string; // ISO timestamp
  biometricEntryId: string | null;
  measuredAt: string | null; // date of the biometric entry (YYYY-MM-DD), used for chart X-axis
  photoUrls: { front?: string | null; side?: string | null; back?: string | null } | null;
}

// Fetch all postural assessments for a user, newest-first.
// Joins against `client_biometrics.measured_at` so we can anchor each
// assessment to the actual measurement date (not just the created_at timestamp)
// for consistent overlay with the biometric trend chart.
export async function fetchPosturalAssessments(
  userId: string
): Promise<StoredPosturalAssessment[]> {
  if (!isValidUUID(userId)) {
    console.warn('fetchPosturalAssessments: skipping for non-UUID userId:', userId);
    return [];
  }

  const { data, error } = await supabase
    .from('postural_assessments')
    .select('*, client_biometrics(measured_at)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching postural assessments:', error);
    return [];
  }

  return (data || []).map((row: any): StoredPosturalAssessment => ({
    id: row.id,
    createdAt: row.created_at,
    biometricEntryId: row.biometric_entry_id,
    measuredAt: row.client_biometrics?.measured_at
      ? row.client_biometrics.measured_at.split('T')[0]
      : (row.created_at ? row.created_at.split('T')[0] : null),
    overallScore: row.overall_score ?? 0,
    summary: row.assessment_text || '',
    findings: Array.isArray(row.findings) ? row.findings : [],
    recommendations: Array.isArray(row.recommendations) ? row.recommendations : [],
    symmetryAnalysis: row.symmetry_analysis || undefined,
    muscleImbalances: Array.isArray(row.muscle_imbalances) ? row.muscle_imbalances : undefined,
    photoUrls: row.photo_urls || null,
  }));
}



// ============================================================
// FOOD JOURNAL
// ============================================================

export interface DBFoodEntry {
  id: string;
  user_id: string;
  entry_date: string;
  entry_time: string;
  meal: string;
  food_name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  serving_size: string | null;
}

export function dbFoodToLocal(db: DBFoodEntry): FoodEntry {
  return {
    id: db.id,
    date: db.entry_date,
    time: db.entry_time,
    meal: db.meal as FoodEntry['meal'],
    name: db.food_name,
    calories: Number(db.calories) || 0,
    protein: Number(db.protein) || 0,
    carbs: Number(db.carbs) || 0,
    fat: Number(db.fat) || 0,
    fiber: Number(db.fiber) || 0,
    sugar: Number(db.sugar) || 0,
    sodium: Number(db.sodium) || 0,
    servingSize: db.serving_size || '1 serving',
  };
}

export async function fetchFoodEntries(userId: string, date?: string): Promise<FoodEntry[]> {
  if (!isValidUUID(userId)) {
    console.warn('fetchFoodEntries: skipping query for non-UUID userId:', userId);
    return [];
  }

  let query = supabase
    .from('food_journal_entries')
    .select('*')
    .eq('user_id', userId)
    .order('entry_date', { ascending: false })
    .order('entry_time', { ascending: true });

  if (date) {
    query = query.eq('entry_date', date);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching food entries:', error);
    return [];
  }

  return (data || []).map(dbFoodToLocal);
}


export async function fetchFoodEntriesRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<FoodEntry[]> {
  if (!isValidUUID(userId)) {
    console.warn('fetchFoodEntriesRange: skipping query for non-UUID userId:', userId);
    return [];
  }

  const { data, error } = await supabase
    .from('food_journal_entries')
    .select('*')
    .eq('user_id', userId)
    .gte('entry_date', startDate)
    .lte('entry_date', endDate)
    .order('entry_date', { ascending: false })
    .order('entry_time', { ascending: true });

  if (error) {
    console.error('Error fetching food entries range:', error);
    return [];
  }

  return (data || []).map(dbFoodToLocal);
}


export async function addFoodEntry(
  userId: string,
  entry: Omit<FoodEntry, 'id'>
): Promise<{ data: any; error: any }> {
  return supabase.from('food_journal_entries').insert({
    user_id: userId,
    entry_date: entry.date,
    entry_time: entry.time,
    meal: entry.meal,
    food_name: entry.name,
    calories: entry.calories,
    protein: entry.protein,
    carbs: entry.carbs,
    fat: entry.fat,
    fiber: entry.fiber,
    sugar: entry.sugar,
    sodium: entry.sodium,
    serving_size: entry.servingSize,
  }).select().single();
}

export async function deleteFoodEntry(entryId: string): Promise<{ error: any }> {
  return supabase.from('food_journal_entries').delete().eq('id', entryId);
}

// ============================================================
// SESSION RECORDS
// ============================================================

export interface DBSessionRecord {
  id: string;
  user_id: string;
  franchise_id: string | null;
  trainer_name: string | null;
  session_date: string;
  session_time: string;
  session_type: string;
  duration: number;
  status: string;
  notes: string | null;
  rating: number | null;
}

export function dbSessionToLocal(db: DBSessionRecord): SessionRecord {
  return {
    id: db.id,
    date: db.session_date,
    time: db.session_time,
    type: db.session_type as SessionRecord['type'],
    trainer: db.trainer_name || 'Unknown',
    duration: db.duration,
    status: db.status as SessionRecord['status'],
    notes: db.notes || undefined,
    rating: db.rating || undefined,
  };
}

export async function fetchSessions(userId: string): Promise<SessionRecord[]> {
  if (!isValidUUID(userId)) {
    console.warn('fetchSessions: skipping query for non-UUID userId:', userId);
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('session_records')
      .select('*')
      .eq('user_id', userId)
      .order('session_date', { ascending: false });

    if (error) {
      console.error('Error fetching sessions:', error);
      return [];
    }

    return (data || []).map(dbSessionToLocal);
  } catch (err) {
    console.error('Exception fetching sessions:', err);
    return [];
  }
}


export async function addSession(
  userId: string,
  session: Omit<SessionRecord, 'id'>
): Promise<{ data: any; error: any }> {
  return supabase.from('session_records').insert({
    user_id: userId,
    session_date: session.date,
    session_time: session.time,
    session_type: session.type,
    trainer_name: session.trainer,
    duration: session.duration,
    status: session.status,
    notes: session.notes || null,
    rating: session.rating || null,
  }).select().single();
}

export async function updateSession(
  sessionId: string,
  updates: Partial<SessionRecord>
): Promise<{ error: any }> {
  const row: any = {};
  if (updates.date) row.session_date = updates.date;
  if (updates.time) row.session_time = updates.time;
  if (updates.type) row.session_type = updates.type;
  if (updates.trainer) row.trainer_name = updates.trainer;
  if (updates.duration) row.duration = updates.duration;
  if (updates.status) row.status = updates.status;
  if (updates.notes !== undefined) row.notes = updates.notes;
  if (updates.rating !== undefined) row.rating = updates.rating;
  row.updated_at = new Date().toISOString();

  return supabase.from('session_records').update(row).eq('id', sessionId);
}

// ============================================================
// WATER INTAKE
// ============================================================

export async function fetchWaterIntake(userId: string, date: string): Promise<number> {
  if (!isValidUUID(userId)) {
    console.warn('fetchWaterIntake: skipping query for non-UUID userId:', userId);
    return 0;
  }

  const { data, error } = await supabase
    .from('daily_water_intake')
    .select('glasses')
    .eq('user_id', userId)
    .eq('intake_date', date)
    .single();

  if (error || !data) return 0;
  return data.glasses;
}


// Use select-then-insert/update pattern instead of upsert to avoid
// PostgREST ON CONFLICT issues with RLS-enabled tables
export async function upsertWaterIntake(userId: string, date: string, glasses: number): Promise<{ error: any }> {
  if (!isValidUUID(userId)) {
    console.warn('upsertWaterIntake: skipping for non-UUID userId:', userId);
    return { error: null };
  }

  try {
    // Check if a record already exists
    const { data: existing, error: selectError } = await supabase
      .from('daily_water_intake')
      .select('id')
      .eq('user_id', userId)
      .eq('intake_date', date)
      .maybeSingle();

    if (selectError) {
      console.error('Error checking existing water intake:', selectError);
      return { error: selectError };
    }

    if (existing) {
      // Update existing record
      return supabase.from('daily_water_intake').update({
        glasses,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
    } else {
      // Insert new record
      return supabase.from('daily_water_intake').insert({
        user_id: userId,
        intake_date: date,
        glasses,
        updated_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error('Exception in upsertWaterIntake:', err);
    return { error: err };
  }
}

// ============================================================
// NUTRITION GOALS
// ============================================================

export async function fetchNutritionGoals(userId: string): Promise<DailyNutritionGoal> {
  const defaults: DailyNutritionGoal = {
    calories: 2400,
    protein: 200,
    carbs: 250,
    fat: 80,
    fiber: 35,
    water: 10,
  };

  if (!isValidUUID(userId)) {
    console.warn('fetchNutritionGoals: skipping query for non-UUID userId:', userId);
    return defaults;
  }

  const { data, error } = await supabase
    .from('client_nutrition_goals')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) return defaults;

  return {
    calories: data.calories || defaults.calories,
    protein: data.protein || defaults.protein,
    carbs: data.carbs || defaults.carbs,
    fat: data.fat || defaults.fat,
    fiber: data.fiber || defaults.fiber,
    water: data.water_glasses || defaults.water,
  };
}


// Use select-then-insert/update pattern instead of upsert to avoid
// PostgREST ON CONFLICT issues with RLS-enabled tables
export async function upsertNutritionGoals(
  userId: string,
  goals: DailyNutritionGoal
): Promise<{ error: any }> {
  if (!isValidUUID(userId)) {
    console.warn('upsertNutritionGoals: skipping for non-UUID userId:', userId);
    return { error: null };
  }

  try {
    // Check if a record already exists
    const { data: existing, error: selectError } = await supabase
      .from('client_nutrition_goals')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (selectError) {
      console.error('Error checking existing nutrition goals:', selectError);
      return { error: selectError };
    }

    const row = {
      calories: goals.calories,
      protein: goals.protein,
      carbs: goals.carbs,
      fat: goals.fat,
      fiber: goals.fiber,
      water_glasses: goals.water,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      // Update existing record
      return supabase.from('client_nutrition_goals').update(row).eq('id', existing.id);
    } else {
      // Insert new record
      return supabase.from('client_nutrition_goals').insert({
        user_id: userId,
        ...row,
      });
    }
  } catch (err) {
    console.error('Exception in upsertNutritionGoals:', err);
    return { error: err };
  }
}

// ============================================================
// SEED DATA - Populate initial data for new clients
// ============================================================

export async function seedClientData(userId: string, trainerName: string = 'Marcus Rivera'): Promise<void> {
  if (!isValidUUID(userId)) {
    console.warn('seedClientData: skipping for non-UUID userId:', userId);
    return;
  }

  const { data: existingBio } = await supabase
    .from('client_biometrics')
    .select('id')
    .eq('user_id', userId)
    .limit(1);

  if (existingBio && existingBio.length > 0) {
    console.log('Client already has data, skipping seed');
    return;
  }

  console.log('Seeding initial client data...');

  const biometricRows = [
    { date: '2025-06-15', height: 72, weight: 218, body_fat: 28.5, muscle_mass: 142, muscle_mass_pct: 42.0, bmi: 29.6, visceral_fat: 14, navel_waist: 39, widest_waist: 40, narrowest_waist: 36, shoulders: 48, side_hip: 43, rear_hip: 44, bicep: 13.5, calf: 15, waist: 38, chest: 44, hips: 42, arms: 14.5, thighs: 24, resting_hr: 78, blood_pressure_sys: 138, blood_pressure_dia: 88, heart_rate: 82, vo2_max: 32, flexibility: 12, grip_strength: 85 },
    { date: '2025-07-15', height: 72, weight: 214, body_fat: 27.2, muscle_mass: 143, muscle_mass_pct: 42.5, bmi: 29.0, visceral_fat: 13, navel_waist: 38.5, widest_waist: 39.5, narrowest_waist: 35.5, shoulders: 48, side_hip: 42.5, rear_hip: 43.5, bicep: 13.5, calf: 15, waist: 37.5, chest: 44, hips: 41.5, arms: 14.5, thighs: 24, resting_hr: 76, blood_pressure_sys: 135, blood_pressure_dia: 86, heart_rate: 80, vo2_max: 33, flexibility: 13, grip_strength: 88 },
    { date: '2025-08-15', height: 72, weight: 210, body_fat: 25.8, muscle_mass: 144, muscle_mass_pct: 43.2, bmi: 28.5, visceral_fat: 12, navel_waist: 38, widest_waist: 39, narrowest_waist: 35, shoulders: 48.2, side_hip: 42, rear_hip: 43, bicep: 13.8, calf: 15.2, waist: 37, chest: 43.5, hips: 41, arms: 14.8, thighs: 24.2, resting_hr: 74, blood_pressure_sys: 132, blood_pressure_dia: 84, heart_rate: 78, vo2_max: 35, flexibility: 14, grip_strength: 92 },
    { date: '2025-09-15', height: 72, weight: 206, body_fat: 24.1, muscle_mass: 145, muscle_mass_pct: 43.8, bmi: 27.9, visceral_fat: 11, navel_waist: 37, widest_waist: 38, narrowest_waist: 34, shoulders: 48.5, side_hip: 41.5, rear_hip: 42, bicep: 14, calf: 15.3, waist: 36, chest: 43, hips: 40.5, arms: 15, thighs: 24.5, resting_hr: 72, blood_pressure_sys: 128, blood_pressure_dia: 82, heart_rate: 76, vo2_max: 37, flexibility: 15, grip_strength: 95 },
    { date: '2025-10-15', height: 72, weight: 203, body_fat: 22.8, muscle_mass: 146, muscle_mass_pct: 44.5, bmi: 27.5, visceral_fat: 10, navel_waist: 36.5, widest_waist: 37.5, narrowest_waist: 33.5, shoulders: 48.8, side_hip: 41, rear_hip: 41.5, bicep: 14.2, calf: 15.5, waist: 35.5, chest: 43, hips: 40, arms: 15.2, thighs: 24.8, resting_hr: 70, blood_pressure_sys: 126, blood_pressure_dia: 80, heart_rate: 74, vo2_max: 38, flexibility: 16, grip_strength: 98 },
    { date: '2025-11-15', height: 72, weight: 200, body_fat: 21.5, muscle_mass: 147, muscle_mass_pct: 45.2, bmi: 27.1, visceral_fat: 9, navel_waist: 36, widest_waist: 37, narrowest_waist: 33, shoulders: 49, side_hip: 40.5, rear_hip: 41, bicep: 14.5, calf: 15.6, waist: 35, chest: 42.5, hips: 39.5, arms: 15.5, thighs: 25, resting_hr: 68, blood_pressure_sys: 124, blood_pressure_dia: 78, heart_rate: 72, vo2_max: 40, flexibility: 17, grip_strength: 100 },
    { date: '2025-12-15', height: 72, weight: 197, body_fat: 20.3, muscle_mass: 148, muscle_mass_pct: 45.8, bmi: 26.7, visceral_fat: 8, navel_waist: 35.5, widest_waist: 36.5, narrowest_waist: 32.5, shoulders: 49.2, side_hip: 40, rear_hip: 40.5, bicep: 14.8, calf: 15.8, waist: 34.5, chest: 42.5, hips: 39, arms: 15.5, thighs: 25.2, resting_hr: 66, blood_pressure_sys: 122, blood_pressure_dia: 76, heart_rate: 70, vo2_max: 41, flexibility: 18, grip_strength: 102 },
    { date: '2026-01-15', height: 72, weight: 194, body_fat: 19.2, muscle_mass: 149, muscle_mass_pct: 46.5, bmi: 26.3, visceral_fat: 7, navel_waist: 35, widest_waist: 36, narrowest_waist: 32, shoulders: 49.5, side_hip: 39.5, rear_hip: 40, bicep: 15, calf: 16, waist: 34, chest: 42, hips: 38.5, arms: 15.8, thighs: 25.5, resting_hr: 64, blood_pressure_sys: 120, blood_pressure_dia: 76, heart_rate: 68, vo2_max: 42, flexibility: 19, grip_strength: 105 },
    { date: '2026-02-11', height: 72, weight: 191, body_fat: 18.1, muscle_mass: 150, muscle_mass_pct: 47.0, bmi: 25.9, visceral_fat: 6, navel_waist: 34.5, widest_waist: 35.5, narrowest_waist: 31.5, shoulders: 49.8, side_hip: 39, rear_hip: 39.5, bicep: 15.2, calf: 16.2, waist: 33.5, chest: 42, hips: 38, arms: 16, thighs: 25.8, resting_hr: 62, blood_pressure_sys: 118, blood_pressure_dia: 74, heart_rate: 66, vo2_max: 44, flexibility: 20, grip_strength: 108 },



  ].map(row => ({
    user_id: userId,
    measured_at: new Date(row.date + 'T12:00:00').toISOString(),
    ...row,
    date: undefined,
  }));

  // Remove the 'date' key from each row
  const cleanedRows = biometricRows.map(({ date, ...rest }) => rest);

  const { error: bioError } = await supabase.from('client_biometrics').insert(cleanedRows);
  if (bioError) console.error('Error seeding biometrics:', bioError);

  const sessionRows = [
    { date: '2026-02-11', time: '7:00 AM', type: 'training', duration: 60, status: 'completed', notes: 'Upper body focus - increased bench press by 10lbs', rating: 5 },
    { date: '2026-02-10', time: '6:30 AM', type: 'training', duration: 60, status: 'completed', notes: 'Leg day - PR on squats at 225lbs', rating: 5 },
    { date: '2026-02-09', time: '10:00 AM', type: 'nutrition', duration: 30, status: 'completed', notes: 'Meal plan review - adjusted macros for cutting phase', rating: null },
    { date: '2026-02-07', time: '7:00 AM', type: 'training', duration: 60, status: 'completed', notes: 'Full body circuit training', rating: 4 },
    { date: '2026-02-06', time: '6:30 AM', type: 'training', duration: 60, status: 'completed', notes: 'Core and cardio session', rating: 4 },
    { date: '2026-02-13', time: '7:00 AM', type: 'training', duration: 60, status: 'upcoming', notes: 'Upper body - progressive overload', rating: null },
    { date: '2026-02-14', time: '6:30 AM', type: 'training', duration: 60, status: 'upcoming', notes: null, rating: null },
    { date: '2026-02-20', time: '7:00 AM', type: 'training', duration: 60, status: 'upcoming', notes: null, rating: null },
  ].map(row => ({
    user_id: userId,
    session_date: row.date,
    session_time: row.time,
    session_type: row.type,
    trainer_name: trainerName,
    duration: row.duration,
    status: row.status,
    notes: row.notes,
    rating: row.rating,
  }));

  const { error: sessError } = await supabase.from('session_records').insert(sessionRows);
  if (sessError) console.error('Error seeding sessions:', sessError);

  const today = new Date().toISOString().split('T')[0];
  const foodRows = [
    { time: '6:30 AM', meal: 'breakfast', name: 'Egg White Omelette w/ Spinach', calories: 280, protein: 32, carbs: 8, fat: 12, fiber: 3, sugar: 2, sodium: 380, serving: '3 eggs + veggies' },
    { time: '6:30 AM', meal: 'breakfast', name: 'Whole Grain Toast', calories: 130, protein: 5, carbs: 24, fat: 2, fiber: 4, sugar: 3, sodium: 180, serving: '2 slices' },
    { time: '12:30 PM', meal: 'lunch', name: 'Grilled Chicken Breast', calories: 320, protein: 48, carbs: 0, fat: 12, fiber: 0, sugar: 0, sodium: 280, serving: '8 oz' },
    { time: '3:30 PM', meal: 'snack', name: 'Protein Shake', calories: 240, protein: 30, carbs: 18, fat: 5, fiber: 2, sugar: 6, sodium: 200, serving: '1 scoop + milk' },
    { time: '6:30 PM', meal: 'dinner', name: 'Baked Salmon', calories: 350, protein: 40, carbs: 0, fat: 20, fiber: 0, sugar: 0, sodium: 320, serving: '6 oz fillet' },
  ].map(row => ({
    user_id: userId,
    entry_date: today,
    entry_time: row.time,
    meal: row.meal,
    food_name: row.name,
    calories: row.calories,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
    fiber: row.fiber,
    sugar: row.sugar,
    sodium: row.sodium,
    serving_size: row.serving,
  }));

  const { error: foodError } = await supabase.from('food_journal_entries').insert(foodRows);
  if (foodError) console.error('Error seeding food entries:', foodError);

  // Use select-then-insert/update pattern for nutrition goals (avoids ON CONFLICT issues with RLS)
  const goalResult = await upsertNutritionGoals(userId, {
    calories: 2400,
    protein: 200,
    carbs: 250,
    fat: 80,
    fiber: 35,
    water: 10,
  });
  if (goalResult.error) console.error('Error seeding nutrition goals:', goalResult.error);

  // Use select-then-insert/update pattern for water intake (avoids ON CONFLICT issues with RLS)
  const waterResult = await upsertWaterIntake(userId, today, 6);
  if (waterResult.error) console.error('Error seeding water intake:', waterResult.error);

  console.log('Client data seeded successfully!');
}

