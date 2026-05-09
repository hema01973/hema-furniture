import { logger, runWithCorrelationId, getCorrelationId } from '@/lib/logger';

describe('Logger', () => {
  const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  afterAll(() => { spy.mockRestore(); errorSpy.mockRestore(); });

  it('logs info messages', () => {
    logger.info('test message', { key: 'value' });
    expect(spy).toHaveBeenCalled();
  });

  it('logs errors to console.error', () => {
    logger.error('error message');
    expect(errorSpy).toHaveBeenCalled();
  });

  it('child logger includes default context', () => {
    const child = logger.child({ service: 'test-service' });
    child.info('child message');
    const call = spy.mock.calls.at(-1)?.[0] ?? '';
    expect(call).toContain('child message');
  });

  it('correlationId propagates through AsyncLocalStorage', async () => {
    const id = 'test-correlation-123';
    const result = await runWithCorrelationId(id, async () => {
      // Simulate async work
      await new Promise(r => setTimeout(r, 0));
      return getCorrelationId();
    });
    expect(result).toBe(id);
  });

  it('correlationId is undefined outside context', () => {
    expect(getCorrelationId()).toBeUndefined();
  });
});
