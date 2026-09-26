"""Daily-scan snapshot storage (Phase 3 follow-up — "update all the data/
prices/multiples via a once-a-day scan", per the user's request).

Why this table exists at all: the app's live-data caches (fundamentals.py's
multiples/statements/estimates/segments dicts, market_data.py's quote/FX
caches, portfolio_performance.py's price-history cache) are all plain
per-process Python dicts. On Render's free tier, the whole process is
killed after ~15 minutes of no incoming requests and started fresh on the
next one — so those in-memory caches are wiped constantly, and a
scheduled "refresh" that only warms them would provide almost no benefit
between real visits. This table is real, persisted (Postgres/Neon in
production) storage that survives every restart, so a once-a-day scan
(see app/routers/admin.py) actually keeps serving *something* real all
day, even hours after the last scan and across any number of server
restarts in between — the tradeoff being that data served from here can
be up to ~24h stale, which is stated up front rather than hidden.

One row per (ticker, kind) — a fresh scan overwrites the previous row for
that pair (upsert), it never accumulates history. `payload_json` holds
whatever shape that `kind` naturally is (a single object for "multiples"/
"quote", a list of objects for "statements_quarter"/"statements_annual"/
"estimates"/"segments"/"history") — see app/services/snapshot_store.py
for the read/write helpers, which are the only code that should touch
this table directly.
"""

from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Integer, String, Text, UniqueConstraint

from app.core.database import Base


class MarketDataSnapshot(Base):
    __tablename__ = "market_data_snapshots"
    __table_args__ = (
        UniqueConstraint("ticker", "kind", name="uq_market_data_snapshot_ticker_kind"),
    )

    id = Column(Integer, primary_key=True, index=True)
    ticker = Column(String(20), nullable=False, index=True)
    # "multiples" | "statements_quarter" | "statements_annual" | "estimates"
    # | "segments" | "quote" | "history" — see app/routers/admin.py.
    kind = Column(String(30), nullable=False, index=True)
    payload_json = Column(Text, nullable=False)
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
