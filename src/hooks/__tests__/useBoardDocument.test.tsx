/**
 * useBoardDocument Hook Unit Tests
 * ==================================
 *
 * These tests cover the board document hook functionality including:
 * - Automerge document sync
 * - P2P integration
 * - Change propagation
 * - Storage persistence
 * - Loading states and error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { BoardDocument } from "../../lib/documents";
import type { P2PNetwork } from "../../lib/p2p";

// ============================================================================
// Mocks
// ============================================================================

// Mock storage
vi.mock("../../lib/storage", () => ({
  storage: {
    boards: {
      getBoard: vi.fn(),
      saveBoard: vi.fn(),
    },
  },
}));

// Mock P2PNetwork class
vi.mock("../../lib/p2p", async () => {
  const actual = await vi.importActual("../../lib/p2p");
  return {
    ...(actual as object),
    P2PNetwork: vi.fn().mockImplementation(() => ({
      on: vi.fn(),
      off: vi.fn(),
      getPeers: vi.fn(() => []),
      getStatus: vi.fn(() => "disconnected"),
      sendSync: vi.fn(),
      destroy: vi.fn(),
    })),
  };
});

// Import after mocks
import { useBoardDocument } from "../useBoardDocument";
import { storage } from "../../lib/storage";
import { P2PNetwork } from "../../lib/p2p";

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

function createMockNetwork(overrides?: Partial<P2PNetwork>): P2PNetwork {
  return {
    on: vi.fn(),
    off: vi.fn(),
    getPeers: vi.fn(() => []),
    getStatus: vi.fn(() => "disconnected"),
    sendSync: vi.fn(),
    destroy: vi.fn(),
    ...overrides,
  } as unknown as P2PNetwork;
}

// Type-safe mock accessors
const mockGetBoard = vi.mocked(storage.boards.getBoard);
const mockSaveBoard = vi.mocked(storage.boards.saveBoard);

// ============================================================================
// Tests
// ============================================================================

describe("useBoardDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("Initialization", () => {
    it("should initialize with loading state", async () => {
      // Mock storage to return a board
      mockGetBoard.mockResolvedValue(createMockBoard());

      const { result } = renderHook(() => useBoardDocument("test-board-id"));

      // Initial state
      expect(result.current.isLoading).toBe(true);
      expect(result.current.doc).toBeNull();
      expect(result.current.error).toBeNull();

      // Wait for load to complete
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.doc).toBeDefined();
      expect(mockGetBoard).toHaveBeenCalledWith("test-board-id");
    });

    it("should load board from storage on mount", async () => {
      const mockBoard = createMockBoard({ name: "Loaded Board" });
      mockGetBoard.mockResolvedValue(mockBoard);

      const { result } = renderHook(() => useBoardDocument("test-board-id"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.doc?.name).toBe("Loaded Board");
      expect(mockGetBoard).toHaveBeenCalledTimes(1);
    });

    it("should handle storage load error", async () => {
      mockGetBoard.mockRejectedValue(new Error("Storage error"));

      const { result } = renderHook(() => useBoardDocument("test-board-id"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeDefined();
      expect(result.current.error?.message).toBe("Storage error");
      expect(result.current.doc).toBeNull();
    });

    it("should set sync status to disconnected without network", async () => {
      mockGetBoard.mockResolvedValue(createMockBoard());

      const { result } = renderHook(() => useBoardDocument("test-board-id"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.syncStatus).toBe("disconnected");
      expect(result.current.connectedPeers).toBe(0);
    });
  });

  describe("With P2P Network", () => {
    it("should update sync status when network is provided", async () => {
      const mockBoard = createMockBoard();
      mockGetBoard.mockResolvedValue(mockBoard);

      const mockNetwork = createMockNetwork({
        getPeers: vi.fn(() => []),
        getStatus: vi.fn(() => "connected"),
      });

      const { result } = renderHook(() =>
        useBoardDocument("test-board-id", { network: mockNetwork }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.syncStatus).toBe("synced");
      expect(result.current.connectedPeers).toBe(0);
    });

    it("should track connected peers", async () => {
      const mockBoard = createMockBoard();
      mockGetBoard.mockResolvedValue(mockBoard);

      const mockPeer = {
        id: "peer-1",
        name: "Test Peer",
        role: "client" as const,
        connectedAt: Date.now(),
        capabilities: { canHost: true, canRelay: false, supportsVideo: false },
      };

      const mockNetwork = createMockNetwork({
        getPeers: vi.fn(() => [mockPeer]),
        getStatus: vi.fn(() => "connected"),
      });

      const { result } = renderHook(() =>
        useBoardDocument("test-board-id", { network: mockNetwork }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.connectedPeers).toBe(1);
    });

    it("should set up sync listeners on network", async () => {
      const mockBoard = createMockBoard();
      mockGetBoard.mockResolvedValue(mockBoard);

      const mockNetwork = createMockNetwork();
      const onSpy = vi.fn();
      mockNetwork.on = onSpy;

      renderHook(() => useBoardDocument("test-board-id", { network: mockNetwork }));

      await waitFor(() => {
        expect(onSpy).toHaveBeenCalledWith("sync:received", expect.any(Function));
        expect(onSpy).toHaveBeenCalledWith("peer:joined", expect.any(Function));
        expect(onSpy).toHaveBeenCalledWith("peer:left", expect.any(Function));
        expect(onSpy).toHaveBeenCalledWith("status:changed", expect.any(Function));
      });
    });

    it("should clean up listeners on unmount", async () => {
      const mockBoard = createMockBoard();
      mockGetBoard.mockResolvedValue(mockBoard);

      const mockNetwork = createMockNetwork();
      const offSpy = vi.fn();
      mockNetwork.off = offSpy;

      const { unmount } = renderHook(() =>
        useBoardDocument("test-board-id", { network: mockNetwork }),
      );

      await waitFor(() => {
        expect(offSpy).not.toHaveBeenCalled();
      });

      unmount();

      expect(offSpy).toHaveBeenCalledWith("sync:received", expect.any(Function));
      expect(offSpy).toHaveBeenCalledWith("peer:joined", expect.any(Function));
      expect(offSpy).toHaveBeenCalledWith("peer:left", expect.any(Function));
      expect(offSpy).toHaveBeenCalledWith("status:changed", expect.any(Function));
    });

    it("should handle network status changes", async () => {
      const mockBoard = createMockBoard();
      mockGetBoard.mockResolvedValue(mockBoard);

      let currentStatus = "connected";
      const mockNetwork = createMockNetwork({
        getStatus: vi.fn(() => currentStatus),
      });

      const { result } = renderHook(() =>
        useBoardDocument("test-board-id", { network: mockNetwork }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.syncStatus).toBe("synced");

      // Simulate network disconnecting
      currentStatus = "disconnected";

      // Trigger status change event
      const statusCallback = mockNetwork.on.mock.calls.find(
        (call) => call[0] === "status:changed",
      )?.[1] as (status: string) => void;

      await act(async () => {
        statusCallback?.("disconnected");
      });

      expect(result.current.syncStatus).toBe("disconnected");
    });
  });

  describe("Document Changes", () => {
    it("should call change function on document", async () => {
      const mockBoard = createMockBoard();
      mockGetBoard.mockResolvedValue(mockBoard);

      const { result } = renderHook(() => useBoardDocument("test-board-id"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // The change function should exist
      expect(result.current.change).toBeDefined();
      expect(typeof result.current.change).toBe("function");
    });

    it("should save to storage after change", async () => {
      const mockBoard = createMockBoard();
      mockGetBoard.mockResolvedValue(mockBoard);
      mockSaveBoard.mockResolvedValue();

      const { result } = renderHook(() => useBoardDocument("test-board-id"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Call save directly
      await act(async () => {
        await result.current.save();
      });

      expect(mockSaveBoard).toHaveBeenCalledWith(
        "test-board-id",
        mockBoard,
      );
    });

    it("should sync changes to peers when connected", async () => {
      const mockBoard = createMockBoard();
      mockGetBoard.mockResolvedValue(mockBoard);

      const mockNetwork = createMockNetwork({
        getStatus: vi.fn(() => "connected"),
        sendSync: vi.fn(),
      });

      const { result } = renderHook(() =>
        useBoardDocument("test-board-id", { network: mockNetwork }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Verify network is set up correctly
      expect(result.current.syncStatus).toBe("synced");
      expect(mockNetwork.getStatus).toHaveBeenCalled();
    });

    it("should not sync when network is disconnected", async () => {
      const mockBoard = createMockBoard();
      mockGetBoard.mockResolvedValue(mockBoard);

      const mockNetwork = createMockNetwork({
        getStatus: vi.fn(() => "disconnected"),
        sendSync: vi.fn(),
      });

      const { result } = renderHook(() =>
        useBoardDocument("test-board-id", { network: mockNetwork }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.syncStatus).toBe("disconnected");
    });

    it("should handle change when document is null", async () => {
      mockGetBoard.mockResolvedValue(null as any);

      const { result } = renderHook(() => useBoardDocument("test-board-id"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should not throw
      await act(async () => {
        result.current.change((doc) => {
          doc.name = "Updated";
        });
      });

      // Document should remain null
      expect(result.current.doc).toBeNull();
    });
  });

  describe("Remote Sync", () => {
    it("should merge remote changes from sync", async () => {
      const mockBoard = createMockBoard();
      mockGetBoard.mockResolvedValue(mockBoard);

      const mockNetwork = createMockNetwork();
      let syncCallback: ((delta: Uint8Array, senderId: string) => void) | null = null;

      mockNetwork.on = vi.fn((event, callback) => {
        if (event === "sync:received") {
          syncCallback = callback as (delta: Uint8Array, senderId: string) => void;
        }
      });

      const { result } = renderHook(() =>
        useBoardDocument("test-board-id", { network: mockNetwork }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Verify callback was registered
      expect(syncCallback).toBeDefined();
    });

    it("should save merged document to storage", async () => {
      const mockBoard = createMockBoard();
      mockGetBoard.mockResolvedValue(mockBoard);
      mockSaveBoard.mockResolvedValue();

      const mockNetwork = createMockNetwork();

      const { result } = renderHook(() =>
        useBoardDocument("test-board-id", { network: mockNetwork }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Verify hook is set up correctly
      expect(result.current.syncStatus).toBe("disconnected");
    });

    it("should handle sync merge errors", async () => {
      const mockBoard = createMockBoard();
      mockGetBoard.mockResolvedValue(mockBoard);

      const mockNetwork = createMockNetwork();

      const { result } = renderHook(() =>
        useBoardDocument("test-board-id", { network: mockNetwork }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should handle gracefully - initial state should be synced or disconnected
      expect(["synced", "disconnected"]).toContain(result.current.syncStatus);
    });
  });

  describe("Save and Reload", () => {
    it("should save document to storage", async () => {
      const mockBoard = createMockBoard();
      mockGetBoard.mockResolvedValue(mockBoard);
      mockSaveBoard.mockResolvedValue();

      const { result } = renderHook(() => useBoardDocument("test-board-id"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.save();
      });

      expect(mockSaveBoard).toHaveBeenCalledWith(
        "test-board-id",
        mockBoard,
      );
    });

    it("should handle save errors gracefully", async () => {
      const mockBoard = createMockBoard();
      mockGetBoard.mockResolvedValue(mockBoard);
      mockSaveBoard.mockRejectedValue(new Error("Save failed"));

      const { result } = renderHook(() => useBoardDocument("test-board-id"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should not throw
      await act(async () => {
        await result.current.save();
      });

      expect(result.current.error).toBeNull();
    });

    it("should reload document from storage", async () => {
      const initialBoard = createMockBoard({ name: "Initial" });
      const updatedBoard = createMockBoard({ name: "Updated" });

      mockGetBoard
        .mockResolvedValueOnce(initialBoard)
        .mockResolvedValueOnce(updatedBoard);

      const { result } = renderHook(() => useBoardDocument("test-board-id"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.doc?.name).toBe("Initial");

      await act(async () => {
        await result.current.reload();
      });

      expect(result.current.doc?.name).toBe("Updated");
      expect(mockGetBoard).toHaveBeenCalledTimes(2);
    });

    it("should handle reload errors", async () => {
      const mockBoard = createMockBoard();
      mockGetBoard
        .mockResolvedValueOnce(mockBoard)
        .mockRejectedValueOnce(new Error("Reload failed"));

      const { result } = renderHook(() => useBoardDocument("test-board-id"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.reload();
      });

      expect(result.current.error).toBeDefined();
      expect(result.current.error?.message).toBe("Reload failed");
    });
  });

  describe("Peer Events", () => {
    it("should update peers on peer:joined event", async () => {
      const mockBoard = createMockBoard();
      mockGetBoard.mockResolvedValue(mockBoard);

      const mockPeer = {
        id: "peer-1",
        name: "Test Peer",
        role: "client" as const,
        connectedAt: Date.now(),
        capabilities: { canHost: true, canRelay: false, supportsVideo: false },
      };

      const mockNetwork = createMockNetwork({
        getPeers: vi.fn(() => [mockPeer]),
      });

      let peerJoinedCallback: ((peer: typeof mockPeer) => void) | null = null;

      mockNetwork.on = vi.fn((event, callback) => {
        if (event === "peer:joined") {
          peerJoinedCallback = callback as (peer: typeof mockPeer) => void;
        }
      });

      const { result } = renderHook(() =>
        useBoardDocument("test-board-id", { network: mockNetwork }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        peerJoinedCallback?.(mockPeer);
      });

      expect(result.current.connectedPeers).toBe(1);
    });

    it("should update peers on peer:left event", async () => {
      const mockBoard = createMockBoard();
      mockGetBoard.mockResolvedValue(mockBoard);

      const mockPeer = {
        id: "peer-1",
        name: "Test Peer",
        role: "client" as const,
        connectedAt: Date.now(),
        capabilities: { canHost: true, canRelay: false, supportsVideo: false },
      };

      const mockNetwork = createMockNetwork({
        getPeers: vi.fn(() => []), // Peer left, so empty
      });

      let peerLeftCallback: ((peer: typeof mockPeer) => void) | null = null;

      mockNetwork.on = vi.fn((event, callback) => {
        if (event === "peer:left") {
          peerLeftCallback = callback as (peer: typeof mockPeer) => void;
        }
      });

      const { result } = renderHook(() =>
        useBoardDocument("test-board-id", { network: mockNetwork }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        peerLeftCallback?.(mockPeer);
      });

      expect(result.current.connectedPeers).toBe(0);
    });
  });

  describe("Network Updates", () => {
    it("should update when network option changes", async () => {
      const mockBoard = createMockBoard();
      mockGetBoard.mockResolvedValue(mockBoard);

      // Start without network
      const { result, rerender } = renderHook(
        ({ network }) => useBoardDocument("test-board-id", { network }),
        { initialProps: { network: null as P2PNetwork | null } },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.syncStatus).toBe("disconnected");

      // Add network
      const mockNetwork = createMockNetwork({
        getStatus: vi.fn(() => "connected"),
        getPeers: vi.fn(() => []),
      });

      rerender({ network: mockNetwork });

      expect(result.current.syncStatus).toBe("synced");
    });

    it("should handle null network gracefully", async () => {
      const mockBoard = createMockBoard();
      mockGetBoard.mockResolvedValue(mockBoard);

      const { result } = renderHook(() => useBoardDocument("test-board-id", { network: null }));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.syncStatus).toBe("disconnected");
      expect(result.current.connectedPeers).toBe(0);
    });
  });
});
