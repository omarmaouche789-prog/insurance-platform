# Insurance Marketplace

Online health insurance marketplace: ZIP-based plan discovery, comparison, and enrollment, with agent and admin back offices. See [`CLAUDE.md`](CLAUDE.md) for the full architecture, feature scope, and build order.

## Status

Phases 1–6 are implemented (6 = production integrations: S3, SendGrid, SmartyStreets, carrier API clients): auth (JWT access + rotating refresh tokens), TOTP 2FA for agent/admin, an RBAC middleware skeleton, guest plan discovery (ZIP search with filters and sorting, plan details, side-by-side comparison of up to 4 plans) backed by a seeded mock plan catalog, a 5-step enrollment wizard (personal details, health info, document upload, review, carrier submission via a mock adapter), and the agent portal (assigned-application queue with status filters, application detail with document downloads and PDF export, document requests to applicants, resubmission of rejected/failed applications, commission tracking), and admin application review (a cross-agent queue at `/admin/applications/pending`, approve/reject with notes, bulk decisions, approval-rate and review-time metrics). Everything else in the [build order](CLAUDE.md#build-order) — recommendations, admin user/plan management, commission payouts, CMS — is not built yet.

To try the agent flow: enroll as `user@example.com` in ZIP 10001 with test SSN `123-45-0001` (the mock carrier rejects it on the first attempt), then log in as `agent@example.com` to request documents and resubmit. SSN `…0002` simulates a carrier timeout instead.

## Setup: Railway + Redis Cloud

No Docker needed. Postgres runs on [Railway.app](https://railway.app) and Redis on [Redis Cloud](https://redis.io/cloud/):

1. Create a PostgreSQL service on Railway and copy its connection URL (Variables → `DATABASE_PUBLIC_URL`).
2. Create a database on Redis Cloud and copy its public endpoint and password.
3. Put them in `.env` and `apps/api/.env`:
   - `DATABASE_URL=postgresql://user:password@host:port/dbname`
   - `REDIS_URL=redis://user:password@host:port`
   - `FIELD_ENCRYPTION_KEY` — generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. It encrypts SSNs and health info; losing it makes existing applications unreadable.

## Getting started

```bash
cp .env.example .env                    # read by both apps at runtime
cp .env.example apps/api/.env           # the Prisma CLI only looks next to apps/api, not the repo root
# edit DATABASE_URL (Railway) and REDIS_URL (Redis Cloud) in both .env files
npm install
npm run -w apps/api prisma:migrate
npm run -w apps/api prisma:seed
npm run dev              # api on :4000, web on :3000
```

Seeded accounts (password `Password123!` for all): `admin@example.com` (ADMIN/SUPER), `agent@example.com` (AGENT, licensed in CA/NY), `agent2@example.com` (AGENT, TX/FL), `user@example.com` (USER).

## Layout

```
apps/web       Next.js frontend — guest routes + /account, /agent, /admin portals
apps/api       Express + TypeScript backend — auth, RBAC middleware, Prisma
packages/shared Role/AdminRole enums and DTOs shared by both apps
```

## Deploying

API on Render, web on Vercel, Postgres on Railway. See [DEPLOYMENT.md](DEPLOYMENT.md) for setup steps and every env var. Locally, integrations run on mocks unless their env vars are set.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs the API and web app together |
| `npm run build` | Builds all workspaces |
| `npm run lint` | Lints the API and web app |
| `npm run test` | Runs the API's unit tests (RBAC middleware, token logic) |
| `npm run -w apps/api prisma:migrate` | Applies Prisma migrations |
| `npm run -w apps/api prisma:seed` | Seeds the three example accounts above |
