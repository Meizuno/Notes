"""The few places JavaScript's string semantics are part of the contract.

The Nuxt app validated with zod and serialized with JSON.stringify. Where the
difference is visible to a client — what `trim` removes, what a length of 300
means, how a timestamp is spelled — this module says it the JavaScript way,
once, so the rest of the server does not have to remember.
"""

import math
import re
from datetime import UTC, datetime

_DECIMAL = re.compile(r"^[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][+-]?[0-9]+)?$")
_RADIX = re.compile(r"^0([xX][0-9a-fA-F]+|[oO][0-7]+|[bB][01]+)$")
_INFINITY = {"Infinity": math.inf, "+Infinity": math.inf, "-Infinity": -math.inf}

# String.prototype.trim: WhiteSpace and LineTerminator. Python's str.strip()
# differs at the edges — it strips \x1c-\x1f and \x85, and keeps the BOM.
JS_WHITESPACE = (
    "\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006"
    "\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
)


def trim(value: str) -> str:
    """What zod's `.trim()` and JavaScript's `.trim()` do."""
    return value.strip(JS_WHITESPACE)


def js_length(value: str) -> int:
    """`value.length` in JavaScript: UTF-16 code units, so an emoji is two.

    zod's `.max(300)` counted these, and a limit that counted differently
    here would accept a title the Nuxt app refused.
    """
    return len(value.encode("utf-16-le")) // 2


def js_number(value: str | None) -> float:
    """`Number(value)` for a query-string value: NaN for an absent one and
    for anything that is not a number, 0 for an empty one. Python's float()
    is more forgiving ("inf", "1_000") and would read values JavaScript
    refused."""
    if value is None:
        return math.nan
    text = trim(value)
    if not text:
        return 0.0
    if _DECIMAL.match(text):
        return float(text)
    if _RADIX.match(text):
        return float(int(text, 0))
    return _INFINITY.get(text, math.nan)


def iso(moment: datetime) -> str:
    """`Date.prototype.toISOString()`: UTC, milliseconds, a trailing Z.

    Every timestamp the Nuxt app sent went through JSON.stringify, which
    spells a Date this way — `2026-05-22T12:00:00.000Z` — and the client and
    ai-chat parse exactly that. Naive values are UTC: the notes table stores
    `timestamp(3) without time zone`, which Prisma read as UTC.
    """
    if moment.tzinfo is not None:
        moment = moment.astimezone(UTC)
    millis = moment.microsecond // 1000
    return moment.strftime("%Y-%m-%dT%H:%M:%S.") + f"{millis:03d}Z"
