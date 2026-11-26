-- The baseline: exactly what prisma/migrations/* left behind, written so that
-- running it over the database Prisma made changes nothing.
--
-- Production was created by Prisma (six migrations, 2026-05-15 … 2026-06-22),
-- and this server takes it over without touching a row: every statement here
-- is IF NOT EXISTS, and the enum, which has no such clause, is made inside a
-- DO block that swallows "already exists". `_prisma_migrations` is left where
-- it is; nothing reads it any more, and nothing needs to delete it.
--
-- On an empty database (dev, the test suite) the same statements build the
-- same table — the column order below is the order the Prisma migrations
-- produced (the later columns were ADDed), so a schema dump of either reads
-- the same. Verified against the dev copy of production with pg_dump.

CREATE EXTENSION IF NOT EXISTS "pg_trgm";

DO $$
BEGIN
    -- Ordered PRIVATE < PROTECTED < PUBLIC, "least → most accessible".
    CREATE TYPE "note_visibility" AS ENUM ('PRIVATE', 'PROTECTED', 'PUBLIC');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS "notes" (
    "id"          UUID NOT NULL,
    "user_id"     TEXT NOT NULL,
    "title"       VARCHAR(300) NOT NULL,
    "folder"      VARCHAR(500),
    "content"     TEXT NOT NULL DEFAULT '',
    "is_deleted"  BOOLEAN NOT NULL DEFAULT false,
    -- `timestamp(3) without time zone`, holding UTC: Prisma's convention. The
    -- server writes `now() AT TIME ZONE 'UTC'` explicitly rather than relying
    -- on these defaults, which follow the session's time zone.
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- PUBLIC: anyone. PROTECTED: any signed-in user (the default). PRIVATE:
    -- only the creator, matched against user_id.
    "visibility"  "note_visibility" NOT NULL DEFAULT 'PROTECTED',
    "description" VARCHAR(500),
    -- "Anyone with the link can read", orthogonal to the tier: readable by
    -- its URL, never listed. Always true for PUBLIC.
    "is_shared"   BOOLEAN NOT NULL DEFAULT false,
    -- Derived from the title at creation and fixed afterwards. Unique across
    -- every row, soft-deleted ones included.
    "slug"        VARCHAR(120) NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "notes_user_id_idx" ON "notes" ("user_id");
CREATE INDEX IF NOT EXISTS "notes_is_deleted_idx" ON "notes" ("is_deleted");
CREATE INDEX IF NOT EXISTS "notes_folder_idx" ON "notes" ("folder");
CREATE INDEX IF NOT EXISTS "notes_visibility_idx" ON "notes" ("visibility");
CREATE INDEX IF NOT EXISTS "notes_title_idx" ON "notes" USING GIN ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "notes_content_idx" ON "notes" USING GIN ("content" gin_trgm_ops);
CREATE UNIQUE INDEX IF NOT EXISTS "notes_slug_key" ON "notes" ("slug");
