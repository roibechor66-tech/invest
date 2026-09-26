"""Application settings.

For Phase 2 we introduce a real (if simple) auth system, so we need a
JWT signing secret and a database location. In production these should
come from environment variables / a secrets manager rather than the
hardcoded defaults below.
"""

import os

from dotenv import load_dotenv

# Loads backend/.env (if present) into the process environment *before* the
# os.getenv() calls below run, so a developer running locally can put keys
# in a .env file instead of `set`/`export`-ing them by hand in every new
# terminal. Silently does nothing if the file doesn't exist — env vars set
# any other way (real shell export, deployment platform, etc.) still work
# exactly as before and take precedence over anything already exported.
load_dotenv()


class Settings:
    # WARNING: replace with a securely generated secret via env var before
    # deploying anywhere beyond local development.
    secret_key: str = os.getenv("APP_SECRET_KEY", "dev-secret-change-me")
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    # Some Postgres providers (Render, Heroku-style connection strings,
    # older Neon links) hand out a URL starting "postgres://" — SQLAlchemy
    # 1.4+/2.x requires the "postgresql://" scheme and raises immediately
    # otherwise. Rewritten here once, at startup, so every deployment
    # target (Render/Neon/Railway/local SQLite) just works from whatever
    # connection string it gives you, without editing code per-host.
    _raw_database_url = os.getenv("DATABASE_URL", "sqlite:///./investment_platform.db")
    database_url: str = (
        _raw_database_url.replace("postgres://", "postgresql://", 1)
        if _raw_database_url.startswith("postgres://")
        else _raw_database_url
    )

    # Comma-separated list of extra origins the backend's CORS policy
    # should allow, on top of the always-allowed local dev origin
    # (http://localhost:3000) — see app/main.py. Set this to your real
    # deployed frontend URL(s) once hosted (e.g.
    # "https://your-app.vercel.app"), or requests from it will be silently
    # blocked by the browser's CORS check.
    cors_allowed_origins: str = os.getenv("CORS_ALLOWED_ORIGINS", "")

    # USD/ILS conversion used when persisting or valuing a portfolio
    # position entered in shekels (app/routers/portfolio.py). Must stay
    # equal to frontend/lib/mock-data/stock-prices.ts's USD_ILS_RATE —
    # the two sides only agree on a position's USD value if they use the
    # same rate. Phase 3's live-market-data work should replace both
    # with a real live FX rate instead of this fixed constant.
    usd_ils_rate: float = float(os.getenv("USD_ILS_RATE", "3.7"))

    # Used by every real-AI bot feature (app/services/research.py,
    # app/services/scanner.py) — financial-report analysis, trend/economic
    # analysis, weekly summaries, price-move/correlation explanations, the
    # equity-thesis builder, and the stock scanner. Get a key (and add
    # billing credits) at https://console.anthropic.com . Without this
    # set, those endpoints return a clear error instead of failing
    # silently or falling back to mock output.
    anthropic_api_key: str = os.getenv("ANTHROPIC_API_KEY", "")
    anthropic_model: str = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5")

    # DEPRECATED / no longer used: this app briefly ran every AI-bot call
    # site above on the free Gemini API instead (see the now-unused
    # app/services/gemini_client.py) after the user asked for a zero-cost
    # backend — but Gemini's free tier had too small a daily request quota
    # to be usable in practice (429 RESOURCE_EXHAUSTED after a handful of
    # calls). The user opted to pay for Anthropic credits instead, so
    # every call site was switched back to Claude above. Left here only so
    # an existing GEMINI_API_KEY in someone's .env doesn't cause an error;
    # safe to remove from .env going forward.
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

    # Used by the custom-alerts feature (app/services/alerts.py) to deliver
    # alerts by email when the user opts into that channel. Without all four
    # set, email delivery returns a clear error instead of failing silently
    # or pretending to have sent something — in-app alerts keep working
    # regardless, since they don't depend on this.
    smtp_host: str = os.getenv("SMTP_HOST", "")
    smtp_port: int = int(os.getenv("SMTP_PORT", "587"))
    smtp_username: str = os.getenv("SMTP_USERNAME", "")
    smtp_password: str = os.getenv("SMTP_PASSWORD", "")
    smtp_from_address: str = os.getenv("SMTP_FROM_ADDRESS", "")

    # Phase 3, second track: live market data (app/services/market_data.py).
    # Without this set, quote/FX-rate lookups return a clear error instead
    # of a silent fallback to mock data — same convention as
    # ANTHROPIC_API_KEY above. Free-tier Finnhub key: https://finnhub.io/register
    finnhub_api_key: str = os.getenv("FINNHUB_API_KEY", "")

    # DEPRECATED / no longer used by app/services/fundamentals.py or
    # portfolio_performance.py: both switched from Financial Modeling
    # Prep (FMP) to yfinance (Yahoo Finance), which needs no API key at
    # all. Left here only so an existing FMP_API_KEY in someone's .env
    # doesn't cause an error; safe to remove from .env going forward.
    fmp_api_key: str = os.getenv("FMP_API_KEY", "")

    # Shared secret protecting POST /api/admin/refresh-market-data (see
    # app/routers/admin.py) — a daily scan that re-fetches multiples/
    # financial statements/quotes/history for every ticker in use and
    # saves the result to the market_data_snapshots table, so read
    # endpoints have a real (if up to ~24h stale) fallback for when a
    # live Yahoo Finance/Finnhub call fails, instead of just an error.
    # This endpoint has no per-user login (it's meant to be triggered by
    # an external scheduler, e.g. a GitHub Actions cron, not a logged-in
    # browser), so without this secret set the endpoint refuses every
    # request rather than being an open, unauthenticated write endpoint.
    # Set it to any long random string, and configure the same value in
    # the scheduler's request header — see README.md.
    admin_refresh_secret: str = os.getenv("ADMIN_REFRESH_SECRET", "")


settings = Settings()
