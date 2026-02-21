/**
 * TanStack Store Persistence - TypeScript Interfaces
 *
 * Type definitions for persisting TanStack Store state to IndexedDB.
 */

import type { StoreSnapshot, UserSettingRecord } from "../storage/db";

// Re-export DB types for convenience
export type { StoreSnapshot, UserSettingRecord };

/**
 * Store names that can be persisted
 */
export type PersistedStoreName = "appStore" | "userSettingsStore";

/**
 * Configuration for store persistence
 */
export interface PersistenceConfig {
  /** Debounce delay in milliseconds (default: 500ms) */
  debounceMs: number;
  /** Snapshot expiry time in milliseconds (default: 24h) */
  snapshotExpiryMs: number;
  /** Enable debug logging */
  debug: boolean;
}

/**
 * Default persistence configuration
 */
export const DEFAULT_CONFIG: PersistenceConfig = {
  debounceMs: 500,
  snapshotExpiryMs: 24 * 60 * 60 * 1000, // 24 hours
  debug: import.meta.env.DEV,
};

/**
 * Result of loading a store snapshot
 */
export interface LoadSnapshotResult<T extends Record<string, unknown>> {
  /** Whether a snapshot was found */
  found: boolean;
  /** Whether the snapshot was valid */
  valid: boolean;
  /** The loaded data, or null if not found/invalid */
  data: T | null;
  /** Error message if validation failed */
  error?: string;
}

/**
 * Unsubscribe function returned from subscribeToChanges
 */
export type UnsubscribeFn = () => void;

/**
 * Transform function for filtering/transforming data before save
 */
export type DataTransformFn = (data: Record<string, unknown>) => Record<string, unknown>;

/**
 * Type guard for StoreSnapshot
 */
export function isStoreSnapshot(data: unknown): data is StoreSnapshot {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.data === "object" &&
    typeof obj.updatedAt === "number"
  );
}

/**
 * Check if a snapshot has expired
 */
export function isSnapshotExpired(
  snapshot: StoreSnapshot,
  expiryMs: number = DEFAULT_CONFIG.snapshotExpiryMs
): boolean {
  if (snapshot.expiresAt) {
    return Date.now() > snapshot.expiresAt;
  }
  // If no explicit expiry, check based on updatedAt
  return Date.now() - snapshot.updatedAt > expiryMs;
}

/**
 * Validate appStore snapshot structure
 */
export function isValidAppStoreSnapshot(
  data: unknown
): data is { room?: { roomCode?: string | null; isHost?: boolean } } {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  
  // room is optional but if present, must be an object
  if ("room" in obj) {
    const room = obj.room;
    if (typeof room !== "object" || room === null) return false;
    
    const roomObj = room as Record<string, unknown>;
    // Validate room fields if present
    if ("roomCode" in roomObj && roomObj.roomCode !== null && typeof roomObj.roomCode !== "string") {
      return false;
    }
    if ("isHost" in roomObj && typeof roomObj.isHost !== "boolean") {
      return false;
    }
  }
  
  return true;
}

/**
 * Validate userSettingsStore snapshot structure
 */
export function isValidUserSettingsSnapshot(
  data: unknown
): data is Record<string, string | boolean | number> {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  
  // All values must be string, boolean, or number
  return Object.values(obj).every(
    (v) =>
      typeof v === "string" ||
      typeof v === "boolean" ||
      typeof v === "number"
  );
}
