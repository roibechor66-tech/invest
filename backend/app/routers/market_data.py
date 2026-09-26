"""Live market-data endpoints (Phase 3, second track).

See app/services/market_data.py for the Finnhub integration itself,
including the no-API-key error convention and the ".TA" agorot caveat
that still needs verifying against a real API key.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import get_current_user
from app.models.schemas import FxRateResponse, QuoteResponse
from app.models.user import User
from app.services import market_data

router = APIRouter()


@router.get("/quote/{ticker}", response_model=QuoteResponse)
def get_quote_endpoint(
    ticker: str, current_user: User = Depends(get_current_user)
) -> QuoteResponse:
    """Live price + today's % change for a single ticker.

    Real Finnhub call, not mock data (same declared exception as the rest
    of the app's real-data features). Returns 502 with a clear Hebrew
    message if the API key isn't configured, the ticker isn't recognized,
    or the upstream call fails — never a silently fabricated quote.
    """
    try:
        quote = market_data.get_quote(ticker)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    return QuoteResponse(
        ticker=quote.ticker,
        price=quote.price,
        previous_close=quote.previous_close,
        day_change_pct=quote.day_change_pct,
    )


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
