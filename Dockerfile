# -- Build stage ---------------------------------------------------------------
FROM node:22-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./

# Install only the deps needed to build the frontend (skip hardhat/solc)
RUN npm ci --ignore-scripts

COPY . .

# Vite bakes VITE_* env vars at build time (public, client-side only)
ARG VITE_API_URL=https://fueki-backend-114394197024.us-central1.run.app
ARG VITE_GOOGLE_MAPS_API_KEY=AIzaSyBEmXxzsM1deLV_FwYn91ECjJ43dUGs0V8
ARG VITE_THIRDWEB_CLIENT_ID=2e0666f968e836ef3adfb480987686c6
ARG VITE_RPC_1_URLS=https://billowing-rough-moon.quiknode.pro/a3cc003399fc8c72876d87c1f516c0897574e60c/,https://ethereum-rpc.publicnode.com
ARG VITE_RPC_17000_URLS=https://flashy-crimson-borough.ethereum-holesky.quiknode.pro/f43097bbd32a1c3476c2f3f1ff1d4780361be827/,https://holesky.drpc.org
ARG VITE_RPC_42161_URLS=https://snowy-blue-frost.arbitrum-mainnet.quiknode.pro/a691b5e884e8df719f8ce8ec8ad5e22092d17cdb/,https://arb1.arbitrum.io/rpc
ARG VITE_RPC_421614_URLS=https://ancient-holy-tent.arbitrum-sepolia.quiknode.pro/53623a401aa412366b43ddea31aa6538ef24d7fd/,https://sepolia-rollup.arbitrum.io/rpc
ARG VITE_RPC_8453_URLS=https://delicate-red-cloud.base-mainnet.quiknode.pro/3ae2b0cd08e640c9c6a3e4c0ca89351dc879e5c8/,https://mainnet.base.org
ARG VITE_RPC_84532_URLS=https://billowing-wandering-yard.base-sepolia.quiknode.pro/70e0d692e7ba902f935ff17774c1aed59a21e0d0/,https://sepolia.base.org
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_GOOGLE_MAPS_API_KEY=${VITE_GOOGLE_MAPS_API_KEY}
ENV VITE_THIRDWEB_CLIENT_ID=${VITE_THIRDWEB_CLIENT_ID}
ENV VITE_RPC_1_URLS=${VITE_RPC_1_URLS}
ENV VITE_RPC_17000_URLS=${VITE_RPC_17000_URLS}
ENV VITE_RPC_42161_URLS=${VITE_RPC_42161_URLS}
ENV VITE_RPC_421614_URLS=${VITE_RPC_421614_URLS}
ENV VITE_RPC_8453_URLS=${VITE_RPC_8453_URLS}
ENV VITE_RPC_84532_URLS=${VITE_RPC_84532_URLS}

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
