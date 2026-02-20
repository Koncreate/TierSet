import { createStorage, type Storage } from "unstorage";
import localStorageDriver from "unstorage/drivers/localstorage";
import memoryDriver from "unstorage/drivers/memory";
import type { BoardDocument, BoardId } from "../documents";
import type { AutomergeUrl } from "@automerge/react";
import { getRepo } from "../automerge/AutomergeRepoProvider";

export interface BoardSummary {
  id: BoardId;
  name: string;
  description?: string;
  updatedAt: number;
  itemCount: number;
  tierCount: number;
}

interface BoardUrlRecord {
  automergeUrl: AutomergeUrl;
  boardId: BoardId;
  updatedAt: number;
}

/**
 * Board storage using unstorage for URL mapping + Repo for document storage
 *
 * The Repo's IndexedDBStorageAdapter handles the actual document storage.
 * This layer just maps boardId -> AutomergeUrl for lookup.
 */
export interface BoardStorage {
  /**
   * Get a board document by ID
   */
  getBoard(id: BoardId): Promise<BoardDocument | null>;

  /**
   * Get raw binary data for a board (for export/backup)
   */
  getBoardBinary(id: BoardId): Promise<Uint8Array | null>;

  /**
   * Save a board document (creates if not exists)
   */
  saveBoard(id: BoardId, doc: BoardDocument): Promise<void>;

  /**
   * Delete a board
   */
  deleteBoard(id: BoardId): Promise<void>;

  /**
   * List all boards
   */
  listBoards(): Promise<BoardSummary[]>;

  /**
   * Export a board to a downloadable blob
   */
  exportBoard(id: BoardId): Promise<Blob | null>;

  /**
   * Import a board from a file
   */
  importBoard(file: File): Promise<BoardId>;
}

/**
 * Create board storage with unstorage backend for URL mapping
 */
export function createBoardStorage(kvBinding?: KVNamespace): BoardStorage {
  const isBrowser = typeof window !== "undefined" && typeof window.localStorage !== "undefined";

  // Storage for boardId -> AutomergeUrl mapping
  const urlStorage = createStorage<BoardUrlRecord>({
    driver: kvBinding
      ? createKVDriver(kvBinding)
      : isBrowser
        ? localStorageDriver({ base: "tierboard-urls:" })
        : memoryDriver(),
  });

  return {
    async getBoard(id: BoardId): Promise<BoardDocument | null> {
      try {
        const repo = getRepo();
        const record = await urlStorage.getItem(`board:${id}`);
        
        if (!record) {
          return null;
        }

        // Find document in repo by URL
        const handle = repo.find<BoardDocument>(record.automergeUrl);
        await handle.whenReady();
        
        const doc = handle.doc();
        return doc || null;
      } catch (error) {
        console.error("[BoardStorage] Failed to get board:", error);
        return null;
      }
    },

    async getBoardBinary(id: BoardId): Promise<Uint8Array | null> {
      try {
        const repo = getRepo();
        const record = await urlStorage.getItem(`board:${id}`);
        
        if (!record) {
          return null;
        }

        const handle = repo.find<BoardDocument>(record.automergeUrl);
        await handle.whenReady();
        
        // Save to binary for export
        const doc = handle.doc();
        if (!doc) return null;
        
        // Use Automerge's save function
        const { save } = await import("@automerge/automerge");
        return save(doc);
      } catch (error) {
        console.error("[BoardStorage] Failed to get board binary:", error);
        return null;
      }
    },

    async saveBoard(id: BoardId, doc: BoardDocument): Promise<void> {
      try {
        const repo = getRepo();
        
        // Check if we already have a URL for this boardId
        const existingRecord = await urlStorage.getItem(`board:${id}`);
        
        if (existingRecord) {
          // Document should already be in repo, just update metadata
          await urlStorage.setItem(`board:${id}`, {
            ...existingRecord,
            updatedAt: Date.now(),
          });
        } else {
          // Create new document in repo with the board data
          // The repo will handle storage automatically
          const handle = repo.create<BoardDocument>({
            ...doc,
            updatedAt: Date.now(),
          });
          
          // Store the URL mapping
          await urlStorage.setItem(`board:${id}`, {
            automergeUrl: handle.url,
            boardId: id,
            updatedAt: Date.now(),
          });
        }
      } catch (error) {
        console.error("[BoardStorage] Failed to save board:", error);
        throw error;
      }
    },

    async deleteBoard(id: BoardId): Promise<void> {
      await urlStorage.removeItem(`board:${id}`);
      // Note: The actual document remains in Repo storage
      // In a production app, you might want to implement document deletion
    },

    async listBoards(): Promise<BoardSummary[]> {
      try {
        const keys = await urlStorage.getKeys("board:");
        const boards: BoardSummary[] = [];

        for (const key of keys) {
          const record = await urlStorage.getItem(key);
          if (!record) continue;

          try {
            const repo = getRepo();
            const handle = repo.find<BoardDocument>(record.automergeUrl);
            await handle.whenReady();
            
            const doc = handle.doc();
            if (!doc) continue;

            boards.push({
              id: doc.id,
              name: doc.name,
              description: doc.description,
              updatedAt: record.updatedAt,
              itemCount: doc.items.length,
              tierCount: doc.tiers.length,
            });
          } catch (error) {
            console.warn("[BoardStorage] Failed to load board for listing:", key, error);
          }
        }

        return boards.sort((a, b) => b.updatedAt - a.updatedAt);
      } catch (error) {
        console.error("[BoardStorage] Failed to list boards:", error);
        return [];
      }
    },

    async exportBoard(id: BoardId): Promise<Blob | null> {
      const board = await this.getBoard(id);
      if (!board) return null;

      const json = JSON.stringify(board, null, 2);
      return new Blob([json], { type: "application/json" });
    },

    async importBoard(file: File): Promise<BoardId> {
      const text = await file.text();
      const boardData = JSON.parse(text) as BoardDocument;
      
      // Generate new ID for imported board
      const { createId } = await import("../ids");
      const newId = createId();
      
      // Save using standard saveBoard (which creates in Repo)
      await this.saveBoard(newId, {
        ...boardData,
        id: newId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      
      return newId;
    },
  };
}

// KV driver type for Cloudflare Workers
interface KVNamespace {
  get(key: string): Promise<any>;
  put(key: string, value: any): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string }): Promise<{ keys: { name: string }[] }>;
}

function createKVDriver(kvBinding: KVNamespace) {
  return {
    async getItem(key: string) {
      try {
        return await kvBinding.get(key);
      } catch {
        return null;
      }
    },
    async setItem(key: string, value: any) {
      await kvBinding.put(key, value);
    },
    async removeItem(key: string) {
      await kvBinding.delete(key);
    },
    async getKeys(prefix?: string) {
      const result = await kvBinding.list(prefix ? { prefix } : undefined);
      return result.keys.map((k) => k.name);
    },
  };
}

// Default storage instance
let defaultStorage: BoardStorage | null = null;

export function getBoardStorage(): BoardStorage {
  if (!defaultStorage) {
    defaultStorage = createBoardStorage();
  }
  return defaultStorage;
}
