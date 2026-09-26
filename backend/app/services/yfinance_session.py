"""Shared yfinance session + retry helper — added after discovering that
Yahoo Finance actively rate-limits/blocks requests coming from Render's
(and most cloud hosts') datacenter IP ranges with repeated
`429 Client Error: Too Many Requests` responses, even though the exact
same code worked fine from the developer's home IP during local testing
(see CLAUDE.md entry on the public-deployment yfinance 429s for how this
was diagnosed from Render's logs).

**`curl_cffi` impersonation session — tried, then reverted.** The original
version of this module passed every `yf.Ticker(...)` call a shared
`curl_cffi.requests.Session(impersonate="chrome")`, on the theory (yfinance's
own documented workaround for Yahoo's anti-bot rate limiting) that a real
Chrome TLS fingerprint would get blocked less than plain `requests`'s. In
production on Render this actually made things *worse*: every single
ticker started failing with `'str' object has no attribute 'name'` (visible
in Render's logs as "$TICKER: possibly delisted; no timezone found", which
is just yfinance's generic wrapper message for "the underlying call raised
some exception") — a real incompatibility between this yfinance version's
internal response parsing and the object curl_cffi's `Session` returns, not
a Yahoo-side rejection. **This module no longer uses curl_cffi at all** —
`get_ticker()` now always returns a plain `yf.Ticker(ticker)` with
yfinance's own default session, exactly as before either change. The
dependency stays listed in requirements.txt (harmless, unused) in case a
future yfinance release documents a working way to combine the two.

The one mitigation that remains here: **retry with exponential backoff on
429 specifically.** A burst of calls (one portfolio holding N tickers + up
to 5 benchmark ETFs, all fetched back-to-back on a cold Render instance
with an empty in-memory cache) can trip a short-lived rate limit even
without a fingerprinting issue. `call_with_retry()` retries a yfinance call
up to 3 times (1s, 3s, 9s backoff) specifically when the failure looks like
a 429/"Too Many Requests", and re-raises immediately for any other kind of
failure (a real "ticker not found" shouldn't be retried).

This is a mitigation, not a guarantee — Yahoo's public endpoints are an
undocumented, unofficial surface (see fundamentals.py's module docstring)
and can still throttle a busy public deployment. If 429s persist even with
this, the real fix is switching the affected endpoint to a paid/official
data provider (e.g. Finnhub, which this app already uses for live quotes —
see app/services/market_data.py) instead of yfinance.
"""

from __future__ import annotations

import time
from typing import Callable, TypeVar

import yfinance as yf

T = TypeVar("T")


def get_ticker(ticker: str) -> yf.Ticker:
    """Use everywhere instead of `yf.Ticker(ticker)` directly. Currently
    just a thin pass-through (see module docstring for why the earlier
    curl_cffi-backed version of this function was reverted) — kept as the
    single call site so a future change here doesn't require touching
    fundamentals.py/portfolio_performance.py again."""
    return yf.Ticker(ticker)


def _looks_like_rate_limit(exc: Exception) -> bool:
    message = str(exc)
    return "429" in message or "Too Many Requests" in message or "rate limit" in message.lower()


def call_with_retry(fn: Callable[[], T], *, retries: int = 3, base_delay_seconds: float = 1.0) -> T:
    """Calls `fn()` and retries it (up to `retries` times, waiting
    base_delay_seconds * 3^attempt between tries — 1s, 3s, 9s by default)
    only when the failure looks like a 429/rate-limit response. Any other
    exception (bad ticker, network down, parse error) is raised straight
    away on the first attempt, since retrying those just wastes time."""
    last_exc: Exception | None = None
    for attempt in range(retries + 1):
        try:
            return fn()
        except Exception as exc:  # yfinance raises assorted exception types
            last_exc = exc
            if attempt >= retries or not _looks_like_rate_limit(exc):
                raise
            time.sleep(base_delay_seconds * (3**attempt))
    # Unreachable (loop always returns or raises), but keeps type-checkers happy.
    assert last_exc is not None
    raise last_exc
