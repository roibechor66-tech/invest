"""Bot feature "סורק מניות" (stock scanner): trending stocks, momentum
breakouts with social-media buzz, institutional/insider ("smart money")
accumulation signals, and unusual PUT/CALL options flow — see
app/services/scanner.py for what's real (a live, web-search-backed
Claude call) and the honesty caveats on what "smart money" and unusual
options flow can actually mean from public data.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import get_current_user
from app.models.schemas import StockScannerResponse
from app.models.user import User
from app.services import scanner as scanner_service

router = APIRouter()


@router.post("/scan", response_model=StockScannerResponse)
async def run_stock_scan(
    force: bool = False,
    current_user: User = Depends(get_current_user),
) -> StockScannerResponse:
    """Run (or serve the cached) stock scan: trending stocks, momentum
    breakouts with real social buzz, public-filing-based
    institutional/insider ("smart money") signals, and unusual
    PUT/CALL options flow.

    Real, web-search-backed Claude call — not mock data (same declared
    exception as the rest of the bot) — cached for a few hours (see
    app/services/scanner.py::get_stock_scanner). `force=true` bypasses
    the cache for an explicit "רענן עכשיו" click.
    """
    try:
        return scanner_service.get_stock_scanner(force_refresh=force)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
