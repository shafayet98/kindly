import { AddGoal } from "@/components/goals/add-goal";
import { LocationPicker } from "@/components/location-picker";
import { SubmitButton } from "@/components/ui/submit-button";
import { finishOnboarding, goBack, locationDone, savePrivacy, saveName } from "./actions";

export function NameStep({ nickname }: { nickname: string | null }) {
  return (
    <form action={saveName} className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Welcome to Kindly</h1>
        <p className="mt-1 text-muted">A team of AI companions who help you keep small, healthy habits.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="nickname" className="font-semibold">
          What should we call you? <span className="font-normal text-muted">(optional)</span>
        </label>
        <input id="nickname" name="nickname" maxLength={40} autoComplete="given-name" defaultValue={nickname ?? ""} className="rounded-xl border border-border bg-surface px-4 py-3 sm:max-w-xs" />
      </div>
      <SubmitButton className="self-start">Continue</SubmitButton>
    </form>
  );
}

export function LocationStep() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Where are you?</h1>
        <p className="mt-1 text-muted">
          So reminders and calls happen at the right local time. Your location is only used to find your timezone and
          country; Kindly doesn&apos;t keep it.
        </p>
      </div>
      <LocationPicker onSaved={locationDone} skipLabel="No thanks, use this device's timezone" />
      <BackButton to="name" />
    </div>
  );
}

export function PrivacyStep() {
  return (
    <div className="flex flex-col gap-6">
      <form action={savePrivacy} className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Your privacy choices</h1>
          <p className="mt-1 text-muted">Nothing is switched on unless you tick it. You can change this later in Settings.</p>
        </div>
        <fieldset className="flex flex-col gap-3">
          <legend className="sr-only">Permissions</legend>
          <ConsentOption name="health_data_processing" title="Remember my check-ins" description="Lets Kindly save what you tell it about activity, food, sleep and smoking, so it can track your progress." />
          <ConsentOption name="browser_voice" title="Talk to Kindly in this browser" description="Uses your microphone only while you're in a call. Audio isn't recorded." />
          <ConsentOption
            name="conversation_summaries"
            title="Keep a short summary of each conversation"
            description="Written by AI when a call ends, only for you. The words themselves aren't stored. Chats with Sarah are left out unless you choose otherwise."
          />
        </fieldset>
        <div className="rounded-2xl bg-accent-soft p-4 text-sm">
          <p className="font-semibold">Set up separately, only if you want them</p>
          <ul className="mt-1 list-disc pl-5">
            <li>Phone calls from Kindly: in Reminders, with your number and quiet hours.</li>
            <li>Sharing summaries with a clinician: in Care sharing, one report at a time.</li>
          </ul>
        </div>
        <SubmitButton className="self-start">Continue</SubmitButton>
      </form>
      <BackButton to="location" />
    </div>
  );
}

export function GoalStep({ phoneCallsOn }: { phoneCallsOn: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Want to start with one small goal?</h1>
        <p className="mt-1 text-muted">Optional. Type it in your own words; you can add more any time, or just tell Natalie.</p>
      </div>
      <AddGoal phoneCallsOn={phoneCallsOn} />
      <form action={finishOnboarding}>
        <SubmitButton className="self-start">Finish and go to my dashboard</SubmitButton>
      </form>
      <BackButton to="privacy" />
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

function BackButton({ to }: { to: "name" | "location" | "privacy" }) {
  return (
    <form action={goBack}>
      <input type="hidden" name="to" value={to} />
      <SubmitButton variant="ghost">← Back</SubmitButton>
    </form>
  );
}
