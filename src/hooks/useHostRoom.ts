import { useCallback } from "react";
import { useStore } from '@tanstack/react-store';
import { appStore } from "../stores/appStore";
import { roomActions, initializeHostRoom, handleConnectionError } from "../stores/appStore.actions";
import type { P2PNetwork } from "../lib/p2p";

interface UseHostRoomReturn {
  /** Whether currently creating a room */
  isCreating: boolean;
  /** Error from last create attempt, if any */
  error: Error | null;
  /** Create a new room as host and connect Automerge Repo */
  createRoom: (options: {
    network: P2PNetwork;
    documentUrl: string;
    connectToRoom: (network: P2PNetwork) => Promise<boolean>;
  }) => Promise<{ code: string; success: boolean }>;
  /** Clear any error */
  clearError: () => void;
}

/**
 * Hook for hosting a P2P room
 *
 * Refactored to use TanStack Store for state management.
 *
 * Handles the host-specific flow:
 * 1. Create room on signaling server with document URL
 * 2. Set room code to trigger document loading (updates store)
 * 3. Connect Automerge Repo to P2P network
 *
 * @example
 * ```tsx
 * function BoardView() {
 *   const { network } = useP2PNetwork();
 *   const { createRoom, isCreating, error } = useHostRoom();
 *
 *   const handleCreateRoom = async () => {
 *     const { code, success } = await createRoom({
 *       network,
 *       documentUrl: boardUrl,
 *       connectToRoom,
 *     });
 *     // Room code is automatically set in store on success
 *   };
 * }
 * ```
 */
export function useHostRoom(): UseHostRoomReturn {
  // Subscribe to room state from store
  const isCreating = useStore(appStore, (state) => state.room.isConnecting);
  const error = useStore(appStore, (state) => state.room.error);

  const createRoom = useCallback(async (options: {
    network: P2PNetwork;
    documentUrl: string;
    connectToRoom: (network: P2PNetwork) => Promise<boolean>;
  }): Promise<{ code: string; success: boolean }> => {
    const { network, documentUrl, connectToRoom } = options;

    if (!network) {
      handleConnectionError(new Error("P2P network not initialized"));
      return { code: "", success: false };
    }

    if (!documentUrl) {
      handleConnectionError(new Error("Document URL required for hosting"));
      return { code: "", success: false };
    }

    roomActions.setIsConnecting(true);
    roomActions.setError(null);

    try {
      // Step 1: Create room on signaling server with document URL
      const { code } = await network.createRoom({ documentUrl });
      console.log("[useHostRoom] Created room:", code, "Document:", documentUrl);

      // Step 2: Connect Automerge Repo to P2P network
      const success = await connectToRoom(network);

      if (success) {
        console.log("[useHostRoom] Successfully connected Automerge Repo");
        // Update store with room info
        initializeHostRoom(code, documentUrl);
        return { code, success: true };
      } else {
        // Cleanup: leave P2P room if repo connection failed
        await network.leaveRoom();
        const err = new Error("Failed to connect Automerge Repo");
        handleConnectionError(err);
        return { code: "", success: false };
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to create room");
      console.error("[useHostRoom] Failed to create room:", error);
      handleConnectionError(error);
      return { code: "", success: false };
    }
  }, []);

  const clearError = useCallback(() => {
    roomActions.setError(null);
  }, []);

  return {
    isCreating,
    error,
    createRoom,
    clearError,
  };
}
