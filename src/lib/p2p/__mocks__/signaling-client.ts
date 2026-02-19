/**
 * Manual mock for signaling-client module
 * Used for unit testing P2PNetwork without TanStack runtime
 */

import { vi } from "vitest";

// Create mock functions that track calls
export const createRoom = vi.fn(async (params?: { data?: Record<string, unknown> }) => {
  const peerId = params?.data?.peerId as string || "test-host";
  return {
    code: `TIER-${peerId.slice(0, 6)}`.toUpperCase(),
    hostId: peerId,
    peerCount: 1,
  };
});

export const joinRoom = vi.fn(async () => ({ success: true }));

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
