// src/lib/queue.ts — BullMQ email queue with 3 retries + exponential back-off
import type { IOrder } from '@/types';

export type EmailJob =
  | { type: 'orderConfirmation';  order: IOrder }
  | { type: 'welcome';            name: string; email: string }
  | { type: 'verification';       email: string; token: string; name: string }
  | { type: 'passwordReset';      email: string; token: string }
  | { type: 'paymentFailed';      order: IOrder }
  | { type: 'adminPaymentAlert';  order: IOrder; reason: string };

const JOB_OPTS = {
  attempts: 3,
  backoff:  { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: { count: 100 },
  removeOnFail:     { count: 50  },
};

let _queue: import('bullmq').Queue | null = null;

export async function getEmailQueue() {
  if (_queue) return _queue;
  if (!process.env.REDIS_URL) return null;
  try {
    const { Queue }   = await import('bullmq');
    const { default: IORedis } = await import('ioredis');
    const conn = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
    _queue = new Queue('email', { connection: conn, defaultJobOptions: JOB_OPTS });
    return _queue;
  } catch { return null; }
}

export async function enqueueEmail(job: EmailJob): Promise<void> {
  const queue = await getEmailQueue();
  if (queue) {
    await queue.add(job.type, job, JOB_OPTS);
    return;
  }
  // Fallback: direct send (no retry)
  try {
    const em = await import('./email');
    switch (job.type) {
      case 'orderConfirmation':  await em.sendOrderConfirmation(job.order); break;
      case 'welcome':            await em.sendWelcomeEmail(job.name, job.email); break;
      case 'verification':       await em.sendVerificationEmail(job.email, job.token, job.name); break;
      case 'passwordReset':      await em.sendPasswordReset(job.email, job.token); break;
      case 'paymentFailed':      await em.sendPaymentFailedEmail(job.order); break;
      case 'adminPaymentAlert':  await em.sendAdminPaymentAlert(job.order, job.reason); break;
    }
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') console.error('[EmailFallback]', e);
  }
}
