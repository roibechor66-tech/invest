"""Bot feature "סורק מניות" (stock scanner): trending stocks, momentum
breakouts with social-media buzz, institutional/insider ("smart money")
accumulation signals, and unusual PUT/CALL options flow — see
app/services/scanner.py for what's real (a live, web-search-backed
Claude call) and the honesty caveats on what "smart money" and unusual
options flow can actually mean from public data.
"""

from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.models.schemas import StockScannerJobResponse
from app.models.user import User
from app.services import scanner as scanner_service

router = APIRouter()


@router.post("/scan", response_model=StockScannerJobResponse)
def run_stock_scan(
    force: bool = False,
    current_user: User = Depends(get_current_user),
) -> StockScannerJobResponse:
    """Serve the cached stock scan (trending stocks, momentum breakouts with
    real social buzz, public-filing-based institutional/insider ("smart
    money") signals, unusual PUT/CALL options flow) if it's fresh;
    otherwise start a fresh scan in the background and return "running".

    A fresh scan is a real, web-search-backed Claude call that takes
    several minutes, so it never runs inside the request — the frontend
    polls GET /scan/status until it's done. `force=true` bypasses the cache
    for an explicit "רענן עכשיו" click. Failures (missing API key, a failed
    or malformed AI response) come back as status "error" with a Hebrew
    `error_he`, not as a 502.
    """
    return scanner_service.start_scan(force_refresh=force)


@router.get("/scan/status", response_model=StockScannerJobResponse)
def get_stock_scan_status(
    current_user: User = Depends(get_current_user),
) -> StockScannerJobResponse:
    """Poll target for a scan started via POST /scan."""
    return scanner_service.get_scan_status()
