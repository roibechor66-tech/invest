"""Sanity checks for the pure calculation services (no FastAPI/DB needed)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models.schemas import (  # noqa: E402
    DcfRequest,
    EvEbitdaRequest,
    PositionSizeRequest,
    RiskRewardRequest,
    SotpRequest,
    SotpSegment,
)
from app.services import risk, valuation  # noqa: E402


def test_position_size_basic():
    result = risk.calculate_position_size(
        PositionSizeRequest(
            account_size=100_000, risk_pct=1, entry_price=50, stop_price=45
        )
    )
    # Risking 1% of 100k = $1,000, at $5 risk/share -> 200 shares
    assert result.risk_amount == 1_000
    assert result.risk_per_share == 5
    assert result.position_size_shares == 200
    assert result.position_value == 10_000
    assert result.account_exposure_pct == 10


def test_risk_reward_ratio():
    result = risk.calculate_risk_reward(
        RiskRewardRequest(entry_price=50, stop_price=45, target_price=65)
    )
    # risk = 5, reward = 15 -> ratio 3.0
    assert result.risk_per_share == 5
    assert result.reward_per_share == 15
    assert result.risk_reward_ratio == 3.0


def test_ev_ebitda():
    result = valuation.run_ev_ebitda(
        EvEbitdaRequest(ebitda=100, multiple=10, net_debt=200, shares_outstanding=100)
    )
    assert result.enterprise_value == 1_000
    assert result.equity_value == 800
    assert result.value_per_share == 8


def test_dcf_shape_and_positivity():
    result = valuation.run_dcf(
        DcfRequest(
            base_fcf=100,
            growth_rate_pct=8,
            discount_rate_pct=10,
            terminal_growth_pct=3,
            projection_years=5,
            net_debt=50,
            shares_outstanding=100,
        )
    )
    assert len(result.projected_fcfs) == 5
    assert len(result.discounted_fcfs) == 5
    assert result.enterprise_value > 0
    assert result.value_per_share == (result.enterprise_value - 50) / 100


def test_sotp_sums_segments():
    result = valuation.run_sotp(
        SotpRequest(
            segments=[
                SotpSegment(name="Cloud", metric_value=100, multiple=10),
                SotpSegment(name="Hardware", metric_value=50, multiple=6),
            ],
            net_debt=100,
            shares_outstanding=100,
        )
    )
    assert result.enterprise_value == 100 * 10 + 50 * 6
    assert result.equity_value == result.enterprise_value - 100
