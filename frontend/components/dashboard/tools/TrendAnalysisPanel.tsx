"use client";

import { useState } from "react";
import { Search, Cpu, FileText, AlertTriangle, Zap, ExternalLink } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";

interface TrendSource {
  title: string;
  url: string;
}

interface TrendItem {
  title_he: string;
  category: "bottleneck" | "technology" | "whitepaper" | "market_disruption";
  summary_he: string;
  details_he: string;
  relevant_companies: string[];
  relevant_sectors_he: string[];
  source?: TrendSource;
}

interface TrendAnalysisResult {
  generated_at_he: string;
  overview_he: string;
  trends: TrendItem[];
  watch_companies: string[];
  watch_sectors_he: string[];
  sources: TrendSource[];
}

const CATEGORY_LABELS: Record<TrendItem["category"], string> = {
  bottleneck: "צוואר בקבוק",
  technology: "טכנולוגיה חדשה",
  whitepaper: "White Paper",
  market_disruption: "שיבוש שוק",
};

const CATEGORY_COLORS: Record<TrendItem["category"], string> = {
  bottleneck: "bg-amber-500/15 text-amber-400",
  technology: "bg-brand-500/15 text-brand-400",
  whitepaper: "bg-slate-500/15 text-slate-700",
  market_disruption: "bg-negative/15 text-negative",
};

function CategoryIcon({ category }: { category: TrendItem["category"] }) {
  if (category === "bottleneck") return <AlertTriangle size={12} />;
  if (category === "technology") return <Cpu size={12} />;
  if (category === "whitepaper") return <FileText size={12} />;
  return <Zap size={12} />;
}

// Bot feature: "ניתוח מגמות" — a "run it now" action (no form/upload) that
// has Claude actually search the live web (via the web_search tool on the
// backend) for company white papers, technology/bottleneck analyses and
// market-disruption coverage, then return a structured read of what it
// found. Same "real AI, not mock data" pattern as
// FinancialReportAnalysisPanel — grounded in live search results, not a
// canned example.
export function TrendAnalysisPanel({ onBack }: { onBack: () => void }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TrendAnalysisResult | null>(null);

  async function handleRun() {
    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await apiFetch<TrendAnalysisResult>("/api/research/trend-analysis", {
        method: "POST",
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ניתוח המגמות נכשל");
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
        חזרה לתפריט הבוט
      </button>

      <p className="text-sm leading-relaxed text-slate-500">
        הבוט יחפש עכשיו באינטרנט white papers שמפרסמות חברות טכנולוגיה/AI/תשתיות
        גדולות, ניתוחים של צווארי בקבוק טכנולוגיים או בשרשרת האספקה, טכנולוגיות
        חדשות משמעותיות וכתבות על שיבוש שוק (market disruption) — ויחזיר את
        החברות והסקטורים הרלוונטיים שעלו מהחיפוש בפועל.
      </p>

      <button
        type="button"
        onClick={handleRun}
        disabled={isLoading}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        <Search size={16} />
        {isLoading ? "מחפש באינטרנט ומנתח... זה יכול לקחת כדקה" : "הרץ ניתוח מגמות"}
      </button>

      {error && <p className="text-sm text-negative">{error}</p>}

      {result && (
        <div className="space-y-4 rounded-lg border border-surface-border bg-surface-raised p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-base font-bold text-slate-900">ניתוח מגמות</p>
            <span className="text-xs text-slate-500">{result.generated_at_he}</span>
          </div>

          <p className="text-sm leading-relaxed text-slate-800">{result.overview_he}</p>

          <div className="space-y-2">
            {result.trends.map((trend, i) => (
              <div key={i} className="rounded-lg border border-surface-border bg-surface-card p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900">{trend.title_he}</span>
                  <span
                    className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${CATEGORY_COLORS[trend.category]}`}
                  >
                    <CategoryIcon category={trend.category} />
                    {CATEGORY_LABELS[trend.category]}
                  </span>
                </div>

                <p className="mt-1.5 text-xs font-medium leading-relaxed text-slate-700">{trend.summary_he}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{trend.details_he}</p>

                {(trend.relevant_companies.length > 0 || trend.relevant_sectors_he.length > 0) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {trend.relevant_companies.map((c, j) => (
                      <span key={`c-${j}`} className="rounded-full bg-brand-500/10 px-2 py-0.5 text-[11px] font-medium text-brand-400">
                        {c}
                      </span>
                    ))}
                    {trend.relevant_sectors_he.map((s, j) => (
                      <span key={`s-${j}`} className="rounded-full bg-surface-border px-2 py-0.5 text-[11px] font-medium text-slate-500">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
                {trend.source && (
                  <a
                    href={trend.source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-brand-400"
                  >
                    <ExternalLink size={11} />
                    <span className="truncate">{trend.source.title}</span>
                  </a>
                )}
              </div>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-400">חברות לעקוב אחריהן</p>
              <div className="flex flex-wrap gap-1.5">
                {result.watch_companies.map((c, i) => (
                  <span key={i} className="rounded-full bg-brand-500/10 px-2 py-0.5 text-xs font-medium text-brand-400">
                    {c}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">סקטורים לעקוב אחריהם</p>
              <div className="flex flex-wrap gap-1.5">
                {result.watch_sectors_he.map((s, i) => (
                  <span key={i} className="rounded-full bg-surface-border px-2 py-0.5 text-xs font-medium text-slate-500">
                    {s}
                  </span>
                ))}
              </div>
            </div>
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
            הניתוח מבוסס על חיפוש אינטרנט חי בזמן ההרצה ונוצר אוטומטית על ידי
            מודל AI — הוא עשוי לכלול טעויות או מקורות חלקיים, אינו ייעוץ
            השקעות, ואינו תחליף לבדיקת נאותות עצמאית.
          </p>
        </div>
      )}
    </div>
  );
}
