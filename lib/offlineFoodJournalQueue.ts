/**
 * Offline Food Journal Queue Service
 *
 * Manages offline support for the food journal:
 * - Queues food entry add/delete operations when offline
 * - Queues water intake upsert operations when offline
 * - Persists queue via localStorage (web) / in-memory fallback (native)
 * - Monitors network connectivity with online/offline events
 * - Automatically syncs queued entries when connectivity is restored
 * - Conflict resolution: deduplication + last-write-wins for concurrent edits
 */

import { Platform } from 'react-native';
import { supabase } from './supabase';
import type { FoodEntry } from '../data/clientPortalData';

// ── Types ──

export type OfflineOperation = 'add' | 'delete' | 'water_upsert';

export interface QueuedFoodEntry {
  queueId: string;            // Unique queue entry ID
  operation: OfflineOperation;
  userId: string;
  // For 'add' operations:
  entry?: Omit<FoodEntry, 'id'>;
  localId?: string;           // Temporary local ID used in UI
  // For 'delete' operations:
  entryId?: string;           // Server-side entry ID to delete
  // For 'water_upsert' operations:
  waterDate?: string;         // Date for water intake (YYYY-MM-DD)
  waterGlasses?: number;      // Number of glasses to upsert
  // Meta
  queuedAt: string;           // ISO timestamp when queued
  retryCount: number;
  lastError?: string;
  resolved?: boolean;         // True if conflict was resolved (skipped)
}

export type FoodQueueSyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error' | 'partial';

export interface FoodQueueState {
  syncStatus: FoodQueueSyncStatus;
  queueCount: number;
  pendingAdds: number;
  pendingDeletes: number;
  pendingWaterUpserts: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  isOnline: boolean;
  isSyncing: boolean;
  conflictsResolved: number;
}

type FoodQueueListener = (state: FoodQueueState) => void;

// ── Storage Helpers ──

const QUEUE_KEY = 'ew_food_journal_offline_queue';
const SYNC_TS_KEY = 'ew_food_journal_last_sync';
const CONFLICTS_KEY = 'ew_food_journal_conflicts_resolved';
const MAX_RETRIES = 5;
const RETRY_BASE_DELAY = 2000;

function persist(key: string, value: string): void {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch (e) {
    console.warn('[FoodQueue] Storage write failed:', e);
  }
}

function load(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch (e) {
    console.warn('[FoodQueue] Storage read failed:', e);
  }
  return null;
}

function remove(key: string): void {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {}
}

// ── Queue Manager (Singleton) ──

class OfflineFoodJournalQueue {
  private queue: QueuedFoodEntry[] = [];
  private listeners: Set<FoodQueueListener> = new Set();
  private _isOnline: boolean = true;
  private _syncStatus: FoodQueueSyncStatus = 'idle';
  private _lastSyncedAt: string | null = null;
  private _lastError: string | null = null;
  private _conflictsResolved: number = 0;
  private _isSyncing: boolean = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private initialized: boolean = false;
  private connectivityInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.init();
  }

  // ── Initialization ──

  private init() {
    if (this.initialized) return;
    this.initialized = true;

    this.loadQueue();
    this.loadMeta();
    this.setupConnectivity();

    if (this.queue.length > 0 && this._isOnline) {
      setTimeout(() => this.processQueue(), 1500);
    }
  }

  private loadQueue() {
    const stored = load(QUEUE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          this.queue = parsed;
        }
      } catch {
        this.queue = [];
      }
    }
  }

  private saveQueue() {
    persist(QUEUE_KEY, JSON.stringify(this.queue));
  }

  private loadMeta() {
    this._lastSyncedAt = load(SYNC_TS_KEY) || null;
    const conflicts = load(CONFLICTS_KEY);
    this._conflictsResolved = conflicts ? parseInt(conflicts, 10) || 0 : 0;
  }

  private updateSyncTimestamp() {
    this._lastSyncedAt = new Date().toISOString();
    persist(SYNC_TS_KEY, this._lastSyncedAt);
  }

  private incrementConflictsResolved(count: number = 1) {
    this._conflictsResolved += count;
    persist(CONFLICTS_KEY, String(this._conflictsResolved));
  }

  // ── Connectivity ──

  private setupConnectivity() {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      this._isOnline = navigator.onLine;

      window.addEventListener('online', () => {
        const wasOffline = !this._isOnline;
        this._isOnline = true;
        if (wasOffline) {
          console.log('[FoodQueue] Back online — syncing queued entries');
          this.notifyListeners();
          if (this.queue.length > 0) {
            setTimeout(() => this.processQueue(), 500);
          }
        }
      });

      window.addEventListener('offline', () => {
        this._isOnline = false;
        this._syncStatus = 'offline';
        console.log('[FoodQueue] Went offline');
        this.notifyListeners();
      });
    }

    // Periodic connectivity check:
    // - On web: use navigator.onLine (cross-origin fetch to google.com causes CORS errors)
    // - On native: use a lightweight HEAD request
    if (Platform.OS === 'web') {
      this.connectivityInterval = setInterval(() => {
        if (typeof navigator !== 'undefined') {
          const wasOffline = !this._isOnline;
          this._isOnline = navigator.onLine;
          if (wasOffline && this._isOnline && this.queue.length > 0) {
            this.processQueue();
          }
          if (wasOffline && this._isOnline) {
            this.notifyListeners();
          }
          if (!wasOffline && !this._isOnline) {
            this._syncStatus = 'offline';
            this.notifyListeners();
          }
        }
      }, 30000);
    } else {
      this.connectivityInterval = setInterval(() => {
        this.checkConnectivity();
      }, 30000);
    }
  }

  /**
   * Check connectivity via a lightweight fetch.
   * Only called on non-web platforms to avoid CORS issues in the browser.
   */
  private async checkConnectivity() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch('https://www.google.com/generate_204', {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-cache',
      });
      clearTimeout(timeoutId);

      const wasOffline = !this._isOnline;
      this._isOnline = response.ok || response.status === 204;

      if (wasOffline && this._isOnline && this.queue.length > 0) {
        this.processQueue();
      }
      if (wasOffline !== !this._isOnline) {
        this.notifyListeners();
      }
    } catch {
      const wasOnline = this._isOnline;
      this._isOnline = false;
      this._syncStatus = 'offline';
      if (wasOnline) this.notifyListeners();
    }
  }


  // ── Public: Check online status ──

  get isOnline(): boolean {
    return this._isOnline;
  }

  // ── Queue Operations ──

  /**
   * Queue an add-food operation. Returns a temporary local ID for optimistic UI.
   */
  enqueueAdd(userId: string, entry: Omit<FoodEntry, 'id'>): string {
    const localId = `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const queued: QueuedFoodEntry = {
      queueId: `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      operation: 'add',
      userId,
      entry,
      localId,
      queuedAt: new Date().toISOString(),
      retryCount: 0,
    };

    this.queue.push(queued);
    this.saveQueue();
    this.notifyListeners();

    // Try to process immediately if online
    if (this._isOnline && !this._isSyncing) {
      setTimeout(() => this.processQueue(), 100);
    }

    return localId;
  }

  /**
   * Queue a delete-food operation.
   */
  enqueueDelete(userId: string, entryId: string): void {
    // If the entry is a local offline entry that hasn't been synced yet, just remove it from queue
    const pendingAdd = this.queue.find(
      q => q.operation === 'add' && q.localId === entryId
    );
    if (pendingAdd) {
      this.queue = this.queue.filter(q => q.queueId !== pendingAdd.queueId);
      this.saveQueue();
      this.notifyListeners();
      return;
    }

    const queued: QueuedFoodEntry = {
      queueId: `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      operation: 'delete',
      userId,
      entryId,
      queuedAt: new Date().toISOString(),
      retryCount: 0,
    };

    this.queue.push(queued);
    this.saveQueue();
    this.notifyListeners();

    if (this._isOnline && !this._isSyncing) {
      setTimeout(() => this.processQueue(), 100);
    }
  }

  /**
   * Queue a water intake upsert operation.
   *
   * Water upserts are deduplicated: if there's already a pending water_upsert
   * for the same user + date, we replace it with the latest value rather than
   * creating a new queue entry. This prevents queue bloat from rapid taps.
   */
  enqueueWaterUpsert(userId: string, date: string, glasses: number): void {
    // Deduplicate: find existing pending water_upsert for same user + date
    const existingIdx = this.queue.findIndex(
      q => q.operation === 'water_upsert' && q.userId === userId && q.waterDate === date
    );

    if (existingIdx >= 0) {
      // Update existing entry in-place with latest value and timestamp
      this.queue[existingIdx] = {
        ...this.queue[existingIdx],
        waterGlasses: glasses,
        queuedAt: new Date().toISOString(),
        retryCount: 0,
        lastError: undefined,
      };
    } else {
      // Create new queue entry
      const queued: QueuedFoodEntry = {
        queueId: `q-water-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        operation: 'water_upsert',
        userId,
        waterDate: date,
        waterGlasses: glasses,
        queuedAt: new Date().toISOString(),
        retryCount: 0,
      };
      this.queue.push(queued);
    }

    this.saveQueue();
    this.notifyListeners();

    // Try to process immediately if online
    if (this._isOnline && !this._isSyncing) {
      setTimeout(() => this.processQueue(), 100);
    }
  }

  /**
   * Get all pending add entries (for optimistic UI display).
   */
  getPendingAdds(userId: string, date?: string): FoodEntry[] {
    return this.queue
      .filter(q => q.operation === 'add' && q.userId === userId && q.entry && (!date || q.entry.date === date))
      .map(q => ({
        id: q.localId || q.queueId,
        ...q.entry!,
      }));
  }

  /**
   * Get IDs of entries pending deletion.
   */
  getPendingDeleteIds(): Set<string> {
    return new Set(
      this.queue
        .filter(q => q.operation === 'delete' && q.entryId)
        .map(q => q.entryId!)
    );
  }

  /**
   * Get the latest pending water intake value for a given user + date.
   * Returns null if no pending water upsert exists for that date.
   */
  getPendingWaterIntake(userId: string, date: string): number | null {
    const pending = this.queue.find(
      q => q.operation === 'water_upsert' && q.userId === userId && q.waterDate === date
    );
    return pending?.waterGlasses ?? null;
  }

  /**
   * Check if there are any pending water upserts for a given user + date.
   */
  hasWaterPending(userId: string, date: string): boolean {
    return this.queue.some(
      q => q.operation === 'water_upsert' && q.userId === userId && q.waterDate === date
    );
  }

  // ── Queue Processing with Conflict Resolution ──

  async processQueue(): Promise<{ processed: number; failed: number; conflicts: number }> {
    if (this.queue.length === 0) {
      this._syncStatus = this._lastSyncedAt ? 'synced' : 'idle';
      this._isSyncing = false;
      this.notifyListeners();
      return { processed: 0, failed: 0, conflicts: 0 };
    }

    if (!this._isOnline) {
      this._syncStatus = 'offline';
      this.notifyListeners();
      return { processed: 0, failed: this.queue.length, conflicts: 0 };
    }

    if (this._isSyncing) {
      return { processed: 0, failed: 0, conflicts: 0 };
    }

    this._isSyncing = true;
    this._syncStatus = 'syncing';
    this._lastError = null;
    this.notifyListeners();

    let totalProcessed = 0;
    let totalFailed = 0;
    let totalConflicts = 0;

    // Process items that haven't exceeded max retries
    const processable = this.queue.filter(q => q.retryCount < MAX_RETRIES);
    const deadItems = this.queue.filter(q => q.retryCount >= MAX_RETRIES);

    for (const item of processable) {
      try {
        if (item.operation === 'add' && item.entry) {
          const result = await this.syncAddEntry(item);
          if (result.success) {
            this.queue = this.queue.filter(q => q.queueId !== item.queueId);
            totalProcessed++;
            if (result.conflictResolved) {
              totalConflicts++;
              this.incrementConflictsResolved();
            }
          } else {
            // Increment retry
            const idx = this.queue.findIndex(q => q.queueId === item.queueId);
            if (idx >= 0) {
              this.queue[idx] = {
                ...this.queue[idx],
                retryCount: this.queue[idx].retryCount + 1,
                lastError: result.error || 'Sync failed',
              };
            }
            totalFailed++;
          }
        } else if (item.operation === 'delete' && item.entryId) {
          const result = await this.syncDeleteEntry(item);
          if (result.success) {
            this.queue = this.queue.filter(q => q.queueId !== item.queueId);
            totalProcessed++;
            if (result.conflictResolved) {
              totalConflicts++;
              this.incrementConflictsResolved();
            }
          } else {
            const idx = this.queue.findIndex(q => q.queueId === item.queueId);
            if (idx >= 0) {
              this.queue[idx] = {
                ...this.queue[idx],
                retryCount: this.queue[idx].retryCount + 1,
                lastError: result.error || 'Delete failed',
              };
            }
            totalFailed++;
          }
        } else if (item.operation === 'water_upsert' && item.waterDate !== undefined && item.waterGlasses !== undefined) {
          const result = await this.syncWaterEntry(item);
          if (result.success) {
            this.queue = this.queue.filter(q => q.queueId !== item.queueId);
            totalProcessed++;
            if (result.conflictResolved) {
              totalConflicts++;
              this.incrementConflictsResolved();
            }
          } else {
            const idx = this.queue.findIndex(q => q.queueId === item.queueId);
            if (idx >= 0) {
              this.queue[idx] = {
                ...this.queue[idx],
                retryCount: this.queue[idx].retryCount + 1,
                lastError: result.error || 'Water sync failed',
              };
            }
            totalFailed++;
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        const idx = this.queue.findIndex(q => q.queueId === item.queueId);
        if (idx >= 0) {
          this.queue[idx] = {
            ...this.queue[idx],
            retryCount: this.queue[idx].retryCount + 1,
            lastError: msg,
          };
        }
        totalFailed++;
      }
    }

    // Remove dead-letter items
    if (deadItems.length > 0) {
      const deadIds = new Set(deadItems.map(d => d.queueId));
      this.queue = this.queue.filter(q => !deadIds.has(q.queueId));
      totalFailed += deadItems.length;
    }

    this._isSyncing = false;
    this.saveQueue();

    if (totalProcessed > 0) {
      this.updateSyncTimestamp();
    }

    if (totalFailed > 0 && totalProcessed > 0) {
      this._syncStatus = 'partial';
      this._lastError = `${totalFailed} entry(ies) failed to sync`;
      this.scheduleRetry();
    } else if (totalFailed > 0) {
      this._syncStatus = 'error';
      this._lastError = this._lastError || `${totalFailed} entry(ies) failed to sync`;
      this.scheduleRetry();
    } else {
      this._syncStatus = this.queue.length > 0 ? 'partial' : 'synced';
      this._lastError = null;
    }

    this.notifyListeners();
    return { processed: totalProcessed, failed: totalFailed, conflicts: totalConflicts };
  }

  /**
   * Sync a single add entry with conflict resolution.
   *
   * Conflict resolution strategy:
   * 1. Check if an identical entry already exists on the server
   *    (same user, date, time, meal, name) — likely added from another device.
   * 2. If found and server entry's created_at is AFTER our queuedAt → server wins (skip).
   * 3. If found and server entry's created_at is BEFORE our queuedAt → we update the server entry.
   * 4. If not found → insert as new.
   */
  private async syncAddEntry(
    item: QueuedFoodEntry
  ): Promise<{ success: boolean; serverId?: string; conflictResolved?: boolean; error?: string }> {
    if (!item.entry) return { success: false, error: 'No entry data' };

    const entry = item.entry;

    // Step 1: Check for existing duplicate on server
    const { data: existing, error: checkError } = await supabase
      .from('food_journal_entries')
      .select('id, created_at, updated_at')
      .eq('user_id', item.userId)
      .eq('entry_date', entry.date)
      .eq('entry_time', entry.time)
      .eq('meal', entry.meal)
      .eq('food_name', entry.name)
      .limit(1);

    if (checkError) {
      return { success: false, error: checkError.message };
    }

    if (existing && existing.length > 0) {
      const serverEntry = existing[0];
      const serverCreatedAt = new Date(serverEntry.created_at || serverEntry.updated_at || 0).getTime();
      const localQueuedAt = new Date(item.queuedAt).getTime();

      if (serverCreatedAt >= localQueuedAt) {
        // Server entry is newer or same time → server wins, skip our add
        console.log(`[FoodQueue] Conflict resolved (server wins): "${entry.name}" on ${entry.date}`);
        return { success: true, serverId: serverEntry.id, conflictResolved: true };
      } else {
        // Our entry is newer → update the server entry with our data
        console.log(`[FoodQueue] Conflict resolved (local wins): updating "${entry.name}" on ${entry.date}`);
        const { error: updateError } = await supabase
          .from('food_journal_entries')
          .update({
            entry_time: entry.time,
            calories: entry.calories,
            protein: entry.protein,
            carbs: entry.carbs,
            fat: entry.fat,
            fiber: entry.fiber,
            sugar: entry.sugar,
            sodium: entry.sodium,
            serving_size: entry.servingSize,
            updated_at: new Date().toISOString(),
          })
          .eq('id', serverEntry.id);

        if (updateError) {
          return { success: false, error: updateError.message };
        }
        return { success: true, serverId: serverEntry.id, conflictResolved: true };
      }
    }

    // Step 2: No duplicate found → insert as new
    const { data: inserted, error: insertError } = await supabase
      .from('food_journal_entries')
      .insert({
        user_id: item.userId,
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
      })
      .select()
      .single();

    if (insertError) {
      return { success: false, error: insertError.message };
    }

    return { success: true, serverId: inserted?.id };
  }

  /**
   * Sync a single delete entry with conflict resolution.
   *
   * If the entry no longer exists on the server (deleted from another device),
   * we treat it as a successful conflict resolution.
   */
  private async syncDeleteEntry(
    item: QueuedFoodEntry
  ): Promise<{ success: boolean; conflictResolved?: boolean; error?: string }> {
    if (!item.entryId) return { success: false, error: 'No entry ID' };

    // Check if entry still exists
    const { data: existing, error: checkError } = await supabase
      .from('food_journal_entries')
      .select('id, updated_at')
      .eq('id', item.entryId)
      .limit(1);

    if (checkError) {
      return { success: false, error: checkError.message };
    }

    if (!existing || existing.length === 0) {
      // Entry already deleted on server → conflict resolved
      console.log(`[FoodQueue] Conflict resolved: entry ${item.entryId} already deleted on server`);
      return { success: true, conflictResolved: true };
    }

    // Check if entry was modified on server after our delete was queued
    const serverEntry = existing[0];
    const serverUpdatedAt = new Date(serverEntry.updated_at || 0).getTime();
    const localQueuedAt = new Date(item.queuedAt).getTime();

    if (serverUpdatedAt > localQueuedAt) {
      // Server entry was modified after our delete request → conflict
      // In this case, we still honor the delete (user explicitly deleted it)
      console.log(`[FoodQueue] Conflict: entry ${item.entryId} modified on server after delete queued. Proceeding with delete.`);
    }

    const { error: deleteError } = await supabase
      .from('food_journal_entries')
      .delete()
      .eq('id', item.entryId);

    if (deleteError) {
      return { success: false, error: deleteError.message };
    }

    return { success: true };
  }

  /**
   * Sync a single water intake upsert with conflict resolution.
   *
   * Conflict resolution strategy:
   * 1. Check if a water intake record exists on the server for the same user + date.
   * 2. If found and server record's updated_at is AFTER our queuedAt → server wins (skip).
   *    This means another device updated water more recently.
   * 3. If found and server record's updated_at is BEFORE our queuedAt → local wins (update).
   * 4. If not found → insert new record.
   */
  private async syncWaterEntry(
    item: QueuedFoodEntry
  ): Promise<{ success: boolean; conflictResolved?: boolean; error?: string }> {
    if (item.waterDate === undefined || item.waterGlasses === undefined) {
      return { success: false, error: 'Missing water date or glasses' };
    }

    const { waterDate, waterGlasses, userId, queuedAt } = item;

    // Step 1: Check for existing record on server
    const { data: existing, error: checkError } = await supabase
      .from('daily_water_intake')
      .select('id, glasses, updated_at')
      .eq('user_id', userId)
      .eq('intake_date', waterDate)
      .maybeSingle();

    if (checkError) {
      return { success: false, error: checkError.message };
    }

    if (existing) {
      const serverUpdatedAt = new Date(existing.updated_at || 0).getTime();
      const localQueuedAt = new Date(queuedAt).getTime();

      if (serverUpdatedAt > localQueuedAt) {
        // Server record is newer → server wins, skip our update
        console.log(
          `[FoodQueue] Water conflict resolved (server wins): server=${existing.glasses} glasses (updated ${existing.updated_at}), ` +
          `local=${waterGlasses} glasses (queued ${queuedAt}) for ${waterDate}`
        );
        return { success: true, conflictResolved: true };
      }

      // Local is newer or same time → update server with our value
      console.log(
        `[FoodQueue] Water sync (local wins): updating ${waterDate} to ${waterGlasses} glasses`
      );
      const { error: updateError } = await supabase
        .from('daily_water_intake')
        .update({
          glasses: waterGlasses,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (updateError) {
        return { success: false, error: updateError.message };
      }

      // Check if server had a different value — that's a conflict resolution
      const conflictResolved = existing.glasses !== waterGlasses && serverUpdatedAt > 0;
      return { success: true, conflictResolved };
    }

    // Step 2: No existing record → insert new
    console.log(`[FoodQueue] Water sync: inserting ${waterGlasses} glasses for ${waterDate}`);
    const { error: insertError } = await supabase
      .from('daily_water_intake')
      .insert({
        user_id: userId,
        intake_date: waterDate,
        glasses: waterGlasses,
        updated_at: new Date().toISOString(),
      });

    if (insertError) {
      return { success: false, error: insertError.message };
    }

    return { success: true };
  }

  private scheduleRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer);

    const maxRetry = Math.max(...this.queue.map(q => q.retryCount), 1);
    const delay = Math.min(RETRY_BASE_DELAY * Math.pow(2, maxRetry - 1), 60000);

    this.retryTimer = setTimeout(() => {
      if (this._isOnline && this.queue.length > 0) {
        this.processQueue();
      }
    }, delay);
  }

  // ── Force Sync ──

  async forceSync(): Promise<{ processed: number; failed: number; conflicts: number }> {
    this.queue = this.queue.map(q => ({ ...q, retryCount: 0, lastError: undefined }));
    this.saveQueue();
    return this.processQueue();
  }

  // ── State & Listeners ──

  getState(): FoodQueueState {
    const pendingAdds = this.queue.filter(q => q.operation === 'add').length;
    const pendingDeletes = this.queue.filter(q => q.operation === 'delete').length;
    const pendingWaterUpserts = this.queue.filter(q => q.operation === 'water_upsert').length;

    return {
      syncStatus: this._syncStatus,
      queueCount: this.queue.length,
      pendingAdds,
      pendingDeletes,
      pendingWaterUpserts,
      lastSyncedAt: this._lastSyncedAt,
      lastError: this._lastError,
      isOnline: this._isOnline,
      isSyncing: this._isSyncing,
      conflictsResolved: this._conflictsResolved,
    };
  }

  subscribe(listener: FoodQueueListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    const state = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch (e) {
        console.warn('[FoodQueue] Listener error:', e);
      }
    }
  }

  // ── Clear ──

  clearQueue() {
    this.queue = [];
    this.saveQueue();
    this._lastError = null;
    this._syncStatus = 'idle';
    this.notifyListeners();
  }

  // ── Cleanup ──

  destroy() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.connectivityInterval) clearInterval(this.connectivityInterval);
    this.listeners.clear();
  }
}

// Export singleton
export const offlineFoodQueue = new OfflineFoodJournalQueue();

// Convenience exports
export function getFoodQueueState(): FoodQueueState {
  return offlineFoodQueue.getState();
}

export function subscribeToFoodQueue(listener: FoodQueueListener): () => void {
  return offlineFoodQueue.subscribe(listener);
}
