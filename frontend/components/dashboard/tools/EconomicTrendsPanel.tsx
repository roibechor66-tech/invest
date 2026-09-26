"use client";

import { useEffect, useState } from "react";
import { RefreshCw, TrendingUp, TrendingDown, Minus, AlertTriangle, ExternalLink, Compass } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";

interface TrendSource {
  title: string;
  url: string;
}

interface EconomicIndicator {
  name_he: string;
  value_he: string;
  trend: "positive" | "negative" | "neutral";
  commentary_he: string;
}

interface EconomicTrendsResult {
  generated_at_he: string;
  market_direction: "bullish" | "bearish" | "neutral";
  overview_he: string;
  consumer_sentiment_he: string;
  key_indicators: EconomicIndicator[];
  macro_drivers_he: string[];
  outlook_he: string;
  risks_he: string[];
  sources: TrendSource[];
  cached_at_iso: string | null;
}

function formatUpdatedAt(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("he-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

const DIRECTION_LABELS: Record<EconomicTrendsResult["market_direction"], string> = {
  bullish: "חיובי",
  bearish: "שלילי",
  neutral: "מעורב / ניטרלי",
};

const DIRECTION_COLORS: Record<EconomicTrendsResult["market_direction"], string> = {
  bullish: "bg-positive/15 text-positive",
  bearish: "bg-negative/15 text-negative",
  neutral: "bg-slate-500/15 text-slate-700",
};

function IndicatorIcon({ trend }: { trend: EconomicIndicator["trend"] }) {
  if (trend === "positive") return <TrendingUp size={14} className="text-positive" />;
  if (trend === "negative") return <TrendingDown size={14} className="text-negative" />;
  return <Minus size={14} className="text-slate-500" />;
}

// Bot feature: "מגמות כלכלה" — Claude actually searches the live web (via
// the web_search tool on the backend) for current US macro data, Fed
// commentary and consumer-sentiment coverage, then returns a structured
// read of where the economy/market appear to be heading. Same "real AI,
// not mock data" pattern as FinancialReportAnalysisPanel /
// TrendAnalysisPanel — but since the underlying macro data itself only
// changes on a handful of scheduled release dates a month (unemployment,
// CPI, GDP, Fed meetings), re-running the search on every visit would be
// wasteful: the backend caches the result for a week
// (app/services/research.py::get_economic_trends), so this panel loads
// automatically on open (serving that cache most of the time) and offers
// a manual "רענן עכשיו" to force a fresh live run when wanted.
export function EconomicTrendsPanel({ onBack }: { onBack: () => void }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EconomicTrendsResult | null>(null);

  async function load(force: boolean) {
    if (force) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch<EconomicTrendsResult>(
        `/api/research/economic-trends${force ? "?force=true" : ""}`,
        { method: "POST" }
      );
      setResult(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ניתוח מגמות הכלכלה נכשל");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        ניתוח של מה שמשפיע כרגע על הכלכלה והשווקים האמריקאיים ולאן הם צפויים
        להתקדם, מבוסס על חיפוש אינטרנט חי (נתוני מאקרו, הפדרל ריזרב, סנטימנט
        צרכנים). מתעדכן אוטומטית פעם בשבוע — ניתן גם לרענן ידנית בכל רגע.
      </p>

      {isLoading && !result && (
        <p className="text-sm text-slate-500">טוען ניתוח מגמות כלכלה...</p>
      )}

      {error && <p className="text-sm text-negative">{error}</p>}

      {result && (
        <div className="space-y-4 rounded-lg border border-surface-border bg-surface-raised p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-base font-bold text-slate-900">מגמות כלכלה — ארה&quot;ב</p>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${DIRECTION_COLORS[result.market_direction]}`}>
              {DIRECTION_LABELS[result.market_direction]}
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-slate-500">
              {result.generated_at_he}
              {result.cached_at_iso && ` · עודכן לאחרונה: ${formatUpdatedAt(result.cached_at_iso)}`}
            </span>
            <button
              type="button"
              onClick={() => load(true)}
              disabled={isRefreshing}
              className="flex items-center gap-1 text-xs font-medium text-brand-400 hover:text-brand-300 disabled:opacity-50"
            >
              <RefreshCw size={12} className={isRefreshing ? "animate-spin" : ""} />
              {isRefreshing ? "מרענן..." : "רענן עכשיו"}
            </button>
          </div>

          <p className="text-sm leading-relaxed text-slate-800">{result.overview_he}</p>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">מצב הצרכן האמריקאי</p>
            <p className="text-sm leading-relaxed text-slate-700">{result.consumer_sentiment_he}</p>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">אינדיקטורים כלכליים</p>
            <div className="space-y-2">
              {result.key_indicators.map((ind, i) => (
                <div key={i} className="rounded-lg border border-surface-border bg-surface-card p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <IndicatorIcon trend={ind.trend} />
                      <span className="text-sm font-semibold text-slate-900">{ind.name_he}</span>
                    </div>
                    <span className="text-sm font-bold text-slate-800">{ind.value_he}</span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">{ind.commentary_he}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">גורמים מרכזיים שמשפיעים על השוק</p>
            <ul className="space-y-1.5">
              {result.macro_drivers_he.map((item, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed text-slate-700">
                  <span className="text-slate-600">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-brand-400">
              <Compass size={12} /> לאן השוק והכלכלה צפויים להתקדם
            </p>
            <p className="text-sm leading-relaxed text-slate-700">{result.outlook_he}</p>
          </div>

          <div>
            <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-amber-400">
              <AlertTriangle size={12} /> סיכונים לתרחיש
            </p>
            <ul className="space-y-1.5">
              {result.risks_he.map((item, i) => (
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
            הניתוח מבוסס על חיפוש אינטרנט חי ונוצר אוטומטית על ידי מודל AI —
            מתעדכן כברירת מחדל פעם בשבוע (ניתן לרענן ידנית בכל רגע). הוא עשוי
            לכלול טעויות או מקורות חלקיים, אינו ייעוץ השקעות, ואינו תחליף
            לבדיקת נאותות עצמאית.
          </p>
        </div>
      )}
    </div>
  );
}
