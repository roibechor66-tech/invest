"use client";

import { ChangeEvent, RefObject, useRef, useState } from "react";
import { X, ExternalLink, MoreHorizontal, Upload } from "lucide-react";
import clsx from "clsx";
import { MultipleKey, STAGE_DESCRIPTIONS, StockDetail, WeinsteinStage } from "@/lib/types";
import { MetricTrendChart } from "@/components/dashboard/tools/MetricTrendChart";
import { FinancialsBarChart } from "@/components/dashboard/tools/FinancialsBarChart";
import { IncomeStatementFlow } from "@/components/dashboard/tools/IncomeStatementFlow";
import { buildCompanyFinancialStatements } from "@/lib/mock-data/financial-statements";
import { useLiveQuote } from "@/lib/hooks/useLiveQuote";
import { formatNewsAgeHe, useCompanyNews } from "@/lib/hooks/useCompanyNews";
import { useLiveCompanyFundamentals } from "@/lib/hooks/useLiveCompanyFundamentals";
import { apiFetch, ApiError } from "@/lib/api";

interface StockDetailModalProps {
  detail: StockDetail;
  onClose: () => void;
}

function formatMarketCap(value: number): string {
  if (value >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
  return `$${(value / 1_000_000_000).toFixed(1)}B`;
}

function formatPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

const STAGE_COLORS: Record<WeinsteinStage, string> = {
  1: "text-slate-700 bg-slate-500/15",
  2: "text-positive bg-positive/15",
  3: "text-amber-300 bg-amber-500/15",
  4: "text-negative bg-negative/15",
};

const STANCE_LABELS = {
  bullish: { labelHe: "חיובי", color: "text-positive" },
  bearish: { labelHe: "שלילי", color: "text-negative" },
  neutral: { labelHe: "ניטרלי", color: "text-slate-500" },
};

const METRIC_LABELS: Record<MultipleKey, string> = {
  peRatio: "P/E",
  forwardPeRatio: "P/E עתידי",
  evEbitda: "EV/EBITDA",
  priceToSales: "P/S",
  roiPct: "ROI",
  roePct: "ROE",
  roaPct: "ROA",
};

const METRIC_SUFFIX: Record<MultipleKey, string> = {
  peRatio: "",
  forwardPeRatio: "",
  evEbitda: "",
  priceToSales: "",
  roiPct: "%",
  roePct: "%",
  roaPct: "%",
};

// One metric tile: the stock's own value plus the sector average right
// below it. Clickable — toggles the quarterly trend chart for that metric
// so the change after each earnings report is visible.
function MetricTile({
  metricKey,
  value,
  isLive,
  industryAverage,
  isActive,
  onToggle,
}: {
  metricKey: MultipleKey;
  value: number;
  isLive: boolean;
  industryAverage: number;
  isActive: boolean;
  onToggle: (key: MultipleKey) => void;
}) {
  const suffix = METRIC_SUFFIX[metricKey];
  return (
    <button
      type="button"
      onClick={() => onToggle(metricKey)}
      className={clsx(
        "w-full rounded-lg border p-3 text-center transition",
        isActive
          ? "border-brand-500 bg-brand-500/10"
          : "border-surface-border bg-surface-raised hover:border-brand-500/40"
      )}
    >
      <p className="text-xs text-slate-500">
        {METRIC_LABELS[metricKey]}
        {!isLive && <span className="ms-1 text-amber-400">(דמו)</span>}
      </p>
      <p className="mt-1 text-lg font-bold text-slate-900">
        {value.toFixed(1)}
        {suffix}
      </p>
      <p className="mt-0.5 text-[11px] text-slate-500">
        ממוצע ענף (הערכה): {industryAverage.toFixed(1)}
        {suffix}
      </p>
    </button>
  );
}

// "האם יש אפשרות לעלות דוח PDF של החברה ומשם אתה מזין את כל הנתונים
// הרלוונטיים" — a small upload control that lets the user pick a PDF
// (10-K/10-Q/annual report), sends it to POST /api/fundamentals/{ticker}/
// upload-report (real Claude extraction, see backend/app/services/
// research.py::extract_financials_from_pdf), and shows loading/error/
// success feedback. `compact` renders it as a small icon-button (used
// once financial data is already showing) instead of the full-width
// button (used when there's nothing to show yet).
function ReportUploadControl({
  isUploading,
  error,
  success,
  onFileSelected,
  inputRef,
  compact,
}: {
  isUploading: boolean;
  error: string | null;
  success: boolean;
  onFileSelected: (event: ChangeEvent<HTMLInputElement>) => void;
  inputRef: RefObject<HTMLInputElement>;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "text-left" : ""}>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={onFileSelected}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={isUploading}
        className={clsx(
          "flex items-center gap-1.5 rounded-lg text-xs font-semibold transition disabled:opacity-50",
          compact
            ? "border border-surface-border bg-surface-raised px-2.5 py-1.5 text-slate-600 hover:border-brand-500/40"
            : "w-full justify-center border border-dashed border-surface-border bg-surface-raised px-3 py-2 text-slate-600 hover:border-brand-500/40"
        )}
      >
        <Upload size={13} />
        {isUploading ? "מעלה ומחלץ נתונים..." : "העלו דוח PDF של החברה"}
      </button>
      {error && <p className="mt-1 text-[11px] text-negative">{error}</p>}
      {success && !isUploading && (
        <p className="mt-1 text-[11px] text-positive">הנתונים חולצו ונשמרו בהצלחה</p>
      )}
    </div>
  );
}

// Click-through detail view for a stock (whether it's a holding or found
// via search): multiples + ROI/ROE/ROA (each clickable for a quarterly
// trend chart), Weinstein stage, market cap, analyst growth outlook with
// a forward P/E table, analyst theses and recent news.
//
// Phase 3, third track: multiples/market-cap/growth-outlook/financial
// statements are now LIVE (Yahoo Finance/yfinance — see
// useLiveCompanyFundamentals), with an honest "(דמו)" fallback to this
// ticker's mock figures whenever Yahoo has nothing for it (analyst
// estimates in particular are best-effort and often simply unavailable)
// — never silently presenting the mock number as live.
// Per-quarter multiple HISTORY (the trend chart) and the industry-average
// comparison baseline stay mock/illustrative — see useLiveCompanyFundamentals.ts's
// module docstring for why those two specifically are out of scope. The
// Weinstein stage, analyst theses and news feed are unrelated features
// and also stay as before.
const NEWS_PREVIEW_COUNT = 2;

function liveOrMock<T>(live: T | null | undefined, mock: T): { value: T; isLive: boolean } {
  return live !== null && live !== undefined ? { value: live, isLive: true } : { value: mock, isLive: false };
}

export function StockDetailModal({ detail, onClose }: StockDetailModalProps) {
  const [activeMetric, setActiveMetric] = useState<MultipleKey | null>(null);
  const [newsExpanded, setNewsExpanded] = useState(false);
  const [isUploadingReport, setIsUploadingReport] = useState(false);
  const [uploadReportError, setUploadReportError] = useState<string | null>(null);
  const [uploadReportSuccess, setUploadReportSuccess] = useState(false);
  const reportFileInputRef = useRef<HTMLInputElement>(null);

  function toggleMetric(key: MultipleKey) {
    setActiveMetric((current) => (current === key ? null : key));
  }

  // Real company news (Finnhub) with working article links — not the
  // fixed mock items in detail.news, whose links went to example.com.
  const companyNews = useCompanyNews(detail.ticker);
  const visibleNews = newsExpanded ? companyNews.news : companyNews.news.slice(0, NEWS_PREVIEW_COUNT);
  const hasMoreNews = companyNews.news.length > NEWS_PREVIEW_COUNT;

  const valuationKeys: MultipleKey[] = ["peRatio", "forwardPeRatio", "evEbitda", "priceToSales"];
  const profitabilityKeys: MultipleKey[] = ["roiPct", "roePct", "roaPct"];
  const { quote, isLoading: isQuoteLoading } = useLiveQuote(detail.ticker);
  const live = useLiveCompanyFundamentals(detail.ticker);
  const financialStatements = buildCompanyFinancialStatements(
    live.quarterlyStatements,
    live.annualStatements,
    live.financials?.segments
  );

  const nextEstimate = live.estimates[0];
  const liveForwardPe =
    nextEstimate?.estimatedEps && live.multiples ? live.multiples.priceUsd / nextEstimate.estimatedEps : null;

  const metricTiles: Record<MultipleKey, { value: number; isLive: boolean }> = {
    peRatio: liveOrMock(live.multiples?.peRatio, detail.peRatio),
    forwardPeRatio: liveOrMock(liveForwardPe, detail.forwardPeRatio),
    evEbitda: liveOrMock(live.multiples?.evEbitda, detail.evEbitda),
    priceToSales: liveOrMock(live.multiples?.priceToSales, detail.priceToSales),
    roiPct: liveOrMock(live.multiples?.roicPct, detail.roiPct),
    roePct: liveOrMock(live.multiples?.roePct, detail.roePct),
    roaPct: liveOrMock(live.multiples?.roaPct, detail.roaPct),
  };
  const marketCap = liveOrMock(live.multiples?.marketCapUsd, detail.marketCapUsd);

  // "האם יש אפשרות לעלות דוח PDF של החברה" — lets the user upload a
  // 10-K/10-Q/annual report and have Claude extract the same line items
  // yfinance would (see POST /api/fundamentals/{ticker}/upload-report),
  // persisted permanently so it shows up here (and everywhere else that
  // reads financial-statement data) automatically from then on, even for
  // a ticker Yahoo Finance doesn't cover.
  async function handleReportFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    setUploadReportError(null);
    setUploadReportSuccess(false);
    setIsUploadingReport(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await apiFetch(`/api/fundamentals/${encodeURIComponent(detail.ticker)}/upload-report`, {
        method: "POST",
        body: formData,
      });
      setUploadReportSuccess(true);
      live.refetch();
    } catch (err) {
      setUploadReportError(err instanceof ApiError ? err.message : "העלאת הדוח נכשלה");
    } finally {
      setIsUploadingReport(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[85vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-surface-border bg-surface-card p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              {detail.ticker} <span className="text-slate-500">· {detail.nameHe}</span>
            </h3>
            <p className="text-sm text-slate-500">
              שווי שוק: {formatMarketCap(marketCap.value)}
              {!marketCap.isLive && <span className="text-amber-400"> (דמו)</span>} · ענף: {detail.sectorNameHe}
            </p>
            <p className="mt-1 text-sm">
              {isQuoteLoading && <span className="text-slate-400">טוען מחיר חי...</span>}
              {!isQuoteLoading && quote && (
                <>
                  <span className="font-bold text-slate-900" dir="ltr">
                    ${quote.price.toFixed(2)}
                  </span>{" "}
                  <span
                    className={clsx(
                      "font-semibold",
                      quote.dayChangePct >= 0 ? "text-positive" : "text-negative"
                    )}
                  >
                    {formatPct(quote.dayChangePct)}
                  </span>{" "}
                  <span className="text-xs text-slate-500">היום</span>
                </>
              )}
              {!isQuoteLoading && !quote && (
                <span className="text-xs text-amber-400">אין ציטוט חי לנייר זה כרגע</span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-500 hover:bg-surface-raised hover:text-slate-700"
            aria-label="סגור"
          >
            <X size={18} />
          </button>
        </div>

        {/* Valuation multiples vs. industry average */}
        <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          מכפילי שווי <span className="normal-case text-slate-600">(לחצו למגמה רבעונית)</span>
          {live.multiples?.source === "uploaded" && (
            <span className="ms-1.5 normal-case text-amber-500">
              (מחושב מהדוח שהועלה + מחיר שוק)
            </span>
          )}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {valuationKeys.map((key) => (
            <MetricTile
              key={key}
              metricKey={key}
              value={metricTiles[key].value}
              isLive={metricTiles[key].isLive}
              industryAverage={detail.industryAverages[key]}
              isActive={activeMetric === key}
              onToggle={toggleMetric}
            />
          ))}
        </div>

        {/* Profitability ratios vs. industry average */}
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
          מדדי רווחיות <span className="normal-case text-slate-600">(לחצו למגמה רבעונית)</span>
        </p>
        <div className="mt-2 grid grid-cols-3 gap-3">
          {profitabilityKeys.map((key) => (
            <MetricTile
              key={key}
              metricKey={key}
              value={metricTiles[key].value}
              isLive={metricTiles[key].isLive}
              industryAverage={detail.industryAverages[key]}
              isActive={activeMetric === key}
              onToggle={toggleMetric}
            />
          ))}
        </div>

        {activeMetric && (
          <div className="mt-3">
            <MetricTrendChart
              points={detail.metricHistory[activeMetric]}
              labelHe={METRIC_LABELS[activeMetric]}
              suffix={METRIC_SUFFIX[activeMetric]}
            />
          </div>
        )}

        {/* Financials — GuruFocus-style revenue/EBITDA/net income and
            cash-vs-debt bar charts, plus a full income-statement flow
            breakdown, each with its own annual/quarterly toggle. Live from
            Yahoo Finance (yfinance) when available; if not, falls back
            automatically to a report the user uploaded and had extracted
            (see the upload control below — POST
            /api/fundamentals/{ticker}/upload-report), and finally to the
            most recent daily-scan snapshot if even that isn't available. */}
        {!financialStatements && (
          <div className="mt-6 space-y-2">
            <p className="text-xs text-amber-400">
              אין כרגע דוחות כספיים לנייר זה{live.statementsError ? ` (${live.statementsError})` : ""} — ניתן להעלות
              דוח PDF של החברה ידנית, וממנו יחושבו גם דוחות כספיים, מכפילים (אם יש מחיר שוק זמין)
              ותחזיות קדימה (אם הדוח כולל הנחיית הנהלה).
            </p>
            <ReportUploadControl
              isUploading={isUploadingReport}
              error={uploadReportError}
              success={uploadReportSuccess}
              onFileSelected={handleReportFileSelected}
              inputRef={reportFileInputRef}
            />
          </div>
        )}
        {financialStatements && (
          <div className="mt-6 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-slate-800">
                נתונים כספיים (
                {live.quarterlyStatements?.[0]?.source === "uploaded"
                  ? "מדוח PDF שהועלה"
                  : live.quarterlyStatements?.[0]?.source === "snapshot"
                    ? "סריקה יומית"
                    : "חי"}
                )
              </h4>
              <ReportUploadControl
                isUploading={isUploadingReport}
                error={uploadReportError}
                success={uploadReportSuccess}
                onFileSelected={handleReportFileSelected}
                inputRef={reportFileInputRef}
                compact
              />
            </div>
            <FinancialsBarChart
              titleHe="הכנסות, EBITDA ורווח נקי"
              annualData={financialStatements.annual}
              quarterlyData={financialStatements.quarterly}
              series={[
                { key: "revenueUsdM", labelHe: "הכנסות", color: "#3b82f6" },
                { key: "ebitdaUsdM", labelHe: "EBITDA", color: "#f59e0b" },
                { key: "netIncomeUsdM", labelHe: "רווח נקי", color: "#22c55e" },
              ]}
            />
            <FinancialsBarChart
              titleHe="מזומן מול חוב"
              annualData={financialStatements.annual}
              quarterlyData={financialStatements.quarterly}
              series={[
                { key: "cashUsdM", labelHe: "מזומן", color: "#22c55e" },
                { key: "debtUsdM", labelHe: "חוב", color: "#ef4444" },
              ]}
            />
            <IncomeStatementFlow
              companyNameHe={detail.nameHe}
              annual={financialStatements.incomeStatement.annual}
              quarterly={financialStatements.incomeStatement.quarterly}
            />
          </div>
        )}

        {/* Stage analysis — Weinstein's 4-stage method, current stage + note,
            plus a legend explaining all 4 so the user can read the framework
            without knowing it by heart. */}
        <div className="mt-5">
          <span
            className={clsx(
              "inline-block rounded-full px-3 py-1 text-xs font-semibold",
              STAGE_COLORS[detail.stage]
            )}
          >
            {STAGE_DESCRIPTIONS[detail.stage].titleHe}
          </span>
          <p className="mt-1.5 text-sm text-slate-500">
            איפה המניה נמצאת מבחינה טכנית: {detail.stageNoteHe}
          </p>

          <div className="mt-3 space-y-1.5 rounded-lg border border-surface-border bg-surface-raised p-3">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              ניתוח סטייג' (שיטת Weinstein) — כל הסטייג'ים
            </p>
            {([1, 2, 3, 4] as WeinsteinStage[]).map((stage) => (
              <div
                key={stage}
                className={clsx(
                  "rounded-md px-2 py-1.5 text-xs",
                  stage === detail.stage ? "bg-brand-500/10 ring-1 ring-brand-500/40" : ""
                )}
              >
                <p
                  className={clsx(
                    "font-semibold",
                    stage === detail.stage ? "text-slate-900" : "text-slate-500"
                  )}
                >
                  {STAGE_DESCRIPTIONS[stage].titleHe}
                  {stage === detail.stage && <span className="text-brand-500"> · המצב הנוכחי</span>}
                </p>
                <p className="mt-0.5 text-slate-500">{STAGE_DESCRIPTIONS[stage].descriptionHe}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Growth outlook + forward P/E table — per-year breakdown of both
            the analyst-consensus and the company's own guidance for revenue
            growth, alongside EPS growth and forward P/E for each year. */}
        <div className="mt-6">
          <h4 className="text-sm font-bold text-slate-800">
            תחזיות צמיחה ומכפיל רווח עתידי
            {live.estimates.length === 0 && <span className="ms-1.5 text-xs text-amber-400">(דמו)</span>}
          </h4>
          <p className="mt-1 text-xs text-slate-500">
            {live.estimates.length > 0
              ? "תחזיות קונצנזוס אנליסטים חיות (Yahoo Finance)."
              : detail.growthOutlook.guidanceNoteHe +
                " — אין כרגע תחזיות אנליסטים חיות לנייר זה (מקור הנתונים אינו מספק תחזיות עבור נייר זה); מוצגים נתוני דמו."}
          </p>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-surface-border text-slate-500">
                  <th className="py-1.5 text-start font-medium">שנה</th>
                  <th className="py-1.5 text-start font-medium">צמיחת הכנסות (אנליסטים)</th>
                  <th className="py-1.5 text-start font-medium">צמיחת רווח (EPS)</th>
                  <th className="py-1.5 text-start font-medium">מכפיל רווח עתידי</th>
                </tr>
              </thead>
              <tbody>
                {live.estimates.length > 0
                  ? live.estimates.map((est) => (
                      <tr key={est.periodLabel} className="border-b border-surface-border/60">
                        <td className="py-1.5 text-slate-700">{est.periodLabel}</td>
                        <td className="py-1.5 text-positive">
                          {est.revenueGrowthPct !== null ? formatPct(est.revenueGrowthPct) : "—"}
                        </td>
                        <td className="py-1.5 text-positive">
                          {est.epsGrowthPct !== null ? formatPct(est.epsGrowthPct) : "—"}
                        </td>
                        <td className="py-1.5 font-semibold text-slate-900">
                          {est.estimatedEps && live.multiples
                            ? (live.multiples.priceUsd / est.estimatedEps).toFixed(1)
                            : "—"}
                        </td>
                      </tr>
                    ))
                  : detail.growthOutlook.forwardEstimates.map((est) => (
                      <tr key={est.yearLabelHe} className="border-b border-surface-border/60">
                        <td className="py-1.5 text-slate-700">{est.yearLabelHe}</td>
                        <td className="py-1.5 text-positive">{formatPct(est.analystRevenueGrowthPct)}</td>
                        <td className="py-1.5 text-positive">{formatPct(est.epsGrowthPct)}</td>
                        <td className="py-1.5 font-semibold text-slate-900">{est.forwardPE.toFixed(1)}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Analyst theses */}
        <div className="mt-6">
          <h4 className="text-sm font-bold text-slate-800">תזות וכתבות אנליסטים</h4>
          <div className="mt-2 space-y-2">
            {detail.theses.map((thesis, i) => (
              <a
                key={i}
                href={thesis.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-start justify-between gap-3 rounded-lg border border-surface-border bg-surface-raised p-3 hover:border-brand-500/50"
              >
                <div>
                  <p className="text-sm font-medium text-slate-800">{thesis.titleHe}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {thesis.source} · {thesis.dateHe} ·{" "}
                    <span className={STANCE_LABELS[thesis.stance].color}>
                      {STANCE_LABELS[thesis.stance].labelHe}
                    </span>
                  </p>
                </div>
                <ExternalLink size={14} className="mt-1 shrink-0 text-slate-500" />
              </a>
            ))}
          </div>
        </div>

        {/* Latest news — clickable, opens the source article in a new tab.
            Only a couple of items show by default; the "•••" control
            reveals the rest. */}
        <div className="mt-6">
          <h4 className="text-sm font-bold text-slate-800">חדשות אחרונות</h4>
          {companyNews.isLoading && <p className="mt-2 text-xs text-slate-500">טוען חדשות עדכניות...</p>}
          {!companyNews.isLoading && companyNews.error && (
            <p className="mt-2 text-xs text-slate-500">לא ניתן לטעון חדשות כרגע: {companyNews.error}</p>
          )}
          {!companyNews.isLoading && !companyNews.error && companyNews.news.length === 0 && (
            <p className="mt-2 text-xs text-slate-500">
              לא נמצאו חדשות מ-10 הימים האחרונים לנייר הזה (מקור החדשות מכסה בעיקר חברות הנסחרות בארה״ב).
            </p>
          )}
          <div className="mt-2 space-y-2">
            {visibleNews.map((item, i) => (
              <a
                key={i}
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-start justify-between gap-3 rounded-lg border border-surface-border bg-surface-raised p-3 hover:border-brand-500/50"
              >
                <div>
                  <p className="text-sm font-medium text-slate-800" dir="auto">{item.headline}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.source} · {formatNewsAgeHe(item.publishedAtIso)}
                  </p>
                </div>
                <ExternalLink size={14} className="mt-1 shrink-0 text-slate-500" />
              </a>
            ))}
          </div>
          {hasMoreNews && (
            <button
              type="button"
              onClick={() => setNewsExpanded((v) => !v)}
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-surface-border bg-surface-raised py-1.5 text-xs text-slate-500 hover:border-brand-500/40 hover:text-slate-800"
            >
              {newsExpanded ? (
                "הצג פחות"
              ) : (
                <>
                  <MoreHorizontal size={16} />
                  <span>עוד כתבות ({companyNews.news.length - NEWS_PREVIEW_COUNT})</span>
                </>
              )}
            </button>
          )}
        </div>

        <p className="mt-5 text-xs text-slate-500">
          מחיר, חדשות, מכפילים, מדדי רווחיות, תחזיות אנליסטים ודוחות כספיים
          מוצגים כנתונים חיים (Finnhub / Yahoo Finance) כשזמינים, עם תיוג
          &quot;(דמו)&quot; מפורש בכל מקום שבו נופלים בחזרה לנתון דמו כי מקור
          הנתונים אינו מכסה את הנייר הזה. ממוצעי הענף, מגמת המכפילים
          הרבעונית, שלב Weinstein והתזות נשארים נתוני דמו להדגמת המסך.
        </p>
      </div>
    </div>
  );
}
