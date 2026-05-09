import { withCircuitBreaker, CircuitOpenError } from '@/lib/circuit-breaker';

describe('CircuitBreaker', () => {
  beforeEach(() => {
    // Reset module to clear breaker state between tests
    jest.resetModules();
  });

  it('CLOSED state passes through successful calls', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await withCircuitBreaker('test-ok', fn, {
      failureThreshold: 3, volumeThreshold: 3, timeout: 100,
    });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('opens after failureThreshold is reached', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    const run = () => withCircuitBreaker('test-open', fn, {
      failureThreshold: 2, volumeThreshold: 2, timeout: 5000, successThreshold: 1,
    });

    // First failures don't open (volume not met)
    await expect(run()).rejects.toThrow('fail');
    await expect(run()).rejects.toThrow('fail');
    // Now should be OPEN
    await expect(run()).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it('allows call in HALF_OPEN after timeout', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    const run = () => withCircuitBreaker('test-halfopen', fn, {
      failureThreshold: 2, volumeThreshold: 2, timeout: 1, successThreshold: 1,
    });

    await expect(run()).rejects.toThrow('fail');
    await expect(run()).rejects.toThrow('fail');

    // Wait for timeout
    await new Promise(r => setTimeout(r, 10));
    const recoverFn = jest.fn().mockResolvedValue('recovered');
    const result = await withCircuitBreaker('test-halfopen', recoverFn, {
      failureThreshold: 2, volumeThreshold: 2, timeout: 1, successThreshold: 1,
    });
    expect(result).toBe('recovered');
  });
});
