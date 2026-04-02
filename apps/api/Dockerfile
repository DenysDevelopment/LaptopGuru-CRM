FROM node:22-alpine AS base

# Install dependencies
FROM base AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/api-client/package.json packages/api-client/
RUN node -e "const p=require('./package.json');delete p.scripts.prepare;require('fs').writeFileSync('package.json',JSON.stringify(p,null,2))" && \
    npm ci --legacy-peer-deps

# Generate Prisma client
FROM base AS prisma
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json prisma.config.ts ./
COPY prisma ./prisma
RUN npx prisma generate

# Build the API
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=prisma /app/apps/api/src/generated ./apps/api/src/generated
COPY package.json turbo.json tsconfig.json ./
COPY apps/api ./apps/api
COPY packages ./packages
RUN npm run build --workspace=@laptopguru-crm/shared && \
    npm run build --workspace=@laptopguru-crm/api && \
    echo "=== Checking dist/generated ===" && \
    head -3 /app/apps/api/dist/generated/prisma/client.js

# Production image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# Copy node_modules and built output
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY apps/api/package.json ./package.json

# Verify no ESM issues
RUN node -e "require('./dist/generated/prisma/client')" && echo "Prisma client OK" || echo "Prisma client FAILED"

USER nestjs

EXPOSE 4000
ENV PORT=4000

CMD ["node", "dist/main.js"]
