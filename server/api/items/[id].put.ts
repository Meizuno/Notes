export default defineEventHandler(async (event) => {
  const body: { label: string; parentId: number | undefined } = await readBody(
    event
  );

  const id = getRouterParam(event, "id");
  const { cloudflare } = event.context;
  await cloudflare.env.DB.prepare(
    `UPDATE items 
    SET label = ?, parent_id = ?
    WHERE id = ?`
  )
    .bind(body.label, body.parentId || null, id)
    .run();
});
