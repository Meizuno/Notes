export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  const { cloudflare } = event.context;
  const path = await cloudflare.env.DB.prepare(
    `
      WITH RECURSIVE tree AS (
        SELECT id, label, parent_id, '' AS path
        FROM items
        WHERE id = ?

        UNION ALL

        SELECT p.id, p.label, p.parent_id,
              CASE
                  WHEN tree.path = '' THEN p.label
                  ELSE p.label || '/' || tree.path
              END
        FROM items p
        JOIN tree ON tree.parent_id = p.id
      )
      SELECT path
      FROM tree
      WHERE parent_id IS NULL;
    `
  )
    .bind(id)
    .first();

  const item = await cloudflare.env.DB.prepare(
    `SELECT id, label, parent_id as parentId FROM items WHERE id = ?`
  )
    .bind(id)
    .first();

  return {
    ...item,
    ...path
  };
});
