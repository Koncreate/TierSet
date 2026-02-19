import { useState, useEffect, useCallback, useRef } from "react";
import type { BoardDocument, BoardId, BoardChangeFn } from "../lib/documents";
import { storage } from "../lib/storage";
import {
  changeBoardDocument,
  getDocumentDelta,
  mergeDocumentChanges,
} from "../lib/documents/BoardDocument";
import type { ConnectionStatus } from "../lib/p2p";
import { P2PNetwork } from "../lib/p2p";

interface UseBoardDocumentOptions {
  network?: P2PNetwork | null;
}

interface UseBoardDocumentReturn {
  doc: BoardDocument | null;
  change: (callback: BoardChangeFn) => void;
  isLoading: boolean;
  error: Error | null;
  save: () => Promise<void>;
  reload: () => Promise<void>;
  syncStatus: "syncing" | "synced" | "error" | "disconnected";
  connectedPeers: number;
}

/**
 * Hook for managing board document with P2P sync
 */
export function useBoardDocument(
  boardId: BoardId,
  options?: UseBoardDocumentOptions,
): UseBoardDocumentReturn {
  const [doc, setDoc] = useState<BoardDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [syncStatus, setSyncStatus] = useState<"syncing" | "synced" | "error" | "disconnected">(
    "disconnected",
  );
  const [connectedPeers, setConnectedPeers] = useState(0);
  const docRef = useRef<BoardDocument | null>(null);
  const networkRef = useRef<P2PNetwork | null>(options?.network ?? null);

  // Keep ref in sync with state
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  // Update network ref when options change
  useEffect(() => {
    networkRef.current = options?.network ?? null;
    // Update sync status based on network connection
    if (!options?.network) {
      setSyncStatus("disconnected");
      setConnectedPeers(0);
    } else {
      const peers = options.network.getPeers();
      setConnectedPeers(peers.length);
      setSyncStatus(options.network.getStatus() === "connected" ? "synced" : "disconnected");
    }
  }, [options?.network]);

  // Load board from storage on mount
  useEffect(() => {
    let mounted = true;

    async function loadBoard() {
      try {
        const board = await storage.boards.getBoard(boardId);
        if (mounted) {
          setDoc(board);
          docRef.current = board;
          setIsLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error("Failed to load board"));
          setIsLoading(false);
        }
      }
    }

    loadBoard();

    return () => {
      mounted = false;
    };
  }, [boardId]);

  // Set up P2P sync listeners
  useEffect(() => {
    const network = options?.network;
    if (!network) return;

    // Listen for sync messages from peers
    const handleSyncReceived = (delta: Uint8Array, senderId: string) => {
      const currentDoc = docRef.current;
      if (!currentDoc) return;

      try {
        setSyncStatus("syncing");

        // Merge remote changes into local document
        const merged = mergeDocumentChanges(currentDoc, delta);
        if (merged) {
          setDoc(merged);
          docRef.current = merged;

          // Persist merged document to storage
          storage.boards.saveBoard(boardId, merged).catch((err) => {
            console.error("Failed to save merged board:", err);
          });

          setSyncStatus("synced");
        } else {
          setSyncStatus("error");
        }
      } catch (err) {
        console.error("Failed to merge sync from peer:", senderId, err);
        setSyncStatus("error");
      }
    };

    // Listen for peer changes
    const handlePeerJoined = () => {
      const peers = network.getPeers();
      setConnectedPeers(peers.length);
      if (network.getStatus() === "connected") {
        setSyncStatus("synced");
      }
    };

    const handlePeerLeft = () => {
      const peers = network.getPeers();
      setConnectedPeers(peers.length);
    };

    const handleStatusChanged = (status: ConnectionStatus) => {
      if (status === "connected") {
        setSyncStatus("synced");
      } else if (status === "disconnected" || status === "failed") {
        setSyncStatus("disconnected");
      }
    };

    network.on("sync:received", handleSyncReceived);
    network.on("peer:joined", handlePeerJoined);
    network.on("peer:left", handlePeerLeft);
    network.on("status:changed", handleStatusChanged);

    return () => {
      network.off("sync:received", handleSyncReceived);
      network.off("peer:joined", handlePeerJoined);
      network.off("peer:left", handlePeerLeft);
      network.off("status:changed", handleStatusChanged);
    };
  }, [boardId, options?.network]);

  // Save board to storage whenever it changes
  const save = useCallback(async () => {
    const currentDoc = docRef.current;
    if (!currentDoc) return;
    try {
      await storage.boards.saveBoard(boardId, currentDoc);
    } catch (err) {
      console.error("Failed to save board:", err);
    }
  }, [boardId]);

  // Reload board from storage
  const reload = useCallback(async () => {
    try {
      const board = await storage.boards.getBoard(boardId);
      setDoc(board);
      docRef.current = board;
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to reload board"));
    }
  }, [boardId]);

  // Change function with Automerge, auto-save, and P2P sync
  const change = useCallback(
    (callback: BoardChangeFn) => {
      const currentDoc = docRef.current;
      const network = networkRef.current;
      if (!currentDoc) return;

      // Apply change using Automerge
      const updatedDoc = changeBoardDocument(currentDoc, callback);
      setDoc(updatedDoc);
      docRef.current = updatedDoc;

      // Persist to storage
      save();

      // Sync to peers if connected
      if (network && network.getStatus() === "connected") {
        try {
          const delta = getDocumentDelta(updatedDoc);
          network.sendSync(boardId, delta);
        } catch (err) {
          console.error("Failed to send sync:", err);
          setSyncStatus("error");
        }
      }
    },
    [boardId, save],
  );

  return {
    doc,
    change,
    isLoading,
    error,
    save,
    reload,
    syncStatus,
    connectedPeers,
  };
}
