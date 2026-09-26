"""Shared yfinance session + retry helper — added after discovering that
Yahoo Finance actively rate-limits/blocks requests coming from Render's
(and most cloud hosts') datacenter IP ranges with repeated
`429 Client Error: Too Many Requests` responses, even though the exact
same code worked fine from the developer's home IP during local testing
(see CLAUDE.md entry on the public-deployment yfinance 429s for how this
was diagnosed from Render's logs).

Two independent mitigations, both applied here rather than duplicated in
every file that calls yfinance (app/services/fundamentals.py and
app/services/portfolio_performance.py):

1. **`curl_cffi` impersonation session.** Plain `requests` (yfinance's
   default HTTP client) has a distinctive TLS/HTTP fingerprint that
   Yahoo's anti-bot layer appears to flag more aggressively than a real
   browser's — this is yfinance's own documented workaround (see the
   project's README/FAQ on rate limiting) for exactly this symptom.
   `curl_cffi.requests.Session(impersonate="chrome")` presents a real
   Chrome TLS fingerprint instead. Every `yf.Ticker(...)` call in this
   codebase should go through `get_ticker()` below instead of calling
   `yf.Ticker(...)` directly, so they all benefit from this.
2. **Retry with exponential backoff on 429 specifically.** Even with the
   impersonation session, a burst of calls (one portfolio holding N
   tickers + up to 5 benchmark ETFs, all fetched back-to-back on a cold
   Render instance with an empty in-memory cache) can still trip a
   short-lived rate limit. `call_with_retry()` retries a yfinance call up
   to 3 times (1s, 3s, 7s backoff) specifically when the failure looks
   like a 429/"Too Many Requests", and re-raises immediately for any other
   kind of failure (a real "ticker not found" shouldn't be retried).

Neither mitigation is a guarantee — Yahoo's public endpoints are an
undocumented, unofficial surface (see fundamentals.py's module docstring)
and can still throttle a busy public deployment. If 429s persist even
with both of these, the real fix is switching the affected endpoint to a
paid/official data provider (e.g. Finnhub, which this app already uses
for live quotes — see app/services/market_data.py) instead of yfinance.
"""

from __future__ import annotations

import time
from typing import Callable, TypeVar

import yfinance as yf

try:
    from curl_cffi import requests as curl_cffi_requests

    _SHARED_SESSION = curl_cffi_requests.Session(impersonate="chrome")
except Exception:
    # curl_cffi not installed, or its bundled impersonation build doesn't
    # support this platform — fall back to yfinance's own default session
    # rather than crashing the whole app. Rate-limiting is then more
    # likely, but everything still works exactly as it did before this
    # module existed.
    _SHARED_SESSION = None

T = TypeVar("T")


def get_ticker(ticker: str) -> yf.Ticker:
    """Use everywhere instead of `yf.Ticker(ticker)` directly, so every
    caller shares the same browser-impersonating session (see module
    docstring)."""
    if _SHARED_SESSION is not None:
        return yf.Ticker(ticker, session=_SHARED_SESSION)
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
