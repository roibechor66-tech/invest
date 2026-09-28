"""FastAPI entrypoint for the investment platform backend.

Phase 1: app skeleton + router structure.
Phase 2: real valuation/risk calculators, plus a username+password auth
system so the platform can recognize returning users.
Phase 3 (in progress): real per-user portfolio persistence (this file's
`portfolio` model import + router) is done. Live market data (Finnhub —
this file's `market_data` router) and live financials/multiples/
valuation inputs (FMP — this file's `fundamentals` router) are wired in
as well; see app/services/market_data.py and app/services/fundamentals.py
for what's live vs. still mock.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import Base, engine
from app.core.migrations import run_startup_migrations

# Imported so Base.metadata knows about these tables before create_all()
# runs below — SQLAlchemy only creates tables for models that have been
# imported somewhere by then. `user` is already pulled in transitively via
# app.core.deps, but `portfolio` has no other import path yet.
from app.models import portfolio as portfolio_models  # noqa: F401
from app.models import uploaded_financials as uploaded_financials_models  # noqa: F401
from app.models import market_data_snapshot as market_data_snapshot_models  # noqa: F401
from app.routers import (
    auth,
    portfolio,
    risk,
    valuation,
    briefs,
    research,
    alerts,
    scanner,
    market_data,
    fundamentals,
    admin,
)

# Create tables on startup. For anything beyond local dev, use a real
# migration tool (e.g. Alembic) instead of create_all. create_all() only
# creates tables that don't exist yet — it can't add a column to, or
# change a constraint on, a table already live in production, so
# run_startup_migrations() patches those forward afterward (see
# app/core/migrations.py; CLAUDE.md entries 56-57 for why this exists).
Base.metadata.create_all(bind=engine)
run_startup_migrations(engine)

app = FastAPI(
    title="Investment Platform API",
    description="Backend for the personal investment & risk management dashboard.",
    version="0.2.0",
)

# Allow the local Next.js dev server (always) plus, in production, the
# real deployed frontend origin(s) — set via the CORS_ALLOWED_ORIGINS env
# var as a comma-separated list (e.g. "https://myapp.vercel.app"). Without
# it, only localhost works, which is correct for local dev but would
# silently block every request from a real deployed frontend — so this is
# read straight from settings rather than hardcoded, same "no silent
# failure" convention as the rest of the app's config.
from app.core.config import settings as _settings  # noqa: E402

_allowed_origins = ["http://localhost:3000"] + [
    origin.strip()
    for origin in _settings.cors_allowed_origins.split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(portfolio.router, prefix="/api/portfolio", tags=["portfolio"])
app.include_router(risk.router, prefix="/api/risk", tags=["risk"])
app.include_router(valuation.router, prefix="/api/valuation", tags=["valuation"])
app.include_router(briefs.router, prefix="/api/briefs", tags=["briefs"])
app.include_router(research.router, prefix="/api/research", tags=["research"])
app.include_router(alerts.router, prefix="/api/alerts", tags=["alerts"])
app.include_router(scanner.router, prefix="/api/scanner", tags=["scanner"])
app.include_router(market_data.router, prefix="/api/market-data", tags=["market-data"])
app.include_router(fundamentals.router, prefix="/api/fundamentals", tags=["fundamentals"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])


@app.get("/api/health")
def health_check() -> dict[str, str]:
    """Simple liveness check used by the frontend and deployment tooling."""
    return {"status": "ok"}
