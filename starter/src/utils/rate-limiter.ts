
/**
 * Rate Limiter for API requests and token usage.
 *
 * Implements a sliding-window rate limiter:
 * - Tracks requests and tokens used in the last 60 seconds.
 * - Limits concurrent requests.
 * - Uses a FIFO wait queue for concurrent requests.
 */

export interface RateLimiterConfig {
  maxRequestsPerMinute: number;
  maxTokensPerMinute: number;
  maxConcurrent: number;
}

export const DEFAULT_RATE_LIMITS: RateLimiterConfig = {
  maxRequestsPerMinute: 50,
  maxTokensPerMinute: 100000,
  maxConcurrent: 5
};

interface RequestRecord {
  timestamp: number;
  tokens: number;
}

const WINDOW_MS = 60_000;
const MAX_WAIT_MS = 5_000;
const MIN_WAIT_MS = 100;

export class RateLimiter {
  private config: RateLimiterConfig;
  private requestHistory: RequestRecord[] = [];
  private activeRequests = 0;
  private waitQueue: Array<() => void> = [];

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_RATE_LIMITS, ...config };

    if (
      this.config.maxRequestsPerMinute <= 0 ||
      this.config.maxTokensPerMinute <= 0 ||
      this.config.maxConcurrent <= 0
    ) {
      throw new Error('Rate limiter configuration values must be positive.');
    }
  }

  /**
   * Acquire permission to execute a request.
   */
  async acquire(estimatedTokens: number = 1000): Promise<void> {
    if (!Number.isFinite(estimatedTokens) || estimatedTokens < 0) {
      throw new Error('estimatedTokens must be a non-negative number.');
    }

    if (estimatedTokens > this.config.maxTokensPerMinute) {
      throw new Error(
        'Estimated tokens exceed the configured tokens-per-minute limit.'
      );
    }

    // Wait for a concurrent request slot.
    while (this.activeRequests >= this.config.maxConcurrent) {
      await this.waitForSlot();
    }

    // Wait until request and token limits permit execution.
    await this.waitForRateLimit(estimatedTokens);

    // Reserve a concurrent slot.
    this.activeRequests++;

    // Record this request in the sliding window.
    this.requestHistory.push({
      timestamp: Date.now(),
      tokens: estimatedTokens
    });
  }

  /**
   * Release a request slot after completion.
   */
  release(actualTokens?: number): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);

    // Update the most recent request estimate.
    if (actualTokens !== undefined) {
      const lastRequest =
        this.requestHistory[this.requestHistory.length - 1];

      if (lastRequest) {
        lastRequest.tokens = Math.max(0, actualTokens);
      }
    }

    // Wake the next queued request.
    const next = this.waitQueue.shift();

    if (next) {
      next();
    }
  }

  /**
   * Get current rate limit status.
   */
  getStatus(): {
    activeRequests: number;
    requestsInWindow: number;
    tokensInWindow: number;
    availableRequests: number;
    availableTokens: number;
  } {
    this.pruneOldRecords();

    const requestsInWindow = this.requestHistory.length;

    const tokensInWindow = this.requestHistory.reduce(
      (sum, record) => sum + record.tokens,
      0
    );

    return {
      activeRequests: this.activeRequests,
      requestsInWindow,
      tokensInWindow,
      availableRequests: Math.max(
        0,
        this.config.maxRequestsPerMinute - requestsInWindow
      ),
      availableTokens: Math.max(
        0,
        this.config.maxTokensPerMinute - tokensInWindow
      )
    };
  }

  /**
   * Check whether a request can proceed immediately.
   */
  canProceed(estimatedTokens: number = 1000): boolean {
    this.pruneOldRecords();

    const requestsInWindow = this.requestHistory.length;

    const tokensInWindow = this.requestHistory.reduce(
      (sum, record) => sum + record.tokens,
      0
    );

    return (
      this.activeRequests < this.config.maxConcurrent &&
      requestsInWindow < this.config.maxRequestsPerMinute &&
      tokensInWindow + estimatedTokens <=
        this.config.maxTokensPerMinute
    );
  }

  /**
   * Wait for a concurrent request slot.
   */
  private async waitForSlot(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  /**
   * Wait until rate limits allow the request.
   */
  private async waitForRateLimit(
    estimatedTokens: number
  ): Promise<void> {
    while (!this.canProceed(estimatedTokens)) {
      this.pruneOldRecords();

      if (this.requestHistory.length === 0) {
        break;
      }

      const oldestRecord = this.requestHistory[0];

      if (!oldestRecord) {
        break;
      }

      const expirationTime =
        oldestRecord.timestamp + WINDOW_MS;

      const remainingTime =
        expirationTime - Date.now() + MIN_WAIT_MS;

      const waitTime = Math.min(
        MAX_WAIT_MS,
        Math.max(MIN_WAIT_MS, remainingTime)
      );

      await new Promise<void>((resolve) => {
        setTimeout(resolve, waitTime);
      });
    }
  }

  /**
   * Remove records older than the 60-second window.
   */
  private pruneOldRecords(): void {
    const cutoff = Date.now() - WINDOW_MS;

    this.requestHistory = this.requestHistory.filter(
      (record) => record.timestamp > cutoff
    );
  }
}

/**
 * Wrap an asynchronous function with rate limiting.
 */
export async function withRateLimit<T>(
  rateLimiter: RateLimiter,
  fn: () => Promise<T>,
  estimatedTokens: number = 1000
): Promise<T> {
  await rateLimiter.acquire(estimatedTokens);

  try {
    return await fn();
  } finally {
    rateLimiter.release();
  }
}

/**
 * Global rate limiter instance.
 */
export const globalRateLimiter = new RateLimiter();
