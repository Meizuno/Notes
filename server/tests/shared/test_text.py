import math
from datetime import UTC, datetime, timedelta, timezone

import pytest

from notes.shared.text import iso, js_length, js_number, trim


class TestTrim:
    def test_strips_what_javascript_strips(self):
        assert trim("\ufeff\u00a0 Hello \u3000\n") == "Hello"

    def test_keeps_what_javascript_keeps(self):
        # \x1c is whitespace to Python's strip() and not to JavaScript's trim.
        assert trim("\x1cx\x85") == "\x1cx\x85"


def test_length_counts_utf16_units_like_javascript():
    assert js_length("abc") == 3
    assert js_length("😀") == 2
    assert js_length("Вітання") == 7


class TestIso:
    def test_spells_a_naive_utc_timestamp_as_to_iso_string_does(self):
        assert (
            iso(datetime(2026, 5, 22, 12, 0, 0, 260000)) == "2026-05-22T12:00:00.260Z"
        )

    def test_always_three_digits_of_milliseconds(self):
        assert iso(datetime(2026, 1, 2, 3, 4, 5)) == "2026-01-02T03:04:05.000Z"

    def test_converts_an_aware_one_to_utc(self):
        plus_two = timezone(timedelta(hours=2))
        moment = datetime(2026, 1, 2, 14, 0, 0, 999999, tzinfo=plus_two)
        assert iso(moment) == "2026-01-02T12:00:00.999Z"
        assert iso(moment.astimezone(UTC)) == iso(moment)


class TestNumber:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [("50", 50), (" 7 ", 7), ("1e1", 10), ("0x10", 16), ("", 0), ("2.5", 2.5)],
    )
    def test_reads_what_number_reads(self, raw, expected):
        assert js_number(raw) == expected

    @pytest.mark.parametrize("raw", [None, "abc", "inf", "1_000", "5px"])
    def test_nan_for_what_number_refuses(self, raw):
        assert math.isnan(js_number(raw))
