import { SubmitButton } from "@/components/ui/submit-button";
import { FOCUS_AREAS, type FocusAreaKey } from "@/lib/preferences/focus-areas";
import type { GoalSuggestion } from "@/lib/preferences/suggestions";
import { finishOnboarding, goBack, saveFocusAreasStep, saveGoalStep } from "./actions";

export function FocusAreasStep({ selected, nickname }: { selected: FocusAreaKey[]; nickname: string | null }) {
  return (
    <form action={saveFocusAreasStep} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="nickname" className="font-semibold">
          What should we call you? <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id="nickname"
          name="nickname"
          maxLength={40}
          autoComplete="given-name"
          defaultValue={nickname ?? ""}
          className="rounded-xl border border-border bg-surface px-4 py-3 sm:max-w-xs"
        />
      </div>
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1">
          <h1 className="text-2xl font-bold sm:text-3xl">What would you like Kindly to help you with?</h1>
          <p className="mt-1 text-muted">Choose as many as you like, or skip. You can change these any time.</p>
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {FOCUS_AREAS.map((area) => (
            <label
              key={area.key}
              className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-border bg-surface p-4 transition-colors hover:border-primary/40 has-checked:border-primary has-checked:bg-primary-soft has-focus-visible:outline-3 has-focus-visible:outline-focus"
            >
              <input
                type="checkbox"
                name="area"
                value={area.key}
                defaultChecked={selected.includes(area.key)}
                className="mt-1 h-5 w-5 shrink-0 accent-primary"
              />
              <span>
                <span className="block font-bold">{area.title}</span>
                <span className="block text-sm text-muted">{area.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="text-sm text-muted">
        These choices only decide what we suggest first. They don&apos;t sign you up for calls or share anything.
      </p>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <SubmitButton name="intent" value="skip" variant="ghost">
          Skip for now
        </SubmitButton>
        <SubmitButton name="intent" value="continue">
          Continue
        </SubmitButton>
      </div>
    </form>
  );
}

export function GoalStep({ suggestions }: { suggestions: GoalSuggestion[] }) {
  return (
    <div className="flex flex-col gap-6">
      <form action={saveGoalStep} className="flex flex-col gap-6">
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1">
            <h1 className="text-2xl font-bold sm:text-3xl">Want to start with one small goal?</h1>
            <p className="mt-1 text-muted">Optional. You can add or change goals whenever you like.</p>
          </legend>
          {suggestions.map((goal) => (
            <label
              key={goal.title}
              className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-border bg-surface p-4 has-checked:border-primary has-checked:bg-primary-soft"
            >
              <input type="radio" name="goal" value={goal.title} className="h-5 w-5 accent-primary" />
              <span className="font-semibold">{goal.title}</span>
            </label>
          ))}
          <label className="flex cursor-pointer flex-col gap-3 rounded-2xl border-2 border-border bg-surface p-4 has-checked:border-primary has-checked:bg-primary-soft">
            <span className="flex items-center gap-3">
              <input type="radio" name="goal" value="custom" className="h-5 w-5 accent-primary" />
              <span className="font-semibold">Something else</span>
            </span>
            <input
              type="text"
              name="customGoal"
              maxLength={120}
              aria-label="Describe your goal"
              placeholder="e.g. Drink water with every meal"
              className="rounded-xl border border-border px-4 py-2"
            />
          </label>
        </fieldset>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <SubmitButton name="intent" value="skip" variant="ghost">
            Skip for now
          </SubmitButton>
          <SubmitButton name="intent" value="continue">
            Continue
          </SubmitButton>
        </div>
      </form>
      <BackButton to="focus_areas" />
    </div>
  );
}

export function PrivacyStep() {
  return (
    <div className="flex flex-col gap-6">
      <form action={finishOnboarding} className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Your privacy choices</h1>
          <p className="mt-1 text-muted">Nothing is switched on unless you tick it. You can change this later in Settings.</p>
        </div>
        <fieldset className="flex flex-col gap-3">
          <legend className="sr-only">Permissions</legend>
          <ConsentOption
            name="health_data_processing"
            title="Remember my habit check-ins"
            description="Lets Kindly save what you tell it about activity, food, sleep and smoking so it can track your progress."
          />
          <ConsentOption
            name="browser_voice"
            title="Talk to Kindly in this browser"
            description="Uses your microphone only while you're in a call. Audio isn't recorded."
          />
        </fieldset>
        <div className="rounded-2xl bg-accent-soft p-4 text-sm">
          <p className="font-semibold">Set up separately, only if you want them</p>
          <ul className="mt-1 list-disc pl-5">
            <li>Phone calls from Kindly: in Schedule, with your number and quiet hours.</li>
            <li>Sharing summaries with a clinician: in Care sharing, one report at a time.</li>
            <li>Your wellbeing chats with Sarah stay private by default.</li>
          </ul>
        </div>
        <div className="flex justify-end">
          <SubmitButton>Finish and go to my dashboard</SubmitButton>
        </div>
      </form>
      <BackButton to="goal" />
    </div>
  );
}

function ConsentOption({ name, title, description }: { name: string; title: string; description: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-border bg-surface p-4 has-checked:border-primary has-checked:bg-primary-soft">
      <input type="checkbox" name={name} className="mt-1 h-5 w-5 shrink-0 accent-primary" />
      <span>
        <span className="block font-bold">{title}</span>
        <span className="block text-sm text-muted">{description}</span>
      </span>
    </label>
  );
}

function BackButton({ to }: { to: "focus_areas" | "goal" }) {
  return (
    <form action={goBack}>
      <input type="hidden" name="to" value={to} />
      <SubmitButton variant="ghost">
        ← Back
      </SubmitButton>
    </form>
  );
}
