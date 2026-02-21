import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createSignalingStore } from "../../../lib/p2p/signaling-store-unstorage";
import type { SignalingStore } from "../../../lib/p2p/signaling-store-unstorage";

describe("SignalingStore", () => {
  let store: SignalingStore;

  beforeEach(() => {
    store = createSignalingStore();
  });

  afterEach(async () => {
    // Store doesn't have a clear method, so we just create a new one each test
  });

  describe("createRoom", () => {
    it("should create a new room with host info", async () => {
      const room = await store.createRoom("TIER-ABC123", "host-peer-id", 3600000);

      expect(room.code).toBe("TIER-ABC123");
      expect(room.hostId).toBe("host-peer-id");
      expect(room.peerCount).toBe(1);
      expect(room.hostOffer).toBeNull();
      expect(room.clientAnswer).toBeNull();
      expect(room.hostCandidates).toEqual([]);
      expect(room.clientCandidates).toEqual([]);
    });

    it("should set expiration time", async () => {
      const ttlMs = 3600000;
      const now = Date.now();
      const room = await store.createRoom("TIER-TEST", "host-id", ttlMs);

      expect(room.expiresAt).toBeGreaterThan(now);
      expect(room.expiresAt).toBeLessThanOrEqual(now + ttlMs);
    });
  });

  describe("getRoom", () => {
    it("should return room by code", async () => {
      await store.createRoom("TIER-GET", "host-id", 3600000);
      const room = await store.getRoom("TIER-GET");

      expect(room).toBeTruthy();
      expect(room?.code).toBe("TIER-GET");
    });

    it("should return null for non-existent room", async () => {
      const room = await store.getRoom("TIER-NONEXISTENT");
      expect(room).toBeNull();
    });

    it("should return null for expired room", async () => {
      await store.createRoom("TIER-EXPIRE", "host-id", 1);

      await new Promise<void>((resolve) => {
        setTimeout(async () => {
          const expiredRoom = await store.getRoom("TIER-EXPIRE");
          expect(expiredRoom).toBeNull();
          resolve();
        }, 10);
      });
    });
  });

  describe("SDP offer/answer", () => {
    it("should set and get host offer", async () => {
      const code = "TIER-OFFER";
      const offer: RTCSessionDescriptionInit = {
        type: "offer",
        sdp: "v=0\r\no=- test offer",
      };

      await store.createRoom(code, "host-id", 3600000);
      await store.setHostOffer(code, offer);

      const retrieved = await store.getHostOffer(code);
      expect(retrieved).toEqual(offer);
    });

    it("should set and get client answer", async () => {
      const code = "TIER-ANSWER";
      const answer: RTCSessionDescriptionInit = {
        type: "answer",
        sdp: "v=0\r\no=- test answer",
      };

      await store.createRoom(code, "host-id", 3600000);
      await store.setClientAnswer(code, answer);

      const retrieved = await store.getClientAnswer(code);
      expect(retrieved).toEqual(answer);
    });

    it("should return null for non-existent offer/answer", async () => {
      await store.createRoom("TIER-EMPTY", "host-id", 3600000);

      expect(await store.getHostOffer("TIER-EMPTY")).toBeNull();
      expect(await store.getClientAnswer("TIER-EMPTY")).toBeNull();
    });
  });

  describe("ICE candidates", () => {
    it("should add and get host candidates", async () => {
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

      await store.createRoom(code, "host-id", 3600000);
      await store.addCandidate(code, candidate1, "host");
      await store.addCandidate(code, candidate2, "host");

      // Clients get host's candidates
      const candidates = await store.getCandidates(code, "host");
      expect(candidates).toHaveLength(2);
      expect(candidates).toContainEqual(candidate1);
      expect(candidates).toContainEqual(candidate2);
    });

    it("should add and get client candidates", async () => {
      const code = "TIER-CLIENT-CAND";
      const candidate: RTCIceCandidateInit = {
        candidate: "candidate:1 1 UDP client-test",
        sdpMid: "0",
        sdpMLineIndex: 0,
      };

      await store.createRoom(code, "host-id", 3600000);
      await store.addCandidate(code, candidate, "client");

      // Host gets client's candidates
      const candidates = await store.getCandidates(code, "client");
      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toEqual(candidate);
    });

    it("should return empty array for non-existent candidates", async () => {
      await store.createRoom("TIER-NO-CAND", "host-id", 3600000);

      expect(await store.getCandidates("TIER-NO-CAND", "host")).toEqual([]);
      expect(await store.getCandidates("TIER-NO-CAND", "client")).toEqual([]);
    });
  });

  describe("peer count", () => {
    it("should increment peer count", async () => {
      const code = "TIER-PEER-COUNT";
      await store.createRoom(code, "host-id", 3600000);

      const count1 = await store.incrementPeerCount(code);
      const count2 = await store.incrementPeerCount(code);

      expect(count1).toBe(2);
      expect(count2).toBe(3);
    });

    it("should decrement peer count", async () => {
      const code = "TIER-PEER-DEC";
      await store.createRoom(code, "host-id", 3600000);
      await store.incrementPeerCount(code);
      await store.incrementPeerCount(code);

      const count1 = await store.decrementPeerCount(code);
      const count2 = await store.decrementPeerCount(code);

      expect(count1).toBe(2);
      expect(count2).toBe(1);
    });

    it("should not go below zero", async () => {
      const code = "TIER-PEER-ZERO";
      await store.createRoom(code, "host-id", 3600000);

      const count = await store.decrementPeerCount(code);
      expect(count).toBe(0);
    });
  });

  describe("deleteRoom", () => {
    it("should delete room", async () => {
      const code = "TIER-DELETE";
      await store.createRoom(code, "host-id", 3600000);

      await store.deleteRoom(code);

      const room = await store.getRoom(code);
      expect(room).toBeNull();
    });
  });

  describe("getStats", () => {
    it("should return room statistics", async () => {
      await store.createRoom("TIER-STAT-1", "host-id", 3600000);
      await store.createRoom("TIER-STAT-2", "host-id", 3600000);

      const stats = await store.getStats();

      expect(stats.rooms).toBe(2);
      expect(stats.totalPeers).toBe(2);
    });
  });

  describe("document URL", () => {
    it("should set and get document URL", async () => {
      const code = "TIER-DOC-URL";
      await store.createRoom(code, "host-id", 3600000);

      await store.setDocumentUrl(code, "automerge:abc123");
      const url = await store.getDocumentUrl(code);

      expect(url).toBe("automerge:abc123");
    });
  });
});
