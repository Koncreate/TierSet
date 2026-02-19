import { createStorage } from "unstorage";

export interface SignalingRoom {
  code: string;
  hostId: string;
  peerCount: number;
  hostOffer: RTCSessionDescriptionInit | null;
  clientAnswer: RTCSessionDescriptionInit | null;
  hostCandidates: RTCIceCandidateInit[];
  clientCandidates: RTCIceCandidateInit[];
  createdAt: number;
  expiresAt: number;
}

/**
 * Signaling store interface for WebRTC room state
 */
export interface SignalingStore {
  createRoom(code: string, hostId: string, ttlMs: number): Promise<SignalingRoom>;
  getRoom(code: string): Promise<SignalingRoom | null>;
  deleteRoom(code: string): Promise<void>;
  setHostOffer(code: string, offer: RTCSessionDescriptionInit): Promise<void>;
  getHostOffer(code: string): Promise<RTCSessionDescriptionInit | null>;
  setClientAnswer(code: string, answer: RTCSessionDescriptionInit): Promise<void>;
  getClientAnswer(code: string): Promise<RTCSessionDescriptionInit | null>;
  addCandidate(
    code: string,
    candidate: RTCIceCandidateInit,
    from: "host" | "client",
  ): Promise<void>;
  getCandidates(code: string, from: "host" | "client"): Promise<RTCIceCandidateInit[]>;
  incrementPeerCount(code: string): Promise<number>;
  decrementPeerCount(code: string): Promise<number>;
  getPeerCount(code: string): Promise<number>;
  getStats(): Promise<{ rooms: number; totalPeers: number }>;
}

/**
 * Create signaling store with unstorage backend
 *
 * In production (Cloudflare Workers): Uses KV storage
 * In development: Uses in-memory storage
 */
export function createSignalingStore(kvBinding?: KVNamespace): SignalingStore {
  // Create storage with appropriate driver
  const storage = createStorage({
    driver: kvBinding ? createKVDriver(kvBinding) : undefined, // undefined = in-memory for development
  });

  return {
    async createRoom(code: string, hostId: string, ttlMs: number): Promise<SignalingRoom> {
      const room: SignalingRoom = {
        code,
        hostId,
        peerCount: 1,
        hostOffer: null,
        clientAnswer: null,
        hostCandidates: [],
        clientCandidates: [],
        createdAt: Date.now(),
        expiresAt: Date.now() + ttlMs,
      };

      await storage.set(`room:${code}`, room);

      // Set TTL for auto-expiration (KV only)
      if (kvBinding && ttlMs > 0) {
        await kvBinding.put(`ttl:${code}`, String(Date.now() + ttlMs), {
          expirationTtl: Math.ceil(ttlMs / 1000) + 60, // Add 60s buffer
        });
      }

      return room;
    },

    async getRoom(code: string): Promise<SignalingRoom | null> {
      const room = await storage.get<SignalingRoom>(`room:${code}`);

      // Check expiration
      if (room && room.expiresAt < Date.now()) {
        await this.deleteRoom(code);
        return null;
      }

      return room || null;
    },

    async deleteRoom(code: string): Promise<void> {
      await Promise.all([
        storage.remove(`room:${code}`),
        storage.remove(`room:${code}:offer`),
        storage.remove(`room:${code}:answer`),
        storage.remove(`room:${code}:hostCandidates`),
        storage.remove(`room:${code}:clientCandidates`),
        storage.remove(`ttl:${code}`),
      ]);
    },

    async setHostOffer(code: string, offer: RTCSessionDescriptionInit): Promise<void> {
      await storage.set(`room:${code}:offer`, offer);
    },

    async getHostOffer(code: string): Promise<RTCSessionDescriptionInit | null> {
      return await storage.get(`room:${code}:offer`);
    },

    async setClientAnswer(code: string, answer: RTCSessionDescriptionInit): Promise<void> {
      await storage.set(`room:${code}:answer`, answer);
    },

    async getClientAnswer(code: string): Promise<RTCSessionDescriptionInit | null> {
      return await storage.get(`room:${code}:answer`);
    },

    async addCandidate(
      code: string,
      candidate: RTCIceCandidateInit,
      from: "host" | "client",
    ): Promise<void> {
      const key = `room:${code}:${from}Candidates`;
      const candidates = (await storage.get<RTCIceCandidateInit[]>(key)) || [];
      candidates.push(candidate);
      await storage.set(key, candidates);
    },

    async getCandidates(code: string, from: "host" | "client"): Promise<RTCIceCandidateInit[]> {
      return (await storage.get<RTCIceCandidateInit[]>(`room:${code}:${from}Candidates`)) || [];
    },

    async incrementPeerCount(code: string): Promise<number> {
      const room = await this.getRoom(code);
      if (!room) return 0;
      const newCount = room.peerCount + 1;
      await storage.set(`room:${code}`, { ...room, peerCount: newCount });
      return newCount;
    },

    async decrementPeerCount(code: string): Promise<number> {
      const room = await this.getRoom(code);
      if (!room) return 0;
      const newCount = Math.max(0, room.peerCount - 1);
      await storage.set(`room:${code}`, { ...room, peerCount: newCount });
      return newCount;
    },

    async getPeerCount(code: string): Promise<number> {
      const room = await this.getRoom(code);
      return room?.peerCount || 0;
    },

    async getStats(): Promise<{ rooms: number; totalPeers: number }> {
      const keys = await storage.getKeys("room:");
      let totalPeers = 0;
      let roomCount = 0;

      for (const key of keys) {
        // Only count room keys, not sub-keys (offer, answer, candidates)
        if (!key.endsWith(":offer") && !key.endsWith(":answer") && !key.endsWith("Candidates")) {
          const room = await storage.get<SignalingRoom>(key);
          if (room) {
            roomCount++;
            totalPeers += room.peerCount;
          }
        }
      }

      return { rooms: roomCount, totalPeers };
    },
  };
}

/**
 * Create unstorage driver for Cloudflare KV binding
 */
function createKVDriver(kv: KVNamespace) {
  return {
    hasItem(key: string) {
      return kv.get(key).then((v) => v !== null);
    },
    getItem(key: string) {
      return kv.get(key);
    },
    setItem(key: string, value: unknown) {
      return kv.put(key, JSON.stringify(value));
    },
    removeItem(key: string) {
      return kv.delete(key);
    },
    getKeys(base: string) {
      return kv.list({ prefix: base }).then((r) => r.keys.map((k) => k.name));
    },
  };
}

// Default export for backward compatibility (in-memory)
export const signalingStore = createSignalingStore();
