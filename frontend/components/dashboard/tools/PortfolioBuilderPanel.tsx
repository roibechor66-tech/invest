"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import clsx from "clsx";
import { FormField } from "@/components/dashboard/tools/FormField";
import { AddPositionModal } from "@/components/dashboard/tools/AddPositionModal";
import { PortfolioPieChart, PieSlice } from "@/components/dashboard/tools/PortfolioPieChart";
import { usePortfolio } from "@/lib/portfolio-context";
import { BuiltPortfolio, BuiltPosition } from "@/lib/types";

const SLICE_COLORS = [
  "#60a5fa",
  "#34c77b",
  "#f0576a",
  "#f59e0b",
  "#a78bfa",
  "#22d3ee",
  "#fb923c",
  "#4ade80",
  "#f472b6",
  "#818cf8",
];
const CASH_COLOR = "#475569";
const OTHER_COLOR = "#94a3b8";

// Special, always-present, non-removable tab id showing the user's real,
// actual portfolio (backed by the persisted backend, via portfolio-context)
// rather than a built one.
const MY_PORTFOLIO_ID = "__my_portfolio__";

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function makePortfolio(name: string): BuiltPortfolio {
  return { id: makeId(), name, sizeUsd: 0, positions: [] };
}

// Adding a position that's already in the list accumulates into it
// instead of creating a duplicate row — shared by the built portfolios
// and by "התיק שלי", since both let the user add stocks the same way.
function mergePosition(positions: BuiltPosition[], position: BuiltPosition): BuiltPosition[] {
  const existingIndex = positions.findIndex((x) => x.ticker === position.ticker);
  if (existingIndex < 0) return [...positions, position];
  return positions.map((x, i) => {
    if (i !== existingIndex) return x;
    // The USD total always accumulates. If the currency matches the
    // existing entry, the original-currency total accumulates too;
    // otherwise (rare — e.g. added once in ₪, then again in $) we fall
    // back to just showing the combined USD-equivalent.
    const sameCurrency = x.currency === position.currency;
    return {
      ...x,
      amountUsd: x.amountUsd + position.amountUsd,
      currency: sameCurrency ? x.currency : "USD",
      amountOriginal: sameCurrency
        ? x.amountOriginal + position.amountOriginal
        : x.amountUsd + position.amountUsd,
    };
  });
}

// Portfolio Builder: a "התיק שלי" tab shows the user's real portfolio as
// a pie chart (stock/sector view); alongside it, users can build and
// switch between several of their own hypothetical portfolios — define
// a size, add stocks one at a time (search → price → dollar amount),
// watch remaining cash shrink, then see the built portfolio the same
// way. All state lives in this component for now (Phase 1/2 mock data)
// — Phase 3 will persist built portfolios to the backend instead.
export function PortfolioBuilderPanel() {
  const [portfolios, setPortfolios] = useState<BuiltPortfolio[]>([makePortfolio("תיק 1")]);
  const [activeId, setActiveId] = useState<string>(MY_PORTFOLIO_ID);
  const [newPortfolioName, setNewPortfolioName] = useState("");
  const [sizeInput, setSizeInput] = useState("");
  const [isAddingStock, setIsAddingStock] = useState(false);
  const [view, setView] = useState<"stocks" | "sectors">("stocks");

  // "התיק שלי" starts out matching the real portfolio shown elsewhere in
  // the dashboard, but — unlike that read-only summary — can be edited
  // here: stocks can be removed or added. This state lives in the shared
  // portfolio context (not locally) precisely so that an edit here shows
  // up immediately in the main dashboard's portfolio summary card too.
  const {
    positions: myPositions,
    cashUsd: myCashUsd,
    otherUsd: myOtherUsd,
    totalUsd: myTotalUsd,
    addPosition: addMyPosition,
    removePosition: removeMyPosition,
    depositCash,
    isLoading: isMyPortfolioLoading,
    loadError: myPortfolioLoadError,
  } = usePortfolio();
  const [removeError, setRemoveError] = useState<string | null>(null);

  // "התיק שלי" starts out with $0 cash and no way to fund it — this is
  // that step (equivalent to the built portfolios' handleSetSize above,
  // except additive: depositing again tops the real portfolio up rather
  // than resetting a target size). Kept visible even once the portfolio
  // has money in it, so a user can add more later, not just once.
  const [depositAmount, setDepositAmount] = useState("");
  const [depositCurrency, setDepositCurrency] = useState<"USD" | "ILS">("USD");
  const [isDepositing, setIsDepositing] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);

  async function handleDeposit() {
    const amount = Number(depositAmount);
    if (!amount || amount <= 0) return;
    setDepositError(null);
    setIsDepositing(true);
    try {
      await depositCash(amount, depositCurrency);
      setDepositAmount("");
    } catch (err) {
      setDepositError(err instanceof Error ? err.message : "הפקדת המזומן נכשלה, נסו שוב");
    } finally {
      setIsDepositing(false);
    }
  }

  const isMyPortfolio = activeId === MY_PORTFOLIO_ID;
  const active = portfolios.find((p) => p.id === activeId) ?? portfolios[0];

  const investedUsd = !isMyPortfolio ? active.positions.reduce((sum, p) => sum + p.amountUsd, 0) : 0;
  const cashUsd = !isMyPortfolio ? Math.max(active.sizeUsd - investedUsd, 0) : 0;
  const cashPct = !isMyPortfolio && active.sizeUsd ? (cashUsd / active.sizeUsd) * 100 : 0;

  function updateActive(update: (portfolio: BuiltPortfolio) => BuiltPortfolio) {
    setPortfolios((prev) => prev.map((p) => (p.id === active.id ? update(p) : p)));
  }

  function handleSetSize() {
    const size = Number(sizeInput);
    if (!size || size <= 0) return;
    updateActive((p) => ({ ...p, sizeUsd: size }));
  }

  function handleAddPortfolio() {
    const name = newPortfolioName.trim() || `תיק ${portfolios.length + 1}`;
    const portfolio = makePortfolio(name);
    setPortfolios((prev) => [...prev, portfolio]);
    setActiveId(portfolio.id);
    setNewPortfolioName("");
  }

  function handleRemovePortfolio(id: string) {
    setPortfolios((prev) => {
      const next = prev.filter((p) => p.id !== id);
      if (next.length === 0) {
        const fresh = makePortfolio("תיק 1");
        setActiveId(fresh.id);
        return [fresh];
      }
      if (id === activeId) setActiveId(next[0].id);
      return next;
    });
  }

  function handleAddPosition(position: BuiltPosition) {
    updateActive((p) => ({ ...p, positions: mergePosition(p.positions, position) }));
  }

  function handleRemovePosition(ticker: string) {
    updateActive((p) => ({ ...p, positions: p.positions.filter((x) => x.ticker !== ticker) }));
  }

  // Left async and un-caught here on purpose: AddPositionModal itself
  // awaits this, shows the error inline, and only closes on success — see
  // its handleAdd. Don't close the modal from here.
  async function handleAddMyPosition(position: BuiltPosition) {
    await addMyPosition(position);
  }

  async function handleRemoveMyPosition(ticker: string) {
    setRemoveError(null);
    try {
      await removeMyPosition(ticker);
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : "הסרת המניה נכשלה, נסו שוב");
    }
  }

  // Built-portfolio slices (dollar amounts)
  const stockSlices: PieSlice[] = active.positions.map((p, i) => ({
    label: p.ticker,
    value: p.amountUsd,
    color: SLICE_COLORS[i % SLICE_COLORS.length],
  }));
  if (cashUsd > 0) stockSlices.push({ label: "מזומן", value: cashUsd, color: CASH_COLOR });

  const sectorTotals = new Map<string, number>();
  active.positions.forEach((p) => {
    sectorTotals.set(p.sectorNameHe, (sectorTotals.get(p.sectorNameHe) ?? 0) + p.amountUsd);
  });
  const sectorSlices: PieSlice[] = [...sectorTotals.entries()].map(([label, value], i) => ({
    label,
    value,
    color: SLICE_COLORS[i % SLICE_COLORS.length],
  }));
  if (cashUsd > 0) sectorSlices.push({ label: "מזומן", value: cashUsd, color: CASH_COLOR });

  // "התיק שלי" (real portfolio, now editable) slices — built from the
  // live myPositions/myCashUsd/myOtherUsd state above rather than
  // straight from mockPortfolioSummary, so removing/adding a stock is
  // reflected immediately.
  const myStockSlices: PieSlice[] = myPositions.map((p, i) => ({
    label: p.ticker,
    value: p.amountUsd,
    color: SLICE_COLORS[i % SLICE_COLORS.length],
  }));
  if (myCashUsd > 0) myStockSlices.push({ label: "מזומן", value: myCashUsd, color: CASH_COLOR });
  if (myOtherUsd > 0.5) myStockSlices.push({ label: "נכסים נוספים", value: myOtherUsd, color: OTHER_COLOR });

  const mySectorTotals = new Map<string, number>();
  myPositions.forEach((p) => {
    mySectorTotals.set(p.sectorNameHe, (mySectorTotals.get(p.sectorNameHe) ?? 0) + p.amountUsd);
  });
  const mySectorSlices: PieSlice[] = [...mySectorTotals.entries()].map(([label, value], i) => ({
    label,
    value,
    color: SLICE_COLORS[i % SLICE_COLORS.length],
  }));
  if (myCashUsd > 0) mySectorSlices.push({ label: "מזומן", value: myCashUsd, color: CASH_COLOR });
  if (myOtherUsd > 0.5) mySectorSlices.push({ label: "נכסים נוספים", value: myOtherUsd, color: OTHER_COLOR });

  return (
    <div className="space-y-4">
      {/* Tabs: the real portfolio, plus any built portfolios */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveId(MY_PORTFOLIO_ID)}
          className={clsx(
            "rounded-lg border px-3 py-1.5 text-xs font-semibold",
            isMyPortfolio
              ? "border-brand-500 bg-brand-500/10 text-brand-400"
              : "border-surface-border bg-surface-raised text-slate-500 hover:border-brand-500/40"
          )}
        >
          התיק שלי
        </button>
        {portfolios.map((p) => (
          <div key={p.id} className="flex items-center">
            <button
              type="button"
              onClick={() => setActiveId(p.id)}
              className={clsx(
                "rounded-r-lg rounded-l-none border px-3 py-1.5 text-xs font-semibold",
                p.id === activeId
                  ? "border-brand-500 bg-brand-500/10 text-brand-400"
                  : "border-surface-border bg-surface-raised text-slate-500 hover:border-brand-500/40"
              )}
              style={{ borderRadius: "8px 0 0 8px" }}
            >
              {p.name}
            </button>
            {portfolios.length > 1 && (
              <button
                type="button"
                onClick={() => handleRemovePortfolio(p.id)}
                aria-label={`מחקו את ${p.name}`}
                className={clsx(
                  "rounded-l-lg rounded-r-none border border-r-0 px-1.5 py-1.5 text-slate-500 hover:text-negative",
                  p.id === activeId ? "border-brand-500 bg-brand-500/10" : "border-surface-border bg-surface-raised"
                )}
                style={{ borderRadius: "0 8px 8px 0" }}
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={newPortfolioName}
          onChange={(e) => setNewPortfolioName(e.target.value)}
          placeholder="שם לתיק חדש (לא חובה)"
          className="flex-1 rounded-lg border border-surface-border bg-surface-raised px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-brand-500"
        />
        <button
          type="button"
          onClick={handleAddPortfolio}
          className="flex items-center gap-1 rounded-lg border border-surface-border bg-surface-raised px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-brand-500/40"
        >
          <Plus size={13} />
          תיק חדש
        </button>
      </div>

      <div className="border-t border-surface-border" />

      {isMyPortfolio && isMyPortfolioLoading ? (
        <p className="text-sm text-slate-500">טוען את התיק שלכם...</p>
      ) : isMyPortfolio && myPortfolioLoadError ? (
        <p className="text-sm text-negative">שגיאה בטעינת התיק: {myPortfolioLoadError}</p>
      ) : isMyPortfolio ? (
        <>
          <p className="text-sm text-slate-500">
            זהו התיק האמיתי שלכם, כפי שהוא מוצג בכרטיס התיק בדף הראשי —
            הפקידו מזומן כדי להתחיל (ואפשר גם בהמשך, בכל שלב), ואז הוסיפו או
            הסירו אחזקות; הסרה מחזירה את הסכום למזומן הפנוי, הוספה מנוכה
            ממנו.
          </p>

          {removeError && <p className="text-sm text-negative">{removeError}</p>}

          <div className="flex items-end gap-2 rounded-lg border border-surface-border bg-surface-raised p-3">
            <div className="flex-1">
              <FormField
                label={myTotalUsd > 0 ? "הפקדת מזומן נוספת" : "כמה כסף רוצים להפקיד בתיק?"}
                value={depositAmount}
                onChange={setDepositAmount}
                placeholder="1000"
              />
            </div>
            <select
              value={depositCurrency}
              onChange={(e) => setDepositCurrency(e.target.value as "USD" | "ILS")}
              className="h-[38px] rounded-lg border border-surface-border bg-surface-raised px-2 text-sm text-slate-900 outline-none focus:border-brand-500"
            >
              <option value="USD">$</option>
              <option value="ILS">₪</option>
            </select>
            <button
              type="button"
              onClick={handleDeposit}
              disabled={isDepositing}
              className="h-[38px] rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {isDepositing ? "מפקיד..." : "הפקידו"}
            </button>
          </div>
          {depositError && <p className="text-sm text-negative">{depositError}</p>}

          <div className="flex items-center justify-between rounded-lg border border-surface-border bg-surface-raised p-3">
            <div>
              <p className="text-xs text-slate-500">שווי תיק כולל</p>
              <p className="text-sm font-bold text-slate-900">
                ${myTotalUsd.toLocaleString("he-IL", { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">מזומן פנוי</p>
              <p className="text-sm font-bold text-slate-900">
                ${myCashUsd.toFixed(0)}
                <span className="mr-1 text-xs font-normal text-slate-500">
                  ({myTotalUsd ? ((myCashUsd / myTotalUsd) * 100).toFixed(1) : "0.0"}%)
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsAddingStock(true)}
              aria-label="הוספת מניה"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-white hover:bg-brand-600"
            >
              <Plus size={18} />
            </button>
          </div>

          {myPositions.length > 0 ? (
            <div className="space-y-1.5">
              {myPositions.map((p) => (
                <div
                  key={p.ticker}
                  className="flex items-center justify-between rounded-lg border border-surface-border bg-surface-raised px-3 py-2"
                >
                  <div>
                    <span className="text-sm font-semibold text-slate-800">{p.ticker}</span>
                    <span className="mr-2 text-xs text-slate-500">{p.nameHe}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-700">
                      {p.currency === "ILS" ? "₪" : "$"}
                      {p.amountOriginal.toFixed(0)}
                    </span>
                    <span className="text-xs text-slate-500">
                      {(myTotalUsd ? (p.amountUsd / myTotalUsd) * 100 : 0).toFixed(1)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveMyPosition(p.ticker)}
                      aria-label={`הסירו את ${p.ticker}`}
                      className="text-slate-500 hover:text-negative"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">אין כרגע אחזקות בתיק. לחצו על + כדי להוסיף.</p>
          )}

          <div className="border-t border-surface-border pt-3">
            <div className="mb-3 flex gap-2">
              <button
                type="button"
                onClick={() => setView("stocks")}
                className={clsx(
                  "rounded-full px-3 py-1 text-xs font-semibold",
                  view === "stocks" ? "bg-brand-500 text-white" : "bg-surface-raised text-slate-500"
                )}
              >
                תצוגה מנייתית
              </button>
              <button
                type="button"
                onClick={() => setView("sectors")}
                className={clsx(
                  "rounded-full px-3 py-1 text-xs font-semibold",
                  view === "sectors" ? "bg-brand-500 text-white" : "bg-surface-raised text-slate-500"
                )}
              >
                תצוגה סקטוריאלית
              </button>
            </div>
            <div className="flex justify-center py-2">
              <PortfolioPieChart
                slices={view === "stocks" ? myStockSlices : mySectorSlices}
                variant={view === "stocks" ? "labeled" : "legend"}
              />
            </div>
          </div>
        </>
      ) : active.sizeUsd <= 0 ? (
        <div>
          <p className="mb-2 text-sm text-slate-500">
            קודם כל, כמה כסף רוצים להשקיע בתיק &quot;{active.name}&quot;?
          </p>
          <div className="flex gap-2">
            <div className="flex-1">
              <FormField label="גודל התיק ($)" value={sizeInput} onChange={setSizeInput} />
            </div>
            <button
              type="button"
              onClick={handleSetSize}
              className="mt-5 h-[38px] rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600"
            >
              הגדירו גודל
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-lg border border-surface-border bg-surface-raised p-3">
            <div>
              <p className="text-xs text-slate-500">גודל התיק</p>
              <p className="text-sm font-bold text-slate-900">
                ${active.sizeUsd.toLocaleString("he-IL")}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">מזומן פנוי</p>
              <p className="text-sm font-bold text-slate-900">
                ${cashUsd.toFixed(0)}
                <span className="mr-1 text-xs font-normal text-slate-500">
                  ({cashPct.toFixed(1)}%)
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsAddingStock(true)}
              aria-label="הוספת מניה"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-white hover:bg-brand-600"
            >
              <Plus size={18} />
            </button>
          </div>

          {active.positions.length > 0 ? (
            <>
              <div className="space-y-1.5">
                {active.positions.map((p) => (
                  <div
                    key={p.ticker}
                    className="flex items-center justify-between rounded-lg border border-surface-border bg-surface-raised px-3 py-2"
                  >
                    <div>
                      <span className="text-sm font-semibold text-slate-800">{p.ticker}</span>
                      <span className="mr-2 text-xs text-slate-500">{p.nameHe}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-slate-700">
                        {p.currency === "ILS" ? "₪" : "$"}
                        {p.amountOriginal.toFixed(0)}
                      </span>
                      <span className="text-xs text-slate-500">
                        {((p.amountUsd / active.sizeUsd) * 100).toFixed(1)}%
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemovePosition(p.ticker)}
                        aria-label={`הסירו את ${p.ticker}`}
                        className="text-slate-500 hover:text-negative"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-surface-border pt-3">
                <div className="mb-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setView("stocks")}
                    className={clsx(
                      "rounded-full px-3 py-1 text-xs font-semibold",
                      view === "stocks" ? "bg-brand-500 text-white" : "bg-surface-raised text-slate-500"
                    )}
                  >
                    תצוגה מנייתית
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("sectors")}
                    className={clsx(
                      "rounded-full px-3 py-1 text-xs font-semibold",
                      view === "sectors" ? "bg-brand-500 text-white" : "bg-surface-raised text-slate-500"
                    )}
                  >
                    תצוגה סקטוריאלית
                  </button>
                </div>
                <div className="flex justify-center py-2">
                  <PortfolioPieChart
                    slices={view === "stocks" ? stockSlices : sectorSlices}
                    variant={view === "stocks" ? "labeled" : "legend"}
                  />
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">
              עדיין אין מניות בתיק. לחצו על + כדי להוסיף את הראשונה.
            </p>
          )}
        </>
      )}

      {isAddingStock && (
        <AddPositionModal
          remainingCashUsd={isMyPortfolio ? myCashUsd : cashUsd}
          onAdd={isMyPortfolio ? handleAddMyPosition : handleAddPosition}
          onClose={() => setIsAddingStock(false)}
        />
      )}
    </div>
  );
}
