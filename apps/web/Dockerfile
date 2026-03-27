FROM node:22-alpine AS base

# Install dependencies (from monorepo root context)
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/api-client/package.json packages/api-client/
RUN npm ci --legacy-peer-deps --workspace=@shorterlink/web --workspace=@shorterlink/shared --ignore-scripts

# Generate Prisma client
FROM base AS prisma
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json prisma.config.ts ./
COPY prisma ./prisma
RUN npx prisma generate

# Build the app
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=prisma /app/apps/web/src/generated ./apps/web/src/generated
COPY package.json turbo.json prisma.config.ts ./
COPY prisma ./prisma
COPY apps/web ./apps/web
COPY packages ./packages
RUN npm run build --workspace=@shorterlink/web

# Production image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/web/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

# Copy Prisma for migrations (schema + CLI + config + deps)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=deps /app/node_modules/prisma ./node_modules/prisma
COPY --from=deps /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=deps /app/node_modules/dotenv ./node_modules/dotenv

# Entrypoint: run migrations then start
RUN printf '#!/bin/sh\necho "Running migrations..."\nnode -e "\
require(\"dotenv/config\");\
const { execSync } = require(\"child_process\");\
try {\
  execSync(\"node node_modules/prisma/build/index.js migrate deploy --schema prisma/schema.prisma\", { stdio: \"inherit\", env: { ...process.env } });\
} catch(e) {\
  console.log(\"Migration note: check logs\");\
}\
"\necho "Starting app..."\nexec node apps/web/server.js\n' > /app/start.sh && chmod +x /app/start.sh

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["/app/start.sh"]
