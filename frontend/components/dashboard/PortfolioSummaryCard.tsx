"use client";

import { useState } from "react";
import clsx from "clsx";
import { buildStockDetailOrFallback } from "@/lib/mock-data/stock-details";
import { StockDetailModal } from "@/components/dashboard/StockDetailModal";
import { usePortfolio } from "@/lib/portfolio-context";

function formatUsd(value: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

// Top-of-dashboard snapshot: total portfolio value, day change, and a
// holdings table (with unrealized P&L% vs. cost). Clicking a row opens
// the stock detail modal (multiples, stage analysis, theses, news).
// Reads live from the shared portfolio context (rather than taking the
// data as a prop) so an edit made in the Portfolio Builder's "התיק שלי"
// tab — adding or removing a holding — is reflected here immediately.
export function PortfolioSummaryCard() {
  const { summary: data, isLoading, loadError } = usePortfolio();
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const isUp = data.dayChangePct >= 0;
  const selectedHolding = selectedTicker ? data.holdings.find((h) => h.ticker === selectedTicker) : undefined;
  // Every real holding gets a detail to show — even a ticker outside the
  // small curated mock universe (e.g. one only the live FMP/Finnhub data
  // covers) — instead of silently doing nothing when clicked (see
  // buildStockDetailOrFallback's comment).
  const selectedDetail = selectedHolding
    ? buildStockDetailOrFallback(selectedHolding.ticker, selectedHolding.nameHe, selectedHolding.sectorNameHe ?? "לא מסווג")
    : undefined;

  if (isLoading) {
    return (
      <section className="rounded-xl border border-surface-border bg-surface-card p-5 shadow-sm">
        <p className="text-sm text-slate-500">טוען תיק...</p>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="rounded-xl border border-surface-border bg-surface-card p-5 shadow-sm">
        <p className="text-sm text-negative">שגיאה בטעינת התיק: {loadError}</p>
      </section>
    );
  }

  if (data.holdings.length === 0) {
    return (
      <section className="rounded-xl border border-surface-border bg-surface-card p-5 shadow-sm">
        <p className="text-sm text-slate-500">
          עדיין אין לכם אחזקות בתיק. אפשר להוסיף מניה ראשונה דרך "הרכבת תיק השקעות" בהמשך הדף.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-surface-border bg-surface-card p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">שווי תיק כולל</p>
          <p className="text-3xl font-extrabold text-slate-900">
            {formatUsd(data.totalValueUsd)}
          </p>
        </div>
        <div className="text-left">
          <p
            className={clsx(
              "text-lg font-bold",
              isUp ? "text-positive" : "text-negative"
            )}
          >
            {formatPct(data.dayChangePct)} ({formatUsd(data.dayChangeUsd)})
          </p>
          <p className="text-sm text-slate-500">שינוי יומי</p>
        </div>
        <div className="text-left">
          <p className="text-lg font-bold text-slate-700">{data.cashPct.toFixed(1)}%</p>
          <p className="text-sm text-slate-500">מזומן בתיק</p>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-surface-border text-slate-500">
              <th className="py-2 text-start font-medium">נייר</th>
              <th className="py-2 text-start font-medium">כמות</th>
              <th className="py-2 text-start font-medium">מחיר קנייה ממוצע</th>
              <th className="py-2 text-start font-medium">מחיר אחרון</th>
              <th className="py-2 text-start font-medium">רווח/הפסד</th>
              <th className="py-2 text-start font-medium">משקל בתיק</th>
              <th className="py-2 text-start font-medium">שינוי יומי</th>
            </tr>
          </thead>
          <tbody>
            {data.holdings.map((holding) => {
              const pnlPct =
                ((holding.lastPrice - holding.avgCost) / holding.avgCost) * 100;
              // avgCost/lastPrice are quoted in this holding's own
              // currency (₪ for an Israeli stock added in shekels), even
              // though weightPct is always the USD-equivalent share of
              // the whole portfolio.
              const symbol = holding.currency === "ILS" ? "₪" : "$";
              return (
                <tr
                  key={holding.ticker}
                  onClick={() => setSelectedTicker(holding.ticker)}
                  className="cursor-pointer border-b border-surface-border/60 hover:bg-surface-raised"
                >
                  <td className="py-2">
                    <span className="font-semibold text-slate-900">
                      {holding.ticker}
                    </span>
                    <span className="ms-2 text-slate-500">{holding.nameHe}</span>
                  </td>
                  <td className="py-2 text-slate-500">{holding.quantity.toFixed(0)}</td>
                  <td className="py-2 text-slate-500">
                    {symbol}
                    {holding.avgCost.toFixed(2)}
                  </td>
                  <td className="py-2 text-slate-500">
                    {symbol}
                    {holding.lastPrice.toFixed(2)}
                    {holding.priceIsLive === false && (
                      <span
                        className="ms-1 text-[10px] font-medium text-amber-600"
                        title="אין כרגע ציטוט חי לנייר הזה — מוצג מחיר הקנייה הממוצע במקום מחיר עדכני"
                      >
                        (אין נתון חי)
                      </span>
                    )}
                  </td>
                  <td
                    className={clsx(
                      "py-2 font-medium",
                      pnlPct >= 0 ? "text-positive" : "text-negative"
                    )}
                  >
                    {formatPct(pnlPct)}
                  </td>
                  <td className="py-2 text-slate-500">{holding.weightPct.toFixed(1)}%</td>
                  <td
                    className={clsx(
                      "py-2 font-medium",
                      holding.dayChangePct >= 0 ? "text-positive" : "text-negative"
                    )}
                  >
                    {formatPct(holding.dayChangePct)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">לחצו על שורה כדי לראות פרטים מורחבים על הנייר</p>
      {data.fxRateIsLive === false && (
        <p className="mt-1 text-xs text-amber-600">
          שער USD/ILS החי אינו זמין כרגע — הערכים בדולר מחושבים לפי שער קבוע.
        </p>
      )}

      {selectedDetail && (
        <StockDetailModal detail={selectedDetail} onClose={() => setSelectedTicker(null)} />
      )}
    </section>
  );
}
