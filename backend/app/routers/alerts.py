"""Custom, portfolio-driven alerts (bot feature "התראות מותאמות אישית").

Preferences are read/written once; "בדוק עכשיו" (POST /check) runs an
on-demand scan across the given tickers for new SEC filings, portfolio
tickers mentioned in the live trend analysis, and macro-direction shifts —
see app/services/alerts.py for what's real vs. a documented limitation
(no server-side price feed, so price-move alerts are computed client-side).
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import get_current_user
from app.models.schemas import (
    AlertItem,
    AlertPreferences,
    AlertsCheckRequest,
    AlertsCheckResponse,
    PriceMoveExplanationRequest,
    PriceMoveExplanationResponse,
)
from app.models.user import User
from app.services import alerts as alerts_service
from app.services import research as research_service

router = APIRouter()


@router.get("/preferences", response_model=AlertPreferences)
async def get_preferences(current_user: User = Depends(get_current_user)) -> AlertPreferences:
    return alerts_service.get_preferences()


@router.put("/preferences", response_model=AlertPreferences)
async def update_preferences(
    prefs: AlertPreferences, current_user: User = Depends(get_current_user)
) -> AlertPreferences:
    return alerts_service.save_preferences(prefs)


@router.get("/inbox", response_model=list[AlertItem])
async def get_inbox(current_user: User = Depends(get_current_user)) -> list[AlertItem]:
    return alerts_service.get_inbox()


@router.post("/inbox/{alert_id}/read", response_model=list[AlertItem])
async def mark_alert_read(
    alert_id: str, current_user: User = Depends(get_current_user)
) -> list[AlertItem]:
    found = alerts_service.mark_read(alert_id)
    if not found:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ההתראה לא נמצאה")
    return alerts_service.get_inbox()


@router.post("/check", response_model=AlertsCheckResponse)
async def check_alerts(
    payload: AlertsCheckRequest, current_user: User = Depends(get_current_user)
) -> AlertsCheckResponse:
    return alerts_service.check_alerts(payload.tickers)


@router.post("/explain-price-move", response_model=PriceMoveExplanationResponse)
async def explain_price_move(
    payload: PriceMoveExplanationRequest, current_user: User = Depends(get_current_user)
) -> PriceMoveExplanationResponse:
    """For a price-move alert (computed client-side — see check_alerts'
    docstring), find the real reason for the move via a live web search.
    Real AI, not mock data — same declared exception as the rest of the bot.
    """
    try:
        explanation = research_service.explain_price_move(payload.ticker, payload.change_pct)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    return PriceMoveExplanationResponse(explanation_he=explanation)
