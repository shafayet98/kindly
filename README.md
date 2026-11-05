# Kindly

A voice-first, multi-agent health and wellbeing companion. Built for the Future Health Digital Innovation Challenge 2026 (Challenge 09 — Sustaining Healthy Behaviors).

> Prototype. Fictional data only — no real patient data. Kindly's companions are AI; it is not a medical or emergency service.

## Stack

- **Web app:** Next.js 16 (App Router), React 19, Tailwind CSS 4
- **Auth:** Supabase Auth, email + password with required email confirmation
- **Database:** Supabase Postgres via Drizzle ORM. Row-level security is on for every table with no policies, so the Supabase Data API exposes nothing; all access goes through server code that checks ownership.
- **Voice:** OpenAI Realtime (`@openai/agents`) — Milo, Natalie and Sarah with same-call handoffs
- **Phone:** Twilio Programmable Voice + Media Streams, bridged by a Fastify server (`realtime-server/`)

## Setup

1. `pnpm install`
2. Copy `.env.example` to `.env` and fill it in.
3. `pnpm db:migrate` — create the tables.
4. `pnpm demo:reset` — create the fictional demo accounts and 5 weeks of synthetic history. Password is `DEMO_PASSWORD` in `.env`.
5. `pnpm dev` — web app on http://localhost:3000

Supabase dashboard settings: **Authentication → Sign In / Providers**: Email on, *Confirm email* on, other providers off. **URL Configuration**: Site URL `http://localhost:3000`, redirect URL `http://localhost:3000/**`.

### Demo accounts

| Email | Role |
|---|---|
| `demo.patient@example.com` | Patient "Alex", walking goal, 8 AM walk reminder, phone calls enabled |
| `demo.patient2@example.com` | Patient "Priya", smoking-reduction goal |
| `demo.clinician@example.com` | Approved fictional clinician, assigned to Alex |

Approve or revoke a real clinician account (after they sign up and confirm their email): `pnpm clinician:approve <email> [--revoke]`.

### Phone calls (development)

1. `pnpm dev:phone` — starts a Cloudflare quick tunnel and the realtime server behind it (requires `cloudflared`).
2. `pnpm call:me` — places a real test call to `DEMO_CALL_TO_NUMBER`.

## Scripts

| Command | What it does |
|---|---|
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Checks run in CI |
| `pnpm test:e2e` | Playwright browser tests against the real Supabase project (needs `.env`; local only) |
| `pnpm db:generate` / `pnpm db:migrate` | Create / apply Drizzle migrations |

## Known MVP shortcuts

- **Email:** uses Supabase's built-in email service (only delivers to Supabase team members, heavily rate-limited). Production needs custom SMTP (e.g. Resend) with a verified domain — a Supabase settings change only.
- **Safety contacts** in `lib/safety/contacts.ts` are placeholders pending clinical and legal review.
