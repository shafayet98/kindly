# Deploying Kindly

Kindly runs as two services that share one Supabase Postgres database:

| Service | What it does | Where |
|---|---|---|
| **Web app** (Next.js) | Pages, sign-in, browser voice sessions, all patient and clinician screens | Vercel |
| **Realtime server** (`realtime-server/`) | Twilio webhooks, phone audio bridge (WebSocket), call scheduler, data-retention jobs | Railway (needs a long-running process; serverless can't hold WebSockets or run the scheduler) |

## 1. Supabase

1. **Authentication → URL Configuration:** set **Site URL** to the production web address (e.g. `https://kindly-xyz.vercel.app`) and add `https://kindly-xyz.vercel.app/**` to **Redirect URLs**. Keep the localhost entries for development.
2. **Email:** the built-in email service only delivers to Supabase team members and is heavily rate-limited. For real public sign-ups, set up custom SMTP (e.g. Resend) with a verified domain under **Authentication → Emails → SMTP Settings**. No code change is needed.
3. Run migrations once: `pnpm db:migrate`, and optionally `pnpm demo:reset` for the fictional demo accounts.

## 2. Web app on Vercel

1. Import the GitHub repo in Vercel. The framework is detected as Next.js.
2. **Environment variables:**

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key |
   | `SUPABASE_SECRET_KEY` | Secret key (used for account deletion only) |
   | `DATABASE_URL` | **Transaction pooler** connection string (port **6543**) |
   | `OPENAI_API_KEY` | OpenAI key (used to mint 60-second browser voice secrets) |
   | `NEXT_PUBLIC_SITE_URL` | The production URL, e.g. `https://kindly-xyz.vercel.app` |

3. **Region:** `vercel.json` pins functions to `icn1` (Seoul) to sit next to the current Supabase project. If the database moves to Sydney, change it to `syd1`.

## 3. Realtime server on Railway

1. New project → **Deploy from GitHub repo**. `railway.json` sets the start command (`pnpm realtime`) and health check (`/health`).
2. **Settings → Networking → Generate Domain** to get a public `https://…up.railway.app` address.
3. **Region:** Southeast Asia (Singapore) is closest to both the database and Australian callers.
4. **Environment variables:**

   | Name | Value |
   |---|---|
   | `NODE_ENV` | `production` (disables the dev-only `/dev/call-me` endpoint) |
   | `PUBLIC_BASE_URL` | The Railway domain, `https://…` (must be https) |
   | `DATABASE_URL` | **Session pooler** connection string (port 5432) |
   | `OPENAI_API_KEY` | OpenAI key |
   | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | From the Twilio console |
   | `DEMO_CALL_TO_NUMBER` | The verified demo mobile (still required by config) |
   | `DEV_ADMIN_TOKEN` | Any random 32+ character string (still required by config) |
   | `SCHEDULER_ENABLED` | `true`, so the server places scheduled and "call me now" calls |
   | `CALLS_MAX_PER_HOUR` | Optional service-wide cap (default 20) |

Run **exactly one** scheduler in production (one Railway replica, or `SCHEDULER_ENABLED=true` on only one). Claims are race-safe, but one is simpler to reason about.

## 4. Twilio

- **Upgrade the account** before any demo. Trial calls start with a Twilio announcement and can only reach verified numbers.
- **Voice → Settings → Geo permissions:** enable every destination country you will call.
- Nothing needs configuring on the phone number itself: each call tells Twilio which webhook to use (`PUBLIC_BASE_URL/twilio/voice`), and every webhook is signature-checked.

## 5. Check it works

1. `https://<railway-domain>/health` returns `{"ok":true}`.
2. Sign in to the web app as a patient with phone calls turned on → **Reminders & calls → Call me now**. The phone should ring within about 10 seconds, and the call appears under **Recent calls**.
3. Add a phone reminder 3 minutes ahead, close the browser, and wait for the call.

## Security notes

- Secrets live only in server environment variables. A production build was scanned and contains none of them; only the Supabase URL and publishable key reach the browser.
- Every table has row-level security with no policies, so the Supabase Data API exposes nothing. All data access is server-side with ownership checks.
- Real patient data needs a separate governance review (hosting region, health-data rules, telecom rules). This deployment is for fictional data only.
