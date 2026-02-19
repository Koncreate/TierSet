import { createStorage, type Storage } from "unstorage";

/**
 * Chat message interface
 */
export interface ChatMessage {
  id: string;
  boardId: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
}

/**
 * Chat message store for persisting P2P chat messages
 * 
 * Uses unstorage for automatic driver selection:
 * - Production (Cloudflare Workers): KV storage
 * - Development: localStorage or in-memory
 */
export interface ChatMessageStore {
  /**
   * Save a chat message
   */
  addMessage(boardId: string, message: ChatMessage): Promise<void>;

  /**
   * Get all messages for a board
   */
  getMessages(boardId: string, limit?: number): Promise<ChatMessage[]>;

  /**
   * Clear messages for a board
   */
  clearMessages(boardId: string): Promise<void>;

  /**
   * Get recent messages across all boards (for UI preview)
   */
  getRecentMessages(limit?: number): Promise<ChatMessage[]>;

  /**
   * Delete old messages (cleanup)
   */
  deleteOldMessages(maxAgeMs: number): Promise<number>;
}

/**
 * Create chat message store with unstorage backend
 */
export function createChatMessageStore(kvBinding?: KVNamespace): ChatMessageStore {
  // Create storage with appropriate driver
  // In Cloudflare Workers, use KV; in browser, use localStorage
  const storage = createStorage({
    driver: kvBinding ? createKVDriver(kvBinding) : undefined,
  });

  return {
    async addMessage(boardId: string, message: ChatMessage): Promise<void> {
      const key = `chat:${boardId}:${message.timestamp}:${message.id}`;
      await storage.set(key, message);
    },

    async getMessages(boardId: string, limit = 100): Promise<ChatMessage[]> {
      const keys = await storage.getKeys(`chat:${boardId}:`);
      
      // Sort by timestamp (newest last for chronological order)
      const sortedKeys = keys.sort();
      
      // Get last N messages
      const messageKeys = sortedKeys.slice(-limit);
      
      const messages: ChatMessage[] = [];
      for (const key of messageKeys) {
        const message = await storage.get<ChatMessage>(key);
        if (message) {
          messages.push(message);
        }
      }
      
      return messages;
    },

    async clearMessages(boardId: string): Promise<void> {
      const keys = await storage.getKeys(`chat:${boardId}:`);
      await Promise.all(keys.map((key) => storage.removeItem(key)));
    },

    async getRecentMessages(limit = 50): Promise<ChatMessage[]> {
      const keys = await storage.getKeys("chat:");
      
      // Sort all keys
      const sortedKeys = keys.sort();
      
      // Get last N messages across all boards
      const messageKeys = sortedKeys.slice(-limit);
      
      const messages: ChatMessage[] = [];
      for (const key of messageKeys) {
        const message = await storage.get<ChatMessage>(key);
        if (message) {
          messages.push(message);
        }
      }
      
      return messages;
    },

    async deleteOldMessages(maxAgeMs: number): Promise<number> {
      const keys = await storage.getKeys("chat:");
      const now = Date.now();
      let deleted = 0;

      for (const key of keys) {
        const message = await storage.get<ChatMessage>(key);
        if (message && now - message.timestamp > maxAgeMs) {
          await storage.removeItem(key);
          deleted++;
        }
      }

      return deleted;
    },
  };
}

/**
 * Create unstorage driver for Cloudflare KV binding
 */
function createKVDriver(kv: KVNamespace) {
  return {
    async hasKey(key: string) {
      const value = await kv.get(key);
      return value !== null;
    },

    async getItem(key: string) {
      const value = await kv.get(key);
      if (value === null) return null;
      return JSON.parse(value as string);
    },

    async setItem(key: string, value: any) {
      await kv.put(key, JSON.stringify(value));
    },

    async removeItem(key: string) {
      await kv.delete(key);
    },

    async getKeys(base: string) {
      // KV doesn't support prefix-based listing in the same way
      // This is a simplified implementation
      const keys: string[] = [];
      let cursor: string | undefined;
      
      do {
        const result = await kv.list({ prefix: base, cursor });
        keys.push(...result.keys.map((k) => k.name));
        cursor = result.cursor;
      } while (cursor);
      
      return keys;
    },
  };
}

/**
 * In-memory chat store for testing
 */
export function createInMemoryChatStore(): ChatMessageStore {
  const messages = new Map<string, ChatMessage>();

  return {
    async addMessage(boardId: string, message: ChatMessage): Promise<void> {
      const key = `chat:${boardId}:${message.timestamp}:${message.id}`;
      messages.set(key, message);
    },

    async getMessages(boardId: string, limit = 100): Promise<ChatMessage[]> {
      const keys = Array.from(messages.keys())
        .filter((key) => key.startsWith(`chat:${boardId}:`))
        .sort()
        .slice(-limit);

      return keys.map((key) => messages.get(key)!).filter(Boolean);
    },

    async clearMessages(boardId: string): Promise<void> {
      const keys = Array.from(messages.keys()).filter((key) =>
        key.startsWith(`chat:${boardId}:`),
      );
      keys.forEach((key) => messages.delete(key));
    },

    async getRecentMessages(limit = 50): Promise<ChatMessage[]> {
      return Array.from(messages.values())
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-limit);
    },

    async deleteOldMessages(maxAgeMs: number): Promise<number> {
      const now = Date.now();
      let deleted = 0;

      for (const [key, message] of messages.entries()) {
        if (now - message.timestamp > maxAgeMs) {
          messages.delete(key);
          deleted++;
        }
      }

      return deleted;
    },
  };
}
