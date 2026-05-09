// __tests__/unit/queue.test.ts — HemaV048
// Tests for email queue: in-process fallback and strategy selection.

import { getQueueMode, getRetryQueueDepth, enqueueEmail } from '@/lib/queue';

// Mock the email module to avoid real SMTP calls
jest.mock('@/lib/email', () => ({
  sendOrderConfirmation:  jest.fn().mockResolvedValue(undefined),
  sendWelcomeEmail:       jest.fn().mockResolvedValue(undefined),
  sendVerificationEmail:  jest.fn().mockResolvedValue(undefined),
  sendPasswordReset:      jest.fn().mockResolvedValue(undefined),
  sendPaymentFailedEmail: jest.fn().mockResolvedValue(undefined),
  sendAdminPaymentAlert:  jest.fn().mockResolvedValue(undefined),
  sendRefundEmail:        jest.fn().mockResolvedValue(undefined),
}));

// Mock logger to silence output
jest.mock('@/lib/logger', () => ({
  logger: {
    info:  jest.fn(),
    warn:  jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Queue mode detection', () => {
  const original = process.env.QSTASH_TOKEN;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.QSTASH_TOKEN;
    } else {
      process.env.QSTASH_TOKEN = original;
    }
  });

  it('returns in-process when QSTASH_TOKEN is not set', () => {
    delete process.env.QSTASH_TOKEN;
    expect(getQueueMode()).toBe('in-process');
  });

  it('returns qstash when QSTASH_TOKEN is set', () => {
    process.env.QSTASH_TOKEN = 'test-token';
    expect(getQueueMode()).toBe('qstash');
  });
});

describe('getRetryQueueDepth', () => {
  it('returns a number (queue depth)', () => {
    expect(typeof getRetryQueueDepth()).toBe('number');
    expect(getRetryQueueDepth()).toBeGreaterThanOrEqual(0);
  });
});

describe('enqueueEmail (in-process mode)', () => {
  beforeEach(() => {
    delete process.env.QSTASH_TOKEN;
    jest.clearAllMocks();
  });

  it('returns null when using in-process queue', async () => {
    const result = await enqueueEmail({ type: 'welcome', name: 'Test', email: 'test@example.com' });
    expect(result).toBeNull();
  });

  it('calls sendWelcomeEmail for welcome job type', async () => {
    const { sendWelcomeEmail } = await import('@/lib/email');
    await enqueueEmail({ type: 'welcome', name: 'Hema', email: 'hema@test.com' });
    expect(sendWelcomeEmail).toHaveBeenCalledWith('Hema', 'hema@test.com');
  });

  it('calls sendPasswordReset for passwordReset job type', async () => {
    const { sendPasswordReset } = await import('@/lib/email');
    await enqueueEmail({ type: 'passwordReset', email: 'user@test.com', token: 'tok123' });
    expect(sendPasswordReset).toHaveBeenCalledWith('user@test.com', 'tok123');
  });

  it('calls sendVerificationEmail for verification job type', async () => {
    const { sendVerificationEmail } = await import('@/lib/email');
    await enqueueEmail({ type: 'verification', email: 'v@test.com', token: 'vtok', name: 'Ali' });
    expect(sendVerificationEmail).toHaveBeenCalledWith('v@test.com', 'vtok', 'Ali');
  });
});

describe('enqueueEmail (QStash mode — graceful fallback)', () => {
  const mockFetch = jest.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.QSTASH_TOKEN = 'test-qstash-token';
    process.env.NEXT_PUBLIC_APP_URL = 'https://test.example.com';
    global.fetch = mockFetch;
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.QSTASH_TOKEN;
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it('falls back to in-process when QStash fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    const { sendWelcomeEmail } = await import('@/lib/email');
    const result = await enqueueEmail({ type: 'welcome', name: 'Fallback', email: 'fb@test.com' });
    // Falls back to in-process — null return, email was sent directly
    expect(result).toBeNull();
    expect(sendWelcomeEmail).toHaveBeenCalled();
  });

  it('falls back to in-process when QStash returns non-ok status', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' });
    const { sendWelcomeEmail } = await import('@/lib/email');
    await enqueueEmail({ type: 'welcome', name: 'Auth fail', email: 'af@test.com' });
    expect(sendWelcomeEmail).toHaveBeenCalled();
  });
});
