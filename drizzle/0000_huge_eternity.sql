CREATE TYPE "public"."review_status" AS ENUM('confirmed', 'review', 'conflict');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('message', 'voice', 'image', 'document');--> statement-breakpoint
CREATE TYPE "public"."source_role" AS ENUM('teacher', 'group-lead', 'student');--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"title" text NOT NULL,
	"subject" text NOT NULL,
	"event_date" text NOT NULL,
	"event_time" text NOT NULL,
	"room" text NOT NULL,
	"confidence" integer NOT NULL,
	"status" "review_status" DEFAULT 'review' NOT NULL,
	"reason" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"telegram_chat_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "groups_telegram_chat_id_unique" UNIQUE("telegram_chat_id")
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"author" text NOT NULL,
	"role" "source_role" NOT NULL,
	"kind" "source_kind" NOT NULL,
	"text" text NOT NULL,
	"source_time" text NOT NULL,
	"chat" text NOT NULL,
	"telegram_meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_group_id_idx" ON "events" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "events_event_date_idx" ON "events" USING btree ("event_date");--> statement-breakpoint
CREATE INDEX "events_status_idx" ON "events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sources_event_id_idx" ON "sources" USING btree ("event_id");