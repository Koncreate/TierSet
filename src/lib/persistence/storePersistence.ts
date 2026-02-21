/**
 * TanStack Store Persistence Layer
 *
 * Provides functions to save, load, and subscribe to TanStack Store state
 * in IndexedDB using Dexie.
 */

import type { Store } from "@tanstack/store";
import { db, type StoreSnapshot } from "../storage/db";
import type {
  PersistedStoreName,
  PersistenceConfig,
  LoadSnapshotResult,
  UnsubscribeFn,
  DataTransformFn,
} from "./types";
import {
  DEFAULT_CONFIG,
  isStoreSnapshot,
  isSnapshotExpired,
  isValidAppStoreSnapshot,
  isValidUserSettingsSnapshot,
} from "./types";

// ============================================================================
// Configuration
// ============================================================================

let config: PersistenceConfig = { ...DEFAULT_CONFIG };

/**
 * Update persistence configuration
 */
export function configurePersistence(newConfig: Partial<PersistenceConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * Get current configuration
 */
export function getConfig(): PersistenceConfig {
  return { ...config };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if running in browser (not SSR)
 */
function isClient(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

/**
 * Log debug messages if enabled
 */
function log(...args: unknown[]): void {
  if (config.debug) {
    console.log("[StorePersistence]", ...args);
  }
}

/**
 * Log error messages (always logged, never thrown)
 */
function logError(message: string, error?: unknown): void {
  console.error("[StorePersistence]", message, error ?? "");
}

/**
 * Serialize data to JSON string with error handling
 */
function serialize(data: Record<string, unknown>): string | null {
  try {
    return JSON.stringify(data);
  } catch (error) {
    logError("Failed to serialize data", error);
    return null;
  }
}

/**
 * Validate snapshot data structure
 */
function isValidSnapshotData(data: unknown): data is Record<string, unknown> {
  return typeof data === "object" && data !== null;
}

// ============================================================================
// Core Persistence Functions
// ============================================================================

/**
 * Save a store snapshot to IndexedDB
 *
 * @param storeName - Name of the store to persist
 * @param data - Store state to save
 * @returns Promise that resolves when save is complete
 */
export async function saveStoreSnapshot(
  storeName: PersistedStoreName,
  data: Record<string, unknown>
): Promise<void> {
  if (!isClient()) {
    log("Skipping save - not in browser environment");
    return;
  }

  try {
    const serialized = serialize(data);
    if (serialized === null) {
      return; // Serialization failed, error already logged
    }

    const now = Date.now();
    const snapshot: StoreSnapshot = {
      id: storeName,
      data,
      updatedAt: now,
      expiresAt: now + config.snapshotExpiryMs,
    };

    await db.stores.put(snapshot);
    log(`Saved snapshot for ${storeName}`);
  } catch (error) {
    logError(`Failed to save snapshot for ${storeName}`, error);
    // Don't throw - persistence failures should not crash the app
  }
}

/**
 * Load a store snapshot from IndexedDB
 *
 * @param storeName - Name of the store to load
 * @returns LoadSnapshotResult with loaded data or error info
 */
export async function loadStoreSnapshot<T extends Record<string, unknown>>(
  storeName: PersistedStoreName
): Promise<LoadSnapshotResult<T>> {
  if (!isClient()) {
    log("Skipping load - not in browser environment");
    return { found: false, valid: false, data: null };
  }

  try {
    const snapshot = await db.stores.get(storeName);

    if (!snapshot) {
      log(`No snapshot found for ${storeName}`);
      return { found: false, valid: false, data: null };
    }

    // Check if expired
    if (isSnapshotExpired(snapshot)) {
      log(`Snapshot expired for ${storeName}, clearing...`);
      await db.stores.delete(storeName);
      return { found: true, valid: false, data: null, error: "Snapshot expired" };
    }

    // Validate structure
    if (!isStoreSnapshot(snapshot) || !isValidSnapshotData(snapshot.data)) {
      logError(`Invalid snapshot structure for ${storeName}`);
      return {
        found: true,
        valid: false,
        data: null,
        error: "Invalid snapshot structure",
      };
    }

    // Validate store-specific schema
    if (storeName === "appStore" && !isValidAppStoreSnapshot(snapshot.data)) {
      logError(`Invalid appStore snapshot data`);
      return {
        found: true,
        valid: false,
        data: null,
        error: "Invalid appStore snapshot data",
      };
    }

    if (
      storeName === "userSettingsStore" &&
      !isValidUserSettingsSnapshot(snapshot.data)
    ) {
      logError(`Invalid userSettingsStore snapshot data`);
      return {
        found: true,
        valid: false,
        data: null,
        error: "Invalid userSettingsStore snapshot data",
      };
    }

    log(`Loaded snapshot for ${storeName}`);
    return {
      found: true,
      valid: true,
      data: snapshot.data as T,
    };
  } catch (error) {
    logError(`Failed to load snapshot for ${storeName}`, error);
    return {
      found: false,
      valid: false,
      data: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Clear a store snapshot from IndexedDB
 *
 * @param storeName - Name of the store to clear
 */
export async function clearStoreSnapshot(
  storeName: PersistedStoreName
): Promise<void> {
  if (!isClient()) {
    log("Skipping clear - not in browser environment");
    return;
  }

  try {
    await db.stores.delete(storeName);
    log(`Cleared snapshot for ${storeName}`);
  } catch (error) {
    logError(`Failed to clear snapshot for ${storeName}`, error);
  }
}

/**
 * Subscribe to store changes and auto-save with debouncing
 *
 * @param storeName - Name of the store to persist
 * @param store - TanStack Store instance
 * @param keysToPersist - Array of top-level keys to persist (for selective persistence)
 * @param transformFn - Optional function to transform/filter data before saving
 * @returns Unsubscribe function
 */
export function subscribeToStoreChanges(
  storeName: PersistedStoreName,
  store: Store<Record<string, unknown>>,
  keysToPersist?: string[],
  transformFn?: DataTransformFn
): UnsubscribeFn {
  if (!isClient()) {
    log("Skipping subscription - not in browser environment");
    return () => {};
  }

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const saveDebounced = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      const state = store.state;
      let dataToSave = keysToPersist
        ? Object.fromEntries(
            Object.entries(state).filter(([key]) => keysToPersist.includes(key))
          )
        : state;

      // Apply transform function if provided (for filtering nested fields)
      if (transformFn) {
        dataToSave = transformFn(dataToSave);
      }

      saveStoreSnapshot(storeName, dataToSave);
      debounceTimer = null;
    }, config.debounceMs);
  };

  // Subscribe to store changes
  const unsubscribe = store.subscribe(() => {
    saveDebounced();
  });

  log(`Subscribed to changes for ${storeName}`);

  // Return unsubscribe function that also clears debounce timer
  return () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    unsubscribe();
    log(`Unsubscribed from ${storeName}`);
  };
}

// ============================================================================
// Cleanup Functions
// ============================================================================

/**
 * Clean up expired snapshots
 *
 * @param maxAge - Maximum age in milliseconds (default: 24h)
 */
export async function cleanupExpiredSnapshots(
  maxAge: number = config.snapshotExpiryMs
): Promise<void> {
  if (!isClient()) {
    log("Skipping cleanup - not in browser environment");
    return;
  }

  try {
    const now = Date.now();
    const cutoff = now - maxAge;

    // Get all snapshots
    const allSnapshots = await db.stores.toArray();

    // Find expired ones
    const expiredIds = allSnapshots
      .filter((snapshot) => {
        if (snapshot.expiresAt) {
          return now > snapshot.expiresAt;
        }
        return snapshot.updatedAt < cutoff;
      })
      .map((snapshot) => snapshot.id);

    if (expiredIds.length > 0) {
      await db.stores.bulkDelete(expiredIds);
      log(`Cleaned up ${expiredIds.length} expired snapshots`);
    }
  } catch (error) {
    logError("Failed to cleanup expired snapshots", error);
  }
}

/**
 * Clear all store snapshots (useful for debugging or reset)
 */
export async function clearAllSnapshots(): Promise<void> {
  if (!isClient()) {
    log("Skipping clear all - not in browser environment");
    return;
  }

  try {
    await db.stores.clear();
    log("Cleared all store snapshots");
  } catch (error) {
    logError("Failed to clear all snapshots", error);
  }
}

/**
 * Initialize persistence on app startup
 * - Cleans up expired snapshots
 * - Logs initialization status
 */
export async function initializePersistence(): Promise<void> {
  if (!isClient()) {
    log("Skipping initialization - not in browser environment");
    return;
  }

  log("Initializing persistence layer...");
  await cleanupExpiredSnapshots();
  log("Persistence layer initialized");
}

// ============================================================================
// Helper for Selective Key Extraction
// ============================================================================

/**
 * Extract specific keys from store state for persistence
 *
 * @param state - Full store state
 * @param keys - Keys to extract
 * @returns Object with only the specified keys
 */
export function extractKeysForPersistence<T extends Record<string, unknown>>(
  state: T,
  keys: (keyof T)[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in state) {
      result[key as string] = state[key];
    }
  }
  return result;
}

/**
 * Check if snapshot exists for a store (useful for debugging)
 */
export async function hasSnapshot(
  storeName: PersistedStoreName
): Promise<boolean> {
  if (!isClient()) {
    return false;
  }

  try {
    const snapshot = await db.stores.get(storeName);
    return !!snapshot && !isSnapshotExpired(snapshot);
  } catch {
    return false;
  }
}
