# -- Build stage ---------------------------------------------------------------
FROM node:22-slim AS builder

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# -- Production stage ----------------------------------------------------------
FROM node:22-slim

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs appuser

COPY --chown=appuser:nodejs package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder --chown=appuser:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=appuser:nodejs /app/dist ./dist
COPY --chown=appuser:nodejs prisma ./prisma

ENV NODE_ENV=production

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD sh -c 'wget --no-verbose --tries=1 --spider "http://localhost:${PORT:-8080}/health" || exit 1'

USER appuser

CMD ["node", "dist/index.js"]
