"""Custom valuation engine: DCF, EV/EBITDA, forward multiples, FCF yield,
and Sum-of-the-Parts (SOTP).

Pure calculation functions — no I/O — so they're easy to unit test and to
reuse from multiple routers or a future batch/report job.
"""

from app.models.schemas import (
    DcfRequest,
    DcfResponse,
    EvEbitdaRequest,
    EvEbitdaResponse,
    ForwardMultipleRequest,
    ForwardMultipleResponse,
    FcfYieldRequest,
    FcfYieldResponse,
    GrowthExitRequest,
    GrowthExitResponse,
    GrowthExitScenarioResult,
    GrowthExitYearProjection,
    SotpRequest,
    SotpResponse,
    SotpSegmentValue,
)


def run_dcf(req: DcfRequest) -> DcfResponse:
    growth = req.growth_rate_pct / 100
    discount = req.discount_rate_pct / 100
    terminal_growth = req.terminal_growth_pct / 100

    if discount <= terminal_growth:
        raise ValueError("שיעור ההיוון חייב להיות גבוה משיעור הצמיחה הטרמינלי")

    projected_fcfs: list[float] = []
    fcf = req.base_fcf
    for _ in range(req.projection_years):
        fcf = fcf * (1 + growth)
        projected_fcfs.append(fcf)

    discounted_fcfs = [
        cash_flow / ((1 + discount) ** year)
        for year, cash_flow in enumerate(projected_fcfs, start=1)
    ]

    terminal_value = (
        projected_fcfs[-1] * (1 + terminal_growth) / (discount - terminal_growth)
    )
    discounted_terminal_value = terminal_value / (
        (1 + discount) ** req.projection_years
    )

    enterprise_value = sum(discounted_fcfs) + discounted_terminal_value
    equity_value = enterprise_value - req.net_debt
    value_per_share = equity_value / req.shares_outstanding

    return DcfResponse(
        projected_fcfs=projected_fcfs,
        discounted_fcfs=discounted_fcfs,
        terminal_value=terminal_value,
        discounted_terminal_value=discounted_terminal_value,
        enterprise_value=enterprise_value,
        equity_value=equity_value,
        value_per_share=value_per_share,
    )


def run_ev_ebitda(req: EvEbitdaRequest) -> EvEbitdaResponse:
    enterprise_value = req.ebitda * req.multiple
    equity_value = enterprise_value - req.net_debt
    value_per_share = equity_value / req.shares_outstanding
    return EvEbitdaResponse(
        enterprise_value=enterprise_value,
        equity_value=equity_value,
        value_per_share=value_per_share,
    )


def run_forward_multiple(req: ForwardMultipleRequest) -> ForwardMultipleResponse:
    return ForwardMultipleResponse(implied_price=req.forward_metric * req.multiple)


def run_fcf_yield(req: FcfYieldRequest) -> FcfYieldResponse:
    return FcfYieldResponse(fcf_yield_pct=(req.fcf / req.market_cap) * 100)


def run_sotp(req: SotpRequest) -> SotpResponse:
    segment_values = [
        SotpSegmentValue(name=seg.name, segment_value=seg.metric_value * seg.multiple)
        for seg in req.segments
    ]
    enterprise_value = sum(seg.segment_value for seg in segment_values)
    equity_value = enterprise_value - req.net_debt
    value_per_share = equity_value / req.shares_outstanding

    return SotpResponse(
        segment_values=segment_values,
        enterprise_value=enterprise_value,
        equity_value=equity_value,
        value_per_share=value_per_share,
    )


def _project_revenue(base_revenue: float, growth_rate_pct: float, years: int) -> list[float]:
    growth = growth_rate_pct / 100
    path: list[float] = []
    revenue = base_revenue
    for _ in range(years):
        revenue = revenue * (1 + growth)
        path.append(revenue)
    return path


def _run_growth_exit_scenario(
    label: str,
    exit_multiple: float,
    final_year_revenue: float,
    req: GrowthExitRequest,
) -> GrowthExitScenarioResult:
    net_income = final_year_revenue * (req.net_profit_margin_pct / 100)
    market_cap = net_income * exit_multiple
    # Scale today's stock price by how much bigger/smaller the company's
    # market cap becomes, rather than needing a separate share count —
    # this assumes a roughly constant share count over the window.
    projected_price = req.current_price * (market_cap / req.today_market_cap)
    years = req.projection_years
    cagr_pct = (
        ((projected_price / req.current_price) ** (1 / years) - 1) * 100
        if req.current_price > 0
        else 0.0
    )
    fair_price_today = projected_price / ((1 + req.wacc_pct / 100) ** years)
    margin_of_safety_pct = (
        ((fair_price_today - req.current_price) / fair_price_today) * 100
        if fair_price_today
        else 0.0
    )
    return GrowthExitScenarioResult(
        label=label,
        exit_multiple=exit_multiple,
        final_year_net_income=net_income,
        final_year_market_cap=market_cap,
        projected_price=projected_price,
        cagr_pct=cagr_pct,
        fair_price_today=fair_price_today,
        margin_of_safety_pct=margin_of_safety_pct,
    )


def run_growth_exit(req: GrowthExitRequest) -> GrowthExitResponse:
    revenue_path = _project_revenue(req.base_revenue, req.revenue_growth_pct, req.projection_years)
    final_year_revenue = revenue_path[-1]

    year_projections = [
        GrowthExitYearProjection(
            year_label=f"שנה {index + 1}",
            revenue=revenue,
            net_income=revenue * (req.net_profit_margin_pct / 100),
        )
        for index, revenue in enumerate(revenue_path)
    ]

    return GrowthExitResponse(
        revenue_path=year_projections,
        bear=_run_growth_exit_scenario("תרחיש שמרני", req.bear_multiple, final_year_revenue, req),
        base=_run_growth_exit_scenario("תרחיש בסיס", req.base_multiple, final_year_revenue, req),
        bull=_run_growth_exit_scenario("תרחיש אופטימי", req.bull_multiple, final_year_revenue, req),
    )
