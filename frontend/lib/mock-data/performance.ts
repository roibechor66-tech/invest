import { PerformancePeriod } from "@/lib/types";

// Mock portfolio performance across standard reporting periods. Each
// period carries a return for every benchmark option so the user can
// switch comparisons instantly (see BenchmarkPicker). Phase 2/3 will
// compute the portfolio side from real position history and fetch real
// benchmark returns.
export const mockPerformance: PerformancePeriod[] = [
  {
    id: "weekly",
    labelHe: "שבועי",
    returnPct: 1.8,
    benchmarkReturns: { sp500: 0.9, nasdaq100: 1.1, ta35: 0.5, ta125: 0.6, "msci-world": 0.7 },
  },
  {
    id: "monthly",
    labelHe: "חודשי",
    returnPct: 4.2,
    benchmarkReturns: { sp500: 2.6, nasdaq100: 3.4, ta35: 1.9, ta125: 2.1, "msci-world": 2.4 },
  },
  {
    id: "quarterly",
    labelHe: "רבעוני",
    returnPct: 9.6,
    benchmarkReturns: { sp500: 6.1, nasdaq100: 8.0, ta35: 4.8, ta125: 5.2, "msci-world": 5.9 },
  },
  {
    id: "ytd",
    labelHe: "מתחילת שנה",
    returnPct: 21.3,
    benchmarkReturns: { sp500: 14.8, nasdaq100: 18.2, ta35: 11.4, ta125: 12.6, "msci-world": 13.9 },
  },
  {
    id: "yearly",
    labelHe: "שנתי",
    returnPct: 27.9,
    benchmarkReturns: { sp500: 19.4, nasdaq100: 24.1, ta35: 15.7, ta125: 16.9, "msci-world": 18.3 },
  },
];
