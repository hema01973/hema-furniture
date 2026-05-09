# ── Hema Furniture V031 — Production Dockerfile ──────────────────
# Multi-stage: deps → builder → runner → worker
# V016: added "worker" stage so docker-compose can target it for the
# BullMQ worker container without running the Next.js server.
# Security: non-root user (UID 1001), no dev deps, Alpine minimal

# ── Stage 1: Dependency installation ─────────────────────────────
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

COPY package.json package-lock.json ./
# --ignore-scripts: prevent postinstall scripts running as root
RUN npm ci --ignore-scripts

# ── Stage 2: Application build ────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

ARG BUILD_SHA=unknown
ARG BUILD_TIME=unknown

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV DOCKER_BUILD=true

RUN echo "Building SHA=${BUILD_SHA} at ${BUILD_TIME}" && \
    npm run build

# ── Stage 3: Production runtime ───────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

# Runtime metadata
ARG BUILD_SHA=unknown
LABEL org.opencontainers.image.source="https://github.com/your-org/hema-furniture" \
      org.opencontainers.image.revision="${BUILD_SHA}" \
      org.opencontainers.image.title="Hema Furniture" \
      org.opencontainers.image.description="Enterprise e-commerce — Next.js 15"

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV BUILD_SHA=${BUILD_SHA}

# Minimal system packages (wget for healthcheck only)
RUN apk add --no-cache wget tini && \
    addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs && \
    mkdir -p /app/.next/cache && \
    chown -R nextjs:nodejs /app

# Standalone output (no node_modules bundle needed)
COPY --from=builder /app/public                              ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone  ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static      ./.next/static

USER nextjs
EXPOSE 3000

# Tini as PID 1 — proper signal handling + zombie reaping
ENTRYPOINT ["/sbin/tini", "--"]

HEALTHCHECK \
  --interval=30s \
  --timeout=10s  \
  --start-period=40s \
  --retries=3 \
  CMD wget -qO- http://localhost:3000/api/healthz | \
      grep -E '"status":"(healthy|degraded)"' || exit 1

CMD ["node", "server.js"]

# ── Stage 4: BullMQ Worker runtime ───────────────────────────────
# V016: Separate slim image for the email/queue worker.
# Shares the same node_modules from deps stage — no redundant install.
# Runs `npm run worker` (src/worker.ts entrypoint) instead of Next.js server.
FROM node:22-alpine AS worker
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache tini && \
    addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# Copy only what the worker needs — no .next build output
COPY --from=deps    /app/node_modules       ./node_modules
COPY --from=builder /app/package.json       ./package.json
# MED-003 FIX (V071): Copy src/workers directory instead of single worker.ts.
# tsconfig.json removed — tsx loads it internally and it's not needed at runtime.
# Copying the full workers directory future-proofs against additional worker files.
COPY --from=builder /app/src/workers        ./src/workers
COPY --from=builder /app/src/lib            ./src/lib
COPY --from=builder /app/src/services       ./src/services
COPY --from=builder /app/src/types          ./src/types

RUN chown -R nextjs:nodejs /app
USER nextjs

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npm", "run", "worker"]
