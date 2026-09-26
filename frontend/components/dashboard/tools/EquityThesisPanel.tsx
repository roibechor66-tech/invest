"use client";

import { useState } from "react";
import {
  Search,
  Lightbulb,
  Rocket,
  Layers,
  Users,
  Swords,
  Wallet,
  Calculator,
  Scale,
  UserCheck,
  AlertTriangle,
  ExternalLink,
  Loader2,
  Briefcase,
  ShieldCheck,
  PieChart,
  Globe2,
} from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { TickerSearchInput } from "@/components/dashboard/tools/TickerSearchInput";
import { getStockDetailSuggestions } from "@/lib/ticker-search";

interface TrendSource {
  title: string;
  url: string;
}

interface ThesisSegment {
  name_he: string;
  description_he: string;
  competitive_edge_he: string | null;
}

interface RevenueMixItem {
  label_he: string;
  pct_he: string;
  note_he: string | null;
}

interface ThesisFinancials {
  revenue_current_he: string;
  revenue_next_year_he: string | null;
  gross_margin_he: string | null;
  operating_margin_he: string | null;
  net_margin_he: string | null;
  balance_sheet_he: string;
  guidance_he: string | null;
  narrative_he: string;
}

interface ThesisValuationScenario {
  label: "bear" | "base" | "bull";
  multiple_used_he: string;
  assumptions_he: string;
  implied_outcome_he: string;
}

interface EquityThesisResult {
  ticker: string;
  company_name: string;
  sector_he: string;
  generated_at_he: string;
  business_overview_he: string;
  business_model_he: string;
  core_thesis_he: string;
  catalysts_he: string[];
  segments: ThesisSegment[];
  competitive_advantage_he: string;
  revenue_mix_by_segment: RevenueMixItem[];
  revenue_mix_by_geography: RevenueMixItem[];
  market_and_customers_he: string;
  competitive_landscape_he: string;
  financials: ThesisFinancials;
  back_of_envelope_valuation_he: string;
  valuation_scenarios: ThesisValuationScenario[];
  author_view_he: string;
  risks_to_thesis_he: string[];
  sources: TrendSource[];
}

const SCENARIO_LABELS: Record<ThesisValuationScenario["label"], string> = {
  bear: "תרחיש דובי",
  base: "תרחיש בסיס",
  bull: "תרחיש שורי",
};

const SCENARIO_COLORS: Record<ThesisValuationScenario["label"], string> = {
  bear: "border-negative/40 bg-negative/5",
  base: "border-surface-border bg-surface-card",
  bull: "border-positive/40 bg-positive/5",
};

const SCENARIO_LABEL_COLORS: Record<ThesisValuationScenario["label"], string> = {
  bear: "text-negative",
  base: "text-slate-700",
  bull: "text-positive",
};

function FinancialRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-2 border-b border-surface-border/60 py-1.5 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-slate-800">{value}</span>
    </div>
  );
}

// One row of a revenue-mix breakdown (by segment or by geography). The
// backend reports "-" for pct_he when the company doesn't disclose that
// split at all, in which case there's no bar to draw — just the label and
// note explaining why.
function RevenueMixRow({ item }: { item: RevenueMixItem }) {
  const numeric = parseFloat(item.pct_he.replace(/[^\d.]/g, ""));
  const hasBar = item.pct_he !== "-" && !Number.isNaN(numeric) && numeric > 0;
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-700">{item.label_he}</span>
        <span className="text-xs font-semibold text-slate-800">{item.pct_he}</span>
      </div>
      {hasBar && (
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-border/60">
          <div
            className="h-full rounded-full bg-brand-500"
            style={{ width: `${Math.min(numeric, 100)}%` }}
          />
        </div>
      )}
      {item.note_he && <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{item.note_he}</p>}
    </div>
  );
}

// "בניית תזה": the person searches any ticker and gets a full, deep,
// hedge-fund-style investment thesis — business model, the core
// investment argument, catalysts, a sector-appropriate segment
// breakdown, market/competitive context, financials, a back-of-envelope
// valuation calculation, bear/base/bull scenarios, the author's own view
// and the main risks. Real, web-search-backed Claude call — same
// declared "real AI, not mock" exception as the rest of the bot, just
// with a much larger research + output budget since a real thesis this
// deep takes real research. The backend adapts terminology/segments per
// sector rather than forcing every company through one template.
export function EquityThesisPanel() {
  const [ticker, setTicker] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EquityThesisResult | null>(null);

  // This flow calls a real (non-mock) backend that resolves any real
  // ticker via live web search, so these are only a convenience
  // shortcut for well-known names — not a "must match" list like the
  // other, mock-data-backed search boxes.
  const suggestions = getStockDetailSuggestions(ticker);

  async function buildThesis(rawTicker: string = ticker) {
    const clean = rawTicker.trim().toUpperCase();
    if (!clean) return;
    setTicker(clean);
    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await apiFetch<EquityThesisResult>(`/api/research/thesis/${encodeURIComponent(clean)}`, {
        method: "POST",
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "בניית התזה נכשלה");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-slate-500">
        הקלידו טיקר של כל מניה, וקבלו תזת השקעה מעמיקה ברמת קרן גידור:
        רקע עסקי, לב התזה, קטליזטורים, פירוק לפי חטיבות/מוצרים (מותאם
        לסקטור), שוק ותחרות, פיננסים, חישוב שווי מפורט, שלושה תרחישי
        הערכת שווי, וסיכונים לתזה. מבוסס על חיפוש אינטרנט חי — לא נתוני
        mock, וזה יכול לקחת כמה דקות בגלל עומק המחקר.
      </p>

      <div className="flex gap-2">
        <TickerSearchInput
          value={ticker}
          onChange={setTicker}
          suggestions={suggestions}
          onSelectSuggestion={(suggestion) => buildThesis(suggestion.ticker)}
          onSubmit={(v) => buildThesis(v)}
          placeholder="הקלידו טיקר, למשל VICR"
          dir="ltr"
          inputClassName="flex-grow rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-sm text-slate-800 placeholder:text-slate-600 focus:border-brand-500/60 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => buildThesis()}
          disabled={!ticker.trim() || isLoading}
          className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-50"
        >
          {isLoading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
          {isLoading ? "בונה תזה..." : "בנה תזה"}
        </button>
      </div>

      {isLoading && (
        <p className="text-xs text-slate-500">
          המחקר כולל עשרות חיפושים (מודל עסקי, פיננסים, מתחרים, קטליזטורים) —
          ייתכן שזה ייקח כמה דקות.
        </p>
      )}

      {error && <p className="text-sm text-negative">{error}</p>}

      {result && (
        <div className="space-y-5 rounded-lg border border-surface-border bg-surface-raised p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-lg font-bold text-slate-900">
                {result.company_name} <span className="text-slate-500">({result.ticker})</span>
              </p>
              <p className="text-xs text-slate-500">{result.sector_he} · {result.generated_at_he}</p>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">רקע עסקי</p>
            <p className="text-sm leading-relaxed text-slate-700">{result.business_overview_he}</p>
          </div>

          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Briefcase size={13} /> מודל עסקי
            </p>
            <p className="text-sm leading-relaxed text-slate-700">{result.business_model_he}</p>
          </div>

          <div className="rounded-lg border border-brand-500/30 bg-brand-500/5 p-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-400">
              <Lightbulb size={13} /> לב התזה
            </p>
            <p className="text-sm leading-relaxed text-slate-800">{result.core_thesis_he}</p>
          </div>

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-400">
              <Rocket size={13} /> קטליזטורים
            </p>
            <ul className="space-y-1.5">
              {result.catalysts_he.map((item, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed text-slate-700">
                  <span className="text-slate-600">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {result.segments.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Layers size={13} /> פירוק לפי חטיבות/מוצרים
              </p>
              <div className="space-y-2">
                {result.segments.map((seg, i) => (
                  <div key={i} className="rounded-lg border border-surface-border bg-surface-card p-2.5">
                    <span className="text-sm font-semibold text-slate-900">{seg.name_he}</span>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">{seg.description_he}</p>
                    {seg.competitive_edge_he && (
                      <p className="mt-1 text-xs leading-relaxed text-brand-300">
                        יתרון תחרותי: {seg.competitive_edge_he}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-surface-border bg-surface-card p-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <ShieldCheck size={13} /> יתרון תחרותי (חפיר)
            </p>
            <p className="text-sm leading-relaxed text-slate-700">{result.competitive_advantage_he}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {result.revenue_mix_by_segment?.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <PieChart size={13} /> תמהיל הכנסות לפי מוצר/חטיבה
                </p>
                <div className="rounded-lg border border-surface-border bg-surface-card p-3">
                  {result.revenue_mix_by_segment.map((item, i) => (
                    <RevenueMixRow key={i} item={item} />
                  ))}
                </div>
              </div>
            )}

            {result.revenue_mix_by_geography?.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <Globe2 size={13} /> תמהיל הכנסות לפי אזור גיאוגרפי
                </p>
                <div className="rounded-lg border border-surface-border bg-surface-card p-3">
                  {result.revenue_mix_by_geography.map((item, i) => (
                    <RevenueMixRow key={i} item={item} />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Users size={13} /> שוק ולקוחות
            </p>
            <p className="text-sm leading-relaxed text-slate-700">{result.market_and_customers_he}</p>
          </div>

          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Swords size={13} /> נוף תחרותי
            </p>
            <p className="text-sm leading-relaxed text-slate-700">{result.competitive_landscape_he}</p>
          </div>

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Wallet size={13} /> פיננסים
            </p>
            <div className="rounded-lg border border-surface-border bg-surface-card p-3">
              <FinancialRow label="הכנסות נוכחיות" value={result.financials.revenue_current_he} />
              <FinancialRow label="תחזית הכנסות לשנה הבאה" value={result.financials.revenue_next_year_he} />
              <FinancialRow label="שולי רווח גולמי" value={result.financials.gross_margin_he} />
              <FinancialRow label="שולי רווח תפעולי" value={result.financials.operating_margin_he} />
              <FinancialRow label="שולי רווח נקי" value={result.financials.net_margin_he} />
              <FinancialRow label="מאזן" value={result.financials.balance_sheet_he} />
              <FinancialRow label="תחזית ארוכת טווח" value={result.financials.guidance_he} />
              <p className="mt-2 text-xs leading-relaxed text-slate-500">{result.financials.narrative_he}</p>
            </div>
          </div>

          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Calculator size={13} /> חישוב שווי (מחשבון סנדלרים)
            </p>
            <p className="whitespace-pre-line rounded-lg border border-surface-border bg-surface-card p-3 text-sm leading-relaxed text-slate-700">
              {result.back_of_envelope_valuation_he}
            </p>
          </div>

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Scale size={13} /> תרחישי הערכת שווי
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {result.valuation_scenarios.map((sc, i) => (
                <div key={i} className={`rounded-lg border p-3 ${SCENARIO_COLORS[sc.label]}`}>
                  <p className={`text-xs font-bold ${SCENARIO_LABEL_COLORS[sc.label]}`}>
                    {SCENARIO_LABELS[sc.label]}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-700">{sc.multiple_used_he}</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{sc.assumptions_he}</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-700">{sc.implied_outcome_he}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-surface-border bg-surface-card p-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-400">
              <UserCheck size={13} /> הדעה שלי
            </p>
            <p className="text-sm leading-relaxed text-slate-800">{result.author_view_he}</p>
          </div>

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-400">
              <AlertTriangle size={13} /> סיכונים לתזה
            </p>
            <ul className="space-y-1.5">
              {result.risks_to_thesis_he.map((item, i) => (
                <li key={i} className="text-sm leading-relaxed text-slate-700">{item}</li>
              ))}
            </ul>
          </div>

          {result.sources.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">מקורות</p>
              <ul className="space-y-1">
                {result.sources.map((s, i) => (
                  <li key={i}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-brand-400"
                    >
                      <ExternalLink size={11} className="shrink-0" />
                      <span className="truncate">{s.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[11px] leading-relaxed text-slate-500">
            התזה נוצרה אוטומטית על ידי מודל AI על בסיס חיפוש אינטרנט חי —
            היא עשויה לכלול טעויות או מקורות חלקיים, אינה ייעוץ השקעות,
            ואינה תחליף לבדיקת נאותות עצמאית.
          </p>
        </div>
      )}
    </div>
  );
}
