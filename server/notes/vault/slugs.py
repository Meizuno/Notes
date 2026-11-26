"""Note title → URL slug, the way the Nuxt app made them.

It used @sindresorhus/slugify 3.0.0 with its defaults, and every slug in the
production table came out of it — so this is a port of that function, step by
step, over the same transliteration table (vault/transliteration.py, generated
from the package). tests/vault/slug_cases.json holds its real outputs for a
corpus of titles, and the tests hold this to them.

The quirks are its, kept on purpose: "TypeScript" is `type-script` (it
splits camelCase), "Ö" is `oe` (German first), and a title in a script it has
no table for — Chinese, Japanese — slugs to nothing and becomes `note`.
"""

import re
import unicodedata
from typing import Final

from notes.shared.text import JS_WHITESPACE, js_length
from notes.vault.transliteration import DIACRITIC_RANGES, REPLACEMENTS

SLUG_MAX: Final = 80
SLUG_FALLBACK: Final = "note"

# Slugs a note may not take: notes are served at the root (`/<slug>`) and
# would otherwise shadow these top-level routes. The uniqueness loop treats a
# reserved slug as taken and falls through to `<base>-2`.
RESERVED_SLUGS: Final = frozenset({"new", "login", "api"})

# slugify's own replacements, applied before the table: `&` → " and ", …
_OVERRIDABLE: Final = (("&", " and "), ("🦄", " unicorn "), ("♥", " love "))


def _alternation(keys: list[str]) -> re.Pattern[str]:
    # Longest first, as the package sorts them — by JavaScript length, which
    # counts UTF-16 units — so a multi-character key wins over its prefix.
    ordered = sorted(keys, key=js_length, reverse=True)
    return re.compile("|".join(re.escape(key) for key in ordered))


_TABLE: Final = _alternation(list(REPLACEMENTS))
_DIACRITIC: Final = re.compile(
    "["
    + "".join(f"{re.escape(chr(a))}-{re.escape(chr(b))}" for a, b in DIACRITIC_RANGES)
    + "]"
)

# JavaScript's \d is ASCII-only, Python's is not; [0-9] says what was meant.
_DECAMELIZE: Final = (
    (re.compile(r"([A-Z]{2,})([0-9]+)"), r"\1 \2"),
    (re.compile(r"([a-z0-9]+)([A-Z]{2,})"), r"\1 \2"),
    (re.compile(r"([a-z0-9])([A-Z])"), r"\1 \2"),
    # [a-rt-z]: every lowercase letter but `s`, so a plural acronym such as
    # "APIs" stays whole.
    (re.compile(r"([A-Z]+)([A-Z][a-rt-z0-9]+)"), r"\1 \2"),
)
# A word-final 't or 's loses its apostrophe: "Conway's Law" → conways-law.
# \Z, not $: JavaScript's $ does not match before a trailing newline.
_CONTRACTION: Final = re.compile(
    rf"([a-zA-Z0-9]+)['\u2019]([ts])([{re.escape(JS_WHITESPACE)}]|\Z)"
)
_NOT_SLUG: Final = re.compile(r"[^a-z0-9]+")
_REPEATED_DASH: Final = re.compile(r"-{2,}")
_EDGE_DASH: Final = re.compile(r"^-|-\Z")


def transliterate(text: str) -> str:
    """@sindresorhus/transliterate 2.3.1 with slugify's custom replacements."""
    text = unicodedata.normalize("NFC", text)
    for key, value in _OVERRIDABLE:
        text = text.replace(key, value)
    text = _TABLE.sub(lambda match: REPLACEMENTS[match.group(0)], text)
    text = _DIACRITIC.sub("", unicodedata.normalize("NFD", text))
    text = unicodedata.normalize("NFC", text)
    # Every kind of dash to a hyphen-minus (\p{Dash_Punctuation} is Pd).
    return "".join("-" if unicodedata.category(c) == "Pd" else c for c in text)


def slugify(text: str) -> str:
    """@sindresorhus/slugify 3.0.0 with its default options."""
    text = transliterate(text)
    for pattern, replacement in _DECAMELIZE:
        text = pattern.sub(replacement, text)
    text = text.lower()
    text = _CONTRACTION.sub(r"\1\2\3", text)
    text = _NOT_SLUG.sub("-", text)
    text = text.replace("\\", "")
    text = _REPEATED_DASH.sub("-", text)
    return _EDGE_DASH.sub("", text)


def slugify_title(title: str) -> str:
    """The base slug for a title: slugified, capped at eighty characters with
    no trailing dash left by the cut, and `note` for a title that reduces to
    nothing (whitespace, emoji, a script with no table)."""
    slug = slugify(title)[:SLUG_MAX].rstrip("-")
    return slug or SLUG_FALLBACK


def is_reserved_slug(slug: str) -> bool:
    return slug in RESERVED_SLUGS
