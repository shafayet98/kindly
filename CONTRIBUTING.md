# Contributing to Kindly

Thanks for helping. Kindly is a hackathon prototype, but it is **live**: real people can sign up, and the phone server places real phone calls that cost money. Please read the [ground rules](#ground-rules) before running anything.

How the app works is in the [README](README.md); hosting is in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Ground rules

1. **Fictional data only.** No real patient or health information, ever. Demo accounts use made-up people.
2. **No real phone numbers except your own.** In tests, scripts, seed data, screenshots and docs, use only the [ACMA's fiction numbers](https://www.acma.gov.au/phone-numbers-use-tv-shows-films-and-creative-works) (for example `0491 570 006`). They are never allocated, so they can't ring anyone. The phone server refuses to dial them.
3. **Never run tests against the live database.** Browser tests and `scheduler:check` use a separate test Supabase project (`.env.test`) and refuse to start without one. The live phone server dials every call it finds in the live database, so a test there can ring a stranger. That happened once, which is why these guards exist.
4. **Don't run a second call scheduler.** The scheduler runs on Railway. Don't run `pnpm dev:phone` or set `SCHEDULER_ENABLED=true` against the live database.
5. **Secrets stay in `.env` files.** Never commit them or paste them into issues, PRs or chat. If one leaks, tell the project owner straight away so it can be rotated.
6. **If something looks like a security or privacy problem, stop and tell the owner** before changing anything else.

## Getting set up

### 1. Accounts and keys

Ask the project owner to:

- **OpenAI:** invite you to the organisation. Create your own project key with a monthly spend limit.
- **Supabase:** invite you to the organisation. You get the live project's keys from the dashboard (Project Settings → API keys and Database → Connect), and you can create your test project there. Supabase's built-in email only delivers to team members.
- **Twilio:** you don't need it for normal work. If you do, the owner shares it through a password manager, never in chat.

### 2. Your `.env` (the live project)

```bash
pnpm install
cp .env.example .env   # fill in your keys
pnpm dev               # http://localhost:3000
```

`pnpm dev` uses the **live** database, so use your own account and the demo accounts only. `DEV_ADMIN_TOKEN` and `DEMO_PASSWORD` are local values you choose. Set `DEMO_CALL_TO_NUMBER` to a fiction number unless you are the one doing real phone tests.

### 3. Your test project (`.env.test`)

1. In Supabase, create a new free project (region **Sydney**).
2. **Authentication → Sign In / Providers:** Email on, *Confirm email* **off**.
3. **Authentication → URL Configuration:** Site URL `http://localhost:3000`, redirect URL `http://localhost:3000/**`.
4. Copy the template and fill in the test project's values:

   ```bash
   cp .env.test.example .env.test
   ```

   Everything not listed there (OpenAI key and so on) comes from `.env`.
5. Create the tables and the demo data in the test project:

   ```bash
   pnpm test:db:migrate
   pnpm test:db:reset
   ```

The tests check that `.env.test` doesn't point at the same project as `.env`, and that the demo patient's number is a fiction number.

## Running checks

| Command | Database | Notes |
|---|---|---|
| `pnpm lint` · `pnpm typecheck` · `pnpm test` | none | Run in CI on every PR. Always run before pushing. |
| `pnpm test:e2e` | test | Browser tests. Starts its own dev server, so stop `pnpm dev` first. Resets the test project's demo data. |
| `pnpm scheduler:check` | test | Call scheduler with a fake Twilio client. Never dials. |
| `pnpm phone:smoke` | live demo patient | Simulated Twilio media stream against the real OpenAI model (a few cents). Records a test call session. Never dials. |
| `pnpm voice:smoke` · `voice:smoke:health` · `safety:smoke` · `summary:smoke` | live demo accounts | Real OpenAI calls (a few cents each). They change the demo patient's data, so run `pnpm demo:reset` afterwards. Prefix with `KINDLY_ENV=test` to run them on the test project instead. |
| `pnpm demo:reset` | live | Recreates the live demo accounts. Only when you mean to. |

To try real phone calls, use the live site (https://kindly-six-delta.vercel.app) with your own account and your own mobile: **Reminders & calls → Call me now**.

## Making a change

1. **Branch** from an up-to-date `main`: `fix/…`, `feat/…` or `chore/…`.
2. **Commit** in small steps. The first line says what changes for the person using Kindly; the body says why.
3. **Open a pull request** with what changed, why, and how you checked it (which tests you ran, what you tried by hand).
4. **CI must be green** (lint, typecheck, unit tests). Run `pnpm test:e2e` locally for anything touching pages, goals, reminders or calls.
5. **Squash-merge** into `main`, then delete the branch.

**Merging to `main` deploys straight away.** Vercel rebuilds the website and Railway restarts the phone server, so never merge something you haven't checked. Pull request branches aren't deployed.

### Database changes

1. Edit `lib/db/schema.ts`, then run `pnpm db:generate` and commit the new file in `drizzle/`.
2. Apply it to your test project with `pnpm test:db:migrate`, and test.
3. Migrations are **not** applied automatically on deploy. Agree with the owner who runs `pnpm db:migrate` on the live database, and when (usually just before merging). Changes must work with the code that is already live, because the two deploys don't happen at the same moment.

## How the code is meant to work

The [README](README.md) explains the architecture. When you add something, keep these properties:

- **Data access is server-side only.** Every table has row-level security on with no policies, so the browser can't read anything directly. Pages, server actions and API routes load data through `lib/` with the signed-in user's id (`requirePatient`, `requireOnboardedPatient`, `requireApprovedClinician`).
- **The user id never comes from the browser or the AI.** It comes from the session cookie or the server-issued call token. Every query is scoped to it.
- **Companion tools:** add the spec in `lib/agents/tools/specs.ts`, the handler in `handlers.ts`, and the companion to its allowlist. Handlers run only through `runTool`, which checks the allowlist and validates input with zod.
- **Anything that changes a person's plan or calls is two-step.** Propose (`proposeAction`, which stores it in `action_confirmations`), read it back, then `confirm_action`. Reminder and call work belongs to Milo's services (`lib/reminders`, `lib/scheduling`), and goal and plan work to Theo's (`lib/goals`, `lib/plans`). Other companions call those services, so the rules live in one place.
- **Consent is checked when it matters**, from the `consents` table: calls, browser voice, health data, wellbeing notes, summaries and sharing each have their own purpose.
- **Store facts, not conversations.** No audio, no transcripts. Structured events go in `agent_events`; summaries are opt-in.
- **Secrets stay on the server.** Only `NEXT_PUBLIC_*` values reach the browser, and those must be safe to publish.
- **Sarah is private.** Her notes never reach other companions, reports or clinicians, and handoffs into or out of Sarah prune the earlier conversation.

## Style

- Match the code around you: naming, comment density and idioms. Comments explain *why*, not *what*.
- Copy is plain English, in short sentences. Describe progress without judging it ("3 of 5 walks this week", "Not done yet"). Red is only for danger. Never claim a health outcome.
- Accessibility: body text at least 17 px, tap targets at least 48 px, a visible focus ring, and statuses that use a word and an icon, not just colour.
- Use the design system in `app/globals.css` and `components/kindly/`. Don't add new colours or fonts.
