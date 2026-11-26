"""What a search engine and a link preview are told.

The client is a single page: the HTML that leaves this server is the built
index.html, and everything a reader sees is drawn by JavaScript afterwards.
A crawler that does not run the script sees only what is in that file — so
for a note anybody may read (PUBLIC, or shared by link) the server writes the
note's own head into it and its content, sanitized, into the mount point.

The tags are the Nuxt app's: app.vue's site-wide og:image, index.vue's home
head, [id].vue's note head. index.html marks the replaceable parts:

    <!--notes:head--> … <!--/notes:head-->   the default (home) head
    <div id="app"><!--notes:app--></div>     the mount point
"""

from collections.abc import Iterable
from html import escape
from typing import Final

import nh3
from markdown_it import MarkdownIt
from starlette.requests import Request

from notes.shared.text import iso
from notes.vault.models import Note, NoteSummary, Visibility

HEAD_OPEN: Final = "<!--notes:head-->"
HEAD_CLOSE: Final = "<!--/notes:head-->"
APP_MARK: Final = "<!--notes:app-->"

SITE_TITLE: Final = "Notes"
HOME_DESCRIPTION: Final = (
    "A self-hosted notes vault — browse a force-directed graph or a folder "
    "tree of every public note."
)
HOME_OG_DESCRIPTION: Final = "A self-hosted notes vault."

# public/og-image.png: a screenshot of the vault graph.
OG_IMAGE: Final = "og-image.png"
OG_IMAGE_WIDTH: Final = 1277
OG_IMAGE_HEIGHT: Final = 1157
OG_IMAGE_ALT: Final = "The Notes vault, visualized as a force-directed graph"


def _attr(value: str) -> str:
    return escape(value, quote=True)


def origin_of(request: Request, configured: str) -> str:
    """The site's origin, no trailing slash: NOTES_SITE_URL, or — in dev,
    where it is unset — worked out from the request the way the Nuxt
    sitemap did."""
    if configured:
        return configured.rstrip("/")
    headers = request.headers
    host = headers.get("x-forwarded-host") or headers.get("host") or "localhost:3000"
    proto = headers.get("x-forwarded-proto") or (
        "http" if host.startswith("localhost") else "https"
    )
    return f"{proto}://{host}"


def _site_wide(origin: str) -> list[str]:
    """app.vue's og:image block — only with a configured origin, because an
    og:image must be absolute."""
    if not origin:
        return []
    return [
        f'<meta property="og:image" content="{_attr(f"{origin}/{OG_IMAGE}")}">',
        '<meta property="og:image:type" content="image/png">',
        f'<meta property="og:image:width" content="{OG_IMAGE_WIDTH}">',
        f'<meta property="og:image:height" content="{OG_IMAGE_HEIGHT}">',
        f'<meta property="og:image:alt" content="{_attr(OG_IMAGE_ALT)}">',
        '<meta name="twitter:card" content="summary_large_image">',
    ]


def home_head(origin: str) -> str:
    """index.vue's head. `origin` is NOTES_SITE_URL (empty in dev, which
    leaves the absolute-URL tags out, as the Nuxt app did)."""
    tags = [
        f"<title>{SITE_TITLE}</title>",
        f'<meta name="description" content="{_attr(HOME_DESCRIPTION)}">',
        f'<meta property="og:title" content="{SITE_TITLE}">',
        f'<meta property="og:description" content="{_attr(HOME_OG_DESCRIPTION)}">',
        '<meta property="og:type" content="website">',
    ]
    if origin:
        tags.append(f'<meta property="og:url" content="{_attr(origin)}">')
    tags.append('<meta name="robots" content="index, follow">')
    if origin:
        tags.append(f'<link rel="canonical" href="{_attr(origin)}/">')
    return "\n    ".join(tags + _site_wide(origin))


def note_head(note: Note, origin: str) -> str:
    """[id].vue's head. The canonical is always the friendly slug, even when
    the page was reached by its UUID, so the two URLs fold into one result.
    A PROTECTED or PRIVATE note that is shared by link is readable but asks
    not to be indexed."""
    title = _attr(note.title)
    canonical = f"{origin}/{note.slug}" if origin else ""
    tags = [f"<title>{title}</title>"]
    if note.description:
        tags.append(f'<meta name="description" content="{_attr(note.description)}">')
    tags.append(f'<meta property="og:title" content="{title}">')
    if note.description:
        tags.append(
            f'<meta property="og:description" content="{_attr(note.description)}">'
        )
    tags.append('<meta property="og:type" content="article">')
    if canonical:
        tags.append(f'<meta property="og:url" content="{_attr(canonical)}">')
    indexable = note.visibility is Visibility.PUBLIC
    robots = "index, follow" if indexable else "noindex, nofollow"
    tags.append(f'<meta name="robots" content="{robots}">')
    if canonical:
        tags.append(f'<link rel="canonical" href="{_attr(canonical)}">')
    return "\n    ".join(tags + _site_wide(origin))


# ── The pre-rendered content ─────────────────────────────────────────────────

# CommonMark plus the two GFM extensions markdown-it carries (tables and
# strikethrough). Raw HTML is let through to the sanitizer, which is the one
# place that decides what survives — as on the client.
_MARKDOWN: Final = MarkdownIt("commonmark", {"html": True}).enable(
    ["table", "strikethrough"]
)

# What a note's HTML may contain, the same rules the client's DOMPurify
# applies: no script, style, iframe, object, embed, form or inputs, base,
# meta or link; no on* attributes (none are allowed at all); only http(s),
# mailto and relative URLs. A pasted image is a data: URL and so is dropped
# here — this copy is for crawlers, which do not need it.
_TAGS: Final = frozenset(
    {
        "a", "abbr", "b", "blockquote", "br", "code", "dd", "del", "details",
        "div", "dl", "dt", "em", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i",
        "img", "kbd", "li", "mark", "ol", "p", "pre", "q", "s", "small", "span",
        "strong", "sub", "summary", "sup", "table", "tbody", "td", "tfoot", "th",
        "thead", "tr", "u", "ul",
    }
)  # fmt: skip
_ATTRIBUTES: Final = {
    "a": {"href", "title"},
    "img": {"src", "alt", "title", "width", "height"},
    "code": {"class"},
    "ol": {"start"},
    "td": {"align"},
    "th": {"align"},
}
_URL_SCHEMES: Final = frozenset({"http", "https", "mailto"})


def sanitize(html: str) -> str:
    return nh3.clean(
        html,
        tags=set(_TAGS),
        attributes={tag: set(names) for tag, names in _ATTRIBUTES.items()},
        url_schemes=set(_URL_SCHEMES),
        link_rel="noopener noreferrer",
        strip_comments=True,
    )


def render_markdown(content: str) -> str:
    """A note's markdown as HTML that is safe to put in the page."""
    return sanitize(_MARKDOWN.render(content))


def prerender(note: Note) -> str:
    """What goes inside the mount point for a crawler: the title and the
    note, sanitized. The client replaces it when it mounts."""
    body = render_markdown(note.content)
    return f"<article><h1>{escape(note.title)}</h1>{body}</article>"


# ── robots.txt and sitemap.xml ───────────────────────────────────────────────


def robots(origin: str) -> str:
    """The Nuxt app's robots.txt: public note pages and the home page are
    crawlable; sign-in, the editor and the API are not."""
    return (
        "User-agent: *\n"
        "Disallow: /login\n"
        "Disallow: /new\n"
        "Disallow: /api/\n"
        "\n"
        f"Sitemap: {origin}/sitemap.xml\n"
    )


def _xml(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def sitemap(origin: str, pages: Iterable[NoteSummary]) -> str:
    """The home page, then every note the viewer may read, newest first —
    byte for byte the Nuxt sitemap's layout."""
    home = (
        "  <url>"
        f"<loc>{_xml(origin + '/')}</loc>"
        "<changefreq>daily</changefreq>"
        "<priority>1.0</priority>"
        "</url>"
    )
    notes = [
        "  <url>"
        f"<loc>{_xml(f'{origin}/{page.slug}')}</loc>"
        f"<lastmod>{iso(page.updated_at)}</lastmod>"
        "<changefreq>weekly</changefreq>"
        "<priority>0.8</priority>"
        "</url>"
        for page in pages
    ]
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join([home, *notes])
        + "\n</urlset>\n"
    )
