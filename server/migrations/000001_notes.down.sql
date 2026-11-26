-- There is no way down from the baseline that keeps the notes, and the
-- production table predates this server. Refuse rather than drop it.
DO $$
BEGIN
    RAISE EXCEPTION 'refusing to drop the notes table: 000001 is the baseline of a database Prisma created';
END
$$;
