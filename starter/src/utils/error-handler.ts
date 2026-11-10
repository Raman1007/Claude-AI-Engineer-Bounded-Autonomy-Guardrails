/**
 * Custom error class for review operations
 */
export class ReviewError extends Error {
  constructor(
    message: string,
    public code: string,
    public metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ReviewError';
    Error.captureStackTrace(this, ReviewError);
  }
}

/**
 * Error codes for the review system
 */
export const ErrorCodes = {
  // Configuration errors
  MISSING_API_KEY: 'MISSING_API_KEY',
  MISSING_GITHUB_TOKEN: 'MISSING_GITHUB_TOKEN',
  INVALID_CONFIG: 'INVALID_CONFIG',

  // GitHub errors
  PR_NOT_FOUND: 'PR_NOT_FOUND',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  GITHUB_API_ERROR: 'GITHUB_API_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',

  // Agent errors
  AGENT_TIMEOUT: 'AGENT_TIMEOUT',
  AGENT_FAILED: 'AGENT_FAILED',
  STRUCTURED_OUTPUT_FAILED: 'STRUCTURED_OUTPUT_FAILED',

  // General errors
  RETRY_EXHAUSTED: 'RETRY_EXHAUSTED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

/**
 * Retry utility with exponential backoff
 *
 * This function implements the retry pattern with exponential backoff and jitter.
 *
 * Algorithm:
 * 1. Try to execute the function
 * 2. If it succeeds, return the result
 * 3. If it fails and retries remain:
 *    - Calculate backoff delay: delayMs * 2^(attempt - 1)
 *    - Add jitter (random 0-100ms) to prevent thundering herd
 *    - Wait for the calculated duration
 *    - Retry
 * 4. If all retries exhausted, throw ReviewError with RETRY_EXHAUSTED code
 *
 * @param fn - Async function to retry
 * @param maxRetries - Maximum number of retries (default: 3)
 * @param delayMs - Base delay in milliseconds (default: 1000)
 * @returns The result of the successful function execution
 * @throws ReviewError with RETRY_EXHAUSTED code if all retries fail
 */

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  if (!Number.isInteger(maxRetries) || maxRetries < 1) {
    throw new RangeError('maxRetries must be a positive integer');
  }

  if (!Number.isFinite(delayMs) || delayMs < 0) {
    throw new RangeError('delayMs must be non-negative');
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries) {
        break;
      }

      const backoff = delayMs * Math.pow(2, attempt - 1);
      const jitter = Math.random() * 100;

      await new Promise<void>(resolve => {
        setTimeout(resolve, backoff + jitter);
      });
    }
  }

  throw new ReviewError(
    `Operation failed after ${maxRetries} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
    ErrorCodes.RETRY_EXHAUSTED,
    {
      attempts: maxRetries,
      cause: lastError instanceof Error
        ? lastError.message
        : String(lastError)
    }
  );
}

export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  errorMessage: string = 'Operation timed out'
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('timeoutMs must be a positive number');
  }

  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      Promise.resolve().then(fn),

      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new ReviewError(
              errorMessage,
              ErrorCodes.AGENT_TIMEOUT,
              { timeoutMs }
            )
          );
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

/**
 * Check if an error is a ReviewError
 */
export function isReviewError(error: unknown): error is ReviewError {
  return error instanceof ReviewError;
}

/**
 * Format error for logging/display
 */
export function formatError(error: unknown): string {
  if (isReviewError(error)) {
    return `[${error.code}] ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
