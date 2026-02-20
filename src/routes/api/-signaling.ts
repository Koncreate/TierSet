/**
 * P2P Signaling API Routes
 * Handles WebRTC SDP offer/answer exchange and ICE candidate trickle
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSignalingStore } from "../../lib/p2p/signaling-store-unstorage";
import {
  generateRoomCode,
  createRoomConfig,
  hashPassword,
  verifyPassword,
} from "../../lib/p2p/room-auth";

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
  .inputValidator(
    z.object({
      peerId: z.string(),
      peerName: z.string().optional(),
      password: z.string().optional(),
      maxPeers: z.number().optional(),
      ttlMs: z.number().optional(),
      documentUrl: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { peerId, password, maxPeers, ttlMs, documentUrl } = data;

    // Generate room code
    const code = generateRoomCode();

    // Create room config
    const config = createRoomConfig({
      code,
      hostId: peerId,
      maxPeers: maxPeers || 10,
      ttlMs: ttlMs || 3600000,
    });

    // Hash password if provided
    if (password) {
      config.passwordHash = await hashPassword(password);
    }

    // Create signaling room entry
    const room = await signalingStore.createRoom(code, peerId, config.ttlMs);
    
    // Store document URL if provided
    if (documentUrl) {
      await signalingStore.setDocumentUrl(code, documentUrl);
    }

    return {
      code: room.code,
      hostId: room.hostId,
      expiresAt: room.expiresAt,
      requiresPassword: !!config.passwordHash,
      documentUrl: documentUrl || null,
    };
  });

/**
 * Get room info
 * GET /api/signaling/rooms?code=:code
 */
export const getRoomInfo = createServerFn({ method: "GET" })
  .inputValidator(
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
 * Join a room
 * POST /api/signaling/rooms/join
 */
export const joinRoom = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      code: z.string(),
      peerId: z.string(),
      password: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { code, peerId, password } = data;

    const room = await signalingStore.getRoom(code);
    if (!room) {
      throw new Error("Room not found");
    }

    // Verify password if required
    if ((room as any).passwordHash) {
      if (!password) {
        throw new Error("Password required");
      }
      const valid = await verifyPassword(
        password,
        (room as any).passwordHash,
      );
      if (!valid) {
        throw new Error("Invalid password");
      }
    }

    const peerCount = await signalingStore.incrementPeerCount(code);

    return {
      code: room.code,
      hostId: room.hostId,
      peerCount,
      hasOffer: !!room.hostOffer,
      documentUrl: room.documentUrl || null,  // Return document URL to client
    };
  });

const sdpSchema = z.object({
  type: z.string(),
  sdp: z.string().optional(),
});

/**
 * Submit SDP offer
 * POST /api/signaling/rooms/offer
 */
export const submitOffer = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      code: z.string(),
      offer: sdpSchema,
    }),
  )
  .handler(async ({ data }) => {
    const { code, offer } = data;

    const room = await signalingStore.getRoom(code);
    if (!room) {
      throw new Error("Room not found");
    }

    if (offer.type === "offer") {
      await signalingStore.setHostOffer(code, offer as RTCSessionDescriptionInit);
    }

    return {
      success: true,
      peerCount: room.peerCount,
    };
  });

/**
 * Get SDP offer
 * GET /api/signaling/rooms/offer?code=:code
 */
export const getOffer = createServerFn({ method: "GET" })
  .inputValidator(
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
 * Submit SDP answer
 * POST /api/signaling/rooms/answer
 */
export const submitAnswer = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      code: z.string(),
      answer: sdpSchema,
    }),
  )
  .handler(async ({ data }) => {
    const { code, answer } = data;

    const room = await signalingStore.getRoom(code);
    if (!room) {
      throw new Error("Room not found");
    }

    if (answer.type === "answer") {
      await signalingStore.setClientAnswer(code, answer as RTCSessionDescriptionInit);
    }

    return { success: true };
  });

/**
 * Get SDP answer
 * GET /api/signaling/rooms/answer?code=:code
 */
export const getAnswer = createServerFn({ method: "GET" })
  .inputValidator(
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
 * POST /api/signaling/rooms/candidate
 */
export const submitCandidate = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      code: z.string(),
      candidate: z.object({
        candidate: z.string(),
        sdpMid: z.string().optional().nullable(),
        sdpMLineIndex: z.number().int().min(0).nullable(),
        usernameFragment: z.string().optional().nullable(),
      }),
      from: z.enum(["host", "client"]),
    }),
  )
  .handler(async ({ data }) => {
    const { code, candidate, from } = data;

    const room = await signalingStore.getRoom(code);
    if (!room) {
      // Room expired or doesn't exist - return gracefully instead of throwing
      return { success: false, error: "Room not found" };
    }

    await signalingStore.addCandidate(code, candidate as RTCIceCandidateInit, from);

    return { success: true };
  });

/**
 * Get ICE candidates
 * GET /api/signaling/rooms/candidates?code=:code&from=:from
 */
export const getCandidates = createServerFn({ method: "GET" })
  .inputValidator(
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
 * Leave a room
 * POST /api/signaling/rooms/leave
 */
export const leaveRoom = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      code: z.string(),
      peerId: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const { code, peerId } = data;

    const room = await signalingStore.getRoom(code);
    if (!room) {
      return { success: true };
    }

    // If host leaves, delete room
    if (peerId === room.hostId) {
      await signalingStore.deleteRoom(code);
      return { success: true, roomDeleted: true };
    }

    const peerCount = await signalingStore.decrementPeerCount(code);

    if (peerCount <= 1) {
      await signalingStore.deleteRoom(code);
      return { success: true, roomDeleted: true };
    }

    return { success: true, peerCount };
  });

/**
 * Kick a peer
 * POST /api/signaling/rooms/kick
 */
export const kickPeer = createServerFn({ method: "POST" })
  .inputValidator(
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

    if (room.hostId !== hostId) {
      throw new Error("Only host can kick peers");
    }

    if (peerId === hostId) {
      throw new Error("Cannot kick self");
    }

    await signalingStore.decrementPeerCount(code);

    return { success: true, kickedPeerId: peerId };
  });

/**
 * Set document URL for a room
 * POST /api/signaling/rooms/document-url
 */
export const setDocumentUrl = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      code: z.string(),
      documentUrl: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const { code, documentUrl } = data;

    const room = await signalingStore.getRoom(code);
    if (!room) {
      throw new Error("Room not found");
    }

    const success = await signalingStore.setDocumentUrl(code, documentUrl);
    return { success, documentUrl };
  });

/**
 * Get signaling stats
 * GET /api/signaling/stats
 */
export const getSignalingStats = createServerFn({ method: "GET" }).handler(
  async () => {
    return await signalingStore.getStats();
  },
);
