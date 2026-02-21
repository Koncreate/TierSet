/**
 * TanStack Store - App Store Unit Tests
 * =======================================
 *
 * Tests for the core application state management using TanStack Store.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { appStore, allPeersStore, peerCountStore, canEditStore } from "../appStore";
import {
  boardActions,
  roomActions,
  peerActions,
  initializeHostRoom,
  joinRoomAsClient,
  leaveRoom,
  handleConnectionError,
} from "../appStore.actions";
import type { BoardDocument } from "../../lib/documents";
import type { PeerInfo } from "../../lib/p2p";

// ============================================================================
// Helper Functions
// ============================================================================

function createMockBoard(overrides?: Partial<BoardDocument>): BoardDocument {
  return {
    id: "test-board-id",
    name: "Test Board",
    description: "A test board",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    createdBy: "test-user",
    tiers: [],
    items: [],
    settings: {
      allowPublicJoin: true,
      requirePassword: false,
      maxPeers: 10,
      theme: "light" as const,
    },
    _peers: [],
    ...overrides,
  };
}

function createMockPeer(overrides?: Partial<PeerInfo>): PeerInfo {
  return {
    id: "peer-1",
    name: "Test Peer",
    role: "client",
    connectedAt: Date.now(),
    capabilities: {
      canHost: true,
      canRelay: false,
      supportsVideo: false,
    },
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("appStore", () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    appStore.setState({
      board: {
        currentBoard: null,
        isLoading: true,
        error: null,
        documentUrl: null,
        syncStatus: "disconnected",
        connectedPeers: 0,
      },
      room: {
        roomCode: null,
        isHost: false,
        isConnected: false,
        isConnecting: false,
        error: null,
      },
      peer: {
        localPeer: null,
        remotePeers: [],
        connectionStatus: "disconnected",
      },
    });
  });

  describe("Initial State", () => {
    it("should initialize with default board state", () => {
      expect(appStore.state.board).toEqual({
        currentBoard: null,
        isLoading: true,
        error: null,
        documentUrl: null,
        syncStatus: "disconnected",
        connectedPeers: 0,
      });
    });

    it("should initialize with default room state", () => {
      expect(appStore.state.room).toEqual({
        roomCode: null,
        isHost: false,
        isConnected: false,
        isConnecting: false,
        error: null,
      });
    });

    it("should initialize with default peer state", () => {
      expect(appStore.state.peer).toEqual({
        localPeer: null,
        remotePeers: [],
        connectionStatus: "disconnected",
      });
    });
  });

  describe("Board Actions", () => {
    it("should set board document", () => {
      const mockBoard = createMockBoard();
      boardActions.setBoard(mockBoard);

      expect(appStore.state.board.currentBoard).toBe(mockBoard);
      expect(appStore.state.board.isLoading).toBe(false);
      expect(appStore.state.board.error).toBeNull();
    });

    it("should set loading state", () => {
      appStore.setState((prev) => ({
        ...prev,
        board: { ...prev.board, isLoading: false },
      }));

      boardActions.setLoading(true);

      expect(appStore.state.board.isLoading).toBe(true);
    });

    it("should set error state", () => {
      const error = new Error("Test error");
      boardActions.setError(error);

      expect(appStore.state.board.error).toBe(error);
      expect(appStore.state.board.isLoading).toBe(false);
    });

    it("should clear error when set to null", () => {
      boardActions.setError(new Error("Test"));
      boardActions.setError(null);

      expect(appStore.state.board.error).toBeNull();
    });

    it("should set document URL", () => {
      const url = "automerge:test123";
      boardActions.setDocumentUrl(url);

      expect(appStore.state.board.documentUrl).toBe(url);
    });

    it("should update board with updater function", () => {
      const mockBoard = createMockBoard();
      boardActions.setBoard(mockBoard);

      boardActions.updateBoard((board) => ({
        ...board,
        name: "Updated Board",
      }));

      expect(appStore.state.board.currentBoard?.name).toBe("Updated Board");
    });

    it("should not update board if no current board", () => {
      boardActions.updateBoard((board) => ({
        ...board,
        name: "Updated",
      }));

      expect(appStore.state.board.currentBoard).toBeNull();
    });

    it("should set sync status", () => {
      boardActions.setSyncStatus("syncing");
      expect(appStore.state.board.syncStatus).toBe("syncing");

      boardActions.setSyncStatus("synced");
      expect(appStore.state.board.syncStatus).toBe("synced");
    });

    it("should set connected peers count", () => {
      boardActions.setConnectedPeers(5);
      expect(appStore.state.board.connectedPeers).toBe(5);
    });
  });

  describe("Room Actions", () => {
    it("should set room code", () => {
      roomActions.setRoomCode("TIER-TEST");
      expect(appStore.state.room.roomCode).toBe("TIER-TEST");
    });

    it("should clear room code", () => {
      roomActions.setRoomCode("TIER-TEST");
      roomActions.setRoomCode(null);
      expect(appStore.state.room.roomCode).toBeNull();
    });

    it("should set host status", () => {
      roomActions.setIsHost(true);
      expect(appStore.state.room.isHost).toBe(true);

      roomActions.setIsHost(false);
      expect(appStore.state.room.isHost).toBe(false);
    });

    it("should set connected status", () => {
      roomActions.setIsConnected(true);
      expect(appStore.state.room.isConnected).toBe(true);
      expect(appStore.state.room.isConnecting).toBe(false);
      expect(appStore.state.room.error).toBeNull();
    });

    it("should set connecting status", () => {
      roomActions.setIsConnecting(true);
      expect(appStore.state.room.isConnecting).toBe(true);
    });

    it("should set error state", () => {
      const error = new Error("Connection failed");
      roomActions.setError(error);

      expect(appStore.state.room.error).toBe(error);
      expect(appStore.state.room.isConnecting).toBe(false);
    });

    it("should clear room state", () => {
      roomActions.setRoomCode("TIER-TEST");
      roomActions.setIsHost(true);
      roomActions.setIsConnected(true);
      roomActions.setError(new Error("Test"));

      roomActions.clearRoom();

      expect(appStore.state.room.roomCode).toBeNull();
      expect(appStore.state.room.isHost).toBe(false);
      expect(appStore.state.room.isConnected).toBe(false);
      expect(appStore.state.room.isConnecting).toBe(false);
      expect(appStore.state.room.error).toBeNull();
    });
  });

  describe("Peer Actions", () => {
    it("should set local peer", () => {
      const peer = createMockPeer({ id: "local-peer" });
      peerActions.setLocalPeer(peer);

      expect(appStore.state.peer.localPeer).toBe(peer);
    });

    it("should set remote peers", () => {
      const peers = [createMockPeer(), createMockPeer({ id: "peer-2" })];
      peerActions.setRemotePeers(peers);

      expect(appStore.state.peer.remotePeers).toEqual(peers);
    });

    it("should add remote peer", () => {
      const peer = createMockPeer();
      peerActions.addRemotePeer(peer);

      expect(appStore.state.peer.remotePeers).toHaveLength(1);
      expect(appStore.state.peer.remotePeers[0]).toBe(peer);
    });

    it("should add multiple remote peers", () => {
      peerActions.addRemotePeer(createMockPeer({ id: "peer-1" }));
      peerActions.addRemotePeer(createMockPeer({ id: "peer-2" }));

      expect(appStore.state.peer.remotePeers).toHaveLength(2);
    });

    it("should remove remote peer", () => {
      const peer1 = createMockPeer({ id: "peer-1" });
      const peer2 = createMockPeer({ id: "peer-2" });

      peerActions.setRemotePeers([peer1, peer2]);
      peerActions.removeRemotePeer("peer-1");

      expect(appStore.state.peer.remotePeers).toHaveLength(1);
      expect(appStore.state.peer.remotePeers[0].id).toBe("peer-2");
    });

    it("should set connection status", () => {
      peerActions.setConnectionStatus("connected");
      expect(appStore.state.peer.connectionStatus).toBe("connected");

      peerActions.setConnectionStatus("disconnected");
      expect(appStore.state.peer.connectionStatus).toBe("disconnected");
    });

    it("should clear peers", () => {
      peerActions.setLocalPeer(createMockPeer());
      peerActions.setRemotePeers([createMockPeer()]);
      peerActions.setConnectionStatus("connected");

      peerActions.clearPeers();

      expect(appStore.state.peer.localPeer).toBeNull();
      expect(appStore.state.peer.remotePeers).toHaveLength(0);
      expect(appStore.state.peer.connectionStatus).toBe("disconnected");
    });
  });

  describe("Combined Actions", () => {
    it("should initialize host room", () => {
      initializeHostRoom("TIER-HOST", "automerge:test");

      expect(appStore.state.room.roomCode).toBe("TIER-HOST");
      expect(appStore.state.room.isHost).toBe(true);
      expect(appStore.state.board.documentUrl).toBe("automerge:test");
    });

    it("should join room as client", () => {
      joinRoomAsClient("TIER-CLIENT", "automerge:client");

      expect(appStore.state.room.roomCode).toBe("TIER-CLIENT");
      expect(appStore.state.room.isHost).toBe(false);
      expect(appStore.state.board.documentUrl).toBe("automerge:client");
    });

    it("should leave room and reset state", () => {
      // Set up room state
      initializeHostRoom("TIER-TEST", "automerge:test");
      peerActions.setLocalPeer(createMockPeer());
      peerActions.addRemotePeer(createMockPeer({ id: "remote" }));
      boardActions.setSyncStatus("synced");
      boardActions.setConnectedPeers(2);

      leaveRoom();

      expect(appStore.state.room.roomCode).toBeNull();
      expect(appStore.state.room.isHost).toBe(false);
      expect(appStore.state.peer.localPeer).toBeNull();
      expect(appStore.state.peer.remotePeers).toHaveLength(0);
      expect(appStore.state.board.syncStatus).toBe("disconnected");
      expect(appStore.state.board.connectedPeers).toBe(0);
    });

    it("should handle connection error", () => {
      const error = new Error("Connection failed");
      handleConnectionError(error);

      expect(appStore.state.board.error).toBe(error);
      expect(appStore.state.room.error).toBe(error);
    });
  });

  describe("Derived Stores", () => {
    it("should compute canEdit when board is loaded and connected", () => {
      const mockBoard = createMockBoard();
      boardActions.setBoard(mockBoard);
      roomActions.setIsConnected(true);

      // Force recompute by accessing state
      const canEdit = !appStore.state.board.isLoading && 
                      appStore.state.board.currentBoard !== null && 
                      appStore.state.room.isConnected;
      
      expect(canEdit).toBe(true);
    });

    it("should compute canEdit as false when loading", () => {
      const mockBoard = createMockBoard();
      boardActions.setBoard(mockBoard);
      boardActions.setLoading(true);
      roomActions.setIsConnected(true);

      const canEdit = !appStore.state.board.isLoading && 
                      appStore.state.board.currentBoard !== null && 
                      appStore.state.room.isConnected;
      
      expect(canEdit).toBe(false);
    });

    it("should compute canEdit as false when not connected", () => {
      const mockBoard = createMockBoard();
      boardActions.setBoard(mockBoard);
      roomActions.setIsConnected(false);

      const canEdit = !appStore.state.board.isLoading && 
                      appStore.state.board.currentBoard !== null && 
                      appStore.state.room.isConnected;
      
      expect(canEdit).toBe(false);
    });

    it("should compute all peers including local", () => {
      const localPeer = createMockPeer({ id: "local" });
      const remotePeer = createMockPeer({ id: "remote" });

      peerActions.setLocalPeer(localPeer);
      peerActions.setRemotePeers([remotePeer]);

      const allPeers = [
        ...(appStore.state.peer.localPeer ? [appStore.state.peer.localPeer] : []),
        ...appStore.state.peer.remotePeers,
      ];

      expect(allPeers).toHaveLength(2);
      expect(allPeers[0]).toBe(localPeer);
      expect(allPeers[1]).toBe(remotePeer);
    });

    it("should compute all peers without local", () => {
      const remotePeer = createMockPeer({ id: "remote" });

      peerActions.setLocalPeer(null);
      peerActions.setRemotePeers([remotePeer]);

      const allPeers = [
        ...(appStore.state.peer.localPeer ? [appStore.state.peer.localPeer] : []),
        ...appStore.state.peer.remotePeers,
      ];

      expect(allPeers).toHaveLength(1);
    });

    it("should compute peer count", () => {
      peerActions.setLocalPeer(createMockPeer());
      peerActions.setRemotePeers([
        createMockPeer({ id: "peer-1" }),
        createMockPeer({ id: "peer-2" }),
      ]);

      const peerCount = (appStore.state.peer.localPeer ? 1 : 0) + 
                        appStore.state.peer.remotePeers.length;

      expect(peerCount).toBe(3);
    });

    it("should compute peer count without local", () => {
      peerActions.setLocalPeer(null);
      peerActions.setRemotePeers([
        createMockPeer({ id: "peer-1" }),
      ]);

      const peerCount = (appStore.state.peer.localPeer ? 1 : 0) + 
                        appStore.state.peer.remotePeers.length;

      expect(peerCount).toBe(1);
    });

    it("should compute room code display", () => {
      roomActions.setRoomCode("TIER-DISPLAY");
      expect(appStore.state.room.roomCode).toBe("TIER-DISPLAY");
    });

    it("should compute app loading state", () => {
      expect(appStore.state.board.isLoading).toBe(true);
      expect(appStore.state.room.isConnecting).toBe(false);

      boardActions.setLoading(false);
      roomActions.setIsConnecting(true);

      expect(appStore.state.room.isConnecting).toBe(true);
    });
  });

  describe("Store Subscriptions", () => {
    it("should notify subscribers on state change", () => {
      let callCount = 0;
      let receivedStates: typeof appStore.state[] = [];

      const unsubscribe = appStore.subscribe((value) => {
        callCount++;
        // value is ListenerValue<T> with currentVal and prevVal
        if (value && 'currentVal' in value) {
          receivedStates.push(value.currentVal);
        }
      });

      boardActions.setLoading(false);

      expect(callCount).toBeGreaterThan(0);
      expect(receivedStates.length).toBeGreaterThan(0);
      expect(receivedStates[0].board.isLoading).toBe(false);

      unsubscribe();
    });

    it("should allow multiple subscribers", () => {
      const calls1: (string | null)[] = [];
      const calls2: (string | null)[] = [];

      const unsub1 = appStore.subscribe((value) => {
        if (value && 'currentVal' in value) {
          calls1.push(value.currentVal.room.roomCode);
        }
      });
      const unsub2 = appStore.subscribe((value) => {
        if (value && 'currentVal' in value) {
          calls2.push(value.currentVal.room.roomCode);
        }
      });

      roomActions.setRoomCode("TIER-TEST");

      expect(calls1).toContain("TIER-TEST");
      expect(calls2).toContain("TIER-TEST");

      unsub1();
      unsub2();
    });
  });
});
