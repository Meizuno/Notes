"""The pages: the built client, served with the Nuxt app's page rules.

- `/notes/<key>` → 301 to `/<key>`: notes used to live there, and old links
  and bookmarks (UUIDs included) must keep working — before any sign-in
  check, so an anonymous visitor on an old link is not sent to sign in first.
- There is no sign-in page. `/new` needs a session: anonymous → 302 straight
  to Google (/api/auth/google), back to `/new` afterwards.
- `/login` stays for old links and bookmarks: anonymous → the same sign-in
  (back to `?return=`, or home); with a session → 302 /.
- `/` and every single-segment page (`/<slug>`) load for anybody; what a
  viewer may read is the API's business, and a note they may not see renders
  the client's not-found.
- Any deeper page: anonymous → 302 to sign in; signed in → the client with 404.
- A PUBLIC or shared note's page carries its head and a sanitized copy of its
  content (see seo.py).

robots.txt and sitemap.xml are mounted whether or not a client is served: in
development Vite proxies them here.
"""

from mimetypes import guess_type
from pathlib import Path
from typing import Final

from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.datastructures import Headers
from starlette.types import Scope

from notes.auth.api.routes.google import sign_in_location
from notes.auth.api.security import get_viewer
from notes.shared.api.dependencies import get_settings
from notes.shared.api.errors import error_response
from notes.shared.api.seo import (
    APP_MARK,
    HEAD_CLOSE,
    HEAD_OPEN,
    home_head,
    note_head,
    origin_of,
    prerender,
    robots,
    sitemap,
)
from notes.shared.config import Settings
from notes.vault.api.dependencies import (
    get_find_published_note_use_case,
    get_list_pages_use_case,
)
from notes.vault.slugs import RESERVED_SLUGS
from notes.vault.use_cases.find_published_note import (
    FindPublishedNoteCommand,
    FindPublishedNoteUseCase,
)
from notes.vault.use_cases.list_pages import ListPagesCommand, ListPagesUseCase

# Top-level pages that need a session although they look like a note slug.
# A slug can never be one of these (RESERVED_SLUGS), so `/new` is the editor.
AUTH_REQUIRED_PAGES: Final = frozenset({"new"})

seo_router = APIRouter(include_in_schema=False)


@seo_router.get("/robots.txt")
async def robots_txt(
    request: Request, settings: Settings = Depends(get_settings)
) -> Response:
    return Response(
        robots(origin_of(request, settings.site_url)),
        media_type="text/plain; charset=utf-8",
        headers={"cache-control": "public, max-age=86400"},
    )


@seo_router.get("/sitemap.xml")
async def sitemap_xml(
    request: Request,
    viewer: str | None = Depends(get_viewer),
    list_pages: ListPagesUseCase = Depends(get_list_pages_use_case),
    settings: Settings = Depends(get_settings),
) -> Response:
    """Auth-aware, as the Nuxt one was: a crawler gets the PUBLIC notes, a
    signed-in user every note they may read — which is why the latter is
    never cached anywhere it could be handed to somebody else."""
    pages = await list_pages.execute(ListPagesCommand(viewer))
    headers = (
        {"cache-control": "private, no-store", "vary": "Cookie"}
        if viewer is not None
        else {"cache-control": "public, max-age=3600"}
    )
    return Response(
        sitemap(origin_of(request, settings.site_url), pages),
        media_type="application/xml; charset=utf-8",
        headers=headers,
    )


# A year: Vite puts a hash of the contents in every name under /assets.
FOREVER: Final = "public, max-age=31536000, immutable"
# What a build may leave a squeezed copy of; images are already compressed.
SQUEEZED: Final = frozenset(
    {".js", ".css", ".html", ".svg", ".json", ".webmanifest", ".xml", ".txt", ".map"}
)


class Assets(StaticFiles):
    """The hashed build assets: kept forever, and sent pre-compressed when the
    build left a `.br` / `.gz` beside the file (Forma's, unchanged)."""

    async def get_response(self, path: str, scope: Scope) -> Response:
        full = Path(str(self.directory)) / path
        if full.suffix in SQUEEZED:
            accepted = Headers(scope=scope).get("accept-encoding", "")
            for coding, suffix in (("br", ".br"), ("gzip", ".gz")):
                if (
                    coding not in accepted
                    or not full.with_suffix(full.suffix + suffix).is_file()
                ):
                    continue
                squeezed = await super().get_response(path + suffix, scope)
                if squeezed.status_code != 200:
                    break
                squeezed.headers["content-encoding"] = coding
                squeezed.headers["content-type"] = (
                    guess_type(full.name)[0] or "application/octet-stream"
                )
                return _cacheable(squeezed)
        return _cacheable(await super().get_response(path, scope))


def _cacheable(response: Response) -> Response:
    response.headers["vary"] = "Accept-Encoding"
    if response.status_code in (200, 304):
        response.headers["cache-control"] = FOREVER
    return response


class IndexPage:
    """index.html, read once, with the head and the mount point filled in per
    page. A build without the markers is served as it is."""

    def __init__(self, index: Path) -> None:
        self._index = index
        self._html: str | None = None

    def _source(self) -> str:
        if self._html is None:
            self._html = self._index.read_text(encoding="utf-8")
        return self._html

    def render(self, *, head: str | None = None, app: str | None = None) -> str:
        html = self._source()
        if head is not None:
            before, opened, rest = html.partition(HEAD_OPEN)
            _default, closed, after = rest.partition(HEAD_CLOSE)
            if opened and closed:
                html = f"{before}{HEAD_OPEN}\n    {head}\n    {HEAD_CLOSE}{after}"
        if app is not None:
            html = html.replace(APP_MARK, app, 1)
        return html


def mount_spa(app: FastAPI, client_dir: Path) -> None:
    """Serve the built client from CLIENT_DIR, with the page rules above."""
    assets = client_dir / "assets"
    if assets.is_dir():
        app.mount("/assets", Assets(directory=assets), name="assets")

    root = client_dir.resolve()
    page = IndexPage(client_dir / "index.html")

    @app.get("/notes/{key}", include_in_schema=False)
    async def legacy_note(request: Request, key: str) -> RedirectResponse:
        # The raw segment, so a percent-encoded slug arrives encoded as it
        # was sent. The query string is dropped, as the Nuxt redirect did.
        raw = request.scope.get("raw_path", b"").decode("latin-1").split("/")[-1] or key
        return RedirectResponse(f"/{raw}", status_code=301)

    @app.get("/", include_in_schema=False)
    async def home(settings: Settings = Depends(get_settings)) -> Response:
        return HTMLResponse(page.render(head=home_head(settings.origin)))

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(
        request: Request,
        path: str,
        viewer: str | None = Depends(get_viewer),
        find_published: FindPublishedNoteUseCase = Depends(
            get_find_published_note_use_case
        ),
        settings: Settings = Depends(get_settings),
    ) -> Response:
        if path == "api" or path.startswith("api/"):
            # An API typo answers as an error, never with a page.
            message = f"Page not found: /{path}"
            return error_response(request, 404, message, message, code="not_found")

        candidate = (client_dir / path).resolve()
        # Resolved and compared, so a crafted path cannot leave the directory.
        if candidate.is_file() and candidate.is_relative_to(root):
            return FileResponse(candidate)
        if "." in path.rsplit("/", 1)[-1]:
            # Looks like a file and is not one: no page will make it one.
            message = f"Page not found: /{path}"
            return error_response(request, 404, message, message, code="not_found")

        segments = path.split("/")
        if path == "login":
            if viewer is not None:
                return RedirectResponse("/", status_code=302)
            back = request.query_params.get("return", "/")
            return RedirectResponse(sign_in_location(back), status_code=302)
        if len(segments) > 1 or path in AUTH_REQUIRED_PAGES:
            if viewer is None:
                here = request.url.path
                if request.url.query:
                    here = f"{here}?{request.url.query}"
                return RedirectResponse(sign_in_location(here), status_code=302)
            if len(segments) > 1:
                return HTMLResponse(page.render(), status_code=404)
            return HTMLResponse(page.render())

        if path in RESERVED_SLUGS:
            return HTMLResponse(page.render())
        # A note page. Its head and content go into the page only when anybody
        # may read it — PUBLIC, or shared by link — whoever is asking: a page
        # that differs by viewer is one a cache could hand to the wrong person.
        note = await find_published.execute(FindPublishedNoteCommand(path))
        if note is None:
            return HTMLResponse(page.render())
        return HTMLResponse(
            page.render(head=note_head(note, settings.origin), app=prerender(note))
        )
