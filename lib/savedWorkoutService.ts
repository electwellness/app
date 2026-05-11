import { supabase } from './supabase';
import type { Exercise, Segment } from '../components/trainer/WorkoutExerciseList';

export interface SavedWorkout {
  id: string;
  trainer_id: string;
  client_id: string;
  workout_type: string;
  equipment_used: string[];
  exercises: Exercise[];
  segments: Segment[];
  notes: string;
  created_at: string;
  trainer_name?: string;
  client_name?: string;
}

export interface SaveWorkoutParams {
  trainer_id: string;
  client_id: string;
  workout_type: string;
  equipment_used: string[];
  exercises: Exercise[];
  segments: Segment[];
  notes?: string;
}

export async function saveWorkout(params: SaveWorkoutParams): Promise<{ success: boolean; workout?: SavedWorkout; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('manage-saved-workouts', {
      body: {
        action: 'save',
        ...params,
      },
    });

    if (error) {
      return { success: false, error: error.message || 'Failed to save workout' };
    }
    if (data?.error) {
      return { success: false, error: data.error };
    }

    return { success: true, workout: data.workout };
  } catch (err: any) {
    return { success: false, error: err.message || 'Unknown error' };
  }
}

export async function fetchWorkoutsByClient(clientId: string, limit?: number): Promise<{ success: boolean; workouts: SavedWorkout[]; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('manage-saved-workouts', {
      body: {
        action: 'fetch_by_client',
        client_id: clientId,
        limit,
      },
    });

    if (error) {
      return { success: false, workouts: [], error: error.message || 'Failed to fetch workouts' };
    }
    if (data?.error) {
      return { success: false, workouts: [], error: data.error };
    }

    return { success: true, workouts: data.workouts || [] };
  } catch (err: any) {
    return { success: false, workouts: [], error: err.message || 'Unknown error' };
  }
}

export async function fetchWorkoutsByTrainer(trainerId: string, limit?: number): Promise<{ success: boolean; workouts: SavedWorkout[]; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('manage-saved-workouts', {
      body: {
        action: 'fetch_by_trainer',
        trainer_id: trainerId,
        limit,
      },
    });

    if (error) {
      return { success: false, workouts: [], error: error.message || 'Failed to fetch workouts' };
    }
    if (data?.error) {
      return { success: false, workouts: [], error: data.error };
    }

    return { success: true, workouts: data.workouts || [] };
  } catch (err: any) {
    return { success: false, workouts: [], error: err.message || 'Unknown error' };
  }
}

export async function deleteWorkout(workoutId: string, requesterId?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('manage-saved-workouts', {
      body: {
        action: 'delete',
        workout_id: workoutId,
        requester_id: requesterId,
      },
    });

    if (error) {
      return { success: false, error: error.message || 'Failed to delete workout' };
    }
    if (data?.error) {
      return { success: false, error: data.error };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Unknown error' };
  }
}

// Workout type label mapping
const WORKOUT_TYPE_LABELS: Record<string, string> = {
  full_body: 'Full Body',
  upper_body: 'Upper Body',
  lower_body: 'Lower Body',
  upper_push: 'Upper Push',
  upper_pull: 'Upper Pull',
  lower_push: 'Lower Push',
  lower_pull: 'Lower Pull',
  push: 'Push',
  pull: 'Pull',
};

export function getWorkoutTypeLabel(type: string): string {
  return WORKOUT_TYPE_LABELS[type] || type;
}

// Workout type color mapping
const WORKOUT_TYPE_COLORS: Record<string, string> = {
  full_body: '#3498db',
  upper_body: '#e67e22',
  lower_body: '#2ecc71',
  upper_push: '#e74c3c',
  upper_pull: '#9b59b6',
  lower_push: '#1abc9c',
  lower_pull: '#f39c12',
  push: '#d35400',
  pull: '#8e44ad',
};

export function getWorkoutTypeColor(type: string): string {
  return WORKOUT_TYPE_COLORS[type] || '#3498db';
}
