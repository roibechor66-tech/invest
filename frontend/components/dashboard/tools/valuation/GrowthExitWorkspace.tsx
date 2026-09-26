"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { AssumptionField } from "@/components/dashboard/tools/valuation/AssumptionField";
import { ResultRow } from "@/components/dashboard/tools/ResultRow";
import { mockStockDetails } from "@/lib/mock-data/stock-details";
import { CompanyFinancials } from "@/lib/mock-data/valuation-financials";
import { useLiveCompanyFundamentals } from "@/lib/hooks/useLiveCompanyFundamentals";

interface GrowthExitScenarioResult {
  label: string;
  exit_multiple: number;
  final_year_net_income: number;
  final_year_market_cap: number;
  projected_price: number;
  cagr_pct: number;
  fair_price_today: number;
  margin_of_safety_pct: number;
}

interface GrowthExitResult {
  revenue_path: { year_label: string; revenue: number; net_income: number }[];
  bear: GrowthExitScenarioResult;
  base: GrowthExitScenarioResult;
  bull: GrowthExitScenarioResult;
}

interface GrowthExitWorkspaceProps {
  ticker: string | null;
  mode: "auto" | "manual";
  onBack: () => void;
}

function estimateWaccPct(sectorNameHe: string, growthPct: number): number {
  if (sectorNameHe.includes("בנקא")) return 9;
  if (growthPct >= 20) return 11.5;
  if (growthPct >= 12) return 10;
  return 8.5;
}

// Phase 3, third track: same "fetch live, then mount" gating as
// DcfWorkspace — see that file's comment for why.
export function GrowthExitWorkspace({ ticker, mode, onBack }: GrowthExitWorkspaceProps) {
  const live = useLiveCompanyFundamentals(ticker);
  if (mode === "auto" && ticker && live.isLoading) {
    return <p className="text-sm text-slate-500">טוען נתונים פיננסיים חיים (FMP)...</p>;
  }
  const peRatio = live.multiples?.peRatio ?? (live.financials ? live.financials.marketCapUsdM / live.financials.netIncomeUsdM : undefined);
  return (
    <GrowthExitWorkspaceInner
      ticker={ticker}
      mode={mode}
      onBack={onBack}
      financials={live.financials}
      analystGrowthPct={live.estimates[0]?.revenueGrowthPct ?? undefined}
      peRatio={peRatio}
    />
  );
}

// The model the user brought in from their own spreadsheet: project
// revenue at a constant growth rate, apply a net-margin assumption to
// get net income, then apply a bear/base/bull exit P/E multiple to that
// final year's net income to get an implied future market cap and
// (scaled off today's price) a future stock price — discounted back to
// today at the required return.
function GrowthExitWorkspaceInner({
  ticker,
  mode,
  onBack,
  financials,
  analystGrowthPct,
  peRatio,
}: GrowthExitWorkspaceProps & {
  financials: CompanyFinancials | undefined;
  analystGrowthPct: number | undefined;
  peRatio: number | undefined;
}) {
  const detail = ticker ? mockStockDetails[ticker] : undefined;
  const isAuto = mode === "auto" && financials;

  // Phase 3, third track: analyst consensus alone (no live "company
  // guidance" equivalent — see DcfWorkspace's comment for the same call).
  const growthPct = analystGrowthPct ?? 30;
  const marginPct = isAuto ? (financials!.netIncomeUsdM / financials!.revenueUsdM) * 100 : 30;
  const wacc = detail ? estimateWaccPct(detail.sectorNameHe, growthPct) : 10;
  const basePe = peRatio ?? 30;

  const [currentPrice, setCurrentPrice] = useState(String(isAuto ? financials!.currentPriceUsd : "198"));
  const [marketCap, setMarketCap] = useState(String(isAuto ? financials!.marketCapUsdM.toFixed(0) : "9130"));
  const [baseRevenue, setBaseRevenue] = useState(String(isAuto ? financials!.revenueUsdM.toFixed(0) : "600"));
  const [growth, setGrowth] = useState(String(isAuto ? growthPct.toFixed(1) : "30"));
  const [margin, setMargin] = useState(String(isAuto ? marginPct.toFixed(1) : "30"));
  const [years, setYears] = useState("5");
  const [waccPct, setWaccPct] = useState(String(isAuto ? wacc : "10"));
  const [bearMultiple, setBearMultiple] = useState(String(isAuto ? (basePe * 0.7).toFixed(0) : "20"));
  const [baseMultiple, setBaseMultiple] = useState(String(isAuto ? basePe.toFixed(0) : "30"));
  const [bullMultiple, setBullMultiple] = useState(String(isAuto ? (basePe * 1.3).toFixed(0) : "40"));
  const [result, setResult] = useState<GrowthExitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleCalculate() {
    setError(null);
    setIsLoading(true);
    try {
      const data = await apiFetch<GrowthExitResult>("/api/valuation/growth-exit", {
        method: "POST",
        body: JSON.stringify({
          current_price: Number(currentPrice),
          today_market_cap: Number(marketCap),
          base_revenue: Number(baseRevenue),
          revenue_growth_pct: Number(growth),
          net_profit_margin_pct: Number(margin),
          projection_years: Number(years),
          wacc_pct: Number(waccPct),
          bear_multiple: Number(bearMultiple),
          base_multiple: Number(baseMultiple),
          bull_multiple: Number(bullMultiple),
        }),
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "החישוב נכשל");
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
        <ArrowRight size={14} /> חזרה
      </button>

      <p className="text-sm font-bold text-slate-900">
        מודל צמיחה ומכפיל יציאה {financials ? `— ${financials.ticker} · ${financials.nameHe}` : "— בנייה ידנית"}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <AssumptionField
          label="מחיר מניה נוכחי ($) — נתון חי"
          value={currentPrice}
          onChange={setCurrentPrice}
          rationaleHe={isAuto ? "מחיר המסחר החי הנוכחי (FMP)." : undefined}
        />
        <AssumptionField
          label="שווי שוק נוכחי ($M) — נתון חי"
          value={marketCap}
          onChange={setMarketCap}
          rationaleHe={isAuto ? "שווי השוק החי הנוכחי של החברה (FMP)." : undefined}
        />
        <AssumptionField
          label="הכנסות שנה בסיס ($M) — נתון חי"
          value={baseRevenue}
          onChange={setBaseRevenue}
          rationaleHe={isAuto ? "הכנסות התקופה האחרונה, מדוח כספי חי (FMP)." : undefined}
        />
        <AssumptionField
          label="צמיחת הכנסות שנתית (%)"
          value={growth}
          onChange={setGrowth}
          rationaleHe={
            isAuto && analystGrowthPct !== undefined
              ? `תחזית קונצנזוס אנליסטים חיה לצמיחת הכנסות שנה קדימה (${analystGrowthPct.toFixed(1)}%).`
              : isAuto
                ? "אין תחזית אנליסטים חיה לחברה זו כרגע — ברירת מחדל שמרנית."
                : undefined
          }
        />
        <AssumptionField
          label="מרווח רווח נקי (%)"
          value={margin}
          onChange={setMargin}
          rationaleHe={isAuto ? "רווח נקי חלקי הכנסות, מהדוח הכספי החי האחרון." : undefined}
        />
        <AssumptionField label="אופק שנים" value={years} onChange={setYears} step="1" />
        <AssumptionField
          label="שיעור תשואה נדרש / WACC (%)"
          value={waccPct}
          onChange={setWaccPct}
          rationaleHe={isAuto ? "שיעור אופייני לפרופיל הסיכון והצמיחה של החברה." : undefined}
        />
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold text-slate-700">מכפילי יציאה (P/E עתידי) — שלושה תרחישים</p>
        <div className="grid grid-cols-3 gap-3">
          <AssumptionField
            label="שמרני"
            value={bearMultiple}
            onChange={setBearMultiple}
            rationaleHe={isAuto ? `כ-70% מהמכפיל החי הנוכחי (${basePe.toFixed(0)}).` : undefined}
          />
          <AssumptionField
            label="בסיס"
            value={baseMultiple}
            onChange={setBaseMultiple}
            rationaleHe={isAuto ? "מכפיל ה-P/E החי הנוכחי של החברה (FMP), ללא שינוי." : undefined}
          />
          <AssumptionField
            label="אופטימי"
            value={bullMultiple}
            onChange={setBullMultiple}
            rationaleHe={isAuto ? `כ-130% מהמכפיל החי הנוכחי (${basePe.toFixed(0)}).` : undefined}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={handleCalculate}
        disabled={isLoading}
        className="w-full rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {isLoading ? "מחשב..." : "הרץ את שלושת התרחישים"}
      </button>

      {error && <p className="text-sm text-negative">{error}</p>}

      {result && (
        <div className="grid gap-3 sm:grid-cols-3">
          {[result.bear, result.base, result.bull].map((scenario) => (
            <div key={scenario.label} className="rounded-lg border border-surface-border bg-surface-raised p-3">
              <p className="mb-1 text-xs font-bold text-slate-800">{scenario.label}</p>
              <ResultRow label="שווי הוגן היום" value={`$${scenario.fair_price_today.toFixed(2)}`} emphasize />
              <ResultRow label="מרווח ביטחון" value={`${scenario.margin_of_safety_pct.toFixed(1)}%`} />
              <ResultRow label="מחיר יעד עתידי" value={`$${scenario.projected_price.toFixed(2)}`} />
              <ResultRow label="תשואה שנתית גלומה" value={`${scenario.cagr_pct.toFixed(1)}%`} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
