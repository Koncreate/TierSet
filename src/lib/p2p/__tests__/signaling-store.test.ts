import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { signalingStore } from "../../../lib/p2p/signaling-store";

describe("SignalingStore", () => {
  beforeEach(() => {
    // Clear store before each test
    signalingStore.destroy();
  });

  afterEach(() => {
    signalingStore.destroy();
  });

  describe("createRoom", () => {
    it("should create a new room with host info", () => {
      const room = signalingStore.createRoom("TIER-ABC123", "host-peer-id");

      expect(room.code).toBe("TIER-ABC123");
      expect(room.hostId).toBe("host-peer-id");
      expect(room.peerCount).toBe(1);
      expect(room.hostOffer).toBeUndefined();
      expect(room.clientAnswer).toBeUndefined();
      expect(room.hostCandidates).toEqual([]);
      expect(room.clientCandidates).toEqual([]);
    });

    it("should set expiration time", () => {
      const ttlMs = 3600000; // 1 hour
      const now = Date.now();
      const room = signalingStore.createRoom("TIER-TEST", "host-id", ttlMs);

      expect(room.expiresAt).toBeGreaterThan(now);
      expect(room.expiresAt).toBeLessThanOrEqual(now + ttlMs);
    });
  });

  describe("getRoom", () => {
    it("should return room by code", () => {
      signalingStore.createRoom("TIER-GET", "host-id");
      const room = signalingStore.getRoom("TIER-GET");

      expect(room).toBeTruthy();
      expect(room?.code).toBe("TIER-GET");
    });

    it("should return null for non-existent room", () => {
      const room = signalingStore.getRoom("TIER-NONEXISTENT");
      expect(room).toBeNull();
    });

    it("should return null for expired room", () => {
      // Create room with very short TTL
      signalingStore.createRoom("TIER-EXPIRE", "host-id", 1);

      // Wait a small amount for real time expiration
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const expiredRoom = signalingStore.getRoom("TIER-EXPIRE");
          expect(expiredRoom).toBeNull();
          resolve();
        }, 10);
      });
    });
  });

  describe("SDP offer/answer", () => {
    it("should set and get host offer", () => {
      const code = "TIER-OFFER";
      const offer: RTCSessionDescriptionInit = {
        type: "offer",
        sdp: "v=0\r\no=- test offer",
      };

      signalingStore.createRoom(code, "host-id");
      signalingStore.setHostOffer(code, offer);

      const retrieved = signalingStore.getHostOffer(code);
      expect(retrieved).toEqual(offer);
    });

    it("should set and get client answer", () => {
      const code = "TIER-ANSWER";
      const answer: RTCSessionDescriptionInit = {
        type: "answer",
        sdp: "v=0\r\no=- test answer",
      };

      signalingStore.createRoom(code, "host-id");
      signalingStore.setClientAnswer(code, answer);

      const retrieved = signalingStore.getClientAnswer(code);
      expect(retrieved).toEqual(answer);
    });

    it("should return null for non-existent offer/answer", () => {
      signalingStore.createRoom("TIER-EMPTY", "host-id");

      expect(signalingStore.getHostOffer("TIER-EMPTY")).toBeNull();
      expect(signalingStore.getClientAnswer("TIER-EMPTY")).toBeNull();
    });
  });

  describe("ICE candidates", () => {
    it("should add and get host candidates", () => {
      const code = "TIER-HOST-CAND";
      const candidate1: RTCIceCandidateInit = {
        candidate: "candidate:1 1 UDP test1",
        sdpMid: "0",
        sdpMLineIndex: 0,
      };
      const candidate2: RTCIceCandidateInit = {
        candidate: "candidate:2 1 UDP test2",
        sdpMid: "0",
        sdpMLineIndex: 0,
      };

      signalingStore.createRoom(code, "host-id");
      signalingStore.addHostCandidate(code, candidate1);
      signalingStore.addHostCandidate(code, candidate2);

      const candidates = signalingStore.getHostCandidates(code);
      expect(candidates).toHaveLength(2);
      expect(candidates).toContainEqual(candidate1);
      expect(candidates).toContainEqual(candidate2);
    });

    it("should add and get client candidates", () => {
      const code = "TIER-CLIENT-CAND";
      const candidate: RTCIceCandidateInit = {
        candidate: "candidate:1 1 UDP client-test",
        sdpMid: "0",
        sdpMLineIndex: 0,
      };

      signalingStore.createRoom(code, "host-id");
      signalingStore.addClientCandidate(code, candidate);

      const candidates = signalingStore.getClientCandidates(code);
      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toEqual(candidate);
    });

    it("should return empty array for non-existent candidates", () => {
      signalingStore.createRoom("TIER-NO-CAND", "host-id");

      expect(signalingStore.getHostCandidates("TIER-NO-CAND")).toEqual([]);
      expect(signalingStore.getClientCandidates("TIER-NO-CAND")).toEqual([]);
    });
  });

  describe("peer count", () => {
    it("should increment peer count", () => {
      const code = "TIER-PEER-COUNT";
      signalingStore.createRoom(code, "host-id");

      const count1 = signalingStore.incrementPeerCount(code);
      const count2 = signalingStore.incrementPeerCount(code);

      expect(count1).toBe(2);
      expect(count2).toBe(3);
    });

    it("should decrement peer count", () => {
      const code = "TIER-PEER-DEC";
      signalingStore.createRoom(code, "host-id");
      signalingStore.incrementPeerCount(code);
      signalingStore.incrementPeerCount(code);

      const count1 = signalingStore.decrementPeerCount(code);
      const count2 = signalingStore.decrementPeerCount(code);

      expect(count1).toBe(2);
      expect(count2).toBe(1);
    });

    it("should not go below zero", () => {
      const code = "TIER-PEER-ZERO";
      signalingStore.createRoom(code, "host-id");

      const count = signalingStore.decrementPeerCount(code);
      expect(count).toBe(0);
    });
  });

  describe("deleteRoom", () => {
    it("should delete room", () => {
      const code = "TIER-DELETE";
      signalingStore.createRoom(code, "host-id");

      const deleted = signalingStore.deleteRoom(code);
      expect(deleted).toBe(true);

      const room = signalingStore.getRoom(code);
      expect(room).toBeNull();
    });

    it("should return false for non-existent room", () => {
      const deleted = signalingStore.deleteRoom("TIER-NONEXISTENT");
      expect(deleted).toBe(false);
    });
  });

  describe("cleanupExpired", () => {
    it("should cleanup expired rooms", async () => {
      // Create rooms with different TTLs
      signalingStore.createRoom("TIER-SHORT", "host-id", 10);
      signalingStore.createRoom("TIER-LONG", "host-id", 1000);

      // Wait for short room to expire
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          // Trigger expiration check
          signalingStore.getRoom("TIER-SHORT");
          resolve();
        }, 50);
      });

      const stats = signalingStore.getStats();

      expect(stats.rooms).toContain("TIER-LONG");
      expect(stats.rooms).not.toContain("TIER-SHORT");
    });
  });

  describe("getStats", () => {
    it("should return room statistics", () => {
      signalingStore.createRoom("TIER-STAT-1", "host-id");
      signalingStore.createRoom("TIER-STAT-2", "host-id");

      const stats = signalingStore.getStats();

      expect(stats.roomCount).toBe(2);
      expect(stats.rooms).toContain("TIER-STAT-1");
      expect(stats.rooms).toContain("TIER-STAT-2");
    });
  });
});
