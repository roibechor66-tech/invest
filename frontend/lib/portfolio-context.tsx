"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { BuiltPosition, PortfolioSummaryData } from "@/lib/types";

// A holding in the user's real, editable portfolio: everything a
// built-portfolio position has (ticker, sector, price, dollar amount,
// currency), plus the extra fields the main dashboard's holdings table
// needs (quantity, average cost, day change%) that a hypothetical
// built portfolio doesn't track.
export interface MyPortfolioPosition extends BuiltPosition {
  quantity: number;
  avgCost: number;
  dayChangePct: number;
  // Phase 3, live market data: false means `price`/`dayChangePct` are the
  // avg-cost/0% fallback (no live quote — missing API key, unrecognized
  // ticker, or the upstream call failed), not a real quote. See
  // backend/app/services/market_data.py.
  priceIsLive: boolean;
}

// Raw shapes returned by /api/portfolio/* (backend uses snake_case
// throughout, matching every other router in this app — see e.g.
// PositionSizeResponse). Kept private to this file; everything else in
// the app keeps using the camelCase types above/in lib/types.ts.
interface RawPortfolioPosition {
  ticker: string;
  name_he: string;
  sector_name_he: string;
  currency: "USD" | "ILS";
  amount_original: number;
  amount_usd: number;
  quantity: number;
  avg_cost: number;
  price: number;
  day_change_pct: number;
  price_is_live: boolean;
  weight_pct: number;
}

interface RawPortfolioState {
  cash_usd: number;
  total_usd: number;
  day_change_pct: number;
  day_change_usd: number;
  positions: RawPortfolioPosition[];
  fx_rate_is_live: boolean;
}

function toMyPosition(raw: RawPortfolioPosition): MyPortfolioPosition {
  return {
    ticker: raw.ticker,
    nameHe: raw.name_he,
    sectorNameHe: raw.sector_name_he,
    price: raw.price,
    amountUsd: raw.amount_usd,
    currency: raw.currency,
    amountOriginal: raw.amount_original,
    quantity: raw.quantity,
    avgCost: raw.avg_cost,
    dayChangePct: raw.day_change_pct,
    priceIsLive: raw.price_is_live,
  };
}

interface PortfolioContextValue {
  positions: MyPortfolioPosition[];
  cashUsd: number;
  // Kept for compatibility with the Portfolio Builder's pie-chart code,
  // which adds an "other assets" slice when this is above zero. A real,
  // persisted portfolio has no such gap (unlike the old mock data, whose
  // total didn't quite add up to the sum of its listed holdings) — always
  // 0 now, but the field stays so that code doesn't need to change.
  otherUsd: number;
  totalUsd: number;
  // The same shape mockPortfolioSummary used to be — this is what the
  // main dashboard's PortfolioSummaryCard (and anything else showing
  // "the real portfolio") renders, so an edit in the Portfolio Builder's
  // "התיק שלי" tab shows up there instantly.
  summary: PortfolioSummaryData;
  isLoading: boolean;
  loadError: string | null;
  addPosition: (position: BuiltPosition) => Promise<void>;
  removePosition: (ticker: string) => Promise<void>;
  // "Define your portfolio size" for the real portfolio: a brand-new one
  // starts at cash_usd=0, so this is how a user funds it for the first
  // time (and can keep topping it up later — see backend's POST
  // /api/portfolio/cash). Without this there was no way to add a first
  // position at all: the add-position flow always failed with "amount
  // exceeds the portfolio's free cash ($0)".
  depositCash: (amount: number, currency: "USD" | "ILS") => Promise<void>;
  // Phase 3, live market data: false means the USD/ILS conversion behind
  // totalUsd/amountUsd above used the fixed fallback rate, not a live
  // Finnhub rate (see backend/app/routers/portfolio.py::_resolve_usd_ils_rate).
  fxRateIsLive: boolean;
}

const PortfolioContext = createContext<PortfolioContextValue | undefined>(undefined);

const EMPTY_STATE: RawPortfolioState = {
  cash_usd: 0,
  total_usd: 0,
  day_change_pct: 0,
  day_change_usd: 0,
  positions: [],
  fx_rate_is_live: true,
};

// Shared, app-wide state for the user's real portfolio (as opposed to a
// hypothetical one built in the Portfolio Builder). Phase 3: this is now
// backed by the real backend (a Portfolio row per user, created empty on
// first access) instead of client-only state — a refresh, a different
// device, or logging back in tomorrow all show the same portfolio, and
// every place that reads it (the main dashboard's summary card, the
// Portfolio Builder's "התיק שלי" tab) re-renders as soon as the request
// that changed it resolves, since they all read from this one context.
export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RawPortfolioState>(EMPTY_STATE);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<RawPortfolioState>("/api/portfolio/me")
      .then((data) => {
        if (!cancelled) setState(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof ApiError ? err.message : "טעינת התיק נכשלה");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function addPosition(position: BuiltPosition) {
    const updated = await apiFetch<RawPortfolioState>("/api/portfolio/positions", {
      method: "POST",
      body: JSON.stringify({
        ticker: position.ticker,
        name_he: position.nameHe,
        sector_name_he: position.sectorNameHe,
        currency: position.currency,
        amount_original: position.amountOriginal,
        price: position.price,
      }),
    });
    setState(updated);
  }

  async function depositCash(amount: number, currency: "USD" | "ILS") {
    const updated = await apiFetch<RawPortfolioState>("/api/portfolio/cash", {
      method: "POST",
      body: JSON.stringify({ amount, currency }),
    });
    setState(updated);
  }

  async function removePosition(ticker: string) {
    const updated = await apiFetch<RawPortfolioState>(
      `/api/portfolio/positions/${encodeURIComponent(ticker)}`,
      { method: "DELETE" }
    );
    setState(updated);
  }

  const positions = state.positions.map(toMyPosition);

  const summary: PortfolioSummaryData = {
    totalValueUsd: state.total_usd,
    dayChangePct: state.day_change_pct,
    dayChangeUsd: state.day_change_usd,
    cashPct: state.total_usd ? (state.cash_usd / state.total_usd) * 100 : 0,
    holdings: state.positions.map((p) => ({
      ticker: p.ticker,
      nameHe: p.name_he,
      sectorNameHe: p.sector_name_he,
      quantity: p.quantity,
      avgCost: p.avg_cost,
      lastPrice: p.price,
      weightPct: p.weight_pct,
      dayChangePct: p.day_change_pct,
      currency: p.currency,
      priceIsLive: p.price_is_live,
    })),
    fxRateIsLive: state.fx_rate_is_live,
  };

  return (
    <PortfolioContext.Provider
      value={{
        positions,
        cashUsd: state.cash_usd,
        otherUsd: 0,
        totalUsd: state.total_usd,
        summary,
        isLoading,
        loadError,
        addPosition,
        removePosition,
        depositCash,
        fxRateIsLive: state.fx_rate_is_live,
      }}
    >
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio(): PortfolioContextValue {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error("usePortfolio must be used within a PortfolioProvider");
  return ctx;
}
