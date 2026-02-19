/**
 * P2P Signaling Client
 * 
 * Wrapper module for TanStack Start signaling routes.
 * This module exists to enable easier mocking in unit tests.
 * 
 * In production, these functions call the TanStack Start server functions.
 * In tests, stub implementations are used.
 */

// Try to import from mocks first (for tests), fall back to real implementation
let createRoom: any, joinRoom: any, submitOffer: any, getAnswer: any, getOffer: any;
let submitAnswer: any, submitCandidate: any, getCandidates: any, leaveRoom: any;
let kickPeer: any, getRoomInfo: any, getSignalingStats: any;

try {
  // Try to import mocks (will work in test environment)
  const mocks = await import("./__mocks__/signaling-client");
  createRoom = mocks.createRoom;
  joinRoom = mocks.joinRoom;
  submitOffer = mocks.submitOffer;
  getAnswer = mocks.getAnswer;
  getOffer = mocks.getOffer;
  submitAnswer = mocks.submitAnswer;
  submitCandidate = mocks.submitCandidate;
  getCandidates = mocks.getCandidates;
  leaveRoom = mocks.leaveRoom;
  kickPeer = mocks.kickPeer;
  getRoomInfo = mocks.getRoomInfo;
  getSignalingStats = mocks.getSignalingStats;
} catch {
  // Fall back to real implementation (production)
  const real = await import("../../routes/api/-signaling");
  createRoom = real.createRoom;
  joinRoom = real.joinRoom;
  submitOffer = real.submitOffer;
  getAnswer = real.getAnswer;
  getOffer = real.getOffer;
  submitAnswer = real.submitAnswer;
  submitCandidate = real.submitCandidate;
  getCandidates = real.getCandidates;
  leaveRoom = real.leaveRoom;
  kickPeer = real.kickPeer;
  getRoomInfo = real.getRoomInfo;
  getSignalingStats = real.getSignalingStats;
}

export {
  createRoom,
  joinRoom,
  submitOffer,
  getAnswer,
  getOffer,
  submitAnswer,
  submitCandidate,
  getCandidates,
  leaveRoom,
  kickPeer,
  getRoomInfo,
  getSignalingStats,
};
