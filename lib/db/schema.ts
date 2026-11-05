import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgSchema,
  pgTable,
  primaryKey,
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

export const focusArea = pgEnum("focus_area", [
  "health_habits",
  "daily_planning",
  "reminders_routines",
  "emotional_wellbeing",
  "feeling_unwell",
  "track_progress",
  "care_team_updates",
]);

export const consentPurpose = pgEnum("consent_purpose", [
  "browser_voice",
  "outbound_calls",
  "health_data_processing",
  "sensitive_wellbeing",
  "clinician_sharing",
]);
export const consentStatus = pgEnum("consent_status", ["granted", "revoked"]);

export const invitationStatus = pgEnum("invitation_status", ["pending", "approved", "revoked", "expired"]);
export const relationshipStatus = pgEnum("relationship_status", ["pending", "active", "revoked"]);

export const goalType = pgEnum("goal_type", ["activity", "nutrition", "smoking", "sleep", "wellbeing", "other"]);
export const goalStatus = pgEnum("goal_status", ["active", "paused", "completed", "archived"]);

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
  onboardingStep: text("onboarding_step").default("focus_areas"),
  // Set when onboarding finishes, including when every step was skipped.
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}).enableRLS();

export const userFocusAreas = pgTable(
  "user_focus_areas",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    areaKey: focusArea("area_key").notNull(),
    selectedAt: timestamp("selected_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.areaKey] })],
).enableRLS();

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
    consentId: uuid("consent_id").references(() => consents.id),
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
    type: goalType("type").notNull(),
    title: text("title").notNull(),
    // e.g. { "timesPerWeek": 3, "minutes": 20 }
    target: jsonb("target").$type<Record<string, unknown>>().notNull().default({}),
    status: goalStatus("status").notNull().default("active"),
    // Set only for clinician-approved plans; self-chosen goals leave it null.
    approvedBy: uuid("approved_by").references(() => users.id),
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
    // A correction is a new row pointing at the row it replaces; the old row gets superseded_at.
    correctedFrom: uuid("corrected_from").references((): AnyPgColumn => habitEvents.id),
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
    consentId: uuid("consent_id")
      .notNull()
      .references(() => consents.id),
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
