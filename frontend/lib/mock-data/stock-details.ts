import { IndustryAverages, MultipleKey, StockDetail } from "@/lib/types";
import { buildQuarterlyHistory } from "@/lib/mock-data/metric-history";

// Raw per-stock inputs; metricHistory is derived automatically so we
// don't have to hand-author 8 quarters x 7 metrics for every ticker.
// forwardPeRatio (the stock's own near-term forward P/E, shown as its own
// tile next to peRatio) and its industry average are ALSO derived rather
// than hand-typed a second time: the company's own forward P/E already
// exists as growthOutlook.forwardEstimates[0].forwardPE (the "שנה הבאה"
// row of the growth-outlook table below) — re-typing a second,
// disconnected forwardPeRatio here risked silently drifting out of sync
// with that number. The industry average applies the same trailing→
// forward "growth discount" ratio the stock itself has, a reasonable mock
// approximation rather than an entirely separate invented data series.
type StockDetailInput = Omit<StockDetail, "metricHistory" | "forwardPeRatio" | "industryAverages"> & {
  industryAverages: Omit<IndustryAverages, "forwardPeRatio">;
};

function withHistory(input: StockDetailInput): StockDetail {
  const forwardPeRatio = input.growthOutlook.forwardEstimates[0]?.forwardPE ?? input.peRatio;
  const forwardDiscount = input.peRatio > 0 ? forwardPeRatio / input.peRatio : 1;
  const industryAverages: IndustryAverages = {
    ...input.industryAverages,
    forwardPeRatio: input.industryAverages.peRatio * forwardDiscount,
  };
  const full: Omit<StockDetail, "metricHistory"> = { ...input, forwardPeRatio, industryAverages };

  const metricKeys: MultipleKey[] = [
    "peRatio",
    "forwardPeRatio",
    "evEbitda",
    "priceToSales",
    "roiPct",
    "roePct",
    "roaPct",
  ];
  const metricHistory = Object.fromEntries(
    metricKeys.map((key) => [
      key,
      buildQuarterlyHistory(full.ticker, key, full[key]),
    ])
  ) as StockDetail["metricHistory"];

  return { ...full, metricHistory };
}

// Per-stock detail used two ways as of Phase 3's third track (live FMP
// financials/multiples/valuations): (1) as the ticker DIRECTORY —
// nameHe/sectorNameHe/theses/news/Weinstein-stage — which StockSearchBar,
// SectorHeatmapModal, PortfolioConcentration and the valuation workspaces
// all still use to look up a demo ticker; and (2) as the FALLBACK
// multiples/profitability/marketCap/growthOutlook shown (clearly tagged
// "(דמו)") only when FMP has nothing for that ticker — see
// StockDetailModal.tsx and useLiveCompanyFundamentals.ts. industryAverages
// and metricHistory (the per-quarter trend) stay mock/illustrative even
// when everything else is live — see useLiveCompanyFundamentals.ts's
// module docstring for why those two specifically are out of scope. The
// analyst theses and news feeds are unrelated placeholders, unchanged.
export const mockStockDetails: Record<string, StockDetail> = {
  NVDA: withHistory({
    ticker: "NVDA",
    nameHe: "אנבידיה",
    sectorNameHe: "מוליכים למחצה",
    marketCapUsd: 4_350_000_000_000,
    peRatio: 48.2,
    evEbitda: 34.5,
    priceToSales: 22.1,
    roiPct: 38.4,
    roePct: 91.5,
    roaPct: 55.2,
    industryAverages: {
      peRatio: 29.6,
      evEbitda: 19.8,
      priceToSales: 8.4,
      roiPct: 18.7,
      roePct: 24.3,
      roaPct: 12.1,
    },
    growthOutlook: {
      guidanceNoteHe: "החברה צופה המשך ביקוש חזק לצ׳יפים לאימון AI ברבעונים הקרובים",
      forwardEstimates: [
        { yearLabelHe: "שנה הבאה (FY27)", analystRevenueGrowthPct: 42.5, companyGuidanceRevenueGrowthPct: 45.0, epsGrowthPct: 38.9, forwardPE: 34.7 },
        { yearLabelHe: "בעוד שנתיים (FY28)", analystRevenueGrowthPct: 24.1, companyGuidanceRevenueGrowthPct: 25.5, epsGrowthPct: 26.4, forwardPE: 27.5 },
        { yearLabelHe: "בעוד 3 שנים (FY29)", analystRevenueGrowthPct: 16.8, companyGuidanceRevenueGrowthPct: 17.8, epsGrowthPct: 19.2, forwardPE: 23.1 },
      ],
    },
    stage: 2,
    stageNoteHe: "מעל הממוצע הנע 30 שבועי, עם נפח קונים תומך",
    theses: [
      {
        source: "Seeking Alpha",
        titleHe: "המשך מומנטום בביקוש לצ׳יפים לאימון AI צפוי לתמוך בצמיחה",
        url: "https://seekingalpha.com",
        dateHe: "לפני 3 ימים",
        stance: "bullish",
      },
      {
        source: "Morgan Stanley",
        titleHe: "מכפיל מתומחר לשלמות — סיכון להאטה בהזמנות דאטה-סנטר",
        url: "https://example.com",
        dateHe: "לפני שבוע",
        stance: "neutral",
      },
    ],
    news: [
      { source: "Reuters", titleHe: "אנבידיה מכריזה על שבב דור הבא לאימון מודלים גדולים", dateHe: "היום", url: "https://example.com/nvda-chip" },
      { source: "Bloomberg", titleHe: "לקוחות ענן מגדילים הזמנות GPU לרבעון הבא", dateHe: "אתמול", url: "https://example.com/nvda-gpu-orders" },
      { source: "CNBC", titleHe: "אנליסטים מעלים מחירי יעד לאנבידיה לקראת דוחות", dateHe: "לפני יומיים", url: "https://example.com/nvda-targets" },
      { source: "The Information", titleHe: "אנבידיה בוחנת הרחבת ייצור עם שותפים נוספים באסיה", dateHe: "לפני 3 ימים", url: "https://example.com/nvda-asia" },
    ],
  }),
  MSFT: withHistory({
    ticker: "MSFT",
    nameHe: "מיקרוסופט",
    sectorNameHe: "תוכנה ושירותי ענן",
    marketCapUsd: 3_190_000_000_000,
    peRatio: 36.8,
    evEbitda: 24.3,
    priceToSales: 13.4,
    roiPct: 24.6,
    roePct: 34.2,
    roaPct: 18.9,
    industryAverages: {
      peRatio: 31.2,
      evEbitda: 20.5,
      priceToSales: 9.1,
      roiPct: 19.8,
      roePct: 27.6,
      roaPct: 13.4,
    },
    growthOutlook: {
      guidanceNoteHe: "ההנהלה צופה המשך צמיחה דו-ספרתית ב-Azure ובענן הארגוני",
      forwardEstimates: [
        { yearLabelHe: "שנה הבאה (FY27)", analystRevenueGrowthPct: 14.2, companyGuidanceRevenueGrowthPct: 15.0, epsGrowthPct: 15.8, forwardPE: 31.8 },
        { yearLabelHe: "בעוד שנתיים (FY28)", analystRevenueGrowthPct: 12.6, companyGuidanceRevenueGrowthPct: 13.3, epsGrowthPct: 14.1, forwardPE: 27.9 },
        { yearLabelHe: "בעוד 3 שנים (FY29)", analystRevenueGrowthPct: 11.4, companyGuidanceRevenueGrowthPct: 12.0, epsGrowthPct: 13.0, forwardPE: 24.7 },
      ],
    },
    stage: 2,
    stageNoteHe: "טרנד יציב עם תיקונים רדודים",
    theses: [
      {
        source: "Barron's",
        titleHe: "Azure ממשיכה להוביל צמיחה; שולי הענן משתפרים",
        url: "https://example.com",
        dateHe: "לפני 4 ימים",
        stance: "bullish",
      },
    ],
    news: [
      { source: "CNBC", titleHe: "מיקרוסופט מרחיבה שת\"פ AI ארגוני", dateHe: "היום", url: "https://example.com/msft-ai-partnership" },
      { source: "The Verge", titleHe: "עדכון גדול ל-Copilot עם יכולות סוכן חדשות", dateHe: "לפני יומיים", url: "https://example.com/msft-copilot" },
    ],
  }),
  TSM: withHistory({
    ticker: "TSM",
    nameHe: "טאיוואן סמיקונדקטור",
    sectorNameHe: "מוליכים למחצה",
    marketCapUsd: 895_000_000_000,
    peRatio: 27.4,
    evEbitda: 15.8,
    priceToSales: 9.7,
    roiPct: 21.3,
    roePct: 29.8,
    roaPct: 16.5,
    industryAverages: {
      peRatio: 29.6,
      evEbitda: 19.8,
      priceToSales: 8.4,
      roiPct: 18.7,
      roePct: 24.3,
      roaPct: 12.1,
    },
    growthOutlook: {
      guidanceNoteHe: "החברה מנחה לצמיחה עקבית בהובלת ביקוש לתהליכי ייצור מתקדמים",
      forwardEstimates: [
        { yearLabelHe: "שנה הבאה (FY27)", analystRevenueGrowthPct: 19.4, companyGuidanceRevenueGrowthPct: 21.0, epsGrowthPct: 20.5, forwardPE: 22.8 },
        { yearLabelHe: "בעוד שנתיים (FY28)", analystRevenueGrowthPct: 15.2, companyGuidanceRevenueGrowthPct: 16.5, epsGrowthPct: 16.7, forwardPE: 19.5 },
        { yearLabelHe: "בעוד 3 שנים (FY29)", analystRevenueGrowthPct: 12.8, companyGuidanceRevenueGrowthPct: 13.9, epsGrowthPct: 14.0, forwardPE: 17.1 },
      ],
    },
    stage: 3,
    stageNoteHe: "מתקרבת לתמיכה מרכזית, נדרש אישור נפח",
    theses: [
      {
        source: "JPMorgan",
        titleHe: "סיכון גיאופוליטי מוסיף פרמיית סיכון קצרת טווח",
        url: "https://example.com",
        dateHe: "לפני יומיים",
        stance: "bearish",
      },
    ],
    news: [
      { source: "Nikkei", titleHe: "טאיוואן סמיקונדקטור מדווחת על עלייה בתפוסת המפעל", dateHe: "לפני 2 ימים", url: "https://example.com/tsm-utilization" },
    ],
  }),
  VRT: withHistory({
    ticker: "VRT",
    nameHe: "וורטיב הולדינגס",
    sectorNameHe: "ציוד תעשייתי / תשתיות דאטה-סנטר",
    marketCapUsd: 62_000_000_000,
    peRatio: 41.5,
    evEbitda: 26.9,
    priceToSales: 6.8,
    roiPct: 19.7,
    roePct: 33.1,
    roaPct: 11.8,
    industryAverages: {
      peRatio: 25.1,
      evEbitda: 16.4,
      priceToSales: 3.9,
      roiPct: 14.2,
      roePct: 21.5,
      roaPct: 8.6,
    },
    growthOutlook: {
      guidanceNoteHe: "החברה מנחה לגידול דו-ספרתי בהזמנות פתרונות קירור והזנת חשמל",
      forwardEstimates: [
        { yearLabelHe: "שנה הבאה (FY27)", analystRevenueGrowthPct: 17.6, companyGuidanceRevenueGrowthPct: 16.0, epsGrowthPct: 22.3, forwardPE: 33.9 },
        { yearLabelHe: "בעוד שנתיים (FY28)", analystRevenueGrowthPct: 14.8, companyGuidanceRevenueGrowthPct: 13.5, epsGrowthPct: 18.1, forwardPE: 28.7 },
        { yearLabelHe: "בעוד 3 שנים (FY29)", analystRevenueGrowthPct: 12.1, companyGuidanceRevenueGrowthPct: 11.0, epsGrowthPct: 15.0, forwardPE: 25.0 },
      ],
    },
    stage: 2,
    stageNoteHe: "פריצת שיא חדש בנפח גבוה",
    theses: [
      {
        source: "Wolfe Research",
        titleHe: "ביקוש לפתרונות קירור דאטה-סנטר ממשיך להפתיע כלפי מעלה",
        url: "https://example.com",
        dateHe: "לפני 5 ימים",
        stance: "bullish",
      },
    ],
    news: [
      { source: "Reuters", titleHe: "וורטיב מרחיבה קיבולת ייצור לפתרונות הזנת חשמל", dateHe: "לפני 3 ימים", url: "https://example.com/vrt-capacity" },
    ],
  }),
  "TEVA.TA": withHistory({
    ticker: "TEVA.TA",
    nameHe: "טבע",
    sectorNameHe: "תרופות גנריות וביוסימילר",
    marketCapUsd: 22_500_000_000,
    peRatio: 14.2,
    evEbitda: 7.1,
    priceToSales: 1.6,
    roiPct: 8.9,
    roePct: 13.4,
    roaPct: 4.2,
    industryAverages: {
      peRatio: 17.8,
      evEbitda: 10.3,
      priceToSales: 2.9,
      roiPct: 11.6,
      roePct: 16.9,
      roaPct: 6.1,
    },
    growthOutlook: {
      guidanceNoteHe: "החברה מנחה לצמיחה מתונה תוך המשך הפחתת המינוף",
      forwardEstimates: [
        { yearLabelHe: "שנה הבאה (FY27)", analystRevenueGrowthPct: 4.8, companyGuidanceRevenueGrowthPct: 4.0, epsGrowthPct: 9.6, forwardPE: 12.7 },
        { yearLabelHe: "בעוד שנתיים (FY28)", analystRevenueGrowthPct: 4.1, companyGuidanceRevenueGrowthPct: 3.4, epsGrowthPct: 8.2, forwardPE: 11.6 },
        { yearLabelHe: "בעוד 3 שנים (FY29)", analystRevenueGrowthPct: 3.6, companyGuidanceRevenueGrowthPct: 3.0, epsGrowthPct: 7.0, forwardPE: 10.8 },
      ],
    },
    stage: 2,
    stageNoteHe: "יציאה מבסיס ארוך טווח",
    theses: [
      {
        source: "כלכליסט",
        titleHe: "טבע ממשיכה בתהליך הפחתת המינוף; אנליסטים מעלים תחזיות",
        url: "https://example.com",
        dateHe: "לפני שבוע",
        stance: "bullish",
      },
    ],
    news: [
      { source: "גלובס", titleHe: "טבע מדווחת על התקדמות בצנרת התרופות הביוסימילריות", dateHe: "היום", url: "https://example.com/teva-pipeline" },
    ],
  }),
  "POLI.TA": withHistory({
    ticker: "POLI.TA",
    nameHe: "בנק הפועלים",
    sectorNameHe: "בנקאות ישראלית",
    marketCapUsd: 17_800_000_000,
    peRatio: 8.1,
    evEbitda: 6.4,
    priceToSales: 3.2,
    roiPct: 13.8,
    roePct: 17.2,
    roaPct: 1.4,
    industryAverages: {
      peRatio: 7.6,
      evEbitda: 6.0,
      priceToSales: 2.8,
      roiPct: 12.1,
      roePct: 15.4,
      roaPct: 1.1,
    },
    growthOutlook: {
      guidanceNoteHe: "ההנהלה צופה המשך יציבות בהכנסות המימון תוך צמיחה בעמלות",
      forwardEstimates: [
        { yearLabelHe: "שנה הבאה (FY27)", analystRevenueGrowthPct: 6.2, companyGuidanceRevenueGrowthPct: 5.5, epsGrowthPct: 7.4, forwardPE: 7.5 },
        { yearLabelHe: "בעוד שנתיים (FY28)", analystRevenueGrowthPct: 5.6, companyGuidanceRevenueGrowthPct: 5.0, epsGrowthPct: 6.8, forwardPE: 7.0 },
        { yearLabelHe: "בעוד 3 שנים (FY29)", analystRevenueGrowthPct: 5.1, companyGuidanceRevenueGrowthPct: 4.5, epsGrowthPct: 6.1, forwardPE: 6.6 },
      ],
    },
    stage: 2,
    stageNoteHe: "תשואה על ההון גבוהה מהממוצע הסקטוריאלי",
    theses: [
      {
        source: "כלכליסט",
        titleHe: "הבנקים הישראלים נסחרים בדיסקאונט לחוץ למרות רווחיות שיא",
        url: "https://example.com",
        dateHe: "לפני 4 ימים",
        stance: "bullish",
      },
    ],
    news: [
      { source: "TheMarker", titleHe: "בנק הפועלים מכריז על תוכנית רכישה עצמית מוגדלת", dateHe: "אתמול", url: "https://example.com/poli-buyback" },
    ],
  }),

  // Extra tickers available only via the stock search (not held in the
  // mock portfolio) — demonstrates that search works for any ticker.
  AAPL: withHistory({
    ticker: "AAPL",
    nameHe: "אפל",
    sectorNameHe: "מוצרי טכנולוגיה צרכניים",
    marketCapUsd: 3_620_000_000_000,
    peRatio: 33.1,
    evEbitda: 24.6,
    priceToSales: 9.2,
    roiPct: 29.8,
    roePct: 152.3,
    roaPct: 27.1,
    industryAverages: {
      peRatio: 27.4,
      evEbitda: 18.9,
      priceToSales: 6.1,
      roiPct: 20.5,
      roePct: 38.7,
      roaPct: 15.2,
    },
    growthOutlook: {
      guidanceNoteHe: "החברה צופה צמיחה חד-ספרתית גבוהה בהובלת שירותים ואייפון",
      forwardEstimates: [
        { yearLabelHe: "שנה הבאה (FY27)", analystRevenueGrowthPct: 8.4, companyGuidanceRevenueGrowthPct: 7.5, epsGrowthPct: 11.2, forwardPE: 29.8 },
        { yearLabelHe: "בעוד שנתיים (FY28)", analystRevenueGrowthPct: 7.6, companyGuidanceRevenueGrowthPct: 6.8, epsGrowthPct: 9.8, forwardPE: 27.1 },
        { yearLabelHe: "בעוד 3 שנים (FY29)", analystRevenueGrowthPct: 6.9, companyGuidanceRevenueGrowthPct: 6.2, epsGrowthPct: 8.9, forwardPE: 24.9 },
      ],
    },
    stage: 2,
    stageNoteHe: "מסחר יציב סביב שיאים עם נפח בינוני",
    theses: [
      {
        source: "Wedbush",
        titleHe: "מחזור שדרוגי אייפון עם AI צפוי לתמוך בהכנסות שירותים",
        url: "https://example.com",
        dateHe: "לפני יומיים",
        stance: "bullish",
      },
    ],
    news: [
      { source: "Bloomberg", titleHe: "אפל מרחיבה פיצ׳רי בינה מלאכותית במערכת ההפעלה", dateHe: "היום", url: "https://example.com/aapl-ai" },
    ],
  }),
  GOOGL: withHistory({
    ticker: "GOOGL",
    nameHe: "אלפאבט (גוגל)",
    sectorNameHe: "פרסום דיגיטלי ושירותי ענן",
    marketCapUsd: 2_240_000_000_000,
    peRatio: 24.7,
    evEbitda: 16.2,
    priceToSales: 7.1,
    roiPct: 22.4,
    roePct: 31.6,
    roaPct: 19.8,
    industryAverages: {
      peRatio: 26.9,
      evEbitda: 17.5,
      priceToSales: 6.8,
      roiPct: 19.1,
      roePct: 26.4,
      roaPct: 14.6,
    },
    growthOutlook: {
      guidanceNoteHe: "ההנהלה מציינת האצה בהכנסות ענן Google Cloud לצד יציבות בפרסום",
      forwardEstimates: [
        { yearLabelHe: "שנה הבאה (FY27)", analystRevenueGrowthPct: 12.9, companyGuidanceRevenueGrowthPct: 13.5, epsGrowthPct: 14.6, forwardPE: 21.5 },
        { yearLabelHe: "בעוד שנתיים (FY28)", analystRevenueGrowthPct: 11.4, companyGuidanceRevenueGrowthPct: 11.9, epsGrowthPct: 13.0, forwardPE: 19.0 },
        { yearLabelHe: "בעוד 3 שנים (FY29)", analystRevenueGrowthPct: 10.2, companyGuidanceRevenueGrowthPct: 10.7, epsGrowthPct: 11.8, forwardPE: 17.0 },
      ],
    },
    stage: 2,
    stageNoteHe: "תמיכה איתנה סביב הממוצע הנע 10 שבועי",
    theses: [
      {
        source: "Seeking Alpha",
        titleHe: "Gemini וענן Google Cloud כמנועי צמיחה חדשים",
        url: "https://example.com",
        dateHe: "לפני 3 ימים",
        stance: "bullish",
      },
    ],
    news: [
      { source: "Reuters", titleHe: "גוגל מרחיבה קיבולת דאטה-סנטרים לצורכי AI", dateHe: "אתמול", url: "https://example.com/googl-datacenters" },
    ],
  }),
  AMZN: withHistory({
    ticker: "AMZN",
    nameHe: "אמזון",
    sectorNameHe: "מסחר אלקטרוני ושירותי ענן",
    marketCapUsd: 2_150_000_000_000,
    peRatio: 38.9,
    evEbitda: 19.4,
    priceToSales: 3.6,
    roiPct: 16.8,
    roePct: 24.1,
    roaPct: 9.7,
    industryAverages: {
      peRatio: 32.1,
      evEbitda: 17.8,
      priceToSales: 2.9,
      roiPct: 14.5,
      roePct: 20.6,
      roaPct: 7.9,
    },
    growthOutlook: {
      guidanceNoteHe: "החברה מציינת המשך צמיחה חזקה ב-AWS ושיפור שולי הרווחיות בקמעונאות",
      forwardEstimates: [
        { yearLabelHe: "שנה הבאה (FY27)", analystRevenueGrowthPct: 11.6, companyGuidanceRevenueGrowthPct: 12.0, epsGrowthPct: 19.8, forwardPE: 32.5 },
        { yearLabelHe: "בעוד שנתיים (FY28)", analystRevenueGrowthPct: 10.5, companyGuidanceRevenueGrowthPct: 10.9, epsGrowthPct: 17.2, forwardPE: 27.7 },
        { yearLabelHe: "בעוד 3 שנים (FY29)", analystRevenueGrowthPct: 9.4, companyGuidanceRevenueGrowthPct: 9.7, epsGrowthPct: 15.0, forwardPE: 24.1 },
      ],
    },
    stage: 2,
    stageNoteHe: "פריצת התנגדות עם נפח גבוה מהממוצע",
    theses: [
      {
        source: "Morgan Stanley",
        titleHe: "AWS ממשיכה להוביל את הרווחיות התפעולית של הקבוצה",
        url: "https://example.com",
        dateHe: "לפני 4 ימים",
        stance: "bullish",
      },
    ],
    news: [
      { source: "CNBC", titleHe: "אמזון מרחיבה רשת מרכזי לוגיסטיקה אוטומטיים", dateHe: "היום", url: "https://example.com/amzn-logistics" },
    ],
  }),
  TSLA: withHistory({
    ticker: "TSLA",
    nameHe: "טסלה",
    sectorNameHe: "רכב חשמלי ואנרגיה",
    marketCapUsd: 1_080_000_000_000,
    peRatio: 68.4,
    evEbitda: 41.2,
    priceToSales: 10.8,
    roiPct: 9.6,
    roePct: 12.8,
    roaPct: 6.1,
    industryAverages: {
      peRatio: 22.3,
      evEbitda: 14.6,
      priceToSales: 1.9,
      roiPct: 11.4,
      roePct: 15.9,
      roaPct: 6.8,
    },
    growthOutlook: {
      guidanceNoteHe: "החברה מנחה לצמיחה מואצת לקראת השקת רכב אוטונומי ורובוטיקה",
      forwardEstimates: [
        { yearLabelHe: "שנה הבאה (FY27)", analystRevenueGrowthPct: 15.8, companyGuidanceRevenueGrowthPct: 20.0, epsGrowthPct: 28.4, forwardPE: 53.3 },
        { yearLabelHe: "בעוד שנתיים (FY28)", analystRevenueGrowthPct: 18.9, companyGuidanceRevenueGrowthPct: 23.9, epsGrowthPct: 31.7, forwardPE: 40.5 },
        { yearLabelHe: "בעוד 3 שנים (FY29)", analystRevenueGrowthPct: 21.4, companyGuidanceRevenueGrowthPct: 27.1, epsGrowthPct: 29.1, forwardPE: 31.4 },
      ],
    },
    stage: 3,
    stageNoteHe: "תנודתיות גבוהה סביב תמיכה מרכזית",
    theses: [
      {
        source: "ARK Invest",
        titleHe: "פוטנציאל הנהיגה האוטונומית עדיין אינו מגולם במחיר",
        url: "https://example.com",
        dateHe: "לפני שבוע",
        stance: "bullish",
      },
      {
        source: "GLJ Research",
        titleHe: "מכפילים גבוהים משמעותית מהענף מגלמים סיכון ירידה",
        url: "https://example.com",
        dateHe: "לפני 5 ימים",
        stance: "bearish",
      },
    ],
    news: [
      { source: "Reuters", titleHe: "טסלה מעדכנת לוח זמנים להשקת שירות רובוטקסי", dateHe: "לפני יומיים", url: "https://example.com/tsla-robotaxi" },
    ],
  }),
};

// Every field on StockDetail set to an honest "we have nothing" value —
// used by buildStockDetailOrFallback below for a ticker that isn't in the
// small curated mockStockDetails map above (only ~10 demo tickers are
// hand-authored there). Zero-valued multiples/industry averages are
// always shown tagged "(דמו)" or get overridden by a real FMP number via
// StockDetailModal's liveOrMock() — never presented as if they were a
// real demo figure the way NVDA/MSFT/etc.'s hand-picked numbers are.
const ZERO_INDUSTRY_AVERAGES: IndustryAverages = {
  peRatio: 0,
  forwardPeRatio: 0,
  evEbitda: 0,
  priceToSales: 0,
  roiPct: 0,
  roePct: 0,
  roaPct: 0,
};
const EMPTY_METRIC_HISTORY = Object.fromEntries(
  (["peRatio", "forwardPeRatio", "evEbitda", "priceToSales", "roiPct", "roePct", "roaPct"] as MultipleKey[]).map(
    (key): [MultipleKey, StockDetail["metricHistory"][MultipleKey]] => [key, []]
  )
) as StockDetail["metricHistory"];

// A real portfolio position can be ANY ticker the user typed into the
// add-position search (see AddPositionModal) — not just the ~10 curated
// demo names above. Before this, clicking such a holding's row in
// PortfolioSummaryCard silently did nothing (mockStockDetails[ticker] was
// undefined, so the `selectedDetail &&` guard just never rendered a
// modal) — this builds an honest placeholder instead, so the modal always
// opens and shows whatever's actually live (FMP multiples/financials/
// Finnhub quote via StockDetailModal's own hooks) plus a clear "no demo
// data for this ticker" note wherever nothing live is available either.
export function buildStockDetailOrFallback(ticker: string, nameHe: string, sectorNameHe: string): StockDetail {
  const existing = mockStockDetails[ticker];
  if (existing) return existing;
  return {
    ticker,
    nameHe,
    sectorNameHe,
    marketCapUsd: 0,
    peRatio: 0,
    forwardPeRatio: 0,
    evEbitda: 0,
    priceToSales: 0,
    roiPct: 0,
    roePct: 0,
    roaPct: 0,
    industryAverages: ZERO_INDUSTRY_AVERAGES,
    metricHistory: EMPTY_METRIC_HISTORY,
    growthOutlook: {
      guidanceNoteHe: "אין נתוני דמו עבור נייר זה (הוא לא בין המניות המוכרות למערכת)",
      forwardEstimates: [],
    },
    stage: 2,
    stageNoteHe: "אין מספיק היסטוריית מחיר עבור נייר זה כדי לקבוע שלב Weinstein — הערך מוצג לצורך המחשה בלבד.",
    theses: [],
    news: [],
  };
}
