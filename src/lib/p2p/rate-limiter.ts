import { asyncRateLimit } from "@tanstack/pacer";

/**
 * Rate limiter for P2P messages
 * Prevents DoS and spam from peers
 */
export class P2PRateLimiter {
  private peerLimiters = new Map<string, ReturnType<typeof asyncRateLimit>>();
  private joinLimiters = new Map<string, ReturnType<typeof asyncRateLimit>>();

  /**
   * Get or create rate limiter for a peer
   * Limit: 20 messages per second per peer
   */
  getPeerLimiter(peerId: string): ReturnType<typeof asyncRateLimit> {
    if (!this.peerLimiters.has(peerId)) {
      const limiter = asyncRateLimit(
        async (fn: () => Promise<void>) => {
          await fn();
        },
        { limit: 20, interval: 1000 },
      );
      this.peerLimiters.set(peerId, limiter);
    }
    return this.peerLimiters.get(peerId)!;
  }

  /**
   * Get or create rate limiter for room join attempts
   * Limit: 5 join attempts per minute per room/IP
   */
  getJoinLimiter(roomCode: string): ReturnType<typeof asyncRateLimit> {
    if (!this.joinLimiters.has(roomCode)) {
      const limiter = asyncRateLimit(
        async (fn: () => Promise<void>) => {
          await fn();
        },
        { limit: 5, interval: 60000 },
      );
      this.joinLimiters.set(roomCode, limiter);
    }
    return this.joinLimiters.get(roomCode)!;
  }

  /**
   * Execute function with rate limiting
   */
  async executeWithRateLimit<T>(peerId: string, fn: () => Promise<T>): Promise<T | null> {
    const limiter = this.getPeerLimiter(peerId);

    try {
      return await limiter(async () => {
        return await fn();
      });
    } catch {
      console.warn(`Rate limit exceeded for peer ${peerId}`);
      return null;
    }
  }

  /**
   * Execute join attempt with rate limiting
   */
  async executeJoinWithRateLimit<T>(roomCode: string, fn: () => Promise<T>): Promise<T | null> {
    const limiter = this.getJoinLimiter(roomCode);

    try {
      return await limiter(async () => {
        return await fn();
      });
    } catch {
      console.warn(`Rate limit exceeded for room join: ${roomCode}`);
      return null;
    }
  }

  /**
   * Clean up limiter for a peer
   */
  cleanup(peerId: string): void {
    this.peerLimiters.delete(peerId);
  }

  /**
   * Clean up all limiters
   */
  cleanupAll(): void {
    this.peerLimiters.clear();
    this.joinLimiters.clear();
  }
}

export const p2pRateLimiter = new P2PRateLimiter();
