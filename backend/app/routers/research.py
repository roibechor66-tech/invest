"""Deep-dive research endpoints: financial report analysis, the equity
research thesis builder, and per-market weekly summaries.

All are real, web-search/document-backed Claude calls — see
app/services/research.py — not mock data.
"""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.core.deps import get_current_user
from app.models.schemas import (
    CorrelationExplanationRequest,
    CorrelationExplanationResponse,
    EconomicTrendsResponse,
    EquityThesisResponse,
    LatestFilingInfo,
    PortfolioWeeklySummaryRequest,
    PortfolioWeeklySummaryResponse,
    ReportAnalysisResponse,
    TrendAnalysisResponse,
    WeeklySummaryRequest,
    WeeklySummaryResponse,
)
from app.models.user import User
from app.services import research as research_service

router = APIRouter()

MAX_UPLOAD_BYTES = 32 * 1024 * 1024  # matches Claude's own PDF document limit


@router.post("/analyze-report", response_model=ReportAnalysisResponse)
def analyze_financial_report(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
) -> ReportAnalysisResponse:
    """Analyze an uploaded quarterly/annual report PDF with Claude.

    Real analysis of the actual uploaded file — not mock data. Returns
    growth trends, what stood out positively/negatively, why the stock
    likely moved, a segment/division breakdown, and hedge-fund-style
    risks and catalysts to watch.
    """
    filename = file.filename or "report.pdf"
    is_pdf = filename.lower().endswith(".pdf") or file.content_type == "application/pdf"
    if not is_pdf:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="יש להעלות קובץ PDF בלבד"
        )

    pdf_bytes = file.file.read()
    if not pdf_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="הקובץ שהועלה ריק")
    if len(pdf_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="הקובץ גדול מדי (מקסימום 32MB)"
        )

    try:
        return research_service.analyze_report(pdf_bytes, filename)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))


@router.post("/trend-analysis", response_model=TrendAnalysisResponse)
def get_trend_analysis(
    current_user: User = Depends(get_current_user),
) -> TrendAnalysisResponse:
    """Bot feature: search the live web for white papers, technology/
    bottleneck analyses and market-disruption coverage, and return
    Claude's structured read of what it actually found.

    Real web-search-backed analysis — not mock data (same declared
    exception as /analyze-report). No request body: this is a "run it now"
    action, not a form.
    """
    try:
        return research_service.analyze_trends()
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))


@router.post("/economic-trends", response_model=EconomicTrendsResponse)
def get_economic_trends_endpoint(
    force: bool = False,
    current_user: User = Depends(get_current_user),
) -> EconomicTrendsResponse:
    """Bot feature: current US macro data, Fed commentary and
    consumer-sentiment coverage, read from the weekly cache (or, if it's
    stale or `force=true`, refreshed with a live Claude web-search call)
    and returned as Claude's structured read of where the economy/market
    appear to be heading.

    Real web-search-backed analysis — not mock data (same declared
    exception as /analyze-report) — but cached for a week at a time (see
    app/services/research.py::get_economic_trends) since the underlying
    macro data itself only changes on scheduled release dates, not more
    than weekly. `force=true` bypasses the cache for an explicit
    "רענן עכשיו" click.
    """
    try:
        return research_service.get_economic_trends(force_refresh=force)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))


@router.get("/latest-filing/{ticker}", response_model=LatestFilingInfo)
def get_latest_filing(
    ticker: str,
    current_user: User = Depends(get_current_user),
) -> LatestFilingInfo:
    """Bot feature "ניתוח דוחות אוטומטי", step 1: look up the given
    ticker's actual most recent 10-K/10-Q on SEC EDGAR (real public
    filing metadata, not mock data) — cheap, no Claude call, no API key
    needed. Lets the UI show "הדוח האחרון: ..." with an "נתח דוח" button
    before committing to the expensive analysis step.
    """
    try:
        return research_service.find_latest_filing(ticker)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post("/analyze-latest-filing/{ticker}", response_model=ReportAnalysisResponse)
def analyze_latest_filing_endpoint(
    ticker: str,
    current_user: User = Depends(get_current_user),
) -> ReportAnalysisResponse:
    """Bot feature "ניתוח דוחות אוטומטי", step 2: fetch that ticker's
    actual latest 10-K/10-Q from SEC EDGAR and analyze it with Claude —
    same persona/schema as /analyze-report, just sourced from a filing
    the backend fetched itself instead of one the user uploaded. Real
    analysis, not mock data (same declared exception as /analyze-report).
    """
    try:
        return research_service.analyze_latest_filing(ticker)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))


@router.post("/thesis/{ticker}", response_model=EquityThesisResponse)
def build_thesis_endpoint(
    ticker: str, current_user: User = Depends(get_current_user)
) -> EquityThesisResponse:
    """"בניית תזה": search the given ticker deeply and build a full
    hedge-fund-style investment thesis (business model, the core
    argument, catalysts, a sector-appropriate segment breakdown, market/
    competitive context, financials, a back-of-envelope valuation
    calculation, bear/base/bull scenarios, the author's view and risks).

    Real, web-search-backed Claude call — not mock data (same declared
    exception as the rest of the bot). This one runs a deeper research
    pass than the others, so it can take noticeably longer.
    """
    try:
        return research_service.build_equity_thesis(ticker)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))


@router.post("/weekly-summary/{market}", response_model=WeeklySummaryResponse)
def get_weekly_summary_endpoint(
    market: str,
    force: bool = False,
    payload: WeeklySummaryRequest | None = None,
    current_user: User = Depends(get_current_user),
) -> WeeklySummaryResponse:
    """"סיכום שבועי": pick one of four markets (israel / us / asia /
    commodities) and get a structured weekly recap — index returns
    (including BTC/ETH under "us"), 10y/30y bond yields where relevant,
    this week's economic-data releases (actual vs. expected), a
    narrative of what moved the market and why, and next week's outlook
    (economic events + company earnings to watch, each earnings item
    naming its ticker and flagged when it's a portfolio holding — see
    `payload.portfolio_tickers`, since the backend has no persisted
    portfolio of its own).

    Real, web-search-backed Claude call — not mock data (same declared
    exception as the rest of the bot) — cached per market for a day at a
    time (see app/services/research.py::get_weekly_summary).
    `force=true` bypasses the cache for an explicit "רענן עכשיו" click.
    """
    portfolio_tickers = payload.portfolio_tickers if payload else []
    try:
        return research_service.get_weekly_summary(
            market, force_refresh=force, portfolio_tickers=portfolio_tickers
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))


@router.post("/weekly-summary-portfolio", response_model=PortfolioWeeklySummaryResponse)
def get_portfolio_weekly_summary_endpoint(
    payload: PortfolioWeeklySummaryRequest,
    force: bool = False,
    current_user: User = Depends(get_current_user),
) -> PortfolioWeeklySummaryResponse:
    """"סיכום שבועי — התיק שלי": a fifth, portfolio-specific weekly recap —
    per-holding performance and why each one moved, portfolio-level
    conclusions, any correlation pattern across specific holdings, things
    to watch, an optional rebalancing suggestion, and which sectors are
    currently getting outsized market attention relative to the user's
    own mix.

    The user's holdings are supplied by the frontend (`payload.holdings`),
    since the backend has no persisted portfolio of its own — same
    pattern as the custom-alerts scanner. Real, web-search-backed Claude
    call, not mock data — same declared exception as the rest of the bot.
    Cached per holdings-set for a day at a time (see
    app/services/research.py::get_portfolio_weekly_summary).
    `force=true` bypasses the cache.
    """
    if not payload.holdings:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="לא סופק תיק להשוואה — יש להעביר לפחות נייר ערך אחד",
        )
    try:
        return research_service.get_portfolio_weekly_summary(
            payload.holdings, force_refresh=force
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))


@router.post("/correlation-explanation", response_model=CorrelationExplanationResponse)
def explain_correlation_endpoint(
    payload: CorrelationExplanationRequest,
    current_user: User = Depends(get_current_user),
) -> CorrelationExplanationResponse:
    """"בדיקת קורלציה": explain a correlation coefficient the frontend
    already computed between two entities (stock/index/sector/bond/
    commodity) — what it means, why it's plausible, how it affects a
    portfolio, and what can be concluded from it.

    Real Claude call, not mock data (same declared exception as the rest
    of the bot) — but deliberately without web_search, since the request
    is to interpret the given coefficient, not to fetch a different one.
    """
    try:
        return research_service.explain_correlation(payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
