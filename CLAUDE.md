# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Phases 1 (Foundations — auth, RBAC skeleton, schema v1), 2 (Guest discovery — ZIP plan search, filters, comparison), 3 (Enrollment — 5-step wizard, document upload, mocked carrier submission) 4 (Agent portal — assigned-application queue, document requests, resubmission, commission tracking, PDF export) 5 (Admin application approval — review queue, approve/reject with notes, bulk decisions, approval metrics) and the integrations layer (S3, SendGrid, SmartyStreets, HTTP carrier adapters) are implemented. Deployment target: API on Render, web on Vercel, Postgres on Railway — see `DEPLOYMENT.md`. npm workspaces monorepo:

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
npm run -w apps/api prisma:seed      # seeds admin@ / agent@ (CA,NY) / agent2@ (TX,FL) / user@example.com, password Password123!, plus a mock plan catalog (4 fictional carriers, 16 plans, 6 ZIPs) and placeholder commission rates
npm run dev                          # runs api (:4000) and web (:3000) together
npm run -w apps/api test             # vitest: unit tests + supertest route tests (Prisma and adapters mocked; no DB needed)
npm run -w apps/api typecheck        # tsc over src + test + prisma (vitest doesn't typecheck)
npm run lint
npm run build
```

Copy `.env.example` to `.env` at the repo root before running anything (both apps read it).

Not yet built: the recommendation engine, admin user/agent/plan CRUD (the users page is read-only), commission payout (`PAID`), CMS, and everything else in phases 6-9 below — don't assume those tables/endpoints/pages exist. Plan search is public (`GET /api/plans?zip=`, `/api/plans/compare?ids=`, `/api/plans/:id`). Applicant endpoints are `/api/applications` (USER role only; ownership enforced by scoping every lookup to `userId`, returning 404 for other users' rows). Agent endpoints are `/api/agent/*` (AGENT role only; same pattern scoped to `agentId`; every view/download of an application is audit-logged). Admin review endpoints are `/api/admin/applications/*` (any ADMIN reads; only SUPER/OPERATIONS sub-roles approve/reject — `APPROVER_ADMIN_ROLES` in shared). "Pending review" means `status SUBMITTED` + `submissionStatus ACCEPTED`; decisions claim that state atomically and settle the commission (`EARNED` on approve, `VOID` on reject) in the same transaction (`modules/admin/review.service.ts`). An admin rejection keeps `submissionStatus ACCEPTED`, which is how it's told apart from a carrier rejection: carrier rejections are resubmittable, admin rejections are final. `reviewNotes` is the rejection reason (shown to applicant/agent) or internal approval notes (admins only). Applications are auto-assigned at creation to the least-loaded active agent whose `regions` include the applicant ZIP's state (`modules/agent/assignment.ts`), else left unassigned. Carrier submission (applicant submit and agent resubmit) goes through one function, `modules/applications/carrierSubmit.ts`, which also books the agent's commission (`PENDING`) on acceptance. The mock carrier rejects SSNs ending `0001` and times out on `0002`, first attempt only. External services sit behind adapters in `apps/api/src/integrations/`: `documentStorage.ts` (S3 / local disk), `email.ts` + `emailTemplates.ts` (SendGrid / console log), `zipLookup.ts` (SmartyStreets with fallback to a static table), `carrierSubmission.ts` (per-carrier HTTP clients routed by carrier code / mock). Each picks the real service when its env vars are set and the mock otherwise; `assertProductionIntegrations()` in `lib/env.ts` makes production refuse to boot on mocks unless `ALLOW_MOCK_INTEGRATIONS=true`. Outbound HTTP goes through `lib/http.ts` (timeouts, retry with backoff for 408/425/429/5xx only). Always send email via `email.send` (never throws; a failed email must not fail the action) with a template — email bodies must never contain PHI. Every carrier response is audit-logged as `carrier.response` without the payload.

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
