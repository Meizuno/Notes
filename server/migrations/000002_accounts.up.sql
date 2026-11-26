-- The app's own sign-in, replacing the central SSO: who may use it, their
-- sessions, and the API tokens ai-chat reaches the vault with.

-- `id` is TEXT on purpose. notes.user_id already holds the SSO's user ids, and
-- scripts/import_sso_users.py brings those users across under the same ids,
-- so every PRIVATE note keeps its owner without a row of notes being
-- rewritten. A user who first appears here gets a fresh uuid4.
--
-- No foreign key from notes.user_id: production holds notes by owners who
-- will never sign in here (the seed's "seed-user", anybody not imported), and
-- the notes table is not this migration's to change.
CREATE TABLE users (
    id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    -- Stored lowercased, which is what makes UNIQUE mean "one account per
    -- address" however Google or the SSO capitalised it.
    email      text NOT NULL,
    name       text,
    picture    text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT users_email_key UNIQUE (email),
    CONSTRAINT users_email_lowercase CHECK (email = lower(email))
);

-- Refresh tokens are opaque random strings; only the sha256 is stored. Each
-- refresh rotates the token, and `family` ties a rotation chain together:
-- presenting an already-rotated token means it leaked, so the whole family is
-- revoked at once. ON UPDATE CASCADE so that re-keying a user (an import that
-- finds an account under a new id) carries their sessions with it.
CREATE TABLE refresh_tokens (
    id         bigserial PRIMARY KEY,
    user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
    token_hash text NOT NULL UNIQUE,
    family     text NOT NULL DEFAULT gen_random_uuid()::text,
    user_agent text NOT NULL DEFAULT '',
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    used_at    timestamptz,
    revoked_at timestamptz
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family);

-- Personal API tokens: what ai-chat presents as `Authorization: Bearer` on
-- /api/mcp and /api/prompts/notes. The secret is shown once and stored only
-- as its sha256.
CREATE TABLE api_tokens (
    id           bigserial PRIMARY KEY,
    user_id      text NOT NULL REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
    name         text NOT NULL,
    token_hash   text NOT NULL UNIQUE,
    created_at   timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz,
    expires_at   timestamptz,
    revoked_at   timestamptz
);
CREATE INDEX api_tokens_user_idx ON api_tokens (user_id);
