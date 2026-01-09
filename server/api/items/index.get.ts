import { buildTree } from "../../utils/index";

export default defineEventHandler(async (event) => {
  const { cloudflare } = event.context;
  const items = await cloudflare.env.DB.prepare("SELECT * FROM items").run();
  return buildTree(items.results);
});
