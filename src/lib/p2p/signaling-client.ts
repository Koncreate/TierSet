/**
 * P2P Signaling Client
 *
 * Client-side API client for P2P signaling operations.
 * Calls TanStack Start server functions directly.
 */

import {
  createRoom as createRoomFn,
  getRoomInfo as getRoomInfoFn,
  joinRoom as joinRoomFn,
  submitOffer as submitOfferFn,
  getOffer as getOfferFn,
  submitAnswer as submitAnswerFn,
  getAnswer as getAnswerFn,
  submitCandidate as submitCandidateFn,
  getCandidates as getCandidatesFn,
  leaveRoom as leaveRoomFn,
  kickPeer as kickPeerFn,
  getSignalingStats as getSignalingStatsFn,
} from "../../routes/api/-signaling";

/**
 * Create a new room (host side)
 */
export async function createRoom(data: {
  peerId: string;
  peerName?: string;
  password?: string;
  maxPeers?: number;
  ttlMs?: number;
}) {
  return createRoomFn({ data });
}

/**
 * Get room info
 */
export async function getRoomInfo(code: string) {
  return getRoomInfoFn({ data: { code } });
}

/**
 * Join a room
 */
export async function joinRoom(data: { code: string; peerId: string; password?: string }) {
  return joinRoomFn({ data });
}

/**
 * Submit SDP offer
 */
export async function submitOffer(data: { code: string; offer: RTCSessionDescriptionInit }) {
  return submitOfferFn({ data });
}

/**
 * Get SDP offer
 */
export async function getOffer(code: string) {
  return getOfferFn({ data: { code } });
}

/**
 * Submit SDP answer
 */
export async function submitAnswer(data: { code: string; answer: RTCSessionDescriptionInit }) {
  return submitAnswerFn({ data });
}

/**
 * Get SDP answer
 */
export async function getAnswer(code: string) {
  return getAnswerFn({ data: { code } });
}

/**
 * Submit ICE candidate
 */
export async function submitCandidate(data: {
  code: string;
  candidate: RTCIceCandidateInit;
  from: "host" | "client";
}) {
  return submitCandidateFn({ data });
}

/**
 * Get ICE candidates
 */
export async function getCandidates(data: { code: string; from: "host" | "client" }) {
  return getCandidatesFn({ data });
}

/**
 * Leave a room
 */
export async function leaveRoom(data: { code: string; peerId: string }) {
  return leaveRoomFn({ data });
}

/**
 * Kick a peer
 */
export async function kickPeer(data: { code: string; peerId: string; hostId: string }) {
  return kickPeerFn({ data });
}

/**
 * Get signaling stats
 */
export async function getSignalingStats() {
  return getSignalingStatsFn();
}
