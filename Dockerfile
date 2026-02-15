FROM node:22-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./

# Install only the deps needed to build the frontend (skip hardhat/solc)
RUN npm ci --ignore-scripts

COPY . .

RUN npx vite build

# --- Production stage: serve static files ---
FROM node:22-slim

WORKDIR /app

RUN npm install -g serve

COPY --from=build /app/dist ./dist

ENV PORT=3000
EXPOSE 3000

CMD ["sh", "-c", "serve -s dist -l tcp://0.0.0.0:$PORT"]
