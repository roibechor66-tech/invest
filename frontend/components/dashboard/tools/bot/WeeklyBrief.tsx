"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { BriefIndexReturns } from "@/components/dashboard/tools/bot/BriefIndexReturns";
import { BriefPortfolioVsBenchmark } from "@/components/dashboard/tools/bot/BriefPortfolioVsBenchmark";
import { BriefSourceTag } from "@/components/dashboard/tools/bot/BriefSourceTag";
import { BriefMarketTabs } from "@/components/dashboard/tools/bot/BriefMarketTabs";
import { BriefCompanyNews } from "@/components/dashboard/tools/bot/BriefCompanyNews";
import { mockPerformance } from "@/lib/mock-data/performance";
import { mockIndices } from "@/lib/mock-data/indices";
import {
  BotMarketId,
  MARKET_INDEX_IDS,
  WEEKLY_CALENDAR,
  WEEKLY_NARRATIVE,
  WEEKLY_TOP_HEADLINE,
} from "@/lib/mock-data/bot-briefs";

interface WeeklyBriefProps {
  onBack: () => void;
}

function formatPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

// Weekly brief: an expanded, high-level summary of what's coming this
// week and what to watch — with the week's economic calendar alongside
// it — plus, for whichever market is selected, the major index returns
// every brief carries and (for "your portfolio"/"US market") the
// leading sectors and the portfolio's own return against its benchmark.
// Any notable news on a held company relevant to the market appears
// below.
export function WeeklyBrief({ onBack }: WeeklyBriefProps) {
  const [market, setMarket] = useState<BotMarketId>("portfolio");

  const narrative = WEEKLY_NARRATIVE[market];
  const calendar = WEEKLY_CALENDAR[market];
  const topHeadline = WEEKLY_TOP_HEADLINE[market];

  const weeklyPerf = mockPerformance.find((p) => p.id === "weekly");
  const portfolioWeeklyReturn = weeklyPerf?.returnPct ?? 0;
  const sp500Weekly = weeklyPerf?.benchmarkReturns.sp500 ?? 0;

  const showTopSectors = market === "us" || market === "portfolio";
  const topSectors = mockIndices
    .filter((i) => i.region === "sectors")
    .slice()
    .sort((a, b) => b.returns.weekly - a.returns.weekly)
    .slice(0, 4);

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
        <ArrowRight size={14} /> חזרה
      </button>

      <div>
        <p className="text-sm font-bold text-slate-900">בריף שבועי</p>
        <p className="text-xs text-slate-500">תקציר מה עומד להיות השבוע ועל מה כדאי לשים לב</p>
      </div>

      <BriefMarketTabs activeMarket={market} onChange={setMarket} />

      <div className="grid gap-5 md:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <div className="space-y-2 text-sm leading-relaxed text-slate-700">
            <p>
              <span className="font-semibold text-slate-900">מה עומד להיות: </span>
              {narrative.whatsComingHe}
            </p>
            <p>
              <span className="font-semibold text-slate-900">על מה כדאי לשים לב: </span>
              {narrative.whatToWatchHe}
            </p>
          </div>

          <div>
            <BriefSourceTag sourceHandle={topHeadline.sourceHandle} />
            <p className="mt-1 text-xs text-slate-500">{topHeadline.textHe}</p>
          </div>

          <BriefIndexReturns period="weekly" indexIds={MARKET_INDEX_IDS[market]} titleHe="תשואות המדדים המרכזיים (שבועי)" />

          {market === "portfolio" && (
            <BriefPortfolioVsBenchmark
              portfolioReturnPct={portfolioWeeklyReturn}
              benchmarkReturnPct={sp500Weekly}
              benchmarkLabelHe="S&P 500"
            />
          )}

          {showTopSectors && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">סקטורים בולטים לחיוב השבוע</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {topSectors.map((sector) => (
                  <div key={sector.id} className="rounded-lg border border-surface-border bg-surface-raised p-2.5 text-center">
                    <p className="text-[11px] text-slate-500">{sector.labelHe}</p>
                    <p className="mt-1 text-sm font-bold text-positive">{formatPct(sector.returns.weekly)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">יומן השבוע</p>
          <div className="space-y-1.5">
            {calendar.map((event, index) => (
              <div key={index} className="rounded-lg border border-surface-border bg-surface-raised px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-500">{event.whenHe}</span>
                  {event.importance === "high" && (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400">חשוב</span>
                  )}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-800">{event.labelHe}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <BriefCompanyNews market={market} />

      <p className="text-[11px] leading-relaxed text-slate-500">
        התוכן בבריף זה הוא נתוני דמה להדגמת המסך. בשלב 3 יחובר ללוח
        אירועים כלכלי חי ולחדשות אמיתיות ממקורות מהימנים בלבד — אתרי
        חדשות פיננסים וחשבונות טוויטר/X נבחרים.
      </p>
    </div>
  );
}
