# Navodaya Cricket League 2026

The permanent website for the JNVCKM Alumni Group's Navodaya Cricket League. It is one Next.js application: public pages, captain registration, organizer controls, fixtures and match day. Scoring stays on CricHeroes. This site does not invent a scoring API.

## Stack

- Next.js 16.3.8, React 19.3, TypeScript 5.9
- Tailwind CSS 4.3
- Zod 4.6
- Postgres, including Supabase Postgres, through `postgres` when `DATABASE_URL` is set
- Embedded Postgres for local development when `DATABASE_URL` is empty
- Supabase Auth magic links and Supabase Storage when those credentials exist
- Playwright for the phone and desktop journeys

TypeScript 7 and ESLint 10 are current, but the Next.js lint toolchain still requires TypeScript 5.9 and ESLint 9.39. Those are the versions pinned here.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

With no `DATABASE_URL`, the app creates a real Postgres database in `.data/pglite`, applies `supabase/migrations`, and seeds the confirmed 2026 facts plus sourced archive rows. It does not seed teams, fees, sponsors or fixtures.

Development sign-in is off until you set:

```bash
ALLOW_LOCAL_AUTH=true
SESSION_SECRET=a-long-random-string
ADMIN_EMAILS=you@example.com
```

`ALLOW_LOCAL_AUTH` is refused when `NODE_ENV=production`. Organizer access is granted only when the signed-in email is in `ADMIN_EMAILS`. There is no control that lets a person choose the admin role.

## Production database

Set `DATABASE_URL` to Supabase Postgres or another Postgres service. The app runs the SQL migrations on startup. You can also apply `supabase/migrations/001_init.sql` yourself. The connection uses `prepare: false`, so the Supabase transaction pooler (port 6543) works.

Row level security is enabled and forced. The Next.js server uses a privileged connection and enforces authorization in the domain layer. Direct connections that are not superuser, including the `ncl_rls` role, cannot read another captain's registration, mark a payment verified, or write the audit log. Public data is exposed through views that omit phone numbers, UPI details and unpublished fixtures.

## Auth and files

Email sign-in needs:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SITE_URL=https://your-domain.example
```

The return path is `/auth/callback`. Phone OTP is not implemented.

Receipts and uploads use Supabase Storage when `SUPABASE_SERVICE_ROLE_KEY` and both bucket names are set. Otherwise files go to `.data/uploads`. On Railway, attach a volume for that directory or configure Supabase Storage before the event. The service role key stays on the server.

## What must be decided before registration opens

In the organizer settings, blank is not the same as zero.

- Registration opening and closing times, in IST

Fee, payee name, UPI ID, payment guidance, refund policy, and playing conditions can stay blank. A blank fee is not free, and no payment QR is shown until a fee above zero, a payee and a UPI ID are saved. An explicit `0` means the event is free. When a rules version and rules text are both saved, the form asks for acknowledgement. Roster lock, team cap, squad size, eligibility, ball, overs, grounds and hours can also stay blank. They are enforced only after they are set.

## Deployment

The chosen host is Railway, or any Node host that runs `npm run build` and `npm start`. `railway.toml` is included. Do not deploy from this repository until the environment above is filled in. This project does not publish itself.

Health check: `GET /api/health`.

Backups:

```bash
pg_dump "$DATABASE_URL" -Fc -f ncl-backup.dump
pg_restore --clean --if-exists -d "$DATABASE_URL" ncl-backup.dump
```

Before the event, download the registration, payment and fixture CSVs from the organizer desk. A published schedule can be restored from an archived schedule version on the fixtures screen. That restore is one database transaction. It does not edit a match that you then have to republish by hand.

`DEMO_MODE=true` seeds clearly labeled fictional fixtures. It is ignored in production.

## CricHeroes

There is no scoring integration. Organizers can store a tournament URL and a scorecard URL per match. The public page says "View scorecard on CricHeroes". Typed summaries are labeled as organizer entries. Standings are published from an entered or imported table. Net run rate is stored only when supplied. Overs in any future calculation must be ball counts, not decimals.

## Tests

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

The domain tests cover captain isolation through row-level security, idempotent submission, the approval cap, unverified payments, IST windows, schedule conflicts, unpublished fixtures, calendar sequence numbers, and the refusal to invent a fee.
