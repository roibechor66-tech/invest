"""Risk management calculations: position sizing, risk/reward ratio,
volatility-based stop placement and trade expectancy (swing trading), plus
portfolio scenario stress-testing (investing)."""

from app.models.schemas import (
    ExpectancyRequest,
    ExpectancyResponse,
    PortfolioScenarioRequest,
    PortfolioScenarioResponse,
    PositionRiskRequest,
    PositionRiskResponse,
    PositionSizeRequest,
    PositionSizeResponse,
    RiskRewardRequest,
    RiskRewardResponse,
    VolatilityStopRequest,
    VolatilityStopResponse,
)


def calculate_position_size(req: PositionSizeRequest) -> PositionSizeResponse:
    risk_amount = req.account_size * (req.risk_pct / 100)
    risk_per_share = abs(req.entry_price - req.stop_price)

    if risk_per_share == 0:
        raise ValueError("מחיר הכניסה ומחיר הסטופ-לוס אינם יכולים להיות זהים")

    position_size_shares = risk_amount / risk_per_share
    position_value = position_size_shares * req.entry_price
    account_exposure_pct = (position_value / req.account_size) * 100

    return PositionSizeResponse(
        risk_amount=risk_amount,
        risk_per_share=risk_per_share,
        position_size_shares=position_size_shares,
        position_value=position_value,
        account_exposure_pct=account_exposure_pct,
    )


def calculate_risk_reward(req: RiskRewardRequest) -> RiskRewardResponse:
    risk_per_share = abs(req.entry_price - req.stop_price)
    reward_per_share = abs(req.target_price - req.entry_price)

    if risk_per_share == 0:
        raise ValueError("מחיר הכניסה ומחיר הסטופ-לוס אינם יכולים להיות זהים")

    ratio = reward_per_share / risk_per_share

    return RiskRewardResponse(
        risk_per_share=risk_per_share,
        reward_per_share=reward_per_share,
        risk_reward_ratio=ratio,
    )


def calculate_volatility_stop(req: VolatilityStopRequest) -> VolatilityStopResponse:
    """Places a stop a chosen number of "daily-volatility units" away from
    entry, instead of an arbitrary round-number price — the same idea as an
    ATR-based stop: a stock that typically moves 3%/day needs a wider stop
    than one that moves 0.5%/day, or normal noise stops the trade out."""

    if req.direction not in ("long", "short"):
        raise ValueError("כיוון העסקה חייב להיות 'long' או 'short'")

    stop_distance_pct = req.daily_volatility_pct * req.multiplier
    stop_distance_usd = req.entry_price * (stop_distance_pct / 100)

    stop_price = (
        req.entry_price - stop_distance_usd
        if req.direction == "long"
        else req.entry_price + stop_distance_usd
    )
    if stop_price <= 0:
        raise ValueError("מרחק הסטופ-לוס גדול מדי ביחס למחיר הכניסה")

    return VolatilityStopResponse(
        stop_price=stop_price,
        stop_distance_usd=stop_distance_usd,
        stop_distance_pct=stop_distance_pct,
    )


def calculate_expectancy(req: ExpectancyRequest) -> ExpectancyResponse:
    """Trade expectancy: the average result (in R, i.e. multiples of what
    you risked) you should expect per trade over many trades, given a win
    rate and the average size of wins vs. losses. A positive expectancy is
    a real edge regardless of win rate; a high win rate with a negative
    expectancy (small wins, big losses) still loses money long-run."""

    win_rate = req.win_rate_pct / 100
    loss_rate = 1 - win_rate

    expectancy_r = (win_rate * req.avg_win_r) - (loss_rate * req.avg_loss_r)

    expected_loss_r = loss_rate * req.avg_loss_r
    profit_factor = (win_rate * req.avg_win_r) / expected_loss_r if expected_loss_r > 0 else None

    expectancy_usd = expectancy_r * req.avg_risk_usd if req.avg_risk_usd is not None else None

    return ExpectancyResponse(
        expectancy_r=expectancy_r,
        expectancy_usd=expectancy_usd,
        profit_factor=profit_factor,
    )


def calculate_position_risk(req: PositionRiskRequest) -> PositionRiskResponse:
    risk_per_share = abs(req.entry_price - req.stop_price)
    risk_amount = req.quantity * risk_per_share
    position_value = req.quantity * req.entry_price

    return PositionRiskResponse(
        risk_amount=risk_amount,
        risk_pct_of_account=(risk_amount / req.account_size) * 100,
        position_value=position_value,
        account_exposure_pct=(position_value / req.account_size) * 100,
    )


def calculate_portfolio_scenario(req: PortfolioScenarioRequest) -> PortfolioScenarioResponse:
    """Investing-style risk check: if `target_ticker` moves by
    `price_change_pct`, how does that ripple through the whole portfolio's
    value (not just that one position)?"""

    target = next((h for h in req.holdings if h.ticker == req.target_ticker), None)
    if target is None:
        raise ValueError(f"הנייר {req.target_ticker} לא נמצא בתיק")

    portfolio_value_before = sum(h.quantity * h.last_price for h in req.holdings)
    if portfolio_value_before <= 0:
        raise ValueError("שווי התיק חייב להיות גדול מאפס")

    scenario_price = target.last_price * (1 + req.price_change_pct / 100)
    position_value_before = target.quantity * target.last_price
    position_value_after = target.quantity * scenario_price
    position_value_change = position_value_after - position_value_before

    portfolio_value_after = portfolio_value_before + position_value_change
    portfolio_value_change_pct = (position_value_change / portfolio_value_before) * 100

    weight_pct_before = (position_value_before / portfolio_value_before) * 100
    weight_pct_after = (
        (position_value_after / portfolio_value_after) * 100
        if portfolio_value_after > 0
        else 0.0
    )

    return PortfolioScenarioResponse(
        ticker=target.ticker,
        current_price=target.last_price,
        scenario_price=scenario_price,
        position_value_before=position_value_before,
        position_value_after=position_value_after,
        position_value_change=position_value_change,
        portfolio_value_before=portfolio_value_before,
        portfolio_value_after=portfolio_value_after,
        portfolio_value_change_pct=portfolio_value_change_pct,
        weight_pct_before=weight_pct_before,
        weight_pct_after=weight_pct_after,
    )
