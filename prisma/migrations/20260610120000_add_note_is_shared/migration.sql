-- Add `is_shared` to notes — an explicit "anyone with the link can read"
-- flag, orthogonal to the visibility tier. When true the note is readable
-- by its URL even if PROTECTED/PRIVATE, without being listed in other
-- users' tree / graph / search. Defaults false so existing rows stay
-- link-private; PUBLIC notes are shared by definition, so backfill them
-- to true to keep the column consistent with the tier.

ALTER TABLE "notes" ADD COLUMN "is_shared" BOOLEAN NOT NULL DEFAULT false;

UPDATE "notes" SET "is_shared" = true WHERE "visibility" = 'PUBLIC';
