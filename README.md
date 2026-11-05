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
| `pnpm test:e2e` | Playwright browser tests against the real Supabase project, including a real browser voice call with a fake microphone (needs `.env`; local only; resets demo data first) |
| `pnpm voice:smoke` | Text-only conversation with the live agents: tools, handoffs, Sarah privacy pruning (real Realtime API, a few cents) |
| `pnpm phone:smoke` | Drives the Twilio media-stream bridge with a simulated Twilio client: forged/replayed tokens rejected, Milo audio returned |
| `pnpm db:generate` / `pnpm db:migrate` | Create / apply Drizzle migrations |

## Voice architecture

- Agents (`lib/agents/voice-agents.ts`) are defined once and used by both the phone server and the browser.
- Tool **specs** (`lib/agents/tools/specs.ts`) are shared; tool **implementations** (`handlers.ts`) run only on the server through `runTool`, which enforces the per-agent allowlist and input schema. The user is always taken from the authenticated session (browser) or the server-issued call token (phone), never from model output.
- Browser calls use WebRTC with a 60-second OpenAI client secret from `/api/voice/session` (consent + hourly limit checked). Tool calls go to `/api/voice/tools`, which checks the session belongs to the signed-in user.
- Moving into or out of Sarah deletes earlier conversation items from the live model context (`lib/voice/privacy.ts`).
- Only structured events are stored (`call_sessions`, `agent_events`): no audio, no transcripts.

## Known MVP shortcuts

- **Email:** uses Supabase's built-in email service (only delivers to Supabase team members, heavily rate-limited). Production needs custom SMTP (e.g. Resend) with a verified domain — a Supabase settings change only.
- **Safety contacts** in `lib/safety/contacts.ts` are placeholders pending clinical and legal review.
