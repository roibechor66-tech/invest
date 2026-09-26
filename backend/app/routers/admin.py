"""Daily market-data scan, triggered externally (no browser/user session
involved — see the shared-secret auth below), per the user's request:
"is there a way for the bot to update all the data/prices/multiples via a
once-a-day scan?"

Why this exists as an admin endpoint rather than an in-process scheduler:
Render's free tier spins the whole backend process down after ~15 minutes
of no incoming HTTP requests, and spins it back up (cold) on the next
one — there is no "always on" process here to run a scheduler loop
inside. So the scan is triggered from the outside (a GitHub Actions cron
job hitting this endpoint once a day is the free option this project
documents in README.md) precisely once, and its results are written to
the market_data_snapshots table (see app/models/market_data_snapshot.py)
rather than an in-memory cache, so they survive every subsequent
spin-down/cold-start until the next scan overwrites them.

Scans every ticker actually in use — every ticker held in any user's
portfolio, plus the benchmark ETF proxies portfolio_performance.py
compares against — refetching multiples/financial statements (quarterly
+ annual)/analyst estimates/revenue segments (fundamentals.py, Yahoo
Finance) and a live quote + ~400-day price history (market_data.py /
portfolio_performance.py) for each, all with caching bypassed
(use_cache=False) since the whole point is a fresh pull. A per-ticker
failure (Yahoo has nothing for it, a transient rate-limit, etc.) is
recorded and skipped — it does not fail the whole scan, and does not
overwrite that ticker's previous (still real, just older) snapshot.
"""

from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.portfolio import PortfolioPosition
from app.services import fundamentals, market_data, portfolio_performance, snapshot_store

router = APIRouter()


def _require_admin_secret(x_admin_secret: str | None = Header(default=None)) -> None:
    """Simple shared-secret gate — this endpoint has no logged-in user
    behind it (it's meant to be called by a cron job, not a browser), so
    without ADMIN_REFRESH_SECRET configured it refuses every request
    rather than being open to anyone who finds the URL."""
    if not settings.admin_refresh_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ADMIN_REFRESH_SECRET אינו מוגדר בשרת — הסריקה היומית אינה זמינה",
        )
    if x_admin_secret != settings.admin_refresh_secret:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="קוד סודי שגוי")


@router.post("/refresh-market-data")
def refresh_market_data(
    db: Session = Depends(get_db),
    _auth: None = Depends(_require_admin_secret),
) -> dict:
    """Runs the full daily scan once and returns a summary (never 500s on
    a per-ticker failure — only auth failures and a totally broken DB
    session would raise here)."""
    portfolio_tickers = sorted(
        {row.ticker.strip().upper() for row in db.query(PortfolioPosition.ticker).distinct()}
    )
    benchmark_tickers = sorted(
        {t for proxies in portfolio_performance.BENCHMARK_PROXY_TICKERS.values() for t in proxies}
    )

    succeeded: list[str] = []
    failed: list[str] = []

    for ticker in portfolio_tickers:
        ticker_had_any_success = False

        try:
            multiples = fundamentals.get_multiples(ticker, use_cache=False)
            snapshot_store.save_snapshot(db, ticker, "multiples", asdict(multiples))
            ticker_had_any_success = True
        except Exception:
            pass

        for period in ("quarter", "annual"):
            try:
                periods = fundamentals.get_financial_statements(ticker, period=period, use_cache=False)
                snapshot_store.save_snapshot(
                    db, ticker, f"statements_{period}", [asdict(p) for p in periods]
                )
                ticker_had_any_success = True
            except Exception:
                pass

        try:
            estimates = fundamentals.get_analyst_estimates(ticker)
            snapshot_store.save_snapshot(db, ticker, "estimates", [asdict(e) for e in estimates])
        except Exception:
            pass

        try:
            segments = fundamentals.get_revenue_segments(ticker)
            snapshot_store.save_snapshot(db, ticker, "segments", [asdict(s) for s in segments])
        except Exception:
            pass

        try:
            quote = market_data.get_quote(ticker, use_cache=False)
            snapshot_store.save_snapshot(db, ticker, "quote", asdict(quote))
            ticker_had_any_success = True
        except Exception:
            pass

        try:
            history = portfolio_performance.fetch_history_for_snapshot(ticker)
            if history:
                snapshot_store.save_snapshot(
                    db,
                    ticker,
                    "history",
                    [[d.isoformat(), c] for d, c in history],
                )
                ticker_had_any_success = True
        except Exception:
            pass

        (succeeded if ticker_had_any_success else failed).append(ticker)

    benchmark_refreshed: list[str] = []
    for ticker in benchmark_tickers:
        try:
            history = portfolio_performance.fetch_history_for_snapshot(ticker)
            if history:
                snapshot_store.save_snapshot(
                    db, ticker, "history", [[d.isoformat(), c] for d, c in history]
                )
                benchmark_refreshed.append(ticker)
        except Exception:
            pass

    return {
        "portfolio_tickers_scanned": len(portfolio_tickers),
        "portfolio_tickers_succeeded": succeeded,
        "portfolio_tickers_failed": failed,
        "benchmark_tickers_refreshed": benchmark_refreshed,
    }
