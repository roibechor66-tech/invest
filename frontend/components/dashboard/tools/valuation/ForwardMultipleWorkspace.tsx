"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { AssumptionField } from "@/components/dashboard/tools/valuation/AssumptionField";
import { ResultRow } from "@/components/dashboard/tools/ResultRow";
import { CompanyFinancials } from "@/lib/mock-data/valuation-financials";
import {
  LiveAnalystEstimateYear,
  LiveMultiples,
  useLiveCompanyFundamentals,
} from "@/lib/hooks/useLiveCompanyFundamentals";

interface ForwardMultipleResult {
  implied_price: number;
}

interface FcfYieldResult {
  fcf_yield_pct: number;
}

interface ForwardMultipleWorkspaceProps {
  ticker: string | null;
  mode: "auto" | "manual";
  onBack: () => void;
}

// Phase 3, third track: same "fetch live, then mount" gating as
// DcfWorkspace — see that file's comment for why.
export function ForwardMultipleWorkspace({ ticker, mode, onBack }: ForwardMultipleWorkspaceProps) {
  const live = useLiveCompanyFundamentals(ticker);
  if (mode === "auto" && ticker && live.isLoading) {
    return <p className="text-sm text-slate-500">טוען נתונים פיננסיים חיים (FMP)...</p>;
  }
  return (
    <ForwardMultipleWorkspaceInner
      ticker={ticker}
      mode={mode}
      onBack={onBack}
      financials={live.financials}
      multiples={live.multiples ?? undefined}
      nextEstimate={live.estimates[0]}
    />
  );
}

function ForwardMultipleWorkspaceInner({
  ticker,
  mode,
  onBack,
  financials,
  multiples,
  nextEstimate,
}: ForwardMultipleWorkspaceProps & {
  financials: CompanyFinancials | undefined;
  multiples: LiveMultiples | undefined;
  nextEstimate: LiveAnalystEstimateYear | undefined;
}) {
  const isAuto = mode === "auto" && financials;

  // Phase 3, third track: forward EPS/forward P/E now come straight from
  // FMP's live analyst-estimate row (estimatedEps) and live price,
  // instead of being derived from the trailing P/E + an EPS-growth %.
  const forwardEps = nextEstimate?.estimatedEps ?? undefined;
  const forwardPe = forwardEps && multiples ? multiples.priceUsd / forwardEps : undefined;

  const [forwardMetric, setForwardMetric] = useState(String(isAuto && forwardEps ? forwardEps.toFixed(2) : "6.5"));
  const [multiple, setMultiple] = useState(String(isAuto && forwardPe ? forwardPe.toFixed(1) : "25"));
  const [priceResult, setPriceResult] = useState<ForwardMultipleResult | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [isPriceLoading, setIsPriceLoading] = useState(false);

  const [fcf, setFcf] = useState(String(isAuto ? financials!.fcfUsdM.toFixed(0) : "400"));
  const [marketCap, setMarketCap] = useState(String(isAuto ? financials!.marketCapUsdM.toFixed(0) : "8000"));
  const [yieldResult, setYieldResult] = useState<FcfYieldResult | null>(null);
  const [yieldError, setYieldError] = useState<string | null>(null);

  async function handlePriceCalculate() {
    setPriceError(null);
    setIsPriceLoading(true);
    try {
      const data = await apiFetch<ForwardMultipleResult>("/api/valuation/forward-multiple", {
        method: "POST",
        body: JSON.stringify({ forward_metric: Number(forwardMetric), multiple: Number(multiple) }),
      });
      setPriceResult(data);
    } catch (err) {
      setPriceError(err instanceof ApiError ? err.message : "החישוב נכשל");
    } finally {
      setIsPriceLoading(false);
    }
  }

  async function handleYieldCalculate() {
    setYieldError(null);
    try {
      const data = await apiFetch<FcfYieldResult>("/api/valuation/fcf-yield", {
        method: "POST",
        body: JSON.stringify({ fcf: Number(fcf), market_cap: Number(marketCap) }),
      });
      setYieldResult(data);
    } catch (err) {
      setYieldError(err instanceof ApiError ? err.message : "החישוב נכשל");
    }
  }

  return (
    <div className="space-y-6">
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
        <ArrowRight size={14} /> חזרה
      </button>

      <p className="text-sm font-bold text-slate-900">
        מכפיל עתידי {financials ? `— ${financials.ticker} · ${financials.nameHe}` : "— בנייה ידנית"}
      </p>

      <div className="space-y-3">
        <p className="text-xs font-semibold text-slate-500">מכפיל עתידי (Forward Multiple)</p>
        <div className="grid grid-cols-2 gap-3">
          <AssumptionField
            label="רווח למניה עתידי (שנה קדימה, $)"
            value={forwardMetric}
            onChange={setForwardMetric}
            rationaleHe={
              isAuto && forwardEps
                ? "אומדן EPS עתידי חי מקונצנזוס האנליסטים (FMP)."
                : isAuto
                  ? "אין תחזית אנליסטים חיה לחברה זו כרגע."
                  : undefined
            }
          />
          <AssumptionField
            label="מכפיל עתידי (Forward P/E)"
            value={multiple}
            onChange={setMultiple}
            rationaleHe={isAuto && forwardPe ? "מחיר חי חלקי אומדן EPS עתידי חי (FMP)." : undefined}
          />
        </div>
        <button
          type="button"
          onClick={handlePriceCalculate}
          disabled={isPriceLoading}
          className="w-full rounded-lg bg-brand-500 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {isPriceLoading ? "מחשב..." : "חשב מחיר יעד"}
        </button>
        {priceError && <p className="text-sm text-negative">{priceError}</p>}
        {priceResult && (
          <div className="rounded-lg border border-surface-border bg-surface-raised p-3">
            <ResultRow label="מחיר יעד גלום" value={`$${priceResult.implied_price.toFixed(2)}`} emphasize />
          </div>
        )}
      </div>

      <div className="space-y-3 border-t border-surface-border pt-5">
        <p className="text-xs font-semibold text-slate-500">בדיקת היגיון נוספת: תשואת FCF (FCF Yield)</p>
        <div className="grid grid-cols-2 gap-3">
          <AssumptionField
            label="תזרים מזומנים חופשי ($M) — נתון חי"
            value={fcf}
            onChange={setFcf}
            rationaleHe={isAuto ? "תזרים מזומנים חופשי, מדוח כספי חי (FMP)." : undefined}
          />
          <AssumptionField
            label="שווי שוק ($M) — נתון חי"
            value={marketCap}
            onChange={setMarketCap}
            rationaleHe={isAuto ? "שווי השוק החי הנוכחי של החברה (FMP)." : undefined}
          />
        </div>
        <button
          type="button"
          onClick={handleYieldCalculate}
          className="w-full rounded-lg bg-brand-500 py-2 text-sm font-semibold text-white hover:bg-brand-600"
        >
          חשב תשואת FCF
        </button>
        {yieldError && <p className="text-sm text-negative">{yieldError}</p>}
        {yieldResult && (
          <div className="rounded-lg border border-surface-border bg-surface-raised p-3">
            <ResultRow label="תשואת FCF" value={`${yieldResult.fcf_yield_pct.toFixed(2)}%`} emphasize />
          </div>
        )}
      </div>
    </div>
  );
}
