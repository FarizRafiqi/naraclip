# ==============================================================================
# NaraClip Production Multi-Stage Dockerfile
# Optimized for AdonisJS v6 + Inertia React + PostgreSQL
# ==============================================================================

# --- Stage 1: Base Environment ---
FROM node:24-bookworm-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    dumb-init \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# --- Stage 2: Install All Dependencies (for build) ---
FROM base AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages

RUN pnpm install --frozen-lockfile

# --- Stage 3: Build Application ---
FROM dependencies AS builder

COPY . .

# Build AdonisJS & Inertia/Vite client bundles
RUN node ace build

# Install production dependencies inside build/ output directory
WORKDIR /app/build
RUN pnpm install --prod --frozen-lockfile

# --- Stage 4: Production Runner ---
FROM base AS runner

ENV NODE_ENV=production
ENV PORT=3333
ENV HOST=0.0.0.0

WORKDIR /app

# Copy built application & production dependencies from builder
COPY --from=builder /app/build ./

# Create data directories with appropriate permissions for node user
RUN mkdir -p /app/tmp && chown -R node:node /app

USER node

EXPOSE 3333

# Use dumb-init to properly handle PID 1 signal forwarding (graceful shutdown)
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "bin/server.js"]
