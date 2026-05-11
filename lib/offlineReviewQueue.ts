/**
 * Offline Review Queue Service
 * 
 * Manages a persistent queue of food photo review operations that can be
 * processed when connectivity is available. Provides:
 * - Queue persistence via localStorage (web) / in-memory fallback (native)
 * - Network connectivity monitoring with online/offline events
 * - Automatic retry with exponential backoff
 * - Queue status reporting (count, last synced timestamp)
 * - Batch processing for efficiency
 */

import { supabase } from './supabase';
import { toPhotoData } from './foodReviewService';
import type { FoodPhotoEntry, ReviewStatus } from '../data/foodPhotoData';
import { Platform } from 'react-native';

// ── Types ──

export interface QueuedReview {
  id: string;               // Unique queue entry ID
  photoId: string;
  clientId: string;
  clientName: string;
  dietitianName: string;
  franchise: string;
  photoUri: string;
  meal: string;
  photoDate: string;
  photoTime: string;
  description: string;
  reviewStatus: ReviewStatus;
  dietitianFeedback?: string;
  reviewedAt?: string;
  queuedAt: string;          // ISO timestamp when queued
  retryCount: number;
  lastError?: string;
}

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error' | 'partial';

export interface QueueState {
  syncStatus: SyncStatus;
  queueCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  isOnline: boolean;
  processingCount: number;
}

type QueueListener = (state: QueueState) => void;

// ── Storage Helpers ──

const STORAGE_KEY = 'ew_food_review_queue';
const SYNC_TIMESTAMP_KEY = 'ew_food_review_last_sync';
const MAX_RETRIES = 5;
const BATCH_SIZE = 15;
const RETRY_BASE_DELAY = 2000; // 2 seconds

function persistToStorage(key: string, value: string): void {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch (e) {
    // Storage full or unavailable - silently fail
    console.warn('[OfflineQueue] Storage write failed:', e);
  }
}

function readFromStorage(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch (e) {
    console.warn('[OfflineQueue] Storage read failed:', e);
  }
  return null;
}

function removeFromStorage(key: string): void {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch (e) {
    // ignore
  }
}

// ── Queue Manager (Singleton) ──

class OfflineReviewQueue {
  private queue: QueuedReview[] = [];
  private listeners: Set<QueueListener> = new Set();
  private isOnline: boolean = true;
  private syncStatus: SyncStatus = 'idle';
  private lastSyncedAt: string | null = null;
  private lastError: string | null = null;
  private processingCount: number = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private initialized: boolean = false;
  private connectivityCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.init();
  }

  // ── Initialization ──

  private init() {
    if (this.initialized) return;
    this.initialized = true;

    // Load persisted queue
    this.loadQueue();
    this.loadLastSyncTimestamp();

    // Set up connectivity monitoring
    this.setupConnectivityMonitoring();

    // If we have queued items and are online, process them
    if (this.queue.length > 0 && this.isOnline) {
      setTimeout(() => this.processQueue(), 1000);
    }
  }

  private loadQueue() {
    const stored = readFromStorage(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          this.queue = parsed;
        }
      } catch (e) {
        console.warn('[OfflineQueue] Failed to parse stored queue:', e);
        this.queue = [];
      }
    }
  }

  private saveQueue() {
    try {
      persistToStorage(STORAGE_KEY, JSON.stringify(this.queue));
    } catch (e) {
      // ignore
    }
  }

  private loadLastSyncTimestamp() {
    const stored = readFromStorage(SYNC_TIMESTAMP_KEY);
    if (stored) {
      this.lastSyncedAt = stored;
    }
  }

  private updateLastSyncTimestamp() {
    this.lastSyncedAt = new Date().toISOString();
    persistToStorage(SYNC_TIMESTAMP_KEY, this.lastSyncedAt);
  }

  // ── Connectivity Monitoring ──

  private setupConnectivityMonitoring() {
    // Web: use navigator.onLine + events
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      this.isOnline = navigator.onLine;

      window.addEventListener('online', () => {
        this.isOnline = true;
        this.notifyListeners();
        // Auto-process queue when coming back online
        if (this.queue.length > 0) {
          setTimeout(() => this.processQueue(), 500);
        }
      });

      window.addEventListener('offline', () => {
        this.isOnline = false;
        this.syncStatus = 'offline';
        this.notifyListeners();
      });
    }

    // Periodic connectivity check:
    // - On web: use navigator.onLine (cross-origin fetch to google.com causes CORS errors)
    // - On native: use a lightweight HEAD request
    if (Platform.OS === 'web') {
      this.connectivityCheckInterval = setInterval(() => {
        if (typeof navigator !== 'undefined') {
          const wasOffline = !this.isOnline;
          this.isOnline = navigator.onLine;
          if (wasOffline && this.isOnline && this.queue.length > 0) {
            this.processQueue();
          }
          if (wasOffline && this.isOnline) {
            this.notifyListeners();
          }
          if (!wasOffline && !this.isOnline) {
            this.syncStatus = 'offline';
            this.notifyListeners();
          }
        }
      }, 30000);
    } else {
      this.connectivityCheckInterval = setInterval(() => {
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

      const wasOffline = !this.isOnline;
      this.isOnline = response.ok || response.status === 204;

      if (wasOffline && this.isOnline) {
        // Came back online
        if (this.queue.length > 0) {
          this.processQueue();
        }
        this.notifyListeners();
      }
    } catch {
      // If fetch fails, we're offline
      const wasOnline = this.isOnline;
      this.isOnline = false;
      this.syncStatus = 'offline';
      if (wasOnline) this.notifyListeners();
    }
  }


  // ── Queue Operations ──

  /**
   * Enqueue a review operation. Returns immediately for optimistic UI.
   * The review will be persisted and synced when possible.
   */
  enqueue(photo: FoodPhotoEntry, reviewStatus: ReviewStatus, feedback?: string): QueuedReview {
    const entry: QueuedReview = {
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      photoId: photo.id,
      clientId: photo.clientId,
      clientName: photo.clientName,
      dietitianName: photo.dietitianName,
      franchise: photo.franchise,
      photoUri: photo.photoUri,
      meal: photo.meal,
      photoDate: photo.date,
      photoTime: photo.time,
      description: photo.description,
      reviewStatus,
      dietitianFeedback: feedback,
      reviewedAt: reviewStatus !== 'pending' ? new Date().toISOString() : undefined,
      queuedAt: new Date().toISOString(),
      retryCount: 0,
    };

    // Remove any existing queue entry for the same photo (latest wins)
    this.queue = this.queue.filter(q => q.photoId !== photo.id);
    this.queue.push(entry);
    this.saveQueue();
    this.notifyListeners();

    // Try to process immediately if online
    if (this.isOnline && this.syncStatus !== 'syncing') {
      setTimeout(() => this.processQueue(), 100);
    }

    return entry;
  }

  /**
   * Enqueue multiple reviews at once (for day-level batch reviews).
   */
  enqueueBatch(
    photos: FoodPhotoEntry[],
    reviewStatus: ReviewStatus,
    feedback?: string
  ): QueuedReview[] {
    const entries: QueuedReview[] = [];
    const now = Date.now();

    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      const entry: QueuedReview = {
        id: `q-${now}-${i}-${Math.random().toString(36).slice(2, 8)}`,
        photoId: photo.id,
        clientId: photo.clientId,
        clientName: photo.clientName,
        dietitianName: photo.dietitianName,
        franchise: photo.franchise,
        photoUri: photo.photoUri,
        meal: photo.meal,
        photoDate: photo.date,
        photoTime: photo.time,
        description: photo.description,
        reviewStatus,
        dietitianFeedback: feedback,
        reviewedAt: reviewStatus !== 'pending' ? new Date().toISOString() : undefined,
        queuedAt: new Date().toISOString(),
        retryCount: 0,
      };

      // Remove existing entry for same photo
      this.queue = this.queue.filter(q => q.photoId !== photo.id);
      this.queue.push(entry);
      entries.push(entry);
    }

    this.saveQueue();
    this.notifyListeners();

    // Try to process immediately if online
    if (this.isOnline && this.syncStatus !== 'syncing') {
      setTimeout(() => this.processQueue(), 100);
    }

    return entries;
  }

  /**
   * Remove a specific item from the queue (e.g., on rollback).
   */
  dequeue(photoId: string): void {
    this.queue = this.queue.filter(q => q.photoId !== photoId);
    this.saveQueue();
    this.notifyListeners();
  }

  /**
   * Remove multiple items from the queue.
   */
  dequeueBatch(photoIds: string[]): void {
    const idSet = new Set(photoIds);
    this.queue = this.queue.filter(q => !idSet.has(q.photoId));
    this.saveQueue();
    this.notifyListeners();
  }

  /**
   * Clear the entire queue.
   */
  clearQueue(): void {
    this.queue = [];
    this.saveQueue();
    this.lastError = null;
    this.syncStatus = 'idle';
    this.notifyListeners();
  }

  // ── Queue Processing ──

  /**
   * Process all queued reviews by batch-syncing to the server.
   */
  async processQueue(): Promise<{ success: boolean; processed: number; failed: number }> {
    if (this.queue.length === 0) {
      this.syncStatus = this.lastSyncedAt ? 'synced' : 'idle';
      this.notifyListeners();
      return { success: true, processed: 0, failed: 0 };
    }

    if (!this.isOnline) {
      this.syncStatus = 'offline';
      this.notifyListeners();
      return { success: false, processed: 0, failed: this.queue.length };
    }

    if (this.syncStatus === 'syncing') {
      // Already processing
      return { success: false, processed: 0, failed: 0 };
    }

    this.syncStatus = 'syncing';
    this.lastError = null;
    this.notifyListeners();

    let totalProcessed = 0;
    let totalFailed = 0;

    // Process in batches
    const itemsToProcess = [...this.queue].filter(q => q.retryCount < MAX_RETRIES);
    const deadLetterItems = this.queue.filter(q => q.retryCount >= MAX_RETRIES);

    for (let i = 0; i < itemsToProcess.length; i += BATCH_SIZE) {
      const batch = itemsToProcess.slice(i, i + BATCH_SIZE);
      this.processingCount = batch.length;
      this.notifyListeners();

      try {
        const result = await this.processBatch(batch);

        if (result.success) {
          // Remove successfully processed items from queue
          const processedIds = batch.map(b => b.photoId);
          this.queue = this.queue.filter(q => !processedIds.includes(q.photoId));
          totalProcessed += batch.length;
        } else if (result.partialSuccess && result.failedIds) {
          // Remove successful items, keep failed ones with incremented retry
          const failedSet = new Set(result.failedIds);
          const successIds = batch.filter(b => !failedSet.has(b.photoId)).map(b => b.photoId);
          
          this.queue = this.queue.map(q => {
            if (failedSet.has(q.photoId)) {
              return { ...q, retryCount: q.retryCount + 1, lastError: result.error || 'Partial failure' };
            }
            return q;
          }).filter(q => !successIds.includes(q.photoId));

          totalProcessed += successIds.length;
          totalFailed += result.failedIds.length;
        } else {
          // Full batch failure - increment retry counts
          this.queue = this.queue.map(q => {
            const inBatch = batch.find(b => b.photoId === q.photoId);
            if (inBatch) {
              return { ...q, retryCount: q.retryCount + 1, lastError: result.error || 'Batch failed' };
            }
            return q;
          });
          totalFailed += batch.length;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        // Increment retry counts for the batch
        this.queue = this.queue.map(q => {
          const inBatch = batch.find(b => b.photoId === q.photoId);
          if (inBatch) {
            return { ...q, retryCount: q.retryCount + 1, lastError: msg };
          }
          return q;
        });
        totalFailed += batch.length;
        this.lastError = msg;
      }
    }

    // Remove dead letter items (exceeded max retries)
    if (deadLetterItems.length > 0) {
      const deadIds = new Set(deadLetterItems.map(d => d.photoId));
      this.queue = this.queue.filter(q => !deadIds.has(q.photoId));
      totalFailed += deadLetterItems.length;
    }

    this.processingCount = 0;
    this.saveQueue();

    if (totalProcessed > 0) {
      this.updateLastSyncTimestamp();
    }

    if (totalFailed > 0 && totalProcessed > 0) {
      this.syncStatus = 'partial';
      this.lastError = `${totalFailed} review(s) failed to sync`;
    } else if (totalFailed > 0) {
      this.syncStatus = 'error';
      this.lastError = this.lastError || `${totalFailed} review(s) failed to sync`;
      // Schedule retry with exponential backoff
      this.scheduleRetry();
    } else {
      this.syncStatus = 'synced';
      this.lastError = null;
    }

    this.notifyListeners();
    return { success: totalFailed === 0, processed: totalProcessed, failed: totalFailed };
  }

  private async processBatch(
    batch: QueuedReview[]
  ): Promise<{ success: boolean; partialSuccess?: boolean; failedIds?: string[]; error?: string }> {
    // Build the batch-sync payload
    const reviews = batch.map(q => ({
      photo_id: q.photoId,
      client_id: q.clientId,
      client_name: q.clientName,
      dietitian_name: q.dietitianName,
      franchise: q.franchise,
      photo_uri: q.photoUri,
      meal: q.meal,
      photo_date: q.photoDate,
      photo_time: q.photoTime,
      description: q.description,
      review_status: q.reviewStatus,
      reviewed_at: q.reviewedAt || null,
      dietitian_feedback: q.dietitianFeedback || null,
    }));

    const { data, error } = await supabase.functions.invoke('manage-food-reviews', {
      body: {
        action: 'batch-sync',
        reviews,
      },
    });

    if (error) {
      return { success: false, error: error.message || 'Network error' };
    }

    if (data && data.success === false) {
      return { success: false, error: data.error || 'Batch sync failed' };
    }

    return { success: true };
  }

  private scheduleRetry() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }

    // Find the max retry count in the queue for backoff calculation
    const maxRetry = Math.max(...this.queue.map(q => q.retryCount), 1);
    const delay = Math.min(RETRY_BASE_DELAY * Math.pow(2, maxRetry - 1), 60000); // Max 60s

    this.retryTimer = setTimeout(() => {
      if (this.isOnline && this.queue.length > 0) {
        this.processQueue();
      }
    }, delay);
  }

  // ── Force Sync ──

  /**
   * Force an immediate sync attempt, regardless of current state.
   */
  async forceSync(): Promise<{ success: boolean; processed: number; failed: number }> {
    // Reset retry counts to allow re-processing
    this.queue = this.queue.map(q => ({ ...q, retryCount: 0, lastError: undefined }));
    this.saveQueue();
    return this.processQueue();
  }

  // ── State & Listeners ──

  getState(): QueueState {
    return {
      syncStatus: this.syncStatus,
      queueCount: this.queue.length,
      lastSyncedAt: this.lastSyncedAt,
      lastError: this.lastError,
      isOnline: this.isOnline,
      processingCount: this.processingCount,
    };
  }

  getQueue(): QueuedReview[] {
    return [...this.queue];
  }

  subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    // Immediately notify with current state
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
        console.warn('[OfflineQueue] Listener error:', e);
      }
    }
  }

  // ── Cleanup ──

  destroy() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }
    if (this.connectivityCheckInterval) {
      clearInterval(this.connectivityCheckInterval);
    }
    this.listeners.clear();
  }
}

// Export singleton instance
export const offlineReviewQueue = new OfflineReviewQueue();

// Export hook-friendly helpers
export function getQueueState(): QueueState {
  return offlineReviewQueue.getState();
}

export function subscribeToQueue(listener: QueueListener): () => void {
  return offlineReviewQueue.subscribe(listener);
}
