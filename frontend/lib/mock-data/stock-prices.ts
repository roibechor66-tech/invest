// Per-share prices for every ticker in the mock stock-search universe —
// the six portfolio holdings plus the four "search-only" demo tickers
// that aren't actually held (AAPL, GOOGL, AMZN, TSLA). The six holdings
// mirror their `lastPrice` in mockPortfolioSummary.holdings.
//
// Phase 3, second/third tracks: every screen that used to auto-fill a
// price from this map (ticker search's price fill, the trade-risk/
// options/volatility-stop calculators, the portfolio, the stock detail
// modal, the scanner, and — as of the third track — the five valuation
// workspaces' auto-mode financial profile) now fetches a live quote/
// financial profile instead — see frontend/lib/hooks/useLiveQuote.ts,
// useLiveCompanyFundamentals.ts and backend/app/services/market_data.py,
// fundamentals.py. This map is kept only for `getAddPositionSuggestions`
// in lib/ticker-search.ts — which tickers show up as autocomplete
// candidates, a name/suggestion list, not a price source.
export const mockPriceByTicker: Record<string, number> = {
  NVDA: 178.4,
  MSFT: 428.9,
  TSM: 172.2,
  VRT: 98.7,
  "TEVA.TA": 51.6,
  "POLI.TA": 41.8,
  AAPL: 248.3,
  GOOGL: 198.4,
  AMZN: 215.6,
  TSLA: 412.8,
};

// Fixed USD/ILS fallback rate. Phase 3, second track: the Portfolio
// Builder and "התיק שלי" now use a live FX rate (frontend/lib/hooks/
// useLiveFxRate.ts, backend/app/services/market_data.py) whenever one is
// available — this constant is the fallback used when it isn't (no API
// key configured / upstream call failed), same convention as the
// backend's own settings.usd_ils_rate fallback.
export const USD_ILS_RATE = 3.7;

// Any ticker ending in ".TA" is treated as an Israeli security (Tel
// Aviv Stock Exchange), for which the Portfolio Builder additionally
// offers a shekel (₪) option when investing, alongside dollars ($).
export function isIsraeliTicker(ticker: string): boolean {
  return /\.TA$/i.test(ticker.trim());
}
