# Demo runbook (about 5 minutes)

Uses fictional data only. Follows the spec's demo script (§11).

## The day before

- [ ] Twilio account **upgraded** (no trial announcement); Australia enabled in Geo permissions.
- [ ] Web app and realtime server deployed (see `DEPLOYMENT.md`), `/health` OK.
- [ ] `pnpm demo:reset` against the production database.
- [ ] The demo patient (`demo.patient@example.com`) has phone calls on with your verified mobile. `demo:reset` sets this from `DEMO_CALL_TO_NUMBER`.
- [ ] Do one full rehearsal, including a real scheduled call with the browser closed. **Screen-record it** as the labelled backup video.
- [ ] Check OpenAI credit and Twilio balance.

## 30 minutes before

- [ ] `pnpm demo:reset` again for a clean state.
- [ ] Open the Supabase dashboard so the free project is awake.
- [ ] Sign in, in separate browser profiles: demo patient (Alex) and demo clinician (`demo.clinician@example.com`).
- [ ] Phone charged, ringer on, Do Not Disturb off.

## Script

1. **Sign-up and the home page (≈50s).** Show the public landing page. Sign up a new account (or show one made earlier): name, **Use my location** (sets the timezone and country, never stored), privacy choices, and a first goal typed in plain words, e.g. "walk 3 days a week" (the category is chosen automatically). Then show Alex's home page: **Talk now / Progress**, the **weekly calendar** (tap a session: details, mark done, move just once), and the companions.
2. **Schedule a real call (≈30s).** As Alex: **Reminders → Add a reminder**, "Evening walk", time **2–3 minutes from now**, today ticked, **A phone call from Milo**. Point out quiet hours, pause and the consent wording. **Close the browser.**
3. **The phone rings (≈20s).** Answer on camera: Milo greets you about the walk. Optionally show the Railway log or the **Recent calls** status as evidence.
4. **"Can you transfer me to Natalie?"** Natalie answers on the same call.
5. **"I'm tired this morning. Can we move my morning walk to 5 PM from now on?"** Natalie reads the change back and asks to confirm. Say **"Yes."** She confirms only after it's saved. (Say "just today" instead and she moves only today's session.)
6. **New goal.** "I'd like to start doing 30 push-ups twice a week." Natalie picks the Workout category, reads it back, and adds it after your yes. It appears on the calendar.
7. **"I'd like to talk with Sarah."** Sarah takes over on the same call. Mention that what you tell her is private by default and her context starts fresh. Hang up.
8. **Back in the app (≈60s).** Reopen the browser:
   - **Home calendar:** from now on the walks are at 5:00 PM (past weeks keep their real history).
   - **Reminders:** "Your Daily Reminders" shows the walk call at 5:00 PM and the timezone and country.
   - **Settings → Conversation activity:** the AI summary of the call (only the person sees it; Sarah's part stays private) and the timeline of handoffs and saved changes.
   - **Progress:** open a week to see each session by category (done, not done, postponed). Show a *pattern worth a chat* ("Based on the conversation with Natalie on Wednesday 7:00 pm") and the plan change with the person's own words.
9. **Clinician (≈45s).** **Care sharing → Prepare a preview**: show the "Not included" list (Sarah's conversations), tick the consent box, **Share report**. Switch to the clinician profile: the patient appears with one shared report; open it and **Mark as reviewed**. Back as Alex, **Revoke access** and show the clinician can no longer open it.
10. **If there's time:** **Talk now** in the browser (same agents and handoffs), and the **I'm feeling unwell** page (non-diagnostic, 000 guidance).

## If something fails

- **Phone call doesn't arrive:** check **Recent calls**. *Skipped* shows the reason (quiet hours, paused, daily limit) and *Failed* the Twilio error. Use **Call me now** as a quick retry, or play the recorded backup video, labelled as a recording.
- **Voice is slow or drops:** switch to **Talk now** in the browser with the same scenario.
- **Data looks wrong:** `pnpm demo:reset` takes about 15 seconds.
