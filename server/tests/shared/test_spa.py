"""Serving the built client: the page rules, the head and pre-render for
crawlers, robots.txt and the sitemap."""

import re
from pathlib import Path
from typing import Any

import pytest

from tests.conftest import add_note, add_user, sign_in

pytestmark = pytest.mark.usefixtures("pool")

INDEX = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <!--notes:head--><title>Notes</title>
    <meta name="description" content="DEFAULT"><!--/notes:head-->
    <script type="module" src="/assets/index-TEST.js"></script>
  </head>
  <body><div id="app"><!--notes:app--></div></body>
</html>
"""
SITE = "https://notes.example.com"

EVIL = """# Title

<script>window.__xss = 1</script>
<style>body{display:none}</style>
<iframe src="https://evil.example"></iframe>
<object data="x"></object><embed src="x">
<form action="https://evil.example"><input name="q"><button>Go</button></form>
<base href="https://evil.example/"><meta http-equiv="refresh" content="0">
<link rel="stylesheet" href="https://evil.example/x.css">
<img src="x.png" onerror="alert(1)" alt="pic">
<img src="data:image/png;base64,AAAA" alt="pasted">
<a href="javascript:alert(1)">js</a>

[md-js](javascript:alert(2))
[mail](mailto:dev@example.com) [rel](/index) [ext](https://example.com) [vb](vbscript:x)

| a | b |
|---|---|
| 1 | ~~2~~ |
"""


@pytest.fixture
def client_dir(tmp_path: Path) -> Path:
    (tmp_path / "index.html").write_text(INDEX, encoding="utf-8")
    (tmp_path / "favicon.svg").write_text("<svg/>", encoding="utf-8")
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "index-TEST.js").write_text(
        "console.log(1)", encoding="utf-8"
    )
    return tmp_path


@pytest.fixture
async def spa(make_client, client_dir):
    return await make_client(
        CLIENT_DIR=str(client_dir),
        NOTES_DEV_LOGIN=None,
        NOTES_SITE_URL=SITE,
    )


async def _signed_in_spa(make_client: Any, client_dir: Path) -> Any:
    """A session minted by a dev app, carried to one serving the client (the
    two share the database and the signing secret, as two replicas do)."""
    api = await make_client()
    await sign_in(api, "dev@example.com")
    cookies = dict(api.cookies)
    spa = await make_client(
        CLIENT_DIR=str(client_dir), NOTES_DEV_LOGIN=None, NOTES_SITE_URL=SITE
    )
    for name, value in cookies.items():
        spa.cookies.set(name, value)
    return spa


def _head(html: str) -> str:
    match = re.search(r"<!--notes:head-->(.*?)<!--/notes:head-->", html, re.S)
    assert match is not None
    return match.group(1)


def _app(html: str) -> str:
    match = re.search(r'<div id="app">(.*?)</div></body>', html, re.S)
    assert match is not None
    return match.group(1)


class TestPageRules:
    @pytest.mark.parametrize(
        ("path", "status", "location"),
        [
            ("/", 200, None),
            ("/login", 200, None),
            ("/some-note", 200, None),
            ("/new", 302, "/login"),
            ("/a/b", 302, "/login"),
            ("/notes/my-note?x=1", 301, "/my-note"),
            (
                "/notes/b5636819-edc4-491c-a492-a4719f332a2c",
                301,
                "/b5636819-edc4-491c-a492-a4719f332a2c",
            ),
        ],
    )
    async def test_anonymous(self, spa, path, status, location):
        response = await spa.get(path)
        assert response.status_code == status
        assert response.headers.get("location") == location

    @pytest.mark.parametrize(
        ("path", "status", "location"),
        [
            ("/login", 302, "/"),
            ("/new", 200, None),
            ("/a/b", 404, None),
            ("/", 200, None),
        ],
    )
    async def test_signed_in(self, make_client, client_dir, path, status, location):
        spa = await _signed_in_spa(make_client, client_dir)
        response = await spa.get(path)
        assert response.status_code == status
        assert response.headers.get("location") == location

    async def test_a_lapsed_session_is_renewed_on_a_page_too(
        self, make_client, client_dir
    ):
        spa = await _signed_in_spa(make_client, client_dir)
        spa.cookies.delete("notes_access")
        response = await spa.get("/new")
        assert response.status_code == 200
        assert "notes_access=" in response.headers["set-cookie"]

    async def test_login_with_a_query_still_bounces_a_signed_in_user(
        self, make_client, client_dir
    ):
        spa = await _signed_in_spa(make_client, client_dir)
        assert (await spa.get("/login?error=x")).status_code == 302


class TestFiles:
    async def test_serves_built_files_and_caches_assets_forever(self, spa):
        assert (await spa.get("/favicon.svg")).text == "<svg/>"
        asset = await spa.get("/assets/index-TEST.js")
        assert asset.headers["cache-control"] == "public, max-age=31536000, immutable"

    async def test_a_missing_file_is_404_not_a_page(self, spa):
        assert (await spa.get("/missing.png")).status_code == 404

    async def test_an_unknown_api_path_is_a_json_404(self, spa):
        response = await spa.get("/api/nope")
        assert response.status_code == 404
        assert response.json()["code"] == "not_found"

    async def test_a_path_cannot_leave_the_client_directory(self, spa):
        response = await spa.get("/..%2F..%2Fetc%2Fpasswd")
        assert "root:" not in response.text


class TestTheHead:
    async def test_the_home_page_head(self, spa):
        head = _head((await spa.get("/")).text)
        assert "<title>Notes</title>" in head
        assert f'<link rel="canonical" href="{SITE}/">' in head
        assert '<meta name="robots" content="index, follow">' in head
        assert f'<meta property="og:image" content="{SITE}/og-image.png">' in head
        assert "DEFAULT" not in head

    async def test_a_public_note_gets_its_own_head_and_content(self, spa, pool):
        await add_note(
            pool,
            slug="hello",
            title='Hello "world" <3',
            description="About & things",
            visibility="PUBLIC",
            is_shared=True,
            content="# Hi\n\nSome **bold** text.",
        )
        html = (await spa.get("/hello")).text
        head = _head(html)
        assert "<title>Hello &quot;world&quot; &lt;3</title>" in head
        assert '<meta name="description" content="About &amp; things">' in head
        assert '<meta property="og:type" content="article">' in head
        assert f'<link rel="canonical" href="{SITE}/hello">' in head
        assert '<meta name="robots" content="index, follow">' in head
        app = _app(html)
        assert "<strong>bold</strong>" in app
        assert "<h1>Hello &quot;world&quot; &lt;3</h1>" in app

    async def test_the_canonical_is_the_slug_even_by_uuid(self, spa, pool):
        note_id = await add_note(
            pool, slug="hello", visibility="PUBLIC", is_shared=True
        )
        head = _head((await spa.get(f"/{note_id}")).text)
        assert f'<link rel="canonical" href="{SITE}/hello">' in head

    async def test_a_shared_but_protected_note_asks_not_to_be_indexed(self, spa, pool):
        await add_note(
            pool, slug="draft", owner="bob", visibility="PRIVATE", is_shared=True
        )
        head = _head((await spa.get("/draft")).text)
        assert '<meta name="robots" content="noindex, nofollow">' in head

    async def test_a_note_not_everybody_may_read_is_served_bare(
        self, make_client, client_dir, pool
    ):
        await add_user(pool, "dev", "dev@example.com")
        await add_note(pool, slug="internal", content="secret words")
        await add_note(
            pool, slug="mine", owner="dev", visibility="PRIVATE", content="mine"
        )
        spa = await _signed_in_spa(make_client, client_dir)
        for slug in ("internal", "mine"):
            html = (await spa.get(f"/{slug}")).text
            assert "DEFAULT" in _head(html)
            assert _app(html) == "<!--notes:app-->"

    async def test_the_pre_render_is_sanitized(self, spa, pool):
        await add_note(
            pool, slug="evil", visibility="PUBLIC", is_shared=True, content=EVIL
        )
        app = _app((await spa.get("/evil")).text).lower()
        for forbidden in (
            "<script",
            "<style",
            "<iframe",
            "<object",
            "<embed",
            "<form",
            "<input",
            "<button",
            "<base",
            "<meta",
            "<link",
            "onerror",
            'href="javascript:',
            'href="vbscript:',
            'src="data:',
        ):
            assert forbidden not in app, forbidden
        assert 'href="mailto:dev@example.com"' in app
        assert 'href="/index"' in app
        assert 'href="https://example.com"' in app
        assert "<table>" in app
        assert "<s>2</s>" in app
        assert 'alt="pic"' in app


class TestRobotsAndSitemap:
    async def test_robots(self, spa):
        response = await spa.get("/robots.txt")
        assert response.text == (
            "User-agent: *\nDisallow: /login\nDisallow: /new\nDisallow: /api/\n\n"
            f"Sitemap: {SITE}/sitemap.xml\n"
        )
        assert response.headers["content-type"] == "text/plain; charset=utf-8"
        assert response.headers["cache-control"] == "public, max-age=86400"

    async def test_robots_without_a_site_url_uses_the_request(self, client):
        response = await client.get(
            "/robots.txt", headers={"x-forwarded-proto": "https", "host": "notes.dev"}
        )
        assert response.text.endswith("Sitemap: https://notes.dev/sitemap.xml\n")

    async def test_the_anonymous_sitemap_lists_public_notes_and_may_be_cached(
        self, spa, pool
    ):
        from datetime import datetime

        await add_note(
            pool,
            slug="pub",
            visibility="PUBLIC",
            is_shared=True,
            updated_at=datetime(2026, 5, 22, 12, 0, 0, 260000),
        )
        await add_note(pool, slug="internal")
        response = await spa.get("/sitemap.xml")
        assert response.headers["content-type"] == "application/xml; charset=utf-8"
        assert response.headers["cache-control"] == "public, max-age=3600"
        assert "vary" not in response.headers
        assert response.text == (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            f"  <url><loc>{SITE}/</loc><changefreq>daily</changefreq>"
            "<priority>1.0</priority></url>\n"
            f"  <url><loc>{SITE}/pub</loc><lastmod>2026-05-22T12:00:00.260Z</lastmod>"
            "<changefreq>weekly</changefreq><priority>0.8</priority></url>\n"
            "</urlset>\n"
        )

    async def test_a_signed_in_sitemap_is_theirs_and_never_shared(
        self, make_client, client_dir, pool
    ):
        await add_note(pool, slug="internal")
        spa = await _signed_in_spa(make_client, client_dir)
        response = await spa.get("/sitemap.xml")
        assert response.headers["cache-control"] == "private, no-store"
        assert response.headers["vary"] == "Cookie"
        assert f"{SITE}/internal" in response.text
