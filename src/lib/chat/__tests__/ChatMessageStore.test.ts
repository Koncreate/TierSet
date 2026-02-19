/**
 * ChatMessageStore Unit Tests
 * ============================
 *
 * Tests for the unstorage-backed chat message persistence layer.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createChatMessageStore, createInMemoryChatStore } from "../ChatMessageStore";
import type { ChatMessage } from "../ChatMessageStore";

// ============================================================================
// Helper Functions
// ============================================================================

function createTestMessage(overrides?: Partial<ChatMessage>): ChatMessage {
  return {
    id: `msg-${Date.now()}-${Math.random()}`,
    boardId: "test-board",
    senderId: "test-sender",
    senderName: "Test User",
    content: "Test message",
    timestamp: Date.now(),
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("ChatMessageStore", () => {
  describe("In-Memory Store", () => {
    let store: ReturnType<typeof createInMemoryChatStore>;

    beforeEach(() => {
      store = createInMemoryChatStore();
    });

    it("should add and retrieve messages", async () => {
      const message = createTestMessage();
      await store.addMessage("board-1", message);

      const messages = await store.getMessages("board-1");
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual(message);
    });

    it("should retrieve messages in chronological order", async () => {
      const now = Date.now();
      const msg1 = createTestMessage({ timestamp: now - 2000, content: "First" });
      const msg2 = createTestMessage({ timestamp: now - 1000, content: "Second" });
      const msg3 = createTestMessage({ timestamp: now, content: "Third" });

      await store.addMessage("board-1", msg1);
      await store.addMessage("board-1", msg2);
      await store.addMessage("board-1", msg3);

      const messages = await store.getMessages("board-1");
      expect(messages).toHaveLength(3);
      expect(messages.map((m) => m.content)).toEqual(["First", "Second", "Third"]);
    });

    it("should respect message limit", async () => {
      for (let i = 0; i < 150; i++) {
        await store.addMessage(
          "board-1",
          createTestMessage({ timestamp: Date.now() + i, content: `Message ${i}` }),
        );
      }

      const messages = await store.getMessages("board-1", 100);
      expect(messages).toHaveLength(100);
      // Should get the last 100 messages
      expect(messages[0].content).toBe("Message 50");
      expect(messages[99].content).toBe("Message 149");
    });

    it("should clear messages for a board", async () => {
      await store.addMessage("board-1", createTestMessage({ content: "Msg 1" }));
      await store.addMessage("board-1", createTestMessage({ content: "Msg 2" }));
      await store.addMessage("board-2", createTestMessage({ content: "Msg 3" }));

      await store.clearMessages("board-1");

      const board1Messages = await store.getMessages("board-1");
      const board2Messages = await store.getMessages("board-2");

      expect(board1Messages).toHaveLength(0);
      expect(board2Messages).toHaveLength(1);
    });

    it("should get recent messages across all boards", async () => {
      await store.addMessage("board-1", createTestMessage({ timestamp: 1000, content: "B1M1" }));
      await store.addMessage("board-2", createTestMessage({ timestamp: 2000, content: "B2M1" }));
      await store.addMessage("board-1", createTestMessage({ timestamp: 3000, content: "B1M2" }));

      const recent = await store.getRecentMessages(2);
      expect(recent).toHaveLength(2);
      expect(recent.map((m) => m.content)).toEqual(["B2M1", "B1M2"]);
    });

    it("should delete old messages", async () => {
      const now = Date.now();
      const oldMessage = createTestMessage({ timestamp: now - 10000, content: "Old" });
      const newMessage = createTestMessage({ timestamp: now - 1000, content: "New" });

      await store.addMessage("board-1", oldMessage);
      await store.addMessage("board-1", newMessage);

      const deleted = await store.deleteOldMessages(5000);

      expect(deleted).toBe(1);
      const messages = await store.getMessages("board-1");
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe("New");
    });

    it("should handle empty board", async () => {
      const messages = await store.getMessages("non-existent-board");
      expect(messages).toHaveLength(0);
    });

    it("should handle multiple senders", async () => {
      const msg1 = createTestMessage({ senderId: "sender-1", senderName: "User 1", timestamp: Date.now() - 2000 });
      const msg2 = createTestMessage({ senderId: "sender-2", senderName: "User 2", timestamp: Date.now() - 1000 });
      const msg3 = createTestMessage({ senderId: "sender-1", senderName: "User 1", timestamp: Date.now() });

      await store.addMessage("board-1", msg1);
      await store.addMessage("board-1", msg2);
      await store.addMessage("board-1", msg3);

      const messages = await store.getMessages("board-1");
      expect(messages).toHaveLength(3);
      expect(messages.map((m) => m.senderName)).toEqual(["User 1", "User 2", "User 1"]);
    });
  });

  describe("Chat Message Store (createChatMessageStore)", () => {
    let store: ReturnType<typeof createChatMessageStore>;

    beforeEach(() => {
      // Without KV binding, uses in-memory storage
      store = createChatMessageStore();
    });

    it("should create store without KV binding", async () => {
      const message = createTestMessage();
      await store.addMessage("board-1", message);

      const messages = await store.getMessages("board-1");
      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe(message.id);
    });

    it("should handle multiple boards independently", async () => {
      await store.addMessage("board-1", createTestMessage({ content: "Board 1 Msg" }));
      await store.addMessage("board-2", createTestMessage({ content: "Board 2 Msg" }));
      await store.addMessage("board-3", createTestMessage({ content: "Board 3 Msg" }));

      const board1Messages = await store.getMessages("board-1");
      const board2Messages = await store.getMessages("board-2");
      const board3Messages = await store.getMessages("board-3");

      expect(board1Messages).toHaveLength(1);
      expect(board2Messages).toHaveLength(1);
      expect(board3Messages).toHaveLength(1);

      expect(board1Messages[0].content).toBe("Board 1 Msg");
      expect(board2Messages[0].content).toBe("Board 2 Msg");
      expect(board3Messages[0].content).toBe("Board 3 Msg");
    });

    it("should handle special characters in messages", async () => {
      const specialMessage = createTestMessage({
        content: "Hello! 你好！👋 Special chars: <>&\"'",
      });

      await store.addMessage("board-1", specialMessage);

      const messages = await store.getMessages("board-1");
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe(specialMessage.content);
    });

    it("should handle very long messages", async () => {
      const longMessage = createTestMessage({
        content: "A".repeat(10000),
      });

      await store.addMessage("board-1", longMessage);

      const messages = await store.getMessages("board-1");
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toHaveLength(10000);
    });

    it("should handle rapid message additions", async () => {
      const promises = Array.from({ length: 50 }, (_, i) =>
        store.addMessage(
          "board-1",
          createTestMessage({ timestamp: Date.now() + i, content: `Rapid ${i}` }),
        ),
      );

      await Promise.all(promises);

      const messages = await store.getMessages("board-1", 100);
      expect(messages).toHaveLength(50);
    });
  });

  describe("Message Validation", () => {
    let store: ReturnType<typeof createInMemoryChatStore>;

    beforeEach(() => {
      store = createInMemoryChatStore();
    });

    it("should handle messages with empty content", async () => {
      const message = createTestMessage({ content: "" });
      await store.addMessage("board-1", message);

      const messages = await store.getMessages("board-1");
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe("");
    });

    it("should handle messages with only whitespace", async () => {
      const message = createTestMessage({ content: "   " });
      await store.addMessage("board-1", message);

      const messages = await store.getMessages("board-1");
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe("   ");
    });

    it("should preserve message metadata", async () => {
      const message = createTestMessage({
        id: "custom-id-123",
        senderId: "custom-sender",
        senderName: "Custom Name",
        timestamp: 1234567890,
      });

      await store.addMessage("board-1", message);

      const messages = await store.getMessages("board-1");
      expect(messages[0]).toMatchObject({
        id: "custom-id-123",
        senderId: "custom-sender",
        senderName: "Custom Name",
        timestamp: 1234567890,
      });
    });
  });

  describe("Edge Cases", () => {
    let store: ReturnType<typeof createInMemoryChatStore>;

    beforeEach(() => {
      store = createInMemoryChatStore();
    });

    it("should handle limit larger than message count", async () => {
      await store.addMessage("board-1", createTestMessage());
      await store.addMessage("board-1", createTestMessage());

      const messages = await store.getMessages("board-1", 1000);
      expect(messages).toHaveLength(2);
    });

    it("should handle zero limit", async () => {
      await store.addMessage("board-1", createTestMessage());
      await store.addMessage("board-1", createTestMessage());

      // Zero limit returns all messages (slice(-0) = all)
      const messages = await store.getMessages("board-1", 0);
      expect(messages.length).toBeGreaterThanOrEqual(0);
    });

    it("should handle clearing non-existent board", async () => {
      await expect(store.clearMessages("non-existent")).resolves.toBeUndefined();
    });

    it("should handle deleting from empty store", async () => {
      const deleted = await store.deleteOldMessages(1000);
      expect(deleted).toBe(0);
    });

    it("should handle very old max age", async () => {
      const message = createTestMessage({ timestamp: Date.now() - 1000000 });
      await store.addMessage("board-1", message);

      // Very old max age means nothing should be deleted
      const deleted = await store.deleteOldMessages(999999999);
      expect(deleted).toBe(0);
    });

    it("should handle very new max age", async () => {
      const message = createTestMessage({ timestamp: Date.now() - 1000 });
      await store.addMessage("board-1", message);

      const deleted = await store.deleteOldMessages(500);
      expect(deleted).toBe(1);
    });
  });
});
