import secrets
from datetime import timedelta
from typing import Literal

from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class ConfigurationError(RuntimeError):
    """The environment is wrong, and the server will not start on it.

    Raised as one error listing everything that is wrong, rather than one per
    run: a misconfigured deploy is usually misconfigured in more than one
    way, and finding that out one restart at a time is its own kind of
    outage. Not a ValueError — pydantic wraps those into a ValidationError,
    and the result buries the list under its own framing.
    """


DATABASE_PREFIXES = ("postgres://", "postgresql://")
HTTP_PREFIXES = ("http://", "https://")
MIN_SECRET_CHARS = 32

LogLevel = Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
LogFormat = Literal["console", "json"]


def _either(name: str) -> AliasChoices:
    """A setting read unprefixed as well as with NOTES_.

    The image and the dev compose set PORT, CLIENT_DIR and RUN_MIGRATIONS bare
    — the names Forma's image uses — so those are honoured as they are, and
    NOTES_ works too for anybody who prefers one spelling for everything.
    """
    return AliasChoices(name, f"NOTES_{name}")


class Settings(BaseSettings):
    """Runtime configuration, read from the environment (12-factor).

    Every application setting carries the NOTES_ prefix. Fail-fast: the
    constraints are enforced when this is built at startup, so a
    misconfigured deploy dies before serving a request.
    """

    # Empty rather than absent, so a missing one is reported by
    # `_refuse_a_broken_environment` alongside everything else that is wrong.
    database_url: str = ""
    # The canonical origin, no trailing slash needed (https://notes.meizuno.com).
    # Used for the sitemap, robots.txt and the canonical / og: tags. Empty in
    # dev: the sitemap derives one from the request, and the head leaves the
    # absolute-URL tags out, as the Nuxt app did.
    site_url: str = ""

    # Signs the access token (HS256). Rotating it invalidates every issued
    # access token; refresh tokens live in the database and survive.
    jwt_secret: str = ""
    # Short access token, long refresh: a revoked session stops working within
    # access_ttl, while somebody who uses the app stays signed in.
    access_ttl: timedelta = timedelta(minutes=15)
    refresh_ttl: timedelta = timedelta(days=30)

    # Google sign-in — all three or none. The redirect URL must match one
    # registered on the OAuth client exactly, e.g.
    # https://notes.meizuno.com/api/auth/callback.
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_url: str = ""

    # Who may sign in: comma-separated, case-insensitive. Empty lets nobody in
    # — a vault of somebody's notes is closed until it is opened on purpose.
    allowed_emails: str = ""
    # GET /api/auth/dev?email=… signs an allowed address in with no Google at
    # all. Development only: refused when CLIENT_DIR is set (see below).
    dev_login: bool = False

    # 8000 is uvicorn's own default; the image sets 8080.
    port: int = Field(default=8000, gt=0, le=65535, validation_alias=_either("PORT"))
    # Directory of the built client (Vite dist) to serve. Empty in API-only
    # dev; set by the Docker image. It is also the signal that this process is
    # a deployment rather than somebody's laptop.
    client_dir: str = Field(default="", validation_alias=_either("CLIENT_DIR"))
    # Applies the SQL migrations on boot. The runner holds an advisory lock,
    # so two replicas coming up together cannot both apply the same file.
    run_migrations: bool = Field(
        default=True, validation_alias=_either("RUN_MIGRATIONS")
    )
    # Marks the session cookies Secure. Off for plain-HTTP local dev, because
    # a browser drops Secure cookies on http://localhost. Defaults to "on when
    # a client directory is set", which is true of the Docker image only.
    secure_cookies: bool | None = None
    # While this file exists, /health and /api/health answer 503: docker
    # rollout's pre-stop hook touches it so Traefik stops routing here before
    # the container is stopped. The path is fixed by the infra, not chosen.
    drain_file: str = "/tmp/drain"  # noqa: S108 - the rollout hook's path

    log_level: LogLevel = Field(default="INFO", validation_alias=_either("LOG_LEVEL"))
    # Unset means console on a laptop and JSON on a deployment.
    log_format: LogFormat | None = Field(
        default=None, validation_alias=_either("LOG_FORMAT")
    )

    model_config = SettingsConfigDict(
        env_prefix="NOTES_",
        env_file=".env",
        # Not "forbid": a .env is shared with compose and the client tooling.
        extra="ignore",
        case_sensitive=False,
        validate_by_name=True,
        validate_by_alias=True,
    )

    @property
    def allowed(self) -> frozenset[str]:
        """The allow-list, lowercased, blanks dropped."""
        return frozenset(
            part.strip().lower()
            for part in self.allowed_emails.split(",")
            if part.strip()
        )

    @property
    def google_configured(self) -> bool:
        return bool(
            self.google_client_id
            and self.google_client_secret
            and self.google_redirect_url
        )

    @property
    def dev_login_enabled(self) -> bool:
        """Never on a deployment, whatever the flag says. The startup check
        refuses the combination; this is the same rule where it is used."""
        return self.dev_login and not self.client_dir

    @property
    def cookies_are_secure(self) -> bool:
        if self.secure_cookies is not None:
            return self.secure_cookies
        return bool(self.client_dir)

    @property
    def logs_as_json(self) -> bool:
        if self.log_format is not None:
            return self.log_format == "json"
        return bool(self.client_dir)

    @property
    def origin(self) -> str:
        return self.site_url.rstrip("/")

    def model_post_init(self, _context: object) -> None:
        """Fall back to a random per-boot signing secret in DEVELOPMENT.

        A generated secret means every restart signs everybody out. That is
        fine on a laptop and unacceptable on a deployment, which is why a
        deployment is required to set one.
        """
        if len(self.jwt_secret) >= MIN_SECRET_CHARS or self.client_dir:
            return
        object.__setattr__(self, "jwt_secret_was_generated", True)
        object.__setattr__(self, "jwt_secret", secrets.token_urlsafe(32))

    @model_validator(mode="after")
    def _refuse_a_broken_environment(self) -> "Settings":
        """Everything that is wrong, in one message, before anything starts."""
        problems: list[str] = []

        if not self.database_url.strip():
            problems.append(
                "NOTES_DATABASE_URL is not set. It is required: there is no "
                "useful default for where the notes live."
            )
        elif not self.database_url.startswith(DATABASE_PREFIXES):
            problems.append(
                "NOTES_DATABASE_URL does not look like a Postgres URL (it starts "
                f"with {self.database_url.split(':', 1)[0]!r}); it must begin "
                f"with one of {', '.join(DATABASE_PREFIXES)}."
            )

        if self.client_dir and len(self.jwt_secret) < MIN_SECRET_CHARS:
            problems.append(
                f"NOTES_JWT_SECRET must be at least {MIN_SECRET_CHARS} characters "
                "on a deployment (CLIENT_DIR is set). Without one this server "
                "would invent a new secret on every start and sign everybody "
                "out on every release. Generate one with "
                "`openssl rand -base64 48`."
            )

        google = {
            "NOTES_GOOGLE_CLIENT_ID": self.google_client_id,
            "NOTES_GOOGLE_CLIENT_SECRET": self.google_client_secret,
            "NOTES_GOOGLE_REDIRECT_URL": self.google_redirect_url,
        }
        given = {name for name, value in google.items() if value}
        if given and len(given) != len(google):
            missing = sorted(set(google) - given)
            problems.append(
                f"Google sign-in is half configured: {', '.join(sorted(given))} "
                f"set, {', '.join(missing)} missing. All three or none."
            )
        if self.google_redirect_url and not self.google_redirect_url.startswith(
            HTTP_PREFIXES
        ):
            problems.append(
                f"NOTES_GOOGLE_REDIRECT_URL is {self.google_redirect_url!r}; it "
                "must be the absolute URL registered on the OAuth client, e.g. "
                "https://notes.meizuno.com/api/auth/callback."
            )

        if self.site_url and not self.site_url.startswith(HTTP_PREFIXES):
            problems.append(
                f"NOTES_SITE_URL is {self.site_url!r}; it must be an absolute "
                "http(s) origin such as https://notes.meizuno.com — the sitemap "
                "and the canonical links are built from it."
            )

        odd = sorted(email for email in self.allowed if "@" not in email)
        if odd:
            problems.append(
                f"NOTES_ALLOWED_EMAILS has entries that are not addresses: "
                f"{', '.join(odd)}. It is a comma-separated list of e-mails."
            )

        if self.dev_login and self.client_dir:
            problems.append(
                "NOTES_DEV_LOGIN is on and CLIENT_DIR is set. The dev sign-in "
                "lets anybody who can reach the server sign in as any allowed "
                "address without a password; it is for a laptop, never for a "
                "deployment."
            )

        if problems:
            raise ConfigurationError(
                "the environment this server was given will not work:\n"
                + "\n".join(f"  - {problem}" for problem in problems)
            )
        return self

    # Set by model_post_init; not read from the environment.
    jwt_secret_was_generated: bool = Field(default=False, exclude=True)
