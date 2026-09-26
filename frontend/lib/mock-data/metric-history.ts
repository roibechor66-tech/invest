import { MetricHistoryPoint } from "@/lib/types";

// Deterministic mock quarterly history for a metric, ending exactly at
// its current value. Used so clicking a multiple (P/E, ROE, ...) can show
// a trend chart without hand-authoring history for every stock — Phase 3
// replaces this with real historical filings data.

export function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

// Small seeded PRNG (mulberry32) so the same ticker+metric always
// produces the same "history" across renders.
export function seededRandom(seed: number): () => number {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), t | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function buildQuarterLabels(count: number): string[] {
  // Anchored to Q3 2026 (the current quarter in this project), walking
  // backward for `count` quarters.
  const labels: string[] = [];
  let quarter = 3;
  let year = 26;
  for (let i = 0; i < count; i++) {
    labels.unshift(`Q${quarter} '${year}`);
    quarter -= 1;
    if (quarter === 0) {
      quarter = 4;
      year -= 1;
    }
  }
  return labels;
}

export function buildQuarterlyHistory(
  ticker: string,
  metricKey: string,
  currentValue: number,
  quarters = 8
): MetricHistoryPoint[] {
  const rand = seededRandom(hashString(`${ticker}:${metricKey}`));
  const values: number[] = [currentValue];
  let value = currentValue;
  for (let i = 1; i < quarters; i++) {
    const drift = (rand() - 0.5) * 0.22; // +-11% swing per step, biggest around earnings
    value = value / (1 + drift);
    values.unshift(Math.max(value, 0.1));
  }
  const labels = buildQuarterLabels(quarters);
  return values.map((value, i) => ({ periodLabelHe: labels[i], value }));
}
