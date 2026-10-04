"use client";

import { useState } from "react";
import {
  Landmark,
  Coins,
  Globe2,
  RefreshCw,
  ArrowRight,
  Calendar,
  TrendingUp,
  Percent,
  Newspaper,
  Compass,
  CalendarClock,
  Building2,
  ExternalLink,
  Wallet,
  Link2,
  Eye,
  Scale,
  Flame,
} from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { usePortfolio } from "@/lib/portfolio-context";

type MarketId = "israel" | "us" | "asia" | "commodities";
type ViewId = MarketId | "portfolio";

interface TrendSource {
  title: string;
  url: string;
}

interface WeeklySummaryIndexReturn {
  name_he: string;
  return_pct_he: string;
}

interface WeeklySummaryBondYield {
  label_he: string;
  yield_level_he: string;
  weekly_change_he: string | null;
  market_impact_he: string | null;
}

interface WeeklySummaryEconomicResult {
  label_he: string;
  actual_he: string;
  expected_he: string | null;
  previous_he: string | null;
  surprise_he: string | null;
  impact_he: string;
}

interface WeeklySummaryUpcomingItem {
  date_he: string;
  label_he: string;
  why_it_matters_he: string | null;
  ticker: string | null;
  is_portfolio_holding: boolean;
}

interface WeeklySummaryResult {
  market_id: MarketId;
  market_label_he: string;
  week_range_he: string;
  generated_at_he: string;
  summary_he: string;
  index_returns: WeeklySummaryIndexReturn[];
  bond_yields: WeeklySummaryBondYield[];
  bond_yields_note_he: string | null;
  economic_data_results: WeeklySummaryEconomicResult[];
  market_narrative_he: string;
  why_moved_he: string;
  outlook_next_week_he: string;
  key_economic_events_ahead: WeeklySummaryUpcomingItem[];
  key_earnings_ahead: WeeklySummaryUpcomingItem[];
  sources: TrendSource[];
  cached_at_iso: string | null;
}

interface PortfolioWeeklyHolding {
  ticker: string;
  company_name_he: string;
  weekly_return_pct: number;
  weekly_return_he: string;
  reason_he: string;
  sentiment: "positive" | "negative" | "neutral";
}

interface PortfolioCorrelationInsight {
  title_he: string;
  description_he: string;
  tickers_involved: string[];
}

interface PortfolioWeeklySummaryResult {
  week_range_he: string;
  generated_at_he: string;
  overall_return_pct: number | null;
  overall_return_he: string;
  benchmark_comparison_he: string;
  summary_he: string;
  holdings: PortfolioWeeklyHolding[];
  conclusions_he: string;
  correlation_insights: PortfolioCorrelationInsight[];
  watch_items_he: string[];
  rebalancing_suggestion_he: string | null;
  trending_sectors_he: string;
  sources: TrendSource[];
  cached_at_iso: string | null;
}

const MARKETS: { id: MarketId; label: string; icon: typeof Landmark; blurb: string }[] = [
  { id: "israel", label: "שוק ישראלי", icon: Landmark, blurb: "ת\"א 35/125, אג\"ח שקלי, בנק ישראל" },
  { id: "us", label: 'שוק ארה"ב', icon: Coins, blurb: "S&P 500, נאסד\"ק, וגם ביטקוין ואת'ריום" },
  { id: "asia", label: "שווקי אסיה", icon: Globe2, blurb: "יפן, סין, הונג קונג, קוריאה, הודו" },
  { id: "commodities", label: "סחורות", icon: TrendingUp, blurb: "נפט, זהב, כסף, נחושת וגז טבעי" },
];

const PORTFOLIO_VIEW = { id: "portfolio" as const, label: "התיק שלי", icon: Wallet, blurb: "ביצועי התיק שלכם, מניה-מניה, ומסקנות אישיות" };

function sentimentColor(sentiment: PortfolioWeeklyHolding["sentiment"]): string {
  if (sentiment === "positive") return "text-positive";
  if (sentiment === "negative") return "text-negative";
  return "text-slate-500";
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

function returnColor(pct: string): string {
  return pct.trim().startsWith("-") ? "text-negative" : "text-positive";
}

// "סיכום שבועי": the person picks one of four markets (ישראל / ארה"ב —
// כולל ביטקוין ואת'ריום / אסיה / סחורות) and gets a structured weekly
// recap for that market: index/asset returns, 10y/30y bond yields where
// relevant, this week's economic-data releases (actual vs. expected), a
// narrative of what actually moved the market and why, and next week's
// outlook (economic events + company earnings to watch). Real,
// web-search-backed Claude call — same declared "real AI, not mock"
// exception as the rest of the bot — cached per market for a day at a
// time on the backend, with a manual "רענן עכשיו" to force a fresh run.
export function WeeklySummaryPanel() {
  const { positions } = usePortfolio();
  const [view, setView] = useState<ViewId | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WeeklySummaryResult | null>(null);
  const [portfolioResult, setPortfolioResult] = useState<PortfolioWeeklySummaryResult | null>(null);

  const portfolioTickers = positions.map((p) => p.ticker);

  async function load(selected: MarketId, force = false) {
    if (force) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch<WeeklySummaryResult>(
        `/api/research/weekly-summary/${selected}${force ? "?force=true" : ""}`,
        { method: "POST", body: JSON.stringify({ portfolio_tickers: portfolioTickers }) }
      );
      setResult(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "טעינת הסיכום השבועי נכשלה");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  async function loadPortfolio(force = false) {
    if (force) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      const totalUsd = positions.reduce((sum, p) => sum + p.amountUsd, 0) || 1;
      const holdings = positions.map((p) => ({
        ticker: p.ticker,
        company_name_he: p.nameHe,
        weight_pct: (p.amountUsd / totalUsd) * 100,
        sector_he: p.sectorNameHe,
      }));
      const data = await apiFetch<PortfolioWeeklySummaryResult>(
        `/api/research/weekly-summary-portfolio${force ? "?force=true" : ""}`,
        { method: "POST", body: JSON.stringify({ holdings }) }
      );
      setPortfolioResult(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "טעינת סיכום התיק השבועי נכשלה");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  function pickMarket(selected: MarketId) {
    setView(selected);
    setResult(null);
    load(selected);
  }

  function pickPortfolio() {
    setView("portfolio");
    setPortfolioResult(null);
    loadPortfolio();
  }

  function backToMarkets() {
    setView(null);
    setResult(null);
    setPortfolioResult(null);
    setError(null);
  }

  if (!view) {
    return (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-slate-500">
          בחרו שוק, וקבלו סיכום שבועי מלא: מה היה השבוע, תשואות המדדים
          המרכזיים (וגם ביטקוין ואת&apos;ריום תחת ארה&quot;ב), תשואות אג&quot;ח ל-10
          ול-30 שנה, תוצאות הנתונים הכלכליים מול הצפי, למה השוק עלה או ירד,
          ולאן הוא צפוי ללכת בשבוע הקרוב — כולל הנתונים הכלכליים ודוחות
          החברות החשובים שמחכים לנו (עם סימון ⭐ למניות שאתם מחזיקים בפועל).
          יש גם סיכום ייעודי לתיק שלכם עצמו.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={pickPortfolio}
            className="flex flex-col items-start gap-1.5 rounded-lg border border-brand-500/40 bg-brand-500/5 p-3.5 text-right transition hover:border-brand-500/60 hover:bg-brand-500/10"
          >
            <span className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Wallet size={16} className="text-brand-400" />
              {PORTFOLIO_VIEW.label}
            </span>
            <span className="text-xs text-slate-500">{PORTFOLIO_VIEW.blurb}</span>
          </button>
          {MARKETS.map(({ id, label, icon: Icon, blurb }) => (
            <button
              key={id}
              type="button"
              onClick={() => pickMarket(id)}
              className="flex flex-col items-start gap-1.5 rounded-lg border border-surface-border bg-surface-raised p-3.5 text-right transition hover:border-brand-500/50 hover:bg-surface-card"
            >
              <span className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Icon size={16} className="text-brand-400" />
                {label}
              </span>
              <span className="text-xs text-slate-500">{blurb}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (view === "portfolio") {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={backToMarkets}
          className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
        >
          <ArrowRight size={13} /> בחירת שוק אחר
        </button>

        {isLoading && !portfolioResult && (
          <p className="text-sm text-slate-500">בונה סיכום שבועי לתיק שלכם...</p>
        )}

        {error && <p className="text-sm text-negative">{error}</p>}

        {portfolioResult && (
          <div className="space-y-5 rounded-lg border border-surface-border bg-surface-raised p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="flex items-center gap-1.5 text-base font-bold text-slate-900">
                  <Wallet size={15} className="text-brand-400" /> סיכום שבועי — התיק שלי
                </p>
                <p className="flex items-center gap-1 text-xs text-slate-500">
                  <Calendar size={12} /> {portfolioResult.week_range_he}
                  {portfolioResult.cached_at_iso && ` · עודכן: ${formatUpdatedAt(portfolioResult.cached_at_iso)}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => loadPortfolio(true)}
                disabled={isRefreshing}
                className="flex items-center gap-1 text-xs font-medium text-brand-400 hover:text-brand-300 disabled:opacity-50"
              >
                <RefreshCw size={12} className={isRefreshing ? "animate-spin" : ""} />
                {isRefreshing ? "מרענן..." : "רענן עכשיו"}
              </button>
            </div>

            <div className="rounded-lg border border-surface-border bg-surface-card p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-500">תשואה שבועית משוקללת</span>
                <span className={`text-lg font-bold ${returnColor(portfolioResult.overall_return_he)}`}>
                  {portfolioResult.overall_return_he}
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{portfolioResult.benchmark_comparison_he}</p>
            </div>

            <p className="text-sm leading-relaxed text-slate-800">{portfolioResult.summary_he}</p>

            {portfolioResult.holdings.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <TrendingUp size={13} /> ביצועי כל מניה בתיק
                </p>
                <div className="space-y-2">
                  {portfolioResult.holdings.map((h, i) => (
                    <div key={i} className="rounded-lg border border-surface-border bg-surface-card p-2.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-900" dir="ltr">
                          {h.ticker} <span className="font-normal text-slate-500">· {h.company_name_he}</span>
                        </span>
                        <span className={`text-sm font-bold ${sentimentColor(h.sentiment)}`} dir="ltr">
                          {h.weekly_return_he}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-slate-500">{h.reason_he}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-lg border border-brand-500/30 bg-brand-500/5 p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-400">
                <Compass size={13} /> מסקנות מהתיק השבוע
              </p>
              <p className="text-sm leading-relaxed text-slate-800">{portfolioResult.conclusions_he}</p>
            </div>

            {portfolioResult.correlation_insights.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <Link2 size={13} /> דפוסי קורלציה שנמצאו
                </p>
                <div className="space-y-2">
                  {portfolioResult.correlation_insights.map((c, i) => (
                    <div key={i} className="rounded-lg border border-surface-border bg-surface-card p-2.5">
                      <p className="text-sm font-semibold text-slate-900">{c.title_he}</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-500">{c.description_he}</p>
                      {c.tickers_involved.length > 0 && (
                        <p className="mt-1 text-[11px] text-slate-500" dir="ltr">{c.tickers_involved.join(" · ")}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {portfolioResult.watch_items_he.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <Eye size={13} /> דברים לשים לב אליהם
                </p>
                <ul className="space-y-1.5">
                  {portfolioResult.watch_items_he.map((w, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs leading-relaxed text-slate-700">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {portfolioResult.rebalancing_suggestion_he && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-400">
                  <Scale size={13} /> הצעה לאיזון התיק
                </p>
                <p className="text-sm leading-relaxed text-slate-800">{portfolioResult.rebalancing_suggestion_he}</p>
              </div>
            )}

            <div className="rounded-lg border border-surface-border bg-surface-card p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Flame size={13} /> סקטורים שמקבלים תשומת לב בשוק
              </p>
              <p className="text-sm leading-relaxed text-slate-700">{portfolioResult.trending_sectors_he}</p>
            </div>

            {portfolioResult.sources.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">מקורות</p>
                <ul className="space-y-1">
                  {portfolioResult.sources.map((s, i) => (
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
              הסיכום נוצר אוטומטית על ידי מודל AI על בסיס חיפוש אינטרנט חי
              והרכב התיק שלכם כרגע, ומתעדכן כברירת מחדל עד פעם ביום (ניתן
              לרענן ידנית). הצעת האיזון (אם קיימת) היא מחשבה לשיקול דעתכם
              בלבד, אינה ייעוץ השקעות, ואינה תחליף לבדיקת נאותות עצמאית.
            </p>
          </div>
        )}
      </div>
    );
  }

  const market = view as MarketId;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={backToMarkets}
        className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowRight size={13} /> בחירת שוק אחר
      </button>

      {isLoading && !result && (
        <p className="text-sm text-slate-500">בונה סיכום שבועי...</p>
      )}

      {error && <p className="text-sm text-negative">{error}</p>}

      {result && (
        <div className="space-y-5 rounded-lg border border-surface-border bg-surface-raised p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-base font-bold text-slate-900">{result.market_label_he}</p>
              <p className="flex items-center gap-1 text-xs text-slate-500">
                <Calendar size={12} /> {result.week_range_he}
                {result.cached_at_iso && ` · עודכן: ${formatUpdatedAt(result.cached_at_iso)}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => load(market, true)}
              disabled={isRefreshing}
              className="flex items-center gap-1 text-xs font-medium text-brand-400 hover:text-brand-300 disabled:opacity-50"
            >
              <RefreshCw size={12} className={isRefreshing ? "animate-spin" : ""} />
              {isRefreshing ? "מרענן..." : "רענן עכשיו"}
            </button>
          </div>

          <p className="text-sm leading-relaxed text-slate-800">{result.summary_he}</p>

          {result.index_returns.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <TrendingUp size={13} /> תשואות השבוע
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {result.index_returns.map((idx, i) => (
                  <div key={i} className="rounded-lg border border-surface-border bg-surface-card p-2.5">
                    <p className="text-xs text-slate-500">{idx.name_he}</p>
                    <p className={`mt-0.5 text-sm font-bold ${returnColor(idx.return_pct_he)}`}>
                      {idx.return_pct_he}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Percent size={13} /> תשואות אג&quot;ח (10/30 שנה)
            </p>
            {result.bond_yields.length > 0 ? (
              <div className="space-y-2">
                {result.bond_yields.map((b, i) => (
                  <div key={i} className="rounded-lg border border-surface-border bg-surface-card p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-500">{b.label_he}</span>
                      <span className="text-sm font-semibold text-slate-800">
                        {b.yield_level_he}
                        {b.weekly_change_he && (
                          <span className="mr-1.5 text-xs font-normal text-slate-500">({b.weekly_change_he})</span>
                        )}
                      </span>
                    </div>
                    {b.market_impact_he && (
                      <p className="mt-1.5 text-xs leading-relaxed text-brand-300">{b.market_impact_he}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs leading-relaxed text-slate-500">
                {result.bond_yields_note_he ?? "אין נתוני אג\"ח רלוונטיים לשוק זה."}
              </p>
            )}
          </div>

          {result.economic_data_results.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Newspaper size={13} /> נתונים כלכליים שהתפרסמו השבוע
              </p>
              <div className="space-y-2">
                {result.economic_data_results.map((econ, i) => (
                  <div key={i} className="rounded-lg border border-surface-border bg-surface-card p-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-900">{econ.label_he}</span>
                      <span className="text-sm font-bold text-slate-800">{econ.actual_he}</span>
                    </div>
                    {(econ.expected_he || econ.previous_he) && (
                      <p className="mt-1 text-xs text-slate-500">
                        {econ.expected_he && `צפי: ${econ.expected_he}`}
                        {econ.expected_he && econ.previous_he && " · "}
                        {econ.previous_he && `קודם: ${econ.previous_he}`}
                      </p>
                    )}
                    {econ.surprise_he && (
                      <p className="mt-1 text-xs leading-relaxed text-brand-300">{econ.surprise_he}</p>
                    )}
                    <p className="mt-1.5 flex items-start gap-1 text-xs leading-relaxed text-slate-500">
                      <Compass size={11} className="mt-0.5 shrink-0 text-slate-500" />
                      <span>{econ.impact_he}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">מה קרה בשווקים השבוע</p>
            <p className="text-sm leading-relaxed text-slate-700">{result.market_narrative_he}</p>
          </div>

          <div className="rounded-lg border border-brand-500/30 bg-brand-500/5 p-3">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-brand-400">למה השוק עלה/ירד</p>
            <p className="text-sm leading-relaxed text-slate-800">{result.why_moved_he}</p>
          </div>

          <div className="rounded-lg border border-surface-border bg-surface-card p-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Compass size={13} /> לאן השוק הולך בשבוע הקרוב
            </p>
            <p className="text-sm leading-relaxed text-slate-700">{result.outlook_next_week_he}</p>
          </div>

          {result.key_economic_events_ahead.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <CalendarClock size={13} /> נתונים כלכליים חשובים בשבוע הקרוב
              </p>
              <div className="space-y-2">
                {result.key_economic_events_ahead.map((item, i) => (
                  <div key={i} className="rounded-lg border border-surface-border bg-surface-card p-2.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-900">{item.label_he}</span>
                      <span className="whitespace-nowrap rounded-full bg-brand-500/15 px-2 py-0.5 text-[11px] font-semibold text-brand-300">
                        {item.date_he}
                      </span>
                    </div>
                    {item.why_it_matters_he && (
                      <p className="mt-1 text-xs leading-relaxed text-slate-500">{item.why_it_matters_he}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.key_earnings_ahead.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Building2 size={13} /> דיווחי חברות חשובים בשבוע הקרוב
              </p>
              <div className="space-y-2">
                {result.key_earnings_ahead.map((item, i) => (
                  <div
                    key={i}
                    className={`rounded-lg border p-2.5 ${
                      item.is_portfolio_holding
                        ? "border-brand-500/50 bg-brand-500/10"
                        : "border-surface-border bg-surface-card"
                    }`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                        {item.label_he}
                        {item.ticker && (
                          <span className="rounded bg-surface-border px-1.5 py-0.5 text-[10px] font-bold text-slate-700" dir="ltr">
                            {item.ticker}
                          </span>
                        )}
                        {item.is_portfolio_holding && (
                          <span className="rounded-full bg-brand-500/20 px-1.5 py-0.5 text-[10px] font-bold text-brand-300">
                            ⭐ מהתיק שלך
                          </span>
                        )}
                      </span>
                      <span className="whitespace-nowrap rounded-full bg-brand-500/15 px-2 py-0.5 text-[11px] font-semibold text-brand-300">
                        {item.date_he}
                      </span>
                    </div>
                    {item.why_it_matters_he && (
                      <p className="mt-1 text-xs leading-relaxed text-slate-500">{item.why_it_matters_he}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

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
            הסיכום נוצר אוטומטית על ידי מודל AI על בסיס חיפוש אינטרנט חי,
            ומתעדכן כברירת מחדל עד פעם ביום (ניתן לרענן ידנית בכל רגע). הוא
            עשוי לכלול טעויות או מקורות חלקיים, אינו ייעוץ השקעות, ואינו
            תחליף לבדיקת נאותות עצמאית.
          </p>
        </div>
      )}
    </div>
  );
}
