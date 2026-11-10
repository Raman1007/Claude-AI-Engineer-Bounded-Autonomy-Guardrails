
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RateLimiter } from '../src/utils/rate-limiter.js';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();

    rateLimiter = new RateLimiter({
      maxRequestsPerMinute: 5,
      maxTokensPerMinute: 10000,
      maxConcurrent: 2
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should initialize successfully', () => {
    expect(rateLimiter).toBeDefined();
  });

  it('should allow requests within configured limits', async () => {
    await expect(rateLimiter.acquire(100)).resolves.not.toThrow();
    rateLimiter.release();
  });

  it('should allow multiple concurrent requests within the limit', async () => {
    await rateLimiter.acquire(100);
    await rateLimiter.acquire(100);

    rateLimiter.release();
    rateLimiter.release();
  });

  it('should wait when maximum concurrent requests are reached', async () => {
    await rateLimiter.acquire(100);
    await rateLimiter.acquire(100);

    let thirdRequestCompleted = false;

    const thirdRequest = rateLimiter.acquire(100).then(() => {
      thirdRequestCompleted = true;
    });

    await Promise.resolve();

    expect(thirdRequestCompleted).toBe(false);

    rateLimiter.release();

    await thirdRequest;

    expect(thirdRequestCompleted).toBe(true);

    rateLimiter.release();
    rateLimiter.release();
  });

  it('should release request slots correctly', async () => {
    await rateLimiter.acquire(100);
    rateLimiter.release();

    await expect(rateLimiter.acquire(100)).resolves.not.toThrow();

    rateLimiter.release();
  });

  it('should allow requests after the sliding window expires', async () => {
    const limiter = new RateLimiter({
      maxRequestsPerMinute: 1,
      maxTokensPerMinute: 10000,
      maxConcurrent: 2
    });

    await limiter.acquire(100);
    limiter.release();

    let secondRequestCompleted = false;

    const secondRequest = limiter.acquire(100).then(() => {
      secondRequestCompleted = true;
    });

    await Promise.resolve();

    expect(secondRequestCompleted).toBe(false);

    await vi.advanceTimersByTimeAsync(61000);

    await secondRequest;

    expect(secondRequestCompleted).toBe(true);

    limiter.release();
  });
});
