/**
 * Manual mock for TanStack Start signaling routes
 * Used for unit testing P2PNetwork without TanStack runtime
 */

import { vi } from "vitest";

export const createRoom = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
  code: `TIER-${data.peerId?.toString().slice(0, 6) || "TEST"}`.toUpperCase(),
  hostId: data.peerId as string,
  peerCount: 1,
}));

export const joinRoom = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
  success: true,
  code: data.code as string,
}));

export const submitOffer = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
  success: true,
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

export const deleteRoom = vi.fn(async () => ({ success: true }));
