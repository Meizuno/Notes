export default defineOAuthGoogleEventHandler({
  async onSuccess(event, { user }) {
    const { cloudflare } = event.context;
    const userDB = await cloudflare.env.DB.prepare(
      "SELECT id FROM users WHERE email = ?"
    )
      .bind(user.email)
      .first();

    if (!userDB) {
      return sendRedirect(event, "/?error=USER_NOT_FOUND");
    }

    await setUserSession(event, {
      user: {
        name: user.name,
        photo: user.picture,
      },
    });

    return sendRedirect(event, "/");
  },
});
