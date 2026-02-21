import { useCallback, useRef } from "react";
import { useStore } from '@tanstack/react-store';
import { appStore } from "../stores/appStore";
import { roomActions, handleConnectionError } from "../stores/appStore.actions";
import { useRepo, connectRepoToNetwork, disconnectRepoFromNetwork } from "../lib/automerge/AutomergeRepoProvider";
import { clearStoreSnapshot } from "../lib/persistence/storePersistence";
import type { WebRTCNetworkAdapter } from "../lib/p2p/WebRTCNetworkAdapter";
import type { P2PNetwork } from "../lib/p2p";

interface UseRoomConnectionReturn {
  /** Whether currently connected to a room */
  isConnected: boolean;
  /** Whether a connection attempt is in progress */
  isConnecting: boolean;
  /** Error from last connection attempt, if any */
  error: Error | null;
  /** Connect to a room using the provided P2PNetwork */
  connectToRoom: (network: P2PNetwork) => Promise<boolean>;
  /** Disconnect from current room */
  disconnectFromRoom: () => Promise<void>;
  /** Retry the last failed connection attempt */
  retry: () => Promise<boolean>;
}

/**
 * Hook for managing Automerge Repo room connections
 *
 * Refactored to use TanStack Store for state management.
 *
 * @example
 * ```tsx
 * function BoardView() {
 *   const { network } = useP2PNetwork();
 *   const { isConnected, isConnecting, error, connectToRoom, disconnectFromRoom, retry } = useRoomConnection();
 *
 *   const handleCreateRoom = async () => {
 *     const { code } = await createRoom();
 *     const success = await connectToRoom(network);
 *     if (success) setRoomCode(code);
 *   };
 *
 *   return (
 *     <div>
 *       {error && (
 *         <div>
 *           <p>Connection failed: {error.message}</p>
 *           <button onClick={retry}>Retry</button>
 *         </div>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export function useRoomConnection(): UseRoomConnectionReturn {
  const repo = useRepo();
  const adapterRef = useRef<WebRTCNetworkAdapter | null>(null);
  const lastNetworkRef = useRef<P2PNetwork | null>(null);

  // Subscribe to room state from store
  const isConnected = useStore(appStore, (state) => state.room.isConnected);
  const isConnecting = useStore(appStore, (state) => state.room.isConnecting);
  const error = useStore(appStore, (state) => state.room.error);

  const connectToRoom = useCallback(
    async (network: P2PNetwork): Promise<boolean> => {
      if (!repo) {
        handleConnectionError(new Error("Repo not available"));
        return false;
      }

      roomActions.setIsConnecting(true);
      lastNetworkRef.current = network;

      try {
        const { adapter } = await connectRepoToNetwork(repo, network);
        adapterRef.current = adapter;
        roomActions.setIsConnected(true);
        return true;
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Failed to connect to room");
        console.error("[useRoomConnection] Connection failed:", error);
        handleConnectionError(error);
        return false;
      }
    },
    [repo]
  );

  const disconnectFromRoom = useCallback(async () => {
    if (adapterRef.current && repo) {
      try {
        await disconnectRepoFromNetwork(repo, adapterRef.current);
      } catch (err) {
        console.error("[useRoomConnection] Disconnect failed:", err);
      } finally {
        adapterRef.current = null;
        lastNetworkRef.current = null;
        roomActions.setIsConnected(false);
        roomActions.setIsConnecting(false);
        roomActions.setError(null);
        
        // Clear persisted room state on leave
        clearStoreSnapshot("appStore");
      }
    }
  }, [repo]);

  const retry = useCallback(async (): Promise<boolean> => {
    // If we have a previous network, try to reconnect
    if (lastNetworkRef.current) {
      console.log("[useRoomConnection] Retrying connection");
      return await connectToRoom(lastNetworkRef.current);
    }

    roomActions.setError(new Error("No previous connection to retry"));
    return false;
  }, [connectToRoom]);

  return {
    isConnected,
    isConnecting,
    error,
    connectToRoom,
    disconnectFromRoom,
    retry,
  };
}
