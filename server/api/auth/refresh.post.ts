const TOKEN_COOKIE = "refresh_token";
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

const toBase64Url = (buffer: ArrayBuffer) =>
  Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const hashToken = async (value: string) => {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toBase64Url(digest);
};

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const userId = session?.user?.id;

  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }

  const token = crypto.randomUUID() + crypto.randomUUID();
  const tokenHash = await hashToken(token);
  const now = new Date().toISOString();

  const { cloudflare } = event.context;
  await cloudflare.env.DB.prepare(
    `
    INSERT INTO refresh_tokens (user_id, token_hash, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      token_hash = excluded.token_hash,
      updated_at = excluded.updated_at
    `
  )
    .bind(userId, tokenHash, now)
    .run();

  setCookie(event, TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: TOKEN_TTL_SECONDS,
  });

  return { ok: true };
});
