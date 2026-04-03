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
    # 1. Remove import.meta.url (ESM-only) and replace with __dirname \
    # 2. Remove .ts extensions from require() calls \
    node -e " \
      const fs = require('fs'); \
      const dir = '/app/apps/api/dist/generated/prisma'; \
      function fix(f) { \
        let c = fs.readFileSync(f, 'utf8'); \
        c = c.replace(/globalThis\[.*?__dirname.*?\].*?import\.meta\.url.*?;/g, ''); \
        c = c.replace(/require\(\"node:url\"\);?\n?/g, ''); \
        c = c.replace(/\.ts\"\)/g, '\")'); \
        c = c.replace(/\.ts'\)/g, \"')\"); \
        fs.writeFileSync(f, c); \
      } \
      fs.readdirSync(dir).filter(f=>f.endsWith('.js')).forEach(f=>fix(dir+'/'+f)); \
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

# Verify no ESM issues
RUN node -e "require('./dist/generated/prisma/client')" && echo "Prisma client OK" || echo "Prisma client FAILED"

USER nestjs

EXPOSE 4000
ENV PORT=4000

CMD ["node", "dist/main.js"]
