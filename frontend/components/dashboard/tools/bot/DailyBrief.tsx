"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { BriefIndexReturns } from "@/components/dashboard/tools/bot/BriefIndexReturns";
import { BriefPortfolioVsBenchmark } from "@/components/dashboard/tools/bot/BriefPortfolioVsBenchmark";
import { BriefSourceTag } from "@/components/dashboard/tools/bot/BriefSourceTag";
import { BriefMarketTabs } from "@/components/dashboard/tools/bot/BriefMarketTabs";
import { BriefCompanyNews } from "@/components/dashboard/tools/bot/BriefCompanyNews";
import { usePortfolio } from "@/lib/portfolio-context";
import { mockIndices } from "@/lib/mock-data/indices";
import {
  BotMarketId,
  DAILY_CALENDAR,
  DAILY_NARRATIVE,
  DAILY_TOP_HEADLINE,
  DAILY_US_DEALS_AND_COMPANIES,
  DAILY_US_TOP_VOICE,
  MARKET_INDEX_IDS,
} from "@/lib/mock-data/bot-briefs";

interface DailyBriefProps {
  onBack: () => void;
}

// Daily brief: an expanded, high-level summary of what happened
// yesterday's trading session and what's expected today, with the day's
// economic calendar alongside it — plus, for whichever market is
// selected, the major index returns every brief carries and (for "your
// portfolio") the portfolio's own return against its benchmark. Any
// notable news on a held company relevant to the market appears below.
export function DailyBrief({ onBack }: DailyBriefProps) {
  const [market, setMarket] = useState<BotMarketId>("portfolio");
  const { summary } = usePortfolio();

  const narrative = DAILY_NARRATIVE[market];
  const calendar = DAILY_CALENDAR[market];
  const topHeadline = DAILY_TOP_HEADLINE[market];
  const sp500Daily = mockIndices.find((i) => i.id === "sp500")?.returns.daily ?? 0;

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
        <ArrowRight size={14} /> חזרה
      </button>

      <div>
        <p className="text-sm font-bold text-slate-900">בריף יומי</p>
        <p className="text-xs text-slate-500">מה קרה אתמול ביום המסחר, ומה צפוי היום</p>
      </div>

      <BriefMarketTabs activeMarket={market} onChange={setMarket} />

      <div className="grid gap-5 md:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <div className="space-y-2 text-sm leading-relaxed text-slate-700">
            <p>
              <span className="font-semibold text-slate-900">מה היה אתמול: </span>
              {narrative.yesterdayHe}
            </p>
            <p>
              <span className="font-semibold text-slate-900">מה צפוי היום: </span>
              {narrative.todayHe}
            </p>
          </div>

          <div>
            <BriefSourceTag sourceHandle={topHeadline.sourceHandle} />
            <p className="mt-1 text-xs text-slate-500">{topHeadline.textHe}</p>
          </div>

          <BriefIndexReturns period="daily" indexIds={MARKET_INDEX_IDS[market]} titleHe="תשואות המדדים המרכזיים (יומי)" />

          {market === "portfolio" && (
            <BriefPortfolioVsBenchmark
              portfolioReturnPct={summary.dayChangePct}
              benchmarkReturnPct={sp500Daily}
              benchmarkLabelHe="S&P 500"
            />
          )}

          {market === "us" && (
            <div className="rounded-lg border border-surface-border bg-surface-raised p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">קול לעקוב אחריו</p>
              <p className="mt-1.5 text-sm font-bold text-slate-900">
                {DAILY_US_TOP_VOICE.nameHe} <span className="font-normal text-slate-500">({DAILY_US_TOP_VOICE.handle})</span>
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{DAILY_US_TOP_VOICE.focusHe}</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-800">{DAILY_US_TOP_VOICE.todayThemeHe}</p>
            </div>
          )}

          {market === "us" && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">עסקאות וחברות מעניינות</p>
              <div className="space-y-2">
                {DAILY_US_DEALS_AND_COMPANIES.map((item, index) => (
                  <div key={index} className="rounded-lg border border-surface-border bg-surface-raised p-2.5">
                    <p className="text-sm text-slate-800">{item.textHe}</p>
                    <div className="mt-1.5">
                      <BriefSourceTag sourceHandle={item.sourceHandle} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">יומן היום</p>
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
        התוכן בבריף זה הוא נתוני דמה להדגמת המסך. בשלב 3 יחובר לחדשות
        אמיתיות ממקורות מהימנים בלבד — אתרי חדשות פיננסים וחשבונות
        טוויטר/X נבחרים.
      </p>
    </div>
  );
}
