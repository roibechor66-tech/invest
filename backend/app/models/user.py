"""SQLAlchemy User model.

Phase 2 scope: username + hashed password only, so the platform can
recognize a returning user and (in later phases) attach their portfolio,
valuation templates, and saved briefs to their account.
"""

from datetime import datetime, timezone

from sqlalchemy import Column, Integer, String, DateTime

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
