/**
 * React Hook - useAppState
 * 
 * Provides access to the entire app state with TanStack Store.
 * Use this when you need access to multiple state slices.
 */

import { useStore } from '@tanstack/react-store';
import { appStore, type AppState } from '../stores/appStore';
import {
  boardActions,
  roomActions,
  peerActions,
  initializeHostRoom,
  joinRoomAsClient,
  leaveRoom,
  handleConnectionError,
} from '../stores/appStore.actions';

export interface UseAppStateReturn {
  // Board state
  board: AppState['board']['currentBoard'];
  boardLoading: AppState['board']['isLoading'];
  boardError: AppState['board']['error'];
  documentUrl: AppState['board']['documentUrl'];
  syncStatus: AppState['board']['syncStatus'];
  connectedPeers: AppState['board']['connectedPeers'];

  // Room state
  roomCode: AppState['room']['roomCode'];
  isHost: AppState['room']['isHost'];
  isConnected: AppState['room']['isConnected'];
  isConnecting: AppState['room']['isConnecting'];
  roomError: AppState['room']['error'];

  // Peer state
  localPeer: AppState['peer']['localPeer'];
  remotePeers: AppState['peer']['remotePeers'];
  connectionStatus: AppState['peer']['connectionStatus'];

  // Derived state
  canEdit: boolean;
  allPeers: import('../lib/p2p').PeerInfo[];
  peerCount: number;
  isLoading: boolean;
  error: Error | null;

  // Actions
  actions: {
    board: typeof boardActions;
    room: typeof roomActions;
    peer: typeof peerActions;
    initializeHostRoom: typeof initializeHostRoom;
    joinRoomAsClient: typeof joinRoomAsClient;
    leaveRoom: typeof leaveRoom;
    handleConnectionError: typeof handleConnectionError;
  };
}

export function useAppState(): UseAppStateReturn {
  // Subscribe to specific slices of state
  const board = useStore(appStore, (state) => state.board.currentBoard);
  const boardLoading = useStore(appStore, (state) => state.board.isLoading);
  const boardError = useStore(appStore, (state) => state.board.error);
  const documentUrl = useStore(appStore, (state) => state.board.documentUrl);
  const syncStatus = useStore(appStore, (state) => state.board.syncStatus);
  const connectedPeers = useStore(appStore, (state) => state.board.connectedPeers);

  const roomCode = useStore(appStore, (state) => state.room.roomCode);
  const isHost = useStore(appStore, (state) => state.room.isHost);
  const isConnected = useStore(appStore, (state) => state.room.isConnected);
  const isConnecting = useStore(appStore, (state) => state.room.isConnecting);
  const roomError = useStore(appStore, (state) => state.room.error);

  const localPeer = useStore(appStore, (state) => state.peer.localPeer);
  const remotePeers = useStore(appStore, (state) => state.peer.remotePeers);
  const connectionStatus = useStore(appStore, (state) => state.peer.connectionStatus);

  // Derived state (from Derived stores)
  const canEdit = useStore(
    appStore,
    (state) => !state.board.isLoading && state.board.currentBoard !== null && state.room.isConnected
  );
  const allPeers = useStore(appStore, (state) => [
    ...(state.peer.localPeer ? [state.peer.localPeer] : []),
    ...state.peer.remotePeers,
  ]);
  const peerCount = useStore(
    appStore,
    (state) => (state.peer.localPeer ? 1 : 0) + state.peer.remotePeers.length
  );
  const isLoading = useStore(
    appStore,
    (state) => state.board.isLoading || state.room.isConnecting
  );
  const error = useStore(
    appStore,
    (state) => state.board.error || state.room.error
  );

  return {
    // Board state
    board,
    boardLoading,
    boardError,
    documentUrl,
    syncStatus,
    connectedPeers,

    // Room state
    roomCode,
    isHost,
    isConnected,
    isConnecting,
    roomError,

    // Peer state
    localPeer,
    remotePeers,
    connectionStatus,

    // Derived state
    canEdit,
    allPeers,
    peerCount,
    isLoading,
    error,

    // Actions
    actions: {
      board: boardActions,
      room: roomActions,
      peer: peerActions,
      initializeHostRoom,
      joinRoomAsClient,
      leaveRoom,
      handleConnectionError,
    },
  };
}
