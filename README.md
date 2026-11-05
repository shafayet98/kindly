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

1. `pnpm dev:phone` — starts a Cloudflare quick tunnel and the realtime server behind it (requires `cloudflared`), **with the call scheduler on**. Due reminder calls for users who opted in will be placed.
2. In the app, **Reminders & calls → Call me now**, or `pnpm call:me` for the demo patient.

The scheduler only runs when `SCHEDULER_ENABLED=true`, so starting the server any other way never dials.

### How scheduled calls work

- Each active phone reminder has exactly one `scheduled` job for its next local occurrence (idempotency key = reminder + occurrence), recomputed whenever the reminder changes.
- The phone server claims due jobs with `FOR UPDATE SKIP LOCKED`, then re-checks consent, pause, quiet hours, the user's daily limit and a service-wide hourly cap before dialling.
- Twilio status callbacks (signature-validated) move a job through ringing → in progress → answered / missed / busy / failed. Unanswered reminder calls retry on the same job up to the user's limit, then the next occurrence is scheduled.
- Late reminder calls (>15 min, e.g. server down) and "call me now" requests older than 2 minutes are skipped, never placed late. A claimed job whose dial state is unknown is failed rather than redialled.
- Agents change reminders in two steps: propose (stored in `action_confirmations`) and `confirm_action` after the person says yes. A confirmation executes once; Natalie's changes are recorded as delegations to Milo's reminder service.

## Scripts

| Command | What it does |
|---|---|
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Checks run in CI |
| `pnpm test:e2e` | Playwright browser tests against the real Supabase project, including a real browser voice call with a fake microphone (needs `.env`; local only; resets demo data first) |
| `pnpm voice:smoke` | Text-only conversation with the live agents: tools, handoffs, Sarah privacy pruning (real Realtime API, a few cents) |
| `pnpm scheduler:check` | Runs the call scheduler against the database with a **fake** Twilio client (never dials): consent, races, retries, pause, quiet hours, expiry, errors |
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
