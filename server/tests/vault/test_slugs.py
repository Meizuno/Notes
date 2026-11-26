"""Slugs — test/server/utils/slug.test.ts, and the package's own outputs.

slug_cases.json holds what @sindresorhus/slugify 3.0.0 returned for each
input, produced by running that exact version under Node; the port must give
the same answer for every one of them.
"""

import json
from pathlib import Path

import pytest

from notes.vault.slugs import (
    RESERVED_SLUGS,
    SLUG_MAX,
    is_reserved_slug,
    slugify,
    slugify_title,
)

CASES = json.loads((Path(__file__).parent / "slug_cases.json").read_text("utf-8"))


class TestSlugifyTitle:
    def test_lowercases_and_dash_joins_ascii_titles(self):
        assert slugify_title("DDD Overview") == "ddd-overview"

    def test_transliterates_cyrillic(self):
        assert slugify_title("Канонічна форма") == "kanonichna-forma"

    def test_strips_latin_diacritics(self):
        assert slugify_title("Oběd") == "obed"

    def test_falls_back_to_note_for_whitespace_or_symbol_only_titles(self):
        assert slugify_title("   ") == "note"
        assert slugify_title("😀") == "note"

    def test_caps_the_length_and_leaves_no_trailing_dash(self):
        slug = slugify_title("word " * 60)
        assert len(slug) <= SLUG_MAX
        assert not slug.endswith("-")


@pytest.mark.parametrize(
    "case", CASES, ids=[f"{i}:{c['input'][:24]}" for i, c in enumerate(CASES)]
)
def test_matches_the_package(case):
    assert slugify(case["input"]) == case["slug"]


class TestTheProductionSlugsKeepTheirShape:
    """The quirks that are in the production table already."""

    def test_camel_case_is_split(self):
        assert slugify_title("TypeScript") == "type-script"
        assert slugify_title("JavaScript") == "java-script"

    def test_german_umlauts_spell_out(self):
        assert slugify_title("Smörgåsbord") == "smoergasbord"

    def test_ukrainian(self):
        assert slugify_title("Вітання — публічна") == "vitannya-publichna"


def test_reserved_slugs_are_the_top_level_routes():
    assert {"new", "login", "api"} == RESERVED_SLUGS
    assert is_reserved_slug("new")
    assert not is_reserved_slug("new-2")
