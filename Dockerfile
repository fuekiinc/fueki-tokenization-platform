# -- Build stage ---------------------------------------------------------------
FROM node:22-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./

# Install only the deps needed to build the frontend (skip hardhat/solc)
RUN npm ci --ignore-scripts

COPY . .

# Vite bakes VITE_* env vars at build time (public, client-side only)
ENV VITE_API_URL=https://fueki-backend-114394197024.us-central1.run.app
ENV VITE_GOOGLE_MAPS_API_KEY=AIzaSyBEmXxzsM1deLV_FwYn91ECjJ43dUGs0V8
ENV VITE_THIRDWEB_CLIENT_ID=2e0666f968e836ef3adfb480987686c6

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
