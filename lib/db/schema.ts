import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgSchema,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Every table enables RLS without policies: the Supabase Data API (publishable key + user JWT)
// can read nothing. All access goes through server code that checks ownership explicitly.

// Supabase-managed identities. Not exported, so drizzle-kit never tries to create or alter it.
const authUsers = pgSchema("auth").table("users", { id: uuid("id").primaryKey() });

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ---------- Enums ----------

export const userRole = pgEnum("user_role", ["patient", "clinician"]);

export const consentPurpose = pgEnum("consent_purpose", [
  "browser_voice",
  "outbound_calls",
  "health_data_processing",
  "sensitive_wellbeing",
  "clinician_sharing",
  "conversation_summaries",
]);
export const consentStatus = pgEnum("consent_status", ["granted", "revoked"]);

export const invitationStatus = pgEnum("invitation_status", ["pending", "approved", "revoked", "expired"]);
export const relationshipStatus = pgEnum("relationship_status", ["pending", "active", "revoked"]);

export const goalStatus = pgEnum("goal_status", ["active", "paused", "completed", "archived"]);
export const goalCategory = pgEnum("goal_category", ["walk", "workout", "medication", "sleep", "food_drink", "smoking", "mindfulness", "other"]);
export const goalCadence = pgEnum("goal_cadence", ["daily", "weekly", "monthly"]);
export const goalSessionStatus = pgEnum("goal_session_status", ["planned", "done", "postponed"]);

export const habitKind = pgEnum("habit_kind", ["activity", "food", "smoking", "sleep", "mood", "other"]);
export const dataSource = pgEnum("data_source", ["patient_reported", "clinician_entered", "system"]);
export const certainty = pgEnum("certainty", ["low", "medium", "high"]);

export const reminderChannel = pgEnum("reminder_channel", ["in_app", "phone"]);
export const reminderStatus = pgEnum("reminder_status", ["active", "paused", "cancelled"]);

export const callJobStatus = pgEnum("call_job_status", [
  "scheduled",
  "dialing",
  "ringing",
  "in_progress",
  "completed",
  "no_answer",
  "busy",
  "failed",
  "cancelled",
  "skipped",
]);
export const callJobKind = pgEnum("call_job_kind", ["reminder", "on_demand"]);
export const confirmationStatus = pgEnum("confirmation_status", ["pending", "executed", "expired", "rejected"]);
export const sessionChannel = pgEnum("session_channel", ["browser", "phone"]);
export const sessionState = pgEnum("session_state", ["connecting", "active", "ending", "ended"]);
export const agentName = pgEnum("agent_name", ["natalie", "milo", "sarah", "theo", "iris", "clara"]);

export const noteVisibility = pgEnum("note_visibility", ["private", "shared_with_care_team"]);
export const proposalStatus = pgEnum("proposal_status", ["proposed", "accepted", "rejected", "executed"]);
export const reportStatus = pgEnum("report_status", ["draft", "approved", "shared", "revoked"]);

export const actorType = pgEnum("actor_type", ["patient", "clinician", "agent", "system", "admin"]);
export const auditResult = pgEnum("audit_result", ["success", "denied", "failed"]);

// ---------- Identity and roles ----------

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authUserId: uuid("auth_user_id")
      .notNull()
      .unique()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    // Changed only by trusted server code (clinician approval), never from user input.
    role: userRole("role").notNull().default("patient"),
    displayName: text("display_name"),
    timezone: text("timezone").notNull().default("Australia/Adelaide"),
    preferredLanguage: text("preferred_language").notNull().default("en"),
    // ISO 3166 country code derived from the person's location or timezone. Never coordinates.
    countryCode: text("country_code"),
    timezoneSource: text("timezone_source"), // "location" | "device"
    // Collected later, only for consented outbound calls. Not an auth factor.
    phoneE164: text("phone_e164"),
    phoneConfirmedAt: timestamp("phone_confirmed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("phone_e164_format", sql`${t.phoneE164} is null or ${t.phoneE164} ~ '^\\+[1-9][0-9]{6,14}$'`)],
).enableRLS();

export const clinicianInvitations = pgTable(
  "clinician_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invitedEmail: text("invited_email").notNull(),
    status: invitationStatus("status").notNull().default("pending"),
    approvedBy: text("approved_by"),
    credentialVerifiedAt: timestamp("credential_verified_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedUserId: uuid("accepted_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("clinician_invitations_email_idx").on(sql`lower(${t.invitedEmail})`)],
).enableRLS();

export const patientProfiles = pgTable("patient_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  nickname: text("nickname"),
  preferences: jsonb("preferences").$type<Record<string, unknown>>().notNull().default({}),
  // Where an unfinished onboarding resumes. Null once completed.
  onboardingStep: text("onboarding_step").default("name"),
  // Set when onboarding finishes, including when every step was skipped.
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}).enableRLS();

// ---------- Consent and care relationships ----------

export const consents = pgTable(
  "consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: consentPurpose("purpose").notNull(),
    scope: jsonb("scope").$type<Record<string, unknown>>().notNull().default({}),
    status: consentStatus("status").notNull().default("granted"),
    termsVersion: text("terms_version").notNull().default("mvp-1"),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("consents_user_purpose_idx").on(t.userId, t.purpose)],
).enableRLS();

export const clinicianRelationships = pgTable(
  "clinician_relationships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clinicianId: uuid("clinician_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: relationshipStatus("status").notNull().default("pending"),
    consentId: uuid("consent_id").references(() => consents.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("clinician_relationships_pair_idx").on(t.patientId, t.clinicianId)],
).enableRLS();

// ---------- Goals, habits and reminders ----------

export const goals = pgTable(
  "goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    category: goalCategory("category").notNull().default("other"),
    cadence: goalCadence("cadence").notNull().default("weekly"),
    // How many times per day / week / month.
    targetCount: smallint("target_count").notNull().default(1),
    // Planned days (0 = Sunday). Null means any day: a flexible "N times a week" goal.
    daysOfWeek: smallint("days_of_week").array(),
    // Planned local times "HH:MM". Empty means any time of day.
    times: text("times").array().notNull().default(sql`'{}'`),
    durationMinutes: smallint("duration_minutes"),
    notes: text("notes"),
    // A schedule change creates a new version: the old row ends, the new one starts, so past
    // weeks keep the plan that applied at the time.
    startsOn: date("starts_on", { mode: "string" }).notNull().default(sql`current_date`),
    endsOn: date("ends_on", { mode: "string" }),
    previousGoalId: uuid("previous_goal_id").references((): AnyPgColumn => goals.id, { onDelete: "set null" }),
    createdByAgent: agentName("created_by_agent"),
    createdInSessionId: uuid("created_in_session_id").references((): AnyPgColumn => callSessions.id, { onDelete: "set null" }),
    status: goalStatus("status").notNull().default("active"),
    // Set only for clinician-approved plans; self-chosen goals leave it null.
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    planVersion: integer("plan_version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("goals_user_idx").on(t.userId)],
).enableRLS();

export const habitEvents = pgTable(
  "habit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    goalId: uuid("goal_id").references(() => goals.id, { onDelete: "set null" }),
    kind: habitKind("kind").notNull(),
    // Normalised fact where the person gave one; never invented from vague descriptions.
    value: numeric("value"),
    unit: text("unit"),
    // The person's own wording, kept when permitted.
    description: text("description"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    source: dataSource("source").notNull().default("patient_reported"),
    certainty: certainty("certainty").notNull().default("medium"),
    recordedByAgent: agentName("recorded_by_agent"),
    sessionId: uuid("session_id").references((): AnyPgColumn => callSessions.id, { onDelete: "set null" }),
    // A correction is a new row pointing at the row it replaces; the old row gets superseded_at.
    correctedFrom: uuid("corrected_from").references((): AnyPgColumn => habitEvents.id, { onDelete: "set null" }),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("habit_events_user_time_idx").on(t.userId, t.occurredAt)],
).enableRLS();

export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    goalId: uuid("goal_id").references(() => goals.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    // Wall-clock time in `timezone`, "HH:MM". Kept local so DST shifts keep the intended time.
    localTime: text("local_time").notNull(),
    // 0 = Sunday … 6 = Saturday.
    daysOfWeek: smallint("days_of_week").array().notNull().default(sql`'{0,1,2,3,4,5,6}'`),
    timezone: text("timezone").notNull(),
    channel: reminderChannel("channel").notNull().default("in_app"),
    status: reminderStatus("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("reminders_user_idx").on(t.userId),
    check("reminders_local_time_format", sql`${t.localTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
  ],
).enableRLS();

export const callPreferences = pgTable("call_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  // Separate from the outbound_calls consent record: this is the on/off switch and pause.
  callsEnabled: boolean("calls_enabled").notNull().default(false),
  pausedAt: timestamp("paused_at", { withTimezone: true }),
  quietHoursStart: text("quiet_hours_start").notNull().default("21:00"),
  quietHoursEnd: text("quiet_hours_end").notNull().default("08:00"),
  maxCallsPerDay: smallint("max_calls_per_day").notNull().default(1),
  maxRetries: smallint("max_retries").notNull().default(1),
  retryDelayMinutes: smallint("retry_delay_minutes").notNull().default(15),
  updatedAt: updatedAt(),
}).enableRLS();

// ---------- Calls and voice sessions ----------

export const callJobs = pgTable(
  "call_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reminderId: uuid("reminder_id").references(() => reminders.id, { onDelete: "set null" }),
    kind: callJobKind("kind").notNull().default("reminder"),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    attempts: smallint("attempts").notNull().default(0),
    status: callJobStatus("status").notNull().default("scheduled"),
    // Prevents the same scheduled occurrence from ever being dialled twice.
    idempotencyKey: text("idempotency_key").notNull().unique(),
    twilioCallSid: text("twilio_call_sid").unique(),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("call_jobs_due_idx").on(t.status, t.dueAt)],
).enableRLS();

export const callSessions = pgTable(
  "call_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    callJobId: uuid("call_job_id").references(() => callJobs.id, { onDelete: "set null" }),
    channel: sessionChannel("channel").notNull(),
    activeAgent: agentName("active_agent").notNull(),
    twilioCallSid: text("twilio_call_sid"),
    state: sessionState("state").notNull().default("connecting"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [index("call_sessions_user_idx").on(t.userId, t.startedAt)],
).enableRLS();

export const agentEvents = pgTable(
  "agent_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").references(() => callSessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    agent: agentName("agent").notNull(),
    // e.g. handoff, delegation, tool_call, tool_result, safety_flow
    eventType: text("event_type").notNull(),
    // Structured facts only; never raw transcripts.
    structuredPayload: jsonb("structured_payload").$type<Record<string, unknown>>().notNull().default({}),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agent_events_user_idx").on(t.userId, t.at)],
).enableRLS();

// Status of individual planned sessions of a goal. Planned sessions are computed from the goal's
// schedule; a row exists only once something happened (done, postponed, or moved in).
export const goalSessions = pgTable(
  "goal_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    scheduledDate: date("scheduled_date", { mode: "string" }).notNull(),
    // "HH:MM" for timed sessions, "" for any-time sessions, "extra:<n>" for flexible-goal entries.
    slotTime: text("slot_time").notNull().default(""),
    status: goalSessionStatus("status").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    movedToDate: date("moved_to_date", { mode: "string" }),
    movedToTime: text("moved_to_time"),
    movedFromDate: date("moved_from_date", { mode: "string" }),
    movedFromTime: text("moved_from_time"),
    value: numeric("value"),
    unit: text("unit"),
    note: text("note"),
    recordedByAgent: agentName("recorded_by_agent"),
    sessionId: uuid("session_id").references((): AnyPgColumn => callSessions.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("goal_sessions_slot_idx").on(t.goalId, t.scheduledDate, t.slotTime),
    index("goal_sessions_user_date_idx").on(t.userId, t.scheduledDate),
  ],
).enableRLS();

// Short AI-written summaries of conversations, visible only to the person. The words of a call are
// never stored; only this summary, and only with the conversation_summaries consent.
export const conversationSummaries = pgTable(
  "conversation_summaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .unique()
      .references(() => callSessions.id, { onDelete: "cascade" }),
    summary: text("summary").notNull(),
    includesSarah: boolean("includes_sarah").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("conversation_summaries_user_idx").on(t.userId)],
).enableRLS();

// High-impact actions an agent proposes. They run only when confirmed, and at most once.
export const actionConfirmations = pgTable(
  "action_confirmations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => callSessions.id, { onDelete: "cascade" }),
    proposedBy: agentName("proposed_by").notNull(),
    // Which service carries it out, e.g. "reminder.reschedule" (Milo's reminder service).
    kind: text("kind").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    summary: text("summary").notNull(),
    status: confirmationStatus("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("action_confirmations_user_idx").on(t.userId, t.status)],
).enableRLS();

// ---------- Wellbeing, planning and reports ----------

export const wellbeingNotes = pgTable(
  "wellbeing_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    visibility: noteVisibility("visibility").notNull().default("private"),
    retentionPolicy: text("retention_policy").notNull().default("30_days"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("wellbeing_notes_user_idx").on(t.userId)],
).enableRLS();

export const planProposals = pgTable(
  "plan_proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    goalId: uuid("goal_id").references(() => goals.id, { onDelete: "cascade" }),
    proposal: jsonb("proposal").$type<Record<string, unknown>>().notNull(),
    rationale: text("rationale"),
    proposedByAgent: agentName("proposed_by_agent").notNull().default("theo"),
    // The companion the person was talking to (null when changed in the app), and that conversation.
    requestedByAgent: agentName("requested_by_agent"),
    sessionId: uuid("session_id").references((): AnyPgColumn => callSessions.id, { onDelete: "set null" }),
    status: proposalStatus("status").notNull().default("proposed"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("plan_proposals_user_idx").on(t.userId)],
).enableRLS();

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    includedScopes: text("included_scopes").array().notNull().default(sql`'{}'`),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    status: reportStatus("status").notNull().default("draft"),
    version: integer("version").notNull().default(1),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("reports_patient_idx").on(t.patientId)],
).enableRLS();

export const reportShares = pgTable(
  "report_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    clinicianId: uuid("clinician_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // A share can't outlive the consent behind it (revocation or account deletion).
    consentId: uuid("consent_id")
      .notNull()
      .references(() => consents.id, { onDelete: "cascade" }),
    sharedAt: timestamp("shared_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    // Set only by a real, logged clinician action.
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (t) => [index("report_shares_clinician_idx").on(t.clinicianId)],
).enableRLS();

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorType: actorType("actor_type").notNull(),
    actorLabel: text("actor_label"),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    action: text("action").notNull(),
    result: auditResult("result").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_events_actor_idx").on(t.actorUserId, t.at)],
).enableRLS();
