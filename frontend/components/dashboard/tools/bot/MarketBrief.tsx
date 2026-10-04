"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ExternalLink, RefreshCw } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { usePortfolio } from "@/lib/portfolio-context";
import { useLiveIndicesQuotes } from "@/lib/hooks/useLiveIndicesQuotes";
import { useLivePortfolioPerformance } from "@/lib/hooks/useLivePortfolioPerformance";
import { BriefMarketTabs } from "@/components/dashboard/tools/bot/BriefMarketTabs";
import { BriefPortfolioVsBenchmark } from "@/components/dashboard/tools/bot/BriefPortfolioVsBenchmark";
import { BotMarketId, DAILY_US_TOP_VOICE } from "@/lib/mock-data/bot-briefs";

export type BriefKind = "daily" | "weekly";

interface BriefNewsItem {
  text_he: string;
  source_name: string | null;
  url: string | null;
  ticker: string | null;
}

interface MarketBriefResult {
  kind: BriefKind;
  market: BotMarketId;
  generated_at_he: string;
  as_of_he: string;
  summary_a_he: string;
  summary_b_he: string;
  top_headline: BriefNewsItem | null;
  index_returns: { label_he: string; return_pct: number | null; level_he: string | null }[];
  calendar: { when_he: string; label_he: string; importance: "high" | "medium" }[];
  top_sectors: { label_he: string; return_pct: number | null }[];
  deals_and_companies: BriefNewsItem[];
  top_voice_theme_he: string | null;
  company_news: BriefNewsItem[];
  sources: { title: string; url: string }[];
  cached_at_iso: string | null;
}

const COPY: Record<BriefKind, { title: string; subtitle: string; summaryA: string; summaryB: string; calendar: string; indices: string }> = {
  daily: {
    title: "בריף יומי",
    subtitle: "מה קרה ביום המסחר האחרון, ומה צפוי היום",
    summaryA: "מה היה ביום המסחר האחרון: ",
    summaryB: "מה צפוי היום: ",
    calendar: "יומן היום",
    indices: "תשואות המדדים המרכזיים (יומי)",
  },
  weekly: {
    title: "בריף שבועי",
    subtitle: "מה עומד להיות השבוע ועל מה כדאי לשים לב",
    summaryA: "מה עומד להיות: ",
    summaryB: "על מה כדאי לשים לב: ",
    calendar: "יומן השבוע",
    indices: "תשואות המדדים המרכזיים (שבוע אחרון)",
  },
};

function formatPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function SourceLink({ item }: { item: BriefNewsItem }) {
  if (!item.source_name && !item.url) return null;
  const label = item.source_name ?? "מקור";
  return item.url ? (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 rounded-full bg-surface-raised px-2 py-0.5 text-[10px] font-medium text-slate-500 hover:text-slate-800"
    >
      <ExternalLink size={10} /> {label}
    </a>
  ) : (
    <span className="inline-flex rounded-full bg-surface-raised px-2 py-0.5 text-[10px] font-medium text-slate-500">{label}</span>
  );
}

// The portfolio-vs-S&P 500 block uses real numbers the app already has —
// never the AI's: today's live portfolio change against SPY's live day
// change (daily), or the portfolio performance endpoint's weekly period
// (weekly). Hidden when those numbers aren't available.
function PortfolioComparison({ kind }: { kind: BriefKind }) {
  const { summary, positions } = usePortfolio();
  const spy = useLiveIndicesQuotes(kind === "daily" ? ["SPY"] : [])["SPY"];
  const { periods } = useLivePortfolioPerformance();

  if (kind === "daily") {
    const hasLivePrices = positions.some((p) => p.priceIsLive);
    if (!hasLivePrices || !spy) return null;
    return (
      <BriefPortfolioVsBenchmark
        portfolioReturnPct={summary.dayChangePct}
        benchmarkReturnPct={spy.dayChangePct}
        benchmarkLabelHe="S&P 500"
      />
    );
  }

  const weekly = periods.find((p) => p.id === "weekly");
  const sp500 = weekly?.benchmarkReturns.sp500;
  if (!weekly || sp500 === undefined) return null;
  return (
    <BriefPortfolioVsBenchmark portfolioReturnPct={weekly.returnPct} benchmarkReturnPct={sp500} benchmarkLabelHe="S&P 500" />
  );
}

// Daily and weekly briefs: a real, web-search-backed brief per market from
// POST /api/briefs/{kind}/{market} (see backend app/services/briefs.py),
// cached server-side (3h daily / 12h weekly) with a "רענן עכשיו" refresh.
// Replaces the fixed mock content these screens showed since Phase 1.
export function MarketBrief({ kind, onBack }: { kind: BriefKind; onBack: () => void }) {
  const [market, setMarket] = useState<BotMarketId>("portfolio");
  const [result, setResult] = useState<MarketBriefResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { positions } = usePortfolio();
  const tickersKey = positions.map((p) => p.ticker).sort().join(",");
  // Ignore a response that arrives after the user already switched market.
  const requestId = useRef(0);

  async function load(force: boolean) {
    const id = ++requestId.current;
    setIsLoading(true);
    setError(null);
    if (!force) setResult(null);
    try {
      const data = await apiFetch<MarketBriefResult>(`/api/briefs/${kind}/${market}${force ? "?force=true" : ""}`, {
        method: "POST",
        body: JSON.stringify({ portfolio_tickers: tickersKey ? tickersKey.split(",") : [] }),
      });
      if (id === requestId.current) setResult(data);
    } catch (err) {
      if (id === requestId.current) setError(err instanceof ApiError ? err.message : "יצירת הבריף נכשלה");
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
  }

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, market, tickersKey]);

  const copy = COPY[kind];

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
        <ArrowRight size={14} /> חזרה
      </button>

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-slate-900">{copy.title}</p>
          <p className="text-xs text-slate-500">{copy.subtitle}</p>
        </div>
        {result && (
          <button
            type="button"
            onClick={() => load(true)}
            disabled={isLoading}
            className="flex items-center gap-1 text-xs font-medium text-brand-400 hover:text-brand-300 disabled:opacity-50"
          >
            <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
            {isLoading ? "מרענן..." : "רענן עכשיו"}
          </button>
        )}
      </div>

      <BriefMarketTabs activeMarket={market} onChange={setMarket} />

      {isLoading && !result && (
        <p className="text-sm text-slate-500">
          הבוט מחפש עכשיו באינטרנט נתונים וחדשות עדכניים ובונה את הבריף... זה לוקח בדרך כלל 1-2 דקות.
        </p>
      )}

      {error && <p className="text-sm text-negative">{error}</p>}

      {result && (
        <>
          <p className="text-[11px] text-slate-500">
            נתונים נכון ל: {result.as_of_he} · נוצר: {result.generated_at_he}
          </p>

          <div className="grid gap-5 md:grid-cols-[2fr_1fr]">
            <div className="space-y-4">
              <div className="space-y-2 text-sm leading-relaxed text-slate-700">
                <p>
                  <span className="font-semibold text-slate-900">{copy.summaryA}</span>
                  {result.summary_a_he}
                </p>
                <p>
                  <span className="font-semibold text-slate-900">{copy.summaryB}</span>
                  {result.summary_b_he}
                </p>
              </div>

              {result.top_headline?.text_he && (
                <div>
                  <SourceLink item={result.top_headline} />
                  <p className="mt-1 text-sm text-slate-800">{result.top_headline.text_he}</p>
                </div>
              )}

              {result.index_returns.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{copy.indices}</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {result.index_returns.map((index, i) => (
                      <div key={i} className="rounded-lg border border-surface-border bg-surface-raised p-2.5 text-center">
                        <p className="text-[11px] text-slate-500">{index.label_he}</p>
                        {index.return_pct === null ? (
                          <p className="mt-1 text-xs text-slate-400">אין נתון</p>
                        ) : (
                          <p className={`mt-1 text-sm font-bold ${index.return_pct >= 0 ? "text-positive" : "text-negative"}`}>
                            {formatPct(index.return_pct)}
                          </p>
                        )}
                        {index.level_he && <p className="text-[10px] text-slate-500">{index.level_he}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {market === "portfolio" && <PortfolioComparison kind={kind} />}

              {result.top_sectors.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">סקטורים בולטים לחיוב בשבוע האחרון</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {result.top_sectors.map((sector, i) => (
                      <div key={i} className="rounded-lg border border-surface-border bg-surface-raised p-2.5 text-center">
                        <p className="text-[11px] text-slate-500">{sector.label_he}</p>
                        <p
                          className={`mt-1 text-sm font-bold ${
                            sector.return_pct === null ? "text-slate-400" : sector.return_pct >= 0 ? "text-positive" : "text-negative"
                          }`}
                        >
                          {sector.return_pct === null ? "אין נתון" : formatPct(sector.return_pct)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.top_voice_theme_he && (
                <div className="rounded-lg border border-surface-border bg-surface-raised p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">קול לעקוב אחריו</p>
                  <p className="mt-1.5 text-sm font-bold text-slate-900">
                    {DAILY_US_TOP_VOICE.nameHe} <span className="font-normal text-slate-500">({DAILY_US_TOP_VOICE.handle})</span>
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">{DAILY_US_TOP_VOICE.focusHe}</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-800">{result.top_voice_theme_he}</p>
                </div>
              )}

              {result.deals_and_companies.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">עסקאות וחברות מעניינות</p>
                  <div className="space-y-2">
                    {result.deals_and_companies.map((item, i) => (
                      <div key={i} className="rounded-lg border border-surface-border bg-surface-raised p-2.5">
                        <p className="text-sm text-slate-800">{item.text_he}</p>
                        <div className="mt-1.5">
                          <SourceLink item={item} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {result.calendar.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{copy.calendar}</p>
                <div className="space-y-1.5">
                  {result.calendar.map((event, i) => (
                    <div key={i} className="rounded-lg border border-surface-border bg-surface-raised px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-500">{event.when_he}</span>
                        {event.importance === "high" && (
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400">חשוב</span>
                        )}
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-slate-800">{event.label_he}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {result.company_news.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">חדשות ואירועים ממניות התיק שלכם</p>
              <div className="space-y-2">
                {result.company_news.map((item, i) => (
                  <div key={i} className="rounded-lg border border-surface-border bg-surface-raised p-2.5">
                    {item.ticker && <p className="text-[11px] font-semibold text-brand-400" dir="ltr">{item.ticker}</p>}
                    <p className="mt-1 text-sm text-slate-800">{item.text_he}</p>
                    <div className="mt-1.5">
                      <SourceLink item={item} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.sources.length > 0 && (
            <details className="text-xs text-slate-500">
              <summary className="cursor-pointer">מקורות ({result.sources.length})</summary>
              <ul className="mt-2 space-y-1">
                {result.sources.map((source, i) => (
                  <li key={i}>
                    {source.url ? (
                      <a href={source.url} target="_blank" rel="noreferrer" className="hover:text-slate-800">
                        {source.title || source.url}
                      </a>
                    ) : (
                      source.title
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <p className="text-[11px] leading-relaxed text-slate-500">
            הבריף נבנה בזמן אמת על ידי AI שמחפש באינטרנט במקורות פיננסיים, ומתעדכן אוטומטית (יומי: כל 3 שעות, שבועי: כל 12
            שעות). נתונים שלא נמצאו מוצגים כ&quot;אין נתון&quot; ולא מנוחשים. אין לראות בכך ייעוץ השקעות.
          </p>
        </>
      )}
    </div>
  );
}
