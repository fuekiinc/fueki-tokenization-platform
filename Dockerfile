# -- Build stage ---------------------------------------------------------------
FROM node:22-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./

# Install only the deps needed to build the frontend (skip hardhat/solc)
RUN npm ci --ignore-scripts

COPY . .

# Vite bakes VITE_* env vars at build time (public, client-side only).
# All values MUST be provided via --build-arg at build time. No defaults
# are set to prevent accidental credential leakage into Docker image layers.
ARG VITE_API_URL=https://fueki-backend-pojr5zp2oq-uc.a.run.app
ARG VITE_GOOGLE_MAPS_API_KEY
ARG VITE_THIRDWEB_CLIENT_ID
ARG VITE_RPC_1_URLS
ARG VITE_RPC_17000_URLS
ARG VITE_RPC_42161_URLS
ARG VITE_RPC_421614_URLS
ARG VITE_RPC_8453_URLS
ARG VITE_RPC_84532_URLS
ARG VITE_ORBITAL_FACTORY_1
ARG VITE_ORBITAL_ROUTER_1
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_GOOGLE_MAPS_API_KEY=${VITE_GOOGLE_MAPS_API_KEY}
ENV VITE_THIRDWEB_CLIENT_ID=${VITE_THIRDWEB_CLIENT_ID}
ENV VITE_RPC_1_URLS=${VITE_RPC_1_URLS}
ENV VITE_RPC_17000_URLS=${VITE_RPC_17000_URLS}
ENV VITE_RPC_42161_URLS=${VITE_RPC_42161_URLS}
ENV VITE_RPC_421614_URLS=${VITE_RPC_421614_URLS}
ENV VITE_RPC_8453_URLS=${VITE_RPC_8453_URLS}
ENV VITE_RPC_84532_URLS=${VITE_RPC_84532_URLS}
ENV VITE_ORBITAL_FACTORY_1=${VITE_ORBITAL_FACTORY_1}
ENV VITE_ORBITAL_ROUTER_1=${VITE_ORBITAL_ROUTER_1}

RUN npx vite build

# -- Production stage: serve static files -------------------------------------
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN npm install -g serve

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs appuser

COPY --from=build --chown=appuser:nodejs /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

USER appuser

CMD ["sh", "-c", "serve -s dist -l tcp://0.0.0.0:${PORT:-3000}"]
