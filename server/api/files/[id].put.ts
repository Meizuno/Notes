export default defineEventHandler(async (event) => {
  const { content: markdown } = await readBody<{ content: string }>(event);

  if (!markdown) {
    throw createError({
      statusCode: 400,
      statusMessage: "Markdown content is required",
    });
  }

  const itemId = getRouterParam(event, "id");
  const { cloudflare } = event.context;
  const db = cloudflare.env.DB;
  const bucket = cloudflare.env.BUCKET;

  const item = await db
    .prepare(`
      WITH RECURSIVE tree AS (
        SELECT id, label, parent_id, label AS path
        FROM items
        WHERE id = ? AND type = 'markdown'

        UNION ALL

        SELECT p.id, p.label, p.parent_id,
               p.label || '/' || tree.path
        FROM items p
        JOIN tree ON tree.parent_id = p.id
      )
      SELECT
        (SELECT content FROM items WHERE id = ?) AS content,
        path
      FROM tree
      WHERE parent_id IS NULL
    `)
    .bind(itemId, itemId)
    .first();

  if (!item) {
    throw createError({ statusCode: 404, statusMessage: "Item not found" });
  }

  const key = item.content
    ? item.content.replace(/^\/cdn\//, "")
    : `markdown/${item.path}.md`;

  await bucket.put(key, markdown, {
    httpMetadata: {
      contentType: "text/markdown; charset=utf-8",
    },
  });

  if (!item.content) {
    await db
      .prepare("UPDATE items SET content = ? WHERE id = ?")
      .bind(`/cdn/${key}`, itemId)
      .run();
  }
});
