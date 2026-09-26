"""Real portfolio performance-by-period (replaces frontend/lib/mock-data/
performance.ts, which fed PerformancePanel.tsx with five fixed numbers
that never reflected the user's actual holdings — see CLAUDE.md entry on
"ביצועי תיק לפי תקופה" for how this was discovered).

**Central, documented approximation:** there is no historical
position-history table (no record of "you bought NVDA on this date at
this price") — only today's holdings (app/models/portfolio.py). So every
period's start-of-window value is computed as *today's quantities* priced
at their historical close on that date, not the portfolio's actual
composition back then. This is the same kind of declared approximation
used elsewhere in this codebase (e.g. the options-chain "theoretical, not
a live market quote" label) — it answers "how would my current portfolio
have performed over this window", not "what did I actually make", which
is the best a system with no trade-history ledger can honestly offer.

Benchmark returns use liquid ETF proxies (SPY/QQQ/URTH) rather than raw
index tickers, since these are the most reliably-covered symbols on
Yahoo Finance; the two TASE benchmarks (ta35/ta125) are attempted against
their Yahoo-listed index tickers but **not verified against a live run**
(same recurring "no outbound network from this sandbox" constraint as
app/services/fundamentals.py) — `_fetch_history` tries a couple of known
Yahoo symbol conventions for these two specifically, and if none of them
resolve, the benchmark is simply omitted from every period's
benchmark_returns dict rather than a fabricated number, same
no-silent-fallback convention as the rest of this app's real-data
features.
"""

from __future__ import annotations

import time
from datetime import date, timedelta

import yfinance as yf
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.portfolio import Portfolio
from app.models.schemas import PortfolioPerformancePeriod, PortfolioPerformanceResponse
from app.services import market_data

_HISTORY_CACHE_TTL_SECONDS = 3600  # daily closes don't need to be fresher than hourly
_history_cache: dict[str, tuple[float, list[tuple[date, float]]]] = {}

# id, Hebrew label, lookback in calendar days (ytd is computed specially below)
_PERIOD_DEFS: list[tuple[str, str, int]] = [
    ("weekly", "שבועי", 7),
    ("monthly", "חודשי", 30),
    ("quarterly", "רבעוני", 90),
    ("ytd", "מתחילת שנה", 0),  # placeholder, resolved per-request against today
    ("yearly", "שנתי", 365),
]

# Benchmark id -> liquid ETF/index proxy ticker(s) to try, in order, on
# Yahoo Finance. sp500/nasdaq100/msci-world are standard US-listed ETFs;
# ta35/ta125 list a couple of known Yahoo symbol conventions for the TASE
# indices since the exact one is unverified from this sandbox (see module
# docstring) — the first one yfinance returns data for wins.
BENCHMARK_PROXY_TICKERS: dict[str, list[str]] = {
    "sp500": ["SPY"],
    "nasdaq100": ["QQQ"],
    "ta35": ["^TA35.TA", "TA35.TA"],
    "ta125": ["^TA125.TA", "TA125.TA"],
    "msci-world": ["URTH"],
}


_last_fetch_error: dict[str, str] = {}  # ticker -> human-readable reason, for diagnostics only


def _fetch_history(ticker: str, *, use_cache: bool = True) -> list[tuple[date, float]]:
    """Daily close prices for `ticker` over roughly the last 400 calendar
    days (covers the "yearly" lookback with margin), sorted ascending by
    date, via yfinance (Yahoo Finance) — no API key needed. Returns an
    empty list (not an exception) when Yahoo has no data for the ticker
    or the call fails — callers treat that as "skip this ticker/
    benchmark". The failure reason is recorded in `_last_fetch_error` so
    the final all-tickers-failed message can tell the user *why* instead
    of just "no data found"."""
    ticker = ticker.strip().upper()

    if use_cache:
        cached = _history_cache.get(ticker)
        if cached is not None and time.time() - cached[0] < _HISTORY_CACHE_TTL_SECONDS:
            return cached[1]

    today = date.today()
    from_date = today - timedelta(days=400)
    try:
        history = yf.Ticker(ticker).history(start=from_date.isoformat(), end=today.isoformat())
    except Exception as exc:  # yfinance raises assorted exceptions on network/parse failure
        _last_fetch_error[ticker] = f"{ticker}: קריאת הרשת ל-Yahoo Finance נכשלה ({exc})"
        _history_cache[ticker] = (time.time(), [])
        return []

    if history is None or history.empty or "Close" not in history.columns:
        _last_fetch_error[ticker] = f"{ticker}: Yahoo Finance החזיר תגובה ריקה (ייתכן שהטיקר אינו מכוסה)"
        _history_cache[ticker] = (time.time(), [])
        return []

    series: list[tuple[date, float]] = []
    for timestamp, close in history["Close"].items():
        try:
            close_value = float(close)
        except (TypeError, ValueError):
            continue
        if close_value != close_value:  # NaN check, no pandas/numpy import needed just for this
            continue
        series.append((timestamp.date(), close_value))
    series.sort(key=lambda item: item[0])
    _history_cache[ticker] = (time.time(), series)
    if series:
        _last_fetch_error.pop(ticker, None)
    else:
        _last_fetch_error[ticker] = f"{ticker}: Yahoo Finance לא החזיר נתוני מחיר תקינים"
    return series


def _fetch_history_first_available(tickers: list[str]) -> tuple[list[tuple[date, float]], str | None]:
    """Tries each ticker in `tickers` in order (see BENCHMARK_PROXY_TICKERS'
    module docstring note on unverified TASE symbol conventions) and
    returns the first non-empty series, plus which ticker resolved (or
    None if none did)."""
    for candidate in tickers:
        series = _fetch_history(candidate)
        if series:
            return series, candidate
    return [], None


def _price_on_or_before(series: list[tuple[date, float]], target: date) -> float | None:
    """Latest close at or before `target` (markets are closed weekends/
    holidays, so an exact date match usually doesn't exist)."""
    candidate: float | None = None
    for day, close in series:
        if day > target:
            break
        candidate = close
    return candidate


def _period_targets(today: date) -> list[tuple[str, str, date]]:
    resolved = []
    for period_id, label_he, lookback_days in _PERIOD_DEFS:
        if period_id == "ytd":
            target = date(today.year, 1, 1)
        else:
            target = today - timedelta(days=lookback_days)
        resolved.append((period_id, label_he, target))
    return resolved


def compute_portfolio_performance(db: Session, portfolio: Portfolio) -> PortfolioPerformanceResponse:
    positions = list(portfolio.positions)
    if not positions:
        raise ValueError("אין עדיין החזקות בתיק — הוסיפו נייר כדי לראות ביצועים")

    today = date.today()
    period_targets = _period_targets(today)

    # For each held ticker: fetch its history once, resolve today's price
    # (prefer a live quote when available, else the series' latest close)
    # and USD-normalize via the position's own currency.
    usd_rate = None
    try:
        usd_rate = market_data.get_usd_ils_rate()
    except ValueError:
        usd_rate = settings.usd_ils_rate

    def to_usd(amount: float, currency: str) -> float:
        return amount if currency == "USD" else amount / usd_rate

    per_ticker_today_usd: dict[str, float] = {}
    per_ticker_period_usd: dict[str, dict[str, float]] = {pid: {} for pid, _, _ in period_targets}
    skipped_tickers: list[str] = []

    for pos in positions:
        series = _fetch_history(pos.ticker)
        if not series:
            skipped_tickers.append(pos.ticker)
            continue

        try:
            today_price = market_data.get_quote(pos.ticker).price
        except ValueError:
            today_price = series[-1][1]

        per_ticker_today_usd[pos.ticker] = to_usd(pos.quantity * today_price, pos.currency)

        for period_id, _, target in period_targets:
            historical_price = _price_on_or_before(series, target)
            if historical_price is None:
                continue
            per_ticker_period_usd[period_id][pos.ticker] = to_usd(
                pos.quantity * historical_price, pos.currency
            )

    if not per_ticker_today_usd:
        reasons = "; ".join(_last_fetch_error.get(pos.ticker, f"{pos.ticker}: סיבה לא ידועה") for pos in positions)
        raise ValueError(
            "לא נמצאו נתוני מחיר היסטוריים עבור אף אחד מהניירות בתיק — לא ניתן לחשב ביצועים. "
            f"פירוט: {reasons}"
        )

    total_today_usd = sum(per_ticker_today_usd.values())

    # Benchmark side: fetch each proxy's history once, compute its own
    # today-vs-target return per period. A proxy Yahoo doesn't cover is
    # dropped from every period rather than guessed at.
    benchmark_series: dict[str, list[tuple[date, float]]] = {}
    unavailable_benchmarks: list[str] = []
    for benchmark_id, proxy_tickers in BENCHMARK_PROXY_TICKERS.items():
        series, _resolved_ticker = _fetch_history_first_available(proxy_tickers)
        if series:
            benchmark_series[benchmark_id] = series
        else:
            unavailable_benchmarks.append(benchmark_id)

    periods_out: list[PortfolioPerformancePeriod] = []
    for period_id, label_he, target in period_targets:
        period_usd_by_ticker = per_ticker_period_usd[period_id]
        # Only compare tickers that have BOTH a today price and a
        # historical price for this exact period, so the numerator and
        # denominator describe the same subset of the portfolio.
        comparable_tickers = [t for t in per_ticker_today_usd if t in period_usd_by_ticker]
        total_period_usd = sum(period_usd_by_ticker[t] for t in comparable_tickers)
        total_today_comparable_usd = sum(per_ticker_today_usd[t] for t in comparable_tickers)

        if total_period_usd <= 0 or not comparable_tickers:
            return_pct = 0.0
        else:
            return_pct = (total_today_comparable_usd - total_period_usd) / total_period_usd * 100

        benchmark_returns: dict[str, float] = {}
        for benchmark_id, series in benchmark_series.items():
            start_price = _price_on_or_before(series, target)
            end_price = series[-1][1]
            if start_price and start_price > 0:
                benchmark_returns[benchmark_id] = (end_price - start_price) / start_price * 100

        periods_out.append(
            PortfolioPerformancePeriod(
                id=period_id,  # type: ignore[arg-type]
                label_he=label_he,
                return_pct=round(return_pct, 2),
                benchmark_returns={k: round(v, 2) for k, v in benchmark_returns.items()},
            )
        )

    return PortfolioPerformanceResponse(
        periods=periods_out,
        skipped_tickers=skipped_tickers,
        unavailable_benchmarks=unavailable_benchmarks,
    )
