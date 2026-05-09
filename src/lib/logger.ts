// src/... — HemaV050: structured JSON + correlationId + BetterStack/Axiom dual shipping
import { AsyncLocalStorage } from 'async_hooks';
import pkg from '../../package.json';

// ── Types ─────────────────────────────────────────────────────────
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level:          LogLevel;
  time:           string;
  env:            string;
  service:        string;
  version:        string;
  correlationId?: string;
  requestId?:     string;
  userId?:        string;
  route?:         string;
  method?:        string;
  durationMs?:    number;
  statusCode?:    number;
  ip?:            string;
  msg:            string;
  [key: string]:  unknown;
}

// ── AsyncLocalStorage for request-scoped context ──────────────────
interface RequestContext {
  correlationId: string;
  requestId?:    string;
  userId?:       string;
  route?:        string;
  method?:       string;
  ip?:           string;
  startTime?:    number;
}

const store = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return store.run(ctx, fn);
}
export function getContext(): RequestContext | undefined { return store.getStore(); }
export function getCorrelationId(): string | undefined   { return store.getStore()?.correlationId; }

// ── V009: PII redaction before serialization ─────────────────────
// Any field whose key matches these patterns is replaced with "[REDACTED]"
// before logs leave the process — prevents passwords, tokens, hashes, raw
// auth headers, and credit-card-like numbers from reaching BetterStack/Axiom.
// V010 FIX (H4): expanded PII key regex.
// Previously the scrubber only redacted fields whose names suggested credentials
// (password, token, etc.). Customer PII — email addresses, phone numbers, physical
// addresses, and names — appeared in structured log fields like { email, phone,
// shippingAddress } and were shipped in plaintext to BetterStack/Axiom.
// GDPR / Egypt PDPL require that PII is not transmitted to third-party processors
// without explicit data-processing agreements. Redacting at the log layer is the
// minimal safe default; routes that need to log PII for debugging must do so
// explicitly using a hash (e.g. hashForLog(email)) rather than plaintext.
// V010 FIX (H4) — CORRECTION: the generic `name` term was too broad; it
// matched `orderName`, `productName`, `companyName`, and other non-PII fields
// because the regex tests whether the field KEY contains the pattern, not
// whether the pattern equals the key. Specific forms are retained:
// `firstname`, `lastname`, `fullname`. Generic `name` is intentionally
// excluded — redact only on explicit, unambiguous personal-data field names.
// IP addresses are NOT redacted here; they are legitimate security-audit data
// and are processed by BetterStack/Axiom under "legitimate interest" (GDPR
// Art. 6(1)(f)) for fraud detection and incident response. If stricter
// compliance is required, add `\bip\b` to the regex and document the trade-off.
const PII_KEY_RE   = /(password|passwd|secret|token|apikey|api_key|authorization|cookie|hash|hmac|otp|cvv|ssn|pan|card|email|phone|address|firstname|lastname|fullname|street|city|governorate|zipcode|postcode)/i;
const PAN_RE       = /\b\d{12,19}\b/;        // bare 12-19 digit number
const REDACTED     = '[REDACTED]';
const MAX_DEPTH    = 6;

function scrub(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return REDACTED;
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return PAN_RE.test(value) ? REDACTED : value;
  }
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(v => scrub(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = PII_KEY_RE.test(k) ? REDACTED : scrub(v, depth + 1);
  }
  return out;
}

// ── External log shipping ─────────────────────────────────────────
const SHIP_TIMEOUT = 5_000;

async function fetchWithTimeout(url: string, init: RequestInit, ms = SHIP_TIMEOUT): Promise<void> {
  const ctl = new AbortController();
  const t   = setTimeout(() => ctl.abort(), ms);
  try {
    await fetch(url, { ...init, signal: ctl.signal });
  } catch { /* non-blocking */ }
  finally { clearTimeout(t); }
}

async function shipToBetterStack(entries: LogEntry[]): Promise<void> {
  const token = process.env.BETTERSTACK_SOURCE_TOKEN;
  if (!token) return;
  await fetchWithTimeout('https://in.logs.betterstack.com', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(entries),
  });
}

async function shipToAxiom(entry: LogEntry): Promise<void> {
  const token   = process.env.AXIOM_TOKEN;
  const dataset = process.env.AXIOM_DATASET;
  if (!token || !dataset) return;
  await fetchWithTimeout(`https://api.axiom.co/v1/datasets/${dataset}/ingest`, {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify([{ ...entry, _time: entry.time }]),
  });
}

// V009: cap the queue size — under sustained log shipping failure the queue
// would otherwise grow unbounded and OOM the process.
const SHIP_QUEUE_MAX = 1000;
let shipQueueDropped = 0;
const shipQueue: LogEntry[] = [];
let   shipTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleShip(entry: LogEntry): void {
  if (process.env.NODE_ENV === 'test') return;
  if (shipQueue.length >= SHIP_QUEUE_MAX) {
    shipQueueDropped++;
    if (shipQueueDropped % 100 === 1) {
      console.warn(`[Logger] shipQueue full — dropped ${shipQueueDropped} log entries so far`);
    }
    // FIND-014 FIX: priority bypass — error-level events always reach stderr even
    // when the ship queue is full so security events (login failures, CSRF violations,
    // rate-limit hits) are never silently lost.
    if (entry.level === 'error') {
      console.error('[Logger:OVERFLOW] Critical event lost from ship queue:', JSON.stringify(entry));
    }
    return;
  }
  shipQueue.push(entry);
  if (shipTimer) return;
  shipTimer = setTimeout(async () => {
    shipTimer = null;
    const batch = shipQueue.splice(0, shipQueue.length);
    await Promise.all([
      shipToBetterStack(batch),
      ...batch.map(e => shipToAxiom(e)),
    ]);
  }, 500);
}

// ── Core emit ────────────────────────────────────────────────────
const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function shouldLog(level: LogLevel): boolean {
  const configLevel = (process.env.LOG_LEVEL ?? 'info') as LogLevel;
  return LEVEL_ORDER[level] >= LEVEL_ORDER[configLevel];
}

function buildEntry(level: LogLevel, msg: string, ctx?: Record<string, unknown>): LogEntry {
  const reqCtx     = getContext();
  // V009: scrub PII from caller-supplied context before it ever reaches console
  const safeCtx    = ctx ? (scrub(ctx) as Record<string, unknown>) : undefined;
  return {
    level,
    time:          new Date().toISOString(),
    env:           process.env.NODE_ENV ?? 'development',
    service:       'hema-furniture',
    version:       pkg.version,
    correlationId: reqCtx?.correlationId,
    requestId:     reqCtx?.requestId,
    userId:        reqCtx?.userId,
    route:         reqCtx?.route,
    method:        reqCtx?.method,
    ip:            reqCtx?.ip,
    msg,
    ...safeCtx,
  };
}

function emit(level: LogLevel, msg: string, ctx?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;

  const entry  = buildEntry(level, msg, ctx);
  const isProd = process.env.NODE_ENV === 'production';

  // Console output
  const line = isProd
    ? JSON.stringify(entry)                                                        // JSON for log aggregators
    : `\x1b[${levelColor(level)}m[${level.toUpperCase().padEnd(5)}]\x1b[0m ${msg}${ctx ? ' ' + JSON.stringify(ctx, null, 0) : ''}`;

  if (level === 'error')     console.error(line);
  else if (level === 'warn') console.warn(line);
  else                       console.log(line);

  // Ship warnings + errors to external services in production
  if (isProd && LEVEL_ORDER[level] >= LEVEL_ORDER['warn']) {
    scheduleShip(entry);
  }
}

function levelColor(l: LogLevel): number {
  return { debug: 36, info: 32, warn: 33, error: 31 }[l];
}

// ── Public API ───────────────────────────────────────────────────
type Ctx  = Record<string, unknown>;
type LoggerApi = {
  debug: (msg: string, ctx?: Ctx) => void;
  info: (msg: string, ctx?: Ctx) => void;
  warn: (msg: string, ctx?: Ctx) => void;
  error: (msg: string, ctx?: Ctx) => void;
  request: (method: string, route: string, statusCode: number, durationMs: number, ip?: string) => void;
  child: (defaultCtx: Ctx) => LoggerApi;
};

export const logger: LoggerApi = {
  debug: (msg: string, ctx?: Ctx) => emit('debug', msg, ctx),
  info:  (msg: string, ctx?: Ctx) => emit('info',  msg, ctx),
  warn:  (msg: string, ctx?: Ctx) => emit('warn',  msg, ctx),
  error: (msg: string, ctx?: Ctx) => emit('error', msg, ctx),

  /** HTTP request logger — call at start of handler */
  request(method: string, route: string, statusCode: number, durationMs: number, ip?: string): void {
    emit('info', `${method} ${route} ${statusCode} ${durationMs}ms`, {
      type: 'http', method, route, statusCode, durationMs, ip,
    });
  },

  /** Create a child logger bound to static context */
  child(defaultCtx: Ctx): LoggerApi {
    return {
      debug: (msg: string, ctx?: Ctx) => emit('debug', msg, { ...defaultCtx, ...ctx }),
      info:  (msg: string, ctx?: Ctx) => emit('info',  msg, { ...defaultCtx, ...ctx }),
      warn:  (msg: string, ctx?: Ctx) => emit('warn',  msg, { ...defaultCtx, ...ctx }),
      error: (msg: string, ctx?: Ctx) => emit('error', msg, { ...defaultCtx, ...ctx }),
      request: logger.request,
      child:   (ctx2: Ctx) => logger.child({ ...defaultCtx, ...ctx2 }),
    };
  },
};

// ── Re-export for convenience ─────────────────────────────────────
export function runWithCorrelationId<T>(correlationId: string, fn: () => T): T {
  return runWithContext({ correlationId }, fn);
}
