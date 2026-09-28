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

One row per (ticker, period_label, period_type, uploaded_by_user_id) —
uploading the same period again (e.g. a corrected PDF) overwrites that
same user's row (upsert), rather than accumulating duplicates. Per-user
isolation (CLAUDE.md entry 57): each user's uploads are private to their
own account — `uploaded_by_user_id` is part of the unique key and every
read is filtered by it, so two different users can each upload their own
copy of the same ticker/period without colliding or seeing each other's
data, and data persists across logout/login since it's tied to the
account, not the session. See app/core/migrations.py for how this
constraint is widened on an already-existing production table (adding
`uploaded_by_user_id` to a fresh CREATE TABLE is enough for a new DB, but
NOT enough to change a table that already exists in production).
"""

from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint

from app.core.database import Base


class UploadedFinancialPeriod(Base):
    __tablename__ = "uploaded_financial_periods"
    __table_args__ = (
        UniqueConstraint(
            "ticker",
            "period_label",
            "period_type",
            "uploaded_by_user_id",
            name="uq_uploaded_financial_period_user",
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
    # Balance-sheet totals, used only to derive ROE/ROA when this ticker
    # has no live/snapshot multiples at all — see
    # app/services/derived_multiples.py. Not surfaced in the financial-
    # statements table itself.
    total_assets_usd_m = Column(Float, nullable=True)
    total_equity_usd_m = Column(Float, nullable=True)

    source_filename = Column(String(255), nullable=True)
    uploaded_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    uploaded_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class UploadedGuidanceEstimate(Base):
    """Forward guidance a user-uploaded report states in its own
    outlook/guidance section (e.g. "we expect Q4 revenue of $X-Y million")
    — distinct from yfinance's live analyst-consensus estimates, but saved
    in the same shape so GET /{ticker}/estimates can fall back to it when
    yfinance has nothing for this ticker. One row per (ticker,
    period_label, uploaded_by_user_id); re-uploading overwrites that same
    user's row (upsert), same per-user-isolation convention as
    UploadedFinancialPeriod above.
    """

    __tablename__ = "uploaded_guidance_estimates"
    __table_args__ = (
        UniqueConstraint(
            "ticker", "period_label", "uploaded_by_user_id", name="uq_uploaded_guidance_estimate_user"
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    ticker = Column(String(20), nullable=False, index=True)
    period_label = Column(String(50), nullable=False)

    estimated_revenue_usd_m = Column(Float, nullable=True)
    estimated_eps = Column(Float, nullable=True)
    revenue_growth_pct = Column(Float, nullable=True)
    eps_growth_pct = Column(Float, nullable=True)

    uploaded_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    uploaded_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
