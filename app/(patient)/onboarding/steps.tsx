import { AddGoal } from "@/components/goals/add-goal";
import { Icon } from "@/components/kindly/icon";
import { OptionCard } from "@/components/kindly/option-card";
import { LocationPicker } from "@/components/location-picker";
import { SubmitButton } from "@/components/ui/submit-button";
import { finishOnboarding, locationDone, savePrivacy, saveName } from "./actions";

export function NameStep({ nickname }: { nickname: string | null }) {
  return (
    <div className="stack-32">
      <div className="stack">
        <h1 className="headline">Welcome to Kindly</h1>
        <p className="body-lg muted">A team of AI companions who help you keep small, healthy habits.</p>
      </div>
      <form action={saveName} className="stack-24" style={{ maxWidth: 440 }}>
        <div className="field">
          <label className="field__label" htmlFor="nickname">
            What should we call you? <span className="field__opt">(optional)</span>
          </label>
          <input className="input" id="nickname" name="nickname" maxLength={40} autoComplete="given-name" defaultValue={nickname ?? ""} aria-describedby="nickname-hint" />
          <p className="field__hint" id="nickname-hint">
            Natalie, Milo and Sarah will use this name.
          </p>
        </div>
        <div className="onb__actions" style={{ marginTop: 8 }}>
          <SubmitButton size="lg">
            Continue <Icon name="arrow-right" />
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}

export function LocationStep() {
  return (
    <div className="stack-32">
      <div className="stack">
        <h1 className="headline">Where are you?</h1>
        <p className="body-lg muted">So reminders and calls happen at the right local time.</p>
      </div>
      <div className="notice notice--info">
        <Icon name="pin" />
        <p>Your location is only used to find your timezone and country; Kindly doesn&apos;t keep it.</p>
      </div>
      <LocationPicker layout="cards" onSaved={locationDone} />
    </div>
  );
}

const PRIVACY = [
  { name: "health_data_processing", title: "Remember my check-ins", desc: "Lets Kindly save what you tell it about activity, food, sleep and smoking, so it can track your progress." },
  { name: "browser_voice", title: "Talk to Kindly in this browser", desc: "Uses your microphone only while you're in a call. Audio isn't recorded." },
  {
    name: "conversation_summaries",
    title: "Keep a short summary of each conversation",
    desc: "Written by AI when a call ends, only for you. The words themselves aren't stored. Chats with Sarah are left out unless you choose otherwise.",
  },
];

export function PrivacyStep() {
  return (
    <form action={savePrivacy} className="stack-32">
      <div className="stack">
        <h1 className="headline">Your privacy choices</h1>
        <p className="body-lg muted">Nothing is switched on unless you tick it. You can change this later in Settings.</p>
      </div>
      <fieldset className="fieldset">
        <legend className="sr-only">Permissions, all off by default</legend>
        <div className="options">
          {PRIVACY.map((option) => (
            <OptionCard key={option.name} name={option.name} title={option.title} desc={option.desc} />
          ))}
        </div>
      </fieldset>
      <div className="card card--sunken" style={{ borderRadius: "var(--bubble)" }}>
        <p style={{ fontWeight: 600, marginBottom: 10 }}>Set up separately, only if you want them</p>
        <ul style={{ display: "grid", gap: 10 }}>
          <li className="row nowrap top">
            <Icon name="phone" />
            <span>Phone calls from Kindly: in Reminders, with your number and quiet hours.</span>
          </li>
          <li className="row nowrap top">
            <Icon name="users" />
            <span>Sharing summaries with a clinician: in Care sharing, one report at a time.</span>
          </li>
        </ul>
      </div>
      <div className="onb__actions">
        <SubmitButton size="lg">
          Continue <Icon name="arrow-right" />
        </SubmitButton>
      </div>
    </form>
  );
}

export function GoalStep({ phoneCallsOn }: { phoneCallsOn: boolean }) {
  return (
    <div className="stack-32">
      <div className="stack">
        <h1 className="headline">Want to start with one small goal?</h1>
        <p className="body-lg muted">Optional. Type it in your own words; you can add more any time, or just tell Natalie.</p>
      </div>
      <AddGoal phoneCallsOn={phoneCallsOn} idPrefix="onb" />
      <hr className="divider" style={{ margin: "40px 0 24px" }} />
      <form action={finishOnboarding} className="row" style={{ gap: 16 }}>
        <SubmitButton variant="ghost" size="lg">
          Finish and go to my dashboard
        </SubmitButton>
        <p className="muted small">You can add goals any time, or just tell Natalie.</p>
      </form>
    </div>
  );
}
