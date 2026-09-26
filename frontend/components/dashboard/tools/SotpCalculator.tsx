"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { FormField } from "@/components/dashboard/tools/FormField";
import { ResultRow } from "@/components/dashboard/tools/ResultRow";

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

// Sum-of-the-Parts calculator: value each business segment on its own
// metric x multiple, then combine into one enterprise value.
export function SotpCalculator() {
  const [segments, setSegments] = useState<SegmentInput[]>([
    { name: "עננית", metricValue: "300", multiple: "12" },
    { name: "חומרה", metricValue: "150", multiple: "6" },
  ]);
  const [netDebt, setNetDebt] = useState("500");
  const [shares, setShares] = useState("100");
  const [result, setResult] = useState<SotpResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  function updateSegment(index: number, field: keyof SegmentInput, value: string) {
    setSegments((prev) =>
      prev.map((seg, i) => (i === index ? { ...seg, [field]: value } : seg))
    );
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
      <div className="space-y-2">
        {segments.map((seg, index) => (
          <div key={index} className="flex items-end gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-400">שם המגזר</label>
              <input
                type="text"
                value={seg.name}
                onChange={(e) => updateSegment(index, "name", e.target.value)}
                className="w-full rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand-500"
              />
            </div>
            <div className="w-28">
              <FormField
                label="מדד ($M)"
                value={seg.metricValue}
                onChange={(v) => updateSegment(index, "metricValue", v)}
              />
            </div>
            <div className="w-24">
              <FormField
                label="מכפיל"
                value={seg.multiple}
                onChange={(v) => updateSegment(index, "multiple", v)}
              />
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
        ))}
        <button
          type="button"
          onClick={addSegment}
          className="flex items-center gap-1.5 text-xs font-medium text-brand-400 hover:underline"
        >
          <Plus size={14} /> הוספת מגזר
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="חוב נטו ($M)" value={netDebt} onChange={setNetDebt} />
        <FormField label="מניות במחזור (M)" value={shares} onChange={setShares} />
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
          <ResultRow
            label="שווי הוגן למניה"
            value={`$${result.value_per_share.toFixed(2)}`}
            emphasize
          />
          <ResultRow label="שווי פעילות כולל (EV)" value={`$${result.enterprise_value.toFixed(0)}M`} />
          <ResultRow label="שווי הון עצמי" value={`$${result.equity_value.toFixed(0)}M`} />
          <div className="mt-2 border-t border-surface-border pt-2">
            {result.segment_values.map((seg) => (
              <ResultRow
                key={seg.name}
                label={seg.name}
                value={`$${seg.segment_value.toFixed(0)}M`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
