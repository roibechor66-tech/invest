// Shared autocomplete suggestion helpers for the app's various ticker
// search boxes (main stock search, options calculator, trade-risk/
// volatility-stop calculators, valuation flow, add-position modal).
// Kept in one place so every search box ranks/matches the same way
// instead of re-implementing its own filter logic.
import { mockStockDetails } from "@/lib/mock-data/stock-details";
import { mockPriceByTicker } from "@/lib/mock-data/stock-prices";
import { mockIsraeliSecurities } from "@/lib/mock-data/israeli-securities";

export interface TickerSuggestion {
  ticker: string;
  nameHe: string;
}

const MAX_SUGGESTIONS = 6;

function matches(ticker: string, nameHe: string, query: string): boolean {
  const q = query.trim().toUpperCase();
  if (!q) return false;
  return ticker.toUpperCase().includes(q) || nameHe.toUpperCase().includes(query.trim().toUpperCase());
}

// Ranks a ticker-prefix match above a mid-string/name match, so typing
// "NV" surfaces NVDA before, say, a company whose Hebrew name happens
// to contain the letters elsewhere.
function rank(ticker: string, query: string): number {
  const q = query.trim().toUpperCase();
  return ticker.toUpperCase().startsWith(q) ? 0 : 1;
}

// The main pool: every ticker with full detail data (multiples, stage,
// theses, news) — used by the general stock search, options calculator,
// trade-risk calculator, volatility-stop calculator and the valuation
// flow, all of which only work once a ticker resolves to one of these.
export function getStockDetailSuggestions(query: string, maxResults = MAX_SUGGESTIONS): TickerSuggestion[] {
  const q = query.trim();
  if (!q) return [];
  return Object.values(mockStockDetails)
    .filter((d) => matches(d.ticker, d.nameHe, q))
    .sort((a, b) => rank(a.ticker, q) - rank(b.ticker, q))
    .slice(0, maxResults)
    .map((d) => ({ ticker: d.ticker, nameHe: d.nameHe }));
}

// The broader pool for the Portfolio Builder's add-position search,
// which accepts any ticker with a known price (not just the ones with
// full detail data) plus the separate Israeli-securities list.
export function getAddPositionSuggestions(query: string, maxResults = MAX_SUGGESTIONS): TickerSuggestion[] {
  const q = query.trim();
  if (!q) return [];
  const fromDetails: TickerSuggestion[] = Object.values(mockStockDetails).map((d) => ({
    ticker: d.ticker,
    nameHe: d.nameHe,
  }));
  const fromPrices: TickerSuggestion[] = Object.keys(mockPriceByTicker)
    .filter((t) => !mockStockDetails[t])
    .map((t) => ({ ticker: t, nameHe: t }));
  const fromIsraeli: TickerSuggestion[] = mockIsraeliSecurities.map((s) => ({ ticker: s.ticker, nameHe: s.nameHe }));

  const seen = new Set<string>();
  const pool: TickerSuggestion[] = [];
  for (const s of [...fromDetails, ...fromIsraeli, ...fromPrices]) {
    if (seen.has(s.ticker)) continue;
    seen.add(s.ticker);
    pool.push(s);
  }

  return pool
    .filter((s) => matches(s.ticker, s.nameHe, q))
    .sort((a, b) => rank(a.ticker, q) - rank(b.ticker, q))
    .slice(0, maxResults);
}
