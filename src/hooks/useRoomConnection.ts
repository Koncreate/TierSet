import { useCallback, useEffect, useRef, useState } from "react";
import { useRepo, connectRepoToNetwork, disconnectRepoFromNetwork } from "../lib/automerge/AutomergeRepoProvider";
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
 * Handles connection lifecycle, error handling, and cleanup automatically.
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
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const connectToRoom = useCallback(
    async (network: P2PNetwork): Promise<boolean> => {
      if (!repo) {
        setError(new Error("Repo not available"));
        return false;
      }

      setIsConnecting(true);
      setError(null);
      lastNetworkRef.current = network;

      try {
        const { adapter } = await connectRepoToNetwork(repo, network);
        adapterRef.current = adapter;
        setIsConnected(true);
        return true;
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Failed to connect to room");
        console.error("[useRoomConnection] Connection failed:", error);
        setError(error);
        setIsConnected(false);
        return false;
      } finally {
        setIsConnecting(false);
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
        setIsConnected(false);
        setError(null);
      }
    }
  }, [repo]);

  const retry = useCallback(async (): Promise<boolean> => {
    // If we have a previous network, try to reconnect
    if (lastNetworkRef.current) {
      console.log("[useRoomConnection] Retrying connection");
      return await connectToRoom(lastNetworkRef.current);
    }
    
    setError(new Error("No previous connection to retry"));
    return false;
  }, [connectToRoom]);

  // Auto-cleanup on unmount
  useEffect(() => {
    return () => {
      disconnectFromRoom();
    };
  }, [disconnectFromRoom]);

  return {
    isConnected,
    isConnecting,
    error,
    connectToRoom,
    disconnectFromRoom,
    retry,
  };
}
