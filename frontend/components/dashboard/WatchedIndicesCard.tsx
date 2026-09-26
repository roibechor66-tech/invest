"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import {
  IndexCategoryId,
  IndexCategoryOption,
  IndexPeriodOption,
  IndexQuote,
} from "@/lib/types";
import { SectorHeatmapModal } from "@/components/dashboard/tools/SectorHeatmapModal";
import { LIVE_INDEX_SYMBOLS } from "@/lib/live-index-symbols";
import { LiveIndexQuote, useLiveIndicesQuotes } from "@/lib/hooks/useLiveIndicesQuotes";

interface WatchedIndicesCardProps {
  indices: IndexQuote[];
  periods: IndexPeriodOption[];
  categories: IndexCategoryOption[];
}

function formatPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

// Watchlist of Israeli + global indices, plus category tabs for sector
// ETFs (incl. niche ones like software/cyber/AI/semis/memory chips) and
// leading regional markets in Asia and South America. A small period
// switcher lets the user flip between daily/weekly/quarterly/YTD/
// yearly/5y returns for whichever category is selected. Mock quotes in
// Phase 1/2; Phase 3 refreshes these from a live market-data feed.
export function WatchedIndicesCard({ indices, periods, categories }: WatchedIndicesCardProps) {
  const [periodId, setPeriodId] = useState(periods[0].id);
  const [categoryId, setCategoryId] = useState<IndexCategoryId>(categories[0].id);
  const [openSector, setOpenSector] = useState<IndexQuote | null>(null);

  // Every distinct ticker symbol this screen can show live (see
  // lib/live-index-symbols.ts for which ids qualify and why not all of
  // them do) — fetched once as a batch and looked up per-row below.
  const liveSymbols = useMemo(() => Array.from(new Set(Object.values(LIVE_INDEX_SYMBOLS))), []);
  const liveQuotesBySymbol = useLiveIndicesQuotes(liveSymbols);

  const ilIndices = indices.filter((i) => i.region === "il");
  const globalIndices = indices.filter((i) => i.region === "global");
  // Sector/regional tabs (unlike the fixed "עיקריים" list of named
  // indices) are ranked, not a fixed watchlist — sorted best-to-worst by
  // whichever period is currently selected, so switching the period
  // switcher (יומי/שבועי/...) re-sorts the grid to match it.
  const categoryIndices = indices
    .filter((i) => i.region === categoryId)
    .sort((a, b) => b.returns[periodId] - a.returns[periodId]);

  return (
    <section className="rounded-xl border border-surface-border bg-surface-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold text-slate-900">מדדים נבחרים</h2>
        <div className="flex flex-wrap gap-1.5">
          {periods.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriodId(p.id)}
              className={clsx(
                "rounded-full px-2.5 py-1 text-[11px] font-medium transition",
                periodId === p.id
                  ? "bg-brand-500 text-white"
                  : "bg-surface-raised text-slate-500 hover:text-slate-800"
              )}
            >
              {p.labelHe}
            </button>
          ))}
        </div>
      </div>

      {/* Category tabs: default Israel/global split, or a single grid of
          sector ETFs / Asia / South America markets. */}
      <div className="mt-3 flex flex-wrap gap-1.5 border-b border-surface-border pb-3">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategoryId(c.id)}
            className={clsx(
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              categoryId === c.id
                ? "bg-brand-500/15 text-brand-500 ring-1 ring-brand-500/40"
                : "bg-surface-raised text-slate-500 hover:text-slate-800"
            )}
          >
            {c.labelHe}
          </button>
        ))}
      </div>

      {categoryId === "main" ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              ישראל
            </p>
            <div className="space-y-2">
              {ilIndices.map((index) => (
                <IndexRow
                  key={index.id}
                  index={index}
                  periodId={periodId}
                  liveQuote={liveQuoteFor(index.id, liveQuotesBySymbol)}
                />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              ארה&quot;ב
            </p>
            <div className="space-y-2">
              {globalIndices.map((index) => (
                <IndexRow
                  key={index.id}
                  index={index}
                  periodId={periodId}
                  liveQuote={liveQuoteFor(index.id, liveQuotesBySymbol)}
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {categoryIndices.map((index) => (
            <IndexRow
              key={index.id}
              index={index}
              periodId={periodId}
              liveQuote={liveQuoteFor(index.id, liveQuotesBySymbol)}
              onClick={categoryId === "sectors" ? () => setOpenSector(index) : undefined}
            />
          ))}
        </div>
      )}

      {categoryId === "sectors" && (
        <p className="mt-3 text-[11px] text-slate-500">
          לחצו על סקטור כדי לפתוח מפת חום של המניות המרכזיות בתעודת הסל שלו.
        </p>
      )}
      {categoryId !== "main" && categoryId !== "sectors" && (
        <p className="mt-3 text-[11px] text-slate-500">
          שורות עם תג &quot;חי&quot; מציגות רמה נוכחית ותשואה יומית חיה (Finnhub); שאר הנתונים
          (תשואות תקופות אחרות, מכפילים) הם דמה להדגמת המסך.
        </p>
      )}

      {openSector && (
        <SectorHeatmapModal
          etfId={openSector.id}
          etfLabel={openSector.labelHe}
          onClose={() => setOpenSector(null)}
        />
      )}
    </section>
  );
}

// Resolves an index/ETF row's live quote (if this id maps to a
// Finnhub-quotable symbol AND that symbol's batch fetch actually
// succeeded this round) — undefined otherwise, in which case the row
// just shows its mock valuePts/returns as before.
function liveQuoteFor(
  indexId: string,
  liveQuotesBySymbol: Record<string, LiveIndexQuote>
): LiveIndexQuote | undefined {
  const symbol = LIVE_INDEX_SYMBOLS[indexId];
  if (!symbol) return undefined;
  return liveQuotesBySymbol[symbol];
}

function IndexRow({
  index,
  periodId,
  liveQuote,
  onClick,
}: {
  index: IndexQuote;
  periodId: IndexPeriodOption["id"];
  liveQuote?: LiveIndexQuote;
  onClick?: () => void;
}) {
  // Live data only replaces the current level and, when the "יומי" period
  // is selected, the daily return — the other periods' returns (weekly/
  // quarterly/YTD/yearly/5y) have no live source here and stay mock, same
  // as the P/E ratios below.
  const displayValue = liveQuote ? liveQuote.price : index.valuePts;
  const returnPct = liveQuote && periodId === "daily" ? liveQuote.dayChangePct : index.returns[periodId];
  const isUp = returnPct >= 0;
  // P/E and forward P/E are omitted for regions with no earnings-based
  // multiple at all (bonds, commodities) and for the VIX — see IndexQuote.
  const hasMultiples = index.peRatio !== undefined && index.forwardPeRatio !== undefined;
  const content = (
    <>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
          {index.labelHe}
          {liveQuote && (
            <span className="rounded-full bg-positive/15 px-1.5 py-0.5 text-[10px] font-semibold text-positive">
              חי
            </span>
          )}
        </span>
        <div className="text-left">
          <span className="text-sm text-slate-500">{displayValue.toLocaleString("he-IL")}</span>
          <span
            className={clsx(
              "ms-2 text-sm font-semibold",
              isUp ? "text-positive" : "text-negative"
            )}
          >
            {formatPct(returnPct)}
          </span>
        </div>
      </div>
      {hasMultiples && (
        <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500">
          <span>מכפיל רווח: {index.peRatio!.toFixed(1)}</span>
          <span>מכפיל רווח עתידי: {index.forwardPeRatio!.toFixed(1)}</span>
        </div>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex w-full flex-col rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-right transition hover:border-brand-500/50 hover:bg-surface-raised/70"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="flex flex-col rounded-lg border border-surface-border bg-surface-raised px-3 py-2">
      {content}
    </div>
  );
}
