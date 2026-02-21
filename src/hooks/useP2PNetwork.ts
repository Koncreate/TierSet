import { useEffect, useRef } from "react";
import { P2PNetwork } from "../lib/p2p";
import type { PeerInfo, ConnectionStatus, P2POptions } from "../lib/p2p";
import { peerActions, roomActions, boardActions } from "../stores/appStore.actions";

interface UseP2PNetworkReturn {
  network: P2PNetwork | null;
  getRoomCode: () => string | null;
  getIsHost: () => boolean;
}

/**
 * Hook for managing P2P network connection
 *
 * Refactored to use TanStack Store for state management.
 * This hook only manages the network instance and updates stores on events.
 * Components should use usePeerState(), useRoomState(), or useAppState() to read state.
 */
export function useP2PNetwork(options?: P2POptions): UseP2PNetworkReturn {
  const networkRef = useRef<P2PNetwork | null>(null);

  // Build options with TURN credentials from environment
  const optionsRef = useRef<P2POptions | undefined>({
    ...options,
    turnToken: import.meta.env.VITE_CLOUDFLARE_TURN_TOKEN || undefined,
    turnUsername: import.meta.env.VITE_CLOUDFLARE_TURN_USERNAME || undefined,
  });

  // Initialize P2P network on mount
  useEffect(() => {
    const p2p = new P2PNetwork(optionsRef.current);
    networkRef.current = p2p;

    // Set local peer info on initialization
    const updateLocalPeer = () => {
      const localPeer: PeerInfo = {
        id: p2p.id,
        name: p2p.getPeerName() || "Anonymous",
        role: p2p.getIsHost() ? "host" : "client",
        connectedAt: Date.now(),
        capabilities: {
          canHost: true,
          canRelay: false,
          supportsVideo: false,
        },
      };
      peerActions.setLocalPeer(localPeer);
    };

    // Set initial local peer
    updateLocalPeer();

    // Subscribe to P2P events and update stores
    p2p.on("peer:joined", (peer) => {
      peerActions.addRemotePeer(peer);

      // Update connected peers count
      const currentPeers = p2p.getPeers();
      boardActions.setConnectedPeers(currentPeers.length);
    });

    p2p.on("peer:left", (peer) => {
      peerActions.removeRemotePeer(peer.id);

      // Update connected peers count
      const currentPeers = p2p.getPeers();
      boardActions.setConnectedPeers(currentPeers.length);
    });

    p2p.on("status:changed", (newStatus: ConnectionStatus) => {
      peerActions.setConnectionStatus(newStatus);

      // Update room connection status
      const isConnected = newStatus === "connected";
      roomActions.setIsConnected(isConnected);

      // Update board sync status
      if (isConnected) {
        boardActions.setSyncStatus("synced");
      } else if (newStatus === "failed") {
        boardActions.setSyncStatus("error");
      } else {
        boardActions.setSyncStatus("disconnected");
      }

      // Update local peer role if host status changed
      updateLocalPeer();
    });

    p2p.on("error", (error) => {
      console.error("P2P error:", error);
    });

    return () => {
      p2p.destroy();
      networkRef.current = null;
      // Clear local peer on cleanup
      peerActions.setLocalPeer(null);
    };
  }, []); // Empty deps - only init once

  return {
    network: networkRef.current,
    getRoomCode: () => networkRef.current?.getRoomCode() ?? null,
    getIsHost: () => networkRef.current?.getIsHost() ?? false,
  };
}
