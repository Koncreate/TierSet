import { db } from "./db";
import { bracketStorage } from "./BracketStore";
import { imageStore } from "./ImageStore";
import { createBoardStorage, type BoardStorage } from "../board/board-storage-unstorage";

/**
 * Main storage facade - combines all storage operations
 */
export class Storage {
  boards: BoardStorage;
  brackets = bracketStorage;
  images = imageStore;

  constructor(kvBinding?: KVNamespace) {
    this.boards = createBoardStorage(kvBinding);
  }

  /**
   * Get a preference value
   */
  async getPreference<T>(key: string, defaultValue?: T): Promise<T | undefined> {
    const record = await db.preferences.get(key);
    if (record === undefined) return defaultValue;
    return record?.value as T;
  }

  /**
   * Set a preference value
   */
  async setPreference<T>(key: string, value: T): Promise<void> {
    await db.preferences.put({ key, value });
  }

  /**
   * Delete a preference
   */
  async deletePreference(key: string): Promise<void> {
    await db.preferences.delete(key);
  }

  /**
   * Get cached data
   */
  async getCache<T>(key: string): Promise<T | null> {
    const record = await db.cache.get(key);
    if (!record) return null;

    if (record.expiresAt < Date.now()) {
      await db.cache.delete(key);
      return null;
    }

    return record.data as T;
  }

  /**
   * Set cached data with expiry
   */
  async setCache<T>(key: string, data: T, ttlMs: number): Promise<void> {
    await db.cache.put({
      key,
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Clear expired cache entries
   */
  async clearExpiredCache(): Promise<number> {
    const now = Date.now();
    const expired = await db.cache.filter((c) => c.expiresAt < now).toArray();

    for (const record of expired) {
      await db.cache.delete(record.key);
    }

    return expired.length;
  }

  /**
   * Get total storage stats
   */
  async getStats(): Promise<{
    boardCount: number;
    imageCount: number;
    imageStorageBytes: number;
  }> {
    const boards = await this.boards.listBoards();
    const images = await db.images.count();
    const imageUsage = await this.images.getStorageUsage();

    return {
      boardCount: boards.length,
      imageCount: images,
      imageStorageBytes: imageUsage.estimatedSize,
    };
  }

  /**
   * Clear all data (factory reset)
   */
  async clearAll(): Promise<void> {
    // Clear board storage
    const boardKeys = await this.boards.listBoards();
    for (const board of boardKeys) {
      await this.boards.deleteBoard(board.id);
    }

    // Clear Dexie stores
    await db.tables.forEach(async (table) => {
      if (table.name !== "boards") {
        // Boards now handled by unstorage
        await table.clear();
      }
    });
  }
}

// Create storage instance - will be initialized with KV binding in Cloudflare Workers
export const storage = new Storage();
