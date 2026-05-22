-- Replace notes.public (boolean) with notes.visibility (enum).
-- Mapping:
--   public = true   -> 'PUBLIC'
--   public = false  -> 'PROTECTED'  (existing "shared workspace" behaviour)
-- A new 'PRIVATE' tier is introduced but no existing rows use it.
--
-- Wrapped in a transaction so a failure leaves the schema untouched.

BEGIN;

-- 1. Create the enum type. Order chosen so the implicit sort goes
--    PRIVATE < PROTECTED < PUBLIC, mirroring "least → most accessible".
CREATE TYPE "note_visibility" AS ENUM ('PRIVATE', 'PROTECTED', 'PUBLIC');

-- 2. Add the new column with the PROTECTED default; the default lets
--    Postgres backfill every existing row in one pass without us
--    having to write the rows ourselves.
ALTER TABLE "notes"
  ADD COLUMN "visibility" "note_visibility" NOT NULL DEFAULT 'PROTECTED';

-- 3. Promote rows that were public=true to PUBLIC. Rows that were
--    public=false already have PROTECTED from the default above.
UPDATE "notes" SET "visibility" = 'PUBLIC' WHERE "public" = true;

-- 4. Drop the old index + column.
DROP INDEX IF EXISTS "notes_public_idx";
ALTER TABLE "notes" DROP COLUMN "public";

-- 5. Index the new column (read endpoints filter on it on every list).
CREATE INDEX "notes_visibility_idx" ON "notes"("visibility");

COMMIT;
