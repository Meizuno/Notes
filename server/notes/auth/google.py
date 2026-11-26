from urllib.parse import urlencode

import httpx

from notes.auth.exceptions import GoogleSignInFailed
from notes.auth.models import GoogleProfile

AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
EXCHANGE_ENDPOINT = "https://oauth2.googleapis.com/token"
USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo"

# Short-lived cookies that only need to survive the round trip to Google.
# Path-scoped to the callback's directory, and Lax rather than Strict because
# the callback arrives as a cross-site navigation from google.com. Named for
# this app, for the reason the session cookies are (see api/cookies.py).
STATE_COOKIE = "notes_oauth_state"
RETURN_COOKIE = "notes_oauth_return"
OAUTH_COOKIE_PATH = "/api/auth"
OAUTH_COOKIE_MAX_AGE = 600


class GoogleOAuthClient:
    """The Authorization-Code flow.

    A confidential client — the secret lives on the server — so no PKCE.
    CSRF is handled by the `state` value, echoed in a short-lived cookie and
    compared on the way back.
    """

    def __init__(self, client_id: str, client_secret: str, redirect_url: str) -> None:
        self._client_id = client_id
        self._client_secret = client_secret
        self._redirect_url = redirect_url

    def authorization_url(self, state: str) -> str:
        return f"{AUTH_ENDPOINT}?" + urlencode(
            {
                "client_id": self._client_id,
                "redirect_uri": self._redirect_url,
                "response_type": "code",
                "scope": "openid email profile",
                "state": state,
                # Nothing is done on anybody's behalf offline, so there is no
                # Google refresh token to ask for or store.
                "access_type": "online",
                "prompt": "select_account",
            }
        )

    async def exchange(self, code: str) -> GoogleProfile:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                token = await self._token(client, code)
                return await self._userinfo(client, token)
        except httpx.HTTPError as unreachable:
            raise GoogleSignInFailed(
                "could not reach Google — try again in a moment"
            ) from unreachable

    async def _token(self, client: httpx.AsyncClient, code: str) -> str:
        response = await client.post(
            EXCHANGE_ENDPOINT,
            data={
                "code": code,
                "client_id": self._client_id,
                "client_secret": self._client_secret,
                "redirect_uri": self._redirect_url,
                "grant_type": "authorization_code",
            },
        )
        if response.status_code != httpx.codes.OK:
            raise GoogleSignInFailed("google rejected the sign-in")
        access_token = response.json().get("access_token")
        if not isinstance(access_token, str) or not access_token:
            raise GoogleSignInFailed("google returned no access token")
        return access_token

    async def _userinfo(
        self, client: httpx.AsyncClient, access_token: str
    ) -> GoogleProfile:
        """Read the profile straight from Google over TLS — no id_token
        signature to check, because this never passed through the browser."""
        response = await client.get(
            USERINFO_ENDPOINT, headers={"Authorization": f"Bearer {access_token}"}
        )
        if response.status_code != httpx.codes.OK:
            raise GoogleSignInFailed("google rejected the sign-in")
        payload = response.json()
        return GoogleProfile(
            sub=str(payload.get("sub", "")),
            email=str(payload.get("email", "")),
            name=str(payload.get("name", "")),
            picture=str(payload.get("picture", "")),
            email_verified=bool(payload.get("email_verified", False)),
        )
