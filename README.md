# Insurance Marketplace

Online health insurance marketplace: ZIP-based plan discovery, comparison, and enrollment, with agent and admin back offices. See [`CLAUDE.md`](CLAUDE.md) for the full architecture, feature scope, and build order.

## Status

Phase 1 (Foundations) is implemented: auth (JWT access + rotating refresh tokens), TOTP 2FA for agent/admin, an RBAC middleware skeleton, and schema v1 in Postgres via Prisma. Everything else in the [build order](CLAUDE.md#build-order) — plan search, enrollment, agent queues, admin CRUD, commissions, CMS — is not built yet.

## Setup: Railway + Redis Cloud

No Docker needed. Postgres runs on [Railway.app](https://railway.app) and Redis on [Redis Cloud](https://redis.io/cloud/):

1. Create a PostgreSQL service on Railway and copy its connection URL (Variables → `DATABASE_PUBLIC_URL`).
2. Create a database on Redis Cloud and copy its public endpoint and password.
3. Put them in `.env` and `apps/api/.env`:
   - `DATABASE_URL=postgresql://user:password@host:port/dbname`
   - `REDIS_URL=redis://user:password@host:port`

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

Seeded accounts (password `Password123!` for all): `admin@example.com` (ADMIN/SUPER), `agent@example.com` (AGENT), `user@example.com` (USER).

## Layout

```
apps/web       Next.js frontend — guest routes + /account, /agent, /admin portals
apps/api       Express + TypeScript backend — auth, RBAC middleware, Prisma
packages/shared Role/AdminRole enums and DTOs shared by both apps
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs the API and web app together |
| `npm run build` | Builds all workspaces |
| `npm run lint` | Lints the API and web app |
| `npm run test` | Runs the API's unit tests (RBAC middleware, token logic) |
| `npm run -w apps/api prisma:migrate` | Applies Prisma migrations |
| `npm run -w apps/api prisma:seed` | Seeds the three example accounts above |
