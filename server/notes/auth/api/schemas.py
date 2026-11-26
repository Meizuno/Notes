from pydantic import BaseModel

from notes.auth.models import Account


class UserResponse(BaseModel):
    id: str
    email: str | None
    name: str | None
    picture: str | None


class MeResponse(BaseModel):
    """`{"user": {id, email, name, picture}}` — the Nuxt app's /api/auth/me.

    `picture` is what the SSO called `avatar_url`; a field that is unknown is
    null, as it was there.
    """

    user: UserResponse

    @classmethod
    def from_domain(cls, account: Account) -> "MeResponse":
        return cls(
            user=UserResponse(
                id=account.id,
                email=account.email,
                name=account.name,
                picture=account.picture,
            )
        )


class OkResponse(BaseModel):
    ok: bool = True


class AuthConfigResponse(BaseModel):
    """What the login page needs to know before it draws anything: whether
    the Google button can work, and whether to offer the dev sign-in."""

    google: bool
    devLogin: bool
