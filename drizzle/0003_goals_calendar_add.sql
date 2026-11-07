CREATE TYPE "public"."goal_cadence" AS ENUM('daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."goal_category" AS ENUM('walk', 'workout', 'medication', 'sleep', 'food_drink', 'smoking', 'mindfulness', 'other');--> statement-breakpoint
CREATE TYPE "public"."goal_session_status" AS ENUM('planned', 'done', 'postponed');--> statement-breakpoint
ALTER TYPE "public"."consent_purpose" ADD VALUE 'conversation_summaries';--> statement-breakpoint
CREATE TABLE "conversation_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"summary" text NOT NULL,
	"includes_sarah" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_summaries_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
ALTER TABLE "conversation_summaries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "goal_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"scheduled_date" date NOT NULL,
	"slot_time" text DEFAULT '' NOT NULL,
	"status" "goal_session_status" NOT NULL,
	"completed_at" timestamp with time zone,
	"moved_to_date" date,
	"moved_to_time" text,
	"moved_from_date" date,
	"moved_from_time" text,
	"value" numeric,
	"unit" text,
	"note" text,
	"recorded_by_agent" "agent_name",
	"session_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "goal_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "goals" ALTER COLUMN "type" SET DEFAULT 'other';--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "category" "goal_category" DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "cadence" "goal_cadence" DEFAULT 'weekly' NOT NULL;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "target_count" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "days_of_week" smallint[];--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "times" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "duration_minutes" smallint;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "starts_on" date DEFAULT current_date NOT NULL;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "ends_on" date;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "previous_goal_id" uuid;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "created_by_agent" "agent_name";--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "created_in_session_id" uuid;--> statement-breakpoint
ALTER TABLE "habit_events" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "plan_proposals" ADD COLUMN "requested_by_agent" "agent_name";--> statement-breakpoint
ALTER TABLE "plan_proposals" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "country_code" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "timezone_source" text;--> statement-breakpoint
ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_session_id_call_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."call_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_sessions" ADD CONSTRAINT "goal_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_sessions" ADD CONSTRAINT "goal_sessions_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_sessions" ADD CONSTRAINT "goal_sessions_session_id_call_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."call_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_summaries_user_idx" ON "conversation_summaries" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "goal_sessions_slot_idx" ON "goal_sessions" USING btree ("goal_id","scheduled_date","slot_time");--> statement-breakpoint
CREATE INDEX "goal_sessions_user_date_idx" ON "goal_sessions" USING btree ("user_id","scheduled_date");--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_previous_goal_id_goals_id_fk" FOREIGN KEY ("previous_goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_created_in_session_id_call_sessions_id_fk" FOREIGN KEY ("created_in_session_id") REFERENCES "public"."call_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_events" ADD CONSTRAINT "habit_events_session_id_call_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."call_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_proposals" ADD CONSTRAINT "plan_proposals_session_id_call_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."call_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Convert existing goals to the new shape before the old columns are dropped.
UPDATE "goals" g SET
  "category" = (CASE g."type"
    WHEN 'activity' THEN (CASE WHEN g."title" ILIKE '%walk%' THEN 'walk' ELSE 'workout' END)
    WHEN 'nutrition' THEN 'food_drink'
    WHEN 'smoking' THEN 'smoking'
    WHEN 'sleep' THEN 'sleep'
    WHEN 'wellbeing' THEN 'mindfulness'
    ELSE 'other' END)::"goal_category",
  "cadence" = (CASE
    WHEN g."target" ? 'timesPerWeek' THEN 'weekly'
    WHEN g."target" ? 'nightsPerWeek' OR g."target" ? 'daysPerWeek' OR g."target" ? 'maxPerDay' THEN 'daily'
    ELSE 'weekly' END)::"goal_cadence",
  "target_count" = COALESCE((g."target"->>'timesPerWeek')::smallint, 1),
  "days_of_week" = CASE WHEN g."target" ? 'nightsPerWeek' THEN '{1,2,3,4,5}'::smallint[] ELSE NULL END,
  "times" = CASE WHEN g."target" ? 'time' THEN ARRAY[g."target"->>'time'] ELSE '{}'::text[] END,
  "duration_minutes" = (g."target"->>'minutes')::smallint,
  "starts_on" = (g."created_at" AT TIME ZONE u."timezone")::date
FROM "users" u WHERE u."id" = g."user_id";
