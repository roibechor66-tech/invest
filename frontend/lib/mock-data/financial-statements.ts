import { CompanySegment } from "@/lib/mock-data/valuation-financials";
import { LiveFinancialPeriod } from "@/lib/hooks/useLiveCompanyFundamentals";

// Per-period financial-statement types, consumed by FinancialsBarChart
// and IncomeStatementFlow. Phase 3, third track: the data behind these
// used to be a seeded-random generator here (deterministic per ticker,
// but entirely fabricated); it's gone — buildCompanyFinancialStatements
// below now formats REAL per-period series fetched live from FMP (see
// lib/hooks/useLiveCompanyFundamentals.ts, backend/app/services/
// fundamentals.py) into these same shapes, so the two chart components
// didn't need to change at all.

export interface FinancialPeriodPoint {
  periodLabelHe: string;
  revenueUsdM: number;
  ebitdaUsdM: number;
  netIncomeUsdM: number;
  cashUsdM: number;
  debtUsdM: number;
}

export interface IncomeStatementSegment {
  nameHe: string;
  valueUsdM: number;
  pctOfRevenue: number;
}

export interface IncomeStatementBreakdown {
  periodLabelHe: string;
  segments: IncomeStatementSegment[];
  revenueUsdM: number;
  cogsUsdM: number;
  grossProfitUsdM: number;
  sgaUsdM: number;
  rdUsdM: number;
  operatingIncomeUsdM: number;
  netInterestIncomeUsdM: number;
  otherIncomeUsdM: number;
  pretaxIncomeUsdM: number;
  taxUsdM: number;
  minorityInterestsUsdM: number;
  netIncomeUsdM: number;
}

export interface CompanyFinancialStatements {
  annual: FinancialPeriodPoint[];
  quarterly: FinancialPeriodPoint[];
  incomeStatement: {
    annual: IncomeStatementBreakdown;
    quarterly: IncomeStatementBreakdown;
  };
}

export function formatUsdM(valueM: number): string {
  const sign = valueM < 0 ? "-" : "";
  const abs = Math.abs(valueM);
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}B`;
  return `${sign}$${abs.toFixed(0)}M`;
}

function toPoint(period: LiveFinancialPeriod): FinancialPeriodPoint {
  return {
    periodLabelHe: period.periodLabel,
    revenueUsdM: period.revenueUsdM,
    // FMP doesn't always report EBITDA directly (see fundamentals.py);
    // when even the operatingIncome+D&A fallback comes back empty, show
    // 0 rather than fail the whole chart — an honestly-labeled gap in a
    // single bar, not a fabricated number.
    ebitdaUsdM: period.ebitdaUsdM ?? 0,
    netIncomeUsdM: period.netIncomeUsdM,
    cashUsdM: period.cashUsdM,
    debtUsdM: period.debtUsdM,
  };
}

// Builds the reconciled income-statement breakdown for one period from
// REAL FMP line items (cogs/grossProfit/sga/rd/operatingIncome/
// pretaxIncome/tax — see fundamentals.py's get_financial_statements).
// netInterestIncome/otherIncome/minorityInterests aren't fetched as
// their own fields; they're folded into a single balancing residual
// (pretaxIncome - operatingIncome, and pretaxIncome - tax - netIncome
// respectively) so the diagram still reconciles exactly to the real
// revenue/operatingIncome/pretaxIncome/netIncome figures rather than
// showing an invented, individually-precise-looking split.
function toIncomeBreakdown(period: LiveFinancialPeriod, segments: CompanySegment[] | undefined): IncomeStatementBreakdown {
  const revenue = period.revenueUsdM;
  const cogs = period.cogsUsdM ?? 0;
  const grossProfit = period.grossProfitUsdM ?? revenue - cogs;
  const sga = period.sgaUsdM ?? 0;
  const rd = period.rdUsdM ?? 0;
  const operatingIncome = period.operatingIncomeUsdM ?? grossProfit - sga - rd;
  const pretaxIncome = period.pretaxIncomeUsdM ?? operatingIncome;
  const tax = period.taxUsdM ?? 0;
  const netIncome = period.netIncomeUsdM;

  // Balancing residuals — see doc comment above.
  const otherIncomeAndInterest = pretaxIncome - operatingIncome;
  const minorityInterests = pretaxIncome - tax - netIncome;

  const resolvedSegments: IncomeStatementSegment[] =
    segments && segments.length > 0
      ? segments.map((s) => ({
          nameHe: s.nameHe,
          valueUsdM: (revenue * s.revenueSharePct) / 100,
          pctOfRevenue: s.revenueSharePct,
        }))
      : [{ nameHe: "הכנסות מפעילות", valueUsdM: revenue, pctOfRevenue: 100 }];

  return {
    periodLabelHe: period.periodLabel,
    segments: resolvedSegments,
    revenueUsdM: revenue,
    cogsUsdM: cogs,
    grossProfitUsdM: grossProfit,
    sgaUsdM: sga,
    rdUsdM: rd,
    operatingIncomeUsdM: operatingIncome,
    // Split evenly between the two labels the diagram expects — FMP's
    // basic income statement doesn't separate interest income from
    // other non-operating income as two distinct fields.
    netInterestIncomeUsdM: otherIncomeAndInterest / 2,
    otherIncomeUsdM: otherIncomeAndInterest / 2,
    pretaxIncomeUsdM: pretaxIncome,
    taxUsdM: tax,
    minorityInterestsUsdM: minorityInterests,
    netIncomeUsdM: netIncome,
  };
}

// Formats already-fetched live quarterly/annual periods (from
// useLiveCompanyFundamentals) into the chart-ready shape. Returns
// undefined if either series is empty — same "no live data, no
// fabricated fallback" convention as the rest of Phase 3's third track.
export function buildCompanyFinancialStatements(
  quarterlyPeriods: LiveFinancialPeriod[] | null,
  annualPeriods: LiveFinancialPeriod[] | null,
  segments: CompanySegment[] | undefined
): CompanyFinancialStatements | undefined {
  if (!quarterlyPeriods?.length || !annualPeriods?.length) return undefined;

  // FMP returns most-recent-first (see fundamentals.py); charts read
  // left-to-right chronologically.
  const annual = [...annualPeriods].reverse().map(toPoint);
  const quarterly = [...quarterlyPeriods].reverse().map(toPoint);

  return {
    annual,
    quarterly,
    incomeStatement: {
      annual: toIncomeBreakdown(annualPeriods[0], segments),
      quarterly: toIncomeBreakdown(quarterlyPeriods[0], segments),
    },
  };
}
