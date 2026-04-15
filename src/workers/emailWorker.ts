// src/workers/emailWorker.ts — run: npm run worker
import 'dotenv/config';
import { Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import type { EmailJob } from '../lib/queue';
import * as em from '../lib/email';

const conn = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });

const worker = new Worker<EmailJob>('email', async (job: Job<EmailJob>) => {
  const d = job.data;
  console.log(`[Worker] ${d.type} (attempt ${job.attemptsMade + 1})`);
  switch (d.type) {
    case 'orderConfirmation':  await em.sendOrderConfirmation(d.order); break;
    case 'welcome':            await em.sendWelcomeEmail(d.name, d.email); break;
    case 'verification':       await em.sendVerificationEmail(d.email, d.token, d.name); break;
    case 'passwordReset':      await em.sendPasswordReset(d.email, d.token); break;
    case 'paymentFailed':      await em.sendPaymentFailedEmail(d.order); break;
    case 'adminPaymentAlert':  await em.sendAdminPaymentAlert(d.order, d.reason); break;
  }
}, { connection: conn, concurrency: 5 });

worker.on('failed', (job, err) => console.error(`[Worker] Failed ${job?.id}:`, err.message));
worker.on('error', err => console.error('[Worker]', err.message));
console.log('[Worker] Email worker running...');
process.on('SIGTERM', async () => { await worker.close(); process.exit(0); });
process.on('SIGINT',  async () => { await worker.close(); process.exit(0); });
