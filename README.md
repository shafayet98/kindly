# Kindly

A voice-first, multi-agent health and wellbeing companion. Built for the Future Health Digital Innovation Challenge 2026 (Challenge 09 — Sustaining Healthy Behaviors).

> Prototype. Fictional data only — no real patient data. Kindly's companions are AI; it is not a medical or emergency service.

**Docs:** [Contributing](CONTRIBUTING.md) · [Deployment guide](docs/DEPLOYMENT.md) · [Demo runbook](docs/DEMO_RUNBOOK.md)

**Live:** https://kindly-six-delta.vercel.app (web, Vercel) · phone server on Railway. Merging to `main` deploys both.

## Stack

- **Web app:** Next.js 16 (App Router), React 19, Tailwind CSS 4
- **Auth:** Supabase Auth, email + password (email confirmation is off for the MVP; the confirmation flow still works if it's turned on)
- **Database:** Supabase Postgres via Drizzle ORM. Row-level security is on for every table with no policies, so the Supabase Data API exposes nothing; all access goes through server code that checks ownership.
- **Voice:** OpenAI Realtime (`@openai/agents`) — Milo, Natalie and Sarah, each in their own voice, with same-call handoffs
- **Phone:** Twilio Programmable Voice + Media Streams, bridged by a Fastify server (`realtime-server/`)

## Setup

1. `pnpm install`
2. Copy `.env.example` to `.env` and fill it in.
3. `pnpm db:migrate` — create the tables.
4. `pnpm demo:reset` — create the fictional demo accounts and 5 weeks of synthetic history. Password is `DEMO_PASSWORD` in `.env`.
5. `pnpm dev` — web app on http://localhost:3000
6. For browser tests, set up a separate test project in `.env.test` — see [CONTRIBUTING.md](CONTRIBUTING.md#3-your-test-project-envtest).

Supabase dashboard settings: **Authentication → Sign In / Providers**: Email on, *Confirm email* off (MVP), other providers off. **URL Configuration**: Site URL `http://localhost:3000`, redirect URL `http://localhost:3000/**`.

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
- The scheduler never dials the ACMA's fiction numbers (`0491 570 006` and so on), which are the only numbers tests use.
- Late reminder calls (>15 min, e.g. server down) and "call me now" requests older than 2 minutes are skipped, never placed late. A claimed job whose dial state is unknown is failed rather than redialled.
- Agents change reminders in two steps: propose (stored in `action_confirmations`) and `confirm_action` after the person says yes. A confirmation executes once; Natalie's changes are recorded as delegations to Milo's reminder service.

## Scripts

| Command | What it does |
|---|---|
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Checks run in CI |
| `pnpm test:e2e` | Playwright browser tests against the **separate test project** (`.env.test`, refuses to run otherwise), including a real browser voice call with a fake microphone (local only; resets the test project's demo data first) |
| `pnpm test:db:migrate` / `pnpm test:db:reset` | Create the tables / demo data in the test project |
| `pnpm voice:smoke` | Text-only conversation with the live agents: tools, handoffs, Sarah privacy pruning (real Realtime API, a few cents) |
| `pnpm scheduler:check` | Runs the call scheduler against the test project with a **fake** Twilio client (never dials): consent, races, retries, pause, quiet hours, expiry, errors, fiction numbers refused |
| `pnpm voice:smoke:health` | Natalie logs a check-in, corrects it, asks Iris for progress and agrees a smaller goal with Theo (real Realtime API; run `pnpm demo:reset` after) |
| `pnpm safety:smoke` | Emergency and suicidal-distress messages trigger the predefined safety workflow, dosing advice is declined, prompt injection can't reach other users (real Realtime API) |
| `pnpm summary:smoke` | Conversation summaries: Sarah's part excluded by default, included when opted in, injected instructions ignored (real model) |
| `pnpm phone:smoke` | Drives the Twilio media-stream bridge with a simulated Twilio client: forged/replayed tokens rejected, Milo audio returned, and a transfer to Natalie (hold line played first, then her own voice) |
| `pnpm db:generate` / `pnpm db:migrate` | Create / apply Drizzle migrations |

## Voice architecture

- Agents (`lib/agents/voice-agents.ts`) are defined once and used by both the phone server and the browser. Each companion has its own voice (`VOICES`: Milo `cedar`, Natalie `marin`, Sarah `shimmer`).
- **Transfers:** a realtime session can't change voice once it has spoken, so each companion runs in its own session. To transfer, the companion tells the person, in its own words, who it's getting for them (explaining only companions they haven't met), then calls `transfer_to_<name>`; once that line has played (Twilio playback marks on the phone, `output_audio_buffer.stopped` in the browser) the session closes and the next companion's session starts, briefed by `handoffBriefing` (`lib/voice/privacy.ts`). On the phone the same Twilio stream is shared through `TwilioLeg`; in the browser `/api/voice/session` issues the next secret with `continueSessionId` and records the handoff (at most 12 per call).
- **Greetings:** companions introduce themselves (and say they're an AI) only the first time a person meets them (`callerContext` in `lib/voice/sessions.ts`). After that they greet the person by name. Phone calls still say who's calling ("Hi Alex, it's Milo from Kindly").
- Tool **specs** (`lib/agents/tools/specs.ts`) are shared; tool **implementations** (`handlers.ts`) run only on the server through `runTool`, which enforces the per-agent allowlist and input schema. The user is always taken from the authenticated session (browser) or the server-issued call token (phone), never from model output.
- Browser calls use WebRTC with a 60-second OpenAI client secret from `/api/voice/session` (consent + hourly limit checked). Tool calls go to `/api/voice/tools`, which checks the session belongs to the signed-in user.
- Into or out of Sarah, the next companion gets only the request and the person's last words; between Milo and Natalie it gets the recent conversation, never Sarah's part (`lib/voice/privacy.ts`).
- Only structured events are stored (`call_sessions`, `agent_events`): no audio, no transcripts.

## Goals and the weekly calendar

- A **goal** has a category (walk, workout, medication, sleep, food & drink, smoking, mindfulness, other), a cadence (daily, weekly or monthly), how many times per period, and optionally days, times, minutes and notes. People type goals in plain words; `lib/goals/parse.ts` turns that into a draft with a small OpenAI model (schema-constrained and validated, with a keyword fallback), which they check before saving. Companions create goals with `propose_new_goal`.
- **Sessions** are computed from each goal's schedule (`lib/goals/schedule.ts`, pure and unit-tested). A `goal_sessions` row exists only once something happened: done, postponed, or moved in. Past sessions not marked done count as not done; flexible weekly goals and monthly goals are counted rather than slotted.
- **Schedule changes start a new version** of the goal from today (`starts_on` / `ends_on` / `previous_goal_id`), so past weeks keep the plan that applied then.
- A reminder linked to a goal follows the goal's time and days. Moving the reminder moves the goal. Moving one session ("just today") also moves that day's reminder call.
- **Progress** (`/progress`) lists weeks by category with done, not done and postponed. Patterns and plan changes say where they came from, e.g. "Based on the conversation with Natalie on Wednesday 7:00 pm".

## Location, timezone and conversation summaries

- During onboarding the browser's location (rounded to about 1 km) is turned into a timezone and country offline with `geo-tz`. Only the timezone and country are stored, never coordinates. Declining uses the device timezone. Changing it moves all reminders to the new zone.
- **Conversation summaries** are opt-in (`conversation_summaries` consent). When a call ends, the transcript (kept only in the browser tab or the phone server's memory) is sent once to a small model with the recorded actions, and only the summary is stored. Sarah's part is replaced by "You had a private chat with Sarah" unless the person opts in. Summaries are only shown to the person, never to companions or clinicians, and can be deleted.

## Health, wellbeing and care sharing

- **Other check-ins** (`habit_events`, under Goals → Other check-ins) are always `patient_reported` with a certainty level; numbers are stored only when the person gave one. A correction is a new row (`corrected_from`), and the original is kept but superseded. Logging requires the `health_data_processing` consent.
- **Iris** (`lib/insights/iris.ts`) is deterministic, not generative: weekly goal counts, reported averages, co-occurring reports labelled as hypotheses, and missing data. Every statement lists its source record ids.
- **Theo** plan changes are stored as `plan_proposals` and applied only through `confirm_action`; clinician-approved goals can't be changed.
- **Sarah's notes** (`wellbeing_notes`) need the `sensitive_wellbeing` consent, are readable only by Sarah's tools and the person, expire after 30 days, and are never included in reports.
- **Clara reports** are built from Iris output for the scopes the person picks. Sharing is per report and per clinician, each with its own consent record; revoking removes access immediately. Clinicians see a report only through an active share and an active care relationship. Every view is audited, and "reviewed" is only set by the clinician.
- **Privacy & data:** per-purpose permissions, note deletion, JSON export (`/api/me/export`) and permanent account deletion (everything cascades from the auth identity).

## Known MVP shortcuts

- **Database location:** the Supabase project is in Seoul. From Adelaide each query takes about 260 ms, so actions that make many queries (e.g. moving a goal-linked reminder, about 20 round trips) take 5–10 s. Moving the project to Sydney should bring these under a second.

- **Email:** uses Supabase's built-in email service (only delivers to Supabase team members, heavily rate-limited). Production needs custom SMTP (e.g. Resend) with a verified domain — a Supabase settings change only.
- **Safety contacts** in `lib/safety/contacts.ts` are placeholders pending clinical and legal review.
