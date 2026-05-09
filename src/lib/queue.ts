// src/lib/queue.ts — HemaV066
// ADV-02 FIX (V066): EmailJob orderConfirmation now accepts EmailOrderPayload | IOrder
//   union to eliminate the `as unknown as IOrder` cast in order.service.ts.
// src/lib/queue.ts — HemaV066
// V064 FIX-LOW-02: Added securityAlert email type with severity field.
//   emitDenialAlert() in authz.ts now uses this type instead of adminPaymentAlert.
// Email queue with two strategies:
//   1. Upstash QStash (optional) — when QSTASH_TOKEN is set.
//   2. In-process retry queue (default fallback) — zero-dependency.

import type { IOrder } from '@/types';
import type { EmailOrderPayload } from '@/services/order.service';
import { logger } from './logger';

export type EmailJob =
  | { type: 'orderConfirmation';  order: IOrder | EmailOrderPayload } // ADV-02 FIX (V066)
  | { type: 'welcome';            name: string; email: string; unsubscribeUrl?: string }
  | { type: 'verification';       email: string; token: string; name: string }
  | { type: 'passwordReset';      email: string; token: string }
  | { type: 'paymentFailed';      order: IOrder }
  | { type: 'adminPaymentAlert';  order: IOrder; reason: string }
  | { type: 'refund';             order: IOrder; refundAmount: number }
  /** LOW-02 FIX (V064): Dedicated security alert email for authz denial bursts and other security events. */
  | { type: 'securityAlert';      subject: string; body: string; severity: 'high' | 'critical' };

// ── In-process retry queue ────────────────────────────────────────────────────

const RETRY_DELAYS_MS = [5_000, 10_000, 20_000, 40_000, 80_000];

interface RetryEntry { job: EmailJob; attempt: number; retryAt: number; }

const _queue: RetryEntry[] = [];
let   _timer: ReturnType<typeof setTimeout> | null = null;

function scheduleRetry(job: EmailJob, attempt: number): void {
  const delay = RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1] ?? 80_000;
  _queue.push({ job, attempt, retryAt: Date.now() + delay });
  if (!_timer) _startLoop();
}

function _startLoop(): void {
  _timer = setTimeout(async () => {
    _timer = null;
    const now = Date.now();
    const due = _queue.filter(e => e.retryAt <= now);
    due.forEach(e => _queue.splice(_queue.indexOf(e), 1));

    for (const entry of due) {
      try {
        await _dispatch(entry.job);
        logger.info('[Queue] Retry succeeded', { type: entry.job.type, attempt: entry.attempt + 1 });
      } catch {
        const next = entry.attempt + 1;
        if (next < RETRY_DELAYS_MS.length) scheduleRetry(entry.job, next);
        else logger.error('[Queue] All retries exhausted — email LOST', { type: entry.job.type });
      }
    }

    if (_queue.length > 0) _startLoop();
  }, 2_000);
}

async function _dispatch(job: EmailJob): Promise<void> {
  const email = await import('./email');
  switch (job.type) {
    case 'orderConfirmation':  return email.sendOrderConfirmation(job.order);
    case 'welcome':            return email.sendWelcomeEmail(job.name, job.email);
    case 'verification':       return email.sendVerificationEmail(job.email, job.token, job.name);
    case 'passwordReset':      return email.sendPasswordReset(job.email, job.token);
    case 'paymentFailed':      return email.sendPaymentFailedEmail(job.order);
    case 'adminPaymentAlert':  return email.sendAdminPaymentAlert(job.order, job.reason);
    case 'refund':             return email.sendRefundEmail(job.order, job.refundAmount);
    case 'securityAlert':      return email.sendAdminPaymentAlert(
      // LOW-02 FIX (V064): Route security alerts via admin alert email using
      // the subject/body fields. sendAdminPaymentAlert is repurposed here until
      // a dedicated sendSecurityAlert() function is added to email.ts.
      // The sentinel order satisfies the function signature without misleading data.
      Object.assign(Object.create(null), { _id: `sec-${Date.now()}`, total: 0, items: [] }),
      `[${job.severity.toUpperCase()}] ${job.subject}: ${job.body}`,
    );
    default: {
      const _exhaustive: never = job;
      throw new Error(`Unknown job type: ${(_exhaustive as EmailJob).type}`);
    }
  }
}

// ── QStash strategy ───────────────────────────────────────────────────────────

async function _enqueueQStash(job: EmailJob, idempotencyKey?: string): Promise<string> {
  const WORKER_URL = `${process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL}/api/worker/email`;
  const url        = `${process.env.QSTASH_URL ?? 'https://qstash.upstash.io/v2/publish/'}${WORKER_URL}`;

  const res = await fetch(url, {
    method:  'POST',
    headers: {
      'Authorization':                   `Bearer ${process.env.QSTASH_TOKEN}`,
      'Content-Type':                    'application/json',
      'Upstash-Retries':                 '5',
      'Upstash-Backoff-Delay':           '5s',
      'Upstash-Backoff-Max-Delay':       '80s',
      'Upstash-Forward-Idempotency-Key': idempotencyKey ?? '',
    },
    body: JSON.stringify(job),
  });

  if (!res.ok) throw new Error(`QStash error ${res.status}: ${res.statusText}`);
  const data = await res.json() as { messageId: string };
  logger.info('[Queue] Enqueued via QStash', { type: job.type, messageId: data.messageId });
  return data.messageId;
}

async function _enqueueInProcess(job: EmailJob): Promise<null> {
  try {
    await _dispatch(job);
    logger.info('[Queue] Email sent (in-process)', { type: job.type });
  } catch (e) {
    logger.warn('[Queue] Direct send failed — queuing retry', { type: job.type, error: String(e) });
    scheduleRetry(job, 0);
  }
  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function enqueueEmail(job: EmailJob, idempotencyKey?: string): Promise<string | null> {
  if (process.env.QSTASH_TOKEN) {
    try {
      return await _enqueueQStash(job, idempotencyKey);
    } catch (e) {
      logger.error('[Queue] QStash failed — falling back to in-process', { type: job.type, error: String(e) });
    }
  } else {
    // CRIT-02 FIX (V062): Loud warning when falling back to in-process queue.
    // In production, this queue is ephemeral — all emails are LOST on restart/deploy.
    // On Vercel, cold starts and restarts are frequent: data loss is certain without QStash.
    // Fix: set QSTASH_TOKEN in production (see .env.production.template).
    if (process.env.NODE_ENV === 'production') {
      logger.warn(
        '[Queue] ⚠️  CRITICAL: Using in-process queue in production — emails WILL be lost on restart. ' +
        'Set QSTASH_TOKEN to enable durable email delivery. ' +
        'See .env.production.template for setup instructions.',
        { type: job.type }
      );
    } else {
      logger.debug('[Queue] No QSTASH_TOKEN — using in-process queue', { type: job.type });
    }
  }
  return _enqueueInProcess(job);
}

// ── Diagnostics ───────────────────────────────────────────────────────────────
export function getQueueMode(): 'qstash' | 'in-process' { return process.env.QSTASH_TOKEN ? 'qstash' : 'in-process'; }
export function getRetryQueueDepth(): number            { return _queue.length; }

// ── Legacy stubs (backward compat) ───────────────────────────────────────────
export async function listDeadLetters(): Promise<unknown[]>              { return []; }
export async function replayDeadLetter(_jobId: string): Promise<boolean> { return false; }
