"""Derives trailing multiples (P/E, P/S, EV/EBITDA, ROE, ROA) from a
user-uploaded financial report, for a ticker that has NO live yfinance
multiples and no daily-scan snapshot either (e.g. yfinance doesn't cover
it, or it's a smaller/foreign/delisted company) — per the user's request:
"אני רוצה שלאחר שאני מעלה דוח של חברה יהיה לי את הנתונים הפיננסים ואת
התחזיות קדימה של החברה" (after I upload a report, I want the financial
data AND forward projections for the company).

Why this is a separate module from fundamentals.py: it has a fundamentally
different, weaker data source (one user-typed report instead of a live
feed), and every field is computed only from what the report actually
contains — a field whose inputs are missing stays None rather than being
guessed, same honesty convention as the rest of this codebase's live-data
integrations.

**Market-based multiples need a market price.** A private company's
uploaded report has no live price at all, so this can only compute
anything when a live-or-snapshot quote exists for the ticker (see
_resolve_price below) — for a genuinely private/unlisted company there is
no way to compute P/E-style multiples, and this correctly returns None for
those fields (not a bug: market multiples are undefined without a market
price by definition).

**Quarter-period annualizing:** net income/revenue/EBITDA from a quarterly
report are multiplied by 4 to approximate a trailing-twelve-month run
rate, since that's what P/E-style multiples conventionally use — a
declared approximation (not a rolling actual TTM sum across 4 real
quarters), same spirit as portfolio_performance.py's other documented
approximations in this project.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from sqlalchemy.orm import Session

from app.services import market_data, snapshot_store, uploaded_financials

if TYPE_CHECKING:
    from app.models.uploaded_financials import UploadedFinancialPeriod as UploadedFinancialPeriodRow


@dataclass
class DerivedMultiples:
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
    roic_pct: float | None  # never computed here — no invested-capital breakdown available


def _resolve_price(db: Session, ticker: str) -> float | None:
    """Live Finnhub quote first, then the last daily-scan snapshot — the
    same two-tier price source the rest of the app already trusts (see
    app/routers/market_data.py). Returns None if neither is available,
    which is the honest "no market price known" case for a genuinely
    illiquid/private ticker.
    """
    try:
        return market_data.get_quote(ticker, use_cache=True).price
    except ValueError:
        pass
    loaded = snapshot_store.load_snapshot(db, ticker, "quote")
    if loaded is not None:
        payload, _updated_at = loaded
        price = payload.get("price")
        if isinstance(price, (int, float)):
            return float(price)
    return None


def compute_from_uploaded(db: Session, ticker: str, uploaded_by_user_id: int) -> DerivedMultiples | None:
    """Returns None (not an error) when there's nothing uploaded by this
    user for this ticker, or when even a price can't be resolved — the
    router falls through to a clear 502 in that case, same as every other
    exhausted fallback chain in this app. Scoped to the calling user only
    (per-user isolation, CLAUDE.md entry 57) — one user's uploaded report
    never derives multiples for another user."""
    ticker = ticker.strip().upper()
    row: "UploadedFinancialPeriodRow | None" = uploaded_financials.get_latest_period_row(
        db, ticker, uploaded_by_user_id
    )
    if row is None:
        return None

    price_usd = _resolve_price(db, ticker)
    if price_usd is None:
        return None

    annualize = 4.0 if row.period_type == "quarter" else 1.0
    revenue_ttm_usd = row.revenue_usd_m * annualize * 1_000_000
    net_income_ttm_usd = row.net_income_usd_m * annualize * 1_000_000
    ebitda_ttm_usd = (
        row.ebitda_usd_m * annualize * 1_000_000 if row.ebitda_usd_m is not None else None
    )

    shares_m = row.shares_outstanding_m
    market_cap_usd = (shares_m * 1_000_000 * price_usd) if shares_m else None

    pe_ratio = None
    if shares_m and net_income_ttm_usd:
        eps = net_income_ttm_usd / (shares_m * 1_000_000)
        if eps > 0:
            pe_ratio = price_usd / eps

    price_to_sales = (market_cap_usd / revenue_ttm_usd) if market_cap_usd and revenue_ttm_usd else None

    ev_ebitda = None
    if market_cap_usd is not None and ebitda_ttm_usd and ebitda_ttm_usd > 0:
        net_debt_usd = ((row.debt_usd_m or 0.0) - (row.cash_usd_m or 0.0)) * 1_000_000
        ev_ebitda = (market_cap_usd + net_debt_usd) / ebitda_ttm_usd

    roe_pct = None
    if row.total_equity_usd_m and row.total_equity_usd_m > 0:
        roe_pct = (net_income_ttm_usd / (row.total_equity_usd_m * 1_000_000)) * 100

    roa_pct = None
    if row.total_assets_usd_m and row.total_assets_usd_m > 0:
        roa_pct = (net_income_ttm_usd / (row.total_assets_usd_m * 1_000_000)) * 100

    # market_cap_usd/price_usd are required (non-nullable) on the response
    # shape shared with the live/snapshot path — fall back to price-only
    # "market cap" (undefined without shares outstanding) as 0.0, which is
    # already how the rest of the app spells "unknown" for this field.
    return DerivedMultiples(
        ticker=ticker,
        name=ticker,
        sector="לא מסווג",
        market_cap_usd=market_cap_usd or 0.0,
        price_usd=price_usd,
        pe_ratio=pe_ratio,
        ev_ebitda=ev_ebitda,
        price_to_sales=price_to_sales,
        roe_pct=roe_pct,
        roa_pct=roa_pct,
        roic_pct=None,
    )
