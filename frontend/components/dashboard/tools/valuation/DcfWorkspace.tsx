"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { AssumptionField } from "@/components/dashboard/tools/valuation/AssumptionField";
import { ResultRow } from "@/components/dashboard/tools/ResultRow";
import { mockStockDetails } from "@/lib/mock-data/stock-details";
import { CompanyFinancials } from "@/lib/mock-data/valuation-financials";
import { useLiveCompanyFundamentals } from "@/lib/hooks/useLiveCompanyFundamentals";

interface DcfResult {
  enterprise_value: number;
  equity_value: number;
  value_per_share: number;
  terminal_value: number;
}

interface DcfWorkspaceProps {
  ticker: string | null;
  mode: "auto" | "manual";
  onBack: () => void;
}

// A simple sector-flavored WACC heuristic — not meant to be precise
// (that needs a real beta/cost-of-capital model), just directionally
// sensible for a demo: higher-growth, higher-beta sectors get a higher
// discount rate; banks and generic-pharma get a slightly lower one.
function estimateWaccPct(sectorNameHe: string, growthPct: number): number {
  if (sectorNameHe.includes("בנקא")) return 9;
  if (growthPct >= 20) return 11.5;
  if (growthPct >= 12) return 10;
  return 8.5;
}

// Phase 3, third track: the outer component fetches live financials
// (FMP) for the ticker and only mounts the actual workspace once that
// fetch has settled — DcfWorkspaceInner's useState initializers below
// read `financials`/`analystGrowthPct` exactly once, at mount, so it
// must not mount until those are their FINAL values (an async fetch
// finishing after mount wouldn't re-run a useState initializer).
export function DcfWorkspace({ ticker, mode, onBack }: DcfWorkspaceProps) {
  const live = useLiveCompanyFundamentals(ticker);
  if (mode === "auto" && ticker && live.isLoading) {
    return <p className="text-sm text-slate-500">טוען נתונים פיננסיים חיים (FMP)...</p>;
  }
  return (
    <DcfWorkspaceInner
      ticker={ticker}
      mode={mode}
      onBack={onBack}
      financials={live.financials}
      analystGrowthPct={live.estimates[0]?.revenueGrowthPct ?? undefined}
    />
  );
}

function DcfWorkspaceInner({
  ticker,
  mode,
  onBack,
  financials,
  analystGrowthPct,
}: DcfWorkspaceProps & { financials: CompanyFinancials | undefined; analystGrowthPct: number | undefined }) {
  const detail = ticker ? mockStockDetails[ticker] : undefined;
  const isAuto = mode === "auto" && financials;

  // Phase 3, third track: growth now comes from FMP's live analyst
  // consensus alone — the old mock "company guidance" figure had no
  // live equivalent, so the analyst/guidance blend this used to do is
  // gone; see valuation-financials.ts's module docstring.
  const growthPct = analystGrowthPct ?? 8;
  const wacc = detail ? estimateWaccPct(detail.sectorNameHe, growthPct) : 10;

  const [baseFcf, setBaseFcf] = useState(String(isAuto ? financials!.fcfUsdM.toFixed(0) : "1000"));
  const [growth, setGrowth] = useState(String(isAuto ? Math.min(growthPct, 20).toFixed(1) : "8"));
  const [discount, setDiscount] = useState(String(isAuto ? wacc : "10"));
  const [terminalGrowth, setTerminalGrowth] = useState("3");
  const [years, setYears] = useState("5");
  const [netDebt, setNetDebt] = useState(String(isAuto ? financials!.netDebtUsdM.toFixed(0) : "0"));
  const [shares, setShares] = useState(String(isAuto ? financials!.sharesOutstandingM.toFixed(0) : "100"));
  const [result, setResult] = useState<DcfResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleCalculate() {
    setError(null);
    setIsLoading(true);
    try {
      const data = await apiFetch<DcfResult>("/api/valuation/dcf", {
        method: "POST",
        body: JSON.stringify({
          base_fcf: Number(baseFcf),
          growth_rate_pct: Number(growth),
          discount_rate_pct: Number(discount),
          terminal_growth_pct: Number(terminalGrowth),
          projection_years: Number(years),
          net_debt: Number(netDebt),
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
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowRight size={14} /> חזרה
      </button>

      <p className="text-sm font-bold text-slate-900">
        DCF {financials ? `— ${financials.ticker} · ${financials.nameHe}` : "— בנייה ידנית"}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <AssumptionField
          label="תזרים מזומנים חופשי בסיסי ($M) — נתונים חיים (FMP)"
          value={baseFcf}
          onChange={setBaseFcf}
          rationaleHe={isAuto ? `תזרים מזומנים חופשי חי (${financials!.nameHe}), כ-${((financials!.fcfUsdM / financials!.netIncomeUsdM) * 100).toFixed(0)}% מהרווח הנקי הנוכחי.` : undefined}
        />
        <AssumptionField
          label="צמיחה שנתית (%)"
          value={growth}
          onChange={setGrowth}
          rationaleHe={
            isAuto && analystGrowthPct !== undefined
              ? `תחזית קונצנזוס אנליסטים חיה לצמיחת הכנסות לשנה הקרובה (${analystGrowthPct.toFixed(1)}%), מוגבל ל-20% לשמרנות בתחזית רב-שנתית.`
              : isAuto
                ? "אין תחזית אנליסטים חיה לחברה זו כרגע — ברירת מחדל שמרנית."
                : undefined
          }
        />
        <AssumptionField
          label="שיעור היוון / WACC (%)"
          value={discount}
          onChange={setDiscount}
          rationaleHe={isAuto ? `שיעור אופייני לפרופיל הסיכון של ${detail?.sectorNameHe ?? "הענף"} וקצב הצמיחה הנוכחי — לא תחליף לחישוב בטא/עלות הון מלא.` : undefined}
        />
        <AssumptionField
          label="צמיחה טרמינלית (%)"
          value={terminalGrowth}
          onChange={setTerminalGrowth}
          rationaleHe={isAuto ? "קצב צמיחה טרמינלי סטנדרטי, בקירוב לצמיחה הכלכלית הריאלית ארוכת הטווח." : undefined}
        />
        <AssumptionField label="מספר שנות תחזית" value={years} onChange={setYears} step="1" />
        <AssumptionField
          label="חוב נטו ($M) — נתונים חיים (FMP)"
          value={netDebt}
          onChange={setNetDebt}
          rationaleHe={isAuto ? "חוב פחות מזומן, מדוח מאזן חי (שלילי = עודף מזומן נטו)." : undefined}
        />
        <AssumptionField
          label="מניות במחזור (M) — נתונים חיים (FMP)"
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
        {isLoading ? "מחשב..." : "חשב שווי DCF"}
      </button>

      {error && <p className="text-sm text-negative">{error}</p>}

      {result && (
        <div className="rounded-lg border border-surface-border bg-surface-raised p-4">
          <ResultRow label="שווי הוגן למניה" value={`$${result.value_per_share.toFixed(2)}`} emphasize />
          <ResultRow label="שווי פעילות (EV)" value={`$${result.enterprise_value.toFixed(0)}M`} />
          <ResultRow label="שווי הון עצמי" value={`$${result.equity_value.toFixed(0)}M`} />
          <ResultRow label="ערך טרמינלי" value={`$${result.terminal_value.toFixed(0)}M`} />
        </div>
      )}
    </div>
  );
}
