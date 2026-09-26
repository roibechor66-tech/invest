"use client";

import { useState } from "react";
import { GitCompare, Loader2, RefreshCw } from "lucide-react";
import { TickerSearchInput } from "@/components/dashboard/tools/TickerSearchInput";
import { TickerSuggestion } from "@/lib/ticker-search";
import {
  computeCorrelation,
  correlationPeriodOptions,
  correlationStrengthLabelHe,
  getCorrelationEntity,
  getCorrelationSuggestions,
  CorrelationResult,
} from "@/lib/mock-data/correlation";
import { apiFetch, ApiError } from "@/lib/api";

interface EntityPick {
  id: string;
  label: string; // display label, without the "(type)" suffix used in the dropdown
}

interface Explanation {
  summaryHe: string;
  reasonHe: string;
  impactHe: string;
  conclusionHe: string;
}

function EntitySearchBox({
  title,
  query,
  onQueryChange,
  picked,
  onPick,
}: {
  title: string;
  query: string;
  onQueryChange: (v: string) => void;
  picked: EntityPick | null;
  onPick: (suggestion: TickerSuggestion) => void;
}) {
  const suggestions = getCorrelationSuggestions(query);
  return (
    <div className="rounded-lg border border-surface-border bg-surface-raised p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">{title}</p>
      <TickerSearchInput
        value={query}
        onChange={onQueryChange}
        suggestions={suggestions}
        onSelectSuggestion={onPick}
        placeholder="חפשו מניה, מדד, סקטור, אג&quot;ח או סחורה..."
      />
      {picked && (
        <p className="mt-2 text-sm font-semibold text-brand-500" dir="ltr">
          {picked.id} <span className="font-normal text-slate-500" dir="rtl">— {picked.label}</span>
        </p>
      )}
    </div>
  );
}

// A -1..+1 gauge showing exactly where the coefficient falls, banded to
// the same thresholds correlationStrengthLabelHe() uses (0.15/0.4/0.7)
// so the color zone the marker lands on always agrees with the strength
// label shown next to the number — this is the main "how strong, in
// proportion, and in which direction" visual the panel is built around.
const CORRELATION_SCALE_GRADIENT =
  "linear-gradient(to right, #c8102e 0%, #c8102e 15%, #e8776f 15%, #e8776f 30%, #f3b8b0 30%, #f3b8b0 42.5%, " +
  "#cbd5e1 42.5%, #cbd5e1 57.5%, #a8ddc0 57.5%, #a8ddc0 70%, #4fb583 70%, #4fb583 85%, #0a7a3d 85%, #0a7a3d 100%)";

function CorrelationScale({ value }: { value: number }) {
  const pct = ((value + 1) / 2) * 100;
  return (
    <div className="mt-4">
      <div dir="ltr" className="relative h-3 w-full rounded-full" style={{ background: CORRELATION_SCALE_GRADIENT }}>
        {/* Tick marks at the strength-band boundaries, for a visual reference beyond the color change.
            This bar is wrapped in dir="ltr" above, so plain `left` (physical, not logical) always
            means "toward -1" here regardless of the page's own RTL direction. */}
        {[-0.7, -0.4, -0.15, 0.15, 0.4, 0.7].map((tick) => (
          <div key={tick} className="absolute top-0 h-full w-px bg-white/60" style={{ left: `${((tick + 1) / 2) * 100}%` }} />
        ))}
        <div className="absolute bottom-full flex flex-col items-center" style={{ left: `${pct}%`, transform: "translateX(-50%)" }}>
          <div className="mb-1 whitespace-nowrap rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-white shadow" dir="ltr">
            {value >= 0 ? "+" : ""}
            {value.toFixed(2)}
          </div>
        </div>
        <div className="absolute top-1/2 h-4 w-4 rounded-full border-2 border-white bg-slate-900 shadow" style={{ left: `${pct}%`, transform: "translate(-50%, -50%)" }} />
      </div>
      <div dir="ltr" className="mt-1 flex justify-between text-[10px] text-slate-400">
        <span>-1.0 · הפוכה לחלוטין</span>
        <span>0 · אין קשר</span>
        <span>+1.0 · זהה לחלוטין</span>
      </div>
    </div>
  );
}

// Small paired bar-chart of the synthetic per-period returns used to
// produce the coefficient — illustrative, not a real return history (see
// lib/mock-data/correlation.ts), just enough to make "they move together"
// or "they don't" visually obvious alongside the scale above.
function PairedBarChart({ labelA, labelB, result }: { labelA: string; labelB: string; result: CorrelationResult }) {
  const all = [...result.seriesA, ...result.seriesB];
  const maxAbs = Math.max(1, ...all.map((v) => Math.abs(v)));
  const height = 90;
  const mid = height / 2;
  const barWidth = 9;
  const groupWidth = barWidth * 2 + 6;
  const leftAxisWidth = 34;
  const width = groupWidth * result.seriesA.length;

  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-slate-600">תנועה תקופתית זו מול זו (12 תקופות אחרונות)</p>
      <div className="overflow-x-auto">
        <svg width={width + leftAxisWidth} height={height + 14} role="img" aria-label="השוואת תנועה בין שני הנכסים">
          <text x={leftAxisWidth - 6} y={8} textAnchor="end" fontSize={9} fill="#94a3b8">
            עלייה
          </text>
          <text x={leftAxisWidth - 6} y={mid + 3} textAnchor="end" fontSize={9} fill="#94a3b8">
            0%
          </text>
          <text x={leftAxisWidth - 6} y={height + 6} textAnchor="end" fontSize={9} fill="#94a3b8">
            ירידה
          </text>
          <line x1={leftAxisWidth} y1={mid} x2={width + leftAxisWidth} y2={mid} stroke="#dfe3e8" strokeWidth={1} />
          {result.seriesA.map((v, i) => {
            const x = leftAxisWidth + i * groupWidth;
            const barHeightA = (Math.abs(v) / maxAbs) * (mid - 4);
            const barHeightB = (Math.abs(result.seriesB[i]) / maxAbs) * (mid - 4);
            return (
              <g key={i}>
                <rect
                  x={x}
                  y={v >= 0 ? mid - barHeightA : mid}
                  width={barWidth}
                  height={Math.max(barHeightA, 1)}
                  fill="#3b82f6"
                  rx={1}
                />
                <rect
                  x={x + barWidth + 2}
                  y={result.seriesB[i] >= 0 ? mid - barHeightB : mid}
                  width={barWidth}
                  height={Math.max(barHeightB, 1)}
                  fill="#f59e0b"
                  rx={1}
                />
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mt-1 flex items-center gap-4 text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: "#3b82f6" }} /> {labelA}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: "#f59e0b" }} /> {labelB}
        </span>
        <span className="text-slate-400">תשואות תקופתיות סינתטיות להמחשה — לא נתון היסטורי אמיתי</span>
      </div>
    </div>
  );
}

// "בדיקת קורלציה" — search any two entities (stock, index, sector ETF,
// bond yield or commodity) and see the correlation between them, then a
// plain-language AI explanation of what it means, why it's plausible, how
// it affects a portfolio, and what can be concluded from it. The
// coefficient itself is a deterministic mock calculation (no live return
// history in this phase — see lib/mock-data/correlation.ts); only the
// explanation is a real Claude call.
export function CorrelationCheckerPanel({ onBack }: { onBack: () => void }) {
  const [queryA, setQueryA] = useState("");
  const [queryB, setQueryB] = useState("");
  const [entityA, setEntityA] = useState<EntityPick | null>(null);
  const [entityB, setEntityB] = useState<EntityPick | null>(null);
  const [periodId, setPeriodId] = useState(correlationPeriodOptions[2].id);
  const [result, setResult] = useState<CorrelationResult | null>(null);
  const [sameEntityError, setSameEntityError] = useState(false);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [explanationError, setExplanationError] = useState<string | null>(null);

  function pickEntity(suggestion: TickerSuggestion, which: "a" | "b") {
    const entity = getCorrelationEntity(suggestion.ticker);
    if (!entity) return;
    const pick: EntityPick = { id: entity.id, label: entity.labelHe };
    if (which === "a") {
      setEntityA(pick);
      setQueryA(entity.id);
    } else {
      setEntityB(pick);
      setQueryB(entity.id);
    }
  }

  async function fetchExplanation(a: EntityPick, b: EntityPick, corr: CorrelationResult) {
    setExplanationLoading(true);
    setExplanationError(null);
    try {
      const entityAMeta = getCorrelationEntity(a.id);
      const entityBMeta = getCorrelationEntity(b.id);
      const res = await apiFetch<{
        summary_he: string;
        reason_he: string;
        impact_he: string;
        conclusion_he: string;
      }>("/api/research/correlation-explanation", {
        method: "POST",
        body: JSON.stringify({
          entity_a_label: a.label,
          entity_a_type_he: entityAMeta?.typeHe ?? "",
          entity_b_label: b.label,
          entity_b_type_he: entityBMeta?.typeHe ?? "",
          correlation_value: corr.value,
          period_label_he: corr.periodLabelHe,
        }),
      });
      setExplanation({
        summaryHe: res.summary_he,
        reasonHe: res.reason_he,
        impactHe: res.impact_he,
        conclusionHe: res.conclusion_he,
      });
    } catch (err) {
      setExplanationError(err instanceof ApiError ? err.message : "טעינת ההסבר נכשלה");
    } finally {
      setExplanationLoading(false);
    }
  }

  function handleCheck() {
    if (!entityA || !entityB) return;
    if (entityA.id === entityB.id) {
      setSameEntityError(true);
      setResult(null);
      return;
    }
    setSameEntityError(false);
    const corr = computeCorrelation(entityA.id, entityB.id, periodId);
    setResult(corr);
    setExplanation(null);
    setExplanationError(null);
    if (corr) fetchExplanation(entityA, entityB, corr);
  }

  const canCheck = !!entityA && !!entityB;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
      >
        חזרה לתפריט הבוט
      </button>

      <p className="text-sm leading-relaxed text-slate-500">
        בדקו קורלציה בין כל שני נכסים — מניה מול מדד, סקטור מול סקטור,
        סקטור מול מדד, או מול סחורה/אג&quot;ח — ותקבלו מקדם קורלציה
        לתקופה שתבחרו, יחד עם סיכום שמסביר מה קורה, למה זה ככה, איך זה
        משפיע, ומה ניתן להסיק מכך.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <EntitySearchBox
          title="נכס ראשון"
          query={queryA}
          onQueryChange={setQueryA}
          picked={entityA}
          onPick={(s) => pickEntity(s, "a")}
        />
        <EntitySearchBox
          title="נכס שני"
          query={queryB}
          onQueryChange={setQueryB}
          picked={entityB}
          onPick={(s) => pickEntity(s, "b")}
        />
      </div>

      <div className="rounded-lg border border-surface-border bg-surface-raised p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">תקופה</p>
        <div className="flex flex-wrap gap-1.5">
          {correlationPeriodOptions.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriodId(p.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                periodId === p.id ? "bg-brand-500 text-white" : "bg-surface-card text-slate-500 hover:text-slate-800"
              }`}
            >
              {p.labelHe}
            </button>
          ))}
        </div>
      </div>

      {sameEntityError && (
        <p className="text-sm text-negative">בחרו שני נכסים שונים כדי לבדוק קורלציה ביניהם.</p>
      )}

      <button
        type="button"
        onClick={handleCheck}
        disabled={!canCheck}
        className="flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <GitCompare size={16} />
        בדוק קורלציה
      </button>

      {result && entityA && entityB && (
        <div className="space-y-4 rounded-lg border border-surface-border bg-surface-raised p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">
                קורלציה בין <span className="font-semibold text-slate-800">{entityA.label}</span> לבין{" "}
                <span className="font-semibold text-slate-800">{entityB.label}</span> ({result.periodLabelHe})
              </p>
              <p className="mt-1 text-3xl font-bold" dir="ltr" style={{ color: result.value >= 0 ? "#0a7a3d" : "#c8102e" }}>
                {result.value >= 0 ? "+" : ""}
                {result.value.toFixed(2)}
              </p>
              <p className="text-sm font-medium text-slate-600">{correlationStrengthLabelHe(result.value)}</p>
            </div>
          </div>

          <div className="pt-3">
            <CorrelationScale value={result.value} />
          </div>

          <PairedBarChart labelA={entityA.label} labelB={entityB.label} result={result} />

          <div className="border-t border-surface-border pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
              הערת סיכונים — Risk Research Note
            </p>
            {explanationLoading && (
              <p className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 size={14} className="animate-spin" /> טוען ניתוח...
              </p>
            )}
            {explanationError && !explanationLoading && (
              <div className="space-y-2">
                <p className="text-sm text-negative">{explanationError}</p>
                <button
                  type="button"
                  onClick={() => fetchExplanation(entityA, entityB, result)}
                  className="flex items-center gap-1 text-xs font-medium text-brand-500 hover:underline"
                >
                  <RefreshCw size={12} /> נסו שוב
                </button>
              </div>
            )}
            {explanation && !explanationLoading && (
              <div className="space-y-3 text-sm leading-relaxed text-slate-700">
                <div>
                  <p className="font-semibold text-slate-900">תמונת מצב</p>
                  <p>{explanation.summaryHe}</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-900">המנגנון</p>
                  <p>{explanation.reasonHe}</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-900">השפעה על ניהול סיכונים בתיק</p>
                  <p>{explanation.impactHe}</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-900">מסקנה תפעולית</p>
                  <p>{explanation.conclusionHe}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
