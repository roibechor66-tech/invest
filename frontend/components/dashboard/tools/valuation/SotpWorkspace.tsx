"use client";

import { useState } from "react";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { AssumptionField } from "@/components/dashboard/tools/valuation/AssumptionField";
import { ResultRow } from "@/components/dashboard/tools/ResultRow";
import { CompanyFinancials } from "@/lib/mock-data/valuation-financials";
import { useLiveCompanyFundamentals } from "@/lib/hooks/useLiveCompanyFundamentals";

interface SegmentInput {
  name: string;
  metricValue: string;
  multiple: string;
}

interface SotpResult {
  segment_values: { name: string; segment_value: number }[];
  enterprise_value: number;
  equity_value: number;
  value_per_share: number;
}

interface SotpWorkspaceProps {
  ticker: string | null;
  mode: "auto" | "manual";
  onBack: () => void;
}

function buildInitialSegments(mode: "auto" | "manual", financials: CompanyFinancials | undefined): SegmentInput[] {
  if (mode === "auto" && financials) {
    if (financials.segments && financials.segments.length > 0) {
      return financials.segments.map((seg) => ({
        name: seg.nameHe,
        metricValue: ((financials.revenueUsdM * seg.revenueSharePct) / 100).toFixed(0),
        multiple: String(seg.suggestedMultiple),
      }));
    }
    // No real segment breakdown for this company in the demo — fall
    // back to a single segment covering the whole business, so the
    // model still runs (equivalent to the trading-multiples model).
    return [{ name: "כלל הפעילות", metricValue: financials.ebitdaUsdM.toFixed(0), multiple: "12" }];
  }
  return [
    { name: "עננית", metricValue: "300", multiple: "12" },
    { name: "חומרה", metricValue: "150", multiple: "6" },
  ];
}

// Phase 3, third track: same "fetch live, then mount" gating as
// DcfWorkspace — see that file's comment for why. `financials.segments`
// now comes from FMP's live revenue-segmentation endpoint when the
// caller's FMP plan includes it (see useLiveCompanyFundamentals's module
// docstring for the two-tier honesty split) — the single-segment
// fallback below already handled "no segment breakdown" before this
// change, so it doubles as the honest fallback for "FMP plan doesn't
// include segments" too, with no new UI needed for that distinction.
export function SotpWorkspace({ ticker, mode, onBack }: SotpWorkspaceProps) {
  const live = useLiveCompanyFundamentals(ticker);
  if (mode === "auto" && ticker && live.isLoading) {
    return <p className="text-sm text-slate-500">טוען נתונים פיננסיים חיים (FMP)...</p>;
  }
  return <SotpWorkspaceInner ticker={ticker} mode={mode} onBack={onBack} financials={live.financials} />;
}

function SotpWorkspaceInner({
  ticker,
  mode,
  onBack,
  financials,
}: SotpWorkspaceProps & { financials: CompanyFinancials | undefined }) {
  const isAuto = mode === "auto" && financials;
  const usedFallbackSingleSegment = isAuto && (!financials?.segments || financials.segments.length === 0);

  const [segments, setSegments] = useState<SegmentInput[]>(() => buildInitialSegments(mode, financials));
  const [netDebt, setNetDebt] = useState(String(isAuto ? financials!.netDebtUsdM.toFixed(0) : "500"));
  const [shares, setShares] = useState(String(isAuto ? financials!.sharesOutstandingM.toFixed(0) : "100"));
  const [result, setResult] = useState<SotpResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  function updateSegment(index: number, field: keyof SegmentInput, value: string) {
    setSegments((prev) => prev.map((seg, i) => (i === index ? { ...seg, [field]: value } : seg)));
  }

  function addSegment() {
    setSegments((prev) => [...prev, { name: "", metricValue: "", multiple: "" }]);
  }

  function removeSegment(index: number) {
    setSegments((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleCalculate() {
    setError(null);
    setIsLoading(true);
    try {
      const data = await apiFetch<SotpResult>("/api/valuation/sotp", {
        method: "POST",
        body: JSON.stringify({
          segments: segments.map((seg) => ({
            name: seg.name || "מגזר",
            metric_value: Number(seg.metricValue),
            multiple: Number(seg.multiple),
          })),
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
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
        <ArrowRight size={14} /> חזרה
      </button>

      <p className="text-sm font-bold text-slate-900">
        SOTP {financials ? `— ${financials.ticker} · ${financials.nameHe}` : "— בנייה ידנית"}
      </p>
      {usedFallbackSingleSegment && (
        <p className="text-[11px] leading-relaxed text-amber-500">
          אין כרגע פירוק מגזרים חי לחברה זו (נדרשת תוכנית FMP שכוללת נתוני segmentation,
          או שהחברה אינה מדווחת במגזרים) — ההרצה האוטומטית התחילה ממגזר אחד שמייצג את
          כל הפעילות (שקול ל-EV/EBITDA רגיל). פרקו אותו למגזרים אמיתיים אם ידוע לכם איך
          החברה מתחלקת בפועל.
        </p>
      )}

      <div className="space-y-2">
        {segments.map((seg, index) => (
          <div key={index} className="space-y-1 rounded-lg border border-surface-border bg-surface-raised/60 p-2.5">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-slate-500">שם המגזר</label>
                <input
                  type="text"
                  value={seg.name}
                  onChange={(e) => updateSegment(index, "name", e.target.value)}
                  className="w-full rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500"
                />
              </div>
              <div className="w-28">
                <AssumptionField label="מדד ($M)" value={seg.metricValue} onChange={(v) => updateSegment(index, "metricValue", v)} />
              </div>
              <div className="w-24">
                <AssumptionField label="מכפיל" value={seg.multiple} onChange={(v) => updateSegment(index, "multiple", v)} />
              </div>
              <button
                type="button"
                onClick={() => removeSegment(index)}
                className="mb-0.5 rounded-lg border border-surface-border p-2 text-slate-500 hover:border-negative/50 hover:text-negative"
                aria-label="הסר מגזר"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
        <button type="button" onClick={addSegment} className="flex items-center gap-1.5 text-xs font-medium text-brand-400 hover:underline">
          <Plus size={14} /> הוספת מגזר
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <AssumptionField
          label="חוב נטו ($M) — נתון חי"
          value={netDebt}
          onChange={setNetDebt}
          rationaleHe={isAuto ? "חוב פחות מזומן, מדוח מאזן חי (FMP)." : undefined}
        />
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
        disabled={isLoading || segments.length === 0}
        className="w-full rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {isLoading ? "מחשב..." : "חשב שווי SOTP"}
      </button>

      {error && <p className="text-sm text-negative">{error}</p>}

      {result && (
        <div className="rounded-lg border border-surface-border bg-surface-raised p-4">
          <ResultRow label="שווי הוגן למניה" value={`$${result.value_per_share.toFixed(2)}`} emphasize />
          <ResultRow label="שווי פעילות כולל (EV)" value={`$${result.enterprise_value.toFixed(0)}M`} />
          <ResultRow label="שווי הון עצמי" value={`$${result.equity_value.toFixed(0)}M`} />
          <div className="mt-2 border-t border-surface-border pt-2">
            {result.segment_values.map((seg, i) => (
              <ResultRow key={`${seg.name}-${i}`} label={seg.name} value={`$${seg.segment_value.toFixed(0)}M`} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
