// src/app/api/worker/email/route.ts — HemaV068
// VULN-001 FIX (V068): Real QStash HMAC-SHA-256 signature verification.
// Previously only checked for the presence of the upstash-signature header,
// allowing any attacker to forge email jobs by supplying any non-empty string.
// Now cryptographically verifies the signature using QSTASH_CURRENT_SIGNING_KEY
// and QSTASH_NEXT_SIGNING_KEY (dual-key for zero-downtime rotation).
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { logger } from '@/lib/logger';
import * as em from '@/lib/email';
import type { EmailJob } from '@/lib/queue';
import { getSecret } from '@/lib/secrets';

/**
 * Verify a QStash HMAC-SHA-256 signature.
 *
 * QStash signs the raw request body with HMAC-SHA-256 using the signing key
 * and base64-encodes the result. The `upstash-signature` header contains
 * that base64 digest.
 *
 * We try both QSTASH_CURRENT_SIGNING_KEY and QSTASH_NEXT_SIGNING_KEY to
 * support zero-downtime key rotation (same dual-key window used by aws-sm).
 */
async function verifyQStashSignature(req: NextRequest, rawBody: string): Promise<boolean> {
  const signature = req.headers.get('upstash-signature');
  if (!signature) return false;

  let sigBytes: Buffer;
  try {
    sigBytes = Buffer.from(signature, 'base64');
  } catch {
    return false;
  }

  const currentKey = await getSecret('QSTASH_CURRENT_SIGNING_KEY');
  const nextKey    = await getSecret('QSTASH_NEXT_SIGNING_KEY');

  const bodyBuffer = Buffer.from(rawBody, 'utf8');

  for (const key of [currentKey, nextKey]) {
    if (!key) continue;
    const expected = crypto
      .createHmac('sha256', key)
      .update(bodyBuffer)
      .digest();

    if (expected.length === sigBytes.length &&
        crypto.timingSafeEqual(expected, sigBytes)) {
      return true;
    }
  }
  return false;
}

/**
 * Serverless Worker Endpoint for Email Processing
 * Triggered by Upstash QStash.
 */
export async function POST(req: NextRequest) {
  // VULN-001 FIX (V068): Read raw body FIRST so it can be used for signature
  // verification. Calling req.json() before this would consume the body stream.
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return new NextResponse('Bad Request', { status: 400 });
  }

  // Cryptographic HMAC-SHA-256 signature verification (VULN-001 FIX).
  const isValid = await verifyQStashSignature(req, rawBody);
  if (!isValid) {
    logger.warn('[Worker] QStash signature verification failed — request rejected');
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    let job: EmailJob;
    try {
      job = JSON.parse(rawBody) as EmailJob;
    } catch {
      return new NextResponse('Invalid JSON body', { status: 400 });
    }

    const concurrency = parseInt(process.env.EMAIL_WORKER_CONCURRENCY || '5', 10);
    
    logger.info('[Worker] Processing serverless job', { 
      type: job.type, 
      concurrency,
      msgId: req.headers.get('upstash-message-id') 
    });

    switch (job.type) {
      case 'orderConfirmation':  await em.sendOrderConfirmation(job.order); break;
      case 'welcome':            await em.sendWelcomeEmail(job.name, job.email); break;
      case 'verification':       await em.sendVerificationEmail(job.email, job.token, job.name); break;
      case 'passwordReset':      await em.sendPasswordReset(job.email, job.token); break;
      case 'paymentFailed':      await em.sendPaymentFailedEmail(job.order); break;
      case 'adminPaymentAlert':  await em.sendAdminPaymentAlert(job.order, job.reason); break;
      case 'refund':             await em.sendRefundEmail(job.order, job.refundAmount); break;
      default:
        logger.error('[Worker] Unknown job type', { type: (job as any).type });
        return NextResponse.json({ error: 'Unknown job type' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[Worker] Job failed', { error: errorMessage });
    
    const currentAttempt = parseInt(req.headers.get('upstash-retries') || '0', 10);
    if (currentAttempt >= 5) {
      await triggerSlackAlert(errorMessage, req);
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

async function triggerSlackAlert(error: string, req: NextRequest) {
  try {
    const slackUrl = await getSecret('SLACK_WEBHOOK_URL');
    if (!slackUrl) return;

    const msgId = req.headers.get('upstash-message-id');
    
    await fetch(slackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `🚨 *Serverless Email Worker permanently failed*`,
        blocks: [{
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: [
              `*Message ID:* ${msgId}`,
              `*Error:* \`${error}\``,
              `*Time:* ${new Date().toISOString()}`,
              `*Status:* Dead-Lettered`
            ].join('\n'),
          },
        }],
      }),
    });
  } catch (e) {
    logger.warn('[Worker] Slack alert failed', { error: String(e) });
  }
}
