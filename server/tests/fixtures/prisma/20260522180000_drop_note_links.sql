-- Drop the wiki-link index table. We don't render `[[Title]]` as a
-- special syntax anymore — plain markdown links (`[Title](/notes/<id>)`)
-- are now the canonical way to point from one note to another, so the
-- machinery that kept this table in sync (runtime indexing in
-- POST/PUT + rename cascade) goes away with it.

BEGIN;

DROP TABLE IF EXISTS "note_links";

COMMIT;
