"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";

// Shared across every screen that used to auto-fill a price from
// mockPriceByTicker (frontend/lib/mock-data/stock-prices.ts) — the
// ticker search box, trade-risk/options/volatility-stop calculators,
// the stock detail modal and the scanner — so they all read the same
// live quote the same way instead of each re-implementing the fetch.
// Backed by GET /api/market-data/quote/{ticker} (Finnhub via
// backend/app/services/market_data.py).

export interface LiveQuote {
  ticker: string;
  price: number;
  previousClose: number;
  dayChangePct: number;
}

interface RawQuoteResponse {
  ticker: string;
  price: number;
  previous_close: number;
  day_change_pct: number;
}

interface UseLiveQuoteResult {
  quote: LiveQuote | null;
  isLoading: boolean;
  error: string | null;
}

// Default polling interval for the "real-time" feel a plain REST
// endpoint can give without a WebSocket feed (which would need testing
// against a live Finnhub key — this environment has no outbound network
// to finnhub.io to verify one, see CLAUDE.md). 15s keeps a single open
// screen's calls well inside Finnhub's free-tier 60-calls/minute quota
// (the backend's own short-TTL cache absorbs any faster re-renders).
// Callers that render MANY tickers at once (e.g. the scanner's watch-
// lists) should pass `refreshIntervalMs: null` to fetch once instead of
// polling each one — twenty cards each polling every 15s would burn
// through the per-key quota on their own.
const DEFAULT_REFRESH_INTERVAL_MS = 15_000;

interface UseLiveQuoteOptions {
  // null/0 disables polling — fetches once (still refetches if `ticker`
  // itself changes). Omit for the default 15s polling.
  refreshIntervalMs?: number | null;
}

// Fetches a live quote for `ticker` and, unless polling is disabled,
// refreshes it every `refreshIntervalMs` while `ticker` stays set and
// the component stays mounted. Pass an empty/null/undefined ticker to
// skip fetching (e.g. before the user has picked one) — `quote` stays
// null and `isLoading` stays false in that case.
export function useLiveQuote(
  ticker: string | null | undefined,
  options: UseLiveQuoteOptions = {}
): UseLiveQuoteResult {
  const refreshIntervalMs = options.refreshIntervalMs === undefined
    ? DEFAULT_REFRESH_INTERVAL_MS
    : options.refreshIntervalMs;

  const [quote, setQuote] = useState<LiveQuote | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ticker) {
      setQuote(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchQuote() {
      try {
        const raw = await apiFetch<RawQuoteResponse>(
          `/api/market-data/quote/${encodeURIComponent(ticker as string)}`
        );
        if (cancelled) return;
        setQuote({
          ticker: raw.ticker,
          price: raw.price,
          previousClose: raw.previous_close,
          dayChangePct: raw.day_change_pct,
        });
        setError(null);
      } catch (err) {
        if (cancelled) return;
        // Missing API key / unrecognized ticker / upstream failure — the
        // backend reports all three as a 502 with a clear Hebrew detail
        // message (see app/routers/market_data.py); surfaced as-is so the
        // caller can show it, or just treat `quote === null` as "fall
        // back to manual entry" without necessarily displaying the text.
        setError(err instanceof ApiError ? err.message : "שליפת ציטוט חי נכשלה");
        setQuote(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    setIsLoading(true);
    setError(null);
    fetchQuote();
    const interval = refreshIntervalMs ? setInterval(fetchQuote, refreshIntervalMs) : null;

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [ticker, refreshIntervalMs]);

  return { quote, isLoading, error };
}
