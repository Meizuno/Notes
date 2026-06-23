FROM node:22-alpine AS builder

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
ENV NUXT_DATABASE_URL="postgresql://x:x@x:5432/x"
# Limit the Prisma CLI / engines to the alpine target so we don't ship
# binaries for darwin / linux-glibc / etc.
ENV PRISMA_CLI_BINARY_TARGETS="linux-musl-openssl-3.0.x"
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PRISMA_CLI_BINARY_TARGETS="linux-musl-openssl-3.0.x"

# .output/server is a self-contained Nitro bundle with its own minimal
# node_modules (including the Prisma client + native engine binary).
# We do NOT copy the top-level node_modules — most of it is already
# inlined in .output, and shipping it again would just duplicate.
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/prisma ./prisma
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

# Install the prisma CLI globally — one package, single platform's
# engines, used only for `prisma migrate deploy` on container start.
# Pin the version so it matches the @prisma/client baked into .output.
RUN npm install -g prisma@6 \
 && npm cache clean --force

EXPOSE 3000

# Container readiness probe — Docker / Compose / orchestrators can wait
# for `healthy` before routing traffic.
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["./entrypoint.sh"]
