CREATE TYPE "public"."actor_type" AS ENUM('patient', 'clinician', 'agent', 'system', 'admin');--> statement-breakpoint
CREATE TYPE "public"."agent_name" AS ENUM('natalie', 'milo', 'sarah', 'theo', 'iris', 'clara');--> statement-breakpoint
CREATE TYPE "public"."audit_result" AS ENUM('success', 'denied', 'failed');--> statement-breakpoint
CREATE TYPE "public"."call_job_status" AS ENUM('scheduled', 'dialing', 'ringing', 'in_progress', 'completed', 'no_answer', 'busy', 'failed', 'cancelled', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."certainty" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."consent_purpose" AS ENUM('browser_voice', 'outbound_calls', 'health_data_processing', 'sensitive_wellbeing', 'clinician_sharing');--> statement-breakpoint
CREATE TYPE "public"."consent_status" AS ENUM('granted', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."data_source" AS ENUM('patient_reported', 'clinician_entered', 'system');--> statement-breakpoint
CREATE TYPE "public"."focus_area" AS ENUM('health_habits', 'daily_planning', 'reminders_routines', 'emotional_wellbeing', 'feeling_unwell', 'track_progress', 'care_team_updates');--> statement-breakpoint
CREATE TYPE "public"."goal_status" AS ENUM('active', 'paused', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."goal_type" AS ENUM('activity', 'nutrition', 'smoking', 'sleep', 'wellbeing', 'other');--> statement-breakpoint
CREATE TYPE "public"."habit_kind" AS ENUM('activity', 'food', 'smoking', 'sleep', 'mood', 'other');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'approved', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."note_visibility" AS ENUM('private', 'shared_with_care_team');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('proposed', 'accepted', 'rejected', 'executed');--> statement-breakpoint
CREATE TYPE "public"."relationship_status" AS ENUM('pending', 'active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."reminder_channel" AS ENUM('in_app', 'phone');--> statement-breakpoint
CREATE TYPE "public"."reminder_status" AS ENUM('active', 'paused', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('draft', 'approved', 'shared', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."session_channel" AS ENUM('browser', 'phone');--> statement-breakpoint
CREATE TYPE "public"."session_state" AS ENUM('connecting', 'active', 'ending', 'ended');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('patient', 'clinician');--> statement-breakpoint
CREATE TABLE "agent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid,
	"user_id" uuid NOT NULL,
	"agent" "agent_name" NOT NULL,
	"event_type" text NOT NULL,
	"structured_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_type" "actor_type" NOT NULL,
	"actor_label" text,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"action" text NOT NULL,
	"result" "audit_result" NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "call_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"reminder_id" uuid,
	"due_at" timestamp with time zone NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"status" "call_job_status" DEFAULT 'scheduled' NOT NULL,
	"idempotency_key" text NOT NULL,
	"twilio_call_sid" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "call_jobs_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "call_jobs_twilio_call_sid_unique" UNIQUE("twilio_call_sid")
);
--> statement-breakpoint
ALTER TABLE "call_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "call_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"calls_enabled" boolean DEFAULT false NOT NULL,
	"paused_at" timestamp with time zone,
	"quiet_hours_start" text DEFAULT '21:00' NOT NULL,
	"quiet_hours_end" text DEFAULT '08:00' NOT NULL,
	"max_calls_per_day" smallint DEFAULT 1 NOT NULL,
	"max_retries" smallint DEFAULT 1 NOT NULL,
	"retry_delay_minutes" smallint DEFAULT 15 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "call_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "call_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"call_job_id" uuid,
	"channel" "session_channel" NOT NULL,
	"active_agent" "agent_name" NOT NULL,
	"twilio_call_sid" text,
	"state" "session_state" DEFAULT 'connecting' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "call_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "clinician_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invited_email" text NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"approved_by" text,
	"credential_verified_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clinician_invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "clinician_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"clinician_id" uuid NOT NULL,
	"status" "relationship_status" DEFAULT 'pending' NOT NULL,
	"consent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "clinician_relationships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" "consent_purpose" NOT NULL,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "consent_status" DEFAULT 'granted' NOT NULL,
	"terms_version" text DEFAULT 'mvp-1' NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "consents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "goal_type" NOT NULL,
	"title" text NOT NULL,
	"target" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "goal_status" DEFAULT 'active' NOT NULL,
	"approved_by" uuid,
	"plan_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "goals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "habit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_id" uuid,
	"kind" "habit_kind" NOT NULL,
	"value" numeric,
	"unit" text,
	"description" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"source" "data_source" DEFAULT 'patient_reported' NOT NULL,
	"certainty" "certainty" DEFAULT 'medium' NOT NULL,
	"recorded_by_agent" "agent_name",
	"corrected_from" uuid,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "habit_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "patient_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"nickname" text,
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"onboarding_step" text DEFAULT 'focus_areas',
	"onboarding_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "patient_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "plan_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_id" uuid,
	"proposal" jsonb NOT NULL,
	"rationale" text,
	"proposed_by_agent" "agent_name" DEFAULT 'theo' NOT NULL,
	"status" "proposal_status" DEFAULT 'proposed' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"executed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plan_proposals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_id" uuid,
	"title" text NOT NULL,
	"local_time" text NOT NULL,
	"days_of_week" smallint[] DEFAULT '{0,1,2,3,4,5,6}' NOT NULL,
	"timezone" text NOT NULL,
	"channel" "reminder_channel" DEFAULT 'in_app' NOT NULL,
	"status" "reminder_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminders_local_time_format" CHECK ("reminders"."local_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);
--> statement-breakpoint
ALTER TABLE "reminders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "report_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"clinician_id" uuid NOT NULL,
	"consent_id" uuid NOT NULL,
	"shared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "report_shares" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"included_scopes" text[] DEFAULT '{}' NOT NULL,
	"content" jsonb NOT NULL,
	"status" "report_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_focus_areas" (
	"user_id" uuid NOT NULL,
	"area_key" "focus_area" NOT NULL,
	"selected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_focus_areas_user_id_area_key_pk" PRIMARY KEY("user_id","area_key")
);
--> statement-breakpoint
ALTER TABLE "user_focus_areas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" uuid NOT NULL,
	"role" "user_role" DEFAULT 'patient' NOT NULL,
	"display_name" text,
	"timezone" text DEFAULT 'Australia/Adelaide' NOT NULL,
	"preferred_language" text DEFAULT 'en' NOT NULL,
	"phone_e164" text,
	"phone_confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_auth_user_id_unique" UNIQUE("auth_user_id"),
	CONSTRAINT "phone_e164_format" CHECK ("users"."phone_e164" is null or "users"."phone_e164" ~ '^\+[1-9][0-9]{6,14}$')
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "wellbeing_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"visibility" "note_visibility" DEFAULT 'private' NOT NULL,
	"retention_policy" text DEFAULT '30_days' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wellbeing_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_session_id_call_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."call_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_jobs" ADD CONSTRAINT "call_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_jobs" ADD CONSTRAINT "call_jobs_reminder_id_reminders_id_fk" FOREIGN KEY ("reminder_id") REFERENCES "public"."reminders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_preferences" ADD CONSTRAINT "call_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_call_job_id_call_jobs_id_fk" FOREIGN KEY ("call_job_id") REFERENCES "public"."call_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinician_invitations" ADD CONSTRAINT "clinician_invitations_accepted_user_id_users_id_fk" FOREIGN KEY ("accepted_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinician_relationships" ADD CONSTRAINT "clinician_relationships_patient_id_users_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinician_relationships" ADD CONSTRAINT "clinician_relationships_clinician_id_users_id_fk" FOREIGN KEY ("clinician_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinician_relationships" ADD CONSTRAINT "clinician_relationships_consent_id_consents_id_fk" FOREIGN KEY ("consent_id") REFERENCES "public"."consents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_events" ADD CONSTRAINT "habit_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_events" ADD CONSTRAINT "habit_events_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_events" ADD CONSTRAINT "habit_events_corrected_from_habit_events_id_fk" FOREIGN KEY ("corrected_from") REFERENCES "public"."habit_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_profiles" ADD CONSTRAINT "patient_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_proposals" ADD CONSTRAINT "plan_proposals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_proposals" ADD CONSTRAINT "plan_proposals_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_shares" ADD CONSTRAINT "report_shares_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_shares" ADD CONSTRAINT "report_shares_clinician_id_users_id_fk" FOREIGN KEY ("clinician_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_shares" ADD CONSTRAINT "report_shares_consent_id_consents_id_fk" FOREIGN KEY ("consent_id") REFERENCES "public"."consents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_patient_id_users_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_focus_areas" ADD CONSTRAINT "user_focus_areas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_auth_user_id_users_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wellbeing_notes" ADD CONSTRAINT "wellbeing_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_events_user_idx" ON "agent_events" USING btree ("user_id","at");--> statement-breakpoint
CREATE INDEX "audit_events_actor_idx" ON "audit_events" USING btree ("actor_user_id","at");--> statement-breakpoint
CREATE INDEX "call_jobs_due_idx" ON "call_jobs" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "call_sessions_user_idx" ON "call_sessions" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "clinician_invitations_email_idx" ON "clinician_invitations" USING btree (lower("invited_email"));--> statement-breakpoint
CREATE UNIQUE INDEX "clinician_relationships_pair_idx" ON "clinician_relationships" USING btree ("patient_id","clinician_id");--> statement-breakpoint
CREATE INDEX "consents_user_purpose_idx" ON "consents" USING btree ("user_id","purpose");--> statement-breakpoint
CREATE INDEX "goals_user_idx" ON "goals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "habit_events_user_time_idx" ON "habit_events" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "plan_proposals_user_idx" ON "plan_proposals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reminders_user_idx" ON "reminders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "report_shares_clinician_idx" ON "report_shares" USING btree ("clinician_id");--> statement-breakpoint
CREATE INDEX "reports_patient_idx" ON "reports" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "wellbeing_notes_user_idx" ON "wellbeing_notes" USING btree ("user_id");