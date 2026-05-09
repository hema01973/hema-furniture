// src/... — HemaV050: Slack alerts for critical business events
import { logger } from './logger';

const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL;
const APP_URL       = process.env.NEXT_PUBLIC_APP_URL ?? 'https://hemafurniture.com';

export type AlertLevel = 'info' | 'warning' | 'critical';

export interface AlertPayload {
  title:   string;
  message: string;
  level:   AlertLevel;
  data?:   Record<string, unknown>;
}

const COLOR: Record<AlertLevel, string> = {
  info:     '#36a64f',   // green
  warning:  '#ff9f00',   // amber
  critical: '#e01e5a',   // red
};

/** Send a Slack alert for critical business events (non-blocking) */
export async function sendAlert(payload: AlertPayload): Promise<void> {
  if (!SLACK_WEBHOOK) return;   // no webhook → silently skip (dev/staging)
  try {
    const body = {
      attachments: [{
        color:    COLOR[payload.level],
        fallback: `[${payload.level.toUpperCase()}] ${payload.title}: ${payload.message}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*${payload.level === 'critical' ? '🚨' : payload.level === 'warning' ? '⚠️' : 'ℹ️'} ${payload.title}*\n${payload.message}`,
            },
          },
          ...(payload.data ? [{
            type: 'section',
            fields: Object.entries(payload.data).slice(0, 8).map(([k, v]) => ({
              type: 'mrkdwn',
              text: `*${k}:*\n${String(v).slice(0, 100)}`,
            })),
          }] : []),
          {
            type: 'context',
            elements: [{ type: 'mrkdwn', text: `${APP_URL} • ${new Date().toISOString()}` }],
          },
        ],
      }],
    };
    await fetch(SLACK_WEBHOOK!, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(5_000),
    });
  } catch (e) {
    logger.warn('[Alerts] Failed to send Slack alert', { error: String(e) });
  }
}

/** Alert on payment failure */
export function alertPaymentFailed(orderNumber: string, reason: string): void {
  sendAlert({
    level:   'critical',
    title:   'Payment Failed',
    message: `Order ${orderNumber} payment failed`,
    data:    { orderNumber, reason, url: `${APP_URL}/admin/orders` },
  }).catch(() => {});
}

/** Alert on circuit breaker opening */
export function alertCircuitOpen(service: string): void {
  sendAlert({
    level:   'warning',
    title:   `Circuit Breaker OPEN — ${service}`,
    message: `Service ${service} is unavailable. Requests are being blocked.`,
    data:    { service },
  }).catch(() => {});
}

/** Alert on high error rate */
export function alertHighErrorRate(route: string, errorRate: number): void {
  sendAlert({
    level:   'warning',
    title:   'High Error Rate',
    message: `${route} error rate is ${errorRate.toFixed(1)}%`,
    data:    { route, errorRate: `${errorRate.toFixed(1)}%` },
  }).catch(() => {});
}
