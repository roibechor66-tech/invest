import { PortfolioRiskStats } from "@/components/dashboard/tools/PortfolioRiskStats";
import { PortfolioSharpeRatio } from "@/components/dashboard/tools/PortfolioSharpeRatio";
import { PortfolioConcentration } from "@/components/dashboard/tools/PortfolioConcentration";
import { PortfolioScenarioCalculator } from "@/components/dashboard/tools/PortfolioScenarioCalculator";
import { PortfolioStressTest } from "@/components/dashboard/tools/PortfolioStressTest";

// Investing-style risk management: everything here looks at the whole
// portfolio rather than a single trade, going a bit further than the
// original single "what if stock X drops" scenario tool toward the
// kind of checks a hedge fund's risk desk runs — beta, estimated
// volatility and VaR, a Sharpe ratio built from a real correlation
// matrix between holdings, concentration risk, a single-stock scenario,
// and whole-market stress presets — kept to plain numbers and one-click
// scenarios rather than anything the user has to configure.
export function InvestingRiskPanel() {
  return (
    <div className="space-y-5">
      <PortfolioRiskStats />
      <div className="border-t border-surface-border" />
      <PortfolioSharpeRatio />
      <div className="border-t border-surface-border" />
      <PortfolioConcentration />
      <div className="border-t border-surface-border" />
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          תרחיש למניה בודדת
        </p>
        <PortfolioScenarioCalculator />
      </div>
      <div className="border-t border-surface-border" />
      <PortfolioStressTest />
    </div>
  );
}
