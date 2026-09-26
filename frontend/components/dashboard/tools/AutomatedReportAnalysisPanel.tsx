"use client";

import { useState } from "react";
import {
  FileText,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Rocket,
  ChevronLeft,
} from "lucide-react";
import { usePortfolio } from "@/lib/portfolio-context";
import { apiFetch, ApiError } from "@/lib/api";

interface LatestFilingInfo {
  ticker: string;
  company_name: string;
  form_type: "10-K" | "10-Q";
  filed_date: string;
  period_of_report: string;
  primary_doc_url: string;
}

interface ReportSegmentAnalysis {
  segment_name_he: string;
  summary_he: string;
  trend: "positive" | "negative" | "neutral";
}

interface ReportAnalysisResult {
  company_name: string;
  report_period_he: string;
  stance: "bullish" | "bearish" | "neutral";
  executive_summary_he: string;
  growth_trends_he: string[];
  positives_he: string[];
  negatives_he: string[];
  stock_move_explanation_he: string;
  segment_breakdown: ReportSegmentAnalysis[];
  risks_to_watch_he: string[];
  catalysts_to_watch_he: string[];
}

const STANCE_LABELS: Record<ReportAnalysisResult["stance"], string> = {
  bullish: "חיובי",
  bearish: "שלילי",
  neutral: "מעורב / ניטרלי",
};

const STANCE_COLORS: Record<ReportAnalysisResult["stance"], string> = {
  bullish: "bg-positive/15 text-positive",
  bearish: "bg-negative/15 text-negative",
  neutral: "bg-slate-500/15 text-slate-700",
};

function TrendIcon({ trend }: { trend: ReportSegmentAnalysis["trend"] }) {
  if (trend === "positive") return <TrendingUp size={14} className="text-positive" />;
  if (trend === "negative") return <TrendingDown size={14} className="text-negative" />;
  return <Minus size={14} className="text-slate-500" />;
}

type Step = "list" | "filing" | "result";

// Bot feature: "ניתוח דוחות אוטומטי" — pick a ticker straight from the
// user's own portfolio (no upload needed) and the backend looks up that
// company's actual latest 10-K/10-Q on SEC EDGAR (a real public filing,
// not mock data), then, on request, runs it through the same kind of
// real Claude analysis as FinancialReportAnalysisPanel's manual-upload
// flow — just sourced from a filing the backend fetched itself. Only
// works for US-listed, SEC-registered tickers; other holdings (e.g.
// Israeli .TA tickers) surface a clear "not found" message instead of a
// silent fallback.
export function AutomatedReportAnalysisPanel({ onBack }: { onBack: () => void }) {
  const { positions } = usePortfolio();
  const [step, setStep] = useState<Step>("list");
  const [ticker, setTicker] = useState<string | null>(null);
  const [filing, setFiling] = useState<LatestFilingInfo | null>(null);
  const [isLoadingFiling, setIsLoadingFiling] = useState(false);
  const [filingError, setFilingError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [result, setResult] = useState<ReportAnalysisResult | null>(null);

  async function pickTicker(t: string) {
    setTicker(t);
    setStep("filing");
    setFiling(null);
    setFilingError(null);
    setResult(null);
    setAnalysisError(null);
    setIsLoadingFiling(true);
    try {
      const data = await apiFetch<LatestFilingInfo>(`/api/research/latest-filing/${encodeURIComponent(t)}`);
      setFiling(data);
    } catch (err) {
      setFilingError(err instanceof ApiError ? err.message : "לא נמצא דוח עבור טיקר זה");
    } finally {
      setIsLoadingFiling(false);
    }
  }

  async function analyze() {
    if (!ticker) return;
    setIsAnalyzing(true);
    setAnalysisError(null);
    setResult(null);
    try {
      const data = await apiFetch<ReportAnalysisResult>(
        `/api/research/analyze-latest-filing/${encodeURIComponent(ticker)}`,
        { method: "POST" }
      );
      setResult(data);
      setStep("result");
    } catch (err) {
      setAnalysisError(err instanceof ApiError ? err.message : "ניתוח הדוח נכשל");
    } finally {
      setIsAnalyzing(false);
    }
  }

  if (step === "list") {
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
          בחרו מניה מהתיק שלכם — הבוט יאתר בפועל את הדוח (10-K/10-Q) האחרון
          שהחברה הגישה לרשות ניירות ערך האמריקאית (SEC), ותוכלו לנתח אותו
          בלחיצת כפתור. עובד רק עבור מניות הנסחרות בארה&quot;ב ורשומות ב-SEC.
        </p>

        {positions.length === 0 ? (
          <p className="text-sm text-slate-500">אין כרגע ניירות ערך בתיק שלכם.</p>
        ) : (
          <div className="space-y-1.5">
            {positions.map((p) => (
              <button
                key={p.ticker}
                type="button"
                onClick={() => pickTicker(p.ticker)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-surface-border bg-surface-raised px-3 py-2.5 text-right transition hover:border-brand-500/50"
              >
                <span className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/15 text-xs font-bold text-brand-400">
                    {p.ticker.slice(0, 2)}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">{p.ticker}</span>
                    <span className="block text-xs text-slate-500">{p.nameHe}</span>
                  </span>
                </span>
                <ChevronLeft size={16} className="shrink-0 text-slate-500" />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (step === "filing") {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setStep("list")}
          className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
        >
          חזרה לרשימת המניות
        </button>

        {isLoadingFiling && <p className="text-sm text-slate-500">מאתר את הדוח האחרון ב-SEC EDGAR עבור {ticker}...</p>}

        {filingError && <p className="text-sm text-negative">{filingError}</p>}

        {filing && (
          <div className="space-y-3 rounded-lg border border-surface-border bg-surface-raised p-4">
            <div className="flex items-center gap-3">
              <FileText size={24} className="shrink-0 text-brand-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{filing.company_name}</p>
                <p className="text-xs text-slate-500">
                  {filing.form_type} · לתקופה שהסתיימה {filing.period_of_report} · הוגש ב-{filing.filed_date}
                </p>
              </div>
            </div>
            <a
              href={filing.primary_doc_url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-slate-500 hover:text-brand-400"
            >
              צפייה במקור הדוח באתר ה-SEC
            </a>

            {analysisError && <p className="text-sm text-negative">{analysisError}</p>}

            <button
              type="button"
              onClick={analyze}
              disabled={isAnalyzing}
              className="w-full rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {isAnalyzing ? "מנתח את הדוח... זה יכול לקחת כדקה" : "נתח דוח"}
            </button>
          </div>
        )}
      </div>
    );
  }

  // step === "result"
  if (!result) return null;
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setStep("filing")}
        className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
      >
        חזרה לדוח
      </button>

      <div className="space-y-4 rounded-lg border border-surface-border bg-surface-raised p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-base font-bold text-slate-900">{result.company_name}</p>
            <p className="text-xs text-slate-500">{result.report_period_he}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${STANCE_COLORS[result.stance]}`}>
            {STANCE_LABELS[result.stance]}
          </span>
        </div>

        <p className="text-sm leading-relaxed text-slate-800">{result.executive_summary_he}</p>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">מגמות צמיחה</p>
          <ul className="space-y-1.5">
            {result.growth_trends_he.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed text-slate-700">
                <span className="text-slate-600">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-positive">מה בלט לחיוב</p>
            <ul className="space-y-1.5">
              {result.positives_he.map((item, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed text-slate-700">
                  <span className="text-positive">+</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-negative">מה בלט לשלילה</p>
            <ul className="space-y-1.5">
              {result.negatives_he.map((item, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed text-slate-700">
                  <span className="text-negative">−</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">למה המניה צפויה לנוע</p>
          <p className="text-sm leading-relaxed text-slate-700">{result.stock_move_explanation_he}</p>
        </div>

        {result.segment_breakdown.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">פירוק לפי חטיבות</p>
            <div className="space-y-2">
              {result.segment_breakdown.map((seg, i) => (
                <div key={i} className="rounded-lg border border-surface-border bg-surface-card p-2.5">
                  <div className="flex items-center gap-1.5">
                    <TrendIcon trend={seg.trend} />
                    <span className="text-sm font-semibold text-slate-900">{seg.segment_name_he}</span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">{seg.summary_he}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-amber-400">
              <AlertTriangle size={12} /> סיכונים לעקוב אחריהם
            </p>
            <ul className="space-y-1.5">
              {result.risks_to_watch_he.map((item, i) => (
                <li key={i} className="text-sm leading-relaxed text-slate-700">{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-brand-400">
              <Rocket size={12} /> קטליזטורים קדימה
            </p>
            <ul className="space-y-1.5">
              {result.catalysts_to_watch_he.map((item, i) => (
                <li key={i} className="text-sm leading-relaxed text-slate-700">{item}</li>
              ))}
            </ul>
          </div>
        </div>

        <p className="text-[11px] leading-relaxed text-slate-500">
          הניתוח מבוסס על הדוח האחרון שהחברה הגישה בפועל ל-SEC ונוצר אוטומטית
          על ידי מודל AI — הוא עשוי לכלול טעויות, אינו ייעוץ השקעות, ואינו
          תחליף לבדיקת נאותות עצמאית.
        </p>
      </div>
    </div>
  );
}
