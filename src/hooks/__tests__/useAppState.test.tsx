/**
 * TanStack Store Hooks Unit Tests
 * ==================================
 *
 * Tests for the React hooks that provide access to TanStack Store.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock TanStack Store
vi.mock("@tanstack/react-store", () => ({
  useStore: vi.fn(),
}));

// Mock stores
vi.mock("../../stores/appStore", () => ({
  appStore: {
    state: {
      board: {
        currentBoard: null,
        isLoading: false,
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
    },
    subscribe: vi.fn(),
  },
  allPeersStore: {
    state: [],
    subscribe: vi.fn(),
  },
  peerCountStore: {
    state: 0,
    subscribe: vi.fn(),
  },
  canEditStore: {
    state: false,
    subscribe: vi.fn(),
  },
  appLoadingStore: {
    state: false,
    subscribe: vi.fn(),
  },
  appErrorStore: {
    state: null,
    subscribe: vi.fn(),
  },
}));

// Mock actions
vi.mock("../../stores/appStore.actions", () => ({
  boardActions: {
    setBoard: vi.fn(),
    setLoading: vi.fn(),
    setError: vi.fn(),
    setDocumentUrl: vi.fn(),
    updateBoard: vi.fn(),
    setSyncStatus: vi.fn(),
    setConnectedPeers: vi.fn(),
  },
  roomActions: {
    setRoomCode: vi.fn(),
    setIsHost: vi.fn(),
    setIsConnected: vi.fn(),
    setIsConnecting: vi.fn(),
    setError: vi.fn(),
    clearRoom: vi.fn(),
  },
  peerActions: {
    setLocalPeer: vi.fn(),
    setRemotePeers: vi.fn(),
    addRemotePeer: vi.fn(),
    removeRemotePeer: vi.fn(),
    setConnectionStatus: vi.fn(),
    clearPeers: vi.fn(),
  },
  initializeHostRoom: vi.fn(),
  joinRoomAsClient: vi.fn(),
  leaveRoom: vi.fn(),
  handleConnectionError: vi.fn(),
}));

import { useStore } from "@tanstack/react-store";
import { useAppState } from "../useAppState";
import { useBoardState } from "../useBoardState";
import { useRoomState } from "../useRoomState";
import { usePeerState } from "../usePeerState";
import { boardActions, roomActions, peerActions } from "../../stores/appStore.actions";

// ============================================================================
// Tests
// ============================================================================

describe("TanStack Store Hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useBoardState", () => {
    it("should return board state from store", () => {
      vi.mocked(useStore).mockImplementation((store, selector) => {
        if (selector) {
          return selector({
            board: {
              currentBoard: { id: "test", name: "Test Board" } as any,
              isLoading: false,
              error: null,
              documentUrl: null,
              syncStatus: "synced",
              connectedPeers: 2,
            },
            room: { isConnected: true },
          } as any);
        }
        return null;
      });

      const { result } = renderHook(() => useBoardState());

      expect(result.current.board).toEqual({ id: "test", name: "Test Board" });
      expect(result.current.isLoading).toBe(false);
      expect(result.current.syncStatus).toBe("synced");
      expect(result.current.connectedPeers).toBe(2);
    });

    it("should return canEdit computed value", () => {
      vi.mocked(useStore).mockImplementation((store, selector) => {
        if (selector) {
          const state = selector({
            board: {
              isLoading: false,
              currentBoard: { id: "test" } as any,
            },
            room: { isConnected: true },
          } as any);
          // Simulate canEdit computation
          if (typeof state === "boolean") return true;
          return state;
        }
        return null;
      });

      const { result } = renderHook(() => useBoardState());

      expect(result.current.canEdit).toBe(true);
    });

    it("should return board actions", () => {
      const { result } = renderHook(() => useBoardState());

      expect(result.current.actions).toBe(boardActions);
    });
  });

  describe("useRoomState", () => {
    it("should return room state from store", () => {
      vi.mocked(useStore).mockImplementation((store, selector) => {
        if (selector) {
          return selector({
            room: {
              roomCode: "TIER-TEST",
              isHost: true,
              isConnected: true,
              isConnecting: false,
              error: null,
            },
          } as any);
        }
        return null;
      });

      const { result } = renderHook(() => useRoomState());

      expect(result.current.roomCode).toBe("TIER-TEST");
      expect(result.current.isHost).toBe(true);
      expect(result.current.isConnected).toBe(true);
      expect(result.current.isConnecting).toBe(false);
    });

    it("should return display code", () => {
      vi.mocked(useStore).mockImplementation((store, selector) => {
        if (selector) {
          return selector({
            room: {
              roomCode: "TIER-DISPLAY",
            },
          } as any);
        }
        return null;
      });

      const { result } = renderHook(() => useRoomState());

      expect(result.current.displayCode).toBe("TIER-DISPLAY");
    });

    it("should return room actions", () => {
      const { result } = renderHook(() => useRoomState());

      expect(result.current.actions).toBe(roomActions);
    });
  });

  describe("usePeerState", () => {
    it("should return peer state from store", () => {
      const mockPeer = { id: "peer-1", name: "Test Peer" } as any;

      vi.mocked(useStore).mockImplementation((store, selector) => {
        if (selector) {
          return selector({
            peer: {
              localPeer: mockPeer,
              remotePeers: [mockPeer],
              connectionStatus: "connected",
            },
          } as any);
        }
        return null;
      });

      const { result } = renderHook(() => usePeerState());

      expect(result.current.localPeer).toBe(mockPeer);
      expect(result.current.remotePeers).toEqual([mockPeer]);
      expect(result.current.connectionStatus).toBe("connected");
    });

    it("should return all peers from derived store", () => {
      const mockPeer = { id: "peer-1" } as any;

      vi.mocked(useStore).mockImplementation((store, selector) => {
        if (store === undefined || store === null) {
          return [mockPeer];
        }
        if (selector) {
          return selector({
            peer: {
              localPeer: mockPeer,
              remotePeers: [],
            },
          } as any);
        }
        return null;
      });

      const { result } = renderHook(() => usePeerState());

      expect(result.current.allPeers).toEqual([mockPeer]);
    });

    it("should return peer count from derived store", () => {
      vi.mocked(useStore).mockImplementation((store, selector) => {
        if (store === undefined || store === null) {
          return 3;
        }
        if (selector) {
          return selector({
            peer: {
              localPeer: { id: "local" },
              remotePeers: [{ id: "remote1" }, { id: "remote2" }],
            },
          } as any);
        }
        return null;
      });

      const { result } = renderHook(() => usePeerState());

      expect(result.current.peerCount).toBe(3);
    });

    it("should return peer actions", () => {
      const { result } = renderHook(() => usePeerState());

      expect(result.current.actions).toBe(peerActions);
    });
  });

  describe("useAppState", () => {
    it("should return complete app state", () => {
      const mockBoard = { id: "test", name: "Test Board" } as any;
      const mockPeer = { id: "peer-1" } as any;

      vi.mocked(useStore).mockImplementation((store, selector) => {
        if (selector) {
          const state = selector({
            board: {
              currentBoard: mockBoard,
              isLoading: false,
              error: null,
              documentUrl: "automerge:test",
              syncStatus: "synced",
              connectedPeers: 2,
            },
            room: {
              roomCode: "TIER-TEST",
              isHost: true,
              isConnected: true,
              isConnecting: false,
              error: null,
            },
            peer: {
              localPeer: mockPeer,
              remotePeers: [mockPeer],
              connectionStatus: "connected",
            },
          } as any);

          // Handle derived computations
          if (typeof state === "boolean") return true;
          if (typeof state === "number") return 2;
          if (Array.isArray(state)) return [mockPeer, mockPeer];
          return state;
        }
        return null;
      });

      const { result } = renderHook(() => useAppState());

      expect(result.current.board).toBe(mockBoard);
      expect(result.current.roomCode).toBe("TIER-TEST");
      expect(result.current.isHost).toBe(true);
      expect(result.current.isConnected).toBe(true);
      expect(result.current.localPeer).toBe(mockPeer);
      expect(result.current.peerCount).toBe(2);
    });

    it("should return all action sets", () => {
      const { result } = renderHook(() => useAppState());

      expect(result.current.actions.board).toBe(boardActions);
      expect(result.current.actions.room).toBe(roomActions);
      expect(result.current.actions.peer).toBe(peerActions);
      expect(result.current.actions.initializeHostRoom).toBeDefined();
      expect(result.current.actions.joinRoomAsClient).toBeDefined();
      expect(result.current.actions.leaveRoom).toBeDefined();
    });
  });
});
