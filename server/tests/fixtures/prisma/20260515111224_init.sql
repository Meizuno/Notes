-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateTable
CREATE TABLE "notes" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "folder" VARCHAR(500),
    "content" TEXT NOT NULL DEFAULT '',
    "public" BOOLEAN NOT NULL DEFAULT false,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_links" (
    "from_id" UUID NOT NULL,
    "to_title" VARCHAR(300) NOT NULL,
    "to_id" UUID,

    CONSTRAINT "note_links_pkey" PRIMARY KEY ("from_id","to_title")
);

-- CreateIndex
CREATE INDEX "notes_user_id_idx" ON "notes"("user_id");

-- CreateIndex
CREATE INDEX "notes_is_deleted_idx" ON "notes"("is_deleted");

-- CreateIndex
CREATE INDEX "notes_folder_idx" ON "notes"("folder");

-- CreateIndex
CREATE INDEX "notes_public_idx" ON "notes"("public");

-- CreateIndex
CREATE INDEX "notes_title_idx" ON "notes" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "notes_content_idx" ON "notes" USING GIN ("content" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "note_links_to_id_idx" ON "note_links"("to_id");

-- CreateIndex
CREATE INDEX "note_links_to_title_idx" ON "note_links"("to_title");

-- AddForeignKey
ALTER TABLE "note_links" ADD CONSTRAINT "note_links_from_id_fkey" FOREIGN KEY ("from_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_links" ADD CONSTRAINT "note_links_to_id_fkey" FOREIGN KEY ("to_id") REFERENCES "notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
