# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --include=dev --ignore-scripts

COPY . .

RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production

CMD ["node", "--import", "tsx", "server/index.ts"]
