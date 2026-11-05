ALTER TABLE "clinician_relationships" DROP CONSTRAINT "clinician_relationships_consent_id_consents_id_fk";
--> statement-breakpoint
ALTER TABLE "goals" DROP CONSTRAINT "goals_approved_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "habit_events" DROP CONSTRAINT "habit_events_corrected_from_habit_events_id_fk";
--> statement-breakpoint
ALTER TABLE "report_shares" DROP CONSTRAINT "report_shares_consent_id_consents_id_fk";
--> statement-breakpoint
ALTER TABLE "clinician_relationships" ADD CONSTRAINT "clinician_relationships_consent_id_consents_id_fk" FOREIGN KEY ("consent_id") REFERENCES "public"."consents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_events" ADD CONSTRAINT "habit_events_corrected_from_habit_events_id_fk" FOREIGN KEY ("corrected_from") REFERENCES "public"."habit_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_shares" ADD CONSTRAINT "report_shares_consent_id_consents_id_fk" FOREIGN KEY ("consent_id") REFERENCES "public"."consents"("id") ON DELETE cascade ON UPDATE no action;