DROP TABLE "user_focus_areas" CASCADE;--> statement-breakpoint
ALTER TABLE "patient_profiles" ALTER COLUMN "onboarding_step" SET DEFAULT 'name';--> statement-breakpoint
ALTER TABLE "goals" DROP COLUMN "type";--> statement-breakpoint
ALTER TABLE "goals" DROP COLUMN "target";--> statement-breakpoint
DROP TYPE "public"."focus_area";--> statement-breakpoint
DROP TYPE "public"."goal_type";