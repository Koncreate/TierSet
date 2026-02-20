import { useState, useEffect, useCallback, useRef } from "react";
import { P2PNetwork } from "../lib/p2p";

export interface PeerPresence {
  id: string;
  name: string;
  role: "host" | "client";
  connectedAt: number;
  color: string;
  isHost: boolean;
}

interface UsePeerPresenceReturn {
  localPeer: PeerPresence | null;
  remotePeers: PeerPresence[];
  allPeers: PeerPresence[];
}

/**
 * Generate a consistent color from a peer ID
 */
function generatePeerColor(id: string): string {
  const colors = [
    "#FF6B6B", // Red
    "#4ECDC4", // Teal
    "#45B7D1", // Blue
    "#96CEB4", // Green
    "#FFEAA7", // Yellow
    "#DDA0DD", // Plum
    "#98D8C8", // Mint
    "#F7DC6F", // Mustard
  ];
  
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash |= 0;
  }
  
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Hook for tracking peer presence in P2P room
 */
export function usePeerPresence(network: P2PNetwork | null): UsePeerPresenceReturn {
  const [localPeer, setLocalPeer] = useState<PeerPresence | null>(null);
  const [remotePeers, setRemotePeers] = useState<PeerPresence[]>([]);

  // Initialize local peer info when network is ready
  useEffect(() => {
    if (!network) {
      setLocalPeer(null);
      return;
    }

    const updateLocalPeer = () => {
      setLocalPeer({
        id: network.id,
        name: network.getPeerName() || "Anonymous",
        role: network.getIsHost() ? "host" : "client",
        connectedAt: Date.now(),
        color: generatePeerColor(network.id),
        isHost: network.getIsHost(),
      });
    };

    updateLocalPeer();
  }, [network]);

  // Listen for peer changes
  useEffect(() => {
    if (!network) return;

    const handlePeerJoined = (peer: { id: string; name: string; role: string }) => {
      setRemotePeers((prev) => {
        // Don't add self
        if (peer.id === network.id) return prev;
        
        const exists = prev.find((p) => p.id === peer.id);
        if (exists) return prev;

        return [
          ...prev,
          {
            id: peer.id,
            name: peer.name,
            role: peer.role as "host" | "client",
            connectedAt: Date.now(),
            color: generatePeerColor(peer.id),
            isHost: peer.role === "host",
          },
        ];
      });
    };

    const handlePeerLeft = (peer: { id: string }) => {
      setRemotePeers((prev) => prev.filter((p) => p.id !== peer.id));
    };

    const handleStatusChanged = (status: string) => {
      if (status === "disconnected" || status === "failed") {
        setRemotePeers([]);
      }
    };

    network.on("peer:joined", handlePeerJoined);
    network.on("peer:left", handlePeerLeft);
    network.on("status:changed", handleStatusChanged);

    return () => {
      network.off("peer:joined", handlePeerJoined);
      network.off("peer:left", handlePeerLeft);
      network.off("status:changed", handleStatusChanged);
    };
  }, [network]);

  const allPeers = [...(localPeer ? [localPeer] : []), ...remotePeers];

  return {
    localPeer,
    remotePeers,
    allPeers,
  };
}
