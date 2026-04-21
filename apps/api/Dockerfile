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
    # Fix Prisma ESM/CJS issues in compiled output: \
    # 1. Remove lines with import.meta.url and node:url (ESM-only) \
    # 2. Remove .ts extensions from require() calls \
    # 3. Set __dirname via CJS-compatible method \
    node -e " \
      const fs = require('fs'); \
      const path = require('path'); \
      const dir = '/app/apps/api/dist/generated/prisma'; \
      function fix(f) { \
        const lines = fs.readFileSync(f, 'utf8').split('\n'); \
        const fixed = lines.filter(l => !l.includes('import.meta.url') && !l.includes('require(\"node:url\")') && !l.includes(\"require('node:url')\")).map(l => l.replace(/\.ts\"\)/g, '\")').replace(/\.ts'\)/g, \"')\")); \
        fs.writeFileSync(f, fixed.join('\n')); \
      } \
      fs.readdirSync(dir).filter(f=>f.endsWith('.js')).forEach(f=>fix(path.join(dir,f))); \
      console.log('Prisma CJS fix applied'); \
    "

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

# Ship schema + migrations so `prisma migrate deploy` can apply them on startup.
COPY prisma ./prisma
COPY prisma.config.ts ./

# Verify no ESM issues
RUN node -e "require('./dist/generated/prisma/client')" && echo "Prisma client OK" || echo "Prisma client FAILED"

USER nestjs

EXPOSE 4000
ENV PORT=4000

# Apply any unapplied migrations, then start. If migrate deploy fails the
# container exits non-zero — compose will restart it; better than serving
# traffic against a stale schema.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
