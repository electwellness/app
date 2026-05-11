/**
 * Schedule Offline Service
 *
 * Manages offline support for the schedule screen:
 * - Caches appointments locally via localStorage (web) / in-memory (native)
 * - Queues create/update/delete operations made while offline
 * - Monitors connectivity and auto-syncs when back online
 * - Provides state and event subscriptions for UI components
 */

import { Platform } from 'react-native';
import type { Appointment, RecurrencePattern } from '../data/scheduleData';
import {
  fetchAppointments as fetchAppointmentsFromDB,
  createAppointment as createAppointmentInDB,
  createAppointmentsBulk as createAppointmentsBulkInDB,
  updateAppointmentStatus as updateAppointmentStatusInDB,
  rescheduleAppointment as rescheduleAppointmentInDB,
  bulkRescheduleAppointments as bulkRescheduleInDB,
  bulkCancelAppointments as bulkCancelInDB,
  deleteAppointment as deleteAppointmentInDB,
  bulkDeleteAppointments as bulkDeleteInDB,
} from './appointmentService';

// ── Types ────────────────────────────────────────────────────────────────────

export type OfflineOperationType =
  | 'create'
  | 'createBulk'
  | 'updateStatus'
  | 'delete'
  | 'reschedule'
  | 'bulkReschedule'
  | 'bulkCancel'
  | 'bulkDelete';

export interface QueuedOperation {
  id: string;
  type: OfflineOperationType;
  payload: any;
  queuedAt: string;
  retryCount: number;
  lastError?: string;
}

export type ScheduleSyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error' | 'partial';

export interface ScheduleOfflineState {
  syncStatus: ScheduleSyncStatus;
  isOnline: boolean;
  pendingCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  isSyncing: boolean;
  cachedAppointmentCount: number;
}

type StateListener = (state: ScheduleOfflineState) => void;

// ── Storage Helpers ──────────────────────────────────────────────────────────

const CACHE_KEY = 'ew_schedule_cache';
const QUEUE_KEY = 'ew_schedule_queue';
const SYNC_TS_KEY = 'ew_schedule_last_sync';
const MAX_RETRIES = 5;
const RETRY_BASE_DELAY = 2000;

function persist(key: string, value: string): void {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch (e) {
    console.warn('[ScheduleOffline] Storage write failed:', e);
  }
}

function load(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch (e) {
    console.warn('[ScheduleOffline] Storage read failed:', e);
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

// ── Singleton Service ────────────────────────────────────────────────────────

class ScheduleOfflineService {
  private cachedAppointments: Appointment[] = [];
  private queue: QueuedOperation[] = [];
  private listeners: Set<StateListener> = new Set();
  private isOnline: boolean = true;
  private syncStatus: ScheduleSyncStatus = 'idle';
  private lastSyncedAt: string | null = null;
  private lastError: string | null = null;
  private isSyncing: boolean = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private connectivityInterval: ReturnType<typeof setInterval> | null = null;
  private initialized: boolean = false;

  constructor() {
    this.init();
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  private init() {
    if (this.initialized) return;
    this.initialized = true;

    this.loadCache();
    this.loadQueue();
    this.loadSyncTimestamp();
    this.setupConnectivity();

    // Auto-process queue if items exist
    if (this.queue.length > 0 && this.isOnline) {
      setTimeout(() => this.processQueue(), 1500);
    }
  }

  private loadCache() {
    const stored = load(CACHE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          this.cachedAppointments = parsed;
        }
      } catch {
        this.cachedAppointments = [];
      }
    }
  }

  private saveCache() {
    try {
      persist(CACHE_KEY, JSON.stringify(this.cachedAppointments));
    } catch {}
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
    try {
      persist(QUEUE_KEY, JSON.stringify(this.queue));
    } catch {}
  }

  private loadSyncTimestamp() {
    this.lastSyncedAt = load(SYNC_TS_KEY);
  }

  private updateSyncTimestamp() {
    this.lastSyncedAt = new Date().toISOString();
    persist(SYNC_TS_KEY, this.lastSyncedAt);
  }

  private setupConnectivity() {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      this.isOnline = navigator.onLine;

      window.addEventListener('online', () => {
        const wasOffline = !this.isOnline;
        this.isOnline = true;
        if (wasOffline) {
          this.syncStatus = this.queue.length > 0 ? 'syncing' : 'synced';
          this.notify();
          if (this.queue.length > 0) {
            setTimeout(() => this.processQueue(), 500);
          }
        }
      });

      window.addEventListener('offline', () => {
        this.isOnline = false;
        this.syncStatus = 'offline';
        this.notify();
      });
    }

    // Periodic connectivity check — only on non-web platforms
    // On web, navigator.onLine + online/offline events are sufficient
    // and cross-origin fetch checks cause CORS errors in the browser
    if (Platform.OS !== 'web') {
      this.connectivityInterval = setInterval(() => {
        this.checkConnectivity();
      }, 30000);
    } else {
      // On web, just periodically check navigator.onLine and process queue
      this.connectivityInterval = setInterval(() => {
        if (typeof navigator !== 'undefined') {
          const wasOffline = !this.isOnline;
          this.isOnline = navigator.onLine;
          if (wasOffline && this.isOnline && this.queue.length > 0) {
            this.processQueue();
          }
          if (wasOffline && this.isOnline) {
            this.notify();
          }
          if (!wasOffline && !this.isOnline) {
            this.syncStatus = 'offline';
            this.notify();
          }
        }
      }, 30000);
    }
  }

  private async checkConnectivity() {
    // This method is only called on non-web platforms
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch('https://www.google.com/generate_204', {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-cache',
      });
      clearTimeout(timeoutId);

      const wasOffline = !this.isOnline;
      this.isOnline = response.ok || response.status === 204;

      if (wasOffline && this.isOnline && this.queue.length > 0) {
        this.processQueue();
      }
      if (wasOffline && this.isOnline) {
        this.notify();
      }
    } catch {
      this.isOnline = false;
      this.syncStatus = 'offline';
      this.notify();
    }
  }


  // ── Cache Management ───────────────────────────────────────────────────────

  /**
   * Update the local cache with appointments fetched from the server.
   * Called after a successful DB fetch.
   */
  updateCache(appointments: Appointment[]) {
    this.cachedAppointments = [...appointments];
    this.saveCache();
    this.updateSyncTimestamp();
    if (this.queue.length === 0) {
      this.syncStatus = 'synced';
    }
    this.notify();
  }

  /**
   * Get cached appointments. Returns empty array if no cache exists.
   */
  getCachedAppointments(): Appointment[] {
    return [...this.cachedAppointments];
  }

  /**
   * Check if we have a local cache available.
   */
  hasCachedData(): boolean {
    return this.cachedAppointments.length > 0;
  }

  // ── Apply local optimistic updates to cache ────────────────────────────────

  private applyCacheCreate(appointments: Appointment[]) {
    this.cachedAppointments = [...this.cachedAppointments, ...appointments];
    this.saveCache();
  }

  private applyCacheUpdateStatus(id: string, status: Appointment['status']) {
    this.cachedAppointments = this.cachedAppointments.map(a =>
      a.id === id ? { ...a, status } : a
    );
    this.saveCache();
  }

  private applyCacheDelete(id: string) {
    this.cachedAppointments = this.cachedAppointments.filter(a => a.id !== id);
    this.saveCache();
  }

  private applyCacheReschedule(id: string, newDate: string, newStartTime: string, newEndTime: string, isRecException?: boolean) {
    this.cachedAppointments = this.cachedAppointments.map(a =>
      a.id === id ? { ...a, date: newDate, startTime: newStartTime, endTime: newEndTime, isRecurrenceException: isRecException } : a
    );
    this.saveCache();
  }

  private applyCacheBulkCancel(recurrenceId: string, fromDate: string) {
    this.cachedAppointments = this.cachedAppointments.map(a => {
      if (a.recurrenceId === recurrenceId && a.date >= fromDate && a.status !== 'cancelled') {
        return { ...a, status: 'cancelled' as const };
      }
      return a;
    });
    this.saveCache();
  }

  private applyCacheBulkDelete(recurrenceId: string, fromDate: string) {
    this.cachedAppointments = this.cachedAppointments.filter(
      a => !(a.recurrenceId === recurrenceId && a.date >= fromDate)
    );
    this.saveCache();
  }

  // ── Queue Operations ───────────────────────────────────────────────────────

  private enqueue(type: OfflineOperationType, payload: any): QueuedOperation {
    const op: QueuedOperation = {
      id: `sched-q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      payload,
      queuedAt: new Date().toISOString(),
      retryCount: 0,
    };
    this.queue.push(op);
    this.saveQueue();
    this.syncStatus = this.isOnline ? 'syncing' : 'offline';
    this.notify();

    // Try to process immediately if online
    if (this.isOnline && !this.isSyncing) {
      setTimeout(() => this.processQueue(), 200);
    }

    return op;
  }

  /**
   * Queue a create operation. Applies optimistic update to cache.
   */
  queueCreate(appointment: Appointment) {
    this.applyCacheCreate([appointment]);
    this.enqueue('create', { appointment });
  }

  /**
   * Queue a bulk create operation (recurring series).
   */
  queueCreateBulk(appointments: Appointment[]) {
    this.applyCacheCreate(appointments);
    this.enqueue('createBulk', { appointments });
  }

  /**
   * Queue a status update.
   */
  queueUpdateStatus(id: string, status: Appointment['status']) {
    this.applyCacheUpdateStatus(id, status);
    this.enqueue('updateStatus', { id, status });
  }

  /**
   * Queue a delete operation.
   */
  queueDelete(id: string) {
    this.applyCacheDelete(id);
    this.enqueue('delete', { id });
  }

  /**
   * Queue a reschedule operation.
   */
  queueReschedule(id: string, newDate: string, newStartTime: string, newEndTime: string, isRecException?: boolean) {
    this.applyCacheReschedule(id, newDate, newStartTime, newEndTime, isRecException);
    this.enqueue('reschedule', { id, newDate, newStartTime, newEndTime, isRecException });
  }

  /**
   * Queue a bulk reschedule.
   */
  queueBulkReschedule(recurrenceId: string, fromDate: string, dayTimeShifts: any[]) {
    // We don't apply local cache changes for bulk reschedule (too complex) — just queue
    this.enqueue('bulkReschedule', { recurrenceId, fromDate, dayTimeShifts });
  }

  /**
   * Queue a bulk cancel.
   */
  queueBulkCancel(recurrenceId: string, fromDate: string) {
    this.applyCacheBulkCancel(recurrenceId, fromDate);
    this.enqueue('bulkCancel', { recurrenceId, fromDate });
  }

  /**
   * Queue a bulk delete.
   */
  queueBulkDelete(recurrenceId: string, fromDate: string) {
    this.applyCacheBulkDelete(recurrenceId, fromDate);
    this.enqueue('bulkDelete', { recurrenceId, fromDate });
  }

  // ── Queue Processing ───────────────────────────────────────────────────────

  async processQueue(): Promise<{ processed: number; failed: number }> {
    if (this.queue.length === 0) {
      this.syncStatus = this.lastSyncedAt ? 'synced' : 'idle';
      this.isSyncing = false;
      this.notify();
      return { processed: 0, failed: 0 };
    }

    if (!this.isOnline) {
      this.syncStatus = 'offline';
      this.isSyncing = false;
      this.notify();
      return { processed: 0, failed: this.queue.length };
    }

    if (this.isSyncing) {
      return { processed: 0, failed: 0 };
    }

    this.isSyncing = true;
    this.syncStatus = 'syncing';
    this.lastError = null;
    this.notify();

    let processed = 0;
    let failed = 0;
    const toProcess = [...this.queue].filter(op => op.retryCount < MAX_RETRIES);
    const deadOps = this.queue.filter(op => op.retryCount >= MAX_RETRIES);

    for (const op of toProcess) {
      try {
        const success = await this.executeOperation(op);
        if (success) {
          this.queue = this.queue.filter(q => q.id !== op.id);
          processed++;
        } else {
          this.queue = this.queue.map(q =>
            q.id === op.id ? { ...q, retryCount: q.retryCount + 1, lastError: 'Operation failed' } : q
          );
          failed++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        this.queue = this.queue.map(q =>
          q.id === op.id ? { ...q, retryCount: q.retryCount + 1, lastError: msg } : q
        );
        failed++;
        this.lastError = msg;
      }
    }

    // Remove dead-letter operations
    if (deadOps.length > 0) {
      const deadIds = new Set(deadOps.map(d => d.id));
      this.queue = this.queue.filter(q => !deadIds.has(q.id));
      failed += deadOps.length;
    }

    this.saveQueue();
    this.isSyncing = false;

    if (processed > 0) {
      this.updateSyncTimestamp();
    }

    if (failed > 0 && processed > 0) {
      this.syncStatus = 'partial';
      this.lastError = `${failed} operation(s) failed to sync`;
    } else if (failed > 0) {
      this.syncStatus = 'error';
      this.lastError = this.lastError || `${failed} operation(s) failed`;
      this.scheduleRetry();
    } else {
      this.syncStatus = 'synced';
      this.lastError = null;
    }

    this.notify();
    return { processed, failed };
  }

  private async executeOperation(op: QueuedOperation): Promise<boolean> {
    switch (op.type) {
      case 'create': {
        const { error } = await createAppointmentInDB(op.payload.appointment);
        return !error;
      }
      case 'createBulk': {
        const { error } = await createAppointmentsBulkInDB(op.payload.appointments);
        return !error;
      }
      case 'updateStatus': {
        const { error } = await updateAppointmentStatusInDB(op.payload.id, op.payload.status);
        return !error;
      }
      case 'delete': {
        const { error } = await deleteAppointmentInDB(op.payload.id);
        return !error;
      }
      case 'reschedule': {
        const { id, newDate, newStartTime, newEndTime, isRecException } = op.payload;
        const { error } = await rescheduleAppointmentInDB(id, newDate, newStartTime, newEndTime, isRecException);
        return !error;
      }
      case 'bulkReschedule': {
        const { recurrenceId, fromDate, dayTimeShifts } = op.payload;
        const { error } = await bulkRescheduleInDB(recurrenceId, fromDate, dayTimeShifts);
        return !error;
      }
      case 'bulkCancel': {
        const { recurrenceId, fromDate } = op.payload;
        const { error } = await bulkCancelInDB(recurrenceId, fromDate);
        return !error;
      }
      case 'bulkDelete': {
        const { recurrenceId, fromDate } = op.payload;
        const { error } = await bulkDeleteInDB(recurrenceId, fromDate);
        return !error;
      }
      default:
        return false;
    }
  }

  private scheduleRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const maxRetry = Math.max(...this.queue.map(q => q.retryCount), 1);
    const delay = Math.min(RETRY_BASE_DELAY * Math.pow(2, maxRetry - 1), 60000);
    this.retryTimer = setTimeout(() => {
      if (this.isOnline && this.queue.length > 0) {
        this.processQueue();
      }
    }, delay);
  }

  // ── Force Sync ─────────────────────────────────────────────────────────────

  async forceSync(): Promise<{ processed: number; failed: number }> {
    this.queue = this.queue.map(q => ({ ...q, retryCount: 0, lastError: undefined }));
    this.saveQueue();
    return this.processQueue();
  }

  // ── Clear Queue ────────────────────────────────────────────────────────────

  clearQueue() {
    this.queue = [];
    this.saveQueue();
    this.lastError = null;
    this.syncStatus = this.isOnline ? (this.lastSyncedAt ? 'synced' : 'idle') : 'offline';
    this.notify();
  }

  // ── State & Subscriptions ──────────────────────────────────────────────────

  getState(): ScheduleOfflineState {
    return {
      syncStatus: this.syncStatus,
      isOnline: this.isOnline,
      pendingCount: this.queue.length,
      lastSyncedAt: this.lastSyncedAt,
      lastError: this.lastError,
      isSyncing: this.isSyncing,
      cachedAppointmentCount: this.cachedAppointments.length,
    };
  }

  getQueue(): QueuedOperation[] {
    return [...this.queue];
  }

  getOnlineStatus(): boolean {
    return this.isOnline;
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const state = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch (e) {
        console.warn('[ScheduleOffline] Listener error:', e);
      }
    }
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  destroy() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.connectivityInterval) clearInterval(this.connectivityInterval);
    this.listeners.clear();
  }
}

// Export singleton
export const scheduleOffline = new ScheduleOfflineService();
