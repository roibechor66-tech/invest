"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import clsx from "clsx";
import { apiFetch, ApiError } from "@/lib/api";
import { AssumptionField } from "@/components/dashboard/tools/valuation/AssumptionField";
import { ResultRow } from "@/components/dashboard/tools/ResultRow";
import { mockStockDetails } from "@/lib/mock-data/stock-details";
import { CompanyFinancials } from "@/lib/mock-data/valuation-financials";
import { useLiveCompanyFundamentals } from "@/lib/hooks/useLiveCompanyFundamentals";

interface MultipleResult {
  enterprise_value: number;
  equity_value: number;
  value_per_share: number;
}

interface TradingMultiplesWorkspaceProps {
  ticker: string | null;
  mode: "auto" | "manual";
  onBack: () => void;
}

// Phase 3, third track: same "fetch live, then mount" gating as
// DcfWorkspace — see that file's comment for why. The industry-average
// target multiples (detail.industryAverages) stay mock/illustrative, as
// decided across Phase 3's third track — see useLiveCompanyFundamentals's
// module docstring.
export function TradingMultiplesWorkspace({ ticker, mode, onBack }: TradingMultiplesWorkspaceProps) {
  const live = useLiveCompanyFundamentals(ticker);
  if (mode === "auto" && ticker && live.isLoading) {
    return <p className="text-sm text-slate-500">טוען נתונים פיננסיים חיים (FMP)...</p>;
  }
  return (
    <TradingMultiplesWorkspaceInner ticker={ticker} mode={mode} onBack={onBack} financials={live.financials} />
  );
}

// Trading (comparable) multiples: apply a target multiple to the metric
// the market actually uses for this kind of business. Most sectors are
// compared on EV/EBITDA; banks and other financials are compared on P/E
// against net income instead, since EBITDA/enterprise value aren't
// meaningful concepts for a bank's balance sheet.
function TradingMultiplesWorkspaceInner({
  ticker,
  mode,
  onBack,
  financials,
}: TradingMultiplesWorkspaceProps & { financials: CompanyFinancials | undefined }) {
  const detail = ticker ? mockStockDetails[ticker] : undefined;
  const isAuto = mode === "auto" && financials;
  const isBank = (detail?.sectorNameHe ?? "").includes("בנקא");

  const [metricType, setMetricType] = useState<"ebitda" | "netIncome">(isBank ? "netIncome" : "ebitda");
  const metricValue0 =
    metricType === "ebitda" ? financials?.ebitdaUsdM : financials?.netIncomeUsdM;
  const multiple0 = metricType === "ebitda" ? detail?.industryAverages.evEbitda : detail?.industryAverages.peRatio;

  const [metricValue, setMetricValue] = useState(String(isAuto ? metricValue0?.toFixed(0) ?? "500" : "500"));
  const [multiple, setMultiple] = useState(String(isAuto ? multiple0?.toFixed(1) ?? "12" : "12"));
  const [netDebt, setNetDebt] = useState(String(isAuto ? financials!.netDebtUsdM.toFixed(0) : "0"));
  const [shares, setShares] = useState(String(isAuto ? financials!.sharesOutstandingM.toFixed(0) : "100"));
  const [result, setResult] = useState<MultipleResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  function switchMetricType(next: "ebitda" | "netIncome") {
    setMetricType(next);
    if (isAuto && financials && detail) {
      const nextMetric = next === "ebitda" ? financials.ebitdaUsdM : financials.netIncomeUsdM;
      const nextMultiple = next === "ebitda" ? detail.industryAverages.evEbitda : detail.industryAverages.peRatio;
      setMetricValue(nextMetric.toFixed(0));
      setMultiple(nextMultiple.toFixed(1));
      setNetDebt(next === "ebitda" ? financials.netDebtUsdM.toFixed(0) : "0");
    }
  }

  async function handleCalculate() {
    setError(null);
    setIsLoading(true);
    try {
      const data = await apiFetch<MultipleResult>("/api/valuation/ev-ebitda", {
        method: "POST",
        body: JSON.stringify({
          ebitda: Number(metricValue),
          multiple: Number(multiple),
          net_debt: metricType === "ebitda" ? Number(netDebt) : 0,
          shares_outstanding: Number(shares),
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
        מכפילי מסחר {financials ? `— ${financials.ticker} · ${financials.nameHe}` : "— בנייה ידנית"}
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => switchMetricType("ebitda")}
          className={clsx(
            "flex-1 rounded-lg border px-3 py-1.5 text-xs font-semibold",
            metricType === "ebitda" ? "border-brand-500 bg-brand-500/10 text-brand-400" : "border-surface-border text-slate-500"
          )}
        >
          EV / EBITDA
        </button>
        <button
          type="button"
          onClick={() => switchMetricType("netIncome")}
          className={clsx(
            "flex-1 rounded-lg border px-3 py-1.5 text-xs font-semibold",
            metricType === "netIncome" ? "border-brand-500 bg-brand-500/10 text-brand-400" : "border-surface-border text-slate-500"
          )}
        >
          P/E (רווח נקי)
        </button>
      </div>
      {isBank && metricType === "ebitda" && (
        <p className="text-[11px] text-amber-500">
          לרוב, בנקים מוערכים לפי P/E ותשואה להון ולא לפי EV/EBITDA — שקלו לעבור למכפיל P/E.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <AssumptionField
          label={metricType === "ebitda" ? "EBITDA ($M) — נתון חי" : "רווח נקי ($M) — נתון חי"}
          value={metricValue}
          onChange={setMetricValue}
          rationaleHe={isAuto ? `${metricType === "ebitda" ? "EBITDA" : "רווח נקי"} מהדוח הכספי החי האחרון (FMP).` : undefined}
        />
        <AssumptionField
          label={metricType === "ebitda" ? "מכפיל EV/EBITDA יעד" : "מכפיל P/E יעד"}
          value={multiple}
          onChange={setMultiple}
          rationaleHe={isAuto ? `ממוצע ענף מוערך (דמו) עבור ${detail!.sectorNameHe} (${multiple0?.toFixed(1)}).` : undefined}
        />
        {metricType === "ebitda" && (
          <AssumptionField
            label="חוב נטו ($M) — נתון חי"
            value={netDebt}
            onChange={setNetDebt}
            rationaleHe={isAuto ? "חוב פחות מזומן, מדוח מאזן חי (FMP)." : undefined}
          />
        )}
        <AssumptionField
          label="מניות במחזור (M) — נתון חי"
          value={shares}
          onChange={setShares}
          rationaleHe={isAuto ? "ממוצע משוקלל של מניות במחזור, מהדוח הכספי החי האחרון." : undefined}
        />
      </div>

      <button
        type="button"
        onClick={handleCalculate}
        disabled={isLoading}
        className="w-full rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {isLoading ? "מחשב..." : "חשב שווי"}
      </button>

      {error && <p className="text-sm text-negative">{error}</p>}

      {result && (
        <div className="rounded-lg border border-surface-border bg-surface-raised p-4">
          <ResultRow label="שווי הוגן למניה" value={`$${result.value_per_share.toFixed(2)}`} emphasize />
          {metricType === "ebitda" && (
            <>
              <ResultRow label="שווי פעילות (EV)" value={`$${result.enterprise_value.toFixed(0)}M`} />
              <ResultRow label="שווי הון עצמי" value={`$${result.equity_value.toFixed(0)}M`} />
            </>
          )}
          {metricType === "netIncome" && (
            <ResultRow label="שווי הון עצמי כולל" value={`$${result.equity_value.toFixed(0)}M`} />
          )}
        </div>
      )}
    </div>
  );
}
