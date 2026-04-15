# LaptopGuru CRM

Internal CRM for laptop.guru — automates client request handling, sends
personalized emails with video reviews, and tracks engagement via custom
landing pages. See `docs/PRD.md` for product context.

## Stack

- **Monorepo:** Turborepo + npm workspaces (`apps/*`, `packages/*`)
- **Web:** Next.js 16 (App Router, React 19), NextAuth v5, Tailwind v4 — port **3000**
- **API:** NestJS 11, BullMQ workers, Socket.IO — port **4000**
- **DB:** PostgreSQL 16 via Prisma 7
- **Queue:** Redis + BullMQ (video transcode, YouTube upload)
- **Media:** AWS S3 → MediaConvert → CloudFront (signed URLs) + YouTube dual-publish
- **Proxy:** Caddy (handles multi-tenant custom domains in prod)

## Commands

```bash
# Everything (from repo root)
npm run dev          # turbo: runs web + api in parallel
npm run build        # turbo build
npm run lint         # turbo lint
npm run type-check   # turbo type-check

# Single app
npm run dev:web      # web only (port 3000)
npm run dev:api      # api only (port 4000)

# Database (Prisma)
npm run db:migrate   # prisma migrate dev
npm run db:generate  # regenerate BOTH Prisma clients (see Gotchas)
npm run db:studio    # prisma studio
npm run db:seed      # npx tsx prisma/seed.ts

# API tests (Vitest)
npm test --workspace=@laptopguru-crm/api
```

## Layout

```
apps/
  web/   Next.js frontend + public landing pages (/l/[slug], /r/[code])
  api/   NestJS backend, modules: videos, send, landings, messaging,
         emails, crm, super-admin, analytics, links, quicklinks, auth
packages/
  shared/      Cross-app types (video, video-analytics, permissions)
  api-client/  Typed fetcher for web → api calls
prisma/        Single schema.prisma (source of truth for both apps)
docs/          PRD.md, DESIGN.md, superpowers specs
```

## Gotchas

- **Two Prisma clients.** `prisma/schema.prisma` generates into
  `apps/web/src/generated/prisma` AND `apps/api/src/generated/prisma`.
  Import from the local generated path in each app, not `@prisma/client`.
  Run `npm run db:generate` after any schema change.
- **Env lives at repo root.** `apps/api` reads `.env` via
  `dotenv -e ../../.env` in its dev script — don't create a per-app `.env`.
- **Next.js uses webpack, not Turbopack.** Dev script is
  `next dev --webpack` (intentional; some deps aren't Turbopack-ready).
- **Multi-tenant via Company.customDomain.** Requests hit Caddy, which
  routes by Host header; `apps/web/src/middleware.ts` resolves the tenant.
  Local dev uses `DOMAIN=localhost`.
- **Video pipeline needs several AWS + YouTube env vars** (see
  `.env.example` — `AWS_S3_VIDEO_BUCKET`, `AWS_MEDIACONVERT_*`,
  `AWS_CLOUDFRONT_*`, `YOUTUBE_OAUTH_*`). Missing any of these breaks
  video upload/transcode/publish silently in workers.
- **Roles:** `SUPER_ADMIN` (cross-company), `ADMIN` (company admin), `USER`.
  Super-admin routes live under `apps/web/src/app/(super-admin)/` and
  `apps/api/src/modules/super-admin/`.
- **Pre-commit:** husky + lint-staged runs ESLint on staged files in
  each workspace. Don't bypass with `--no-verify`.

## Local Setup

1. Copy `.env.example` → `.env` and fill required vars.
2. Start infra: `docker compose -f docker-compose.dev.yml up -d` (Postgres on 5433, Redis on 6379).
3. `npm install && npm run db:migrate && npm run db:seed`
4. `npm run dev`

Seed credentials are in `CREDENTIALS.md`.
