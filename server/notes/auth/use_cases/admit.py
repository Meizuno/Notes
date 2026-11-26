from notes.auth.exceptions import NotAllowed
from notes.auth.models import Account, AllowList, normalize_email
from notes.auth.ports import AccountRepository


async def admit(
    accounts: AccountRepository,
    allowed: AllowList,
    email: str,
    *,
    name: str | None = None,
    picture: str | None = None,
    refresh_profile: bool = True,
) -> Account:
    """The account an address signs in as — or NotAllowed, with nothing made.

    The allow-list is asked first, before any row is read or written, so a
    refused address leaves no trace. An address already known (an account
    imported from the SSO, or one that signed in before) is matched by e-mail
    and keeps its id; otherwise a new account is opened. `refresh_profile`
    lets a sign-in that knows better (Google) update the name and picture of
    one that exists; the dev sign-in only names new ones.

    Shared by both doors — Google and the dev sign-in — so neither can admit
    somebody the other would refuse.
    """
    normalized = normalize_email(email)
    if not allowed.admits(normalized):
        raise NotAllowed("This e-mail is not allowed here")

    found = await accounts.find_by_email(normalized)
    if found is None:
        return await accounts.create(normalized, name, picture)
    if refresh_profile and (name or picture):
        refreshed = await accounts.update_profile(
            found.id, name or None, picture or None
        )
        return refreshed or found
    return found
