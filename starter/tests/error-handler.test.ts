import { describe, it, expect, vi } from 'vitest';
import { withRetry, withTimeout } from '../src/utils/error-handler.js';

describe('Error Handler', () => {
  describe('withRetry', () => {
    it('should return result when operation succeeds', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const result = await withRetry(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry when operation fails', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce('success');

      const result = await withRetry(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should reject when all retries are exhausted', async () => {
      const operation = vi.fn()
        .mockRejectedValue(new Error('Permanent failure'));

      await expect(withRetry(operation)).rejects.toThrow();

      expect(operation.mock.calls.length).toBeGreaterThan(1);
    });
  });

  describe('withTimeout', () => {
    it('should return result if operation completes before timeout', async () => {
  const operation = async () => 'completed';

  await expect(withTimeout(operation, 1000))
    .resolves.toBe('completed');
});

    it('should reject if operation exceeds timeout', async () => {
  const operation = () =>
    new Promise(resolve => {
      setTimeout(() => resolve('completed'), 200);
    });

  await expect(withTimeout(operation, 20))
    .rejects.toThrow();
});
  });
});
