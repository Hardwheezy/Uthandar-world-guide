CREATE TYPE "public"."editorial_status" AS ENUM('canon', 'draft', 'proposed', 'research', 'reference', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."framing" AS ENUM('account', 'hearsay', 'contested', 'belief');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('player', 'editor', 'admin');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('public', 'dm');--> statement-breakpoint
CREATE TABLE "article_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"heading" text,
	"content" jsonb NOT NULL,
	"plain_text" text DEFAULT '' NOT NULL,
	"visibility" "visibility" DEFAULT 'dm' NOT NULL,
	"status" "editorial_status" DEFAULT 'draft' NOT NULL,
	"framing" "framing" DEFAULT 'account' NOT NULL,
	"source" text
);
--> statement-breakpoint
CREATE TABLE "article_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"label" text NOT NULL,
	"value" text,
	"visibility" "visibility" DEFAULT 'dm' NOT NULL,
	"status" "editorial_status" DEFAULT 'draft' NOT NULL,
	"source" text
);
--> statement-breakpoint
CREATE TABLE "article_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"block_id" uuid NOT NULL,
	"source_article_id" uuid NOT NULL,
	"target_article_id" uuid,
	"target_title" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"summary" text,
	"status" "editorial_status" DEFAULT 'draft' NOT NULL,
	"visibility" "visibility" DEFAULT 'dm' NOT NULL,
	"template" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"source" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"type" text NOT NULL,
	"note" text,
	"visibility" "visibility" DEFAULT 'dm' NOT NULL,
	"status" "editorial_status" DEFAULT 'draft' NOT NULL,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"world_id" uuid NOT NULL,
	"action" text NOT NULL,
	"title" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'player' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "worlds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"tagline" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worlds_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "article_blocks" ADD CONSTRAINT "article_blocks_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_facts" ADD CONSTRAINT "article_facts_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_links" ADD CONSTRAINT "article_links_block_id_article_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."article_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_links" ADD CONSTRAINT "article_links_source_article_id_articles_id_fk" FOREIGN KEY ("source_article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_links" ADD CONSTRAINT "article_links_target_article_id_articles_id_fk" FOREIGN KEY ("target_article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_source_id_articles_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_target_id_articles_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blocks_article" ON "article_blocks" USING btree ("article_id","position");--> statement-breakpoint
CREATE INDEX "facts_article" ON "article_facts" USING btree ("article_id","position");--> statement-breakpoint
CREATE INDEX "links_target" ON "article_links" USING btree ("target_article_id");--> statement-breakpoint
CREATE INDEX "links_source" ON "article_links" USING btree ("source_article_id");--> statement-breakpoint
CREATE UNIQUE INDEX "articles_world_slug" ON "articles" USING btree ("world_id","slug");--> statement-breakpoint
CREATE INDEX "articles_type" ON "articles" USING btree ("world_id","type");--> statement-breakpoint
CREATE INDEX "rel_source" ON "relationships" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "rel_target" ON "relationships" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "revisions_article" ON "revisions" USING btree ("article_id","created_at");