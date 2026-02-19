/**
 * P2PNetwork Unit Tests - Core Functionality
 * ===========================================
 * 
 * These tests cover the essential P2P networking functionality of TierBoard.
 * They focus on synchronous operations and basic async flows that don't
 * involve long-running polling intervals.
 * 
 * For full integration tests with WebRTC, see the E2E test suite.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  vi,
} from "vitest";

// Import mocked signaling functions
import {
  createRoom as mockCreateRoom,
  joinRoom as mockJoinRoom,
  leaveRoom as mockLeaveRoom,
  kickPeer as mockKickPeer,
  getOffer as mockGetOffer,
} from "../signaling-client";

import { P2PNetwork } from "../P2PNetwork";
import type { ChatMessage } from "../types";

// ============================================================================
// WebRTC API Mocks
// ============================================================================

class MockRTCDataChannel {
  readyState: "connecting" | "open" | "closing" | "closed" = "connecting";
  onopen: (() => void) | null = null;

  constructor(public label: string) {
    setTimeout(() => {
      this.readyState = "open";
      this.onopen?.();
    }, 10);
  }

  send(_data: string | ArrayBuffer | Blob): void {}
  close(): void {
    this.readyState = "closed";
  }
}

class MockRTCSessionDescription implements RTCSessionDescription {
  type: RTCSdpType;
  sdp: string;
  constructor(init: RTCSessionDescriptionInit) {
    this.type = init.type || "offer";
    this.sdp = init.sdp || "";
  }
  toJSON(): RTCSessionDescriptionInit {
    return { type: this.type, sdp: this.sdp };
  }
}

class MockRTCPeerConnection {
  iceGatheringState: RTCIceGatheringState = "complete";
  iceConnectionState: RTCIceConnectionState = "connected";
  connectionState: RTCPeerConnectionState = "connected";
  localDescription: RTCSessionDescription | null = null;

  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  ondatachannel: ((event: RTCDataChannelEvent) => void) | null = null;

  private static instances: MockRTCPeerConnection[] = [];
  constructor() {
    MockRTCPeerConnection.instances.push(this);
  }
  static wasCalled(): boolean {
    return MockRTCPeerConnection.instances.length > 0;
  }
  static clearInstances(): void {
    MockRTCPeerConnection.instances = [];
  }

  createDataChannel(label: string): RTCDataChannel {
    return new MockRTCDataChannel(label) as unknown as RTCDataChannel;
  }
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: "offer", sdp: "v=0\r\no=- offer" };
  }
  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: "answer", sdp: "v=0\r\no=- answer" };
  }
  async setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = desc as RTCSessionDescription;
  }
  async setRemoteDescription(_desc: RTCSessionDescriptionInit): Promise<void> {
    this.connectionState = "connected";
    this.iceConnectionState = "connected";
    // Trigger state change synchronously
    this.onconnectionstatechange?.();
  }
  async addIceCandidate(): Promise<void> {}
  addEventListener(): void {}
  removeEventListener(): void {}
  close(): void {
    this.connectionState = "closed";
  }
}

beforeAll(() => {
  // @ts-expect-error - Mocking
  global.RTCPeerConnection = MockRTCPeerConnection;
  // @ts-expect-error - Mocking
  global.RTCDataChannel = MockRTCDataChannel;
  // @ts-expect-error - Mocking
  global.RTCSessionDescription = MockRTCSessionDescription;
});

afterAll(() => {
  // @ts-expect-error - Restoring
  global.RTCPeerConnection = undefined;
  // @ts-expect-error - Restoring
  global.RTCDataChannel = undefined;
  // @ts-expect-error - Restoring
  global.RTCSessionDescription = undefined;
  MockRTCPeerConnection.clearInstances();
});

const waitFor = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ============================================================================
// Tests
// ============================================================================

describe("P2PNetwork", () => {
  let network: P2PNetwork;

  beforeEach(() => {
    vi.clearAllMocks();
    MockRTCPeerConnection.clearInstances();
    network = new P2PNetwork({ peerName: "TestPeer" });
  });

  afterEach(async () => {
    network?.destroy();
  });

  describe("Initialization", () => {
    it("should create instance with unique ID", () => {
      expect(network.id).toBeDefined();
      expect(network.id).toMatch(/^[0-9a-f-]+$/i);
    });

    it("should initialize in disconnected state", () => {
      expect(network.getStatus()).toBe("disconnected");
    });

    it("should have empty peers", () => {
      expect(network.getPeers()).toEqual([]);
    });

    it("should have null room code", () => {
      expect(network.getRoomCode()).toBeNull();
    });

    it("should not be host", () => {
      expect(network.getIsHost()).toBe(false);
    });

    it("should create RTCPeerConnection", () => {
      expect(MockRTCPeerConnection.wasCalled()).toBe(true);
    });
  });

  describe("createRoom (Host)", () => {
    it("should create room and return code", async () => {
      const result = await network.createRoom();
      expect(result.code).toMatch(/^TIER-/);
      expect(result.room).toBe(network);
    });

    it("should set peer as host", async () => {
      await network.createRoom();
      expect(network.getIsHost()).toBe(true);
    });

    it("should set room code", async () => {
      await network.createRoom();
      expect(network.getRoomCode()).toMatch(/^TIER-/);
    });

    it("should add self as host peer", async () => {
      await network.createRoom();
      const peers = network.getPeers();
      expect(peers.length).toBe(1);
      expect(peers[0].role).toBe("host");
    });

    it("should call signaling createRoom", async () => {
      await network.createRoom();
      expect(mockCreateRoom).toHaveBeenCalled();
    });

    it("should accept password", async () => {
      await network.createRoom({ password: "secret" });
      expect(mockCreateRoom).toHaveBeenCalledWith({
        data: expect.objectContaining({ password: "secret" }),
      });
    });

    it("should accept maxPeers", async () => {
      await network.createRoom({ maxPeers: 5 });
      expect(mockCreateRoom).toHaveBeenCalledWith({
        data: expect.objectContaining({ maxPeers: 5 }),
      });
    });
  });

  describe("joinRoom (Client)", () => {
    beforeEach(() => {
      mockGetOffer.mockResolvedValue({ offer: { type: "offer", sdp: "v=0" } });
    });

    it("should join room", async () => {
      const result = await network.joinRoom("TIER-TEST");
      expect(result).toBe(network);
    });

    it("should set room code", async () => {
      await network.joinRoom("TIER-JOIN");
      expect(network.getRoomCode()).toBe("TIER-JOIN");
    });

    it("should set peer as client", async () => {
      await network.joinRoom("TIER-TEST");
      expect(network.getIsHost()).toBe(false);
    });

    it("should call signaling joinRoom", async () => {
      await network.joinRoom("TIER-TEST");
      expect(mockJoinRoom).toHaveBeenCalled();
    });

    it("should accept password", async () => {
      await network.joinRoom("TIER-TEST", { password: "pass" });
      expect(mockJoinRoom).toHaveBeenCalledWith({
        data: expect.objectContaining({ password: "pass" }),
      });
    });

    it("should throw on timeout", async () => {
      mockGetOffer.mockResolvedValue({ offer: null });
      await expect(network.joinRoom("TIER-TIMEOUT")).rejects.toThrow("Timeout");
    }, 35000);
  });

  describe("leaveRoom", () => {
    it("should reset room state", async () => {
      await network.createRoom();
      await network.leaveRoom();
      expect(network.getRoomCode()).toBeNull();
    });

    it("should clear peers", async () => {
      await network.createRoom();
      await network.leaveRoom();
      expect(network.getPeers()).toHaveLength(0);
    });

    it("should call signaling leaveRoom", async () => {
      await network.createRoom();
      await network.leaveRoom();
      expect(mockLeaveRoom).toHaveBeenCalled();
    });
  });

  describe("kickPeer (Host Only)", () => {
    it("should kick peer", async () => {
      await network.createRoom();
      await network.kickPeer("peer-id");
      expect(mockKickPeer).toHaveBeenCalled();
    });

    it("should throw if not host", async () => {
      mockGetOffer.mockResolvedValue({ offer: { type: "offer", sdp: "v=0" } });
      await network.joinRoom("TIER-TEST");
      await expect(network.kickPeer("peer")).rejects.toThrow("Only host");
    });

    it("should throw if no room", async () => {
      await expect(network.kickPeer("peer")).rejects.toThrow("Only host");
    });
  });

  describe("closeRoom (Host Only)", () => {
    it("should close room", async () => {
      await network.createRoom();
      await network.closeRoom();
      expect(network.getRoomCode()).toBeNull();
    });

    it("should throw if not host", async () => {
      mockGetOffer.mockResolvedValue({ offer: { type: "offer", sdp: "v=0" } });
      await network.joinRoom("TIER-TEST");
      await expect(network.closeRoom()).rejects.toThrow("Only host");
    });
  });

  describe("sendSync", () => {
    it("should send sync delta", async () => {
      await network.createRoom();
      await waitFor(50);
      expect(() => {
        network.sendSync("board-1", new Uint8Array([1, 2, 3]));
      }).not.toThrow();
    });

    it("should not throw when channel not ready", () => {
      expect(() => {
        network.sendSync("board-1", new Uint8Array([1]));
      }).not.toThrow();
    });
  });

  describe("sendChatMessage", () => {
    it("should send chat", async () => {
      await network.createRoom();
      await waitFor(50);
      expect(() => {
        network.sendChatMessage("board-1", "Hello!");
      }).not.toThrow();
    });
  });

  describe("sendMessage", () => {
    it("should send message", async () => {
      await network.createRoom();
      await waitFor(50);
      const msg: ChatMessage = {
        type: "chat",
        boardId: "board-1",
        content: "Test",
        timestamp: Date.now(),
        senderId: network.id,
      };
      expect(() => network.sendMessage(msg)).not.toThrow();
    });
  });

  describe("sendImage", () => {
    it("should send image", async () => {
      await network.createRoom();
      await waitFor(50);
      const uint8Array = new Uint8Array(1024);
      const blob = new Blob([uint8Array], { type: "image/png" });
      (blob as any).arrayBuffer = async () => uint8Array.buffer;
      await expect(network.sendImage("img-1", blob)).resolves.toBeUndefined();
    });

    it("should track bytes sent", async () => {
      await network.createRoom();
      await waitFor(50);
      const before = network.getStats();
      const uint8Array = new Uint8Array(1024);
      const blob = new Blob([uint8Array], { type: "image/png" });
      (blob as any).arrayBuffer = async () => uint8Array.buffer;
      await network.sendImage("img", blob);
      const after = network.getStats();
      expect(after.bytesSent).toBeGreaterThan(before.bytesSent);
    });
  });

  describe("requestImage", () => {
    it("should request image", async () => {
      await network.createRoom();
      expect(() => network.requestImage("img-1")).not.toThrow();
    });
  });

  describe("getStats", () => {
    it("should return stats", () => {
      const stats = network.getStats();
      expect(stats).toHaveProperty("peers");
      expect(stats).toHaveProperty("bytesSent");
      expect(stats).toHaveProperty("bytesReceived");
      expect(stats).toHaveProperty("lastSyncAt");
    });
  });

  describe("Error Handling", () => {
    it("should handle signaling errors", async () => {
      mockCreateRoom.mockRejectedValueOnce(new Error("Server error"));
      await expect(network.createRoom()).rejects.toThrow("Server error");
    });

    it("should handle join errors", async () => {
      mockJoinRoom.mockRejectedValueOnce(new Error("Not found"));
      await expect(network.joinRoom("INVALID")).rejects.toThrow("Not found");
    });

    it("should set failed status", async () => {
      mockJoinRoom.mockRejectedValueOnce(new Error("Failed"));
      try {
        await network.joinRoom("TIER-FAIL");
      } catch {}
      expect(network.getStatus()).toBe("failed");
    });
  });

  describe("Integration", () => {
    let host: P2PNetwork;
    let client: P2PNetwork;

    beforeEach(() => {
      host = new P2PNetwork({ peerName: "Host" });
      client = new P2PNetwork({ peerName: "Client" });
    });

    afterEach(async () => {
      host?.destroy();
      client?.destroy();
    });

    it("should support host create and client join", async () => {
      const { code } = await host.createRoom();
      expect(host.getIsHost()).toBe(true);

      mockGetOffer.mockResolvedValue({ offer: { type: "offer", sdp: "v=0" } });
      await client.joinRoom(code);
      expect(client.getIsHost()).toBe(false);
    });

    it("should support image transfer", async () => {
      await host.createRoom();
      await waitFor(50);
      const uint8Array = new Uint8Array(1024);
      const blob = new Blob([uint8Array], { type: "image/png" });
      // Polyfill arrayBuffer() for jsdom
      (blob as any).arrayBuffer = async () => uint8Array.buffer;
      await expect(host.sendImage("img", blob)).resolves.toBeUndefined();
    });
  });
});
