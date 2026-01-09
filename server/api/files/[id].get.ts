export default defineEventHandler(async (event) => {
  const itemId = getRouterParam(event, "id");
  const { cloudflare } = event.context;
  const item = await cloudflare.env.DB.prepare(
    "SELECT * FROM items WHERE id = ? and type = ?"
  )
    .bind(itemId, "markdown")
    .first();

  return item;
});
