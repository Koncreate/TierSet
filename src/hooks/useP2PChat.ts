import { useState, useEffect, useCallback, useRef } from "react";
import type { P2PNetwork } from "../lib/p2p";
import type { ChatMessage, ChatMessageStore } from "../lib/chat/ChatMessageStore";
import { createChatMessageStore } from "../lib/chat/ChatMessageStore";

interface UseP2PChatOptions {
  boardId: string;
  network?: P2PNetwork | null;
  store?: ChatMessageStore;
  maxMessages?: number;
}

interface UseP2PChatReturn {
  messages: ChatMessage[];
  sendMessage: (content: string) => Promise<void>;
  clearMessages: () => Promise<void>;
  isLoading: boolean;
  error: Error | null;
  isConnected: boolean;
  peerCount: number;
}

/**
 * Hook for managing P2P chat with message persistence
 */
export function useP2PChat(options: UseP2PChatOptions): UseP2PChatReturn {
  const { boardId, network, maxMessages = 100 } = options;
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [peerCount, setPeerCount] = useState(0);
  
  // Store reference
  const storeRef = useRef<ChatMessageStore>(
    options.store ?? createChatMessageStore(),
  );
  
  // Track peer ID for sender info
  const peerIdRef = useRef<string>("");

  // Load messages on mount
  useEffect(() => {
    let mounted = true;

    async function loadMessages() {
      try {
        setIsLoading(true);
        const loadedMessages = await storeRef.current.getMessages(boardId, maxMessages);
        if (mounted) {
          setMessages(loadedMessages);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error("Failed to load messages"));
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadMessages();

    return () => {
      mounted = false;
    };
  }, [boardId, maxMessages]);

  // Set up P2P network listeners
  useEffect(() => {
    if (!network) {
      setIsConnected(false);
      setPeerCount(0);
      return;
    }

    // Store peer ID
    peerIdRef.current = network.id;

    // Update connection status
    const updateConnection = () => {
      const status = network.getStatus();
      setIsConnected(status === "connected");
      setPeerCount(network.getPeers().length);
    };

    updateConnection();

    // Listen for chat messages from peers
    const handleChatMessage = (message: ChatMessage, senderId: string) => {
      // Don't add our own messages twice
      if (senderId === peerIdRef.current) return;

      // Add to local state
      setMessages((prev) => {
        const updated = [...prev, message].slice(-maxMessages);
        return updated;
      });

      // Persist to storage
      storeRef.current.addMessage(boardId, message).catch((err) => {
        console.error("Failed to persist chat message:", err);
      });
    };

    network.on("chat:received", handleChatMessage);
    network.on("status:changed", updateConnection);
    network.on("peer:joined", updateConnection);
    network.on("peer:left", updateConnection);

    return () => {
      network.off("chat:received", handleChatMessage);
      network.off("status:changed", updateConnection);
      network.off("peer:joined", updateConnection);
      network.off("peer:left", updateConnection);
    };
  }, [boardId, maxMessages, network]);

  // Send chat message
  const sendMessage = useCallback(
    async (content: string) => {
      if (!network || !content.trim()) return;

      const message: ChatMessage = {
        id: crypto.randomUUID(),
        boardId,
        senderId: peerIdRef.current || network.id,
        senderName: "Peer", // Could be enhanced with peer name
        content: content.trim(),
        timestamp: Date.now(),
      };

      // Add to local state immediately (optimistic update)
      setMessages((prev) => [...prev, message].slice(-maxMessages));

      // Persist to storage
      await storeRef.current.addMessage(boardId, message);

      // Send to peers via P2P network
      try {
        network.sendChatMessage(boardId, content);
      } catch (err) {
        console.error("Failed to send chat message:", err);
        setError(err instanceof Error ? err : new Error("Failed to send message"));
      }
    },
    [boardId, maxMessages, network],
  );

  // Clear all messages
  const clearMessages = useCallback(async () => {
    setMessages([]);
    await storeRef.current.clearMessages(boardId);
  }, [boardId]);

  return {
    messages,
    sendMessage,
    clearMessages,
    isLoading,
    error,
    isConnected,
    peerCount,
  };
}
