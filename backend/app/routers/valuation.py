"""Custom valuation engine endpoints: DCF, EV/EBITDA, forward multiples,
FCF yield, and Sum-of-the-Parts (SOTP) models.

Phase 2: real calculators, backed by app/services/valuation.py.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import get_current_user
from app.models.schemas import (
    DcfRequest,
    DcfResponse,
    EvEbitdaRequest,
    EvEbitdaResponse,
    ForwardMultipleRequest,
    ForwardMultipleResponse,
    FcfYieldRequest,
    FcfYieldResponse,
    GrowthExitRequest,
    GrowthExitResponse,
    SotpRequest,
    SotpResponse,
)
from app.models.user import User
from app.services import valuation as valuation_service

router = APIRouter()


@router.post("/dcf", response_model=DcfResponse)
def run_dcf_valuation(
    payload: DcfRequest, current_user: User = Depends(get_current_user)
) -> DcfResponse:
    try:
        return valuation_service.run_dcf(payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/ev-ebitda", response_model=EvEbitdaResponse)
def run_ev_ebitda_valuation(
    payload: EvEbitdaRequest, current_user: User = Depends(get_current_user)
) -> EvEbitdaResponse:
    return valuation_service.run_ev_ebitda(payload)


@router.post("/forward-multiple", response_model=ForwardMultipleResponse)
def run_forward_multiple_valuation(
    payload: ForwardMultipleRequest, current_user: User = Depends(get_current_user)
) -> ForwardMultipleResponse:
    return valuation_service.run_forward_multiple(payload)


@router.post("/fcf-yield", response_model=FcfYieldResponse)
def run_fcf_yield_valuation(
    payload: FcfYieldRequest, current_user: User = Depends(get_current_user)
) -> FcfYieldResponse:
    return valuation_service.run_fcf_yield(payload)


@router.post("/sotp", response_model=SotpResponse)
def run_sotp_valuation(
    payload: SotpRequest, current_user: User = Depends(get_current_user)
) -> SotpResponse:
    return valuation_service.run_sotp(payload)


@router.post("/growth-exit", response_model=GrowthExitResponse)
def run_growth_exit_valuation(
    payload: GrowthExitRequest, current_user: User = Depends(get_current_user)
) -> GrowthExitResponse:
    return valuation_service.run_growth_exit(payload)
