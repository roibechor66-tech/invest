"use client";

import { Fragment, useState } from "react";
import { mockEtfHoldings } from "@/lib/mock-data/etf-holdings";
import { mockStockDetails } from "@/lib/mock-data/stock-details";
import { StockDetailModal } from "@/components/dashboard/StockDetailModal";

interface SectorHeatmapModalProps {
  etfId: string;
  etfLabel: string;
  onClose: () => void;
}

function formatPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

// Color a heatmap tile by day-change magnitude, Finviz-style: green for
// gains, red for losses, intensity scaling with |change| up to a ±3%
// cap (beyond that the color no longer darkens further, so one outlier
// doesn't wash out the rest of the map).
function heatColor(changePct: number): string {
  const capped = Math.max(-3, Math.min(3, changePct));
  const intensity = Math.abs(capped) / 3; // 0..1
  if (changePct >= 0) {
    // Interpolate from a muted green to the app's positive green.
    const lightness = 42 - intensity * 14; // 42% -> 28%
    return `hsl(150, 55%, ${lightness}%)`;
  }
  const lightness = 42 - intensity * 14;
  return `hsl(352, 65%, ${lightness}%)`;
}

// Sector heatmap: opened by clicking a sector ETF tile in
// WatchedIndicesCard ("סקטורים" category). Shows that ETF's top
// holdings as a heatmap grid — tile size roughly follows the holding's
// weight in the ETF, tile color follows its day change (green/red,
// Finviz-style) — so the user can see at a glance which specific
// stocks are driving the sector's move. Mock top-holdings data (see
// lib/mock-data/etf-holdings.ts); Phase 3 would use a live ETF-holdings
// feed.
export function SectorHeatmapModal({ etfId, etfLabel, onClose }: SectorHeatmapModalProps) {
  const holdings = mockEtfHoldings[etfId] ?? [];
  const maxWeight = Math.max(...holdings.map((h) => h.weightPct), 1);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [notFoundTicker, setNotFoundTicker] = useState<string | null>(null);

  // Clicking a tile opens the exact same stock-detail view as searching a
  // ticker or clicking a portfolio holding elsewhere in the app. Phase 1/2's
  // mock database only has full detail data for a handful of tickers, so a
  // tile whose ticker isn't in it shows the same "not found" message as the
  // stock search bar instead of a broken/empty modal.
  function handleTileClick(ticker: string) {
    const match =
      mockStockDetails[ticker] ??
      Object.values(mockStockDetails).find((d) => d.ticker.toUpperCase() === ticker.toUpperCase());
    if (match) {
      setNotFoundTicker(null);
      setSelectedTicker(match.ticker);
    } else {
      setSelectedTicker(null);
      setNotFoundTicker(ticker);
    }
  }

  const selectedDetail = selectedTicker ? mockStockDetails[selectedTicker] : undefined;

  return (
    <Fragment>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-surface-border bg-surface-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">מפת חום — {etfLabel}</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              המניות המרכזיות בתעודת הסל, לפי משקל בתעודה ותנועת המחיר היומית
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור"
            className="text-lg leading-none text-slate-500 hover:text-slate-800"
          >
            ✕
          </button>
        </div>

        {holdings.length > 0 ? (
          <div className="mt-4 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {holdings.map((h) => {
              // Weight only drives a coarse visual size tier (not exact
              // proportional area — a simple 2/3-column-span grid keeps
              // this legible on mobile widths instead of a true
              // treemap layout).
              const isLarge = h.weightPct >= maxWeight * 0.5;
              return (
                <button
                  key={h.ticker}
                  type="button"
                  onClick={() => handleTileClick(h.ticker)}
                  className={`flex flex-col justify-between rounded-lg p-2.5 text-white text-right transition hover:ring-2 hover:ring-slate-300/60 ${
                    isLarge ? "col-span-2 min-h-[76px]" : "min-h-[64px]"
                  }`}
                  style={{ backgroundColor: heatColor(h.dayChangePct) }}
                  title={`${h.ticker} · ${h.nameHe} · משקל ${h.weightPct.toFixed(1)}% · ${formatPct(
                    h.dayChangePct
                  )}`}
                >
                  <div>
                    <p className="text-sm font-extrabold" dir="ltr">
                      {h.ticker}
                    </p>
                    <p className="truncate text-[11px] text-white/80">{h.nameHe}</p>
                  </div>
                  <div className="flex items-end justify-between">
                    <span className="text-[10px] text-white/70">{h.weightPct.toFixed(1)}%</span>
                    <span className="text-xs font-bold" dir="ltr">
                      {formatPct(h.dayChangePct)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">אין נתוני החזקות זמינים לתעודת הסל הזו.</p>
        )}

        {notFoundTicker && (
          <p className="mt-3 text-sm text-negative">
            הטיקר &quot;{notFoundTicker}&quot; לא נמצא במסד הדמו הנוכחי. חיפוש חי לכל
            טיקר יתווסף בשלב 3.
          </p>
        )}

        <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
          החזקות התעודה, המשקלים ותנועת המחיר היומית לעיל הם דמה להדגמת המסך
          (קירוב להרכב האמיתי של התעודה). בשלב 3 יחוברו למקור נתוני החזקות חי.
          לחיצה על מניה פותחת את דף הנתונים המלא שלה, בדיוק כמו בחיפוש מניות.
        </p>
      </div>
    </div>

    {selectedDetail && (
      <StockDetailModal detail={selectedDetail} onClose={() => setSelectedTicker(null)} />
    )}
    </Fragment>
  );
}
