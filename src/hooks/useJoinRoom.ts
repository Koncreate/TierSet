import { useCallback } from "react";
import { useStore } from '@tanstack/react-store';
import { appStore } from "../stores/appStore";
import { joinRoomAsClient, handleConnectionError } from "../stores/appStore.actions";
import { decodeRoomCode } from "../lib/p2p/room-code";
import type { P2PNetwork } from "../lib/p2p";

interface UseJoinRoomReturn {
  /** Whether currently joining a room */
  isJoining: boolean;
  /** Error from last join attempt, if any */
  error: Error | null;
  /** Join an existing room as client and connect Automerge Repo */
  joinRoom: (options: {
    code: string;
    network: P2PNetwork;
    connectToRoom: (network: P2PNetwork) => Promise<boolean>;
    password?: string;
  }) => Promise<{ documentUrl: string | null; success: boolean }>;
  /** Clear any error */
  clearError: () => void;
}

/**
 * Hook for joining a P2P room as a client
 *
 * Refactored to use TanStack Store for state management.
 *
 * Handles the client-specific flow:
 * 1. Decode document URL from room code
 * 2. Join room on signaling server
 * 3. Connect Automerge Repo to P2P network
 * 4. Update store with room info
 *
 * The document URL is extracted from the room code format:
 * `TIER-XXX--<base64-encoded-automerge-url>`
 *
 * @example
 * ```tsx
 * function BoardView() {
 *   const { network } = useP2PNetwork();
 *   const { joinRoom, isJoining, error } = useJoinRoom();
 *
 *   const handleJoinRoom = async (code: string) => {
 *     const { documentUrl, success } = await joinRoom({
 *       code,
 *       network,
 *       connectToRoom,
 *     });
 *     // Room code and document URL are automatically set in store on success
 *   };
 * }
 * ```
 */
export function useJoinRoom(): UseJoinRoomReturn {
  // Subscribe to room state from store
  const isJoining = useStore(appStore, (state) => state.room.isConnecting);
  const error = useStore(appStore, (state) => state.room.error);

  const joinRoom = useCallback(async (options: {
    code: string;
    network: P2PNetwork;
    connectToRoom: (network: P2PNetwork) => Promise<boolean>;
    password?: string;
  }): Promise<{ documentUrl: string | null; success: boolean }> => {
    const { code, network, connectToRoom, password } = options;

    if (!network) {
      handleConnectionError(new Error("P2P network not initialized"));
      return { documentUrl: null, success: false };
    }

    // CRITICAL: Decode document URL from room code FIRST
    // This is the key to ensuring client loads the correct document
    const decoded = decodeRoomCode(code);
    if (!decoded?.documentUrl) {
      const err = new Error("Invalid room code: no document URL found");
      handleConnectionError(err);
      return { documentUrl: null, success: false };
    }

    console.log("[useJoinRoom] Decoded document URL:", decoded.documentUrl);

    roomActions.setIsConnecting(true);
    roomActions.setError(null);

    try {
      // Step 1: Join P2P room on signaling server
      await network.joinRoom(code, password ? { password } : undefined);
      console.log("[useJoinRoom] Joined P2P room");

      // Step 2: Connect Automerge Repo to P2P network
      // The document URL is already decoded and will be used by useBoardDocument
      const success = await connectToRoom(network);

      if (success) {
        console.log("[useJoinRoom] Successfully connected Automerge Repo");
        // Update store with room info
        joinRoomAsClient(code, decoded.documentUrl);
        return { documentUrl: decoded.documentUrl, success: true };
      } else {
        // Cleanup: leave P2P room if repo connection failed
        await network.leaveRoom();
        const err = new Error("Failed to connect Automerge Repo");
        handleConnectionError(err);
        return { documentUrl: null, success: false };
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to join room");
      console.error("[useJoinRoom] Failed to join room:", error);
      handleConnectionError(error);
      return { documentUrl: null, success: false };
    }
  }, []);

  const clearError = useCallback(() => {
    roomActions.setError(null);
  }, []);

  return {
    isJoining,
    error,
    joinRoom,
    clearError,
  };
}
