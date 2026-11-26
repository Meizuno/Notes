-- Add `slug` to notes — the URL slug for friendly `/notes/<slug>` links.
-- Existing rows are backfilled to their UUID so the column is immediately
-- non-null and unique and no previously-shared `/notes/<uuid>` link breaks
-- (read paths resolve by slug OR id). Run `pnpm run slugs:backfill` once
-- after deploying to replace those UUID slugs with friendly title slugs.

ALTER TABLE "notes" ADD COLUMN "slug" VARCHAR(120);

UPDATE "notes" SET "slug" = "id"::text WHERE "slug" IS NULL;

ALTER TABLE "notes" ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX "notes_slug_key" ON "notes"("slug");
