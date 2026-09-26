import { BenchmarkOption } from "@/lib/types";

// Benchmarks the user can choose from when comparing portfolio returns.
export const benchmarkOptions: BenchmarkOption[] = [
  { id: "sp500", labelHe: "S&P 500" },
  { id: "nasdaq100", labelHe: "Nasdaq 100" },
  { id: "ta35", labelHe: 'ת"א 35' },
  { id: "ta125", labelHe: 'ת"א 125' },
  { id: "msci-world", labelHe: "MSCI World" },
];
