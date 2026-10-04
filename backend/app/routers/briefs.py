"""The Automated Analyst Bot's "בריפים": daily and weekly market briefs
per market (my portfolio / Israel / US / Asia).

Real, web-search-backed Claude calls (app/services/briefs.py), cached per
brief kind + market + relevant holdings — not the Phase 1 stub this router
used to be.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import get_current_user
from app.models.schemas import BriefRequest, MarketBriefResponse
from app.models.user import User
from app.services import briefs as briefs_service

router = APIRouter()


@router.post("/{kind}/{market}", response_model=MarketBriefResponse)
def get_market_brief(
    kind: str,
    market: str,
    request: BriefRequest | None = None,
    force: bool = False,
    current_user: User = Depends(get_current_user),
) -> MarketBriefResponse:
    """`kind` is "daily" or "weekly"; `market` is "portfolio", "il", "us"
    or "asia". The body carries the user's portfolio tickers so the brief
    can include news on their own holdings. `force=true` bypasses the
    cache ("רענן עכשיו"). Failures return 502 with a Hebrew message, never
    mock content."""
    try:
        return briefs_service.get_brief(
            kind,
            market,
            portfolio_tickers=request.portfolio_tickers if request else [],
            force_refresh=force,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
