CREATE TABLE "inbox_imports" (
	"id" serial PRIMARY KEY NOT NULL,
	"path" text NOT NULL,
	"content_hash" text NOT NULL,
	"author" text NOT NULL,
	"article_id" uuid,
	"action" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_path_hash" ON "inbox_imports" USING btree ("path","content_hash");