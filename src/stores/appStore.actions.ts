/**
 * TanStack Store - App Store Actions
 * 
 * Action functions for updating application state.
 * All actions use batch updates for optimal performance.
 */

import { appStore, batchUpdates } from './appStore';
import type { BoardDocument, BoardItem } from '../lib/documents';
import type { PeerInfo, ConnectionStatus } from '../lib/p2p';
import type { BracketParticipant, BracketMatch } from '../lib/bracket/types';

// ============================================================================
// Board Actions
// ============================================================================

export const boardActions = {
  /**
   * Set the current board document
   */
  setBoard: (board: BoardDocument) => {
    batchUpdates(() => {
      appStore.setState((prev) => ({
        ...prev,
        board: {
          ...prev.board,
          currentBoard: board,
          isLoading: false,
          error: null,
        },
      }));
    });
  },

  /**
   * Set loading state
   */
  setLoading: (loading: boolean) => {
    appStore.setState((prev) => ({
      ...prev,
      board: {
        ...prev.board,
        isLoading: loading,
      },
    }));
  },

  /**
   * Set error state
   */
  setError: (error: Error | null) => {
    appStore.setState((prev) => ({
      ...prev,
      board: {
        ...prev.board,
        error,
        isLoading: false,
        syncStatus: error ? 'error' : prev.board.syncStatus,
      },
    }));
  },

  /**
   * Set document URL
   */
  setDocumentUrl: (url: string | null) => {
    appStore.setState((prev) => ({
      ...prev,
      board: {
        ...prev.board,
        documentUrl: url,
      },
    }));
  },

  /**
   * Update board document with a change function
   */
  updateBoard: (updater: (board: BoardDocument) => BoardDocument) => {
    appStore.setState((prev) => {
      if (!prev.board.currentBoard) return prev;
      return {
        ...prev,
        board: {
          ...prev.board,
          currentBoard: updater(prev.board.currentBoard),
        },
      };
    });
  },

  /**
   * Set sync status
   */
  setSyncStatus: (status: 'syncing' | 'synced' | 'error' | 'disconnected') => {
    appStore.setState((prev) => ({
      ...prev,
      board: {
        ...prev.board,
        syncStatus: status,
      },
    }));
  },

  /**
   * Set connected peers count
   */
  setConnectedPeers: (count: number) => {
    appStore.setState((prev) => ({
      ...prev,
      board: {
        ...prev.board,
        connectedPeers: count,
      },
    }));
  },
};

// ============================================================================
// Room Actions
// ============================================================================

export const roomActions = {
  /**
   * Set room code
   */
  setRoomCode: (code: string | null) => {
    appStore.setState((prev) => ({
      ...prev,
      room: {
        ...prev.room,
        roomCode: code,
      },
    }));
  },

  /**
   * Set host status
   */
  setIsHost: (isHost: boolean) => {
    appStore.setState((prev) => ({
      ...prev,
      room: {
        ...prev.room,
        isHost,
      },
    }));
  },

  /**
   * Set connection status
   */
  setIsConnected: (connected: boolean) => {
    appStore.setState((prev) => ({
      ...prev,
      room: {
        ...prev.room,
        isConnected: connected,
        isConnecting: false,
        error: connected ? null : prev.room.error,
      },
    }));
  },

  /**
   * Set connecting state
   */
  setIsConnecting: (connecting: boolean) => {
    appStore.setState((prev) => ({
      ...prev,
      room: {
        ...prev.room,
        isConnecting: connecting,
      },
    }));
  },

  /**
   * Set error state
   */
  setError: (error: Error | null) => {
    appStore.setState((prev) => ({
      ...prev,
      room: {
        ...prev.room,
        error,
        isConnecting: false,
      },
    }));
  },

  /**
   * Clear room state (on leave)
   */
  clearRoom: () => {
    appStore.setState((prev) => ({
      ...prev,
      room: {
        roomCode: null,
        isHost: false,
        isConnected: false,
        isConnecting: false,
        error: null,
      },
    }));
  },
};

// ============================================================================
// Peer Actions
// ============================================================================

export const peerActions = {
  /**
   * Set local peer info
   */
  setLocalPeer: (peer: PeerInfo | null) => {
    appStore.setState((prev) => ({
      ...prev,
      peer: {
        ...prev.peer,
        localPeer: peer,
      },
    }));
  },

  /**
   * Set remote peers list
   */
  setRemotePeers: (peers: PeerInfo[]) => {
    appStore.setState((prev) => ({
      ...prev,
      peer: {
        ...prev.peer,
        remotePeers: peers,
      },
    }));
  },

  /**
   * Add a remote peer
   */
  addRemotePeer: (peer: PeerInfo) => {
    appStore.setState((prev) => ({
      ...prev,
      peer: {
        ...prev.peer,
        remotePeers: [...prev.peer.remotePeers, peer],
      },
    }));
  },

  /**
   * Remove a remote peer
   */
  removeRemotePeer: (peerId: string) => {
    appStore.setState((prev) => ({
      ...prev,
      peer: {
        ...prev.peer,
        remotePeers: prev.peer.remotePeers.filter((p) => p.id !== peerId),
      },
    }));
  },

  /**
   * Set connection status
   */
  setConnectionStatus: (status: ConnectionStatus) => {
    appStore.setState((prev) => ({
      ...prev,
      peer: {
        ...prev.peer,
        connectionStatus: status,
      },
    }));
  },

  /**
   * Clear peer state (on disconnect)
   */
  clearPeers: () => {
    appStore.setState((prev) => ({
      ...prev,
      peer: {
        localPeer: null,
        remotePeers: [],
        connectionStatus: 'disconnected',
      },
    }));
  },
};

// ============================================================================
// Combined Actions
// ============================================================================

/**
 * Initialize room as host
 */
export const initializeHostRoom = (code: string, documentUrl?: string) => {
  batchUpdates(() => {
    roomActions.setRoomCode(code);
    roomActions.setIsHost(true);
    if (documentUrl) {
      boardActions.setDocumentUrl(documentUrl);
    }
  });
};

/**
 * Join room as client
 */
export const joinRoomAsClient = (code: string, documentUrl?: string | null) => {
  batchUpdates(() => {
    roomActions.setRoomCode(code);
    roomActions.setIsHost(false);
    if (documentUrl) {
      boardActions.setDocumentUrl(documentUrl);
    }
  });
};

/**
 * Leave room - reset all state
 */
export const leaveRoom = () => {
  batchUpdates(() => {
    roomActions.clearRoom();
    peerActions.clearPeers();
    boardActions.setSyncStatus('disconnected');
    boardActions.setConnectedPeers(0);
  });
};

/**
 * Handle connection error
 */
export const handleConnectionError = (error: Error) => {
  batchUpdates(() => {
    boardActions.setError(error);
    roomActions.setError(error);
  });
};

// ============================================================================
// UI Actions (Lightbox & Image Editor)
// ============================================================================

export const uiActions = {
  // ------------------- Lightbox Actions -------------------
  
  /**
   * Open tier lightbox
   */
  openTierLightbox: (tierId: string, items: BoardItem[], itemId: string) => {
    const currentIndex = items.findIndex((item) => item.id === itemId);
    appStore.setState((prev) => ({
      ...prev,
      ui: {
        ...prev.ui,
        lightbox: {
          isOpen: true,
          mode: 'tier',
          tierId,
          items,
          currentIndex: currentIndex >= 0 ? currentIndex : 0,
          matchId: null,
          match: null,
          participants: [],
        },
      },
    }));
  },

  openBracketLightbox: (matchId: string, match: BracketMatch, participants: BracketParticipant[], participantId: string) => {
    const currentIndex = participants.findIndex((p) => p.id === participantId);
    appStore.setState((prev) => ({
      ...prev,
      ui: {
        ...prev.ui,
        lightbox: {
          isOpen: true,
          mode: 'bracket',
          tierId: null,
          items: [],
          currentIndex: currentIndex >= 0 ? currentIndex : 0,
          matchId,
          match,
          participants,
        },
      },
    }));
  },

  /**
   * Navigate lightbox to next item
   */
  lightboxNext: () => {
    appStore.setState((prev) => {
      const { lightbox } = prev.ui;
      if (lightbox.mode === 'tier') {
        const maxIndex = lightbox.items.length - 1;
        const newIndex = lightbox.currentIndex >= maxIndex ? 0 : lightbox.currentIndex + 1;
        return {
          ...prev,
          ui: {
            ...prev.ui,
            lightbox: { ...lightbox, currentIndex: newIndex },
          },
        };
      } else if (lightbox.mode === 'bracket') {
        const maxIndex = lightbox.participants.length - 1;
        const newIndex = lightbox.currentIndex >= maxIndex ? 0 : lightbox.currentIndex + 1;
        return {
          ...prev,
          ui: {
            ...prev.ui,
            lightbox: { ...lightbox, currentIndex: newIndex },
          },
        };
      }
      return prev;
    });
  },

  /**
   * Navigate lightbox to previous item
   */
  lightboxPrev: () => {
    appStore.setState((prev) => {
      const { lightbox } = prev.ui;
      if (lightbox.mode === 'tier') {
        const maxIndex = lightbox.items.length - 1;
        const newIndex = lightbox.currentIndex <= 0 ? maxIndex : lightbox.currentIndex - 1;
        return {
          ...prev,
          ui: {
            ...prev.ui,
            lightbox: { ...lightbox, currentIndex: newIndex },
          },
        };
      } else if (lightbox.mode === 'bracket') {
        const maxIndex = lightbox.participants.length - 1;
        const newIndex = lightbox.currentIndex <= 0 ? maxIndex : lightbox.currentIndex - 1;
        return {
          ...prev,
          ui: {
            ...prev.ui,
            lightbox: { ...lightbox, currentIndex: newIndex },
          },
        };
      }
      return prev;
    });
  },

  /**
   * Close lightbox
   */
  closeLightbox: () => {
    appStore.setState((prev) => ({
      ...prev,
      ui: {
        ...prev.ui,
        lightbox: {
          ...prev.ui.lightbox,
          isOpen: false,
        },
      },
    }));
  },

  // ------------------- Image Editor Actions -------------------

  /**
   * Open image editor
   */
  openImageEditor: (itemId: string, imageUrl: string) => {
    appStore.setState((prev) => ({
      ...prev,
      ui: {
        ...prev.ui,
        imageEditor: {
          isOpen: true,
          itemId,
          originalImageUrl: imageUrl,
          crop: { x: 0, y: 0 },
          cropAspectRatio: null,
          rotation: 0,
          flipH: false,
          flipV: false,
          brightness: 0,
          contrast: 0,
          saturation: 0,
        },
      },
    }));
  },

  /**
   * Update image editor values
   */
  updateImageEditor: (updates: {
    crop?: { x: number; y: number };
    cropAspectRatio?: number | null;
    rotation?: number;
    flipH?: boolean;
    flipV?: boolean;
    brightness?: number;
    contrast?: number;
    saturation?: number;
  }) => {
    appStore.setState((prev) => ({
      ...prev,
      ui: {
        ...prev.ui,
        imageEditor: {
          ...prev.ui.imageEditor,
          ...updates,
        },
      },
    }));
  },

  /**
   * Close image editor
   */
  closeImageEditor: () => {
    appStore.setState((prev) => ({
      ...prev,
      ui: {
        ...prev.ui,
        imageEditor: {
          ...prev.ui.imageEditor,
          isOpen: false,
        },
      },
    }));
  },

  /**
   * Reset image editor
   */
  resetImageEditor: () => {
    appStore.setState((prev) => ({
      ...prev,
      ui: {
        ...prev.ui,
        imageEditor: {
          ...prev.ui.imageEditor,
          crop: { x: 0, y: 0 },
          cropAspectRatio: null,
          rotation: 0,
          flipH: false,
          flipV: false,
          brightness: 0,
          contrast: 0,
          saturation: 0,
        },
      },
    }));
  },
};
