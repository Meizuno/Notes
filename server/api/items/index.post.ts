export default defineEventHandler(async (event) => {
  const body: { label: string; type: string; parentId: number | undefined } =
    await readBody(event);
  const { cloudflare } = event.context;
  await cloudflare.env.DB.prepare(
    `INSERT INTO items (label, type, parent_id) VALUES (?,?,?)`
  )
    .bind(body.label, body.type, body.parentId || null)
    .run();
});
