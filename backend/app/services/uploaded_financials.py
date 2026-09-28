"""DB persistence for financial-statement periods extracted from a
user-uploaded PDF report. See app/models/uploaded_financials.py for the
table, and app/services/research.py::extract_financials_from_pdf for the
Claude-based extraction step that produces the data saved here.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.schemas import (
    AnalystEstimateResponse,
    FinancialPeriodResponse,
    UploadedFinancialPeriod as ExtractedPeriod,
    UploadedGuidanceEstimate as ExtractedGuidance,
)
from app.models.uploaded_financials import (
    UploadedFinancialPeriod as UploadedFinancialPeriodRow,
    UploadedGuidanceEstimate as UploadedGuidanceEstimateRow,
)


def upsert_periods(
    db: Session,
    ticker: str,
    periods: list[ExtractedPeriod],
    *,
    source_filename: str | None,
    uploaded_by_user_id: int | None,
) -> None:
    """Save (or overwrite) each extracted period, keyed by
    (ticker, period_label, period_type) — uploading the same period again
    (e.g. a corrected PDF) updates it in place rather than duplicating it.
    """
    ticker = ticker.strip().upper()
    for period in periods:
        row = (
            db.query(UploadedFinancialPeriodRow)
            .filter_by(ticker=ticker, period_label=period.period_label, period_type=period.period_type)
            .first()
        )
        if row is None:
            row = UploadedFinancialPeriodRow(
                ticker=ticker, period_label=period.period_label, period_type=period.period_type
            )
            db.add(row)

        row.revenue_usd_m = period.revenue_usd_m
        row.ebitda_usd_m = period.ebitda_usd_m
        row.net_income_usd_m = period.net_income_usd_m
        row.fcf_usd_m = period.fcf_usd_m
        row.cash_usd_m = period.cash_usd_m
        row.debt_usd_m = period.debt_usd_m
        row.shares_outstanding_m = period.shares_outstanding_m
        row.cogs_usd_m = period.cogs_usd_m
        row.gross_profit_usd_m = period.gross_profit_usd_m
        row.sga_usd_m = period.sga_usd_m
        row.rd_usd_m = period.rd_usd_m
        row.operating_income_usd_m = period.operating_income_usd_m
        row.pretax_income_usd_m = period.pretax_income_usd_m
        row.tax_usd_m = period.tax_usd_m
        row.total_assets_usd_m = period.total_assets_usd_m
        row.total_equity_usd_m = period.total_equity_usd_m
        row.source_filename = source_filename
        row.uploaded_by_user_id = uploaded_by_user_id

    db.commit()


def get_latest_period_row(db: Session, ticker: str) -> UploadedFinancialPeriodRow | None:
    """Most-recently-uploaded period for a ticker (any period_type),
    preferring quarter over annual when both were uploaded at the same
    time — used by app/services/derived_multiples.py to compute multiples
    (P/E, P/S, EV/EBITDA, ROE, ROA) from whatever the user uploaded, for a
    ticker with no live/snapshot multiples at all.
    """
    ticker = ticker.strip().upper()
    rows = (
        db.query(UploadedFinancialPeriodRow)
        .filter(UploadedFinancialPeriodRow.ticker == ticker)
        .order_by(UploadedFinancialPeriodRow.uploaded_at.desc())
        .all()
    )
    if not rows:
        return None
    quarters = [r for r in rows if r.period_type == "quarter"]
    return quarters[0] if quarters else rows[0]


def upsert_guidance(db: Session, ticker: str, guidance: list[ExtractedGuidance]) -> None:
    """Save (or overwrite) forward guidance extracted from an uploaded
    report's own outlook section — see UploadedGuidanceEstimate's
    docstring. A report with no guidance section simply passes []."""
    ticker = ticker.strip().upper()
    for item in guidance:
        row = (
            db.query(UploadedGuidanceEstimateRow)
            .filter_by(ticker=ticker, period_label=item.period_label)
            .first()
        )
        if row is None:
            row = UploadedGuidanceEstimateRow(ticker=ticker, period_label=item.period_label)
            db.add(row)
        row.estimated_revenue_usd_m = item.estimated_revenue_usd_m
        row.estimated_eps = item.estimated_eps
        row.revenue_growth_pct = item.revenue_growth_pct
        row.eps_growth_pct = item.eps_growth_pct

    if guidance:
        db.commit()


def get_guidance(db: Session, ticker: str) -> list[AnalystEstimateResponse]:
    """Read back saved guidance for a ticker, shaped exactly like
    AnalystEstimateResponse (yfinance's live-estimate shape) so it can
    slot into GET /{ticker}/estimates as a fallback with zero frontend
    changes — same "looks identical to the caller" convention as
    get_periods() above for financial statements."""
    ticker = ticker.strip().upper()
    rows = (
        db.query(UploadedGuidanceEstimateRow)
        .filter(UploadedGuidanceEstimateRow.ticker == ticker)
        .order_by(UploadedGuidanceEstimateRow.period_label.asc())
        .all()
    )
    return [
        AnalystEstimateResponse(
            period_label=row.period_label,
            estimated_revenue_usd_m=row.estimated_revenue_usd_m,
            estimated_eps=row.estimated_eps,
            revenue_growth_pct=row.revenue_growth_pct,
            eps_growth_pct=row.eps_growth_pct,
        )
        for row in rows
    ]


def get_periods(
    db: Session, ticker: str, period_type: str, limit: int
) -> list[FinancialPeriodResponse]:
    """Read back saved periods for a ticker, newest-uploaded-first,
    already shaped as FinancialPeriodResponse so the router's fallback
    path can return them exactly like a live FMP result (with
    `source="uploaded"` so the frontend can show that distinction).
    """
    ticker = ticker.strip().upper()
    rows = (
        db.query(UploadedFinancialPeriodRow)
        .filter(
            UploadedFinancialPeriodRow.ticker == ticker,
            UploadedFinancialPeriodRow.period_type == period_type,
        )
        .order_by(UploadedFinancialPeriodRow.uploaded_at.desc())
        .limit(limit)
        .all()
    )
    return [
        FinancialPeriodResponse(
            period_label=row.period_label,
            revenue_usd_m=row.revenue_usd_m,
            ebitda_usd_m=row.ebitda_usd_m,
            net_income_usd_m=row.net_income_usd_m,
            fcf_usd_m=row.fcf_usd_m,
            cash_usd_m=row.cash_usd_m or 0.0,
            debt_usd_m=row.debt_usd_m or 0.0,
            shares_outstanding_m=row.shares_outstanding_m,
            cogs_usd_m=row.cogs_usd_m,
            gross_profit_usd_m=row.gross_profit_usd_m,
            sga_usd_m=row.sga_usd_m,
            rd_usd_m=row.rd_usd_m,
            operating_income_usd_m=row.operating_income_usd_m,
            pretax_income_usd_m=row.pretax_income_usd_m,
            tax_usd_m=row.tax_usd_m,
            source="uploaded",
        )
        for row in rows
    ]
