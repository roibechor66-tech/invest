import { mockStockDetails } from "@/lib/mock-data/stock-details";
import { mockIndices } from "@/lib/mock-data/indices";
import { hashString, seededRandom } from "@/lib/mock-data/metric-history";
import { TickerSuggestion } from "@/lib/ticker-search";

// "בדיקת קורלציה" — lets the user search for ANY stock, index, sector
// ETF, bond yield or commodity and see a correlation coefficient against
// any other one, for every asset combination (stock↔index, sector↔sector,
// sector↔index, sector/index↔commodity, etc). There is no live return
// history to correlate against in this mock-data phase, so the
// coefficient itself — like the rest of the app's mock figures — is a
// deterministic, seeded approximation: not a random number, but not a
// real statistical calculation either. It is built from a simple,
// transparent heuristic (same asset class/sector cluster → higher base
// correlation, equities vs. bond yields → negative, etc.) plus a small
// seeded "noise" term so the same pair always returns the same number.
// Phase 3 would replace this with a real calculation over live daily
// return history.

export type CorrelationAssetClass =
  | "equity"
  | "bond"
  | "precious-metal"
  | "industrial-metal"
  | "energy-commodity"
  | "volatility";

export interface CorrelationEntity {
  id: string; // used as the "ticker" in the shared TickerSuggestion shape
  labelHe: string;
  typeHe: string; // "מניה" | "מדד" | "סקטור" | 'אג"ח' | "סחורה"
  assetClass: CorrelationAssetClass;
  // Loose sector/theme grouping used only to bias the mock correlation
  // heuristic (e.g. two tech names/ETFs correlate more than a tech name
  // and a utility). Not shown in the UI.
  cluster: string;
}

// The 10 tickers with full detail data get an explicit cluster, based on
// their actual business (and, where relevant, already-established facts
// from the app's other mock features — e.g. NVDA/VRT both benefiting from
// the AI-infrastructure buildout, per the "סיכום שבועי — התיק שלי" demo).
const STOCK_CLUSTERS: Record<string, string> = {
  NVDA: "tech",
  MSFT: "tech",
  TSM: "tech",
  VRT: "tech",
  AAPL: "tech",
  GOOGL: "tech",
  "TEVA.TA": "healthcare",
  "POLI.TA": "financials",
  AMZN: "consumer",
  TSLA: "consumer",
};

// Sector ETF id -> theme cluster (mirrors the actual sector each SPDR/
// niche ETF tracks).
const SECTOR_CLUSTERS: Record<string, string> = {
  xlk: "tech",
  igv: "tech",
  cibr: "tech",
  soxx: "tech",
  aiq: "tech",
  dram: "tech",
  xlf: "financials",
  xlv: "healthcare",
  xle: "energy",
  xli: "industrial",
  xly: "consumer",
  xlp: "staples",
  xlu: "utilities",
  xlb: "materials",
  xlre: "real-estate",
  xlc: "communication",
};

const COMMODITY_ASSET_CLASS: Record<string, CorrelationAssetClass> = {
  gold: "precious-metal",
  silver: "precious-metal",
  platinum: "precious-metal",
  copper: "industrial-metal",
  "wti-oil": "energy-commodity",
  natgas: "energy-commodity",
};

function typeHeFor(region: string): string {
  if (region === "sectors") return "סקטור";
  if (region === "bonds") return 'אג"ח';
  if (region === "commodities") return "סחורה";
  return "מדד";
}

function regionCluster(id: string, region: string): string {
  if (region === "sectors") return SECTOR_CLUSTERS[id] ?? "other-sector";
  if (id === "vix") return "vix";
  if (region === "il") return "broad-il";
  if (region === "global") return "broad-us";
  if (region === "asia") return "broad-asia";
  if (region === "south-america") return "broad-latam";
  if (region === "europe") return "broad-europe";
  return "other";
}

// Unified, searchable registry of every entity a correlation can be run
// against: the 10 stocks with full detail data, plus every index/ETF/
// bond-yield/commodity in the watched-indices data (40 with multiples +
// 6 bonds + 6 commodities + VIX = 53 non-stock entities).
export const correlationEntities: CorrelationEntity[] = [
  ...Object.values(mockStockDetails).map((d) => ({
    id: d.ticker,
    labelHe: d.nameHe,
    typeHe: "מניה",
    assetClass: "equity" as CorrelationAssetClass,
    cluster: STOCK_CLUSTERS[d.ticker] ?? "other-equity",
  })),
  ...mockIndices.map((idx) => {
    const assetClass: CorrelationAssetClass =
      idx.id === "vix"
        ? "volatility"
        : idx.region === "bonds"
          ? "bond"
          : idx.region === "commodities"
            ? (COMMODITY_ASSET_CLASS[idx.id] ?? "industrial-metal")
            : "equity";
    return {
      id: idx.id,
      labelHe: idx.labelHe,
      typeHe: typeHeFor(idx.region),
      assetClass,
      cluster: regionCluster(idx.id, idx.region),
    };
  }),
];

const entityById = new Map(correlationEntities.map((e) => [e.id, e]));

export function getCorrelationEntity(id: string): CorrelationEntity | undefined {
  return entityById.get(id);
}

// Search box suggestions, in the same {ticker, nameHe} shape the app's
// other search boxes use (see lib/ticker-search.ts) so the existing
// TickerSearchInput component can be reused as-is. `nameHe` includes the
// type in parentheses since this pool mixes stocks/indices/sectors/
// commodities, unlike the single-purpose stock search boxes.
export function getCorrelationSuggestions(query: string, maxResults = 8): TickerSuggestion[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  return correlationEntities
    .filter((e) => e.id.toUpperCase().includes(q) || e.labelHe.toUpperCase().includes(query.trim().toUpperCase()))
    .sort((a, b) => {
      const rank = (e: CorrelationEntity) => (e.id.toUpperCase().startsWith(q) ? 0 : 1);
      return rank(a) - rank(b);
    })
    .slice(0, maxResults)
    .map((e) => ({ ticker: e.id, nameHe: `${e.labelHe} (${e.typeHe})` }));
}

export interface CorrelationPeriodOption {
  id: string;
  labelHe: string;
  noiseSpread: number; // shorter lookback -> noisier/less stable estimate
}

export const correlationPeriodOptions: CorrelationPeriodOption[] = [
  { id: "3m", labelHe: "3 חודשים", noiseSpread: 0.22 },
  { id: "6m", labelHe: "6 חודשים", noiseSpread: 0.17 },
  { id: "1y", labelHe: "שנה", noiseSpread: 0.12 },
  { id: "3y", labelHe: "3 שנים", noiseSpread: 0.08 },
  { id: "5y", labelHe: "5 שנים", noiseSpread: 0.05 },
];

function baseCorrelation(a: CorrelationEntity, b: CorrelationEntity): number {
  if (a.id === b.id) return 1;

  // VIX: strongly inverse to equities, mildly positive to bonds/gold
  // (both classic "risk-off" destinations), close to neutral otherwise.
  if (a.cluster === "vix" || b.cluster === "vix") {
    const other = a.cluster === "vix" ? b : a;
    if (other.assetClass === "equity") return -0.75;
    if (other.assetClass === "bond") return 0.2;
    if (other.assetClass === "precious-metal") return 0.15;
    return -0.1;
  }

  if (a.assetClass === "equity" && b.assetClass === "equity") {
    if (a.cluster === b.cluster) return 0.78; // same sector/theme
    return 0.5; // different sectors still share general market beta
  }

  if (
    (a.assetClass === "equity" && b.assetClass === "bond") ||
    (a.assetClass === "bond" && b.assetClass === "equity")
  ) {
    const equity = a.assetClass === "equity" ? a : b;
    // Rate-sensitive sectors (tech/growth, real estate) react harder to
    // bond-yield moves than the broad market.
    return equity.cluster === "tech" || equity.cluster === "real-estate" ? -0.45 : -0.25;
  }

  if (a.assetClass === "bond" && b.assetClass === "bond") return 0.7;

  if (
    (a.assetClass === "equity" && b.assetClass === "precious-metal") ||
    (a.assetClass === "precious-metal" && b.assetClass === "equity")
  ) {
    return -0.05;
  }

  if (
    (a.assetClass === "equity" && b.assetClass === "energy-commodity") ||
    (a.assetClass === "energy-commodity" && b.assetClass === "equity")
  ) {
    const equity = a.assetClass === "equity" ? a : b;
    return equity.cluster === "energy" ? 0.55 : 0.15;
  }

  if (
    (a.assetClass === "equity" && b.assetClass === "industrial-metal") ||
    (a.assetClass === "industrial-metal" && b.assetClass === "equity")
  ) {
    const equity = a.assetClass === "equity" ? a : b;
    return equity.cluster === "materials" || equity.cluster === "industrial" ? 0.5 : 0.2;
  }

  if (
    (a.assetClass === "bond" && b.assetClass === "precious-metal") ||
    (a.assetClass === "precious-metal" && b.assetClass === "bond")
  ) {
    return 0.2;
  }

  if (
    (a.assetClass === "bond" && b.assetClass === "energy-commodity") ||
    (a.assetClass === "energy-commodity" && b.assetClass === "bond")
  ) {
    return -0.15;
  }

  if (a.assetClass === "precious-metal" && b.assetClass === "precious-metal") return 0.75;
  if (a.assetClass === "energy-commodity" && b.assetClass === "energy-commodity") return 0.55;
  if (
    (a.assetClass === "industrial-metal" && b.assetClass === "precious-metal") ||
    (a.assetClass === "precious-metal" && b.assetClass === "industrial-metal")
  ) {
    return 0.35;
  }
  if (
    (a.assetClass === "industrial-metal" && b.assetClass === "energy-commodity") ||
    (a.assetClass === "energy-commodity" && b.assetClass === "industrial-metal")
  ) {
    return 0.4;
  }

  return 0.2;
}

export interface CorrelationResult {
  value: number; // -1..1, rounded to 2 decimals
  periodLabelHe: string;
  seriesA: number[]; // 12 synthetic paired period-return points, %
  seriesB: number[];
}

// Deterministic: the same (entity A, entity B, period) always returns the
// same coefficient and paired series, so re-running the same search
// doesn't produce a different-looking answer.
export function computeCorrelation(idA: string, idB: string, periodId: string): CorrelationResult | null {
  const a = getCorrelationEntity(idA);
  const b = getCorrelationEntity(idB);
  const period = correlationPeriodOptions.find((p) => p.id === periodId) ?? correlationPeriodOptions[2];
  if (!a || !b) return null;

  const base = baseCorrelation(a, b);
  const pairKey = [a.id, b.id].sort().join("|");
  const rand = seededRandom(hashString(`corr:${pairKey}:${period.id}`));
  const noise = (rand() - 0.5) * 2 * period.noiseSpread;
  const value = a.id === b.id ? 1 : Math.max(-0.97, Math.min(0.97, base + noise));

  const seriesA: number[] = [];
  const seriesB: number[] = [];
  for (let i = 0; i < 12; i++) {
    const epsA = (rand() - 0.5) * 6; // synthetic period return, %
    const epsB = value * epsA + Math.sqrt(Math.max(0, 1 - value * value)) * (rand() - 0.5) * 6;
    seriesA.push(Number(epsA.toFixed(2)));
    seriesB.push(Number(epsB.toFixed(2)));
  }

  return {
    value: Number(value.toFixed(2)),
    periodLabelHe: period.labelHe,
    seriesA,
    seriesB,
  };
}

export function correlationStrengthLabelHe(value: number): string {
  const v = Math.abs(value);
  const sign = value >= 0 ? "חיובית" : "שלילית";
  if (v >= 0.7) return `חזקה ${sign}`;
  if (v >= 0.4) return `בינונית ${sign}`;
  if (v >= 0.15) return `חלשה ${sign}`;
  return "כמעט אין קורלציה";
}
