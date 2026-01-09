export default defineEventHandler(async (event) => {
  const owner = "Meizuno";
  const repo = "TextBook-Storage";
  const branch = "main";

  // ---------------- Cloudflare context
  const cf = event.context.cloudflare;
  if (!cf) {
    throw createError({
      statusCode: 500,
      statusMessage: "Cloudflare context missing",
    });
  }

  const db = cf.env.DB; // D1
  const bucket = cf.env.BUCKET; // R2
  const config = useRuntimeConfig();

  // ---------------- GitHub: отримуємо ВСЕ дерево
  const treeRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    {
      headers: {
        Authorization: `Bearer ${config.githubToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "nuxt-cloudflare-migrator",
      },
    }
  );

  if (!treeRes.ok) {
    throw createError({
      statusCode: treeRes.status,
      statusMessage: "Failed to fetch GitHub tree",
    });
  }

  const treeData = await treeRes.json();

  // ---------------- helpers
  const idMap = new Map<string, number>();

  async function insertItem(
    label: string,
    type: string,
    content: string,
    parentPath: string | null
  ) {
    const parentId = parentPath ? idMap.get(parentPath) : null;

    const result = await db
      .prepare(
        `
      INSERT INTO items (label, type, content, parent_id)
      VALUES (?, ?, ?, ?)
    `
      )
      .bind(label, type, content, parentId)
      .run();

    return result.meta.last_row_id;
  }

  // ---------------- 1️⃣ створюємо папки
  const folders = treeData.tree.filter((n: any) => n.type === "tree");

  for (const folder of folders) {
    const parts = folder.path.split("/");
    let currentPath = "";

    for (const part of parts) {
      const parentPath = currentPath || null;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (!idMap.has(currentPath)) {
        const id = await insertItem(part, "folder", "", parentPath);
        idMap.set(currentPath, id);
      }
    }
  }

  // ---------------- 2️⃣ файли
  const files = treeData.tree.filter((n: any) => n.type === "blob");

  for (const file of files) {
    const parts = file.path.split("/");
    const label = parts.pop()!;
    const parentPath = parts.length ? parts.join("/") : null;

    // ---------- markdown / text → R2 + D1 (/cdn/key)
    if (label.endsWith(".md") || label.endsWith(".txt")) {
      const fileRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${file.path}?ref=${branch}`,
        {
          headers: {
            Authorization: `Bearer ${config.githubToken}`,
            Accept: "application/vnd.github+json",
          },
        }
      );

      if (!fileRes.ok) continue;

      const fileData = await fileRes.json();
      const arrayBuffer = Uint8Array.from(atob(fileData.content), (c) =>
        c.charCodeAt(0)
      );

      await bucket.put(file.path, arrayBuffer, {
        httpMetadata: {
          contentType: "text/markdown; charset=utf-8",
        },
      });

      // 2️⃣ в D1 зберігаємо CDN шлях
      const cdnPath = `/cdn/${file.path}`;

      const id = await insertItem(
        label,
        "markdown",
        cdnPath, // ✅ /cdn/key
        parentPath
      );

      idMap.set(file.path, id);
    }
  }

  return {
    status: "ok",
    repo: `${owner}/${repo}`,
    items: idMap.size,
  };
});
