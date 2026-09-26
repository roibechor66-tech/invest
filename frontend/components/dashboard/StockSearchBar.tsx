"use client";

import { FormEvent, useState } from "react";
import { Search } from "lucide-react";
import { mockStockDetails } from "@/lib/mock-data/stock-details";
import { StockDetailModal } from "@/components/dashboard/StockDetailModal";
import { TickerSearchInput } from "@/components/dashboard/tools/TickerSearchInput";
import { getStockDetailSuggestions, TickerSuggestion } from "@/lib/ticker-search";

// Free-text ticker search: type any ticker and, if it's in the mock
// database, get the exact same detail view as clicking a portfolio
// holding (multiples, trends, stage, growth outlook, theses, news).
// Phase 1/2 only knows a handful of demo tickers; Phase 3 connects this
// to a real market-data lookup so any ticker resolves. An autocomplete
// dropdown suggests matching tickers as the user types (see
// lib/ticker-search.ts); pressing Enter (via the surrounding <form>) or
// clicking the search button both run the same lookup.
export function StockSearchBar() {
  const [query, setQuery] = useState("");
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);

  function runSearch(rawQuery: string) {
    const ticker = rawQuery.trim().toUpperCase();
    if (!ticker) return;

    const match =
      mockStockDetails[ticker] ??
      Object.values(mockStockDetails).find((d) => d.ticker.toUpperCase() === ticker);

    if (match) {
      setNotFound(null);
      setSelectedTicker(match.ticker);
    } else {
      setNotFound(ticker);
      setSelectedTicker(null);
    }
  }

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    runSearch(query);
  }

  function handleSelectSuggestion(suggestion: TickerSuggestion) {
    setQuery(suggestion.ticker);
    runSearch(suggestion.ticker);
  }

  const suggestions = getStockDetailSuggestions(query);
  const selectedDetail = selectedTicker ? mockStockDetails[selectedTicker] : undefined;

  return (
    <section className="rounded-xl border border-surface-border bg-surface-card p-5 shadow-sm">
      <h2 className="text-base font-bold text-slate-900">חיפוש מניות</h2>
      <p className="mt-1 text-sm text-slate-500">
        הקלידו טיקר (למשל AAPL) כדי לראות מכפילים, מגמות, ניתוח שלב, תחזיות
        צמיחה, תזות וחדשות — בדיוק כמו לחיצה על מניה בתיק.
      </p>
      <form onSubmit={handleSearch} className="mt-3 flex gap-2">
        <TickerSearchInput
          value={query}
          onChange={setQuery}
          suggestions={suggestions}
          onSelectSuggestion={handleSelectSuggestion}
          placeholder="לדוגמה: AAPL, GOOGL, TSLA..."
        />
        <button
          type="submit"
          className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
        >
          <Search size={15} />
          חיפוש
        </button>
      </form>

      {notFound && (
        <p className="mt-3 text-sm text-negative">
          הטיקר "{notFound}" לא נמצא. במסד הדמו הנוכחי זמינים: NVDA, MSFT,
          TSM, VRT, TEVA.TA, POLI.TA, AAPL, GOOGL, AMZN, TSLA. חיפוש חי לכל
          טיקר יתווסף בשלב 3.
        </p>
      )}

      {selectedDetail && (
        <StockDetailModal detail={selectedDetail} onClose={() => setSelectedTicker(null)} />
      )}
    </section>
  );
}
