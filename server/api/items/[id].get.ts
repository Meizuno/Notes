export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  const { cloudflare } = event.context;
  const item = await cloudflare.env.DB.prepare(
    `SELECT * FROM items WHERE id = ?`
  )
    .bind(id)
    .first();

  return item;
});
