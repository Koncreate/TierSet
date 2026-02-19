import { rateLimit, asyncRateLimit } from "@tanstack/pacer";

/**
 * Rate limiter for chat voting
 * Prevents spam from chat integration
 */
export class ChatVoteRateLimiter {
  private userLimiters = new Map<string, ReturnType<typeof rateLimit>>();

  /**
   * Get or create rate limiter for a user
   * Limit: 1 vote per 3 seconds per user
   */
  private getUserLimiter(userId: string): ReturnType<typeof rateLimit> {
    if (!this.userLimiters.has(userId)) {
      const limiter = rateLimit((fn: () => void) => fn(), { limit: 1, interval: 3000 });
      this.userLimiters.set(userId, limiter);
    }
    return this.userLimiters.get(userId)!;
  }

  /**
   * Execute vote with rate limiting
   */
  async executeVote<T>(userId: string, fn: () => Promise<T>): Promise<T | null> {
    const limiter = this.getUserLimiter(userId);

    try {
      return await limiter(async () => {
        return await fn();
      });
    } catch {
      console.warn(`Vote rate limit exceeded for user ${userId}`);
      return null;
    }
  }

  /**
   * Clean up limiter for a user
   */
  cleanup(userId: string): void {
    this.userLimiters.delete(userId);
  }

  /**
   * Clean up all limiters
   */
  cleanupAll(): void {
    this.userLimiters.clear();
  }
}

export const chatVoteRateLimiter = new ChatVoteRateLimiter();
