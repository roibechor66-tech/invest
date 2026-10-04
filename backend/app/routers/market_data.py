"""Live market-data endpoints (Phase 3, second track).

See app/services/market_data.py for the Finnhub integration itself,
including the no-API-key error convention and the ".TA" agorot caveat
that still needs verifying against a real API key.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.schemas import CompanyNewsItem, FxRateResponse, QuoteResponse
from app.models.user import User
from app.services import market_data, snapshot_store

router = APIRouter()


def _quote_from_snapshot(db: Session, ticker: str) -> QuoteResponse | None:
    """Last daily-scan snapshot for this ticker's quote (see
    app/routers/admin.py), or None if none exists — used as the fallback
    when the live Finnhub call fails."""
    loaded = snapshot_store.load_snapshot(db, ticker, "quote")
    if loaded is None:
        return None
    payload, _updated_at = loaded
    return QuoteResponse(
        ticker=payload["ticker"],
        price=payload["price"],
        previous_close=payload["previous_close"],
        day_change_pct=payload["day_change_pct"],
        source="snapshot",
    )


@router.get("/quote/{ticker}", response_model=QuoteResponse)
def get_quote_endpoint(
    ticker: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> QuoteResponse:
    """Live price + today's % change for a single ticker.

    Real Finnhub call, not mock data (same declared exception as the rest
    of the app's real-data features). Falls back to the last daily-scan
    snapshot (source="snapshot") if the live call fails; only raises 502
    when there's no snapshot either — never a silently fabricated quote.
    """
    try:
        quote = market_data.get_quote(ticker)
    except ValueError as exc:
        snapshot = _quote_from_snapshot(db, ticker)
        if snapshot is not None:
            return snapshot
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    return QuoteResponse(
        ticker=quote.ticker,
        price=quote.price,
        previous_close=quote.previous_close,
        day_change_pct=quote.day_change_pct,
    )


@router.get("/quotes", response_model=list[QuoteResponse])
def get_quotes_batch_endpoint(
    symbols: str = Query(..., description="Comma-separated list of tickers, e.g. SPY,QQQ,XLK"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[QuoteResponse]:
    """Live price + today's % change for several tickers in one request —
    used by the watched-indices card (WatchedIndicesCard.tsx) so it
    doesn't fire one HTTP round-trip per row. Unlike the single-ticker
    endpoint above, this one never 502s: a ticker Finnhub doesn't
    recognize (or that fails for any other reason, including a missing
    API key) falls back to its daily-scan snapshot if one exists, and is
    only left out of the returned list (so the frontend shows its mock
    figure for that one row) when there's no snapshot either.
    """
    tickers = [s.strip() for s in symbols.split(",") if s.strip()]
    quotes = market_data.get_quotes_batch(tickers)
    out = [
        QuoteResponse(
            ticker=q.ticker,
            price=q.price,
            previous_close=q.previous_close,
            day_change_pct=q.day_change_pct,
        )
        for q in quotes.values()
    ]
    live_tickers = {q.ticker for q in out}
    for ticker in tickers:
        normalized = ticker.strip().upper()
        if normalized in live_tickers:
            continue
        snapshot = _quote_from_snapshot(db, normalized)
        if snapshot is not None:
            out.append(snapshot)
    return out


@router.get("/fx-rate", response_model=FxRateResponse)
def get_fx_rate_endpoint(current_user: User = Depends(get_current_user)) -> FxRateResponse:
    """Live USD->ILS rate, replacing the fixed settings.usd_ils_rate /
    frontend USD_ILS_RATE constant. Real Finnhub call, not mock data.
    """
    try:
        rate = market_data.get_usd_ils_rate()
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    return FxRateResponse(base="USD", quote="ILS", rate=rate)


@router.get("/news/{ticker}", response_model=list[CompanyNewsItem])
def get_company_news_endpoint(
    ticker: str,
    current_user: User = Depends(get_current_user),
) -> list[CompanyNewsItem]:
    """Real recent news for one company (Finnhub), newest first, each with
    a working link to the publisher's article. Empty list when Finnhub has
    no coverage for the ticker; 502 only for a missing key / failed call."""
    try:
        items = market_data.get_company_news(ticker)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    return [CompanyNewsItem(**vars(item)) for item in items]
