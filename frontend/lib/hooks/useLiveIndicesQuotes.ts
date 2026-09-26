"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

// Backs the "מדדים נבחרים" (watched-indices) card's live level + live
// daily % change for the subset of rows that map to a real ETF ticker
// (see lib/live-index-symbols.ts for which ones, and why not all of
// them). Backed by GET /api/market-data/quotes?symbols=... (Finnhub via
// backend/app/services/market_data.py's batch lookup) — one request for
// every mapped symbol at once, instead of one per row.

export interface LiveIndexQuote {
  price: number;
  dayChangePct: number;
}

interface RawQuoteResponse {
  ticker: string;
  price: number;
  previous_close: number;
  day_change_pct: number;
}

// 60s, not the 15s used for a single quote (useLiveQuote) — this fetches
// ~29 symbols at once, and refreshing that batch every 15s would burn a
// meaningful chunk of Finnhub's free-tier 60-calls/minute quota just for
// this one card, shared across however many people have the dashboard
// open. A price index level doesn't need to be fresher than a minute for
// a "watched indices" overview card.
const REFRESH_INTERVAL_MS = 60_000;

// Keyed by ticker symbol (e.g. "SPY"), not by the mockIndices `id`
// (e.g. "sp500") — the caller maps id -> symbol -> this result itself,
// since several ids could in principle share a symbol.
export function useLiveIndicesQuotes(symbols: string[]): Record<string, LiveIndexQuote> {
  const [quotes, setQuotes] = useState<Record<string, LiveIndexQuote>>({});
  // Joined so the effect only re-runs when the actual set of symbols
  // changes, not on every render of a new array with the same contents.
  const symbolsKey = symbols.join(",");

  useEffect(() => {
    if (!symbolsKey) {
      setQuotes({});
      return;
    }

    let cancelled = false;

    async function fetchQuotes() {
      try {
        const raw = await apiFetch<RawQuoteResponse[]>(
          `/api/market-data/quotes?symbols=${encodeURIComponent(symbolsKey)}`
        );
        if (cancelled) return;
        const next: Record<string, LiveIndexQuote> = {};
        for (const q of raw) {
          next[q.ticker] = { price: q.price, dayChangePct: q.day_change_pct };
        }
        setQuotes(next);
      } catch {
        // Missing API key / upstream failure for the whole batch — the
        // card just keeps showing its mock figures for every row, same
        // as a single unmapped/failed symbol would. Not surfaced as an
        // error message; this is a best-effort enhancement, not a
        // required data source for this screen.
        if (!cancelled) setQuotes({});
      }
    }

    fetchQuotes();
    const interval = setInterval(fetchQuotes, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [symbolsKey]);

  return quotes;
}
