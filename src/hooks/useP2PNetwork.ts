import { useState, useEffect, useCallback, useRef } from "react";
import { P2PNetwork } from "../lib/p2p";
import type { PeerInfo, ConnectionStatus, P2POptions } from "../lib/p2p";

interface UseP2PNetworkReturn {
  network: P2PNetwork | null;
  peers: PeerInfo[];
  status: ConnectionStatus;
  createRoom: (options?: { password?: string; maxPeers?: number; documentUrl?: string }) => Promise<{ code: string; documentUrl?: string }>;
  joinRoom: (code: string, options?: { password?: string }) => Promise<{ documentUrl?: string | null }>;
  leaveRoom: () => Promise<void>;
  kickPeer: (peerId: string) => Promise<void>;
  closeRoom: () => Promise<void>;
  sendChatMessage: (content: string) => void;
  getRoomCode: () => string | null;
  getIsHost: () => boolean;
}

/**
 * Hook for managing P2P network connection
 */
export function useP2PNetwork(options?: P2POptions): UseP2PNetworkReturn {
  const [network, setNetwork] = useState<P2PNetwork | null>(null);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  
  // Build options with TURN credentials from environment
  const optionsRef = useRef<P2POptions | undefined>({
    ...options,
    turnToken: import.meta.env.VITE_CLOUDFLARE_TURN_TOKEN || undefined,
    turnUsername: import.meta.env.VITE_CLOUDFLARE_TURN_USERNAME || undefined,
  });

  // Initialize P2P network on mount
  useEffect(() => {
    const p2p = new P2PNetwork(optionsRef.current);

    // Set up event listeners
    p2p.on("peer:joined", (peer) => {
      setPeers((prev) => [...prev, peer]);
    });

    p2p.on("peer:left", (peer) => {
      setPeers((prev) => prev.filter((p) => p.id !== peer.id));
    });

    p2p.on("status:changed", (newStatus) => {
      setStatus(newStatus);
    });

    p2p.on("error", (error) => {
      console.error("P2P error:", error);
    });

    setNetwork(p2p);

    // Cleanup on unmount
    return () => {
      p2p.destroy();
    };
  }, []); // Empty deps - only init once

  // Create room as host
  const createRoom = useCallback(async (options?: { password?: string; maxPeers?: number; documentUrl?: string }) => {
    if (!network) throw new Error("Network not initialized");

    const result = await network.createRoom(options);
    return { code: result.code, documentUrl: result.documentUrl };
  }, [network]);

  // Join existing room
  const joinRoom = useCallback(
    async (code: string, options?: { password?: string }) => {
      if (!network) throw new Error("Network not initialized");

      const result = await network.joinRoom(code, options);
      return { documentUrl: result.documentUrl };
    },
    [network],
  );

  // Leave room
  const leaveRoom = useCallback(async () => {
    if (!network) return;
    await network.leaveRoom();
  }, [network]);

  // Kick peer (host only)
  const kickPeer = useCallback(
    async (peerId: string) => {
      if (!network) throw new Error("Network not initialized");
      await network.kickPeer(peerId);
    },
    [network],
  );

  // Close room (host only)
  const closeRoom = useCallback(async () => {
    if (!network) throw new Error("Network not initialized");
    await network.closeRoom();
  }, [network]);

  // Send chat message
  const sendChatMessage = useCallback(
    (_content: string) => {
      if (!network) return;
      // Would need boardId in real implementation
      // network.sendChatMessage(boardId, content);
    },
    [network],
  );

  // Get current room code
  const getRoomCode = useCallback(() => {
    return network?.getRoomCode() ?? null;
  }, [network]);

  // Check if this peer is the host
  const getIsHost = useCallback(() => {
    return network?.getIsHost() ?? false;
  }, [network]);

  return {
    network,
    peers,
    status,
    createRoom,
    joinRoom,
    leaveRoom,
    kickPeer,
    closeRoom,
    sendChatMessage,
    getRoomCode,
    getIsHost,
  };
}
