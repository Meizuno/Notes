export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  const { cloudflare } = event.context;
  await cloudflare.env.DB.prepare(
    `DELETE FROM items
    WHERE id = ?`
  )
    .bind(id)
    .run();
});
