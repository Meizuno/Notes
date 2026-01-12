export default defineEventHandler(async (event) => {
  const { cloudflare } = event.context;
  const item = await cloudflare.env.DB.prepare(
    "SELECT * FROM items WHERE parent_id is NULL and type = ?"
  )
    .bind("folder")
    .run();

  return item.results;
});
