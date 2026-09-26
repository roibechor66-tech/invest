"""SQLAlchemy models for a user's real, persisted portfolio.

Phase 3: replaces the frontend's client-only `portfolio-context.tsx`
state (lost on every page refresh) with a real per-user portfolio saved
in the database. Deliberately minimal — one portfolio per user, no
history/versioning yet (that can be added later if needed).

What's stored vs. computed at read time matters here: we persist only
the facts that don't come from a live market feed (ticker, currency,
the amount as entered, quantity, average cost). `price`/`day_change_pct`
are NOT stored — there is no live price feed yet (that's the other half
of Phase 3, not yet built), so the API layer reports the position's own
average cost as its "current price" and a flat 0% day change, exactly
matching what a freshly-added position already showed in the old
client-only version. Once a real price feed exists, only the API
response needs to change — nothing here.
"""

from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.core.database import Base


class Portfolio(Base):
    __tablename__ = "portfolios"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False, index=True)
    # Free cash sitting in the portfolio, in USD. A brand-new user starts
    # at 0 (they're nudged to build their portfolio via PortfolioNudgeModal,
    # not handed mock starting cash).
    cash_usd = Column(Float, nullable=False, default=0.0)

    positions = relationship(
        "PortfolioPosition", back_populates="portfolio", cascade="all, delete-orphan"
    )


class PortfolioPosition(Base):
    __tablename__ = "portfolio_positions"

    id = Column(Integer, primary_key=True, index=True)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id"), nullable=False, index=True)

    ticker = Column(String(20), nullable=False)
    name_he = Column(String(200), nullable=False)
    sector_name_he = Column(String(100), nullable=False)
    # "USD" or "ILS" — amount_original/avg_cost are both quoted in this
    # currency. See app/core/config.py's USD_ILS_RATE and the "currency
    # consistency" note in CLAUDE.md: never divide/multiply a value in
    # one currency by a rate/price in another.
    currency = Column(String(3), nullable=False, default="USD")
    amount_original = Column(Float, nullable=False)
    quantity = Column(Float, nullable=False)
    avg_cost = Column(Float, nullable=False)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    portfolio = relationship("Portfolio", back_populates="positions")
