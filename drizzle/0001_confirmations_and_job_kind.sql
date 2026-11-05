CREATE TYPE "public"."call_job_kind" AS ENUM('reminder', 'on_demand');--> statement-breakpoint
CREATE TYPE "public"."confirmation_status" AS ENUM('pending', 'executed', 'expired', 'rejected');--> statement-breakpoint
CREATE TABLE "action_confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid,
	"proposed_by" "agent_name" NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"summary" text NOT NULL,
	"status" "confirmation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"executed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "action_confirmations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "call_jobs" ADD COLUMN "kind" "call_job_kind" DEFAULT 'reminder' NOT NULL;--> statement-breakpoint
ALTER TABLE "action_confirmations" ADD CONSTRAINT "action_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_confirmations" ADD CONSTRAINT "action_confirmations_session_id_call_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."call_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "action_confirmations_user_idx" ON "action_confirmations" USING btree ("user_id","status");