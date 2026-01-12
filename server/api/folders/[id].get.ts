export default defineEventHandler(async (event) => {
  const parentId = Number(getRouterParam(event, "id")) || null;
  const { cloudflare } = event.context;
  const item = await cloudflare.env.DB.prepare(
    "SELECT * FROM items WHERE parent_id = ? and type = ?"
  )
    .bind(parentId, "folder")
    .run();

  return item.results;
});
