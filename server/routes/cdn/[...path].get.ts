export default defineEventHandler(async (event) => {
  const path = getRouterParam(event, "path");
  if (!path) {
    throw createError({
      statusCode: 400,
      statusMessage: "Bad request",
    });
  }

  const { cloudflare } = event.context;
  const key = Array.isArray(path) ? path.join("/") : path;
  const decodedKey = decodeURIComponent(key);
  const object = await cloudflare.env.BUCKET.get(decodedKey);

  if (!object) {
    throw createError({
      statusCode: 404,
      statusMessage: "Not found",
    });
  }

  setHeader(event, "Cache-Control", "public, max-age=31536000, immutable");
  setHeader(
    event,
    "Content-Type",
    object.httpMetadata?.contentType ?? "text/markdown; charset=utf-8"
  );

  return object.body;
});
