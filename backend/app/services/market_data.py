"""Live market-data quotes and FX rate (Finnhub) — Phase 3, second track.

Replaces the mock prices in frontend/lib/mock-data/stock-prices.ts and the
fixed USD_ILS_RATE (settings.usd_ils_rate) with a real, live source. See
the module docstrings in app/routers/portfolio.py and that frontend file
for what depended on the old mock values and now switches to this.

Real Finnhub API calls — not mock data (same declared exception as the
rest of the app's "real AI"/"real web-search" features) — but a plain
REST quote lookup, not an AI call. Requires FINNHUB_API_KEY; without it,
every function here raises ValueError with a clear Hebrew message rather
than falling back to a fabricated number — same no-silent-fallback
convention as ANTHROPIC_API_KEY in app/services/research.py.

Caching: Finnhub's free tier allows 60 calls/minute. A short in-memory
TTL cache (per-process, not shared across workers — fine for a
single-process dev/demo backend, same caveat as the JSON-file caches in
app/services/alerts.py and research.py) keeps a screen that requests the
same handful of tickers repeatedly (e.g. the portfolio view, refreshed
often) from burning through that budget on every request. Quotes are
cached briefly (prices actually move); the FX rate is cached much
longer (it barely needs to be second-fresh, and halving its call volume
matters more given how many screens read it).

**Known caveat, NOT verified against a live key in this environment**
(no outbound network to finnhub.io from this sandbox — see CLAUDE.md's
recurring "no network access" note): Tel Aviv Stock Exchange tickers
(".TA" suffix, e.g. TEVA.TA) are commonly quoted by data vendors,
Finnhub included, in agorot (1/100 of a shekel) rather than whole
shekels. `get_quote` divides by 100 for ".TA" tickers to correct for
this. **Verify this assumption against a real quote (e.g. TEVA.TA) the
first time this runs with a real API key** — if Finnhub already returns
whole shekels for that symbol, remove the division in `get_quote`.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

import httpx

from app.core.config import settings

FINNHUB_BASE_URL = "https://finnhub.io/api/v1"

_QUOTE_CACHE_TTL_SECONDS = 20
_FX_CACHE_TTL_SECONDS = 300

# Per-process in-memory caches: {ticker: (fetched_at_epoch, Quote)} /
# {"USD_ILS": (fetched_at_epoch, rate)}. Intentionally not persisted or
# shared — see module docstring.
_quote_cache: dict[str, tuple[float, "Quote"]] = {}
_fx_cache: dict[str, tuple[float, float]] = {}
_news_cache: dict[str, tuple[float, list["NewsItem"]]] = {}
_NEWS_CACHE_TTL_SECONDS = 15 * 60
_NEWS_LOOKBACK_DAYS = 10


@dataclass
class Quote:
    ticker: str
    price: float
    previous_close: float
    day_change_pct: float


def _require_api_key() -> str:
    if not settings.finnhub_api_key:
        raise ValueError(
            "נתוני שוק חיים אינם זמינים כרגע — לא הוגדר מפתח API (FINNHUB_API_KEY) בשרת"
        )
    return settings.finnhub_api_key


def get_quote(ticker: str, *, use_cache: bool = True) -> Quote:
    """Look up a live quote for `ticker`.

    Raises ValueError if the API key is missing, the Finnhub call fails,
    or the ticker isn't recognized by Finnhub at all — Finnhub reports an
    unknown symbol as an all-zero-fields 200 response rather than an HTTP
    error, so that case is detected explicitly below rather than treated
    as a real $0 quote.
    """
    ticker = ticker.strip().upper()
    api_key = _require_api_key()

    if use_cache:
        cached = _quote_cache.get(ticker)
        if cached is not None and time.time() - cached[0] < _QUOTE_CACHE_TTL_SECONDS:
            return cached[1]

    try:
        response = httpx.get(
            f"{FINNHUB_BASE_URL}/quote",
            params={"symbol": ticker, "token": api_key},
            timeout=10.0,
        )
        response.raise_for_status()
        data = response.json()
    except httpx.HTTPError as exc:
        raise ValueError(f'קריאה ל-Finnhub API נכשלה עבור "{ticker}": {exc}') from exc

    current_price = data.get("c")
    previous_close = data.get("pc")
    if not current_price and not previous_close:
        raise ValueError(
            f'לא נמצא ציטוט חי עבור "{ticker}" — ייתכן שהטיקר שגוי או שאינו נתמך על ידי הספק'
        )

    # See module docstring: TASE tickers are commonly quoted in agorot.
    if ticker.endswith(".TA"):
        current_price = current_price / 100
        previous_close = previous_close / 100

    day_change_pct = (
        ((current_price - previous_close) / previous_close) * 100 if previous_close else 0.0
    )

    quote = Quote(
        ticker=ticker,
        price=round(current_price, 4),
        previous_close=round(previous_close, 4),
        day_change_pct=round(day_change_pct, 4),
    )
    _quote_cache[ticker] = (time.time(), quote)
    return quote


def get_quotes_batch(tickers: list[str]) -> dict[str, Quote]:
    """Looks up several tickers, one Finnhub call each (each individually
    cached/short-TTL as in `get_quote`). Used by the watched-indices card
    (app/routers/market_data.py's /quotes endpoint) to refresh many
    ETF/index proxies in one request from the frontend instead of one
    round-trip per row. A ticker that fails (unrecognized symbol, upstream
    error) is simply **omitted** from the result rather than failing the
    whole batch — same "some rows stay mock, don't blank out the screen"
    convention used throughout this app (e.g. portfolio_performance.py's
    unavailable benchmarks)."""
    results: dict[str, Quote] = {}
    for ticker in tickers:
        try:
            results[ticker.strip().upper()] = get_quote(ticker)
        except ValueError:
            continue
    return results


def get_usd_ils_rate(*, use_cache: bool = True) -> float:
    """Live USD->ILS rate, replacing the fixed settings.usd_ils_rate /
    frontend USD_ILS_RATE constant. Raises ValueError on a missing API
    key or a failed/malformed Finnhub response."""
    api_key = _require_api_key()
    cache_key = "USD_ILS"

    if use_cache:
        cached = _fx_cache.get(cache_key)
        if cached is not None and time.time() - cached[0] < _FX_CACHE_TTL_SECONDS:
            return cached[1]

    try:
        response = httpx.get(
            f"{FINNHUB_BASE_URL}/forex/rates",
            params={"base": "USD", "token": api_key},
            timeout=10.0,
        )
        response.raise_for_status()
        data = response.json()
    except httpx.HTTPError as exc:
        raise ValueError(f"קריאה ל-Finnhub API (שער חליפין) נכשלה: {exc}") from exc

    rate = (data.get("quote") or {}).get("ILS")
    if not rate:
        raise ValueError("שער USD/ILS לא הוחזר מ-Finnhub — תגובה לא צפויה מהספק")

    _fx_cache[cache_key] = (time.time(), rate)
    return rate


@dataclass
class NewsItem:
    headline: str
    source: str
    url: str
    published_at_iso: str
    summary: str


def get_company_news(ticker: str, limit: int = 8) -> list[NewsItem]:
    """Real recent news for one company from Finnhub's /company-news —
    actual headlines with their publisher's working article URL, newest
    first (last ~10 days). Replaces the stock card's fixed mock news, whose
    links pointed at example.com.

    Finnhub's free tier covers North American companies; for others (e.g.
    ".TA" tickers) it returns no items, which comes back as an empty list
    rather than an error. Raises ValueError only for a missing API key or
    a failed call.
    """
    api_key = _require_api_key()
    ticker = ticker.strip().upper()
    cached = _news_cache.get(ticker)
    if cached and time.time() - cached[0] < _NEWS_CACHE_TTL_SECONDS:
        return cached[1][:limit]

    today = date.today()
    try:
        response = httpx.get(
            f"{FINNHUB_BASE_URL}/company-news",
            params={
                "symbol": ticker,
                "from": (today - timedelta(days=_NEWS_LOOKBACK_DAYS)).isoformat(),
                "to": today.isoformat(),
                "token": api_key,
            },
            timeout=10.0,
        )
        response.raise_for_status()
        raw = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise ValueError(f"שליפת חדשות מ-Finnhub נכשלה: {exc}") from exc

    items: list[NewsItem] = []
    seen: set[str] = set()
    for entry in sorted(raw if isinstance(raw, list) else [], key=lambda e: e.get("datetime") or 0, reverse=True):
        headline = (entry.get("headline") or "").strip()
        url = (entry.get("url") or "").strip()
        timestamp = entry.get("datetime")
        if not headline or not url.startswith("http") or not timestamp or headline.lower() in seen:
            continue
        seen.add(headline.lower())
        items.append(
            NewsItem(
                headline=headline,
                source=(entry.get("source") or "").strip(),
                url=url,
                published_at_iso=datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat(),
                summary=(entry.get("summary") or "").strip(),
            )
        )

    _news_cache[ticker] = (time.time(), items)
    return items[:limit]


def clear_cache() -> None:
    """Test/debug helper — not called from the running app itself."""
    _quote_cache.clear()
    _fx_cache.clear()
    _news_cache.clear()
