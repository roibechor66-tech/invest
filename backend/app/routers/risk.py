"""Risk management endpoints: position sizing and risk/reward ratio.

Phase 2: real calculators, backed by app/services/risk.py.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import get_current_user
from app.models.schemas import (
    ExpectancyRequest,
    ExpectancyResponse,
    PortfolioScenarioRequest,
    PortfolioScenarioResponse,
    PositionRiskRequest,
    PositionRiskResponse,
    PositionSizeRequest,
    PositionSizeResponse,
    RiskRewardRequest,
    RiskRewardResponse,
    VolatilityStopRequest,
    VolatilityStopResponse,
)
from app.models.user import User
from app.services import risk as risk_service

router = APIRouter()


@router.post("/position-size", response_model=PositionSizeResponse)
def calculate_position_size(
    payload: PositionSizeRequest, current_user: User = Depends(get_current_user)
) -> PositionSizeResponse:
    try:
        return risk_service.calculate_position_size(payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/risk-reward", response_model=RiskRewardResponse)
def calculate_risk_reward(
    payload: RiskRewardRequest, current_user: User = Depends(get_current_user)
) -> RiskRewardResponse:
    try:
        return risk_service.calculate_risk_reward(payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/position-risk", response_model=PositionRiskResponse)
def calculate_position_risk(
    payload: PositionRiskRequest, current_user: User = Depends(get_current_user)
) -> PositionRiskResponse:
    try:
        return risk_service.calculate_position_risk(payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/volatility-stop", response_model=VolatilityStopResponse)
def calculate_volatility_stop(
    payload: VolatilityStopRequest, current_user: User = Depends(get_current_user)
) -> VolatilityStopResponse:
    try:
        return risk_service.calculate_volatility_stop(payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/expectancy", response_model=ExpectancyResponse)
def calculate_expectancy(
    payload: ExpectancyRequest, current_user: User = Depends(get_current_user)
) -> ExpectancyResponse:
    try:
        return risk_service.calculate_expectancy(payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/portfolio-scenario", response_model=PortfolioScenarioResponse)
def calculate_portfolio_scenario(
    payload: PortfolioScenarioRequest, current_user: User = Depends(get_current_user)
) -> PortfolioScenarioResponse:
    try:
        return risk_service.calculate_portfolio_scenario(payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
