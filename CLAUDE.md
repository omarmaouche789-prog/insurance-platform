# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Phase 1 (Foundations — auth, RBAC skeleton, schema v1) is implemented. npm workspaces monorepo:

- `apps/web` — Next.js (App Router) frontend: guest routes (`/`, `/login`, `/register`) plus role-gated portals at `/account`, `/agent`, `/admin`.
- `apps/api` — Express + TypeScript backend: register/login/refresh/logout, TOTP 2FA for agent/admin, `requireAuth`/`requireRole`/`requireAdminRole` RBAC middleware, audit logging. Prisma against Postgres.
- `packages/shared` — Role/AdminRole enums and DTO types imported by both apps.

**Commands** (run from repo root unless noted):

```bash
cp .env.example .env && cp .env.example apps/api/.env   # Prisma CLI only reads apps/api/.env, not the root one
# set DATABASE_URL (Railway Postgres) and REDIS_URL (Redis Cloud) in both .env files
npm install
npm run -w apps/api prisma:generate
npm run -w apps/api prisma:migrate   # creates schema in Postgres
npm run -w apps/api prisma:seed      # seeds admin@example.com / agent@example.com / user@example.com, password Password123!
npm run dev                          # runs api (:4000) and web (:3000) together
npm run -w apps/api test             # vitest: RBAC middleware + token unit tests
npm run lint
npm run build
```

Copy `.env.example` to `.env` at the repo root before running anything (both apps read it).

Not yet built: plans, applications, commissions, CMS, and everything else in phases 2-9 below — don't assume those tables/endpoints/pages exist.

## What's being built

An online insurance marketplace: consumers browse and compare health insurance plans by ZIP code, get plan recommendations, and enroll — with licensed agents assisting enrollment and an admin back office running the business. Access splits into four roles, each with its own portal:

- **Guest** (no login) — ZIP-based plan discovery, filtering, comparison, educational content. Can start enrollment but must register to finish it.
- **Registered User** — everything Guest has, plus saved plans/preferences, personalized recommendations, the full multi-step enrollment flow, and application tracking.
- **Agent** — a queue of assigned applications, applicant contact tools, carrier submission, commission tracking.
- **Admin** — four sub-scopes (Super/Operations/Compliance/Finance) covering users, agents, plans, commissions, CMS content, analytics, and compliance tooling.

## Reading the spec

`Document.docx` is the source of truth for the feature list and includes UML diagrams (use-case + sequence diagrams for the Admin, Agent, and User portals) embedded as images — it is not readable as plain text. To extract it:

```bash
unzip -o Document.docx -d <dest>       # docx is a zip archive
# text:   <dest>/word/document.xml  (strip <w:t> runs / <w:p> boundaries)
# images: <dest>/word/media/*.png   (the UML diagrams)
```

## Intended architecture (per spec)

- **Frontend**: Next.js (App Router), TypeScript, Tailwind CSS / Material UI — one route group per role (guest / account / agent / admin), since permissions and navigation differ per role.
- **Backend**: Node.js, Express or Fastify, TypeScript. JWT/OAuth2 auth with RBAC middleware shared across all four portals; 2FA (TOTP) for admin/agent.
- **Data**: PostgreSQL as the system of record; Redis for sessions and caching hot reads (plan listings).
- **External integrations** (Carrier APIs, CMS.gov Medicare Plan Finder, NPPES doctor lookup, Twilio/SendGrid, USPS/SmartyStreets, Stripe/PayPal): each should sit behind a backend adapter interface, so a mock adapter can stand in wherever real credentials aren't available yet.

## Build order

The spec covers a production-grade, HIPAA-adjacent marketplace — full scope is a multi-quarter build. The agreed sequencing (see the published roadmap artifact from project planning) is:

1. Foundations — auth, RBAC skeleton, schema v1
2. Guest discovery — ZIP search, comparison, rule-based recommendation engine
3. Registered user & enrollment — profiles, multi-step enrollment, status tracking
4. Agent portal — assigned-application queue, carrier submission (mocked)
5. Admin core — user/agent/plan/application management, audit log — **this is the MVP boundary**
6. Integrations layer — replace mocks with real Carrier/CMS.gov/NPPES/notification/ZIP-validation services
7. Finance, CMS & reporting — commission engine, CMS, analytics
8. Security & compliance hardening — encryption review, HIPAA-aligned logging, GDPR tooling
9. QA, performance & handover

Later phases assume earlier ones exist (e.g. the commission engine in phase 6 depends on the agent commission ledger from phase 3; the integrations adapters in phase 5 are built in phase 3, just pointed at a mock).

## Unresolved decisions in the spec

These are referenced in the feature list but not specified — don't assume an answer without checking with the user:

- Whether "AI recommendation" means a weighted rule-based score or an ML model.
- Actual commission rate tables (per-carrier, per-agent).
- Live chat: build vs. a hosted provider (Pusher/Twilio Conversations).
- Hosting/infra target (not mentioned in the spec at all).
