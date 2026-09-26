"use client";

import { useRef, useState } from "react";
import { FileText, Plus, TrendingUp, TrendingDown, Minus, AlertTriangle, Rocket } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";

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

// Real financial-report analysis: the person uploads an actual 10-K/10-Q
// (or annual report) PDF and this calls the backend, which sends the PDF
// straight to Claude and gets back a structured, hedge-fund-style read
// of that specific document — growth trends, what stood out positively
// and negatively, why the stock likely moved, a segment/division
// breakdown, and risks/catalysts to watch. Unlike the rest of the app's
// Phase 1/2 mock data, this is a live analysis of whatever file is
// uploaded, not a canned example.
export function FinancialReportAnalysisPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReportAnalysisResult | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    setError(null);
    setResult(null);
    if (picked && picked.type !== "application/pdf" && !picked.name.toLowerCase().endsWith(".pdf")) {
      setError("יש להעלות קובץ PDF בלבד");
      setFile(null);
      return;
    }
    setFile(picked);
  }

  async function handleAnalyze() {
    if (!file) return;
    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const data = await apiFetch<ReportAnalysisResult>("/api/research/analyze-report", {
        method: "POST",
        body: formData,
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ניתוח הדוח נכשל");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-slate-500">
        העלו דוח רבעוני (10-Q) או שנתי (10-K) בפורמט PDF, ותקבלו ניתוח
        ברמת קרן גידור: מגמות צמיחה, מה בלט לחיוב ולשלילה, הסבר לתנועת
        המניה, פירוק לפי חטיבות, וסיכונים/קטליזטורים קדימה — הכול מבוסס
        אך ורק על תוכן הדוח שהעליתם.
      </p>

      <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" onChange={handleFileChange} className="hidden" />

      {file ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full items-center gap-3 rounded-xl border border-surface-border bg-surface-raised px-4 py-3 text-start transition hover:border-brand-500/50"
        >
          <FileText size={24} className="shrink-0 text-brand-400" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-slate-900">{file.name}</span>
            <span className="block text-xs text-slate-500">
              {(file.size / (1024 * 1024)).toFixed(1)} MB — לחצו כדי להחליף קובץ
            </span>
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-surface-border bg-surface-raised px-4 py-8 text-center transition hover:border-brand-500/50"
          aria-label="הוספת קובץ PDF של דוח כספי"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-500 text-white">
            <Plus size={22} />
          </span>
          <p className="text-sm font-semibold text-slate-700">הוספת קובץ דוח כספי (PDF)</p>
          <p className="text-xs text-slate-500">10-K, 10-Q, או כל דוח רבעוני/שנתי אחר בפורמט PDF (עד 32MB)</p>
        </button>
      )}

      <button
        type="button"
        onClick={handleAnalyze}
        disabled={!file || isLoading}
        className="w-full rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {isLoading ? "מנתח את הדוח... זה יכול לקחת כדקה" : "נתח דוח"}
      </button>

      {error && <p className="text-sm text-negative">{error}</p>}

      {result && (
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
            הניתוח מבוסס על תוכן הדוח שהעליתם בלבד ונוצר אוטומטית על ידי
            מודל AI — הוא עשוי לכלול טעויות, אינו ייעוץ השקעות, ואינו
            תחליף לבדיקת נאותות עצמאית.
          </p>
        </div>
      )}
    </div>
  );
}
