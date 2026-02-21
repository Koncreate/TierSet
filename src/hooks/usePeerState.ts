/**
 * React Hook - usePeerState
 * 
 * Provides access to peer-related state with TanStack Store.
 * Use this when you only need peer state.
 */

import { useStore } from '@tanstack/react-store';
import { appStore, allPeersStore, peerCountStore } from '../stores/appStore';
import { peerActions } from '../stores/appStore.actions';
import type { PeerInfo } from '../lib/p2p';

export interface UsePeerStateReturn {
  localPeer: PeerInfo | null;
  remotePeers: PeerInfo[];
  allPeers: PeerInfo[];
  peerCount: number;
  connectionStatus: import('../lib/p2p').ConnectionStatus;
  actions: typeof peerActions;
}

export function usePeerState(): UsePeerStateReturn {
  const localPeer = useStore(appStore, (state) => state.peer.localPeer);
  const remotePeers = useStore(appStore, (state) => state.peer.remotePeers);
  const allPeers = useStore(allPeersStore);
  const peerCount = useStore(peerCountStore);
  const connectionStatus = useStore(appStore, (state) => state.peer.connectionStatus);

  return {
    localPeer,
    remotePeers,
    allPeers,
    peerCount,
    connectionStatus,
    actions: peerActions,
  };
}
