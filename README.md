# Insurance Marketplace

Online health insurance marketplace: ZIP-based plan discovery, comparison, and enrollment, with agent and admin back offices. See [`CLAUDE.md`](CLAUDE.md) for the full architecture, feature scope, and build order, and [`DEPLOYMENT.md`](DEPLOYMENT.md) for production setup.

## Features

**Shoppers (guest & registered users)** — ZIP plan search with filters and sorting, plan details, side-by-side comparison of up to 4 plans, a 5-step enrollment wizard (personal details, health info, document upload, review, carrier submission), application tracking, and a public blog at `/blog`.

**Agents** — assigned-application queue, application detail with in-browser document preview (PDF and images), document requests with status tracking (open → uploaded → complete), live in-app notifications when an applicant uploads, follow-up reminders with a calendar picker, internal notes, resubmission, PDF export, and a performance page (approval rate, 6-month trend, commissions).

**Admins** — application review (approve/reject, bulk decisions, approval metrics), user management, agent management, an analytics dashboard, and the blog CMS. Admin sub-roles decide who can do what:

| Capability | SUPER | OPERATIONS | FINANCE | COMPLIANCE |
| --- | :-: | :-: | :-: | :-: |
| View everything (users, agents, analytics, posts, applications) | ✓ | ✓ | ✓ | ✓ |
| Approve / reject applications | ✓ | ✓ | | |
| Suspend, delete, reset password / 2FA for users | ✓ | ✓ | | |
| …the same for **admin** accounts | ✓ | | | |
| Create / edit / deactivate agents | ✓ | ✓ | | |
| Record commission payouts | ✓ | | ✓ | |
| Write and publish blog posts | ✓ | ✓ | | |
| Change system settings (features, maintenance, sessions) | ✓ | | | |

### Two-factor authentication (all roles)

Every account — user, agent, admin — can turn on TOTP 2FA from **Security** (`/account/security`, `/agent/security`, `/admin/security`):

1. **Scan** a QR code (rendered by the API, so the secret never goes to a third-party service) with Google Authenticator, Authy, 1Password, etc., or type the key manually.
2. **Verify** a 6-digit code to switch 2FA on.
3. **Save backup codes** — ten one-time codes, shown once, with Download / Copy / Print. The dialog can't be closed until you confirm you've saved them.

Signing in then asks for a code after the password. **Lost your phone?** Choose *Use a backup code* on the sign-in screen; each code works once and you're warned when few remain. With no codes left, an admin can reset 2FA from the user's profile after verifying identity out-of-band. Turning 2FA off needs your password **and** a current code. New backup codes can be generated (with an authenticator code) at any time; the old set stops working.

Security details: TOTP secrets are AES-256-GCM encrypted at rest; each 30-second code can be used only once (replay protection); backup codes are stored as HMACs and burned atomically; too many wrong codes in 15 minutes (5 by default, set in System settings) locks sign-in for that account.

### Admin user management (`/admin/users`)

Search by name or email, filter by role and status (active / suspended / deleted), sort, and act on one account or many: suspend with a reason (signs them out immediately), reactivate, send a password-reset link (single use, 1-hour expiry), reset 2FA, or delete. Deletion requires typing the account's email, emails the user, and anonymizes the account while keeping applications and commissions for compliance. The profile page shows contact details, security posture, applications, full sign-in history (time, IP, device, method, failures) and recent activity.

### Admin agent management (`/admin/agents`)

Create agents (email, name, phone, license number, NPN, expiry, licensed states, optional commission-rate override) — they get an invite email to set their own password. Edit territories and rates, see each agent's applications handled, approval rate and commissions (pending / earned / paid), record payouts, and deactivate agents (history is kept; never-submitted applications can be reassigned to other agents in the same state).

### Analytics (`/admin/analytics`)

Date-range presets or custom dates; user acquisition (weekly or monthly), application funnel with step conversion, approval rate by agent, revenue by carrier, a top-agents table, and **Export to Excel** (one sheet per panel, real numbers with currency formats).

### Notification templates (`/admin/notifications`)

Two tabs.

**Email Templates** lists the five applicant emails admins can reword: *Application Submitted*, *Application Approved*, *Application Rejected*, *Agent Assigned* and *Documents Requested*. Search by name or subject, sort by name or last modified, and each row shows the subject, when it was last changed, and whether it's the *Default* or *Customized*. Opening one shows a rich-text editor for the subject and body, clickable variable chips (`{userName}`, `{appId}`, `{status}`, `{agentName}`, plus `{confirmationNumber}` on Submitted and `{documents}` on Documents Requested), and a live preview with sample data where merged values are highlighted. Saving checks that the subject and body aren't empty and that only that template's variables are used. The platform always adds the call-to-action button (with the link) and a privacy note below the body, so an edit can't break a link. *Revert to default* restores the built-in wording after a confirmation. SUPER and OPERATIONS admins edit; FINANCE and COMPLIANCE see the page read-only. Every save and revert is audit-logged (`admin.email_template.update` / `.revert`, with who, when and what changed). Templates live in `email_templates` and are created from the built-in defaults on first use (and by the seed). `{appId}` is a short reference like `APP-4F2A9C1E`, also shown on the applicant's application pages. Emails never include health details, SSNs or rejection reasons. The other eleven emails (security notices, password reset, agent invite, account changes, carrier updates) keep fixed wording and are listed read-only under *System emails*.

**SMS Templates** lists the text messages (welcome, document request, submitted, approved, not approved, status update) with an editor: insert `{userName}`, `{appId}` or `{status}`, see a live phone preview with character, segment and encoding counts, switch a template on or off, save, reset to the default, and send a test to any number. Tests go through Twilio when `TWILIO_*` is configured and are written to the API log otherwise. SMS templates aren't sent automatically by any workflow yet.

### Agent Notification Center (`/agent/notifications`)

Agents see every notification about their work, newest first, 20 per page: new or reassigned applications (*Assignment*), admin approvals and rejections (*Status Update*), carrier accepted / needs more information / couldn't be reached (*Carrier Response*), and applicant uploads against their document requests (*Document Request*). *Message* is reserved for messaging, which doesn't exist yet; account and reminder notices show as *Other*. Filter by type and read status, mark one, a selection, or everything as read, delete, and open the related application (which marks it read). Unread items have an orange marker, and the header bell (which now links here) updates immediately. These are the same in-app notifications the bell shows, stored in `notifications` with an optional link to the application. Notifications never include rejection reasons or health details: the application page has those.

### System settings (`/admin/settings`)

Four tabs. Every admin can view; only SUPER admins can change anything (OPERATIONS and the other sub-roles see it read-only). Settings live in `system_settings`, one row per setting (`section` + `key` + JSON `value`, who changed it and when); a missing row means the default. Every change is audit-logged (`admin.settings.update`, or `admin.settings.feature_toggle` for switches) with the before and after values, and every API instance picks it up within about 10 seconds; open browser tabs within a minute.

- **General.** Company name, platform name, support email, support phone (all required, validated) and an optional logo URL (https, with a live header preview). The platform name and logo show in every header, the company and support details in the public site footer and on the maintenance screen.
- **Feature toggles** (save instantly, with a confirmation for 2FA and email):
  - *Two-Factor Authentication* (off by default): **requires** 2FA for admins and agents. Anyone without it is sent to their Security page and the API refuses their other requests (`403`, `code: "TWO_FACTOR_REQUIRED"`) until they set it up; while required they can't turn it off. Applicants can always opt in.
  - *SMS Notifications*: saved for when SMS is wired to events; nothing sends texts automatically yet.
  - *Email Notifications* (on): off stops application-update emails (submitted, approved, rejected, agent assigned, documents requested, carrier updates). Security and account emails (password reset, 2FA notices, agent invites, suspensions) always send.
  - *Analytics Dashboard* (on): off hides it from the menu and the page, and its API answers `403`. The admin home then opens the review queue.
  - *Blog CMS* (on): off hides the public blog (`/blog` and `/api/blog/*` answer `404`), the "Learn" link and the blog editor.
  - The same tab keeps *Sign-in & sessions*: idle session timeout (default 30 minutes, 5–1440) and max login attempts before a 15-minute lockout (default 5, 3–20).
- **Maintenance mode.** A switch (with a confirmation before it turns on) and the message, with a live preview. While on, the API answers every non-admin request with `503` (`code: "MAINTENANCE"`, `Retry-After: 120`) and the web app shows the message full-screen with the support contacts and a *Try again* button that unlocks after 2 minutes (the page also re-checks every minute and lifts itself when maintenance ends). Admins keep full access and see a banner; sign-in and password reset stay open. Default message: "The system is under maintenance. Please try again later."
- **Localization & timezone.** System timezone (UTC, EST, CST, MST, PST, GMT, CET, IST, JST, AEST; daylight saving handled), date format (MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD) and time format (12- or 24-hour). Dates and times across the web app use them. The language is English; Arabic is listed as coming soon.

### Blog CMS (`/admin/cms`)

Rich-text editor (headings, lists, quotes, links, images, code), draft / publish / schedule workflow (a future publish date schedules the post), preview exactly as readers will see it, featured image upload, SEO title and description with a live search-result preview, and a status-filtered post list. HTML is sanitized on the server.

### Platform

Responsive layouts from phone to desktop, light/dark/system theme toggle, toasts for every action, confirmation dialogs for destructive ones, loading / empty / error states throughout. Every admin action is audit-logged; sensitive endpoints are rate limited.

## Setup: Railway + Redis Cloud

No Docker needed. Postgres runs on [Railway.app](https://railway.app) and Redis on [Redis Cloud](https://redis.io/cloud/):

1. Create a PostgreSQL service on Railway and copy its connection URL (Variables → `DATABASE_PUBLIC_URL`).
2. Create a database on Redis Cloud and copy its public endpoint and password.
3. Put them in `.env` and `apps/api/.env`:
   - `DATABASE_URL=postgresql://user:password@host:port/dbname`
   - `REDIS_URL=redis://user:password@host:port`
   - `FIELD_ENCRYPTION_KEY` — generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. It encrypts SSNs, health info and 2FA secrets, and keys the backup-code hashes; losing it makes existing applications unreadable and invalidates backup codes.

## Getting started

```bash
cp .env.example .env                    # read by both apps at runtime
cp .env.example apps/api/.env           # the Prisma CLI only looks next to apps/api, not the repo root
# edit DATABASE_URL (Railway) and REDIS_URL (Redis Cloud) in both .env files
npm install
npm run -w apps/api prisma:migrate
npm run -w apps/api prisma:seed         # SEED_DEMO_DATA=true in .env adds demo history for analytics
npm run dev                             # api on :4000, web on :3000
```

Seeded test accounts (dev only — the seed refuses to run with `NODE_ENV=production`), all with password `123`: `admin@test.com` (ADMIN/SUPER), `agent@test.com` (AGENT, licensed in CA/FL/NY/TX, so every seeded ZIP is assigned to them) and `user@test.com` (USER). Re-running the seed resets their passwords. To start from an empty database: `npm run -w apps/api prisma:reset` then `npm run -w apps/api prisma:seed`.

**Try it:**

- *2FA* — sign in as anyone, open **Security** from the avatar menu, and follow the three steps. Sign out and back in; try *Lost your phone? Use a backup code*.
- *Agent flow* — enroll as `user@test.com` in ZIP 10001 with test SSN `123-45-0001` (the mock carrier rejects it on the first attempt), then sign in as `agent@test.com` to preview documents, request more, schedule a follow-up and resubmit. SSN `…0002` simulates a carrier timeout.
- *Admin* — sign in as `admin@test.com`; the dashboard opens on Analytics.
- In development, emails (password resets, invites, 2FA notices) are printed to the API console instead of being sent; copy the link from there.

## Database migrations

Migrations live in `apps/api/prisma/migrations` and are applied with `npm run -w apps/api prisma:migrate` (dev) or `prisma migrate deploy` (production, run automatically by Render before each release).

`20261002210017_tier1_security_admin_cms` (this release) is additive — nothing is dropped:

| Table | Change |
| --- | --- |
| `users` | + `twoFactorEnabled`, `suspendedAt`, `suspensionReason`, `deletedAt`, `lastLoginAt` (backfilled `twoFactorEnabled` from existing 2FA rows) |
| `two_factor_secrets` | + `createdAt`, `lastUsedStep` (replay protection); secrets now encrypted, legacy rows re-encrypt on next use |
| `backup_codes` | new — HMAC of each one-time code, `usedAt` |
| `login_history` | new — every sign-in attempt: success, method, failure reason, IP, user agent, device |
| `password_reset_tokens` | new — admin resets, self-service resets and agent invites |
| `agent_profiles` | + `npn`, `licenseExpiresAt`, `commissionRateBps` (override), `deactivatedAt`, timestamps |
| `document_requests` | + `status` (OPEN/FULFILLED/COMPLETED/CANCELLED, backfilled), `completedAt`, `completedById` |
| `follow_ups`, `application_notes`, `notifications` | new — agent tooling and in-app notifications |
| `email_templates` | new — the five editable applicant emails: `key`, `name`, `subject`, `body` (HTML), `description`, `variables`, `isDefault`, who changed it last |
| `system_settings` | new — one row per setting: `section`, `key`, JSON `value`, `createdAt`/`updatedAt`, who changed it; missing rows fall back to defaults |
| `blog_posts` | new — title, slug, content, status, `publishedAt`, author, featured image, SEO fields |
| `commissions` | + `paidAt` |

## API reference (new in this release)

| Method & path | Who | Purpose |
| --- | --- | --- |
| `GET /api/users/:id/2fa` | self | 2FA status and backup codes remaining |
| `POST /api/users/:id/2fa/enable` | self | Start enrollment: secret, otpauth URL, QR code |
| `POST /api/users/:id/2fa/verify` | self | Confirm a code, turn 2FA on, return backup codes |
| `POST /api/users/:id/2fa/disable` | self | Turn off (password + code) |
| `POST /api/users/:id/2fa/backup-codes` | self | Regenerate backup codes |
| `GET /api/users/:id/login-history` | self | Own sign-in history |
| `POST /api/auth/password-reset/{request,validate,confirm}` | public | Self-service reset and invite acceptance |
| `GET /api/admin/users` · `GET /:id` · `GET /:id/login-history` | admin | List (search/filter/sort), profile, sign-ins |
| `POST /api/admin/users/:id/{suspend,activate,delete,reset-password,2fa/reset}` · `POST /bulk` | SUPER/OPS | Account actions |
| `GET/POST /api/admin/agents` · `GET/PUT /:id` · `POST /:id/{deactivate,reactivate}` | admin / SUPER·OPS | Agent management |
| `POST /api/admin/agents/:id/commissions/pay` | SUPER/FINANCE | Mark earned commissions paid |
| `POST /api/agent/applications/:id/request-documents` | agent | Request documents |
| `POST /api/agent/applications/:id/document-requests/:requestId/{complete,cancel}` | agent | Close a request |
| `POST /api/agent/applications/:id/schedule-followup` · `GET /follow-ups` · `POST /follow-ups/:id/complete` · `DELETE /follow-ups/:id` | agent | Follow-ups |
| `GET/POST /api/agent/applications/:id/notes` | agent | Internal notes (admins read via `/api/admin/applications/:id/notes`) |
| `GET /api/agent/performance` | agent | Own performance |
| `GET /api/notifications` · `POST /:id/read` · `POST /read-all` | signed in | In-app notifications |
| `GET /api/agent/notifications?type=&read=&page=` · `GET /unread-count` · `PATCH /:id/read` · `PATCH /bulk/read` (`{ ids }`) · `PATCH /read-all` · `DELETE /:id` | agent | Agent Notification Center (own notifications only) |
| `GET /api/admin/analytics/{users,approvals,revenue,funnel,export}` | admin | Analytics; `from`/`to` (YYYY-MM-DD), `interval=week\|month` |
| `GET/POST /api/admin/cms/posts` · `GET/PUT/DELETE /:id` · `POST/DELETE /:id/image` | admin / SUPER·OPS | Blog CMS |
| `GET /api/admin/email-templates` · `GET /:id` · `PUT /:id` · `POST /:id/revert` | admin / SUPER·OPS | Editable email templates (PUT takes `{ subject, body }`) |
| `GET /api/admin/notifications/email/templates` · `GET /sms/templates` · `PUT /sms/templates/:key` · `POST /sms/templates/:key/reset` · `POST /sms/send` | admin / SUPER·OPS | Notification templates and SMS test send |
| `GET /api/admin/settings` · `GET /:section` | admin | All settings, or one section, with who changed them last |
| `PUT /api/admin/settings/:section` · `PUT /:section/:key` (`{ value }`) · `POST /features/:feature/toggle` (`{ enabled? }`) | SUPER | Save a whole section (e.g. `general`), one setting, or flip a feature |
| `GET /api/status` | public | Branding, localization, feature visibility and maintenance status for the web app |
| `GET /api/blog/posts` · `GET /posts/:slug` · `GET /images/:id` | public | Published posts |

Errors are JSON `{ "error": "…" }` with the usual status codes: 400 validation (with `details.fieldErrors`), 401, 403, 404, 409 conflict/state, 429 rate limited (with `Retry-After`), 503 maintenance mode (`code: "MAINTENANCE"`).

## Layout

```
apps/web        Next.js frontend — guest routes + /account, /agent, /admin portals; UI kit in components/ui
apps/api        Express + TypeScript backend — auth, RBAC middleware, Prisma, integration adapters
packages/shared Role enums, DTOs and helpers shared by both apps
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs the API and web app together |
| `npm run build` | Builds all workspaces |
| `npm run lint` | Lints the API and web app |
| `npm run test` | Runs the API test suite (Prisma and integrations mocked; no database needed) |
| `npm run -w apps/api test:coverage` | The same, with a coverage report |
| `npm run -w apps/api typecheck` | Type-checks API source, tests and seed |
| `npm run -w apps/api prisma:migrate` | Applies Prisma migrations |
| `npm run -w apps/api prisma:reset` | Drops the database and re-applies all migrations (dev only; doesn't seed) |
| `npm run -w apps/api prisma:seed` | Seeds the three test accounts and the plan catalog |
