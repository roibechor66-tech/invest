"""DB persistence for financial-statement periods extracted from a
user-uploaded PDF report. See app/models/uploaded_financials.py for the
table, and app/services/research.py::extract_financials_from_pdf for the
Claude-based extraction step that produces the data saved here.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.schemas import FinancialPeriodResponse, UploadedFinancialPeriod as ExtractedPeriod
from app.models.uploaded_financials import UploadedFinancialPeriod as UploadedFinancialPeriodRow


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
        row.source_filename = source_filename
        row.uploaded_by_user_id = uploaded_by_user_id

    db.commit()


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
