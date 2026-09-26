"""Portfolio tracking endpoints (Phase 3: real, persisted "My Portfolio").

Replaces the Phase 1/2 mock-holdings stub: every logged-in user now gets
their own Portfolio row (created lazily on first access, starting empty
— see PortfolioNudgeModal for the "let's build it" onboarding flow) with
real positions and cash, all read from and written to the database.

Live market data (Finnhub — app/services/market_data.py) now backs a
position's "current price"/day-change and the USD/ILS conversion rate,
replacing the old always-0%/avg-cost placeholder. Both fall back
honestly (not silently) when a live quote/rate isn't available — see
`price_is_live`/`fx_rate_is_live` on the response schemas — rather than
fabricating a number, same convention as the rest of the app's real-data
features.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.portfolio import Portfolio, PortfolioPosition
from app.models.schemas import (
    CashDepositCreate,
    PortfolioPerformanceResponse,
    PortfolioPositionCreate,
    PortfolioPositionOut,
    PortfolioStateResponse,
)
from app.models.user import User
from app.services import market_data, portfolio_performance

router = APIRouter()


def _to_usd(amount: float, currency: str, usd_ils_rate: float) -> float:
    """Convert an amount in `currency` to USD using the given rate. Never
    mix an amount in one currency with a price/rate in another — see the
    "currency consistency" note in CLAUDE.md; this is the one place that
    conversion happens."""
    if currency == "USD":
        return amount
    return amount / usd_ils_rate


def _resolve_usd_ils_rate() -> tuple[float, bool]:
    """Live USD/ILS rate (Finnhub) when available, else the fixed
    settings.usd_ils_rate fallback. Returns (rate, is_live)."""
    try:
        return market_data.get_usd_ils_rate(), True
    except ValueError:
        return settings.usd_ils_rate, False


def _get_or_create_portfolio(db: Session, user: User) -> Portfolio:
    portfolio = db.query(Portfolio).filter(Portfolio.user_id == user.id).first()
    if portfolio is None:
        portfolio = Portfolio(user_id=user.id, cash_usd=0.0)
        db.add(portfolio)
        db.commit()
        db.refresh(portfolio)
    return portfolio


def _serialize(portfolio: Portfolio) -> PortfolioStateResponse:
    usd_ils_rate, fx_rate_is_live = _resolve_usd_ils_rate()

    # total_usd/total_usd_prev track the portfolio's value today and as of
    # yesterday's close (cash doesn't move intraday), so the portfolio-level
    # day change below is a real weighted figure, not a placeholder.
    total_usd = portfolio.cash_usd
    total_usd_prev = portfolio.cash_usd
    rows: list[tuple[PortfolioPosition, float, float, bool, float]] = []

    for pos in portfolio.positions:
        try:
            quote = market_data.get_quote(pos.ticker)
            price = quote.price
            previous_close = quote.previous_close
            day_change_pct = quote.day_change_pct
            price_is_live = True
        except ValueError:
            # No live quote available (no API key / ticker not recognized /
            # upstream call failed) — honestly fall back to avg cost (0%
            # unrealized P&L), exactly what this endpoint always reported
            # before live data existed, rather than fabricating a move.
            price = pos.avg_cost
            previous_close = pos.avg_cost
            day_change_pct = 0.0
            price_is_live = False

        amount_usd = _to_usd(pos.quantity * price, pos.currency, usd_ils_rate)
        amount_usd_prev = _to_usd(pos.quantity * previous_close, pos.currency, usd_ils_rate)
        total_usd += amount_usd
        total_usd_prev += amount_usd_prev
        rows.append((pos, price, day_change_pct, price_is_live, amount_usd))

    positions_out = [
        PortfolioPositionOut(
            ticker=pos.ticker,
            name_he=pos.name_he,
            sector_name_he=pos.sector_name_he,
            currency=pos.currency,
            amount_original=pos.amount_original,
            amount_usd=amount_usd,
            quantity=pos.quantity,
            avg_cost=pos.avg_cost,
            price=price,
            day_change_pct=day_change_pct,
            price_is_live=price_is_live,
            weight_pct=(amount_usd / total_usd * 100) if total_usd else 0.0,
        )
        for pos, price, day_change_pct, price_is_live, amount_usd in rows
    ]

    day_change_usd = total_usd - total_usd_prev
    day_change_pct = (day_change_usd / total_usd_prev * 100) if total_usd_prev else 0.0

    return PortfolioStateResponse(
        cash_usd=portfolio.cash_usd,
        total_usd=total_usd,
        day_change_pct=day_change_pct,
        day_change_usd=day_change_usd,
        positions=positions_out,
        fx_rate_is_live=fx_rate_is_live,
    )


@router.get("/me", response_model=PortfolioStateResponse)
def get_my_portfolio(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> PortfolioStateResponse:
    portfolio = _get_or_create_portfolio(db, current_user)
    return _serialize(portfolio)


@router.get("/performance", response_model=PortfolioPerformanceResponse)
def get_portfolio_performance(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> PortfolioPerformanceResponse:
    """Real weekly/monthly/quarterly/YTD/yearly portfolio returns against
    real benchmark ETF-proxy returns — see app/services/portfolio_performance.py
    for the calculation and its documented approximation (today's holdings
    priced historically, since there's no trade-history ledger). Replaces
    the fixed mock numbers frontend/lib/mock-data/performance.ts fed
    PerformancePanel.tsx, which never reflected the user's actual holdings."""
    portfolio = _get_or_create_portfolio(db, current_user)
    try:
        return portfolio_performance.compute_portfolio_performance(db, portfolio)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@router.post("/cash", response_model=PortfolioStateResponse, status_code=status.HTTP_201_CREATED)
def deposit_cash(
    payload: CashDepositCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PortfolioStateResponse:
    """Add cash to the user's real portfolio. A brand-new portfolio is
    created empty with cash_usd=0.0 (see _get_or_create_portfolio) and,
    until now, had no way to be funded at all — the "+" add-position
    control on "התיק שלי" always failed with "the amount exceeds the
    portfolio's free cash ($0)". This is the "define your portfolio size"
    step for the real portfolio, equivalent to what the hypothetical
    Portfolio Builder tabs call `handleSetSize`, except additive (you can
    top up an existing portfolio, not just set its starting size once)."""
    portfolio = _get_or_create_portfolio(db, current_user)
    usd_ils_rate, _ = _resolve_usd_ils_rate()
    portfolio.cash_usd += _to_usd(payload.amount, payload.currency, usd_ils_rate)
    db.commit()
    db.refresh(portfolio)
    return _serialize(portfolio)


@router.post("/positions", response_model=PortfolioStateResponse, status_code=status.HTTP_201_CREATED)
def add_position(
    payload: PortfolioPositionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PortfolioStateResponse:
    portfolio = _get_or_create_portfolio(db, current_user)
    ticker = payload.ticker.upper()
    usd_ils_rate, _ = _resolve_usd_ils_rate()
    amount_usd = _to_usd(payload.amount_original, payload.currency, usd_ils_rate)

    existing = next((p for p in portfolio.positions if p.ticker == ticker), None)
    if existing is not None:
        # Quantity is just a share count, so it adds up regardless of
        # which currency each purchase was made in.
        new_shares = payload.amount_original / payload.price
        new_quantity = existing.quantity + new_shares

        # Weighted-average cost basis. If both purchases were in the same
        # currency, blend directly in it; otherwise blend in USD (and the
        # position's currency becomes USD from here on) — this is the one
        # case the old client-only version got wrong (it added the dollar
        # amounts together but never touched quantity/avg_cost, so the
        # displayed average cost silently went stale after a second buy
        # in a different currency).
        if existing.currency == payload.currency:
            existing_cost = existing.quantity * existing.avg_cost
            added_cost = new_shares * payload.price
            existing.avg_cost = (existing_cost + added_cost) / new_quantity if new_quantity else 0.0
            existing.amount_original = existing.amount_original + payload.amount_original
        else:
            existing_cost_usd = _to_usd(existing.quantity * existing.avg_cost, existing.currency, usd_ils_rate)
            new_cost_usd = amount_usd  # new_shares * price, already converted to USD
            existing.avg_cost = (existing_cost_usd + new_cost_usd) / new_quantity if new_quantity else 0.0
            existing.amount_original = (
                _to_usd(existing.amount_original, existing.currency, usd_ils_rate) + amount_usd
            )
            existing.currency = "USD"
        existing.quantity = new_quantity
    else:
        quantity = payload.amount_original / payload.price
        db.add(
            PortfolioPosition(
                portfolio_id=portfolio.id,
                ticker=ticker,
                name_he=payload.name_he,
                sector_name_he=payload.sector_name_he,
                currency=payload.currency,
                amount_original=payload.amount_original,
                quantity=quantity,
                avg_cost=payload.price,
            )
        )

    portfolio.cash_usd = max(portfolio.cash_usd - amount_usd, 0.0)
    db.commit()
    db.refresh(portfolio)
    return _serialize(portfolio)


@router.delete("/positions/{ticker}", response_model=PortfolioStateResponse)
def remove_position(
    ticker: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PortfolioStateResponse:
    portfolio = _get_or_create_portfolio(db, current_user)
    ticker = ticker.upper()
    existing = next((p for p in portfolio.positions if p.ticker == ticker), None)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="הנייר לא נמצא בתיק")

    usd_ils_rate, _ = _resolve_usd_ils_rate()
    amount_usd = _to_usd(existing.quantity * existing.avg_cost, existing.currency, usd_ils_rate)
    portfolio.cash_usd += amount_usd
    db.delete(existing)
    db.commit()
    db.refresh(portfolio)
    return _serialize(portfolio)
