-- Add an optional `description` column to notes — a short summary
-- the author can attach for use in list / search / preview contexts.
-- Nullable so existing rows are valid without a backfill.

ALTER TABLE "notes" ADD COLUMN "description" VARCHAR(500);
