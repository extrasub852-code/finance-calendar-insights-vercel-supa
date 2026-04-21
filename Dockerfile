# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim

WORKDIR /app

# Prisma engines need OpenSSL libs; slim images omit them → install explicitly.
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install without lifecycle scripts so `postinstall` / prisma does not run until
# the full tree (including prisma/schema.prisma) is present — avoids Railpack/Docker
# install-order failures.
COPY package.json package-lock.json ./
RUN npm ci --include=dev --ignore-scripts

COPY . .

# Schema requires DATABASE_URL for `prisma generate` / `tsc`; do not bake into the image so Railway can set DB at runtime.
RUN DATABASE_URL="file:./prisma/dev.db" npm run build && npm prune --omit=dev

ENV NODE_ENV=production

# Run node directly so PID 1 is the server (reliable signals); npm is not required at runtime.
CMD ["node", "--import", "tsx", "server/index.ts"]
