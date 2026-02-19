/**
 * P2P Signaling Server Functions
 * Handles WebRTC SDP offer/answer exchange and ICE candidate trickle
 */

import { createServerFn } from "@tanstack/react-start";
import { createSignalingStore } from "../../lib/p2p/signaling-store-unstorage";
import {
  generateRoomCode,
  createRoomConfig,
  hashPassword,
  verifyPassword,
} from "../../lib/p2p/room-auth";
import { z } from "zod";

// Cloudflare KV binding (injected by Workers runtime)
declare const SIGNALING_KV: KVNamespace | undefined;

// Create signaling store with KV in production, memory in development
const signalingStore = createSignalingStore(
  typeof SIGNALING_KV !== "undefined" ? SIGNALING_KV : undefined,
);

/**
 * Create a new room (host side)
 * POST /api/signaling/rooms
 */
export const createRoom = createServerFn({ method: "POST" })
  .validator(
    z.object({
      peerId: z.string(),
      peerName: z.string().optional(),
      password: z.string().optional(),
      maxPeers: z.number().optional(),
      ttlMs: z.number().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { peerId, password, maxPeers, ttlMs } = data;

    // Generate room code
    const code = generateRoomCode();

    // Create room config
    const config = createRoomConfig({
      code,
      hostId: peerId,
      maxPeers: maxPeers || 10,
      ttlMs: ttlMs || 3600000, // 1 hour default
    });

    // Hash password if provided
    if (password) {
      config.passwordHash = await hashPassword(password);
    }

    // Create signaling room entry
    const room = await signalingStore.createRoom(code, peerId, config.ttlMs);

    return {
      code: room.code,
      hostId: room.hostId,
      expiresAt: room.expiresAt,
      requiresPassword: !!config.passwordHash,
    };
  });

/**
 * Get room info (check if exists, get peer count)
 * GET /api/signaling/rooms/:code
 */
export const getRoomInfo = createServerFn({ method: "GET" })
  .validator(
    z.object({
      code: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const { code } = data;
    const room = await signalingStore.getRoom(code);

    if (!room) {
      throw new Error("Room not found");
    }

    return {
      code: room.code,
      peerCount: room.peerCount,
      hasOffer: !!room.hostOffer,
      hasAnswer: !!room.clientAnswer,
    };
  });

/**
 * Submit SDP offer (host side)
 * POST /api/signaling/rooms/:code/offer
 */
export const submitOffer = createServerFn({ method: "POST" })
  .validator(
    z.object({
      code: z.string(),
      offer: z.any() as z.Schema<RTCSessionDescriptionInit>,
    }),
  )
  .handler(async ({ data }) => {
    const { code, offer } = data;

    const room = await signalingStore.getRoom(code);
    if (!room) {
      throw new Error("Room not found");
    }

    // Only host can submit offer
    if (offer.type === "offer") {
      await signalingStore.setHostOffer(code, offer);
    }

    return {
      success: true,
      peerCount: room.peerCount,
    };
  });

/**
 * Poll for host offer (client side)
 * GET /api/signaling/rooms/:code/offer
 */
export const getOffer = createServerFn({ method: "GET" })
  .validator(
    z.object({
      code: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const { code } = data;

    const offer = await signalingStore.getHostOffer(code);
    if (!offer) {
      return { offer: null };
    }

    return { offer };
  });

/**
 * Submit SDP answer (client side)
 * POST /api/signaling/rooms/:code/answer
 */
export const submitAnswer = createServerFn({ method: "POST" })
  .validator(
    z.object({
      code: z.string(),
      answer: z.any() as z.Schema<RTCSessionDescriptionInit>,
    }),
  )
  .handler(async ({ data }) => {
    const { code, answer } = data;

    const room = await signalingStore.getRoom(code);
    if (!room) {
      throw new Error("Room not found");
    }

    if (answer.type === "answer") {
      await signalingStore.setClientAnswer(code, answer);
    }

    return {
      success: true,
    };
  });

/**
 * Poll for client answer (host side)
 * GET /api/signaling/rooms/:code/answer
 */
export const getAnswer = createServerFn({ method: "GET" })
  .validator(
    z.object({
      code: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const { code } = data;

    const answer = await signalingStore.getClientAnswer(code);
    if (!answer) {
      return { answer: null };
    }

    return { answer };
  });

/**
 * Submit ICE candidate
 * POST /api/signaling/rooms/:code/candidate
 */
export const submitCandidate = createServerFn({ method: "POST" })
  .validator(
    z.object({
      code: z.string(),
      candidate: z.any() as z.Schema<RTCIceCandidateInit>,
      from: z.enum(["host", "client"]),
    }),
  )
  .handler(async ({ data }) => {
    const { code, candidate, from } = data;

    const room = await signalingStore.getRoom(code);
    if (!room) {
      throw new Error("Room not found");
    }

    await signalingStore.addCandidate(code, candidate, from);

    return { success: true };
  });

/**
 * Get ICE candidates
 * GET /api/signaling/rooms/:code/candidates
 */
export const getCandidates = createServerFn({ method: "GET" })
  .validator(
    z.object({
      code: z.string(),
      from: z.enum(["host", "client"]),
    }),
  )
  .handler(async ({ data }) => {
    const { code, from } = data;

    const candidates = await signalingStore.getCandidates(code, from);

    return { candidates };
  });

/**
 * Join room as client (initial step)
 * POST /api/signaling/rooms/:code/join
 */
export const joinRoom = createServerFn({ method: "POST" })
  .validator(
    z.object({
      code: z.string(),
      peerId: z.string(),
      password: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { code, password } = data;

    const room = await signalingStore.getRoom(code);
    if (!room) {
      throw new Error("Room not found");
    }

    // Verify password if required
    if (room.passwordHash) {
      if (!password) {
        throw new Error("Password required");
      }
      const valid = await verifyPassword(password, room.passwordHash);
      if (!valid) {
        throw new Error("Invalid password");
      }
    }

    // Increment peer count
    const peerCount = await signalingStore.incrementPeerCount(code);

    return {
      code: room.code,
      hostId: room.hostId,
      peerCount,
      hasOffer: !!room.hostOffer,
    };
  });

/**
 * Leave room
 * POST /api/signaling/rooms/:code/leave
 */
export const leaveRoom = createServerFn({ method: "POST" })
  .validator(
    z.object({
      code: z.string(),
      peerId: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const { code, peerId } = data;

    const room = await signalingStore.getRoom(code);
    if (!room) {
      return { success: true }; // Already gone
    }

    // If host leaves, delete room
    if (peerId === room.hostId) {
      await signalingStore.deleteRoom(code);
      return { success: true, roomDeleted: true };
    }

    // Decrement peer count
    const peerCount = await signalingStore.decrementPeerCount(code);

    // If no peers left, delete room
    if (peerCount <= 1) {
      await signalingStore.deleteRoom(code);
      return { success: true, roomDeleted: true };
    }

    return { success: true, peerCount };
  });

/**
 * Kick a peer from room (host only)
 * POST /api/signaling/rooms/:code/kick
 */
export const kickPeer = createServerFn({ method: "POST" })
  .validator(
    z.object({
      code: z.string(),
      peerId: z.string(),
      hostId: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const { code, peerId, hostId } = data;

    const room = await signalingStore.getRoom(code);
    if (!room) {
      throw new Error("Room not found");
    }

    // Verify host is kicking
    if (room.hostId !== hostId) {
      throw new Error("Only host can kick peers");
    }

    // Cannot kick self
    if (peerId === hostId) {
      throw new Error("Cannot kick self");
    }

    // Decrement peer count (kicked peer will be removed)
    await signalingStore.decrementPeerCount(code);

    return { success: true, kickedPeerId: peerId };
  });

/**
 * Get signaling stats (debug/admin only)
 * GET /api/signaling/stats
 */
export const getSignalingStats = createServerFn({ method: "GET" }).handler(async () => {
  return await signalingStore.getStats();
});
