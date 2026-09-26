"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { CompanyFinancials, CompanySegment } from "@/lib/mock-data/valuation-financials";

// Live financials/multiples/valuation-input data (FMP) — Phase 3, third
// track, for "חבר לי את כל האתר לדאטה" -> "וגם כל מה שקשור לפיננסים,
// מכפילים והערכות שווי". Replaces the mock multiples/growth-outlook in
// stock-details.ts and the mock multiples-derived financial profile in
// valuation-financials.ts (getCompanyFinancials) that fed all five
// valuation workspaces (DCF/growth-exit/trading-multiples/forward-
// multiple/SOTP) and the StockDetailModal. Backed by GET
// /api/fundamentals/{ticker}/{multiples,financial-statements,estimates,
// segments} (see backend/app/services/fundamentals.py).
//
// What this intentionally does NOT replace (documented scope boundary,
// same honesty convention as the rest of Phase 3): sector/industry
// AVERAGE multiples (FMP's per-sector endpoints are separately plan-
// gated and their sector-name matching isn't verifiable without a real
// key — see stock-details.ts), and per-quarter HISTORY of each multiple
// (would need FMP's historical-ratios endpoint, out of scope for this
// pass) — both stay as the existing mock/illustrative baselines.

export interface LiveMultiples {
  ticker: string;
  name: string;
  sector: string;
  marketCapUsd: number;
  priceUsd: number;
  peRatio: number | null;
  evEbitda: number | null;
  priceToSales: number | null;
  roePct: number | null;
  roaPct: number | null;
  roicPct: number | null;
}

export interface LiveFinancialPeriod {
  periodLabel: string;
  revenueUsdM: number;
  ebitdaUsdM: number | null;
  netIncomeUsdM: number;
  fcfUsdM: number | null;
  cashUsdM: number;
  debtUsdM: number;
  sharesOutstandingM: number | null;
  cogsUsdM: number | null;
  grossProfitUsdM: number | null;
  sgaUsdM: number | null;
  rdUsdM: number | null;
  operatingIncomeUsdM: number | null;
  pretaxIncomeUsdM: number | null;
  taxUsdM: number | null;
  source: "fmp" | "uploaded";
}

export interface LiveAnalystEstimateYear {
  periodLabel: string;
  estimatedRevenueUsdM: number | null;
  estimatedEps: number | null;
  revenueGrowthPct: number | null;
  epsGrowthPct: number | null;
}

export interface LiveRevenueSegment {
  name: string;
  revenueSharePct: number;
}

interface RawMultiples {
  ticker: string;
  name: string;
  sector: string;
  market_cap_usd: number;
  price_usd: number;
  pe_ratio: number | null;
  ev_ebitda: number | null;
  price_to_sales: number | null;
  roe_pct: number | null;
  roa_pct: number | null;
  roic_pct: number | null;
}

interface RawFinancialPeriod {
  period_label: string;
  revenue_usd_m: number;
  ebitda_usd_m: number | null;
  net_income_usd_m: number;
  fcf_usd_m: number | null;
  cash_usd_m: number;
  debt_usd_m: number;
  shares_outstanding_m: number | null;
  cogs_usd_m: number | null;
  gross_profit_usd_m: number | null;
  sga_usd_m: number | null;
  rd_usd_m: number | null;
  operating_income_usd_m: number | null;
  pretax_income_usd_m: number | null;
  tax_usd_m: number | null;
  // "fmp" (live) or "uploaded" (a user-uploaded PDF report — see
  // POST /api/fundamentals/{ticker}/upload-report). Optional on the
  // TS side only because older cached responses during dev may omit it;
  // the backend always sends it now.
  source?: "fmp" | "uploaded";
}

interface RawAnalystEstimate {
  period_label: string;
  estimated_revenue_usd_m: number | null;
  estimated_eps: number | null;
  revenue_growth_pct: number | null;
  eps_growth_pct: number | null;
}

interface RawRevenueSegment {
  name: string;
  revenue_share_pct: number;
}

export interface LiveCompanyFundamentals {
  isLoading: boolean;
  multiples: LiveMultiples | null;
  multiplesError: string | null;
  quarterlyStatements: LiveFinancialPeriod[] | null;
  annualStatements: LiveFinancialPeriod[] | null;
  statementsError: string | null;
  // [] means "loaded, genuinely none available" (e.g. FMP plan doesn't
  // include this) — not the same as null/loading. See fundamentals.py's
  // two-tier honesty split.
  estimates: LiveAnalystEstimateYear[];
  segments: LiveRevenueSegment[];
  // Convenience: the same CompanyFinancials shape the five valuation
  // workspaces already consume, built from the latest quarterly period
  // (falling back to annual) + live multiples + live segments. undefined
  // until both multiples and at least one statement period have loaded.
  financials: CompanyFinancials | undefined;
  // Re-runs all four fetches — call this after a successful PDF-report
  // upload (POST /api/fundamentals/{ticker}/upload-report) so the newly
  // saved data shows up immediately without closing/reopening the modal.
  refetch: () => void;
}

function toLiveMultiples(raw: RawMultiples): LiveMultiples {
  return {
    ticker: raw.ticker,
    name: raw.name,
    sector: raw.sector,
    marketCapUsd: raw.market_cap_usd,
    priceUsd: raw.price_usd,
    peRatio: raw.pe_ratio,
    evEbitda: raw.ev_ebitda,
    priceToSales: raw.price_to_sales,
    roePct: raw.roe_pct,
    roaPct: raw.roa_pct,
    roicPct: raw.roic_pct,
  };
}

function toLivePeriod(raw: RawFinancialPeriod): LiveFinancialPeriod {
  return {
    periodLabel: raw.period_label,
    revenueUsdM: raw.revenue_usd_m,
    ebitdaUsdM: raw.ebitda_usd_m,
    netIncomeUsdM: raw.net_income_usd_m,
    fcfUsdM: raw.fcf_usd_m,
    cashUsdM: raw.cash_usd_m,
    debtUsdM: raw.debt_usd_m,
    sharesOutstandingM: raw.shares_outstanding_m,
    cogsUsdM: raw.cogs_usd_m,
    grossProfitUsdM: raw.gross_profit_usd_m,
    sgaUsdM: raw.sga_usd_m,
    rdUsdM: raw.rd_usd_m,
    operatingIncomeUsdM: raw.operating_income_usd_m,
    pretaxIncomeUsdM: raw.pretax_income_usd_m,
    taxUsdM: raw.tax_usd_m,
    source: raw.source ?? "fmp",
  };
}

// Builds the CompanyFinancials shape the valuation workspaces already
// know how to consume, from live pieces. Mirrors the OLD
// getCompanyFinancials()'s derivation logic only where a live period is
// missing a field FMP didn't return (fcf/ebitda/shares) — otherwise uses
// the live numbers directly instead of deriving everything from
// multiples the way the mock version did.
function buildCompanyFinancials(
  ticker: string,
  multiples: LiveMultiples,
  latestPeriod: LiveFinancialPeriod,
  segments: LiveRevenueSegment[]
): CompanyFinancials {
  const marketCapUsdM = multiples.marketCapUsd / 1_000_000;
  const ebitdaUsdM = latestPeriod.ebitdaUsdM ?? (multiples.evEbitda ? marketCapUsdM / multiples.evEbitda : 0);
  const fcfUsdM = latestPeriod.fcfUsdM ?? latestPeriod.netIncomeUsdM * 0.85; // rough fallback, no live FCF
  const sharesOutstandingM = latestPeriod.sharesOutstandingM ?? marketCapUsdM / multiples.priceUsd;

  const companySegments: CompanySegment[] | undefined =
    segments.length > 0
      ? segments.map((s) => ({
          nameHe: s.name, // FMP segment names are English; shown as-is, unlike the rest of the app's Hebrew labels
          revenueSharePct: s.revenueSharePct,
          suggestedMultiple: multiples.evEbitda ?? 12, // no live per-segment multiple; blended company multiple as a stand-in
        }))
      : undefined;

  return {
    ticker,
    nameHe: multiples.name,
    sectorNameHe: multiples.sector,
    revenueUsdM: latestPeriod.revenueUsdM,
    ebitdaUsdM,
    netIncomeUsdM: latestPeriod.netIncomeUsdM,
    fcfUsdM,
    netDebtUsdM: latestPeriod.debtUsdM - latestPeriod.cashUsdM,
    sharesOutstandingM,
    currentPriceUsd: multiples.priceUsd,
    marketCapUsdM,
    segments: companySegments,
  };
}

export function useLiveCompanyFundamentals(ticker: string | null | undefined): LiveCompanyFundamentals {
  const [multiples, setMultiples] = useState<LiveMultiples | null>(null);
  const [multiplesError, setMultiplesError] = useState<string | null>(null);
  const [quarterlyStatements, setQuarterlyStatements] = useState<LiveFinancialPeriod[] | null>(null);
  const [annualStatements, setAnnualStatements] = useState<LiveFinancialPeriod[] | null>(null);
  const [statementsError, setStatementsError] = useState<string | null>(null);
  const [estimates, setEstimates] = useState<LiveAnalystEstimateYear[]>([]);
  const [segments, setSegments] = useState<LiveRevenueSegment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [reloadCounter, setReloadCounter] = useState(0);

  useEffect(() => {
    if (!ticker) {
      setMultiples(null);
      setMultiplesError(null);
      setQuarterlyStatements(null);
      setAnnualStatements(null);
      setStatementsError(null);
      setEstimates([]);
      setSegments([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const t = encodeURIComponent(ticker);

    async function load() {
      setIsLoading(true);
      setMultiples(null);
      setMultiplesError(null);
      setQuarterlyStatements(null);
      setAnnualStatements(null);
      setStatementsError(null);
      setEstimates([]);
      setSegments([]);

      const [multiplesResult, quarterlyResult, annualResult, estimatesResult, segmentsResult] =
        await Promise.allSettled([
          apiFetch<RawMultiples>(`/api/fundamentals/${t}/multiples`),
          apiFetch<RawFinancialPeriod[]>(`/api/fundamentals/${t}/financial-statements?period=quarter&limit=8`),
          apiFetch<RawFinancialPeriod[]>(`/api/fundamentals/${t}/financial-statements?period=annual&limit=8`),
          apiFetch<RawAnalystEstimate[]>(`/api/fundamentals/${t}/estimates`),
          apiFetch<RawRevenueSegment[]>(`/api/fundamentals/${t}/segments`),
        ]);
      if (cancelled) return;

      if (multiplesResult.status === "fulfilled") {
        setMultiples(toLiveMultiples(multiplesResult.value));
      } else {
        const err = multiplesResult.reason;
        setMultiplesError(err instanceof ApiError ? err.message : "שליפת מכפילים חיה נכשלה");
      }

      if (quarterlyResult.status === "fulfilled") {
        setQuarterlyStatements(quarterlyResult.value.map(toLivePeriod));
      }
      if (annualResult.status === "fulfilled") {
        setAnnualStatements(annualResult.value.map(toLivePeriod));
      }
      if (quarterlyResult.status === "rejected" && annualResult.status === "rejected") {
        const err = quarterlyResult.reason;
        setStatementsError(err instanceof ApiError ? err.message : "שליפת דוחות כספיים חיים נכשלה");
      }

      if (estimatesResult.status === "fulfilled") {
        setEstimates(
          estimatesResult.value.map((e) => ({
            periodLabel: e.period_label,
            estimatedRevenueUsdM: e.estimated_revenue_usd_m,
            estimatedEps: e.estimated_eps,
            revenueGrowthPct: e.revenue_growth_pct,
            epsGrowthPct: e.eps_growth_pct,
          }))
        );
      }
      if (segmentsResult.status === "fulfilled") {
        setSegments(segmentsResult.value.map((s) => ({ name: s.name, revenueSharePct: s.revenue_share_pct })));
      }

      setIsLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [ticker, reloadCounter]);

  const latestPeriod = quarterlyStatements?.[0] ?? annualStatements?.[0];
  const financials =
    multiples && latestPeriod && ticker
      ? buildCompanyFinancials(ticker, multiples, latestPeriod, segments)
      : undefined;

  return {
    isLoading,
    multiples,
    multiplesError,
    quarterlyStatements,
    annualStatements,
    statementsError,
    estimates,
    segments,
    financials,
    refetch: () => setReloadCounter((n) => n + 1),
  };
}
