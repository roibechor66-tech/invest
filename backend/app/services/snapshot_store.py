"""Generic read/write helpers for the market_data_snapshots table (see
app/models/market_data_snapshot.py for why this table exists and its
staleness tradeoff). Every writer (app/routers/admin.py's daily scan) and
reader (the live-data routers' fallback-on-failure paths) goes through
`save_snapshot`/`load_snapshot` here rather than touching the model
directly, so the (ticker, kind) upsert semantics and JSON
(de)serialization live in exactly one place.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models.market_data_snapshot import MarketDataSnapshot


def save_snapshot(db: Session, ticker: str, kind: str, payload: Any) -> None:
    """Upserts the (ticker, kind) row. `payload` must be JSON-serializable
    (a plain dict, or a list of plain dicts — convert dataclasses with
    `dataclasses.asdict()` before calling this, as app/routers/admin.py
    does)."""
    ticker = ticker.strip().upper()
    row = (
        db.query(MarketDataSnapshot)
        .filter(MarketDataSnapshot.ticker == ticker, MarketDataSnapshot.kind == kind)
        .first()
    )
    payload_json = json.dumps(payload)
    if row is None:
        db.add(MarketDataSnapshot(ticker=ticker, kind=kind, payload_json=payload_json))
    else:
        row.payload_json = payload_json
    db.commit()


def load_snapshot(db: Session, ticker: str, kind: str) -> tuple[Any, datetime] | None:
    """Returns (payload, updated_at) for the most recent scan of this
    (ticker, kind), or None if nothing has ever been scanned for it —
    callers treat that exactly like a live-call failure with no fallback
    left (still a real error, not a fabricated number)."""
    ticker = ticker.strip().upper()
    row = (
        db.query(MarketDataSnapshot)
        .filter(MarketDataSnapshot.ticker == ticker, MarketDataSnapshot.kind == kind)
        .first()
    )
    if row is None:
        return None
    return json.loads(row.payload_json), row.updated_at
