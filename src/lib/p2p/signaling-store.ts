/**
 * In-memory signaling store for WebRTC SDP exchange
 * Stores room state, offers, and answers temporarily
 */

export interface SignalingRoom {
  code: string;
  hostId: string;
  hostOffer?: RTCSessionDescriptionInit;
  clientAnswer?: RTCSessionDescriptionInit;
  hostCandidates: RTCIceCandidateInit[];
  clientCandidates: RTCIceCandidateInit[];
  createdAt: number;
  expiresAt: number;
  peerCount: number;
}

/**
 * In-memory store for signaling data
 * Note: In production, replace with Cloudflare KV or database
 */
class SignalingStore {
  private rooms = new Map<string, SignalingRoom>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Cleanup expired rooms every minute
    this.startCleanup();
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 60000); // 1 minute
  }

  /**
   * Create a new room entry
   */
  createRoom(code: string, hostId: string, ttlMs: number = 3600000): SignalingRoom {
    const now = Date.now();
    const room: SignalingRoom = {
      code,
      hostId,
      hostOffer: undefined,
      clientAnswer: undefined,
      hostCandidates: [],
      clientCandidates: [],
      createdAt: now,
      expiresAt: now + ttlMs,
      peerCount: 1,
    };

    this.rooms.set(code, room);
    return room;
  }

  /**
   * Get room by code
   */
  getRoom(code: string): SignalingRoom | null {
    const room = this.rooms.get(code);
    if (!room) return null;

    // Check if expired
    if (Date.now() > room.expiresAt) {
      this.deleteRoom(code);
      return null;
    }

    return room;
  }

  /**
   * Update room with host offer
   */
  setHostOffer(code: string, offer: RTCSessionDescriptionInit): SignalingRoom | null {
    const room = this.getRoom(code);
    if (!room) return null;

    room.hostOffer = offer;
    this.rooms.set(code, room);
    return room;
  }

  /**
   * Get host offer (for client polling)
   */
  getHostOffer(code: string): RTCSessionDescriptionInit | null {
    const room = this.getRoom(code);
    return room?.hostOffer ?? null;
  }

  /**
   * Set client answer
   */
  setClientAnswer(code: string, answer: RTCSessionDescriptionInit): SignalingRoom | null {
    const room = this.getRoom(code);
    if (!room) return null;

    room.clientAnswer = answer;
    this.rooms.set(code, room);
    return room;
  }

  /**
   * Get client answer (for host polling)
   */
  getClientAnswer(code: string): RTCSessionDescriptionInit | null {
    const room = this.getRoom(code);
    return room?.clientAnswer ?? null;
  }

  /**
   * Add ICE candidate from host
   */
  addHostCandidate(code: string, candidate: RTCIceCandidateInit): void {
    const room = this.getRoom(code);
    if (!room) return;

    room.hostCandidates.push(candidate);
    this.rooms.set(code, room);
  }

  /**
   * Add ICE candidate from client
   */
  addClientCandidate(code: string, candidate: RTCIceCandidateInit): void {
    const room = this.getRoom(code);
    if (!room) return;

    room.clientCandidates.push(candidate);
    this.rooms.set(code, room);
  }

  /**
   * Get host candidates (for client)
   */
  getHostCandidates(code: string): RTCIceCandidateInit[] {
    const room = this.getRoom(code);
    return room?.hostCandidates ?? [];
  }

  /**
   * Get client candidates (for host)
   */
  getClientCandidates(code: string): RTCIceCandidateInit[] {
    const room = this.getRoom(code);
    return room?.clientCandidates ?? [];
  }

  /**
   * Increment peer count
   */
  incrementPeerCount(code: string): number {
    const room = this.getRoom(code);
    if (!room) return 0;

    room.peerCount++;
    this.rooms.set(code, room);
    return room.peerCount;
  }

  /**
   * Decrement peer count
   */
  decrementPeerCount(code: string): number {
    const room = this.getRoom(code);
    if (!room) return 0;

    room.peerCount = Math.max(0, room.peerCount - 1);
    this.rooms.set(code, room);
    return room.peerCount;
  }

  /**
   * Delete room
   */
  deleteRoom(code: string): boolean {
    return this.rooms.delete(code);
  }

  /**
   * Cleanup expired rooms
   */
  private cleanupExpired(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms.entries()) {
      if (now > room.expiresAt) {
        this.rooms.delete(code);
        console.log(`[SignalingStore] Cleaned up expired room: ${code}`);
      }
    }
  }

  /**
   * Get stats (for debugging)
   */
  getStats(): { roomCount: number; rooms: string[] } {
    const rooms = Array.from(this.rooms.keys());
    return {
      roomCount: rooms.length,
      rooms,
    };
  }

  /**
   * Destroy store and stop cleanup interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.rooms.clear();
  }
}

// Singleton instance for server-side
export const signalingStore = new SignalingStore();
