// Shared types for a company's financial profile, as consumed by the
// five valuation workspaces (DCF / growth-exit / trading-multiples /
// forward-multiple / SOTP — components/dashboard/tools/valuation/*).
//
// Phase 3, third track: the actual DATA used to be a mock generator here
// (getCompanyFinancials/hasCompanyFinancials, derived from stock-
// details.ts's mock multiples + a hand-authored per-ticker leverage/
// segment profile). That generator is gone — every valuation workspace
// now gets a live-or-undefined CompanyFinancials from
// lib/hooks/useLiveCompanyFundamentals.ts (FMP-backed; see
// backend/app/services/fundamentals.py), consistent with the rest of
// Phase 3's "no silent fallback to fabricated data" convention: if FMP
// has nothing for a ticker, "auto" mode is simply unavailable for it
// (same UX as before, just live-driven instead of mock-driven) rather
// than silently substituting a fabricated financial profile.
export interface CompanySegment {
  nameHe: string;
  revenueSharePct: number;
  suggestedMultiple: number;
}

export interface CompanyFinancials {
  ticker: string;
  nameHe: string;
  sectorNameHe: string;
  revenueUsdM: number;
  ebitdaUsdM: number;
  netIncomeUsdM: number;
  fcfUsdM: number;
  netDebtUsdM: number;
  sharesOutstandingM: number;
  currentPriceUsd: number;
  marketCapUsdM: number;
  segments?: CompanySegment[];
}
