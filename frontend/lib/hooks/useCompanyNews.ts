"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";

// Real recent news for one company — GET /api/market-data/news/{ticker}
// (Finnhub; see backend app/services/market_data.py::get_company_news).
// Replaces the stock card's fixed mock news, whose links went to
// example.com. Headlines are shown as the publisher wrote them.

export interface CompanyNewsItem {
  headline: string;
  source: string;
  url: string;
  publishedAtIso: string;
  summary: string;
}

interface RawCompanyNewsItem {
  headline: string;
  source: string;
  url: string;
  published_at_iso: string;
  summary: string;
}

export function useCompanyNews(ticker: string | null) {
  const [news, setNews] = useState<CompanyNewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ticker) {
      setNews([]);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    apiFetch<RawCompanyNewsItem[]>(`/api/market-data/news/${encodeURIComponent(ticker)}`)
      .then((raw) => {
        if (cancelled) return;
        setNews(
          raw.map((item) => ({
            headline: item.headline,
            source: item.source,
            url: item.url,
            publishedAtIso: item.published_at_iso,
            summary: item.summary,
          }))
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setNews([]);
        setError(err instanceof ApiError ? err.message : "טעינת החדשות נכשלה");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  return { news, isLoading, error };
}

// "לפני 3 שעות" / "אתמול" / "לפני 4 ימים" from an ISO timestamp.
export function formatNewsAgeHe(iso: string): string {
  const published = new Date(iso).getTime();
  if (Number.isNaN(published)) return "";
  const hours = Math.max(0, Math.floor((Date.now() - published) / 3_600_000));
  if (hours < 1) return "לפני פחות משעה";
  if (hours < 24) return hours === 1 ? "לפני שעה" : `לפני ${hours} שעות`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "אתמול";
  return `לפני ${days} ימים`;
}
