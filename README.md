# Investment & Risk Management Platform — Phase 1

## Stack

- **Frontend:** Next.js 14 (App Router) + React + TypeScript + Tailwind CSS
- **Backend:** Python + FastAPI
- **UI language:** Hebrew (RTL); all code/comments in English

## Folder structure

```
investment-platform/
├── frontend/
│   ├── app/
│   │   ├── layout.tsx        # RTL root layout (lang="he" dir="rtl") + AuthProvider
│   │   ├── page.tsx          # redirects to /dashboard
│   │   ├── globals.css
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   └── dashboard/
│   │       └── page.tsx      # main dashboard page (auth-gated)
│   ├── components/
│   │   ├── auth/
│   │   │   └── AuthForm.tsx   # shared login/register form
│   │   ├── dashboard/
│   │   │   ├── DashboardHeader.tsx   # shows username + logout
│   │   │   ├── PortfolioSummaryCard.tsx
│   │   │   ├── PerformancePanel.tsx  # weekly/monthly/quarterly/YTD/yearly
│   │   │   ├── SectionGrid.tsx
│   │   │   ├── ActionButtonCard.tsx
│   │   │   ├── ActionResultModal.tsx
│   │   │   └── tools/                # Phase 2 calculators
│   │   │       ├── RiskManagementPanel.tsx
│   │   │       ├── PositionSizeCalculator.tsx
│   │   │       ├── RiskRewardCalculator.tsx
│   │   │       ├── ValuationPanel.tsx
│   │   │       ├── DcfCalculator.tsx
│   │   │       ├── EvEbitdaCalculator.tsx
│   │   │       ├── ForwardMultipleCalculator.tsx
│   │   │       └── SotpCalculator.tsx
│   │   └── ui/                # future shared primitives
│   ├── lib/
│   │   ├── types.ts
│   │   ├── api.ts             # fetch wrapper + auth header
│   │   ├── auth-context.tsx   # remembers the logged-in user
│   │   └── mock-data/
│   │       ├── portfolio.ts
│   │       ├── performance.ts
│   │       ├── benchmarks.ts   # benchmark picker options (S&P 500, Nasdaq, ת"א 35/125, MSCI World)
│   │       ├── indices.ts      # watched IL + global indices
│   │       ├── stock-details.ts # per-ticker multiples/stage/theses/news (click-through modal)
│   │       └── sections.ts
│   ├── package.json
│   ├── tailwind.config.ts
│   └── tsconfig.json
└── backend/
    ├── app/
    │   ├── main.py            # FastAPI app + router registration + DB init
    │   ├── routers/
    │   │   ├── auth.py        # register / login / me (Phase 2)
    │   │   ├── portfolio.py   # holdings, allocation, exposure (auth-gated)
    │   │   ├── risk.py        # position sizing, risk/reward (Phase 2, real logic)
    │   │   ├── valuation.py   # DCF / EV-EBITDA / forward multiple / FCF yield / SOTP (Phase 2, real logic)
    │   │   ├── briefs.py      # automated analyst bot briefs (Phase 3)
    │   │   ├── alerts.py      # custom alerts + price-move explanation
    │   │   ├── research.py    # report analysis, thesis, weekly summary (real Claude calls)
    │   │   └── scanner.py     # bot feature "סורק מניות" (real Claude call)
    │   ├── models/
    │   │   ├── user.py         # SQLAlchemy User model
    │   │   └── schemas.py      # Pydantic request/response schemas
    │   ├── services/
    │   │   ├── risk.py         # pure position-size / risk-reward calculations
    │   │   ├── valuation.py    # pure DCF / EV-EBITDA / SOTP calculations
    │   │   ├── research.py     # real Claude calls: report analysis, thesis builder, weekly summary, etc.
    │   │   └── scanner.py      # real Claude call: trending / momentum+buzz / "smart money" stock scan
    │   └── core/
    │       ├── config.py       # settings (secret key, DB URL)
    │       ├── database.py     # SQLAlchemy engine/session
    │       ├── security.py     # password hashing + JWT
    │       └── deps.py         # get_db, get_current_user
    ├── tests/
    │   └── test_services.py    # sanity checks for the calculation logic
    └── requirements.txt
```

## Running locally (once dependencies are installed)

```bash
# Backend (start first — the frontend calls it for auth + calculators)
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload   # http://localhost:8000

# Frontend
cd frontend
npm install
npm run dev        # http://localhost:3000
```

Then open http://localhost:3000, click "הרשמה" to create a username/password
account, and you'll land on the dashboard. If the backend runs somewhere
other than `http://localhost:8000`, set `NEXT_PUBLIC_API_BASE_URL` in the
frontend's environment before starting it.

### Environment variables (backend)

Easiest way to set these locally: copy `backend/.env.example` to `backend/.env`
and fill in real values — the backend loads it automatically on startup
(via `python-dotenv`), so you don't need to `set`/`export` them by hand in
every new terminal. `.env` is a local file only; never commit it (only
`.env.example`, with no real values, should be tracked).

| Variable | Required? | Purpose |
|---|---|---|
| `APP_SECRET_KEY` | recommended | JWT signing secret (falls back to an insecure dev default). |
| `DATABASE_URL` | optional | Defaults to a local SQLite file. |
| `ANTHROPIC_API_KEY` | **required for financial-report analysis, trend analysis, economic trends, automated report analysis, price-move explanations, correlation explanations, the thesis builder, the weekly summaries and the stock scanner** | Every real-AI bot feature calls the **Anthropic (Claude) API** (paid, per-token usage — get a key and add billing credits at https://console.anthropic.com) instead of mock data: "ניתוח דוחות כספיים" (`POST /api/research/analyze-report`, sends the uploaded PDF straight to Claude), "ניתוח מגמות" (`POST /api/research/trend-analysis`), "מגמות כלכלה" (`POST /api/research/economic-trends`), "ניתוח דוחות אוטומטי" (`POST /api/research/analyze-latest-filing/{ticker}`), "למה המניה זזה" (`POST /api/alerts/explain-price-move`), "בדיקת קורלציה" (`POST /api/research/correlation-explanation`), "בניית תזה" (`POST /api/research/thesis/{ticker}`), "סיכום שבועי" (`POST /api/research/weekly-summary/{market}`, one of `israel`/`us`/`asia`/`commodities`, and `POST /api/research/weekly-summary-portfolio`), and "סורק מניות" (`POST /api/scanner/scan`) — most of these use Claude's built-in `web_search` tool to search the live web before answering; the thesis builder in particular runs a much larger output budget (16000 tokens) since it's a full hedge-fund-style investment thesis, so it can take a few minutes. The weekly summaries are cached for a day and the stock scanner for a few hours (all accept `?force=true` to bypass the cache), so most requests don't re-run the search. Without this set, those endpoints return a clear Hebrew error; every other feature in the app keeps working normally. This app briefly ran on the free Gemini API instead (`GEMINI_API_KEY` is no longer read; safe to remove from `.env`) — reverted because Gemini's free tier quota was too small to be usable in practice. |
| `ANTHROPIC_MODEL` | optional | Defaults to `claude-sonnet-5`. |
| — (none, no key needed) | — | "ניתוח דוחות אוטומטי" also calls the public SEC EDGAR API directly (`GET /api/research/latest-filing/{ticker}`) to find a portfolio ticker's actual latest 10-K/10-Q — free, no API key, but only for US-listed tickers (a non-SEC ticker, e.g. an Israeli `.TA` stock, returns a clear 404). |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USERNAME` / `SMTP_PASSWORD` / `SMTP_FROM_ADDRESS` | **required only if the user opts into email alerts** | The "התראות מותאמות אישית" bot feature can deliver alerts by email in addition to (or instead of) showing them in-app. If the user turns on the email channel but these aren't all set, `POST /api/alerts/check` still runs the scan and saves the alerts in-app — it just reports that the email couldn't be sent, in a clear Hebrew message, rather than silently pretending to have sent it. |
| `FINNHUB_API_KEY` | **required for live market data** | Powers `GET /api/market-data/quote/{ticker}` and `/fx-rate` (`backend/app/services/market_data.py`) — live price/day-change and the USD/ILS rate used across the portfolio, the trade-risk/options/volatility-stop calculators, the add-position modal, the stock detail modal and the scanner. Free tier: https://finnhub.io/register (60 calls/minute). Without this set, those lookups return a clear Hebrew error and every screen falls back to its pre-Phase-3 mock/manual behavior instead of silently fabricating a quote. |
| — (none, no key needed) | — | `GET /api/fundamentals/{ticker}/{multiples,financial-statements,estimates,segments}` and the real portfolio-performance panel (`backend/app/services/fundamentals.py`, `portfolio_performance.py`) are powered by **yfinance (Yahoo Finance)** — free, no API key, no signup. Replaces the earlier FMP integration (`FMP_API_KEY` is no longer read; safe to remove from `.env`). Two real, permanent limitations of this free source (not a temporary plan gate): analyst estimates are best-effort (yfinance's estimate data is less complete than a paid provider's) and revenue-by-segment breakdowns aren't available at all — both come back honestly empty rather than an error, same as before. |

`anthropic` is in `backend/requirements.txt`; a normal `pip install -r requirements.txt`
against PyPI will install it.

## Authentication (Phase 2)

The platform now remembers each user with a simple username + password
account:

- Backend: `app/routers/auth.py` (`POST /api/auth/register`, `POST /api/auth/login`,
  `GET /api/auth/me`), password hashing via `passlib[bcrypt]`, JWT sessions via
  `python-jose`, users stored in a local SQLite file (`investment_platform.db`,
  created automatically on first run).
- Frontend: `/register` and `/login` pages, `lib/auth-context.tsx` (React
  context storing the JWT + username in `localStorage` so a returning
  visitor stays logged in), and `/dashboard` redirects to `/login` if there
  is no active session.
- Every portfolio/risk/valuation API call sends the JWT as a Bearer token
  (`lib/api.ts`); the backend rejects requests without a valid one.

This is intentionally minimal (no email verification or password reset
yet) — enough to recognize a returning user and gate their data.

## Deploying publicly for free (Vercel + Render + Neon)

By default this app only runs on `localhost` — nobody but you can reach it.
To make it reachable by other people, with no server of your own to keep
running:

1. **Push this project to a GitHub repo** (Vercel/Render both deploy from
   GitHub). `git init`, commit, create an empty repo on github.com, push.
2. **Database — [neon.tech](https://neon.tech)** (free, persistent Postgres,
   no trial expiry): create a project, copy the connection string it gives
   you (starts with `postgres://` or `postgresql://` — either works, see
   `config.py`).
3. **Backend — [render.com](https://render.com):** New → Web Service →
   connect the GitHub repo. Root directory: `backend`. Build command:
   `pip install -r requirements.txt`. Start command:
   `uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Add every env var
   from `backend/.env.example` (`APP_SECRET_KEY`, `ANTHROPIC_API_KEY`,
   `FINNHUB_API_KEY`, etc.) plus `DATABASE_URL` (the Neon connection
   string from step 2). Render gives you a URL like
   `https://your-app.onrender.com` — that's your live backend.
4. **Frontend — [vercel.com](https://vercel.com):** New Project → import
   the same GitHub repo, root directory `frontend`. Add one env var:
   `NEXT_PUBLIC_API_BASE_URL` = the Render URL from step 3. Vercel gives
   you a URL like `https://your-app.vercel.app` — that's the public link
   to share.
5. **Close the loop:** back in Render's env vars, set
   `CORS_ALLOWED_ORIGINS` to the Vercel URL from step 4 (see
   `app/main.py`) — otherwise the deployed frontend's requests get
   blocked by CORS — and redeploy the backend.

Free-tier caveat: Render's free web services "sleep" after 15 minutes of
no traffic, so the first request after a quiet period takes ~30-50s to
wake up; every request after that is normal speed. Upgrading to Render's
paid Starter plan (~$7/mo) removes that delay.

## Phase status

- **Phase 1:** folder structure + dashboard UI with mock data. ✅
- **Phase 2 (this phase):** ✅
  - Real DCF, EV/EBITDA, forward multiple, FCF yield and SOTP valuation calculators
    (`app/services/valuation.py`, wired to interactive forms in the "הערכת שווי מותאמת" modal).
  - Real position-sizing and risk/reward calculators (`app/services/risk.py`,
    wired to the "ניהול סיכונים" modal).
  - Username/password registration & login so the platform remembers each user.
- **Phase 3:** connect real market/news APIs (Yahoo Finance, Alpha Vantage, etc.) and the AI prompt pipeline behind each brief button; persist real per-user portfolios instead of mock data.
