"""Pydantic request/response schemas shared across routers."""

from typing import Literal

from pydantic import BaseModel, Field


# --- Auth ---------------------------------------------------------------


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=6, max_length=128)


class UserLogin(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# --- Risk management ------------------------------------------------------


class PositionSizeRequest(BaseModel):
    account_size: float = Field(gt=0, description="Total account equity")
    risk_pct: float = Field(gt=0, le=100, description="% of account risked on this trade")
    entry_price: float = Field(gt=0)
    stop_price: float = Field(gt=0)


class PositionSizeResponse(BaseModel):
    risk_amount: float
    risk_per_share: float
    position_size_shares: float
    position_value: float
    account_exposure_pct: float


class RiskRewardRequest(BaseModel):
    entry_price: float = Field(gt=0)
    stop_price: float = Field(gt=0)
    target_price: float = Field(gt=0)


class RiskRewardResponse(BaseModel):
    risk_per_share: float
    reward_per_share: float
    risk_reward_ratio: float


class VolatilityStopRequest(BaseModel):
    entry_price: float = Field(gt=0)
    daily_volatility_pct: float = Field(gt=0, description="Estimated daily volatility, %")
    multiplier: float = Field(gt=0, description="How many daily-volatility units to place the stop")
    direction: str = Field(description="'long' or 'short'")


class VolatilityStopResponse(BaseModel):
    stop_price: float
    stop_distance_usd: float
    stop_distance_pct: float


class ExpectancyRequest(BaseModel):
    win_rate_pct: float = Field(gt=0, lt=100)
    avg_win_r: float = Field(gt=0, description="Average winning trade, in R (multiples of initial risk)")
    avg_loss_r: float = Field(gt=0, description="Average losing trade, in R (multiples of initial risk)")
    avg_risk_usd: float | None = Field(default=None, gt=0, description="Typical $ risked per trade, for a $ expectancy figure")


class ExpectancyResponse(BaseModel):
    expectancy_r: float
    expectancy_usd: float | None
    profit_factor: float | None


class PositionRiskRequest(BaseModel):
    """Trade-risk check for a stock the user already picked and sized
    (or already holds): given how many shares and where the stop sits,
    how much is actually at risk in $ and as a % of the account?"""

    account_size: float = Field(gt=0, description="Total account equity")
    quantity: float = Field(gt=0, description="Shares held or planned for this trade")
    entry_price: float = Field(gt=0, description="Current/entry price")
    stop_price: float = Field(gt=0)


class PositionRiskResponse(BaseModel):
    risk_amount: float
    risk_pct_of_account: float
    position_value: float
    account_exposure_pct: float


class PortfolioScenarioHolding(BaseModel):
    ticker: str
    name_he: str
    quantity: float = Field(gt=0)
    last_price: float = Field(gt=0)
    weight_pct: float = Field(ge=0)


class PortfolioScenarioRequest(BaseModel):
    """Investing-style risk management: what happens to the whole
    portfolio if one holding's price moves by a given percentage."""

    holdings: list[PortfolioScenarioHolding] = Field(min_length=1)
    target_ticker: str
    price_change_pct: float = Field(description="e.g. -15 for a 15% drop")


class PortfolioScenarioResponse(BaseModel):
    ticker: str
    current_price: float
    scenario_price: float
    position_value_before: float
    position_value_after: float
    position_value_change: float
    portfolio_value_before: float
    portfolio_value_after: float
    portfolio_value_change_pct: float
    weight_pct_before: float
    weight_pct_after: float


# --- Valuation --------------------------------------------------------------


class DcfRequest(BaseModel):
    base_fcf: float = Field(description="Most recent annual free cash flow")
    growth_rate_pct: float = Field(description="Annual FCF growth rate during projection window")
    discount_rate_pct: float = Field(gt=0, description="WACC / required rate of return")
    terminal_growth_pct: float = Field(description="Perpetuity growth rate after the projection window")
    projection_years: int = Field(ge=1, le=15, default=5)
    net_debt: float = 0
    shares_outstanding: float = Field(gt=0)


class DcfResponse(BaseModel):
    projected_fcfs: list[float]
    discounted_fcfs: list[float]
    terminal_value: float
    discounted_terminal_value: float
    enterprise_value: float
    equity_value: float
    value_per_share: float


class EvEbitdaRequest(BaseModel):
    ebitda: float
    multiple: float = Field(gt=0)
    net_debt: float = 0
    shares_outstanding: float = Field(gt=0)


class EvEbitdaResponse(BaseModel):
    enterprise_value: float
    equity_value: float
    value_per_share: float


class ForwardMultipleRequest(BaseModel):
    forward_metric: float = Field(description="e.g. forward EPS or forward revenue/share")
    multiple: float = Field(gt=0)


class ForwardMultipleResponse(BaseModel):
    implied_price: float


class FcfYieldRequest(BaseModel):
    fcf: float
    market_cap: float = Field(gt=0)


class FcfYieldResponse(BaseModel):
    fcf_yield_pct: float


class SotpSegment(BaseModel):
    name: str
    metric_value: float = Field(description="e.g. segment EBITDA or revenue")
    multiple: float = Field(gt=0)


class SotpRequest(BaseModel):
    segments: list[SotpSegment]
    net_debt: float = 0
    shares_outstanding: float = Field(gt=0)


class SotpSegmentValue(BaseModel):
    name: str
    segment_value: float


class SotpResponse(BaseModel):
    segment_values: list[SotpSegmentValue]
    enterprise_value: float
    equity_value: float
    value_per_share: float


class GrowthExitRequest(BaseModel):
    """Growth + exit-multiple model (bear/base/bull): project revenue at a
    constant growth rate, apply a constant net-profit margin to get net
    income, apply a future P/E "exit multiple" to that final year's net
    income to get an implied future market cap, scale today's stock price
    by the ratio of future to today's market cap to get a future price
    target, then discount that back to today at the required return
    (WACC) to get a present fair value and margin of safety. Best suited
    to growth companies where an exit-year earnings multiple is a more
    natural anchor than a full discounted cash flow build."""

    current_price: float = Field(gt=0)
    today_market_cap: float = Field(gt=0, description="Current market cap, same $ units as base_revenue")
    base_revenue: float = Field(gt=0, description="Most recent annual revenue, same $ units as today_market_cap")
    revenue_growth_pct: float
    net_profit_margin_pct: float
    projection_years: int = Field(ge=1, le=10, default=5)
    wacc_pct: float = Field(gt=0)
    bear_multiple: float = Field(gt=0)
    base_multiple: float = Field(gt=0)
    bull_multiple: float = Field(gt=0)


class GrowthExitYearProjection(BaseModel):
    year_label: str
    revenue: float
    net_income: float


class GrowthExitScenarioResult(BaseModel):
    label: str
    exit_multiple: float
    final_year_net_income: float
    final_year_market_cap: float
    projected_price: float
    cagr_pct: float
    fair_price_today: float
    margin_of_safety_pct: float


class GrowthExitResponse(BaseModel):
    revenue_path: list[GrowthExitYearProjection]
    bear: GrowthExitScenarioResult
    base: GrowthExitScenarioResult
    bull: GrowthExitScenarioResult


# --- Financial report analysis (10-K/10-Q upload) --------------------------
# The user uploads an actual quarterly/annual report PDF; the response
# below is filled in by a real Claude API call over that PDF (see
# app/services/research.py), not mock data — everything here reflects
# whatever the model found in the specific document uploaded.


class ReportSegmentAnalysis(BaseModel):
    segment_name_he: str
    summary_he: str
    trend: Literal["positive", "negative", "neutral"]


class ReportAnalysisResponse(BaseModel):
    company_name: str
    report_period_he: str
    stance: Literal["bullish", "bearish", "neutral"]
    executive_summary_he: str
    growth_trends_he: list[str]
    positives_he: list[str]
    negatives_he: list[str]
    stock_move_explanation_he: str
    segment_breakdown: list[ReportSegmentAnalysis]
    risks_to_watch_he: list[str]
    catalysts_to_watch_he: list[str]


# --- AI bot: trend analysis (real-time web search) --------------------------
# The bot searches the live web (company white papers, technology/bottleneck
# analyses, market-disruption coverage) via Claude's web_search tool and
# returns whatever it actually found — same "declared real-AI exception" as
# the report-analysis feature above, not mock data. See
# app/services/research.py::analyze_trends.


class TrendSource(BaseModel):
    title: str
    url: str


class TrendItem(BaseModel):
    title_he: str
    category: Literal["bottleneck", "technology", "whitepaper", "market_disruption"]
    summary_he: str
    details_he: str
    relevant_companies: list[str]
    relevant_sectors_he: list[str]
    source: TrendSource | None = None


class TrendAnalysisResponse(BaseModel):
    generated_at_he: str
    overview_he: str
    trends: list[TrendItem]
    watch_companies: list[str]
    watch_sectors_he: list[str]
    sources: list[TrendSource]


# --- AI bot: automated report analysis (real SEC EDGAR filing) -------------
# The user picks a ticker from their own portfolio; the backend looks up
# that company's actual latest 10-K/10-Q on SEC EDGAR (a real public
# filing, not mock data) and, on request, runs the same kind of real
# Claude analysis as the manual-upload feature above — just sourced from
# a filing the backend fetched itself instead of one the user uploaded.
# See app/services/research.py::find_latest_filing / analyze_latest_filing.


class LatestFilingInfo(BaseModel):
    ticker: str
    company_name: str
    form_type: Literal["10-K", "10-Q"]
    filed_date: str
    period_of_report: str
    primary_doc_url: str


# --- AI bot: economic trends (real-time web search) --------------------------
# What is currently moving the US economy/markets, where they appear to be
# headed, consumer sentiment, and a read on recent macro data releases
# (unemployment, production, growth, etc.) — also a real web-search-backed
# call, not mock data. See app/services/research.py::analyze_economy.


class EconomicIndicator(BaseModel):
    name_he: str
    value_he: str
    trend: Literal["positive", "negative", "neutral"]
    commentary_he: str


class EconomicTrendsResponse(BaseModel):
    generated_at_he: str
    market_direction: Literal["bullish", "bearish", "neutral"]
    overview_he: str
    consumer_sentiment_he: str
    key_indicators: list[EconomicIndicator]
    macro_drivers_he: list[str]
    outlook_he: str
    risks_he: list[str]
    sources: list[TrendSource]
    # Not part of what the model is asked to produce — filled in by
    # app/services/research.py after generation (or read back from the
    # weekly cache) so the frontend can show "עודכן לאחרונה" and decide
    # whether a "רענן עכשיו" refresh is worth offering.
    cached_at_iso: str | None = None


# --- AI bot: custom alerts ---------------------------------------------------
# Unlike the rest of the bot (click a role, get a result), this feature runs
# in the background: the user sets preferences once, and "בדוק עכשיו" (or a
# real scheduled job, in a production deployment) scans the portfolio for
# four kinds of events and files/delivers alerts. See app/services/alerts.py.

AlertCategory = Literal["price_move", "new_filing", "trend_mention", "macro_shift"]
AlertChannel = Literal["in_app", "email"]


class AlertPreferences(BaseModel):
    channels: list[AlertChannel] = Field(default_factory=lambda: ["in_app"])
    email_address: str | None = None
    categories: dict[str, bool] = Field(
        default_factory=lambda: {
            "price_move": True,
            "new_filing": True,
            "trend_mention": True,
            "macro_shift": True,
        }
    )
    price_move_threshold_pct: float = Field(default=5.0, gt=0)


class AlertItem(BaseModel):
    id: str
    ticker: str | None = None
    category: AlertCategory
    title_he: str
    message_he: str
    created_at_iso: str
    read: bool = False


class AlertsCheckRequest(BaseModel):
    tickers: list[str] = Field(default_factory=list)


class AlertsCheckResponse(BaseModel):
    new_alerts: list[AlertItem]
    email_sent: bool
    email_error_he: str | None = None


class PriceMoveExplanationRequest(BaseModel):
    ticker: str
    change_pct: float


class PriceMoveExplanationResponse(BaseModel):
    explanation_he: str


# --- "בדיקת קורלציה" — correlation checker between any two entities --------
# The coefficient itself is computed deterministically on the frontend
# (lib/mock-data/correlation.ts — there's no live return history to
# correlate against in this mock-data phase), and only the *explanation*
# of that number is a real Claude call: no web_search here (unlike most of
# the bot's other features) — this is a request to interpret a number the
# frontend already computed and is showing, not to go find a different,
# possibly-contradicting one live on the web.
class CorrelationExplanationRequest(BaseModel):
    entity_a_label: str
    entity_a_type_he: str
    entity_b_label: str
    entity_b_type_he: str
    correlation_value: float
    period_label_he: str


class CorrelationExplanationResponse(BaseModel):
    summary_he: str
    reason_he: str
    impact_he: str
    conclusion_he: str


# --- "בניית תזה" — deep equity-research thesis builder ----------------------
# The user searches for any ticker and gets a full hedge-fund-style
# investment thesis: business overview, the business model, the core
# "why now / what the market is missing" argument, catalysts, a
# product/segment breakdown, the company's overall competitive advantage
# (moat), revenue-mix breakdowns by segment and by geography, market &
# competitive context, financials, a back-of-envelope valuation
# calculation, bear/base/bull scenarios and the main risks — modeled after
# a real thesis write-up the user provided as the target depth/style.
# Real web-search-backed Claude call, not mock data — same declared
# exception as the rest of the bot. See app/services/research.py::
# build_equity_thesis. Field names stay sector-agnostic on purpose (e.g.
# "segments" fits a chipmaker's product lines just as well as a bank's
# loan book or a biotech's pipeline) — the system prompt instructs the
# model to adapt the *content and terminology* to whatever sector the
# ticker is actually in, rather than forcing every company through a
# hardware-shaped template. Revenue-mix items use a string percentage
# (RevenueMixItem.pct_he) rather than a float, since geographic splits in
# particular aren't always disclosed at a precise number — the model is
# instructed to report the real disclosed granularity, or say plainly that
# a breakdown isn't published, rather than inventing false precision.


class ThesisSegment(BaseModel):
    name_he: str
    description_he: str
    competitive_edge_he: str | None = None


class RevenueMixItem(BaseModel):
    """One slice of a revenue-mix breakdown — reused for both the
    by-product/segment and by-geography views. ``pct_he`` is a string (not a
    float) on purpose: some companies don't disclose a precise percentage,
    so the model can report "כ-45%", "כ-60% מההכנסות", "לא מפורסם בנפרד" etc.
    rather than being forced to invent false precision."""

    label_he: str
    pct_he: str
    note_he: str | None = None


class ThesisFinancials(BaseModel):
    revenue_current_he: str
    revenue_next_year_he: str | None = None
    gross_margin_he: str | None = None
    operating_margin_he: str | None = None
    net_margin_he: str | None = None
    balance_sheet_he: str
    guidance_he: str | None = None
    narrative_he: str


class ThesisValuationScenario(BaseModel):
    label: Literal["bear", "base", "bull"]
    multiple_used_he: str
    assumptions_he: str
    implied_outcome_he: str


class EquityThesisResponse(BaseModel):
    ticker: str
    company_name: str
    sector_he: str
    generated_at_he: str
    business_overview_he: str
    business_model_he: str
    core_thesis_he: str
    catalysts_he: list[str]
    segments: list[ThesisSegment]
    competitive_advantage_he: str
    revenue_mix_by_segment: list[RevenueMixItem]
    revenue_mix_by_geography: list[RevenueMixItem]
    market_and_customers_he: str
    competitive_landscape_he: str
    financials: ThesisFinancials
    back_of_envelope_valuation_he: str
    valuation_scenarios: list[ThesisValuationScenario]
    author_view_he: str
    risks_to_thesis_he: list[str]
    sources: list[TrendSource]


# --- "סיכום שבועי" — per-market weekly market recap + outlook -------------
# The user picks one of four markets (ישראל / ארה"ב-כולל-קריפטו / אסיה /
# סחורות) and gets a structured weekly recap: what happened this week
# (index returns, 10y/30y bond yields where relevant, the economic-data
# releases that came out and whether they beat/missed), a narrative of
# what actually moved the market and why, and a forward look at next
# week (what to watch: upcoming economic data + company earnings).
# Real web-search-backed Claude call, not mock data — same declared
# exception as the rest of the bot. See app/services/research.py::
# build_weekly_summary. Cached per-market for a day at a time (shorter
# than the economic-trends cache, since a weekly recap needs to pick up
# new developments mid-week, not just once a week).


class WeeklySummaryIndexReturn(BaseModel):
    """One line in the index-returns table. For the US market this is
    also where Bitcoin/Ethereum show up (as regular entries, clearly
    named) per the user's request to include crypto under the US tab."""

    name_he: str
    return_pct_he: str


class WeeklySummaryBondYield(BaseModel):
    label_he: str
    yield_level_he: str
    weekly_change_he: str | None = None
    market_impact_he: str | None = None
    """How this specific yield level/move plausibly affects equity
    valuations and risk appetite (e.g. higher long-end yields pressuring
    long-duration growth-stock multiples, or a falling short-end yield
    easing financial conditions) — not a certainty, a mechanism."""


class WeeklySummaryEconomicResult(BaseModel):
    label_he: str
    actual_he: str
    expected_he: str | None = None
    previous_he: str | None = None
    surprise_he: str | None = None
    impact_he: str
    """What this specific data point (beat/miss/in-line) plausibly means
    for the broader economy and for monetary policy expectations — e.g.
    a hot inflation print raising the odds the central bank holds rates
    higher for longer. Always required, not optional, per the "explain
    the effect of every data point" requirement."""


class WeeklySummaryUpcomingItem(BaseModel):
    """One dated item in next week's economic-data or earnings calendar —
    replaces a bare string so the UI can show which day of the week each
    release/report actually lands on. ``ticker`` is populated for earnings
    items about a specific public company (left ``None`` for a purely
    macro/economic-data item, which has no single ticker). ``is_portfolio_holding``
    lets the UI flag "מהתיק שלך!" when the reporting company is one the user
    actually holds — the backend is told the user's current portfolio tickers
    (see WeeklySummaryRequest below) specifically so it can set this."""

    date_he: str
    label_he: str
    why_it_matters_he: str | None = None
    ticker: str | None = None
    is_portfolio_holding: bool = False


class WeeklySummaryRequest(BaseModel):
    """Optional request body for POST /api/research/weekly-summary/{market} —
    the user's current portfolio tickers, so the model can (a) name tickers
    for notable earnings reports and (b) flag any that the user actually
    holds. Portfolio holdings live client-side only (mock data in
    lib/portfolio-context.tsx), so the frontend must pass them explicitly;
    the backend has no persisted portfolio of its own."""

    portfolio_tickers: list[str] = Field(default_factory=list)


class WeeklySummaryResponse(BaseModel):
    market_id: Literal["israel", "us", "asia", "commodities"]
    market_label_he: str
    week_range_he: str
    generated_at_he: str
    summary_he: str
    index_returns: list[WeeklySummaryIndexReturn]
    bond_yields: list[WeeklySummaryBondYield]
    bond_yields_note_he: str | None = None
    economic_data_results: list[WeeklySummaryEconomicResult]
    market_narrative_he: str
    why_moved_he: str
    outlook_next_week_he: str
    key_economic_events_ahead: list[WeeklySummaryUpcomingItem]
    key_earnings_ahead: list[WeeklySummaryUpcomingItem]
    sources: list[TrendSource]
    cached_at_iso: str | None = None


# --- "סיכום שבועי — התיק שלי" — per-holding weekly portfolio recap --------
# A fifth "market" alongside israel/us/asia/commodities, but genuinely
# different in kind: instead of a generic market recap, this reads the
# user's OWN current holdings (tickers + weights, sent by the frontend —
# see PortfolioWeeklySummaryRequest, since the backend has no persisted
# portfolio of its own) and produces a per-holding explanation of the
# week's move for every position, portfolio-level conclusions, any
# correlation pattern noticed across specific holdings (e.g. several
# names all tracking one index/commodity/rate more closely than usual),
# things worth watching, an optional rebalancing suggestion, and which
# sectors are currently getting outsized market attention and how that
# relates to the user's own sector mix. Real web-search-backed Claude
# call, same declared "not mock data" exception as the rest of the bot.
# See app/services/research.py::build_portfolio_weekly_summary.


class PortfolioWeeklyHolding(BaseModel):
    ticker: str
    company_name_he: str
    weekly_return_pct: float
    weekly_return_he: str
    reason_he: str
    """2-4 sentence explanation of why THIS holding specifically rose or
    fell this week — a real catalyst/news item/sector move, not a
    restatement of the percentage."""
    sentiment: Literal["positive", "negative", "neutral"]


class PortfolioCorrelationInsight(BaseModel):
    title_he: str
    description_he: str
    tickers_involved: list[str]


class PortfolioWeeklySummaryRequest(BaseModel):
    """The user's current holdings, sent by the frontend (from
    usePortfolio()) since the backend has no persisted portfolio of its
    own — mirrors the pattern already used for custom-alerts scanning."""

    holdings: list[dict] = Field(default_factory=list)
    """Each item: {"ticker": str, "company_name_he": str | None,
    "weight_pct": float | None, "sector_he": str | None}. Kept as a loose
    dict (rather than a strict model) since the frontend's holding shape
    has grown several optional fields over the project's history and this
    endpoint only needs a handful of them."""


class PortfolioWeeklySummaryResponse(BaseModel):
    week_range_he: str
    generated_at_he: str
    overall_return_pct: float | None = None  # unused by the UI (it shows overall_return_he); optional so a missing number never sinks the whole summary
    overall_return_he: str
    benchmark_comparison_he: str
    """How the portfolio's weekly return compares to a relevant benchmark
    (typically S&P 500), in plain language."""
    summary_he: str
    holdings: list[PortfolioWeeklyHolding]
    conclusions_he: str
    """A paragraph of portfolio-level takeaways from the week — not a
    per-holding repeat, but what the week as a whole suggests about the
    portfolio's current tilt/risk."""
    correlation_insights: list[PortfolioCorrelationInsight]
    watch_items_he: list[str]
    rebalancing_suggestion_he: str | None = None
    trending_sectors_he: str
    """Which sectors are currently getting outsized market attention, and
    how that relates (or doesn't) to the user's own sector mix — e.g.
    flagging concentration in a sector that's cooling, or absence from one
    that's heating up."""
    sources: list[TrendSource]
    cached_at_iso: str | None = None


# --- "סורק מניות" — bot feature: trending / momentum+buzz / "smart money" --
# Three watchlists in one scan: the most-talked-about stocks right now,
# stocks that look like they're just starting a technical upward move
# while also getting real social-media buzz, and stocks showing signs of
# institutional/insider accumulation ("smart money") ahead of the wider
# public catching on. See app/services/scanner.py for what "smart money"
# can honestly mean here (13F filings, Form 4 insider buys, unusual
# options activity — all public-but-lagged or leading-indicator signals,
# never real-time knowledge of a fund's actual current book) — the
# `smart_money_methodology_he` field always explains this to the user.


class ScannerStockIdea(BaseModel):
    ticker: str
    company_name: str
    reason_he: str
    price_action_he: str | None = None
    signal_he: str | None = None
    risk_note_he: str | None = None


class OptionsFlowIdea(BaseModel):
    """One name showing unusual options activity — a large, one-sided
    call or put flow well above normal volume/open interest, the kind of
    print that often (not always) reflects a directional bet by a large
    trader. `flow_type` names which side dominated; `premium_he` and
    `expiration_he` give the trader-relevant specifics; `sentiment_he` is
    the read on what the flow implies (bullish/bearish and why), and
    `risk_note_he` always caveats that unusual flow can be hedging or a
    spread, not a naked directional bet — it's a signal to investigate,
    not a certainty."""

    ticker: str
    company_name: str
    flow_type: Literal["call", "put"]
    reason_he: str
    premium_he: str | None = None
    expiration_he: str | None = None
    sentiment_he: str | None = None
    risk_note_he: str | None = None


class StockScannerResponse(BaseModel):
    generated_at_he: str
    trending: list[ScannerStockIdea]
    momentum_breakouts: list[ScannerStockIdea]
    smart_money: list[ScannerStockIdea]
    smart_money_methodology_he: str
    unusual_options: list[OptionsFlowIdea]
    sources: list[TrendSource]
    cached_at_iso: str | None = None


class StockScannerJobResponse(BaseModel):
    """A scan runs as a background job (it takes minutes): "running" →
    poll again; "done" → `result` holds the scan; "error" → `error_he`;
    "idle" → no scan in progress and nothing cached (e.g. the server
    restarted mid-scan) — start a new one."""

    status: Literal["idle", "running", "done", "error"]
    result: StockScannerResponse | None = None
    error_he: str | None = None


# --- Portfolio (Phase 3: real, persisted "My Portfolio") -----------------


class PortfolioPositionCreate(BaseModel):
    """What the Add-Position modal sends: the same fields as frontend's
    BuiltPosition (lib/types.ts), snake_cased for the API boundary — see
    portfolio-context.tsx's addPosition()."""

    ticker: str = Field(min_length=1, max_length=20)
    name_he: str
    sector_name_he: str
    currency: Literal["USD", "ILS"]
    # The amount as entered, in `currency` — never pre-converted to USD;
    # the server does that once, consistently (see the currency note on
    # PortfolioPosition in app/models/portfolio.py).
    amount_original: float = Field(gt=0)
    # Per-unit price, in `currency`, used to derive quantity and the
    # starting average cost — same as the old client-only addPosition().
    price: float = Field(gt=0)


class PortfolioPositionOut(BaseModel):
    ticker: str
    name_he: str
    sector_name_he: str
    currency: Literal["USD", "ILS"]
    amount_original: float
    amount_usd: float
    quantity: float
    avg_cost: float
    # Live quote (Finnhub, app/services/market_data.py) when available.
    # If the API key isn't configured, the ticker isn't recognized, or the
    # upstream call fails, this honestly falls back to the average cost
    # (0% unrealized P&L) rather than faking a live quote — see
    # `price_is_live` below to tell the two cases apart.
    price: float
    day_change_pct: float
    # False means `price`/`day_change_pct` above are the avg-cost/0%
    # fallback, not a real quote — surfaced so the frontend can show
    # e.g. "אין נתון חי" instead of implying 0% is today's real move.
    price_is_live: bool
    weight_pct: float


class PortfolioStateResponse(BaseModel):
    cash_usd: float
    total_usd: float
    day_change_pct: float
    day_change_usd: float
    positions: list[PortfolioPositionOut]
    # False means the USD/ILS conversion used the fixed settings.usd_ils_rate
    # fallback instead of a live Finnhub rate (see _resolve_usd_ils_rate in
    # app/routers/portfolio.py) — same live/fallback transparency as
    # `price_is_live` on each position.
    fx_rate_is_live: bool


class CashDepositCreate(BaseModel):
    """What the "add cash" control sends (PortfolioBuilderPanel's "התיק
    שלי" tab) — a brand-new Portfolio row starts at cash_usd=0.0 with no
    other way to fund it, so before this there was no way to add a first
    position at all. Withdrawing isn't exposed (out of scope for now,
    same as there being no "edit an existing position" beyond remove/re-add)."""

    amount: float = Field(gt=0)
    currency: Literal["USD", "ILS"] = "USD"


# Phase 3, second track: live market data (app/services/market_data.py).
class QuoteResponse(BaseModel):
    ticker: str
    price: float
    previous_close: float
    day_change_pct: float
    # "live" (fresh Finnhub call) or "snapshot" (served from the last
    # daily scan — see app/routers/admin.py — because the live call
    # failed). Optional/defaulted so nothing breaks for existing callers
    # that don't care about the distinction.
    source: str = "live"


class FxRateResponse(BaseModel):
    base: str
    quote: str
    rate: float


# Phase 3, third track: live financials/multiples/valuation inputs (FMP) —
# see app/services/fundamentals.py for the source and its field-name/
# plan-restriction caveats.
class MultiplesResponse(BaseModel):
    ticker: str
    name: str
    sector: str
    market_cap_usd: float
    price_usd: float
    pe_ratio: float | None
    ev_ebitda: float | None
    price_to_sales: float | None
    roe_pct: float | None
    roa_pct: float | None
    roic_pct: float | None
    # "live" or "snapshot" — see QuoteResponse.source above for what this means.
    source: str = "live"


class FinancialPeriodResponse(BaseModel):
    period_label: str
    revenue_usd_m: float
    ebitda_usd_m: float | None
    net_income_usd_m: float
    fcf_usd_m: float | None
    cash_usd_m: float
    debt_usd_m: float
    shares_outstanding_m: float | None
    cogs_usd_m: float | None
    gross_profit_usd_m: float | None
    sga_usd_m: float | None
    rd_usd_m: float | None
    operating_income_usd_m: float | None
    pretax_income_usd_m: float | None
    tax_usd_m: float | None
    # "live" (yfinance), "uploaded" (from a user-uploaded PDF report, see
    # app/services/uploaded_financials.py), or "snapshot" (the last daily
    # scan — see app/routers/admin.py). Default keeps every existing
    # caller (which never set this) behaving exactly as before.
    source: str = "live"


# --- PDF-upload financial-data extraction (persisted per ticker) -----------
# See app/services/uploaded_financials.py (DB persistence) and
# app/services/research.py::extract_financials_from_pdf (the Claude-native-
# PDF extraction call, reusing the exact pattern proven in analyze_report()).
class UploadedFinancialPeriod(BaseModel):
    period_label: str
    period_type: Literal["annual", "quarter"]
    revenue_usd_m: float
    ebitda_usd_m: float | None = None
    net_income_usd_m: float
    fcf_usd_m: float | None = None
    cash_usd_m: float | None = None
    debt_usd_m: float | None = None
    shares_outstanding_m: float | None = None
    cogs_usd_m: float | None = None
    gross_profit_usd_m: float | None = None
    sga_usd_m: float | None = None
    rd_usd_m: float | None = None
    operating_income_usd_m: float | None = None
    pretax_income_usd_m: float | None = None
    tax_usd_m: float | None = None
    # Balance-sheet totals — not shown anywhere directly, but needed to
    # derive ROE/ROA (see app/services/derived_multiples.py) when a ticker
    # has no live/snapshot multiples at all. null when the report doesn't
    # state them clearly enough to extract (never guessed).
    total_assets_usd_m: float | None = None
    total_equity_usd_m: float | None = None


# Forward guidance/estimates the report *itself* states (management
# guidance, outlook section) — distinct from live yfinance analyst-
# consensus estimates (AnalystEstimateResponse below), but shaped
# identically so it can serve as a fallback for the same endpoint
# (GET /{ticker}/estimates) when yfinance has nothing for this ticker.
class UploadedGuidanceEstimate(BaseModel):
    period_label: str
    estimated_revenue_usd_m: float | None = None
    estimated_eps: float | None = None
    revenue_growth_pct: float | None = None
    eps_growth_pct: float | None = None


class UploadedFinancialsExtractionResponse(BaseModel):
    company_name_detected: str | None = None
    periods: list[UploadedFinancialPeriod]
    # Forward guidance found in the report's own outlook/guidance section,
    # if any — [] when the report doesn't state forward guidance (not an
    # error, most quarterly filings don't include this).
    guidance_estimates: list[UploadedGuidanceEstimate] = []


class AnalystEstimateResponse(BaseModel):
    period_label: str
    estimated_revenue_usd_m: float | None
    estimated_eps: float | None
    revenue_growth_pct: float | None
    eps_growth_pct: float | None


class RevenueSegmentResponse(BaseModel):
    name: str
    revenue_share_pct: float


# --- Real portfolio performance (replaces frontend/lib/mock-data/performance.ts) ---
# See app/services/portfolio_performance.py. Computed from the user's real
# holdings' historical prices (Yahoo Finance via yfinance — no API key
# needed) held at TODAY's quantities across the lookback window (a
# documented approximation — see that module's docstring: there's no
# historical position-history table, so this can't tell "you bought NVDA
# last week" from "you've held it all year"), against real benchmark
# ETF-proxy returns for the same window. No silent mock fallback: zero
# holdings, or Yahoo having no data for any held ticker, raise a clear
# Hebrew error.
class PortfolioPerformancePeriod(BaseModel):
    id: Literal["weekly", "monthly", "quarterly", "ytd", "yearly"]
    label_he: str
    return_pct: float
    # Only benchmarks Yahoo Finance actually returned usable historical
    # data for are present — a benchmark whose proxy ticker isn't covered
    # (e.g. TASE indices, unverified against a live run) is simply absent
    # from this dict for every period, rather than a fabricated number.
    benchmark_returns: dict[str, float]


class PortfolioPerformanceResponse(BaseModel):
    periods: list[PortfolioPerformancePeriod]
    # Tickers held in the portfolio that were skipped from the calculation
    # because FMP had no historical price series for them — shown to the
    # user so a skewed/partial number isn't mistaken for the full picture.
    skipped_tickers: list[str]
    unavailable_benchmarks: list[str]


# --- AI bot: daily / weekly market briefs (real-time web search) ----------
# Replaces the brief screens' fixed mock content (frontend
# lib/mock-data/bot-briefs.ts) with a real web-search-backed Claude call per
# brief kind and market — see app/services/briefs.py.


class BriefNewsItem(BaseModel):
    text_he: str
    source_name: str | None = None
    url: str | None = None
    ticker: str | None = None


class BriefIndexReturn(BaseModel):
    label_he: str
    return_pct: float | None = None
    level_he: str | None = None


class BriefCalendarEvent(BaseModel):
    when_he: str
    label_he: str
    importance: Literal["high", "medium"] = "medium"


class BriefSectorReturn(BaseModel):
    label_he: str
    return_pct: float | None = None


class MarketBriefResponse(BaseModel):
    """`summary_a_he`/`summary_b_he` are "what happened yesterday" / "what's
    expected today" for a daily brief, and "what's coming this week" /
    "what to watch" for a weekly one."""

    kind: Literal["daily", "weekly"]
    market: Literal["portfolio", "il", "us", "asia"]
    generated_at_he: str
    as_of_he: str
    summary_a_he: str
    summary_b_he: str
    top_headline: BriefNewsItem | None = None
    index_returns: list[BriefIndexReturn] = []
    calendar: list[BriefCalendarEvent] = []
    top_sectors: list[BriefSectorReturn] = []
    deals_and_companies: list[BriefNewsItem] = []
    top_voice_theme_he: str | None = None
    company_news: list[BriefNewsItem] = []
    sources: list[TrendSource] = []
    cached_at_iso: str | None = None


class BriefRequest(BaseModel):
    """The user's current portfolio tickers (holdings live per user in the
    DB, but the frontend already has them, same as WeeklySummaryRequest)."""

    portfolio_tickers: list[str] = []
