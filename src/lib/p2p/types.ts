import { z } from "zod";
import { isCuid } from "@paralleldrive/cuid2";

const cuidRefinement = (value: string) => isCuid(value);

/**
 * P2P Message Types
 */
export const SyncMessageSchema = z.object({
  type: z.literal("sync"),
  boardId: z.string().refine(cuidRefinement, "Invalid board ID"),
  delta: z.instanceof(Uint8Array, "Delta must be binary"),
  timestamp: z.number(),
  senderId: z.string().refine(cuidRefinement, "Invalid sender ID"),
  sequence: z.number().int().positive("Sequence must be positive"),
});

export const ChatMessageSchema = z.object({
  type: z.literal("chat"),
  boardId: z.string().refine(cuidRefinement, "Invalid board ID"),
  content: z.string().min(1, "Message cannot be empty").max(500, "Message too long"),
  timestamp: z.number(),
  senderId: z.string().refine(cuidRefinement, "Invalid sender ID"),
});

export const PeerJoinMessageSchema = z.object({
  type: z.literal("peer:join"),
  peerId: z.string().refine(cuidRefinement, "Invalid peer ID"),
  peerName: z.string().min(1).max(50),
  timestamp: z.number(),
});

export const PeerLeaveMessageSchema = z.object({
  type: z.literal("peer:leave"),
  peerId: z.string().refine(cuidRefinement, "Invalid peer ID"),
  timestamp: z.number(),
});

export const HandshakeOfferSchema = z.object({
  type: z.literal("handshake:offer"),
  offer: z.any(), // RTCSessionDescriptionInit
  boardId: z.string().refine(cuidRefinement, "Invalid board ID"),
  senderId: z.string().refine(cuidRefinement, "Invalid sender ID"),
});

export const HandshakeAnswerSchema = z.object({
  type: z.literal("handshake:answer"),
  answer: z.any(), // RTCSessionDescriptionInit
  boardId: z.string().refine(cuidRefinement, "Invalid board ID"),
  senderId: z.string().refine(cuidRefinement, "Invalid sender ID"),
});

export const IceCandidateSchema = z.object({
  type: z.literal("ice:candidate"),
  candidate: z.any(), // RTCIceCandidateInit
  senderId: z.string().refine(cuidRefinement, "Invalid sender ID"),
});

export const ImageChunkSchema = z.object({
  type: z.literal("image:chunk"),
  imageId: z.string(),
  chunkIndex: z.number().int().nonnegative(),
  totalChunks: z.number().int().positive(),
  data: z.instanceof(Uint8Array),
  senderId: z.string().refine(cuidRefinement, "Invalid sender ID"),
});

export const ImageRequestSchema = z.object({
  type: z.literal("image:request"),
  imageId: z.string(),
  senderId: z.string().refine(cuidRefinement, "Invalid sender ID"),
});

export const ImageCompleteSchema = z.object({
  type: z.literal("image:complete"),
  imageId: z.string(),
  senderId: z.string().refine(cuidRefinement, "Invalid sender ID"),
});

export const P2PMessageSchema = z.discriminatedUnion("type", [
  SyncMessageSchema,
  ChatMessageSchema,
  PeerJoinMessageSchema,
  PeerLeaveMessageSchema,
  HandshakeOfferSchema,
  HandshakeAnswerSchema,
  IceCandidateSchema,
  ImageChunkSchema,
  ImageRequestSchema,
  ImageCompleteSchema,
]);

export type P2PMessage = z.infer<typeof P2PMessageSchema>;
export type SyncMessage = z.infer<typeof SyncMessageSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type PeerJoinMessage = z.infer<typeof PeerJoinMessageSchema>;
export type PeerLeaveMessage = z.infer<typeof PeerLeaveMessageSchema>;
export type HandshakeOfferMessage = z.infer<typeof HandshakeOfferSchema>;
export type HandshakeAnswerMessage = z.infer<typeof HandshakeAnswerSchema>;
export type IceCandidateMessage = z.infer<typeof IceCandidateSchema>;
export type ImageChunkMessage = z.infer<typeof ImageChunkSchema>;
export type ImageRequestMessage = z.infer<typeof ImageRequestSchema>;
export type ImageCompleteMessage = z.infer<typeof ImageCompleteSchema>;

/**
 * Connection Quality
 */
export type ConnectionQuality = "excellent" | "good" | "fair" | "poor";

/**
 * Peer Info
 */
export interface PeerInfo {
  id: string;
  name: string;
  role: "host" | "client";
  connectedAt: number;
  capabilities: PeerCapabilities;
  connectionQuality?: ConnectionQuality;
  iceConnectionType?: "direct" | "stun" | "turn";
}

export interface PeerCapabilities {
  canHost: boolean;
  canRelay: boolean;
  supportsVideo: boolean;
}

/**
 * Validate P2P message
 */
export function validateP2PMessage(
  data: unknown,
): { success: true; data: P2PMessage } | { success: false; error: z.ZodError } {
  return P2PMessageSchema.safeParse(data);
}

/**
 * Connection Status
 */
export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "failed";

/**
 * Sync Stats
 */
export interface SyncStats {
  peers: number;
  bytesSent: number;
  bytesReceived: number;
  lastSyncAt: number;
}

/**
 * Room State
 */
export interface RoomState {
  code: string;
  isHost: boolean;
  peers: PeerInfo[];
  status: ConnectionStatus;
}
