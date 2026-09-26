"""SQLAlchemy model for financial-statement periods extracted from a
user-uploaded PDF report (10-K/10-Q/annual report) and persisted
permanently, per ticker — the "upload a company's PDF report" feature.

Why this exists: FMP (app/services/fundamentals.py) only covers tickers it
recognizes and only current/recent periods on the free tier — for anything
else (e.g. a ticker FMP doesn't have, or an older report the user has on
hand), there was no way to get real financial-statement data into the
platform at all. This table is a second, user-supplied source for exactly
the same FinancialPeriodResponse shape FMP already produces, so it can
slot in as a fallback beneath live FMP data without any frontend changes
on the reading side (see routers/fundamentals.py's fallback logic).

One row per (ticker, period_label, period_type) — uploading the same
period again (e.g. a corrected PDF) overwrites it (upsert), rather than
accumulating duplicates.
"""

from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint

from app.core.database import Base


class UploadedFinancialPeriod(Base):
    __tablename__ = "uploaded_financial_periods"
    __table_args__ = (
        UniqueConstraint(
            "ticker", "period_label", "period_type", name="uq_uploaded_financial_period"
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    ticker = Column(String(20), nullable=False, index=True)
    period_label = Column(String(50), nullable=False)
    period_type = Column(String(10), nullable=False)  # "annual" | "quarter"

    revenue_usd_m = Column(Float, nullable=False)
    ebitda_usd_m = Column(Float, nullable=True)
    net_income_usd_m = Column(Float, nullable=False)
    fcf_usd_m = Column(Float, nullable=True)
    cash_usd_m = Column(Float, nullable=True)
    debt_usd_m = Column(Float, nullable=True)
    shares_outstanding_m = Column(Float, nullable=True)
    cogs_usd_m = Column(Float, nullable=True)
    gross_profit_usd_m = Column(Float, nullable=True)
    sga_usd_m = Column(Float, nullable=True)
    rd_usd_m = Column(Float, nullable=True)
    operating_income_usd_m = Column(Float, nullable=True)
    pretax_income_usd_m = Column(Float, nullable=True)
    tax_usd_m = Column(Float, nullable=True)

    source_filename = Column(String(255), nullable=True)
    uploaded_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    uploaded_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
