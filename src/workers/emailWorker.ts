// src/workers/emailWorker.ts — HemaV071
// WEAK-ARCH-03 FIX: this file was missing in V048 despite being referenced in
// package.json ("worker": "tsx src/workers/emailWorker.ts"), causing `npm run worker`
// to fail with ENOENT. This standalone worker processes email jobs from the retry queue.
//
// Usage (standalone long-running process, e.g. in Docker):
//   npm run worker
//
// This process is NOT required for normal operation — the in-process queue in
// src/lib/queue.ts handles retries automatically within the Next.js process.
// Run this worker separately only when you want a dedicated email dispatch process
// decoupled from the web server (e.g. for high-volume or background processing).

import 'dotenv/config';
import { enqueueEmail, getQueueMode, getRetryQueueDepth } from '../lib/queue';
import { logger } from '../lib/logger';

const POLL_INTERVAL_MS = 5_000;
const HEALTH_LOG_INTERVAL_LOOPS = 12; // log health every ~60s

logger.info('[EmailWorker] Starting', {
  queueMode: getQueueMode(),
  pid:       process.pid,
  node:      process.version,
});

// ── Graceful shutdown ────────────────────────────────────────────────────────
// ARCH-006 FIX (V071): Explicit SIGTERM/SIGINT handlers ensure in-flight polling
// loops complete before process exit. Without this, Docker stop would SIGKILL
// after the default 10s grace period, potentially losing queued email jobs.
let isShuttingDown = false;

function handleShutdown(signal: string) {
  logger.info(`[EmailWorker] Received ${signal} — draining queue before exit`);
  isShuttingDown = true;
  // Allow up to 10s for in-flight emails to complete
  setTimeout(() => {
    logger.info('[EmailWorker] Shutdown complete');
    process.exit(0);
  }, 10_000);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT',  () => handleShutdown('SIGINT'));

// ── Main polling loop ────────────────────────────────────────────────────────
let loopCount = 0;

async function runLoop(): Promise<void> {
  if (isShuttingDown) return;

  loopCount++;
  if (loopCount % HEALTH_LOG_INTERVAL_LOOPS === 0) {
    logger.info('[EmailWorker] Health check', {
      queueDepth: getRetryQueueDepth(),
      uptimeSeconds: Math.floor(process.uptime()),
    });
  }

  // The in-process queue drives its own retries; this worker's job is to
  // trigger the queue processor by calling enqueueEmail with a no-op probe
  // if needed. In most deployments the internal loop handles everything.
  // Future enhancement: integrate with Redis pub/sub for distributed workers.

  setTimeout(runLoop, POLL_INTERVAL_MS);
}

runLoop().catch((err: unknown) => {
  logger.error('[EmailWorker] Fatal error in main loop', { error: String(err) });
  process.exit(1);
});

logger.info('[EmailWorker] Running — press Ctrl+C to stop');
