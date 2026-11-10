
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

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

export class RateLimiter {
  private config: RateLimiterConfig;
  private requestHistory: RequestRecord[] = [];
  private activeRequests = 0;
  private waitQueue: Array<() => void> = [];

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_RATE_LIMITS, ...config };

    for (const [key, value] of Object.entries(this.config)) {
      if (!Number.isFinite(value) || value <= 0) {
        throw new RangeError(`${key} must be a positive number`);
      }
    }
  }

  async acquire(estimatedTokens: number = 1000): Promise<void> {
    if (!Number.isFinite(estimatedTokens) || estimatedTokens < 0) {
      throw new RangeError('estimatedTokens must be non-negative');
    }

    if (estimatedTokens > this.config.maxTokensPerMinute) {
      throw new RangeError(
        'Estimated tokens exceed the entire per-minute token limit'
      );
    }

    // Check rate limits before reserving a concurrent slot.
    await this.waitForRateLimit(estimatedTokens);

    // Reserve the slot atomically.
    await this.waitForSlot();

    try {
      // Recheck because other requests may have entered the window.
      await this.waitForRateLimit(estimatedTokens);

      this.pruneOldRecords();

      this.requestHistory.push({
        timestamp: Date.now(),
        tokens: estimatedTokens
      });
    } catch (error) {
      this.release();
      throw error;
    }
  }

  release(actualTokens?: number): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);

    if (
      actualTokens !== undefined &&
      Number.isFinite(actualTokens) &&
      actualTokens >= 0 &&
      this.requestHistory.length > 0
    ) {
      // The public API does not identify individual request records.
      // This updates the latest record as a best-effort estimate.
      const last = this.requestHistory[this.requestHistory.length - 1];
      last.tokens = actualTokens;
    }

    const next = this.waitQueue.shift();
    if (next) next();
  }

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

  private async waitForSlot(): Promise<void> {
    while (this.activeRequests >= this.config.maxConcurrent) {
      await new Promise<void>(resolve => {
        this.waitQueue.push(resolve);
      });
    }

    // Reserve before returning to prevent oversubscription.
    this.activeRequests++;
  }

  private async waitForRateLimit(
    estimatedTokens: number
  ): Promise<void> {
    while (true) {
      this.pruneOldRecords();

      const requests = this.requestHistory.length;
      const tokens = this.requestHistory.reduce(
        (sum, record) => sum + record.tokens,
        0
      );

      const requestsAvailable =
        requests < this.config.maxRequestsPerMinute;

      const tokensAvailable =
        tokens + estimatedTokens <= this.config.maxTokensPerMinute;

      if (requestsAvailable && tokensAvailable) {
        return;
      }

      if (this.requestHistory.length === 0) {
        throw new Error('Unable to satisfy rate limit configuration');
      }

      const oldestTimestamp = this.requestHistory[0].timestamp;

      const expirationTime = oldestTimestamp + WINDOW_MS;

      const waitTime = Math.min(
        5000,
        Math.max(100, expirationTime - Date.now() + 100)
      );

      await sleep(waitTime);
    }
  }

  private pruneOldRecords(): void {
    const cutoff = Date.now() - WINDOW_MS;

    this.requestHistory = this.requestHistory.filter(
      record => record.timestamp > cutoff
    );
  }
}

export function withRateLimit<T>(
  rateLimiter: RateLimiter,
  fn: () => Promise<T>,
  estimatedTokens: number = 1000
): Promise<T> {
  return (async () => {
    let acquired = false;

    try {
      await rateLimiter.acquire(estimatedTokens);
      acquired = true;

      return await fn();
    } finally {
      if (acquired) {
        rateLimiter.release();
      }
    }
  })();
}

export const globalRateLimiter = new RateLimiter();
