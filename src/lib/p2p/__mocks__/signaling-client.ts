/**
 * Manual mock for signaling-client module
 * Used for unit testing P2PNetwork without TanStack runtime
 */

import { vi } from "vitest";
import { encodeRoomCode } from "../room-code";

// Create mock functions that track calls
export const createRoom = vi.fn(async (params?: { data?: Record<string, unknown> }) => {
  const peerId = params?.data?.peerId as string || "test-host";
  const documentUrl = params?.data?.documentUrl as string | undefined;
  const shortCode = `TIER-${peerId.slice(0, 6)}`.toUpperCase();
  
  // Embed document URL in room code if provided (new logic)
  const code = documentUrl 
    ? encodeRoomCode(shortCode, documentUrl)
    : shortCode;
  
  return {
    code,
    hostId: peerId,
    peerCount: 1,
    documentUrl: documentUrl || null,
  };
});

export const joinRoom = vi.fn(async (params?: { data?: { code: string } }) => {
  const code = params?.data?.code as string || "TIER-TEST";
  // Extract document URL from room code if embedded (using double-dash separator)
  let documentUrl: string | null = null;
  const separatorIndex = code.indexOf('--');
  if (separatorIndex !== -1) {
    try {
      const encoded = code.substring(separatorIndex + 2);
      const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
      documentUrl = atob(base64);
      if (!documentUrl.startsWith('automerge:')) {
        documentUrl = null;
      }
    } catch {
      documentUrl = null;
    }
  }
  return {
    code,
    hostId: "test-host",
    peerCount: 1,
    documentUrl,
  };
});

export const submitOffer = vi.fn(async (params?: { data?: { code: string; offer: RTCSessionDescriptionInit } }) => ({
  success: true,
  code: params?.data?.code,
}));

export const getAnswer = vi.fn(async () => ({ answer: null }));

export const getOffer = vi.fn(async () => ({ offer: null }));

export const submitAnswer = vi.fn(async () => ({ success: true }));

export const submitCandidate = vi.fn(async () => ({ success: true }));

export const getCandidates = vi.fn(async () => ({ candidates: [] }));

export const leaveRoom = vi.fn(async () => ({ success: true }));

export const kickPeer = vi.fn(async () => ({ success: true }));

export const getRoomInfo = vi.fn(async () => ({
  code: "",
  peerCount: 0,
  hasOffer: false,
  hasAnswer: false,
}));

export const getSignalingStats = vi.fn(async () => ({
  roomCount: 0,
  rooms: [],
}));
