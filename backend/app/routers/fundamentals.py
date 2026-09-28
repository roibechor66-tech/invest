"""Live financials/multiples/valuation-input endpoints (Phase 3, third
track — Yahoo Finance via yfinance; migrated off Financial Modeling
Prep/FMP, see CLAUDE.md entry 47). See app/services/fundamentals.py for
the integration itself, including the best-effort empty-list convention
for analyst estimates/segments (yfinance simply doesn't have this for
every ticker — not an error).
"""

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.schemas import (
    AnalystEstimateResponse,
    FinancialPeriodResponse,
    MultiplesResponse,
    RevenueSegmentResponse,
)
from app.models.user import User
from app.services import derived_multiples, fundamentals, snapshot_store, uploaded_financials
from app.services import research as research_service

router = APIRouter()

MAX_UPLOAD_BYTES = 32 * 1024 * 1024  # matches Claude's own PDF document limit


@router.get("/{ticker}/multiples", response_model=MultiplesResponse)
def get_multiples_endpoint(
    ticker: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> MultiplesResponse:
    """Live company profile + trailing multiples/profitability ratios.

    Real yfinance call, not mock data. Falls back, in order, to: (1) the
    last daily-scan snapshot (source="snapshot" — see app/routers/admin.py),
    (2) multiples derived from a user-uploaded report for this ticker plus
    a live/snapshot price (source="uploaded" — see
    app/services/derived_multiples.py, for a ticker yfinance simply
    doesn't cover). Only raises 502 (clear Hebrew message) when all three
    are empty — never a silently fabricated number.
    """
    try:
        m = fundamentals.get_multiples(ticker)
    except ValueError as exc:
        loaded = snapshot_store.load_snapshot(db, ticker, "multiples")
        if loaded is not None:
            payload, _updated_at = loaded
            return MultiplesResponse(**payload, source="snapshot")
        derived = derived_multiples.compute_from_uploaded(db, ticker)
        if derived is not None:
            return MultiplesResponse(
                ticker=derived.ticker,
                name=derived.name,
                sector=derived.sector,
                market_cap_usd=derived.market_cap_usd,
                price_usd=derived.price_usd,
                pe_ratio=derived.pe_ratio,
                ev_ebitda=derived.ev_ebitda,
                price_to_sales=derived.price_to_sales,
                roe_pct=derived.roe_pct,
                roa_pct=derived.roa_pct,
                roic_pct=derived.roic_pct,
                source="uploaded",
            )
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    return MultiplesResponse(
        ticker=m.ticker,
        name=m.name,
        sector=m.sector,
        market_cap_usd=m.market_cap_usd,
        price_usd=m.price_usd,
        pe_ratio=m.pe_ratio,
        ev_ebitda=m.ev_ebitda,
        price_to_sales=m.price_to_sales,
        roe_pct=m.roe_pct,
        roa_pct=m.roa_pct,
        roic_pct=m.roic_pct,
    )


@router.get("/{ticker}/financial-statements", response_model=list[FinancialPeriodResponse])
def get_financial_statements_endpoint(
    ticker: str,
    period: str = Query("quarter", pattern="^(quarter|annual)$"),
    limit: int = Query(8, ge=1, le=20),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[FinancialPeriodResponse]:
    """Per-period revenue/EBITDA/net-income/FCF/cash/debt series.

    Tries live yfinance first (income-statement + balance-sheet + cash-
    flow-statement, combined) — real data, not mock. If that fails (no
    data for this ticker, Yahoo rate-limited, etc.), falls back in order
    to: (1) whatever the user has uploaded and had extracted from a PDF
    report for this ticker (see POST /{ticker}/upload-report and
    app/services/uploaded_financials.py), then (2) the last daily-scan
    snapshot (see app/routers/admin.py) — each returned period is tagged
    `source: "live"` / `"uploaded"` / `"snapshot"` so the frontend can show
    the distinction. Only raises 502 if all three sources come up empty.
    """
    try:
        periods = fundamentals.get_financial_statements(ticker, period=period, limit=limit)
    except ValueError as fetch_error:
        uploaded = uploaded_financials.get_periods(db, ticker, period, limit)
        if uploaded:
            return uploaded
        loaded = snapshot_store.load_snapshot(db, ticker, f"statements_{period}")
        if loaded is not None:
            payload, _updated_at = loaded
            return [FinancialPeriodResponse(**item, source="snapshot") for item in payload[:limit]]
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(fetch_error))
    return [
        FinancialPeriodResponse(
            period_label=p.period_label,
            revenue_usd_m=p.revenue_usd_m,
            ebitda_usd_m=p.ebitda_usd_m,
            net_income_usd_m=p.net_income_usd_m,
            fcf_usd_m=p.fcf_usd_m,
            cash_usd_m=p.cash_usd_m,
            debt_usd_m=p.debt_usd_m,
            shares_outstanding_m=p.shares_outstanding_m,
            cogs_usd_m=p.cogs_usd_m,
            gross_profit_usd_m=p.gross_profit_usd_m,
            sga_usd_m=p.sga_usd_m,
            rd_usd_m=p.rd_usd_m,
            operating_income_usd_m=p.operating_income_usd_m,
            pretax_income_usd_m=p.pretax_income_usd_m,
            tax_usd_m=p.tax_usd_m,
            source="live",
        )
        for p in periods
    ]


@router.post("/{ticker}/upload-report", response_model=list[FinancialPeriodResponse])
async def upload_report_endpoint(
    ticker: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[FinancialPeriodResponse]:
    """Upload a company's PDF report (10-K/10-Q/annual report) and extract
    comprehensive financial-statement data from it with Claude (native PDF
    support — same pattern as /api/research/analyze-report), then persist
    it permanently for this ticker so it appears everywhere in the app
    that already reads financial-statement data, as a fallback beneath
    live FMP data (see GET /{ticker}/financial-statements above).

    Real Claude call on the actual uploaded file, not mock data — same
    declared exception/error convention as the rest of the AI features:
    502 with a clear Hebrew message on failure, never a silent fallback.
    """
    filename = file.filename or "report.pdf"
    is_pdf = filename.lower().endswith(".pdf") or file.content_type == "application/pdf"
    if not is_pdf:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="יש להעלות קובץ PDF בלבד"
        )

    pdf_bytes = await file.read()
    if not pdf_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="הקובץ שהועלה ריק")
    if len(pdf_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="הקובץ גדול מדי (מקסימום 32MB)"
        )

    try:
        extraction = research_service.extract_financials_from_pdf(pdf_bytes, filename, ticker)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    uploaded_financials.upsert_periods(
        db,
        ticker,
        extraction.periods,
        source_filename=filename,
        uploaded_by_user_id=current_user.id,
    )
    uploaded_financials.upsert_guidance(db, ticker, extraction.guidance_estimates)

    return [
        FinancialPeriodResponse(
            period_label=p.period_label,
            revenue_usd_m=p.revenue_usd_m,
            ebitda_usd_m=p.ebitda_usd_m,
            net_income_usd_m=p.net_income_usd_m,
            fcf_usd_m=p.fcf_usd_m,
            cash_usd_m=p.cash_usd_m or 0.0,
            debt_usd_m=p.debt_usd_m or 0.0,
            shares_outstanding_m=p.shares_outstanding_m,
            cogs_usd_m=p.cogs_usd_m,
            gross_profit_usd_m=p.gross_profit_usd_m,
            sga_usd_m=p.sga_usd_m,
            rd_usd_m=p.rd_usd_m,
            operating_income_usd_m=p.operating_income_usd_m,
            pretax_income_usd_m=p.pretax_income_usd_m,
            tax_usd_m=p.tax_usd_m,
            source="uploaded",
        )
        for p in extraction.periods
    ]


@router.get("/{ticker}/estimates", response_model=list[AnalystEstimateResponse])
def get_analyst_estimates_endpoint(
    ticker: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[AnalystEstimateResponse]:
    """Forward analyst revenue/EPS estimates. Returns an EMPTY LIST (200,
    not an error) when this is unavailable for this ticker — a real but
    honest "no forward estimates" state, not a failure. On a transport
    failure, falls back to the last daily-scan snapshot (see
    app/routers/admin.py); if yfinance simply has nothing (empty list —
    not a failure) or the snapshot is also empty, falls back further to
    any forward guidance the user extracted from an uploaded report's own
    outlook section (see app/services/uploaded_financials.py::get_guidance)
    before finally returning an empty list."""
    try:
        years = fundamentals.get_analyst_estimates(ticker)
    except ValueError as exc:
        loaded = snapshot_store.load_snapshot(db, ticker, "estimates")
        if loaded is not None:
            payload, _updated_at = loaded
            snapshot_estimates = [AnalystEstimateResponse(**item) for item in payload]
            if snapshot_estimates:
                return snapshot_estimates
        uploaded_guidance = uploaded_financials.get_guidance(db, ticker)
        if uploaded_guidance:
            return uploaded_guidance
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    if years:
        return [
            AnalystEstimateResponse(
                period_label=y.period_label,
                estimated_revenue_usd_m=y.estimated_revenue_usd_m,
                estimated_eps=y.estimated_eps,
                revenue_growth_pct=y.revenue_growth_pct,
                eps_growth_pct=y.eps_growth_pct,
            )
            for y in years
        ]
    # yfinance genuinely has nothing for this ticker (not an error) — try
    # uploaded guidance before settling on the honest "no estimates" [].
    return uploaded_financials.get_guidance(db, ticker)


@router.get("/{ticker}/segments", response_model=list[RevenueSegmentResponse])
def get_revenue_segments_endpoint(
    ticker: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[RevenueSegmentResponse]:
    """Business-segment revenue breakdown (feeds the SOTP workspace).
    Returns an EMPTY LIST (200, not an error) when unavailable for this
    ticker — the SOTP workspace already has a single-segment fallback for
    exactly this case. On a transport failure, falls back to the last
    daily-scan snapshot (see app/routers/admin.py) before raising 502."""
    try:
        segments = fundamentals.get_revenue_segments(ticker)
    except ValueError as exc:
        loaded = snapshot_store.load_snapshot(db, ticker, "segments")
        if loaded is not None:
            payload, _updated_at = loaded
            return [RevenueSegmentResponse(**item) for item in payload]
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    return [RevenueSegmentResponse(name=s.name, revenue_share_pct=s.revenue_share_pct) for s in segments]
