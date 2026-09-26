// Shared TypeScript types for the dashboard.
// Keeping these in one place makes it easy to swap mock data for real
// API responses in later phases without touching component code.

export type ActionButtonId =
  | "risk-management"
  | "portfolio-builder"
  | "custom-valuation"
  | "ai-bot"
  | "financial-report-analysis"
  | "thesis-builder"
  | "weekly-summary";

export interface ActionButtonConfig {
  id: ActionButtonId;
  labelHe: string;
  descriptionHe: string;
  icon: string; // lucide-react icon name, resolved in the component
}

export interface DashboardSection {
  id: string;
  titleHe: string;
  subtitleHe: string;
  buttonSize: ButtonSize;
  buttons: ActionButtonConfig[];
}

export interface PortfolioHolding {
  ticker: string;
  nameHe: string;
  // The sector the user's own add-position search resolved to (or typed
  // manually) when this holding was added — see PortfolioPosition on the
  // backend. Omitted for the original mock holdings (which look their
  // sector up in mockStockDetails instead); optional so existing callers
  // that don't need it don't have to change.
  sectorNameHe?: string;
  quantity: number;
  avgCost: number;
  lastPrice: number;
  weightPct: number;
  dayChangePct: number;
  // Currency avgCost/lastPrice are quoted in. Omitted (or "USD") for the
  // original mock holdings; set to "ILS" for an Israeli security added
  // in shekels, so the table can show "₪" instead of "$" for that row.
  currency?: "USD" | "ILS";
  // Phase 3, live market data: false means lastPrice/dayChangePct are the
  // avg-cost/0% fallback, not a real quote (see MyPortfolioPosition in
  // lib/portfolio-context.tsx). Omitted for the original mock holdings,
  // which don't carry a live/fallback distinction at all.
  priceIsLive?: boolean;
}

export interface PortfolioSummaryData {
  totalValueUsd: number;
  dayChangePct: number;
  dayChangeUsd: number;
  cashPct: number;
  holdings: PortfolioHolding[];
  // Phase 3, live market data: false means totalValueUsd/holdings' USD
  // amounts used the fixed USD/ILS fallback rate, not a live one. Omitted
  // for the original mock summary.
  fxRateIsLive?: boolean;
}

// A single position inside a user-built portfolio (Portfolio Builder
// feature): a stock plus how many dollars of the portfolio's size were
// allocated to it. Quantity/weight are derived from `amountUsd` and the
// portfolio's `sizeUsd` rather than stored directly, so the numbers can
// never drift out of sync. `amountUsd` is always the USD-equivalent
// value, used for every portfolio calculation (remaining cash, pie
// chart, weights) so the math stays in one currency regardless of what
// the user typed in; `currency`/`amountOriginal` remember what was
// actually entered (relevant for Israeli securities, which can be
// funded in ILS) purely so the UI can echo it back in ₪.
export interface BuiltPosition {
  ticker: string;
  nameHe: string;
  sectorNameHe: string;
  price: number;
  amountUsd: number;
  currency: "USD" | "ILS";
  amountOriginal: number;
}

// One portfolio the user has built in the Portfolio Builder. Users can
// build several of these side by side (e.g. "תיק עיקרי", "תיק ניסיוני"),
// each with its own size and set of positions.
export interface BuiltPortfolio {
  id: string;
  name: string;
  sizeUsd: number;
  positions: BuiltPosition[];
}

// Portfolio return over a fixed set of standard periods.
export type PerformancePeriodId =
  | "weekly"
  | "monthly"
  | "quarterly"
  | "ytd"
  | "yearly";

export interface PerformancePeriod {
  id: PerformancePeriodId;
  labelHe: string;
  returnPct: number;
  // Return for each benchmark option, so the user can switch which index
  // they compare against without refetching anything. Partial: a
  // benchmark whose ETF proxy has no live historical data (see
  // useLivePortfolioPerformance) is simply absent here, not zero.
  benchmarkReturns: Partial<Record<BenchmarkId, number>>;
}

// Whether a button belongs to the "core" tools (shown large) or the
// automated bot briefs (shown compact) — drives card sizing on the page.
export type ButtonSize = "large" | "compact";

// Benchmarks a user can pick to compare their portfolio performance
// against. Kept as an id + label pair so more can be added later without
// touching component code.
export type BenchmarkId = "sp500" | "nasdaq100" | "ta35" | "ta125" | "msci-world";

export interface BenchmarkOption {
  id: BenchmarkId;
  labelHe: string;
}

// Periods selectable in the watched-indices card (separate from the
// portfolio performance panel's periods, which has no "daily"/"5y").
export type IndexPeriodId = "daily" | "weekly" | "quarterly" | "ytd" | "yearly" | "5y";

export interface IndexPeriodOption {
  id: IndexPeriodId;
  labelHe: string;
}

// A quote for an index/ETF/bond/commodity shown in the watchlist (not
// held, just tracked), with its return for every selectable period so
// the period toggle needs no refetch. "sectors" covers the major US
// sector SPDRs plus niche thematic ETFs (software, cybersecurity, AI,
// semiconductors, memory chips); "asia", "south-america" and "europe"
// are the leading regional markets/ETFs for each region; "bonds" is
// government-bond yields in Israel and the US; "commodities" covers the
// leading traded commodities (metals, energy).
export type IndexRegion =
  | "il"
  | "global"
  | "sectors"
  | "asia"
  | "south-america"
  | "europe"
  | "bonds"
  | "commodities";

export interface IndexQuote {
  id: string;
  labelHe: string;
  valuePts: number;
  returns: Record<IndexPeriodId, number>;
  region: IndexRegion;
  // Trailing and forward P/E for the index/ETF as a whole (a weighted
  // blend of its constituents' multiples). Optional and omitted for
  // regions with no earnings-based multiple at all — "bonds" (yields, not
  // equities) and "commodities" (physical goods) — every equity
  // index/ETF region (il/global/sectors/asia/south-america/europe) has
  // both, except the VIX (a volatility index, not a priced basket of
  // earnings).
  peRatio?: number;
  forwardPeRatio?: number;
}

// Category tabs for the watched-indices card: the default view keeps the
// Israel/US split, the others switch the card to a single grid of
// ETFs/indices/yields/commodities for that group.
export type IndexCategoryId =
  | "main"
  | "sectors"
  | "asia"
  | "south-america"
  | "europe"
  | "bonds"
  | "commodities";

export interface IndexCategoryOption {
  id: IndexCategoryId;
  labelHe: string;
}

// One constituent stock inside a sector/thematic ETF's top holdings, for
// the sector-heatmap drilldown opened by clicking a "sectors" tile in
// WatchedIndicesCard. Mock top-holdings data (see
// lib/mock-data/etf-holdings.ts) — Phase 3 would refresh this from a
// live ETF-holdings feed.
export interface EtfHolding {
  ticker: string;
  nameHe: string;
  weightPct: number;
  dayChangePct: number;
}

// Stan Weinstein stage analysis classification for a single stock.
export type WeinsteinStage = 1 | 2 | 3 | 4;

export interface AnalystThesis {
  source: string;
  titleHe: string;
  url: string;
  dateHe: string;
  stance: "bullish" | "bearish" | "neutral";
}

export interface NewsItem {
  source: string;
  titleHe: string;
  dateHe: string;
  url: string;
}

// One point in a quarterly history series for a multiple/ratio, used to
// draw the trend chart (e.g. P/E quarter over quarter, so the jump after
// each earnings report is visible).
export interface MetricHistoryPoint {
  periodLabelHe: string;
  value: number;
}

export type MultipleKey =
  | "peRatio"
  | "forwardPeRatio"
  | "evEbitda"
  | "priceToSales"
  | "roiPct"
  | "roePct"
  | "roaPct";

// Forward-looking estimate for a single future fiscal year: both the
// analyst-consensus and the company's own guidance for revenue growth,
// plus consensus EPS growth and the resulting forward P/E at the current
// price (the "forward multiple N years out" view, à la Seeking Alpha).
export interface ForwardEstimateYear {
  yearLabelHe: string;
  analystRevenueGrowthPct: number;
  companyGuidanceRevenueGrowthPct: number;
  epsGrowthPct: number;
  forwardPE: number;
}

export interface GrowthOutlook {
  guidanceNoteHe: string;
  forwardEstimates: ForwardEstimateYear[];
}

// Stan Weinstein's four market-stage classifications, with a plain-language
// explanation of each shown so the user can tell where a stock sits
// technically without knowing the framework by heart.
export const STAGE_DESCRIPTIONS: Record<WeinsteinStage, { titleHe: string; descriptionHe: string }> = {
  1: {
    titleHe: "סטייג' 1 — תהליך בסיס (Basing)",
    descriptionHe: "המניה יוצאת ממגמת ירידה ונסחרת בטווח אופקי, ללא כיוון ברור. הממוצעים הנעים משתטחים ונפח המסחר נמוך יחסית.",
  },
  2: {
    titleHe: "סטייג' 2 — מגמת עלייה (Advancing)",
    descriptionHe: "המניה פורצת מעלה מהבסיס, נסחרת מעל הממוצעים הנעים העולים, עם נפח קונים תומך. זהו שלב הקנייה המועדף בשיטה.",
  },
  3: {
    titleHe: "סטייג' 3 — תהליך גג (Topping)",
    descriptionHe: "המגמה העולה מאבדת תאוצה, המניה נסחרת בטווח לאחר עלייה ממושכת, והתנודתיות עולה — סימן אזהרה לפני היפוך מגמה.",
  },
  4: {
    titleHe: "סטייג' 4 — מגמת ירידה (Declining)",
    descriptionHe: "המניה שוברת תמיכות ונסחרת מתחת לממוצעים הנעים היורדים. שלב זה נחשב למסוכן ביותר להחזקה לפי השיטה.",
  },
};

// Industry-average comparables shown alongside a stock's own multiples
// and profitability ratios, so the user can see at a glance whether it's
// cheap/expensive or more/less profitable than its sector.
export interface IndustryAverages {
  peRatio: number;
  forwardPeRatio: number;
  evEbitda: number;
  priceToSales: number;
  roiPct: number;
  roePct: number;
  roaPct: number;
}

// Extra per-stock detail shown in the click-through modal. Multiples,
// profitability ratios, stage, theses and news are mock data in Phase
// 1/2 — Phase 3 replaces the theses/news feeds with live results pulled
// from the web by the analyst bot.
export interface StockDetail {
  ticker: string;
  nameHe: string;
  sectorNameHe: string;
  marketCapUsd: number;
  peRatio: number;
  // Near-term forward P/E (next-fiscal-year consensus), shown as its own
  // tile alongside the trailing peRatio above. Deliberately the SAME
  // number as growthOutlook.forwardEstimates[0].forwardPE (the "שנה הבאה"
  // row of the growth table) rather than a second, hand-typed figure —
  // see lib/mock-data/stock-details.ts's withHistory(), which derives
  // this and industryAverages.forwardPeRatio automatically so the two
  // can never drift apart.
  forwardPeRatio: number;
  evEbitda: number;
  priceToSales: number;
  roiPct: number;
  roePct: number;
  roaPct: number;
  industryAverages: IndustryAverages;
  metricHistory: Record<MultipleKey, MetricHistoryPoint[]>;
  growthOutlook: GrowthOutlook;
  stage: WeinsteinStage;
  stageNoteHe: string;
  theses: AnalystThesis[];
  news: NewsItem[];
}
