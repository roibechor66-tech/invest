// Mock content for the AI bot's briefs (daily/weekly, across markets).
// Everything here — narrative summaries, the economic calendars, the top
// headline per market — is illustrative demo content shaped like a real
// brief, not live-fetched news. Phase 3 will replace this with real
// fetches from the curated sources below (financial news sites + a
// short, hand-picked list of reliable financial Twitter/X accounts),
// keeping the same structure and the same attributed-source presentation.

export interface TrustedSource {
  nameHe: string;
  handle: string; // domain for a site, @handle for Twitter/X
  kind: "site" | "twitter";
}

// A deliberately short, hand-picked list of sources known for accuracy
// and speed rather than an exhaustive one — the bot only cites from this
// list, never an arbitrary site or account it happens to find.
export const TRUSTED_SOURCES: TrustedSource[] = [
  { nameHe: "רויטרס", handle: "reuters.com", kind: "site" },
  { nameHe: "בלומברג", handle: "bloomberg.com", kind: "site" },
  { nameHe: "וול סטריט ג'ורנל", handle: "wsj.com", kind: "site" },
  { nameHe: "CNBC", handle: "cnbc.com", kind: "site" },
  { nameHe: "MarketWatch", handle: "marketwatch.com", kind: "site" },
  { nameHe: "כלכליסט", handle: "calcalist.co.il", kind: "site" },
  { nameHe: "גלובס", handle: "globes.co.il", kind: "site" },
  { nameHe: "Bloomberg Markets", handle: "@markets", kind: "twitter" },
  { nameHe: "WSJ Markets", handle: "@WSJmarkets", kind: "twitter" },
  { nameHe: "Reuters Business", handle: "@ReutersBiz", kind: "twitter" },
  { nameHe: "First Squawk", handle: "@FirstSquawk", kind: "twitter" },
  { nameHe: "שיי בולור", handle: "@StockSavvyShay", kind: "twitter" },
];

// A specific analyst voice the bot follows for the US-market daily
// brief, per an explicit request to include this account. He's a real,
// independent tech/semiconductor commentator on X, known for covering
// the AI infrastructure value chain (chip design, HBM memory, advanced
// packaging, fab capacity) — the theme below reflects that real, public
// focus area rather than a fabricated quote attributed to him, since the
// bot has no live connection to X yet to pull an actual day's posts.
// Phase 3 (real API/news integration) is what makes an actual daily
// pull from his account possible; until then this stays illustrative,
// like the rest of the brief's mock content.
export interface TopVoice {
  handle: string;
  nameHe: string;
  focusHe: string;
  todayThemeHe: string;
}

export const DAILY_US_TOP_VOICE: TopVoice = {
  handle: "@StockSavvyShay",
  nameHe: "שיי בולור",
  focusHe: "אנליסט טכנולוגיה ושבבים עצמאי בטוויטר/X, מתמקד בשרשרת הערך של תשתיות ה-AI — עיצוב שבבים, זיכרון HBM, אריזה מתקדמת וקיבולת ייצור.",
  todayThemeHe: "נושא מוביל בכתיבתו לאחרונה: שרשרת הערך של ה-AI ממשיכה להתרחב מעבר לעיצוב השבבים עצמו — זיכרון, אריזה מתקדמת וציוד הייצור הופכים לצווארי בקבוק לא פחות מכוח החישוב.",
};

// Notable deals and company-specific stories in the US market, beyond
// what's actually held in the portfolio — the bot surfaces these because
// they're broadly market-moving, not because they're personal holdings.
export const DAILY_US_DEALS_AND_COMPANIES: BriefHeadline[] = [
  { textHe: "מיקרוסופט בשיחות מתקדמות לרכישת ספקית תשתיות ענן בינונית לחיזוק יכולות ה-AI שלה", sourceHandle: "bloomberg.com" },
  { textHe: 'AMD חותמת על הסכם אספקת שבבים רב-שנתי עם ספק ענן גדול, בהיקף מוערך במיליארדי דולרים', sourceHandle: "reuters.com" },
  { textHe: "עסקת מיזוג בין שתי חברות אבטחת סייבר בינוניות מקבלת אישור רגולטורי בארה\"ב", sourceHandle: "wsj.com" },
];

export interface BriefHeadline {
  textHe: string;
  sourceHandle: string; // matches a TrustedSource.handle
}

export interface CalendarEvent {
  whenHe: string;
  labelHe: string;
  importance: "high" | "medium";
}

// The markets a brief can be scoped to. "portfolio" is the user's own
// holdings (compared against S&P 500, given the heavy US/tech weighting);
// the other three are broad markets independent of what's actually held.
export type BotMarketId = "il" | "us" | "portfolio" | "asia";

export interface BotMarketOption {
  id: BotMarketId;
  labelHe: string;
  icon: string; // lucide-react icon name
}

export const BOT_MARKETS: BotMarketOption[] = [
  { id: "portfolio", labelHe: "התיק שלי", icon: "Briefcase" },
  { id: "il", labelHe: "שוק ישראלי", icon: "Flag" },
  { id: "us", labelHe: "שוק אמריקאי", icon: "Landmark" },
  { id: "asia", labelHe: "שווקי אסיה", icon: "Globe2" },
];

// Which of the watched indices (see mock-data/indices.ts) represent each
// market's "major indices" section — shown in every brief regardless of
// type, per the product requirement that index returns always appear.
export const MARKET_INDEX_IDS: Record<BotMarketId, string[]> = {
  il: ["ta35", "ta125", "ta-tech"],
  us: ["sp500", "nasdaq100", "vix"],
  portfolio: ["sp500", "nasdaq100", "ta35", "ta125"],
  asia: ["inda", "nikkei225", "kospi", "fxi"],
};

// Which actual portfolio holdings (see mock-data/portfolio.ts) are
// relevant to each market's "news about your holdings" section at the
// bottom of the brief. TSM (Taiwan Semiconductor) counts for both "us"
// (it's the US-listed line in the portfolio) and "asia" (the underlying
// business and supply chain are Taiwanese).
export const MARKET_PORTFOLIO_TICKERS: Record<BotMarketId, string[]> = {
  il: ["TEVA.TA", "POLI.TA"],
  us: ["NVDA", "MSFT", "TSM", "VRT"],
  portfolio: ["NVDA", "MSFT", "TSM", "VRT", "TEVA.TA", "POLI.TA"],
  asia: ["TSM"],
};

// --- Daily brief: an expanded, high-level recap of yesterday's trading
// session plus what's expected today, per market. -----------------------

export interface DailyNarrative {
  yesterdayHe: string;
  todayHe: string;
}

export const DAILY_NARRATIVE: Record<BotMarketId, DailyNarrative> = {
  il: {
    yesterdayHe:
      "שוק המניות בתל אביב ננעל אתמול ביציבות, כשמניות הבנקים והביטוח בלטו לחיוב על רקע תשואות אג\"ח יציבות, ואילו מניות הנדל\"ן נסחרו בפיגור קל. מחזורי המסחר נותרו סביב הממוצע היומי, ללא אירוע מיוחד שהזיז את השוק באופן חד.",
    todayHe:
      "היום צפויה תשומת לב לנתוני שכר ותעסוקה מקומיים ולהמשך המגמה בסקטור הבנקאות; בהיעדר פרסומים מאקרו כבדים בלוח הישראלי, השוק צפוי להמשיך להיסחר בעקבות המגמה בוול סטריט מהלילה.",
  },
  us: {
    yesterdayHe:
      "מדדי וול סטריט ננעלו אתמול בעליות קלות לאחר נתוני אינפלציה שהגיעו בקנה אחד עם הציפיות, כאשר מניות המוליכים למחצה בלטו לחיוב על רקע ביקוש חזק להמשך לשבבי AI. הנאסד\"ק הוביל את העליות, ואילו מניות הצריכה הבסיסית פיגרו מעט.",
    todayHe:
      "היום ה-Fed צפוי להותיר את הריבית ללא שינוי, לפי תמחור החוזים העתידיים, ותשומת הלב תופנה לנתוני תביעות האבטלה השבועיות ולנאום צפוי של חבר בוועדת השוק הפתוח בשעות אחר הצהריים.",
  },
  portfolio: {
    yesterdayHe:
      "התיק שלכם רשם אתמול תשואה חיובית, מובלת בעיקר על ידי מניות הטכנולוגיה והמוליכים למחצה שבתיק (אנבידיה, טאיוואן סמיקונדקטור) על רקע ביקוש חזק ל-AI, בעוד שההחזקות הפיננסיות בישראל תרמו תוספת יציבה יותר.",
    todayHe:
      "היום, עם הפד שצפוי להותיר את הריבית ללא שינוי, התיק צפוי להמשיך לנוע בהתאם למגמת מניות הטכנולוגיה בוול סטריט; המזומן שבתיק נותר זמין לניצול הזדמנויות אם תיפתח תנודתיות.",
  },
  asia: {
    yesterdayHe:
      "השווקים באסיה ננעלו אתמול מעורבים: הניקיי ביפן והקוספי בקוריאה עלו על רקע חוזק במניות השבבים, ואילו השוק בהונג קונג נסחר בפיגור קל בצל חששות צמיחה בסין.",
    todayHe:
      "היום תשומת הלב באסיה מופנית להמשך המגמה במניות השבבים בטאיוואן ובקוריאה, ולנתוני מסחר סיניים שעשויים להשפיע על הסנטימנט כלפי השווקים המתעוררים באזור.",
  },
};

export const DAILY_CALENDAR: Record<BotMarketId, CalendarEvent[]> = {
  il: [
    { whenHe: "09:00", labelHe: 'פתיחת המסחר בבורסה בתל אביב', importance: "medium" },
    { whenHe: "16:00", labelHe: 'נתוני יבוא-יצוא חודשיים (הלמ"ס)', importance: "medium" },
  ],
  us: [
    { whenHe: "14:30", labelHe: 'תביעות אבטלה שבועיות בארה"ב', importance: "medium" },
    { whenHe: "16:00", labelHe: "מדד אמון הצרכן (Conference Board)", importance: "medium" },
    { whenHe: "17:00", labelHe: "נאום חבר ועדת השוק הפתוח של הפד", importance: "high" },
  ],
  portfolio: [
    { whenHe: "14:30", labelHe: 'תביעות אבטלה שבועיות בארה"ב', importance: "medium" },
    { whenHe: "17:00", labelHe: "נאום חבר ועדת השוק הפתוח של הפד", importance: "high" },
  ],
  asia: [
    { whenHe: "03:00", labelHe: "מדד ייצור תעשייתי ביפן", importance: "medium" },
    { whenHe: "05:00", labelHe: "נתוני סחר חוץ בקוריאה הדרומית", importance: "medium" },
  ],
};

// --- Weekly brief: an expanded, high-level summary of what's coming and
// what to watch, per market. The calendar sits alongside it. -----------

export interface WeeklyNarrative {
  whatsComingHe: string;
  whatToWatchHe: string;
}

export const WEEKLY_NARRATIVE: Record<BotMarketId, WeeklyNarrative> = {
  il: {
    whatsComingHe:
      "השבוע בישראל ימשיך להיות מוכתב בעיקר על ידי המגמה העולמית ותשואות האג\"ח המקומיות, כאשר לוח הפרסומים הכלכליים המקומי דל יחסית. תשומת הלב תופנה למדד המחירים לצרכן האמריקאי ולהחלטת הריבית של הפד באמצע השבוע, שתשפיע במידה רבה גם על שוק ההון המקומי דרך ערוץ הריבית והמט\"ח.",
    whatToWatchHe:
      "כדאי לעקוב אחרי מניות הבנקים לקראת עונת הדוחות, אחרי התנהגות השקל מול הדולר על רקע ציפיות הריבית בארה\"ב, ואחרי נזילות שוק האג\"ח הממשלתי המקומי שנותר רגיש לכל שינוי בסנטימנט הגלובלי.",
  },
  us: {
    whatsComingHe:
      "השבוע צפוי להיות עמוס באירועי מאקרו מרכזיים: מדד המחירים לצרכן, החלטת הריבית של הפד ומסיבת העיתונאים שאחריה, ולקראת סוף השבוע דוח התעסוקה החודשי. אלה שלושת הפרסומים שיקבעו את מסלול הריבית הצפוי לרבעונים הקרובים ועשויים להזיז משמעותית את מדדי המניות ואת שוק האג\"ח.",
    whatToWatchHe:
      "כדאי לשים לב לתגובת מניות הטכנולוגיה והסמיקונדקטור להנחיות הפד, לדוחות הרבעוניים של כמה מחברות ה-AI הגדולות שיפורסמו במהלך השבוע, ולכך שרמת ה-VIX הנמוכה יחסית מותירה פחות מרווח לספיגת הפתעות שליליות בנתוני האינפלציה או התעסוקה.",
  },
  portfolio: {
    whatsComingHe:
      "שבוע עמוס באירועי מאקרו (מדד המחירים לצרכן, החלטת ריבית, דוח תעסוקה) שיקבע את הכיוון הקצר-טווח למניות הטכנולוגיה שמרכיבות את רוב התיק שלכם. תוצאות הדוחות של כמה מחברות ה-AI הגדולות באמצע השבוע עשויות להזיז משמעותית את ההחזקות המרכזיות.",
    whatToWatchHe:
      "עקבו במיוחד אחרי אנבידיה וטאיוואן סמיקונדקטור לקראת עונת הדוחות, אחרי תגובת מניות הטכנולוגיה להחלטת הפד, ואחרי מניות הפיננסים בישראל שבתיק — שנשארות רגישות לתשואות האג\"ח המקומיות.",
  },
  asia: {
    whatsComingHe:
      "השבוע השווקים באסיה צפויים להיסחר בעקבות ההחלטות המאקרו הגדולות בארה\"ב (מדד המחירים לצרכן והחלטת הריבית), עם דגש מיוחד על טאיוואן וקוריאה בשל החשיפה הגבוהה שלהן לשרשרת האספקה של מוליכים למחצה.",
    whatToWatchHe:
      "כדאי לעקוב אחרי דוחות התפוקה של יצרניות השבבים המובילות בטאיוואן, אחרי מדדי הפעילות התעשייתית בסין, ואחרי התנהגות המטבעות האסייתיים מול הדולר בעקבות ציפיות הריבית האמריקאיות.",
  },
};

export const WEEKLY_CALENDAR: Record<BotMarketId, CalendarEvent[]> = {
  il: [
    { whenHe: "שני", labelHe: 'מדד מחירי הדירות של הלמ"ס', importance: "medium" },
    { whenHe: "רביעי", labelHe: 'החלטת ריבית הפד בארה"ב (משפיעה על השקל והמק"מ)', importance: "high" },
    { whenHe: "חמישי", labelHe: "נתוני סחר חוץ ישראליים", importance: "medium" },
  ],
  us: [
    { whenHe: "שני", labelHe: "מדד מנהלי הרכש (PMI) בארה\"ב ובאירופה", importance: "medium" },
    { whenHe: "שלישי", labelHe: "מדד המחירים לצרכן (CPI) בארה\"ב", importance: "high" },
    { whenHe: "רביעי", labelHe: 'החלטת ריבית הפד ומסיבת עיתונאים של היו"ר', importance: "high" },
    { whenHe: "חמישי", labelHe: "תביעות אבטלה שבועיות + דוחות רבעוניים של כמה מחברות ה-AI הגדולות", importance: "medium" },
    { whenHe: "שישי", labelHe: "דוח התעסוקה החודשי (NFP) בארה\"ב", importance: "high" },
  ],
  portfolio: [
    { whenHe: "שלישי", labelHe: "מדד המחירים לצרכן (CPI) בארה\"ב", importance: "high" },
    { whenHe: "רביעי", labelHe: 'החלטת ריבית הפד ומסיבת עיתונאים של היו"ר', importance: "high" },
    { whenHe: "חמישי", labelHe: "דוחות רבעוניים של כמה מחברות ה-AI הגדולות שבתיק", importance: "medium" },
    { whenHe: "שישי", labelHe: "דוח התעסוקה החודשי (NFP) בארה\"ב", importance: "high" },
  ],
  asia: [
    { whenHe: "שני", labelHe: "מדד מנהלי הרכש (PMI) בסין וביפן", importance: "medium" },
    { whenHe: "שלישי", labelHe: "מדד המחירים לצרכן (CPI) בארה\"ב — משפיע על הסנטימנט האסייתי", importance: "high" },
    { whenHe: "רביעי", labelHe: "החלטת ריבית הפד", importance: "high" },
    { whenHe: "שישי", labelHe: "נתוני יצוא חודשיים בטאיוואן ובקוריאה", importance: "medium" },
  ],
};

// One attributed top headline per market/brief-type, so the bot's
// curated-source citation stays visible even though the main content is
// now a narrative summary rather than a headline list.
export const DAILY_TOP_HEADLINE: Record<BotMarketId, BriefHeadline> = {
  il: { textHe: 'מניות הבנקים בתל אביב מובילות את המסחר על רקע תשואות אג"ח יציבות', sourceHandle: "globes.co.il" },
  us: { textHe: "הפד צפוי להותיר את הריבית ללא שינוי בהחלטה הקרובה, לפי תמחור החוזים העתידיים", sourceHandle: "cnbc.com" },
  portfolio: { textHe: "ביקוש שמכלה מלאי לשבבי הדור הבא ממשיך להוביל את מניות ה-AI המרכזיות בתיקים", sourceHandle: "@markets" },
  asia: { textHe: "מניות השבבים בטאיוואן ובקוריאה מובילות את המסחר באסיה", sourceHandle: "reuters.com" },
};

export const WEEKLY_TOP_HEADLINE: Record<BotMarketId, BriefHeadline> = {
  il: { textHe: 'שוק המניות הישראלי צפוי להמשיך להיסחר בעקבות ההחלטות המאקרו הגדולות בארה"ב', sourceHandle: "globes.co.il" },
  us: { textHe: "שוק החוזים העתידיים ממשיך לתמחר הפחתת ריבית אחת עד סוף השנה", sourceHandle: "reuters.com" },
  portfolio: { textHe: 'מיקרוסופט מרחיבה השקעות בתשתיות ענן וב-AI לקראת השנה הפיסקלית הבאה', sourceHandle: "wsj.com" },
  asia: { textHe: "טאיוואן סמיקונדקטור: קיבולת הייצור המתקדמת נותרת מנוצלת במלואה", sourceHandle: "reuters.com" },
};
