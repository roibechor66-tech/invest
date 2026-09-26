"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";

// Live USD/ILS rate, backed by GET /api/market-data/fx-rate (Finnhub via
// backend/app/services/market_data.py). Used anywhere a ticker's price or
// a shekel investment amount needs converting to/from USD — the frontend
// counterpart of backend/app/routers/portfolio.py::_resolve_usd_ils_rate.
// Falls back to the fixed USD_ILS_RATE constant (frontend/lib/mock-data/
// stock-prices.ts) when a live rate isn't available; callers should do
// that fallback themselves (rate comes back null here) so they can also
// flag it to the user, same as PortfolioSummaryCard does with
// fxRateIsLive.

interface RawFxRateResponse {
  base: string;
  quote: string;
  rate: number;
}

interface UseLiveFxRateResult {
  rate: number | null;
  isLoading: boolean;
  error: string | null;
}

// FX moves far slower than a single stock quote, and the backend itself
// caches it for 5 minutes (see market_data.py) — polling faster than
// that would just re-fetch the same cached value.
const REFRESH_INTERVAL_MS = 60_000;

export function useLiveFxRate(): UseLiveFxRateResult {
  const [rate, setRate] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchRate() {
      try {
        const raw = await apiFetch<RawFxRateResponse>("/api/market-data/fx-rate");
        if (cancelled) return;
        setRate(raw.rate);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "שליפת שער חליפין חי נכשלה");
        setRate(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchRate();
    const interval = setInterval(fetchRate, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { rate, isLoading, error };
}
