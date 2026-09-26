"""Live financials/multiples/valuation-input data — Yahoo Finance (via the
`yfinance` library), replacing Financial Modeling Prep (FMP). Requested by
the user: "I want to replace FMP's data with yfinance/Yahoo Finance data
so it's free" — FMP's plan kept 402/403-gating endpoints this app needs
(income-statement, analyst estimates, revenue segments), and yfinance
needs **no API key at all**, scrapes/calls Yahoo's own public endpoints,
and is free.

Feeds the same three consumers FMP used to (frontend/lib/mock-data/
stock-details.ts's multiples/growth-outlook mocks, valuation-financials.ts's
five valuation workspaces, and financial-statements.ts's chart data) — the
**public function signatures and dataclass shapes below are unchanged
from the FMP version**, so app/routers/fundamentals.py and every frontend
hook/component built on top of it needed ZERO changes for this swap.

**No API-key error case any more:** yfinance doesn't require one, so the
"missing API key" ValueError from the FMP version is gone — the only
failure mode left is "yfinance/Yahoo had no data for this ticker or the
network call failed", which is what `_require_ticker_data` below raises.

**Field/row names below are NOT verified against a live yfinance call**
(no outbound network to Yahoo's endpoints from this sandbox — same
recurring "no network access" constraint documented throughout this
project, e.g. Finnhub's unverified ".TA agorot" caveat in market_data.py
and FMP's unverified field names in this file's previous version).
yfinance's `Ticker.info` dict keys and the row labels in
`Ticker.financials`/`balance_sheet`/`cashflow` have shifted between
yfinance releases and are Yahoo-internal, undocumented strings — not a
stable public contract. `_row()` below tries several known-common label
variants per line item to reduce (not eliminate) the risk of a wrong
guess breaking everything outright, but **the first time this runs for
real, print `ticker.financials`/`.balance_sheet`/`.cashflow`/`.info` for
one ticker and confirm the labels `_row()`/`_pick()` resolve actually
match** — same verification step every other unverified-integration
caveat in this codebase calls for.

**Two real, permanent limitations (not a temporary plan gate like FMP's
was):** yfinance has no reliable, versioned analyst-estimates or
revenue-by-segment endpoint the way FMP did — `get_analyst_estimates`
uses yfinance's newer (and less stable) `earnings_estimate`/
`revenue_estimate` attributes on a best-effort basis, and
`get_revenue_segments` always returns an empty list, letting the
frontend's existing "no segment breakdown available" state (the SOTP
workspace's established single-segment fallback) do its job — same
empty-list-not-an-error convention as the FMP version's two-tier split,
just for a different, non-recoverable reason.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

import yfinance as yf

_MULTIPLES_CACHE_TTL_SECONDS = 300  # fundamentals move slowly; 5 min is plenty
_STATEMENTS_CACHE_TTL_SECONDS = 300
_ESTIMATES_CACHE_TTL_SECONDS = 3600  # analyst estimates update rarely
_SEGMENTS_CACHE_TTL_SECONDS = 3600

# Per-process in-memory caches, same caveat as market_data.py: not
# persisted or shared across workers, fine for a single-process dev/demo
# backend. Keyed by ticker (+ period/limit for statements).
_multiples_cache: dict[str, tuple[float, "CompanyMultiples"]] = {}
_statements_cache: dict[str, tuple[float, list["FinancialPeriod"]]] = {}
_estimates_cache: dict[str, tuple[float, list["AnalystEstimateYear"]]] = {}
_segments_cache: dict[str, tuple[float, list["RevenueSegment"]]] = {}


@dataclass
class CompanyMultiples:
    ticker: str
    name: str
    sector: str
    market_cap_usd: float
    price_usd: float
    pe_ratio: float | None
    ev_ebitda: float | None
    price_to_sales: float | None
    roe_pct: float | None
    roa_pct: float | None
    roic_pct: float | None  # yfinance has no ROIC field — always None, see module docstring


@dataclass
class FinancialPeriod:
    period_label: str  # e.g. "2025" (annual) or "Q3 2025" (quarterly)
    revenue_usd_m: float
    ebitda_usd_m: float | None
    net_income_usd_m: float
    fcf_usd_m: float | None
    cash_usd_m: float
    debt_usd_m: float
    shares_outstanding_m: float | None
    cogs_usd_m: float | None
    gross_profit_usd_m: float | None
    sga_usd_m: float | None
    rd_usd_m: float | None
    operating_income_usd_m: float | None
    pretax_income_usd_m: float | None
    tax_usd_m: float | None


@dataclass
class AnalystEstimateYear:
    period_label: str
    estimated_revenue_usd_m: float | None
    estimated_eps: float | None
    revenue_growth_pct: float | None
    eps_growth_pct: float | None


@dataclass
class RevenueSegment:
    name: str
    revenue_share_pct: float


def _pick(data: dict[str, Any], *keys: str) -> Any:
    """First present, non-None value among `keys` in `data` — same
    multi-alias-tolerance helper as the FMP version, now used against
    yfinance's `Ticker.info` dict."""
    for key in keys:
        value = data.get(key)
        if value is not None:
            return value
    return None


def _row(df: Any, *labels: str) -> Any:
    """First row (a pandas Series indexed by period date) among `labels`
    found in `df`'s index, or None if the DataFrame is missing/empty or
    none of the label variants are present. `df` is one of
    `Ticker.financials`/`.balance_sheet`/`.cashflow` (or their
    `quarterly_*` counterparts) — see module docstring on why several
    label variants are tried per line item."""
    if df is None or df.empty:
        return None
    for label in labels:
        if label in df.index:
            return df.loc[label]
    return None


def _cell(row: Any, column: Any) -> float | None:
    """A single period's value out of a `_row()` Series, or None if the
    row itself is None or the column/period isn't present or is NaN
    (yfinance leaves gaps as NaN rather than omitting the cell)."""
    if row is None or column not in row.index:
        return None
    value = row.loc[column]
    try:
        value = float(value)
    except (TypeError, ValueError):
        return None
    if value != value:  # NaN check without importing pandas/numpy just for this
        return None
    return value


def _as_pct(value: Any) -> float | None:
    """yfinance's ROE/ROA are typically a decimal fraction (0.245, not
    24.5) — converts to a percentage. Guarded the same way the FMP
    version was, in case a future yfinance release changes convention."""
    if value is None:
        return None
    value = float(value)
    return value * 100 if abs(value) < 5 else value


def _require_ticker_data(ticker: str, info: dict[str, Any]) -> None:
    """yfinance never raises for an unrecognized ticker — `Ticker.info`
    just comes back near-empty (missing price/market cap). This is the
    one real "does this ticker exist at all" check, replacing FMP's
    empty-array/402 signal."""
    if not info or (_pick(info, "currentPrice", "regularMarketPrice") is None and info.get("marketCap") is None):
        raise ValueError(f'לא נמצאו נתונים עבור "{ticker}" ב-Yahoo Finance — ייתכן שהטיקר שגוי')


def get_multiples(ticker: str, *, use_cache: bool = True) -> CompanyMultiples:
    """Live company profile + trailing multiples/profitability ratios.

    Raises ValueError if yfinance/Yahoo has no data at all for the ticker
    or the network call fails — no more "missing API key" case, since
    yfinance needs none.
    """
    ticker = ticker.strip().upper()

    if use_cache:
        cached = _multiples_cache.get(ticker)
        if cached is not None and time.time() - cached[0] < _MULTIPLES_CACHE_TTL_SECONDS:
            return cached[1]

    try:
        info = yf.Ticker(ticker).info or {}
    except Exception as exc:  # yfinance raises assorted exceptions on network/parse failure
        raise ValueError(f'קריאה ל-Yahoo Finance נכשלה עבור "{ticker}": {exc}') from exc

    _require_ticker_data(ticker, info)

    market_cap = info.get("marketCap")
    price = _pick(info, "currentPrice", "regularMarketPrice")

    multiples = CompanyMultiples(
        ticker=ticker,
        name=_pick(info, "longName", "shortName") or ticker,
        sector=info.get("sector") or "",
        market_cap_usd=float(market_cap) if market_cap is not None else 0.0,
        price_usd=float(price) if price is not None else 0.0,
        pe_ratio=_pick(info, "trailingPE"),
        ev_ebitda=_pick(info, "enterpriseToEbitda"),
        price_to_sales=_pick(info, "priceToSalesTrailing12Months"),
        roe_pct=_as_pct(info.get("returnOnEquity")),
        roa_pct=_as_pct(info.get("returnOnAssets")),
        roic_pct=None,  # yfinance has no ROIC field — see module docstring
    )
    _multiples_cache[ticker] = (time.time(), multiples)
    return multiples


def get_financial_statements(
    ticker: str, *, period: str = "quarter", limit: int = 8, use_cache: bool = True
) -> list[FinancialPeriod]:
    """Live income-statement + balance-sheet + cash-flow-statement data,
    combined per period, from `Ticker.financials`/`.balance_sheet`/
    `.cashflow` (or their `quarterly_*` counterparts). `period` is
    "quarter" or "annual".

    Raises ValueError when yfinance has no statement data at all for the
    ticker — statements are core to the five valuation workspaces built
    on top of them, so this does not silently degrade to an empty series.
    """
    ticker = ticker.strip().upper()
    cache_key = f"{ticker}:{period}:{limit}"

    if use_cache:
        cached = _statements_cache.get(cache_key)
        if cached is not None and time.time() - cached[0] < _STATEMENTS_CACHE_TTL_SECONDS:
            return cached[1]

    is_quarterly = period == "quarter"
    try:
        t = yf.Ticker(ticker)
        income_df = t.quarterly_financials if is_quarterly else t.financials
        balance_df = t.quarterly_balance_sheet if is_quarterly else t.balance_sheet
        cashflow_df = t.quarterly_cashflow if is_quarterly else t.cashflow
    except Exception as exc:
        raise ValueError(f'קריאה ל-Yahoo Finance (דוחות כספיים) נכשלה עבור "{ticker}": {exc}') from exc

    if income_df is None or income_df.empty:
        raise ValueError(f'לא נמצאו דוחות כספיים עבור "{ticker}" ב-Yahoo Finance — ייתכן שהטיקר שגוי')

    revenue_row = _row(income_df, "Total Revenue")
    net_income_row = _row(income_df, "Net Income", "Net Income Common Stockholders")
    ebitda_row = _row(income_df, "EBITDA", "Normalized EBITDA")
    operating_income_row = _row(income_df, "Operating Income", "Operating Income Loss")
    cogs_row = _row(income_df, "Cost Of Revenue", "Reconciled Cost Of Revenue")
    gross_profit_row = _row(income_df, "Gross Profit")
    sga_row = _row(income_df, "Selling General And Administration", "Selling General Administrative")
    rd_row = _row(income_df, "Research And Development", "Research Development")
    pretax_row = _row(income_df, "Pretax Income", "Income Before Tax")
    tax_row = _row(income_df, "Tax Provision", "Income Tax Expense")

    cash_row = _row(balance_df, "Cash And Cash Equivalents", "Cash Cash Equivalents And Short Term Investments")
    debt_row = _row(balance_df, "Total Debt")
    shares_row = _row(balance_df, "Ordinary Shares Number", "Share Issued")

    fcf_row = _row(cashflow_df, "Free Cash Flow")
    depreciation_row = _row(cashflow_df, "Depreciation And Amortization", "Depreciation Amortization Depletion")

    columns = list(income_df.columns)[: limit + 1]  # yfinance sorts most-recent-first

    periods: list[FinancialPeriod] = []
    for column in columns:
        revenue = _cell(revenue_row, column)
        net_income = _cell(net_income_row, column)
        if revenue is None or net_income is None:
            continue  # skip a malformed period rather than fail the whole series

        ebitda = _cell(ebitda_row, column)
        if ebitda is None:
            operating_income = _cell(operating_income_row, column)
            depreciation = _cell(depreciation_row, column)
            if operating_income is not None and depreciation is not None:
                ebitda = operating_income + depreciation

        year = column.year
        if is_quarterly:
            period_label = f"Q{column.quarter} {year}"
        else:
            period_label = str(year)

        shares_out = _cell(shares_row, column)

        def _m(value: float | None) -> float | None:
            return value / 1_000_000 if value is not None else None

        periods.append(
            FinancialPeriod(
                period_label=period_label,
                revenue_usd_m=revenue / 1_000_000,
                ebitda_usd_m=_m(ebitda),
                net_income_usd_m=net_income / 1_000_000,
                fcf_usd_m=_m(_cell(fcf_row, column)),
                cash_usd_m=_m(_cell(cash_row, column)) or 0.0,
                debt_usd_m=_m(_cell(debt_row, column)) or 0.0,
                shares_outstanding_m=_m(shares_out),
                cogs_usd_m=_m(_cell(cogs_row, column)),
                gross_profit_usd_m=_m(_cell(gross_profit_row, column)),
                sga_usd_m=_m(_cell(sga_row, column)),
                rd_usd_m=_m(_cell(rd_row, column)),
                operating_income_usd_m=_m(_cell(operating_income_row, column)),
                pretax_income_usd_m=_m(_cell(pretax_row, column)),
                tax_usd_m=_m(_cell(tax_row, column)),
            )
        )

    if not periods:
        raise ValueError(f'תגובת Yahoo Finance עבור "{ticker}" לא הכילה דוחות כספיים תקינים')

    _statements_cache[cache_key] = (time.time(), periods)
    return periods


_ESTIMATE_PERIOD_LABELS = {
    "0y": "שנה נוכחית",
    "+1y": "שנה הבאה",
    "+2y": "בעוד שנתיים",
    "+3y": "בעוד 3 שנים",
}


def get_analyst_estimates(ticker: str, *, limit: int = 3, use_cache: bool = True) -> list[AnalystEstimateYear]:
    """Forward analyst revenue/EPS estimates, annual, from yfinance's
    `earnings_estimate`/`revenue_estimate`. Returns an EMPTY LIST (not an
    error) whenever this data isn't available — a real, permanent
    limitation of the free Yahoo data source (yfinance's estimate
    attributes are newer/less consistently populated than FMP's dedicated
    endpoint was), not a plan gate to route around. Still raises
    ValueError on an outright transport failure other than "just missing".
    """
    ticker = ticker.strip().upper()

    if use_cache:
        cached = _estimates_cache.get(ticker)
        if cached is not None and time.time() - cached[0] < _ESTIMATES_CACHE_TTL_SECONDS:
            return cached[1]

    try:
        t = yf.Ticker(ticker)
        revenue_df = t.revenue_estimate
        eps_df = t.earnings_estimate
    except Exception:
        # Best-effort data source — treat any failure here as "not
        # available" rather than raising, since estimates are a nice-to-
        # have overlay, not core to the page the way statements are.
        _estimates_cache[ticker] = (time.time(), [])
        return []

    if revenue_df is None or revenue_df.empty:
        _estimates_cache[ticker] = (time.time(), [])
        return []

    available_keys = [k for k in _ESTIMATE_PERIOD_LABELS if k in revenue_df.index]
    if not available_keys:
        _estimates_cache[ticker] = (time.time(), [])
        return []

    years: list[AnalystEstimateYear] = []
    prev_revenue: float | None = None
    prev_eps: float | None = None
    for key in available_keys[: limit + 1]:
        try:
            revenue = float(revenue_df.loc[key, "avg"]) if "avg" in revenue_df.columns else None
        except (KeyError, TypeError, ValueError):
            revenue = None
        eps = None
        if eps_df is not None and not eps_df.empty and key in eps_df.index and "avg" in eps_df.columns:
            try:
                eps = float(eps_df.loc[key, "avg"])
            except (TypeError, ValueError):
                eps = None

        revenue_growth_pct = (
            (revenue - prev_revenue) / prev_revenue * 100 if revenue is not None and prev_revenue else None
        )
        eps_growth_pct = (eps - prev_eps) / prev_eps * 100 if eps is not None and prev_eps else None

        years.append(
            AnalystEstimateYear(
                period_label=_ESTIMATE_PERIOD_LABELS.get(key, key),
                estimated_revenue_usd_m=revenue / 1_000_000 if revenue is not None else None,
                estimated_eps=eps,
                revenue_growth_pct=revenue_growth_pct,
                eps_growth_pct=eps_growth_pct,
            )
        )
        prev_revenue, prev_eps = revenue, eps

    _estimates_cache[ticker] = (time.time(), years)
    return years


def get_revenue_segments(ticker: str, *, use_cache: bool = True) -> list[RevenueSegment]:
    """Business-segment revenue breakdown — feeds the SOTP valuation
    workspace. Yahoo Finance / yfinance has no public segment-revenue
    endpoint at all, so this ALWAYS returns an empty list. This is a
    real, permanent limitation of the free data source (not a temporary
    plan gate like FMP's was) — the SOTP workspace's established
    single-segment fallback (see valuation-financials.ts) is the intended
    behavior here, not a bug to fix."""
    return []


def clear_cache() -> None:
    """Test/debug helper — not called from the running app itself."""
    _multiples_cache.clear()
    _statements_cache.clear()
    _estimates_cache.clear()
    _segments_cache.clear()
