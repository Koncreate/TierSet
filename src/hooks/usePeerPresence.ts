/**
 * Hook for tracking peer presence in P2P room
 * 
 * Refactored to use TanStack Store for state management.
 * This hook now just transforms store data into PeerPresence format.
 */

import { useStore } from '@tanstack/react-store';
import { appStore, allPeersStore } from '../stores/appStore';
import type { PeerInfo } from '../lib/p2p';

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
 * Convert PeerInfo to PeerPresence
 */
function peerInfoToPresence(peer: PeerInfo, isHost: boolean): PeerPresence {
  return {
    id: peer.id,
    name: peer.name,
    role: peer.role as "host" | "client",
    connectedAt: peer.connectedAt || Date.now(),
    color: generatePeerColor(peer.id),
    isHost: isHost || peer.role === "host",
  };
}

export function usePeerPresence(): UsePeerPresenceReturn {
  const localPeerInfo = useStore(appStore, (state) => state.peer.localPeer);
  const remotePeersInfo = useStore(appStore, (state) => state.peer.remotePeers);
  const allPeersInfo = useStore(allPeersStore);
  const isHost = useStore(appStore, (state) => state.room.isHost);

  // Convert to PeerPresence format
  const localPeer = localPeerInfo
    ? peerInfoToPresence(localPeerInfo, true)
    : null;

  const remotePeers = remotePeersInfo.map((peer) =>
    peerInfoToPresence(peer, false)
  );

  const allPeers = allPeersInfo.map((peer, index) =>
    peerInfoToPresence(peer, index === 0 && isHost)
  );

  return {
    localPeer,
    remotePeers,
    allPeers,
  };
}
