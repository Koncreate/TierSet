/**
 * TanStack Store - Unified Application State
 *
 * Combines board, room, and peer state into a single store for easier management.
 * Uses TanStack Store for fine-grained reactivity and derived state.
 */

import { Store, Derived, batch } from '@tanstack/store';
import type { BoardDocument, BoardItem } from '../lib/documents';
import type { PeerInfo, ConnectionStatus } from '../lib/p2p';
import type { BracketParticipant, BracketMatch } from '../lib/bracket/types';
import { subscribeToStoreChanges } from '../lib/persistence/storePersistence';
import type { UnsubscribeFn } from '../lib/persistence/types';

// ============================================================================
// State Types
// ============================================================================

export interface BoardState {
  currentBoard: BoardDocument | null;
  isLoading: boolean;
  error: Error | null;
  documentUrl: string | null;
  syncStatus: 'syncing' | 'synced' | 'error' | 'disconnected';
  connectedPeers: number;
}

export interface RoomState {
  roomCode: string | null;
  isHost: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  error: Error | null;
}

export interface PeerState {
  localPeer: PeerInfo | null;
  remotePeers: PeerInfo[];
  connectionStatus: ConnectionStatus;
}

export interface LightboxState {
  isOpen: boolean;
  mode: 'tier' | 'bracket' | null;
  tierId: string | null;
  items: BoardItem[];
  currentIndex: number;
  matchId: string | null;
  match: BracketMatch | null;
  participants: BracketParticipant[];
}

export interface ImageEditorState {
  isOpen: boolean;
  itemId: string | null;
  originalImageUrl: string | null;
  // Edit values
  crop: { x: number; y: number };
  cropAspectRatio: number | null;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  brightness: number;
  contrast: number;
  saturation: number;
}

export interface UIState {
  lightbox: LightboxState;
  imageEditor: ImageEditorState;
}

export interface AppState {
  board: BoardState;
  room: RoomState;
  peer: PeerState;
  ui: UIState;
}

// ============================================================================
// Initial State
// ============================================================================

const initialBoardState: BoardState = {
  currentBoard: null,
  isLoading: true,
  error: null,
  documentUrl: null,
  syncStatus: 'disconnected',
  connectedPeers: 0,
};

const initialRoomState: RoomState = {
  roomCode: null,
  isHost: false,
  isConnected: false,
  isConnecting: false,
  error: null,
};

const initialPeerState: PeerState = {
  localPeer: null,
  remotePeers: [],
  connectionStatus: 'disconnected',
};

const initialLightboxState: LightboxState = {
  isOpen: false,
  mode: null,
  tierId: null,
  items: [],
  currentIndex: 0,
  matchId: null,
  match: null,
  participants: [],
};

const initialImageEditorState: ImageEditorState = {
  isOpen: false,
  itemId: null,
  originalImageUrl: null,
  crop: { x: 0, y: 0 },
  cropAspectRatio: null,
  rotation: 0,
  flipH: false,
  flipV: false,
  brightness: 0,
  contrast: 0,
  saturation: 0,
};

const initialUIState: UIState = {
  lightbox: initialLightboxState,
  imageEditor: initialImageEditorState,
};

const initialState: AppState = {
  board: initialBoardState,
  room: initialRoomState,
  peer: initialPeerState,
  ui: initialUIState,
};

// ============================================================================
// Main App Store
// ============================================================================

export const appStore = new Store<AppState>(initialState);

// ============================================================================
// Derived Stores
// ============================================================================

/**
 * Derived: Check if board can be edited
 * Note: Only checks board state, not connection status (solo mode supported)
 */
export const canEditStore = new Derived({
  deps: [appStore],
  fn: ({ currDepVals }) => {
    const [app] = currDepVals;
    const { board } = app;
    return !board.isLoading && board.currentBoard !== null;
  },
});

/**
 * Derived: Get all peers including local
 */
export const allPeersStore = new Derived({
  deps: [appStore],
  fn: ({ currDepVals }) => {
    const [app] = currDepVals;
    const { localPeer, remotePeers } = app.peer;
    return [...(localPeer ? [localPeer] : []), ...remotePeers];
  },
});

/**
 * Derived: Peer count including local
 */
export const peerCountStore = new Derived({
  deps: [appStore],
  fn: ({ currDepVals }) => {
    const [app] = currDepVals;
    const { localPeer, remotePeers } = app.peer;
    return (localPeer ? 1 : 0) + remotePeers.length;
  },
});

/**
 * Derived: Formatted room code for display
 */
export const roomCodeDisplayStore = new Derived({
  deps: [appStore],
  fn: ({ currDepVals }) => {
    const [app] = currDepVals;
    return app.room.roomCode;
  },
});

/**
 * Derived: Combined loading state (board or room connecting)
 */
export const appLoadingStore = new Derived({
  deps: [appStore],
  fn: ({ currDepVals }) => {
    const [app] = currDepVals;
    return app.board.isLoading || app.room.isConnecting;
  },
});

/**
 * Derived: Any error state
 */
export const appErrorStore = new Derived({
  deps: [appStore],
  fn: ({ currDepVals }) => {
    const [app] = currDepVals;
    return app.board.error || app.room.error;
  },
});

/**
 * Derived: Lightbox open state
 */
export const lightboxOpenStore = new Derived({
  deps: [appStore],
  fn: ({ currDepVals }) => {
    const [app] = currDepVals;
    return app.ui.lightbox.isOpen;
  },
});

/**
 * Derived: Lightbox current item
 */
export const lightboxCurrentItemStore = new Derived({
  deps: [appStore],
  fn: ({ currDepVals }) => {
    const [app] = currDepVals;
    const { items, currentIndex } = app.ui.lightbox;
    return items[currentIndex] || null;
  },
});

/**
 * Derived: Image editor open state
 */
export const imageEditorOpenStore = new Derived({
  deps: [appStore],
  fn: ({ currDepVals }) => {
    const [app] = currDepVals;
    return app.ui.imageEditor.isOpen;
  },
});

// ============================================================================
// Batch Helper
// ============================================================================

/**
 * Batch multiple store updates together
 */
export function batchUpdates(updater: () => void): void {
  batch(updater);
}

// ============================================================================
// Persistence
// ============================================================================

let appStoreUnsubscribe: UnsubscribeFn | null = null;

/**
 * Keys to persist from appStore (excluding transient state)
 */
const APP_STORE_PERSIST_KEYS: Array<keyof AppState> = ['room'];

/**
 * Filter transient fields from room state before persisting
 */
function filterTransientRoomFields(data: Record<string, unknown>): Record<string, unknown> {
  if (!data.room || typeof data.room !== 'object') {
    return data;
  }

  const room = data.room as Record<string, unknown>;
  return {
    ...data,
    room: {
      roomCode: room.roomCode ?? null,
      isHost: room.isHost ?? false,
    },
  };
}

/**
 * Setup auto-save for appStore
 * Call once on app initialization
 */
export function setupAppStorePersistence(): void {
  if (appStoreUnsubscribe) {
    return; // Already setup
  }

  appStoreUnsubscribe = subscribeToStoreChanges(
    'appStore',
    appStore as unknown as Store<Record<string, unknown>>,
    APP_STORE_PERSIST_KEYS,
    filterTransientRoomFields
  );
}

/**
 * Load appStore state from snapshot
 * Call on app initialization before setupAppStorePersistence
 */
export async function loadAppStoreFromSnapshot(): Promise<void> {
  const { loadStoreSnapshot } = await import('../lib/persistence/storePersistence');
  const result = await loadStoreSnapshot<Partial<AppState>>('appStore');

  if (result.found && result.valid && result.data) {
    // Only restore room state (persistent data)
    const roomData = result.data.room;
    if (roomData?.roomCode) {
      // Validate room code format before restoring
      const { decodeRoomCode } = await import('../lib/p2p/room-code');
      const decoded = decodeRoomCode(roomData.roomCode);
      
      if (decoded) {
        console.log("[loadAppStoreFromSnapshot] Restoring room:", decoded.shortCode);
        appStore.setState((prev) => ({
          ...prev,
          room: {
            ...prev.room,
            roomCode: decoded.shortCode,
            isHost: roomData.isHost ?? false,
          },
        }));
      } else {
        // Invalid room code format, clear the snapshot
        console.warn("[loadAppStoreFromSnapshot] Invalid room code in snapshot, clearing");
        const { clearStoreSnapshot } = await import('../lib/persistence/storePersistence');
        await clearStoreSnapshot('appStore');
      }
    }
  }
}

/**
 * Cleanup appStore persistence subscription
 */
export function cleanupAppStorePersistence(): void {
  if (appStoreUnsubscribe) {
    appStoreUnsubscribe();
    appStoreUnsubscribe = null;
  }
}
